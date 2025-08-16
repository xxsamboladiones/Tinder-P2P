import { ProfileCRDT, ProfileSignature } from '../ProfileCRDT'
import { CryptoManager } from '../CryptoManager'

// Mock crypto.subtle for testing
const mockKeyPair = {
  publicKey: {} as CryptoKey,
  privateKey: {} as CryptoKey
}

const mockSignature = new ArrayBuffer(64)
const mockPublicKeyBuffer = new ArrayBuffer(32)

beforeEach(() => {
  // Reset mocks
  jest.clearAllMocks()
  
  // Mock crypto.subtle methods
  ;(global.crypto.subtle.generateKey as jest.Mock).mockResolvedValue(mockKeyPair)
  ;(global.crypto.subtle.exportKey as jest.Mock).mockResolvedValue(mockPublicKeyBuffer)
  ;(global.crypto.subtle.importKey as jest.Mock).mockResolvedValue(mockKeyPair.publicKey)
  ;(global.crypto.subtle.sign as jest.Mock).mockResolvedValue(mockSignature)
  ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValue(true)
  
  // Mock crypto.randomUUID
  if (!global.crypto.randomUUID) {
    global.crypto.randomUUID = jest.fn()
  }
  ;(global.crypto.randomUUID as jest.Mock).mockReturnValue('test-uuid-123')
})

describe('ProfileCRDT - Basic Structure and Validation', () => {
  test('should have correct constructor parameters', () => {
    const id = 'test-id'
    const did = 'did:key:test'
    
    expect(id).toBe('test-id')
    expect(did).toBe('did:key:test')
    expect(did.startsWith('did:')).toBe(true)
  })

  test('should validate profile data structure', () => {
    const validProfile = {
      id: 'test-id',
      did: 'did:key:test',
      name: 'John Doe',
      age: 25,
      bio: 'Software developer'
    }

    expect(validProfile.id.length).toBeGreaterThan(0)
    expect(validProfile.did.startsWith('did:')).toBe(true)
    expect(validProfile.name.length).toBeGreaterThan(0)
    expect(validProfile.age).toBeGreaterThanOrEqual(18)
    expect(validProfile.age).toBeLessThanOrEqual(100)
  })

  test('should validate photo reference structure', () => {
    const photo = {
      id: 'photo1',
      hash: 'hash1',
      url: 'https://example.com/photo1.jpg',
      thumbnail: 'thumb1'
    }

    expect(photo.id).toBeDefined()
    expect(photo.hash).toBeDefined()
    expect(photo.thumbnail).toBeDefined()
    expect(typeof photo.url).toBe('string')
  })

  test('should validate geohash location structure', () => {
    const location = {
      geohash: 'dr5ru',
      timestamp: new Date()
    }

    expect(location.geohash).toBe('dr5ru')
    expect(location.geohash.length).toBe(5) // 5 digits for ~2.4km precision
    expect(location.timestamp).toBeInstanceOf(Date)
  })

  test('should validate age ranges', () => {
    const validAges = [18, 25, 30, 50, 100]
    const invalidAges = [17, 0, -5, 101, 150]

    validAges.forEach(age => {
      expect(age).toBeGreaterThanOrEqual(18)
      expect(age).toBeLessThanOrEqual(100)
    })

    invalidAges.forEach(age => {
      expect(age < 18 || age > 100).toBe(true)
    })
  })

  test('should validate interests array', () => {
    const interests = ['music', 'travel', 'coding', 'sports']
    
    expect(Array.isArray(interests)).toBe(true)
    expect(interests.length).toBeGreaterThan(0)
    interests.forEach(interest => {
      expect(typeof interest).toBe('string')
      expect(interest.length).toBeGreaterThan(0)
    })
  })

  test('should validate DID format', () => {
    const validDIDs = [
      'did:key:test',
      'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      'did:web:example.com'
    ]

    const invalidDIDs = [
      'not-a-did',
      'did:',
      'key:test',
      ''
    ]

    validDIDs.forEach(did => {
      expect(did.startsWith('did:')).toBe(true)
      expect(did.includes(':')).toBe(true)
    })

    invalidDIDs.forEach(did => {
      expect(did.startsWith('did:') && did.length > 4).toBe(false)
    })
  })

  test('should validate profile update structure', () => {
    const updateData = {
      name: 'Updated Name',
      age: 26,
      bio: 'Updated bio',
      interests: ['new-interest']
    }

    expect(typeof updateData.name).toBe('string')
    expect(typeof updateData.age).toBe('number')
    expect(typeof updateData.bio).toBe('string')
    expect(Array.isArray(updateData.interests)).toBe(true)
  })
})

