/**
 * Example demonstrating Private Set Intersection (PSI) for secure matching
 * This example shows how users can check for mutual likes without revealing their preferences
 */

import { PSIManager } from '../PSIManager'
import { CryptoManager } from '../CryptoManager'

export class PSIExample {
  private psiManager: PSIManager
  private cryptoManager: CryptoManager

  constructor() {
    this.psiManager = new PSIManager()
    this.cryptoManager = new CryptoManager()
  }

  /**
   * Demonstrate basic PSI matching between two users
   */
  async demonstrateBasicMatching(): Promise<void> {
    console.log('=== PSI Basic Matching Demo ===\n')

    // Alice's likes (she likes Bob, Charlie, and David)
    const aliceLikes = ['bob', 'charlie', 'david']
    console.log('Alice likes:', aliceLikes)

    // Bob's likes (he likes Alice, Eve, and Frank)
    const bobLikes = ['alice', 'eve', 'frank']
    console.log('Bob likes:', bobLikes)

    // Create private matches (with salted Bloom filters)
    const aliceMatch = this.psiManager.createPrivateMatch(aliceLikes)
    const bobMatch = this.psiManager.createPrivateMatch(bobLikes)

    console.log('\n--- Private Match Objects Created ---')
    console.log('Alice filter size:', aliceMatch.likeFilter.size, 'bits')
    console.log('Bob filter size:', bobMatch.likeFilter.size, 'bits')
    console.log('Alice salt:', aliceMatch.salt.substring(0, 8) + '...')
    console.log('Bob salt:', bobMatch.salt.substring(0, 8) + '...')

    // Check for mutual matches
    const aliceResult = this.psiManager.checkMutualMatch(aliceMatch, bobMatch, aliceLikes)
    const bobResult = this.psiManager.checkMutualMatch(bobMatch, aliceMatch, bobLikes)

    console.log('\n--- Match Results ---')
    console.log('Alice detects mutual match:', aliceResult)
    console.log('Bob detects mutual match:', bobResult)

    // Calculate match strength
    const aliceStrength = this.psiManager.calculateMatchStrength(aliceMatch, bobMatch, aliceLikes)
    const bobStrength = this.psiManager.calculateMatchStrength(bobMatch, aliceMatch, bobLikes)

    console.log('\n--- Match Strength ---')
    console.log('Alice match strength:', (aliceStrength * 100).toFixed(1) + '%')
    console.log('Bob match strength:', (bobStrength * 100).toFixed(1) + '%')
  }

  /**
   * Demonstrate privacy preservation - no information leakage
   */
  async demonstratePrivacy(): Promise<void> {
    console.log('\n=== PSI Privacy Demo ===\n')

    const aliceLikes = ['bob', 'charlie', 'david']
    const bobLikes = ['eve', 'frank', 'george'] // No mutual likes

    const aliceMatch = this.psiManager.createPrivateMatch(aliceLikes)
    const bobMatch = this.psiManager.createPrivateMatch(bobLikes)

    console.log('Alice likes:', aliceLikes)
    console.log('Bob likes:', bobLikes)
    console.log('Expected result: No mutual matches')

    // Serialize for network transmission
    const aliceSerialized = this.cryptoManager.serializePrivateMatch(aliceMatch)
    const bobSerialized = this.cryptoManager.serializePrivateMatch(bobMatch)

    console.log('\n--- Serialized Data (what gets sent over network) ---')
    console.log('Alice data length:', aliceSerialized.length, 'characters')
    console.log('Bob data length:', bobSerialized.length, 'characters')

    // Check if original likes are visible in serialized data
    let alicePrivacyMaintained = true
    let bobPrivacyMaintained = true

    for (const like of aliceLikes) {
      if (aliceSerialized.includes(like)) {
        alicePrivacyMaintained = false
        break
      }
    }

    for (const like of bobLikes) {
      if (bobSerialized.includes(like)) {
        bobPrivacyMaintained = false
        break
      }
    }

    console.log('\n--- Privacy Check ---')
    console.log('Alice privacy maintained:', alicePrivacyMaintained)
    console.log('Bob privacy maintained:', bobPrivacyMaintained)

    // Perform matching
    const result = this.psiManager.checkMutualMatch(aliceMatch, bobMatch, aliceLikes)
    console.log('Match result:', result, '(should be false)')
  }

