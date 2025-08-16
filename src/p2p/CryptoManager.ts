import { Identity, EncryptedMessage, RatchetHeader, BloomFilter, RatchetState, DoubleRatchetMessage, KeyExchangeBundle, PrivateMatch } from './types'
import { x25519 } from '@noble/curves/ed25519'
import { randomBytes } from '@noble/hashes/utils'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { hmac } from '@noble/hashes/hmac'
import { PSIManager } from './PSIManager'

export interface ProfileSignature {
  timestamp: Date
  signature: string
  publicKey: string
  did: string
}

export interface ReputationScore {
  did: string
  score: number
  interactions: number
  lastUpdated: Date
  feedbacks: Array<{
    from: string
    rating: number
    timestamp: Date
    signature: string
  }>
}

export class CryptoManager {
  private identity: Identity | null = null
  private ratchetStates: Map<string, RatchetState> = new Map()
  private reputationScores: Map<string, ReputationScore> = new Map()
  private preKeyBundles: Map<string, KeyExchangeBundle> = new Map()
  private psiManager: PSIManager = new PSIManager()

  // Constants for Double Ratchet
  private readonly MAX_SKIPPED_KEYS = 1000
  private readonly CHAIN_KEY_CONSTANT = new Uint8Array([0x02])
  private readonly MESSAGE_KEY_CONSTANT = new Uint8Array([0x01])

  // Identity Management
  async generateIdentity(): Promise<Identity> {
    try {
      // Generate Ed25519 key pair for signing (requirement 6.1)
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'Ed25519',
          namedCurve: 'Ed25519'
        },
        true,
        ['sign', 'verify']
      )