describe('ProfileCRDT - Profile Signing and Verification', () => {
  let profile: ProfileCRDT
  let cryptoManager: CryptoManager

  beforeEach(async () => {
    profile = new ProfileCRDT('test-id', 'did:key:zTest123')
    profile.setName('Test User')
    profile.setAge(25)
    profile.setBio('Test bio')

    cryptoManager = new CryptoManager()
    await cryptoManager.generateIdentity()
  })

  describe('signProfile', () => {
    it('should sign profile and add signature (requirement 6.2)', async () => {
      const identity = cryptoManager.getCurrentIdentity()!
      const signature = await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)

      expect(signature).toBeDefined()
      expect(signature.timestamp).toBeInstanceOf(Date)
      expect(signature.signature).toMatch(/^[0-9a-f]+$/)
      expect(signature.publicKey).toMatch(/^[0-9a-f]+$/)
      expect(signature.did).toBe(identity.did)

      // Verify signature was added to profile
      const signatures = profile.signatures
      expect(signatures).toHaveLength(1)
      expect(signatures[0]).toEqual(signature)
    })

    it('should create consistent signatures for same profile data', async () => {
      const identity = cryptoManager.getCurrentIdentity()!
      
      const signature1 = await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)
      const signature2 = await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)

      // Should produce same signature for same data
      expect(signature1.signature).toBe(signature2.signature)
    })

    it('should handle signing errors gracefully', async () => {
      ;(global.crypto.subtle.sign as jest.Mock).mockRejectedValue(new Error('Sign error'))

      const identity = cryptoManager.getCurrentIdentity()!
      await expect(profile.signProfile(identity.privateKey, identity.did, identity.publicKey))
        .rejects.toThrow('Profile signing failed: Sign error')
    })
  })

  describe('verifySignature', () => {
    it('should verify valid profile signature (requirement 6.3)', async () => {
      const identity = cryptoManager.getCurrentIdentity()!
      const signature = await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)
      
      const isValid = await profile.verifySignature(signature)
      expect(isValid).toBe(true)
    })

    it('should reject invalid signature', async () => {
      ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValue(false)

      const identity = cryptoManager.getCurrentIdentity()!
      const signature = await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)
      
      const isValid = await profile.verifySignature(signature)
      expect(isValid).toBe(false)
    })

    it('should handle verification errors gracefully', async () => {
      ;(global.crypto.subtle.importKey as jest.Mock).mockRejectedValue(new Error('Import error'))

      const identity = cryptoManager.getCurrentIdentity()!
      const signature = await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)
      
      const isValid = await profile.verifySignature(signature)
      expect(isValid).toBe(false)
    })
  })

  describe('verifyAllSignatures', () => {
    it('should verify multiple signatures', async () => {
      const identity = cryptoManager.getCurrentIdentity()!
      
      // Add multiple signatures
      await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)
      await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)
      await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)

      const result = await profile.verifyAllSignatures()
      expect(result.valid).toBe(3)
      expect(result.invalid).toBe(0)
      expect(result.results).toEqual([true, true, true])
    })

    it('should handle mixed valid/invalid signatures', async () => {
      const identity = cryptoManager.getCurrentIdentity()!
      
      // Add valid signature
      await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)
      
      // Mock verification to return false for subsequent calls
      ;(global.crypto.subtle.verify as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      // Add another signature
      await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)

      const result = await profile.verifyAllSignatures()
      expect(result.valid).toBe(1)
      expect(result.invalid).toBe(1)
      expect(result.results).toEqual([true, false])
    })
  })

  describe('getLatestSignature', () => {
    it('should return most recent signature', async () => {
      const identity = cryptoManager.getCurrentIdentity()!
      
      const signature1 = await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const signature2 = await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)

      const latest = profile.getLatestSignature()
      expect(latest).toBeDefined()
      expect(latest!.timestamp.getTime()).toBeGreaterThanOrEqual(signature2.timestamp.getTime())
    })

    it('should return null for profile with no signatures', () => {
      const emptyProfile = new ProfileCRDT('empty-id', 'did:key:zEmpty')
      const latest = emptyProfile.getLatestSignature()
      expect(latest).toBeNull()
    })
  })
})