  /**
   * Demonstrate network simulation with serialization
   */
  async demonstrateNetworkSimulation(): Promise<void> {
    console.log('\n=== PSI Network Simulation Demo ===\n')

    const aliceLikes = ['bob', 'charlie']
    const bobLikes = ['alice', 'david']

    console.log('Alice likes:', aliceLikes)
    console.log('Bob likes:', bobLikes)

    // Step 1: Create private matches
    const aliceMatch = this.psiManager.createPrivateMatch(aliceLikes)
    const bobMatch = this.psiManager.createPrivateMatch(bobLikes)

    // Step 2: Simulate network transmission
    console.log('\n--- Simulating Network Transmission ---')
    const aliceSerialized = this.cryptoManager.serializePrivateMatch(aliceMatch)
    const bobSerialized = this.cryptoManager.serializePrivateMatch(bobMatch)

    console.log('Alice sends', aliceSerialized.length, 'bytes to Bob')
    console.log('Bob sends', bobSerialized.length, 'bytes to Alice')

    // Step 3: Deserialize received data
    const aliceReceived = this.cryptoManager.deserializePrivateMatch(aliceSerialized)
    const bobReceived = this.cryptoManager.deserializePrivateMatch(bobSerialized)

    console.log('Data successfully transmitted and deserialized')

    // Step 4: Perform matching on received data
    const aliceResult = this.psiManager.checkMutualMatch(aliceMatch, bobReceived, aliceLikes)
    const bobResult = this.psiManager.checkMutualMatch(bobMatch, aliceReceived, bobLikes)

    console.log('\n--- Final Results ---')
    console.log('Alice detects mutual match:', aliceResult)
    console.log('Bob detects mutual match:', bobResult)
  }

  /**
   * Demonstrate filter statistics and analysis
   */
  async demonstrateFilterAnalysis(): Promise<void> {
    console.log('\n=== PSI Filter Analysis Demo ===\n')

    const likes = ['user1', 'user2', 'user3', 'user4', 'user5']
    const match = this.psiManager.createPrivateMatch(likes)

    console.log('Original likes:', likes)

    // Get filter statistics
    const stats = this.psiManager.getFilterStats(match.likeFilter)
    console.log('\n--- Filter Statistics ---')
    console.log('Filter size:', stats.size, 'bits')
    console.log('Hash functions:', stats.hashFunctions)
    console.log('Set bits:', stats.setBits)
    console.log('Fill ratio:', (stats.fillRatio * 100).toFixed(2) + '%')
    console.log('Estimated elements:', stats.estimatedElements)

    // Estimate false positive rate
    const falsePositiveRate = this.psiManager.estimateFalsePositiveRate(match.likeFilter, likes.length)
    console.log('Estimated false positive rate:', (falsePositiveRate * 100).toFixed(2) + '%')

    // Validate filter
    const isValid = this.psiManager.validateFilter(match.likeFilter)
    console.log('Filter is valid:', isValid)
  }

  /**
   * Run all demonstrations
   */
  async runAllDemos(): Promise<void> {
    try {
      await this.demonstrateBasicMatching()
      await this.demonstratePrivacy()
      await this.demonstrateNetworkSimulation()
      await this.demonstrateFilterAnalysis()
      
      console.log('\n=== All PSI Demos Completed Successfully ===')
    } catch (error) {
      console.error('Demo failed:', error)
    }
  }
}

// Example usage
if (require.main === module) {
  const example = new PSIExample()
  example.runAllDemos()
}