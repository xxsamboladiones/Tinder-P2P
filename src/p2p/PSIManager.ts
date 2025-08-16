import { BloomFilter, PrivateMatch } from './types'
import { sha256 } from '@noble/hashes/sha256'
import { randomBytes } from '@noble/hashes/utils'

/**
 * Private Set Intersection Manager for secure matching
 * Implements privacy-preserving like comparison using Bloom filters
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
export class PSIManager {
  private readonly DEFAULT_FILTER_SIZE = 2048 // bits (256 bytes)
  private readonly DEFAULT_HASH_FUNCTIONS = 7
  private readonly FALSE_POSITIVE_RATE = 0.01 // 1% false positive rate

  /**
   * Generate Bloom filter for user's likes with salt/pepper for privacy
   * Requirement 5.1: Use Private Set Intersection (PSI) to hide preferences
   * Requirement 5.2: Use hashes with salt/pepper + Bloom filter as MVP
   */
  generateLikeBloomFilter(likes: string[], salt?: string): BloomFilter {
    if (likes.length === 0) {
      throw new Error('Cannot create Bloom filter for empty likes array')
    }

    // Generate random salt if not provided
    const filterSalt = salt || this.generateSalt()
    
    // Calculate optimal filter size and hash functions based on expected elements
    const optimalSize = this.calculateOptimalFilterSize(likes.length, this.FALSE_POSITIVE_RATE)
    const optimalHashFunctions = this.calculateOptimalHashFunctions(optimalSize, likes.length)
    
    // Ensure size scales with input for large datasets
    const minSize = likes.length > 50 ? Math.max(this.DEFAULT_FILTER_SIZE, likes.length * 20) : this.DEFAULT_FILTER_SIZE
    const size = Math.max(optimalSize, minSize)
    const hashFunctions = Math.min(optimalHashFunctions, this.DEFAULT_HASH_FUNCTIONS)
    
    const bits = new Uint8Array(Math.ceil(size / 8))

    // Add each like to the Bloom filter with salt
    for (const like of likes) {
      const saltedLike = this.saltLike(like, filterSalt)
      this.addToFilter(bits, saltedLike, size, hashFunctions)
    }

    return {
      bits,
      hashFunctions,
      size
    }
  }

  /**
   * Create a private match object with Bloom filter and metadata
   * Requirement 5.1: Use PSI to hide preferences
   */
  createPrivateMatch(likes: string[]): PrivateMatch {
    const salt = this.generateSalt()
    const likeFilter = this.generateLikeBloomFilter(likes, salt)
    
    return {
      likeFilter,
      salt,
      timestamp: new Date(),
      revealed: false
    }
  }

  /**
   * Compare two Bloom filters to detect mutual matches
   * Requirement 5.3: Reveal match only when mutual
   * Requirement 5.4: No information revealed about non-matches
   */
  checkMutualMatch(myMatch: PrivateMatch, theirMatch: PrivateMatch, myLikes: string[]): boolean {
    try {
      // Verify filters are compatible
      if (!this.areFiltersCompatible(myMatch.likeFilter, theirMatch.likeFilter)) {
        console.warn('Incompatible Bloom filters for PSI comparison')
        return false
      }

      // Check if any of my likes appear in their filter
      let mutualLikesFound = 0
      const requiredMutualLikes = Math.min(2, myLikes.length) // Require at least 2 mutual likes or all likes if less than 2

      for (const like of myLikes) {
        // Test with their salt
        const saltedLike = this.saltLike(like, theirMatch.salt)
        if (this.testInFilter(theirMatch.likeFilter, saltedLike)) {
          mutualLikesFound++
          
          // Early exit if we have enough mutual likes
          if (mutualLikesFound >= requiredMutualLikes) {
            return true
          }
        }
      }

      return mutualLikesFound >= requiredMutualLikes
    } catch (error) {
      console.error('Error during mutual match check:', error)
      return false
    }
  }

  /**
   * Advanced PSI comparison using intersection cardinality
   * More accurate than simple Bloom filter overlap
   */
  calculateMatchStrength(myMatch: PrivateMatch, theirMatch: PrivateMatch, myLikes: string[]): number {
    if (!this.areFiltersCompatible(myMatch.likeFilter, theirMatch.likeFilter)) {
      return 0
    }

    let matches = 0
    for (const like of myLikes) {
      const saltedLike = this.saltLike(like, theirMatch.salt)
      if (this.testInFilter(theirMatch.likeFilter, saltedLike)) {
        matches++
      }
    }

    // Return match strength as percentage
    return myLikes.length > 0 ? matches / myLikes.length : 0
  }

  /**
   * Generate cryptographically secure salt for privacy
   */
  private generateSalt(): string {
    const saltBytes = randomBytes(16) // 128-bit salt
    return Array.from(saltBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Salt a like string for privacy protection
   */
  private saltLike(like: string, salt: string): string {
    // Use a more secure salting approach that doesn't expose the original like
    const encoder = new TextEncoder()
    const combined = encoder.encode(`${like}:${salt}`)
    const hash = sha256(combined)
    return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Add an item to the Bloom filter
   */
  private addToFilter(bits: Uint8Array, item: string, size: number, hashFunctions: number): void {
    for (let i = 0; i < hashFunctions; i++) {
      const hash = this.hashWithSeed(item, i) % size
      const byteIndex = Math.floor(hash / 8)
      const bitIndex = hash % 8
      bits[byteIndex] |= (1 << bitIndex)
    }
  }

  /**
   * Test if an item might be in the Bloom filter
   */
  private testInFilter(filter: BloomFilter, item: string): boolean {
    for (let i = 0; i < filter.hashFunctions; i++) {
      const hash = this.hashWithSeed(item, i) % filter.size
      const byteIndex = Math.floor(hash / 8)
      const bitIndex = hash % 8
      
      if ((filter.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false // Definitely not in the set
      }
    }
    return true // Might be in the set (could be false positive)
  }

  /**
   * Hash function with seed for multiple hash functions
   */
  private hashWithSeed(item: string, seed: number): number {
    const encoder = new TextEncoder()
    const data = encoder.encode(item + seed.toString())
    const hash = sha256(data)
    
    // Convert first 4 bytes to number
    let result = 0
    for (let i = 0; i < 4; i++) {
      result = (result << 8) | hash[i]
    }
    
    return Math.abs(result)
  }

  /**
   * Calculate optimal Bloom filter size
   */
  private calculateOptimalFilterSize(expectedElements: number, falsePositiveRate: number): number {
    // m = -(n * ln(p)) / (ln(2)^2)
    const size = Math.ceil(-(expectedElements * Math.log(falsePositiveRate)) / (Math.log(2) ** 2))
    return Math.max(size, 512) // Minimum size for security
  }

  /**
   * Calculate optimal number of hash functions
   */
  private calculateOptimalHashFunctions(filterSize: number, expectedElements: number): number {
    // k = (m/n) * ln(2)
    const hashFunctions = Math.ceil((filterSize / expectedElements) * Math.log(2))
    return Math.max(1, Math.min(hashFunctions, 10)) // Between 1 and 10
  }

  /**
   * Check if two Bloom filters are compatible for comparison
   */
  private areFiltersCompatible(filter1: BloomFilter, filter2: BloomFilter): boolean {
    return filter1.size === filter2.size && 
           filter1.hashFunctions === filter2.hashFunctions &&
           filter1.bits.length === filter2.bits.length
  }

  /**
   * Estimate false positive rate of a Bloom filter
   */
  estimateFalsePositiveRate(filter: BloomFilter, estimatedElements: number): number {
    // p = (1 - e^(-k*n/m))^k
    const k = filter.hashFunctions
    const m = filter.size
    const n = estimatedElements
    
    return Math.pow(1 - Math.exp(-k * n / m), k)
  }

  /**
   * Get statistics about a Bloom filter
   */
  getFilterStats(filter: BloomFilter): {
    size: number
    hashFunctions: number
    setBits: number
    fillRatio: number
    estimatedElements: number
  } {
    let setBits = 0
    for (const byte of filter.bits) {
      setBits += this.popCount(byte)
    }

    const fillRatio = setBits / filter.size
    
    // Estimate number of elements: n ≈ -(m/k) * ln(1 - X/m)
    // where X is the number of set bits
    const estimatedElements = fillRatio > 0 && fillRatio < 1 
      ? Math.round(-(filter.size / filter.hashFunctions) * Math.log(1 - fillRatio))
      : 0

    return {
      size: filter.size,
      hashFunctions: filter.hashFunctions,
      setBits,
      fillRatio,
      estimatedElements
    }
  }

  /**
   * Count number of set bits in a byte (population count)
   */
  private popCount(byte: number): number {
    let count = 0
    while (byte) {
      count += byte & 1
      byte >>>= 1
    }
    return count
  }

  /**
   * Serialize Bloom filter for network transmission
   */
  serializeFilter(filter: BloomFilter): string {
    const data = {
      bits: Array.from(filter.bits),
      hashFunctions: filter.hashFunctions,
      size: filter.size
    }
    return JSON.stringify(data)
  }

  /**
   * Deserialize Bloom filter from network data
   */
  deserializeFilter(serialized: string): BloomFilter {
    try {
      const data = JSON.parse(serialized)
      return {
        bits: new Uint8Array(data.bits),
        hashFunctions: data.hashFunctions,
        size: data.size
      }
    } catch (error) {
      throw new Error(`Failed to deserialize Bloom filter: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a union of two Bloom filters (for combining preferences)
   */
  unionFilters(filter1: BloomFilter, filter2: BloomFilter): BloomFilter {
    if (!this.areFiltersCompatible(filter1, filter2)) {
      throw new Error('Cannot union incompatible Bloom filters')
    }

    const unionBits = new Uint8Array(filter1.bits.length)
    for (let i = 0; i < filter1.bits.length; i++) {
      unionBits[i] = filter1.bits[i] | filter2.bits[i]
    }

    return {
      bits: unionBits,
      hashFunctions: filter1.hashFunctions,
      size: filter1.size
    }
  }

  /**
   * Validate that a Bloom filter is properly formed
   */
  validateFilter(filter: BloomFilter): boolean {
    try {
      // Check basic structure
      if (!filter.bits || !filter.hashFunctions || !filter.size) {
        return false
      }

      // Check size consistency
      if (filter.bits.length !== Math.ceil(filter.size / 8)) {
        return false
      }

      // Check reasonable parameters
      if (filter.hashFunctions < 1 || filter.hashFunctions > 20) {
        return false
      }

      if (filter.size < 64 || filter.size > 1000000) { // Allow larger filters
        return false
      }

      return true
    } catch (error) {
      return false
    }
  }
}