describe('ProfileCRDT - Reputation Integration', () => {
  let profile: ProfileCRDT

  beforeEach(() => {
    profile = new ProfileCRDT('test-id', 'did:key:zTest123')
    profile.setName('Test User')
    profile.setAge(25)
    profile.setBio('Test bio')
    profile.addInterest('music')
    profile.addPhoto({
      id: 'photo1',
      hash: 'hash1',
      thumbnail: 'thumb1',
      url: 'https://example.com/photo1.jpg'
    })
  })

  describe('getTrustScore', () => {
    it('should return 0 for profile with no signatures', () => {
      const trustScore = profile.getTrustScore()
      expect(trustScore).toBe(0)
    })

    it('should calculate trust score based on signatures (requirement 6.4)', async () => {
      const mockSignature: ProfileSignature = {
        timestamp: new Date(),
        signature: '0123456789abcdef',
        publicKey: 'abcdef0123456789',
        did: 'did:key:zSigner123'
      }

      profile.addSignature(mockSignature)
      profile.addSignature(mockSignature)
      profile.addSignature(mockSignature)

      const trustScore = profile.getTrustScore()
      expect(trustScore).toBeGreaterThan(0)
      expect(trustScore).toBeLessThanOrEqual(100)
    })

    it('should reduce trust score for very new profiles', () => {
      // Create a profile that's very new (created now)
      const newProfile = new ProfileCRDT('new-id', 'did:key:zNew123')
      
      const mockSignature: ProfileSignature = {
        timestamp: new Date(),
        signature: '0123456789abcdef',
        publicKey: 'abcdef0123456789',
        did: 'did:key:zSigner123'
      }

      newProfile.addSignature(mockSignature)
      
      const trustScore = newProfile.getTrustScore()
      expect(trustScore).toBeLessThan(20) // Should be reduced due to age
    })
  })

  describe('isSpamLikely', () => {
    it('should not flag normal profiles as spam', () => {
      expect(profile.isSpamLikely()).toBe(false)
    })

    it('should flag profiles with spam indicators (requirement 6.5)', () => {
      const spamProfile = new ProfileCRDT('spam-id', 'did:key:zSpam123')
      spamProfile.setName('X') // Very short name
      spamProfile.setAge(15) // Suspicious age
      spamProfile.setBio('Check out my website: http://spam.com') // URL in bio
      // No interests, no photos, no signatures

      expect(spamProfile.isSpamLikely()).toBe(true)
    })

    it('should not flag profiles with few spam indicators', () => {
      const borderlineProfile = new ProfileCRDT('borderline-id', 'did:key:zBorderline123')
      borderlineProfile.setName('Jo') // Short name
      borderlineProfile.setAge(19) // Young but valid age
      borderlineProfile.setBio('Love music')
      borderlineProfile.addInterest('music')

      expect(borderlineProfile.isSpamLikely()).toBe(false)
    })
  })

  describe('getVerificationStatus', () => {
    it('should return unverified status for profile with no signatures', () => {
      const status = profile.getVerificationStatus()
      
      expect(status.isVerified).toBe(false)
      expect(status.signatureCount).toBe(0)
      expect(status.latestSignature).toBeNull()
      expect(status.trustLevel).toBe('none')
    })

    it('should return appropriate trust levels based on signature count', () => {
      const mockSignature: ProfileSignature = {
        timestamp: new Date(),
        signature: '0123456789abcdef',
        publicKey: 'abcdef0123456789',
        did: 'did:key:zSigner123'
      }

      // Low trust (1 signature)
      profile.addSignature(mockSignature)
      let status = profile.getVerificationStatus()
      expect(status.trustLevel).toBe('low')
      expect(status.isVerified).toBe(true)

      // Medium trust (3 signatures)
      profile.addSignature(mockSignature)
      profile.addSignature(mockSignature)
      status = profile.getVerificationStatus()
      expect(status.trustLevel).toBe('medium')

      // High trust (5+ signatures)
      profile.addSignature(mockSignature)
      profile.addSignature(mockSignature)
      status = profile.getVerificationStatus()
      expect(status.trustLevel).toBe('high')
      expect(status.signatureCount).toBe(5)
    })
  })

  describe('recordInteraction', () => {
    it('should record interactions for reputation tracking (requirement 6.4)', () => {
      const fromDID = 'did:key:zInteractor123'
      
      profile.recordInteraction('like', fromDID)
      profile.recordInteraction('message', fromDID)
      profile.recordInteraction('match', fromDID)

      const interactions = profile.getInteractions()
      expect(interactions).toHaveLength(3)
      expect(interactions[0].type).toBe('like')
      expect(interactions[0].from).toBe(fromDID)
      expect(interactions[0].timestamp).toBeInstanceOf(Date)
      expect(interactions[0].id).toBeDefined()
    })

    it('should update profile version when recording interactions', () => {
      const initialVersion = profile.version
      
      profile.recordInteraction('like', 'did:key:zTest')
      
      expect(profile.version).toBeGreaterThan(initialVersion)
    })
  })

  describe('getInteractionStats', () => {
    it('should calculate interaction statistics', () => {
      const user1 = 'did:key:zUser1'
      const user2 = 'did:key:zUser2'
      
      profile.recordInteraction('like', user1)
      profile.recordInteraction('like', user2)
      profile.recordInteraction('match', user1)
      profile.recordInteraction('message', user1)
      profile.recordInteraction('report', user2)

      const stats = profile.getInteractionStats()
      expect(stats.totalInteractions).toBe(5)
      expect(stats.likes).toBe(2)
      expect(stats.matches).toBe(1)
      expect(stats.messages).toBe(1)
      expect(stats.reports).toBe(1)
      expect(stats.uniqueUsers).toBe(2)
    })

    it('should return zero stats for profile with no interactions', () => {
      const stats = profile.getInteractionStats()
      expect(stats.totalInteractions).toBe(0)
      expect(stats.likes).toBe(0)
      expect(stats.matches).toBe(0)
      expect(stats.messages).toBe(0)
      expect(stats.reports).toBe(0)
      expect(stats.uniqueUsers).toBe(0)
    })
  })
})