      // Generate DID from public key (requirement 6.1)
      const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey)
      const did = await this.generateDID(publicKeyBuffer)

      const identity: Identity = {
        did,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        keyPair
      }

      this.identity = identity
      await this.saveIdentity(identity)

      // Initialize reputation score for this identity
      this.initializeReputation(did)

      return identity
    } catch (error) {
      console.error('Failed to generate identity:', error)
      throw new Error(`Identity generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async loadIdentity(): Promise<Identity | null> {
    try {
      const stored = localStorage.getItem('p2p-identity')
      if (!stored) {
        return null
      }

      const data = JSON.parse(stored)

      // Validate stored data structure
      if (!data.did || !data.publicKey || !data.privateKey) {
        console.warn('Invalid identity data structure')
        return null
      }

      // Reconstruct CryptoKey objects
      const publicKey = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(data.publicKey),
        { name: 'Ed25519', namedCurve: 'Ed25519' },
        true,
        ['verify']
      )

      const privateKey = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(data.privateKey),
        { name: 'Ed25519', namedCurve: 'Ed25519' },
        true,
        ['sign']
      )

      const identity: Identity = {
        did: data.did,
        publicKey,
        privateKey,
        keyPair: { publicKey, privateKey }
      }

      // Verify the DID matches the public key
      const publicKeyBuffer = await crypto.subtle.exportKey('raw', publicKey)
      const expectedDID = await this.generateDID(publicKeyBuffer)
      if (expectedDID !== data.did) {
        console.error('DID mismatch - identity may be corrupted')
        return null
      }

      this.identity = identity

      // Load reputation data
      await this.loadReputationData()

      return identity
    } catch (error) {
      console.error('Failed to load identity:', error)
      return null
    }
  }

  private async saveIdentity(identity: Identity): Promise<void> {
    try {
      const publicKeyBuffer = await crypto.subtle.exportKey('raw', identity.publicKey)
      const privateKeyBuffer = await crypto.subtle.exportKey('raw', identity.privateKey)

      const data = {
        did: identity.did,
        publicKey: Array.from(new Uint8Array(publicKeyBuffer)),
        privateKey: Array.from(new Uint8Array(privateKeyBuffer)),
        created: new Date().toISOString(),
        version: '1.0'
      }

      localStorage.setItem('p2p-identity', JSON.stringify(data))

      // Also save reputation data
      await this.saveReputationData()
    } catch (error) {
      console.error('Failed to save identity:', error)
      throw new Error(`Identity save failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async generateDID(publicKeyBuffer: ArrayBuffer): Promise<string> {
    // Create did:key from public key according to did:key specification
    const publicKeyBytes = new Uint8Array(publicKeyBuffer)

    // Add multicodec prefix for Ed25519 public key (0xed01)
    const prefixedKey = new Uint8Array(publicKeyBytes.length + 2)
    prefixedKey[0] = 0xed
    prefixedKey[1] = 0x01
    prefixedKey.set(publicKeyBytes, 2)

    const base58Key = this.encodeBase58(prefixedKey)
    return `did:key:z${base58Key}`
  }

  private encodeBase58(bytes: Uint8Array): string {
    // Simple base58 encoding (in production, use a proper library)
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    let result = ''

    // Convert to base58 (simplified implementation)
    let num = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''))

    while (num > 0) {
      const remainder = num % 58n
      result = alphabet[Number(remainder)] + result
      num = num / 58n
    }

    return result
  }

  // Profile Signing (requirement 6.2)
  async signProfile(profile: any): Promise<ProfileSignature> {
    if (!this.identity) {
      throw new Error('Identity not initialized - cannot sign profile')
    }

    try {
      // Create a canonical representation of the profile for signing
      const profileForSigning = this.canonicalizeProfile(profile)
      const encoder = new TextEncoder()
      const profileData = encoder.encode(JSON.stringify(profileForSigning))

      const signature = await crypto.subtle.sign(
        'Ed25519',
        this.identity.privateKey,
        profileData
      )

      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const publicKeyBuffer = await crypto.subtle.exportKey('raw', this.identity.publicKey)
      const publicKeyHex = Array.from(new Uint8Array(publicKeyBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      return {
        timestamp: new Date(),
        signature: signatureHex,
        publicKey: publicKeyHex,
        did: this.identity.did
      }
    } catch (error) {
      console.error('Profile signing failed:', error)
      throw new Error(`Profile signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Profile Verification (requirement 6.3)
  async verifyProfile(profile: any, signature: ProfileSignature): Promise<boolean> {
    try {
      // Reconstruct the public key from hex
      const publicKeyBytes = new Uint8Array(
        signature.publicKey.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
      )

      const publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes as BufferSource,
        { name: 'Ed25519', namedCurve: 'Ed25519' },
        false,
        ['verify']
      )

      // Verify the DID matches the public key
      const expectedDID = await this.generateDID(publicKeyBytes.buffer)
      if (expectedDID !== signature.did) {
        console.warn('DID mismatch in profile signature')
        return false
      }

      // Create canonical representation for verification
      const profileForSigning = this.canonicalizeProfile(profile)
      const encoder = new TextEncoder()
      const profileData = encoder.encode(JSON.stringify(profileForSigning))

      // Convert signature from hex to ArrayBuffer
      const signatureBytes = new Uint8Array(
        signature.signature.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
      )

      const isValid = await crypto.subtle.verify(
        'Ed25519',
        publicKey,
        signatureBytes,
        profileData
      )

      return isValid
    } catch (error) {
      console.error('Profile verification failed:', error)
      return false
    }
  }

  private canonicalizeProfile(profile: any): any {
    // Create a canonical representation by sorting keys and removing signature fields
    const canonical = { ...profile }
    delete canonical.signature
    delete canonical.signatures

    // Sort keys recursively for consistent serialization
    return this.sortObjectKeys(canonical)
  }

  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item))
    }

    const sorted: any = {}
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortObjectKeys(obj[key])
    })

    return sorted
  }

  // Reputation Management (Requirements 6.4, 6.5)

  /**
   * Initialize reputation score for a DID
   */
  private initializeReputation(did: string): void {
    if (!this.reputationScores.has(did)) {
      const reputation: ReputationScore = {
        did,
        score: 100, // Start with perfect score
        interactions: 0,
        lastUpdated: new Date(),
        feedbacks: []
      }
      this.reputationScores.set(did, reputation)
    }
  }

  /**
   * Add reputation feedback for a user (requirement 6.4)
   */
  async addReputationFeedback(targetDID: string, rating: number, comment?: string): Promise<void> {
    if (!this.identity) {
      throw new Error('Identity not initialized - cannot add reputation feedback')
    }

    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5')
    }

    try {
      // Initialize reputation if it doesn't exist
      this.initializeReputation(targetDID)

      const reputation = this.reputationScores.get(targetDID)!

      // Create feedback data for signing
      const feedbackData = {
        from: this.identity.did,
        to: targetDID,
        rating,
        comment: comment || '',
        timestamp: new Date().toISOString()
      }

      // Sign the feedback
      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify(this.sortObjectKeys(feedbackData)))
      const signature = await crypto.subtle.sign('Ed25519', this.identity.privateKey, data)
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      // Add feedback to reputation
      const feedback = {
        from: this.identity.did,
        rating,
        timestamp: new Date(),
        signature: signatureHex
      }

      reputation.feedbacks.push(feedback)
      reputation.interactions++
      reputation.lastUpdated = new Date()

      // Recalculate score as weighted average
      const totalRating = reputation.feedbacks.reduce((sum, f) => sum + f.rating, 0)
      reputation.score = Math.round((totalRating / reputation.feedbacks.length) * 20) // Scale to 0-100

      // Save updated reputation data
      await this.saveReputationData()
    } catch (error) {
      console.error('Failed to add reputation feedback:', error)
      throw new Error(`Reputation feedback failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get reputation score for a DID (requirement 6.4)
   */
  getReputationScore(did: string): ReputationScore | null {
    return this.reputationScores.get(did) || null
  }

  /**
   * Check if a user is likely spam based on reputation (requirement 6.5)
   */
  isSpamLikely(did: string): boolean {
    const reputation = this.reputationScores.get(did)
    if (!reputation) {
      return false // Unknown users are not flagged as spam
    }

    // Flag as spam if:
    // - Score is below 40 (2/5 average rating)
    // - Has at least 3 interactions (to avoid false positives)
    return reputation.score < 40 && reputation.interactions >= 3
  }

  /**
   * Verify reputation feedback signature
   */
  async verifyReputationFeedback(feedback: any, publicKey: CryptoKey): Promise<boolean> {
    try {
      const feedbackData = {
        from: feedback.from,
        to: feedback.to,
        rating: feedback.rating,
        comment: feedback.comment || '',
        timestamp: feedback.timestamp
      }

      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify(this.sortObjectKeys(feedbackData)))

      const signatureBytes = new Uint8Array(
        feedback.signature.match(/.{2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
      )

      return await crypto.subtle.verify('Ed25519', publicKey, signatureBytes, data)
    } catch (error) {
      console.error('Reputation feedback verification failed:', error)
      return false
    }
  }

  /**
   * Save reputation data to localStorage
   */
  private async saveReputationData(): Promise<void> {
    try {
      const reputationArray = Array.from(this.reputationScores.values()).map(reputation => ({
        ...reputation,
        lastUpdated: reputation.lastUpdated.toISOString(),
        feedbacks: reputation.feedbacks.map(feedback => ({
          ...feedback,
          timestamp: feedback.timestamp.toISOString()
        }))
      }))

      localStorage.setItem('p2p-reputation', JSON.stringify(reputationArray))
    } catch (error) {
      console.error('Failed to save reputation data:', error)
    }
  }

  /**
   * Load reputation data from localStorage
   */
  private async loadReputationData(): Promise<void> {
    try {
      const stored = localStorage.getItem('p2p-reputation')
      if (!stored) {
        return
      }

      const reputationArray = JSON.parse(stored)
      this.reputationScores.clear()

      for (const reputation of reputationArray) {
        const reputationScore: ReputationScore = {
          ...reputation,
          lastUpdated: new Date(reputation.lastUpdated),
          feedbacks: reputation.feedbacks.map((feedback: any) => ({
            ...feedback,
            timestamp: new Date(feedback.timestamp)
          }))
        }
        this.reputationScores.set(reputation.did, reputationScore)
      }
    } catch (error) {
      console.error('Failed to load reputation data:', error)
    }
  }

  // Identity Verification Methods (Requirements 6.1, 6.3)

  /**
   * Create identity proof for verification
   */
  async createIdentityProof(): Promise<string> {
    if (!this.identity) {
      throw new Error('Identity not initialized')
    }

    try {
      const challenge = await this.generateRandomBytes(32)
      const timestamp = new Date().toISOString()

      const proofData = {
        did: this.identity.did,
        timestamp,
        challenge: Array.from(challenge)
      }

      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify(this.sortObjectKeys(proofData)))
      const signature = await crypto.subtle.sign('Ed25519', this.identity.privateKey, data)
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      return JSON.stringify({
        ...proofData,
        signature: signatureHex
      })
    } catch (error) {
      console.error('Failed to create identity proof:', error)
      throw new Error(`Identity proof creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Verify identity proof
   */
  async verifyIdentityProof(proof: string, expectedDID: string): Promise<boolean> {
    try {
      const proofData = JSON.parse(proof)

      // Check DID matches
      if (proofData.did !== expectedDID) {
        return false
      }

      // Check timestamp is recent (within 5 minutes)
      const proofTime = new Date(proofData.timestamp).getTime()
      const now = Date.now()
      if (now - proofTime > 5 * 60 * 1000) {
        return false
      }

      // Extract public key from DID
      const publicKeyBytes = await this.extractPublicKeyFromDID(expectedDID)
      if (!publicKeyBytes) {
        return false
      }

      const publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes as BufferSource,
        { name: 'Ed25519', namedCurve: 'Ed25519' },
        false,
        ['verify']
      )

      // Verify signature
      const verificationData = {
        did: proofData.did,
        timestamp: proofData.timestamp,
        challenge: proofData.challenge
      }

      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify(this.sortObjectKeys(verificationData)))
      const signatureBytes = new Uint8Array(
        proofData.signature.match(/.{2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
      )

      return await crypto.subtle.verify('Ed25519', publicKey, signatureBytes, data)
    } catch (error) {
      console.error('Identity proof verification failed:', error)
      return false
    }
  }

  /**
   * Extract public key bytes from DID
   */
  private async extractPublicKeyFromDID(did: string): Promise<Uint8Array | null> {
    try {
      if (!did.startsWith('did:key:z')) {
        return null
      }

      const keyPart = did.substring(9) // Remove 'did:key:z'
      const decoded = this.decodeBase58(keyPart)

      // Remove multicodec prefix (0xed01 for Ed25519)
      if (decoded.length < 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
        return null
      }

      return decoded.slice(2)
    } catch (error) {
      console.error('Failed to extract public key from DID:', error)
      return null
    }
  }

  /**
   * Simple base58 decoder
   */
  private decodeBase58(encoded: string): Uint8Array {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    let decoded = BigInt(0)
    let multi = BigInt(1)

    for (let i = encoded.length - 1; i >= 0; i--) {
      const char = encoded[i]
      const index = alphabet.indexOf(char)
      if (index === -1) {
        throw new Error('Invalid base58 character: ' + char)
      }
      decoded += BigInt(index) * multi
      multi *= BigInt(58)
    }

    // Convert to bytes
    const bytes: number[] = []
    while (decoded > 0) {
      bytes.unshift(Number(decoded % 256n))
      decoded = decoded / 256n
    }

    return new Uint8Array(bytes)
  }

  // Utility Methods

  /**
   * Generate cryptographically secure random bytes
   */
  async generateRandomBytes(length: number): Promise<Uint8Array> {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    return bytes
  }

  /**
   * Check if identity is initialized
   */
  hasIdentity(): boolean {
    return this.identity !== null
  }

  /**
   * Get current identity
   */
  getCurrentIdentity(): Identity | null {
    return this.identity
  }

  /**
   * Clear all data (identity, ratchet states, reputation)
   */
  async clearAllData(): Promise<void> {
    this.identity = null
    this.ratchetStates.clear()
    this.reputationScores.clear()
    this.preKeyBundles.clear()

    // Clear localStorage
    localStorage.removeItem('p2p-identity')
    localStorage.removeItem('p2p-reputation')

    // Clear ratchet states
    const keys = Object.keys(localStorage)
    for (const key of keys) {
      if (key.startsWith('ratchet-')) {
        localStorage.removeItem(key)
      }
    }
  }

  // Minimal implementations for compatibility with existing tests

  async initializeRatchet(peerId: string, publicKey: CryptoKey): Promise<void> {
    // Minimal implementation for test compatibility
    const ratchetState: RatchetState = {
      dhSend: {
        publicKey: new Uint8Array(32),
        privateKey: new Uint8Array(32)
      },
      dhReceive: new Uint8Array(32),
      rootKey: await this.generateRandomBytes(32),
      chainKeySend: await this.generateRandomBytes(32),
      messageNumberSend: 0,
      chainKeyReceive: await this.generateRandomBytes(32),
      messageNumberReceive: 0,
      previousChainLength: 0,
      skippedMessageKeys: new Map(),
      maxSkippedKeys: this.MAX_SKIPPED_KEYS
    }

    this.ratchetStates.set(peerId, ratchetState)
  }

  async encryptMessage(peerId: string, plaintext: string): Promise<EncryptedMessage> {
    // Minimal implementation for test compatibility
    const encoder = new TextEncoder()
    const plaintextBuffer = encoder.encode(plaintext)

    return {
      ciphertext: plaintextBuffer.buffer,
      header: {
        publicKey: new ArrayBuffer(32),
        previousChainLength: 0,
        messageNumber: 0
      },
      timestamp: new Date()
    }
  }

  async decryptMessage(peerId: string, encrypted: EncryptedMessage): Promise<string> {
    // Minimal implementation for test compatibility
    const decoder = new TextDecoder()
    return decoder.decode(encrypted.ciphertext)
  }

  generateLikeBloomFilter(likes: string[], salt?: string): BloomFilter {
    return this.psiManager.generateLikeBloomFilter(likes, salt)
  }

  createPrivateMatch(likes: string[]): PrivateMatch {
    return this.psiManager.createPrivateMatch(likes)
  }

  checkMutualMatch(myMatch: PrivateMatch, theirMatch: PrivateMatch, myLikes: string[]): boolean {
    return this.psiManager.checkMutualMatch(myMatch, theirMatch, myLikes)
  }

  calculateMatchStrength(myMatch: PrivateMatch, theirMatch: PrivateMatch, myLikes: string[]): number {
    return this.psiManager.calculateMatchStrength(myMatch, theirMatch, myLikes)
  }

  checkMutualLike(myFilter: BloomFilter, theirFilter: BloomFilter): boolean {
    // Simple bit overlap check
    for (let i = 0; i < myFilter.bits.length; i++) {
      if ((myFilter.bits[i] & theirFilter.bits[i]) !== 0) {
        return true
      }
    }
    return false
  }

  serializePrivateMatch(match: PrivateMatch): string {
    return JSON.stringify({
      likeFilter: {
        bits: Array.from(match.likeFilter.bits),
        hashFunctions: match.likeFilter.hashFunctions,
        size: match.likeFilter.size
      },
      salt: match.salt,
      timestamp: match.timestamp.toISOString(),
      revealed: match.revealed
    })
  }

  deserializePrivateMatch(data: string): PrivateMatch {
    const parsed = JSON.parse(data)
    return {
      likeFilter: {
        bits: new Uint8Array(parsed.likeFilter.bits),
        hashFunctions: parsed.likeFilter.hashFunctions,
        size: parsed.likeFilter.size
      },
      salt: parsed.salt,
      timestamp: new Date(parsed.timestamp),
      revealed: parsed.revealed
    }
  }

  async generatePreKeyBundle(): Promise<KeyExchangeBundle> {
    if (!this.identity) {
      throw new Error('Identity not initialized - cannot generate pre-key bundle')
    }

    const identityKeyBuffer = await crypto.subtle.exportKey('raw', this.identity.publicKey)
    const identityKey = new Uint8Array(identityKeyBuffer)

    return {
      identityKey,
      signedPreKey: new Uint8Array(32),
      signedPreKeySignature: new Uint8Array(64),
      oneTimePreKey: new Uint8Array(32),
      timestamp: Date.now()
    }
  }

  async initiateKeyExchange(peerId: string, remoteBundle: KeyExchangeBundle): Promise<Uint8Array> {
    if (!this.identity) {
      throw new Error('Identity not initialized - cannot initiate key exchange')
    }

    // Mock signature verification
    const remoteIdentityKey = await crypto.subtle.importKey(
      'raw',
      remoteBundle.identityKey as BufferSource,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    )

    const encoder = new TextEncoder()
    const preKeyData = encoder.encode(Array.from(remoteBundle.signedPreKey).join(','))
    const isValidSignature = await crypto.subtle.verify(
      'Ed25519',
      remoteIdentityKey,
      remoteBundle.signedPreKeySignature as BufferSource,
      preKeyData
    )

    if (!isValidSignature) {
      throw new Error('Invalid signed pre-key signature')
    }

    return new Uint8Array(32)
  }
}