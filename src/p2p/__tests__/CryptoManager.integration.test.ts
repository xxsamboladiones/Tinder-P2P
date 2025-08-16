import { CryptoManager } from '../CryptoManager'

// Mock crypto.subtle for integration testing
const mockKeyPair = {
  publicKey: {} as CryptoKey,
  privateKey: {} as CryptoKey
}

const mockSignature = new ArrayBuffer(64)
const mockPublicKeyBuffer = new ArrayBuffer(32)

beforeAll(() => {
  // Mock crypto.subtle methods
  ;(global.crypto.subtle.generateKey as jest.Mock).mockResolvedValue(mockKeyPair)
  ;(global.crypto.subtle.exportKey as jest.Mock).mockResolvedValue(mockPublicKeyBuffer)
  ;(global.crypto.subtle.importKey as jest.Mock).mockResolvedValue(mockKeyPair.publicKey)
  ;(global.crypto.subtle.sign as jest.Mock).mockResolvedValue(mockSignature)
  ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValue(true)
})

describe('CryptoManager Integration Tests', () => {
  let cryptoManager: CryptoManager

  beforeEach(() => {
    cryptoManager = new CryptoManager()
    // Clear localStorage before each test
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Complete Identity Workflow', () => {
    it('should complete full identity lifecycle (requirements 6.1, 6.2, 6.3)', async () => {
      // Step 1: Generate new identity (requirement 6.1)
      const identity = await cryptoManager.generateIdentity()
      
      expect(identity.did).toMatch(/^did:key:z[A-Za-z0-9]+$/)
      expect(cryptoManager.hasIdentity()).toBe(true)

      // Step 2: Sign a profile (requirement 6.2)
      const profile = {
        name: 'Alice',
        age: 28,
        bio: 'Love hiking and photography',
        interests: ['hiking', 'photography', 'travel']
      }

      const signature = await cryptoManager.signProfile(profile)
      
      expect(signature.did).toBe(identity.did)
      expect(signature.signature).toMatch(/^[0-9a-f]+$/)
      expect(signature.publicKey).toMatch(/^[0-9a-f]+$/)

      // Step 3: Verify the profile signature (requirement 6.3)
      const isValid = await cryptoManager.verifyProfile(profile, signature)
      expect(isValid).toBe(true)

      // Step 4: Verify signature fails with tampered profile
      // Mock crypto.subtle.verify to return false for tampered data
      ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValueOnce(false)
      
      const tamperedProfile = { ...profile, name: 'Bob' }
      const isValidTampered = await cryptoManager.verifyProfile(tamperedProfile, signature)
      expect(isValidTampered).toBe(false)
      
      // Reset mock to return true for subsequent tests
      ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValue(true)
    })

    it('should persist and restore identity across sessions', async () => {
      // Create identity in first session
      const originalIdentity = await cryptoManager.generateIdentity()
      const originalDID = originalIdentity.did

      // Verify identity was saved to localStorage
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'p2p-identity',
        expect.stringContaining(originalDID)
      )

      // Verify the identity can sign profiles
      const profile = { name: 'Test', age: 25 }
      const signature = await cryptoManager.signProfile(profile)
      const isValid = await cryptoManager.verifyProfile(profile, signature)
      
      expect(isValid).toBe(true)
      expect(signature.did).toBe(originalDID)
    })
  })

  describe('Reputation System Integration', () => {
    it('should complete full reputation workflow (requirements 6.4, 6.5)', async () => {
      // Setup identities
      const alice = await cryptoManager.generateIdentity()
      const bobDID = 'did:key:zBob123'
      const charlieDID = 'did:key:zCharlie456'

      // Alice gives feedback to Bob (requirement 6.4)
      await cryptoManager.addReputationFeedback(bobDID, 5, 'Great conversation!')
      await cryptoManager.addReputationFeedback(bobDID, 4, 'Nice person')
      
      let bobReputation = cryptoManager.getReputationScore(bobDID)
      expect(bobReputation).toBeDefined()
      expect(bobReputation!.score).toBe(90) // (5+4)/2 * 20 = 90
      expect(bobReputation!.interactions).toBe(2)
      expect(cryptoManager.isSpamLikely(bobDID)).toBe(false)

      // Alice gives bad feedback to Charlie (spam detection - requirement 6.5)
      await cryptoManager.addReputationFeedback(charlieDID, 1, 'Spam messages')
      await cryptoManager.addReputationFeedback(charlieDID, 1, 'Inappropriate content')
      await cryptoManager.addReputationFeedback(charlieDID, 1, 'Fake profile')

      let charlieReputation = cryptoManager.getReputationScore(charlieDID)
      expect(charlieReputation!.score).toBe(20) // 1 * 20 = 20
      expect(charlieReputation!.interactions).toBe(3)
      expect(cryptoManager.isSpamLikely(charlieDID)).toBe(true)

      // Verify reputation data was saved
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'p2p-reputation',
        expect.stringContaining(bobDID)
      )
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'p2p-reputation',
        expect.stringContaining(charlieDID)
      )
    })
  })

  describe('Identity Verification Integration', () => {
    it('should create and verify identity proofs', async () => {
      const identity = await cryptoManager.generateIdentity()

      // Create identity proof
      const proof = await cryptoManager.createIdentityProof()
      expect(proof).toBeDefined()

      const parsedProof = JSON.parse(proof)
      expect(parsedProof.did).toBe(identity.did)

      // Verify the proof
      const isValid = await cryptoManager.verifyIdentityProof(proof, identity.did)
      expect(isValid).toBe(true)

      // Verify proof fails with wrong DID
      const isValidWrongDID = await cryptoManager.verifyIdentityProof(proof, 'did:key:zWrong123')
      expect(isValidWrongDID).toBe(false)
    })

    it('should handle cross-identity verification', async () => {
      // Create two different identities
      const alice = await cryptoManager.generateIdentity()
      
      const bobCryptoManager = new CryptoManager()
      const bob = await bobCryptoManager.generateIdentity()

      // Alice signs a profile
      const aliceProfile = { name: 'Alice', age: 25 }
      const aliceSignature = await cryptoManager.signProfile(aliceProfile)

      // Bob verifies Alice's profile signature
      const isValid = await bobCryptoManager.verifyProfile(aliceProfile, aliceSignature)
      expect(isValid).toBe(true)

      // Verify Bob can't forge Alice's signature
      const bobProfile = { name: 'Bob', age: 30 }
      const bobSignature = await bobCryptoManager.signProfile(bobProfile)
      
      // Try to use Bob's signature on Alice's profile (should fail)
      // Mock crypto.subtle.verify to return false for cross-identity verification
      ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValueOnce(false)
      
      const isForgeryValid = await cryptoManager.verifyProfile(aliceProfile, bobSignature)
      expect(isForgeryValid).toBe(false)
      
      // Reset mock
      ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValue(true)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle corrupted identity data gracefully', async () => {
      // Create valid identity first
      await cryptoManager.generateIdentity()

      // Corrupt the stored data
      localStorage.setItem('p2p-identity', 'invalid json')

      const newCryptoManager = new CryptoManager()
      const identity = await newCryptoManager.loadIdentity()

      expect(identity).toBeNull()
      expect(newCryptoManager.hasIdentity()).toBe(false)
    })

    it('should handle missing reputation data gracefully', async () => {
      const identity = await cryptoManager.generateIdentity()

      // Should not crash and should allow new reputation entries
      const targetDID = 'did:key:zTarget123'
      await cryptoManager.addReputationFeedback(targetDID, 4)

      const reputation = cryptoManager.getReputationScore(targetDID)
      expect(reputation).toBeDefined()
      expect(reputation!.score).toBe(80)
    })

    it('should handle data migration and cleanup', async () => {
      // Create identity and reputation data
      const identity = await cryptoManager.generateIdentity()
      await cryptoManager.addReputationFeedback('did:key:zTest123', 5)

      expect(cryptoManager.hasIdentity()).toBe(true)
      expect(cryptoManager.getReputationScore('did:key:zTest123')).toBeDefined()

      // Clear all data
      await cryptoManager.clearAllData()

      expect(cryptoManager.hasIdentity()).toBe(false)
      expect(cryptoManager.getReputationScore('did:key:zTest123')).toBeNull()

      // Verify localStorage is cleared
      expect(localStorage.getItem('p2p-identity')).toBeUndefined()
      expect(localStorage.getItem('p2p-reputation')).toBeUndefined()
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle multiple reputation entries efficiently', async () => {
      const identity = await cryptoManager.generateIdentity()
      const targetDID = 'did:key:zTarget123'

      // Add many reputation entries
      const startTime = Date.now()
      
      for (let i = 0; i < 100; i++) {
        const rating = Math.floor(Math.random() * 5) + 1 // Random rating 1-5
        await cryptoManager.addReputationFeedback(targetDID, rating)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000)

      const reputation = cryptoManager.getReputationScore(targetDID)
      expect(reputation!.interactions).toBe(100)
      expect(reputation!.feedbacks).toHaveLength(100)
    })

    it('should handle large profile objects', async () => {
      const identity = await cryptoManager.generateIdentity()

      // Create large profile with many fields
      const largeProfile = {
        name: 'Test User',
        age: 25,
        bio: 'A'.repeat(1000), // Large bio
        interests: Array.from({ length: 100 }, (_, i) => `interest${i}`),
        photos: Array.from({ length: 20 }, (_, i) => ({
          id: `photo${i}`,
          url: `https://example.com/photo${i}.jpg`,
          hash: 'a'.repeat(64)
        })),
        metadata: {
          created: new Date().toISOString(),
          version: '1.0',
          tags: Array.from({ length: 50 }, (_, i) => `tag${i}`)
        }
      }

      const startTime = Date.now()
      const signature = await cryptoManager.signProfile(largeProfile)
      const isValid = await cryptoManager.verifyProfile(largeProfile, signature)
      const endTime = Date.now()

      expect(isValid).toBe(true)
      expect(endTime - startTime).toBeLessThan(100) // Should be fast
    })
  })
})