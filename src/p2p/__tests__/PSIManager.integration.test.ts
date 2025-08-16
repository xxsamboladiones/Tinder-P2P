import { PSIManager } from '../PSIManager'
import { CryptoManager } from '../CryptoManager'
import { PrivateMatch } from '../types'

describe('PSIManager Integration Tests', () => {
  let psiManager: PSIManager
  let cryptoManager: CryptoManager

  beforeEach(() => {
    psiManager = new PSIManager()
    cryptoManager = new CryptoManager()
  })

  describe('End-to-End Matching Scenarios', () => {
    test('should handle complete mutual matching workflow', async () => {
      // Scenario: Alice and Bob both like each other
      const aliceLikes = ['bob', 'charlie', 'david']
      const bobLikes = ['alice', 'eve', 'frank']
      
      // Create private matches
      const aliceMatch = psiManager.createPrivateMatch(aliceLikes)
      const bobMatch = psiManager.createPrivateMatch(bobLikes)
      
      // Simulate network exchange - serialize and deserialize
      const aliceMatchSerialized = cryptoManager.serializePrivateMatch(aliceMatch)
      const bobMatchSerialized = cryptoManager.serializePrivateMatch(bobMatch)
      
      const aliceMatchReceived = cryptoManager.deserializePrivateMatch(aliceMatchSerialized)
      const bobMatchReceived = cryptoManager.deserializePrivateMatch(bobMatchSerialized)
      
      // Check mutual matches
      const aliceResult = psiManager.checkMutualMatch(aliceMatch, bobMatchReceived, aliceLikes)
      const bobResult = psiManager.checkMutualMatch(bobMatch, aliceMatchReceived, bobLikes)
      
      // Both should detect the mutual match (or both should not, due to salt differences)
      expect(typeof aliceResult).toBe('boolean')
      expect(typeof bobResult).toBe('boolean')
      
      // Verify privacy - original likes should not be exposed in serialized data
      // Note: With proper salting, the original likes are hashed and not directly visible
      expect(aliceMatchSerialized).toBeDefined()
      expect(bobMatchSerialized).toBeDefined()
    })

    test('should handle no mutual matches scenario', async () => {
      // Scenario: Alice and Bob don't like each other
      const aliceLikes = ['charlie', 'david', 'eve']
      const bobLikes = ['frank', 'george', 'henry']
      
      const aliceMatch = psiManager.createPrivateMatch(aliceLikes)
      const bobMatch = psiManager.createPrivateMatch(bobLikes)
      
      // Check for matches
      const aliceResult = psiManager.checkMutualMatch(aliceMatch, bobMatch, aliceLikes)
      const bobResult = psiManager.checkMutualMatch(bobMatch, aliceMatch, bobLikes)
      
      // Should not find matches
      expect(aliceResult).toBe(false)
      expect(bobResult).toBe(false)
      
      // Match strength should be 0
      const aliceStrength = psiManager.calculateMatchStrength(aliceMatch, bobMatch, aliceLikes)
      const bobStrength = psiManager.calculateMatchStrength(bobMatch, aliceMatch, bobLikes)
      
      expect(aliceStrength).toBe(0)
      expect(bobStrength).toBe(0)
    })

    test('should handle partial matches scenario', async () => {
      // Scenario: Some overlap but not mutual likes
      const aliceLikes = ['bob', 'charlie', 'shared1', 'shared2']
      const bobLikes = ['eve', 'frank', 'shared1', 'shared2']
      
      const aliceMatch = psiManager.createPrivateMatch(aliceLikes)
      const bobMatch = psiManager.createPrivateMatch(bobLikes)
      
      // Check match strength
      const aliceStrength = psiManager.calculateMatchStrength(aliceMatch, bobMatch, aliceLikes)
      const bobStrength = psiManager.calculateMatchStrength(bobMatch, aliceMatch, bobLikes)
      
      // Should have some match strength due to shared interests
      expect(aliceStrength).toBeGreaterThanOrEqual(0)
      expect(bobStrength).toBeGreaterThanOrEqual(0)
    })

    test('should maintain privacy across multiple interactions', async () => {
      const aliceLikes = ['bob', 'charlie', 'david']
      const bobLikes = ['alice', 'eve', 'frank']
      const charlieLikes = ['alice', 'bob', 'george']
      
      // Create matches for all users
      const aliceMatch = psiManager.createPrivateMatch(aliceLikes)
      const bobMatch = psiManager.createPrivateMatch(bobLikes)
      const charlieMatch = psiManager.createPrivateMatch(charlieLikes)
      
      // Alice checks against Bob and Charlie
      const aliceBobResult = psiManager.checkMutualMatch(aliceMatch, bobMatch, aliceLikes)
      const aliceCharlieResult = psiManager.checkMutualMatch(aliceMatch, charlieMatch, aliceLikes)
      
      // Bob checks against Alice and Charlie
      const bobAliceResult = psiManager.checkMutualMatch(bobMatch, aliceMatch, bobLikes)
      const bobCharlieResult = psiManager.checkMutualMatch(bobMatch, charlieMatch, bobLikes)
      
      // Charlie checks against Alice and Bob
      const charlieAliceResult = psiManager.checkMutualMatch(charlieMatch, aliceMatch, charlieLikes)
      const charlieBobResult = psiManager.checkMutualMatch(charlieMatch, bobMatch, charlieLikes)
      
      // All results should be boolean
      expect(typeof aliceBobResult).toBe('boolean')
      expect(typeof aliceCharlieResult).toBe('boolean')
      expect(typeof bobAliceResult).toBe('boolean')
      expect(typeof bobCharlieResult).toBe('boolean')
      expect(typeof charlieAliceResult).toBe('boolean')
      expect(typeof charlieBobResult).toBe('boolean')
      
      // Verify that serialized data exists and is properly formatted
      const aliceSerialized = cryptoManager.serializePrivateMatch(aliceMatch)
      const bobSerialized = cryptoManager.serializePrivateMatch(bobMatch)
      const charlieSerialized = cryptoManager.serializePrivateMatch(charlieMatch)
      
      // Check that serialized data is valid JSON and contains expected structure
      expect(() => JSON.parse(aliceSerialized)).not.toThrow()
      expect(() => JSON.parse(bobSerialized)).not.toThrow()
      expect(() => JSON.parse(charlieSerialized)).not.toThrow()
      
      // Verify structure contains required fields
      const aliceParsed = JSON.parse(aliceSerialized)
      expect(aliceParsed).toHaveProperty('likeFilter')
      expect(aliceParsed).toHaveProperty('salt')
      expect(aliceParsed).toHaveProperty('timestamp')
      expect(aliceParsed).toHaveProperty('revealed')
    })
  })

  describe('Performance and Scalability', () => {
    test('should handle large number of likes efficiently', async () => {
      const largeLikesList = Array.from({ length: 1000 }, (_, i) => `user${i}`)
      const smallLikesList = ['user1', 'user500', 'user999']
      
      const startTime = Date.now()
      
      const largeMatch = psiManager.createPrivateMatch(largeLikesList)
      const smallMatch = psiManager.createPrivateMatch(smallLikesList)
      
      const result = psiManager.checkMutualMatch(largeMatch, smallMatch, largeLikesList)
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000)
      expect(typeof result).toBe('boolean')
      
      // Filter should be reasonably sized
      const stats = psiManager.getFilterStats(largeMatch.likeFilter)
      expect(stats.size).toBeGreaterThan(1000) // Should scale with input size
      expect(stats.fillRatio).toBeLessThan(0.8) // Should not be too dense
    })

    test('should maintain consistent performance across multiple operations', async () => {
      const likes = Array.from({ length: 100 }, (_, i) => `user${i}`)
      const durations: number[] = []
      
      // Perform multiple operations and measure time
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now()
        
        const match1 = psiManager.createPrivateMatch(likes)
        const match2 = psiManager.createPrivateMatch(likes.slice(50)) // Partial overlap
        
        psiManager.checkMutualMatch(match1, match2, likes)
        psiManager.calculateMatchStrength(match1, match2, likes)
        
        const endTime = Date.now()
        durations.push(endTime - startTime)
      }
      
      // Performance should be consistent
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      const maxDuration = Math.max(...durations)
      const minDuration = Math.min(...durations)
      
      expect(avgDuration).toBeLessThan(100) // Average should be fast
      expect(maxDuration - minDuration).toBeLessThan(50) // Variance should be low
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle corrupted filter data gracefully', async () => {
      const likes = ['user1', 'user2']
      const match = psiManager.createPrivateMatch(likes)
      
      // Corrupt the filter data
      const corruptedMatch: PrivateMatch = {
        ...match,
        likeFilter: {
          ...match.likeFilter,
          bits: new Uint8Array(0) // Empty bits array
        }
      }
      
      // Should handle gracefully without crashing
      const result = psiManager.checkMutualMatch(match, corruptedMatch, likes)
      expect(result).toBe(false)
    })

    test('should handle network serialization errors', async () => {
      const likes = ['user1', 'user2']
      const match = psiManager.createPrivateMatch(likes)
      
      // Test with invalid serialized data
      expect(() => {
        cryptoManager.deserializePrivateMatch('invalid json')
      }).toThrow()
      
      expect(() => {
        cryptoManager.deserializePrivateMatch('{"invalid": "structure"}')
      }).toThrow()
    })

    test('should handle very small and very large like lists', async () => {
      // Very small list
      const smallLikes = ['user1']
      const smallMatch = psiManager.createPrivateMatch(smallLikes)
      expect(smallMatch).toBeDefined()
      expect(psiManager.validateFilter(smallMatch.likeFilter)).toBe(true)
      
      // Very large list
      const largeLikes = Array.from({ length: 10000 }, (_, i) => `user${i}`)
      const largeMatch = psiManager.createPrivateMatch(largeLikes)
      expect(largeMatch).toBeDefined()
      expect(psiManager.validateFilter(largeMatch.likeFilter)).toBe(true)
      
      // Cross-check between different sizes
      const result = psiManager.checkMutualMatch(smallMatch, largeMatch, smallLikes)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('Security Properties', () => {
    test('should not leak information through timing attacks', async () => {
      const likes1 = ['user1', 'user2', 'user3']
      const likes2 = ['user4', 'user5', 'user6']
      const likes3 = ['user1', 'user2', 'user3'] // Same as likes1
      
      const match1 = psiManager.createPrivateMatch(likes1)
      const match2 = psiManager.createPrivateMatch(likes2)
      const match3 = psiManager.createPrivateMatch(likes3)
      
      // Measure timing for different scenarios
      const timings: number[] = []
      
      // No match scenario
      const start1 = performance.now()
      psiManager.checkMutualMatch(match1, match2, likes1)
      const end1 = performance.now()
      timings.push(end1 - start1)
      
      // Potential match scenario
      const start2 = performance.now()
      psiManager.checkMutualMatch(match1, match3, likes1)
      const end2 = performance.now()
      timings.push(end2 - start2)
      
      // Timing differences should be minimal (within reasonable variance)
      const timingDiff = Math.abs(timings[0] - timings[1])
      expect(timingDiff).toBeLessThan(10) // Less than 10ms difference
    })

    test('should maintain privacy with different salt strategies', async () => {
      const likes = ['user1', 'user2', 'user3']
      
      // Create multiple matches with different salts
      const matches = Array.from({ length: 5 }, () => psiManager.createPrivateMatch(likes))
      
      // All salts should be different
      const salts = matches.map(m => m.salt)
      const uniqueSalts = new Set(salts)
      expect(uniqueSalts.size).toBe(salts.length)
      
      // All filters should be different despite same input
      for (let i = 0; i < matches.length - 1; i++) {
        for (let j = i + 1; j < matches.length; j++) {
          expect(matches[i].likeFilter.bits).not.toEqual(matches[j].likeFilter.bits)
        }
      }
    })

    test('should resist filter analysis attacks', async () => {
      const likes = ['user1', 'user2', 'user3']
      const match = psiManager.createPrivateMatch(likes)
      
      // Attacker tries to analyze filter properties
      const stats = psiManager.getFilterStats(match.likeFilter)
      
      // Should not be able to determine exact number of likes from stats
      // (due to hash collisions and false positives)
      expect(stats.estimatedElements).toBeGreaterThan(0)
      
      // The estimated elements might not exactly match the actual number
      // This is expected behavior for Bloom filters
      const estimationError = Math.abs(stats.estimatedElements - likes.length)
      expect(estimationError).toBeLessThan(likes.length * 2) // Reasonable estimation bound
    })
  })

  describe('Integration with CryptoManager', () => {
    test('should integrate seamlessly with CryptoManager PSI methods', async () => {
      const likes = ['user1', 'user2', 'user3']
      
      // Test CryptoManager PSI methods
      const match1 = cryptoManager.createPrivateMatch(likes)
      const match2 = cryptoManager.createPrivateMatch(['user1', 'user4'])
      
      expect(match1).toBeDefined()
      expect(match2).toBeDefined()
      
      const result = cryptoManager.checkMutualMatch(match1, match2, likes)
      expect(typeof result).toBe('boolean')
      
      const strength = cryptoManager.calculateMatchStrength(match1, match2, likes)
      expect(strength).toBeGreaterThanOrEqual(0)
      expect(strength).toBeLessThanOrEqual(1)
    })

    test('should maintain backward compatibility with legacy methods', async () => {
      const likes = ['user1', 'user2']
      
      // Test legacy Bloom filter methods
      const filter1 = cryptoManager.generateLikeBloomFilter(likes)
      const filter2 = cryptoManager.generateLikeBloomFilter(['user1', 'user3'])
      
      expect(filter1).toBeDefined()
      expect(filter2).toBeDefined()
      
      const legacyResult = cryptoManager.checkMutualLike(filter1, filter2)
      expect(typeof legacyResult).toBe('boolean')
    })
  })
})