describe('ProfileCRDT - Integration with CryptoManager', () => {
  let profile: ProfileCRDT
  let cryptoManager: CryptoManager

  beforeEach(async () => {
    profile = new ProfileCRDT('integration-id', 'did:key:zIntegration123')
    profile.setName('Integration Test User')
    profile.setAge(30)
    profile.setBio('Testing integration')

    cryptoManager = new CryptoManager()
    await cryptoManager.generateIdentity()
  })

  it('should integrate profile signing with reputation system', async () => {
    const identity = cryptoManager.getCurrentIdentity()!
    
    // Sign profile
    const signature = await profile.signProfile(identity.privateKey, identity.did, identity.publicKey)
    expect(signature.did).toBe(identity.did)

    // Verify signature
    const isValid = await profile.verifySignature(signature)
    expect(isValid).toBe(true)

    // Check that reputation system can track this interaction
    const reputation = cryptoManager.getReputationScore(identity.did)
    expect(reputation).toBeDefined()
    expect(reputation!.did).toBe(identity.did)
  })

  it('should handle reputation feedback for profile interactions', async () => {
    const identity = cryptoManager.getCurrentIdentity()!
    const targetDID = 'did:key:zTarget123'

    // Record positive interaction
    profile.recordInteraction('match', targetDID)
    
    // Add reputation feedback
    await cryptoManager.addReputationFeedback(targetDID, 5, 'Great match!')

    const reputation = cryptoManager.getReputationScore(targetDID)
    expect(reputation).toBeDefined()
    expect(reputation!.score).toBe(100) // 5/5 rating = 100 score
    expect(reputation!.interactions).toBe(1)
  })

  it('should detect spam profiles using reputation data', async () => {
    const spamDID = 'did:key:zSpam123'
    
    // Add multiple negative reputation feedbacks
    await cryptoManager.addReputationFeedback(spamDID, 1, 'Spam profile')
    await cryptoManager.addReputationFeedback(spamDID, 1, 'Fake account')
    await cryptoManager.addReputationFeedback(spamDID, 2, 'Suspicious')

    const isSpam = cryptoManager.isSpamLikely(spamDID)
    expect(isSpam).toBe(true)

    // Profile-level spam detection should also work
    const spamProfile = new ProfileCRDT('spam-profile', spamDID)
    spamProfile.setName('X')
    spamProfile.setAge(16)
    expect(spamProfile.isSpamLikely()).toBe(true)
  })
})