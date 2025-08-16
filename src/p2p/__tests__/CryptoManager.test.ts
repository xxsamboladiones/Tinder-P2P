import { CryptoManager, ProfileSignature, ReputationScore } from '../CryptoManager'
import { Identity, KeyExchangeBundle } from '../types'

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
  
  // Mock localStorage
  ;(global.localStorage.getItem as jest.Mock).mockReturnValue(null)
  ;(global.localStorage.setItem as jest.Mock).mockImplementation(() => {})
  ;(global.localStorage.removeItem as jest.Mock).mockImplementation(() => {})
})

describe('CryptoManager - Identity Management', () => {
  let cryptoManager: CryptoManager

  beforeEach(() => {
    cryptoManager = new CryptoManager()
  })

  describe('generateIdentity', () => {
    it('should generate a new identity with DID (requirement 6.1)', async () => {
      const identity = await cryptoManager.generateIdentity()

      expect(identity).toBeDefined()
      expect(identity.did).toMatch(/^did:key:z[A-Za-z0-9]+$/)
      expect(identity.publicKey).toBe(mockKeyPair.publicKey)
      expect(identity.privateKey).toBe(mockKeyPair.privateKey)
      expect(identity.keyPair).toEqual(mockKeyPair)

      // Verify crypto.subtle.generateKey was called with correct parameters
      expect(global.crypto.subtle.generateKey).toHaveBeenCalledWith(
        {
          name: 'Ed25519',
          namedCurve: 'Ed25519'
        },
        true,
        ['sign', 'verify']
      )
    })

    it('should save identity to localStorage', async () => {
      await cryptoManager.generateIdentity()

      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        'p2p-identity',
        expect.stringContaining('"did":"did:key:z')
      )
    })

    it('should initialize reputation score for new identity', async () => {
      const identity = await cryptoManager.generateIdentity()
      const reputation = cryptoManager.getReputationScore(identity.did)

      expect(reputation).toBeDefined()
      expect(reputation!.score).toBe(100)
      expect(reputation!.interactions).toBe(0)
      expect(reputation!.feedbacks).toEqual([])
    })

    it('should handle crypto errors gracefully', async () => {
      ;(global.crypto.subtle.generateKey as jest.Mock).mockRejectedValue(new Error('Crypto error'))

      await expect(cryptoManager.generateIdentity()).rejects.toThrow('Identity generation failed: Crypto error')
    })
  })

  describe('loadIdentity', () => {
    const mockStoredIdentity = {
      did: 'did:key:zTest123',
      publicKey: [1, 2, 3, 4],
      privateKey: [5, 6, 7, 8],
      created: '2023-01-01T00:00:00.000Z',
      version: '1.0'
    }

    it('should load existing identity from localStorage', async () => {
      ;(global.localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockStoredIdentity))
      
      // Mock generateDID to return the expected DID
      const cryptoManagerSpy = jest.spyOn(CryptoManager.prototype as any, 'generateDID')
      cryptoManagerSpy.mockResolvedValue(mockStoredIdentity.did)

      const identity = await cryptoManager.loadIdentity()

      expect(identity).toBeDefined()
      expect(identity!.did).toBe(mockStoredIdentity.did)
      expect(global.crypto.subtle.importKey).toHaveBeenCalledTimes(2)
      
      cryptoManagerSpy.mockRestore()
    })

    it('should return null if no identity stored', async () => {
      ;(global.localStorage.getItem as jest.Mock).mockReturnValue(null)

      const identity = await cryptoManager.loadIdentity()

      expect(identity).toBeNull()
    })

    it('should return null for invalid identity data', async () => {
      ;(global.localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify({ invalid: 'data' }))

      const identity = await cryptoManager.loadIdentity()

      expect(identity).toBeNull()
    })

    it('should verify DID matches public key', async () => {
      ;(global.localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockStoredIdentity))
      
      // Mock generateDID to return different DID to test mismatch
      const cryptoManagerSpy = jest.spyOn(CryptoManager.prototype as any, 'generateDID')
      cryptoManagerSpy.mockResolvedValue('did:key:zDifferent123')

      const identity = await cryptoManager.loadIdentity()

      expect(identity).toBeNull()
      cryptoManagerSpy.mockRestore()
    })
  })

  describe('hasIdentity and getCurrentIdentity', () => {
    it('should return false/null when no identity is loaded', () => {
      expect(cryptoManager.hasIdentity()).toBe(false)
      expect(cryptoManager.getCurrentIdentity()).toBeNull()
    })

    it('should return true/identity when identity is loaded', async () => {
      const identity = await cryptoManager.generateIdentity()

      expect(cryptoManager.hasIdentity()).toBe(true)
      expect(cryptoManager.getCurrentIdentity()).toBe(identity)
    })
  })
})

describe('CryptoManager - Profile Signing and Verification', () => {
  let cryptoManager: CryptoManager
  let identity: Identity

  beforeEach(async () => {
    cryptoManager = new CryptoManager()
    identity = await cryptoManager.generateIdentity()
  })

  describe('signProfile', () => {
    const mockProfile = {
      name: 'Test User',
      age: 25,
      bio: 'Test bio',
      interests: ['music', 'travel']
    }

    it('should sign profile with current identity (requirement 6.2)', async () => {
      const signature = await cryptoManager.signProfile(mockProfile)

      expect(signature).toBeDefined()
      expect(signature.timestamp).toBeInstanceOf(Date)
      expect(signature.signature).toMatch(/^[0-9a-f]+$/)
      expect(signature.publicKey).toMatch(/^[0-9a-f]+$/)
      expect(signature.did).toBe(identity.did)

      expect(global.crypto.subtle.sign).toHaveBeenCalledWith(
        'Ed25519',
        identity.privateKey,
        expect.any(Uint8Array)
      )
    })

    it('should throw error if no identity is initialized', async () => {
      const newCryptoManager = new CryptoManager()

      await expect(newCryptoManager.signProfile(mockProfile)).rejects.toThrow(
        'Identity not initialized - cannot sign profile'
      )
    })

    it('should create canonical representation for consistent signing', async () => {
      const profile1 = { name: 'Test', age: 25, bio: 'Bio' }
      const profile2 = { bio: 'Bio', age: 25, name: 'Test' } // Different order

      const signature1 = await cryptoManager.signProfile(profile1)
      const signature2 = await cryptoManager.signProfile(profile2)

      // Should produce same signature for same data in different order
      expect(signature1.signature).toBe(signature2.signature)
    })

    it('should handle signing errors gracefully', async () => {
      ;(global.crypto.subtle.sign as jest.Mock).mockRejectedValue(new Error('Sign error'))

      await expect(cryptoManager.signProfile({})).rejects.toThrow('Profile signing failed: Sign error')
    })
  })

  describe('verifyProfile', () => {
    const mockProfile = {
      name: 'Test User',
      age: 25,
      bio: 'Test bio'
    }

    it('should verify valid profile signature (requirement 6.3)', async () => {
      const signature = await cryptoManager.signProfile(mockProfile)
      const isValid = await cryptoManager.verifyProfile(mockProfile, signature)

      expect(isValid).toBe(true)
      expect(global.crypto.subtle.verify).toHaveBeenCalled()
    })

    it('should reject invalid signature', async () => {
      ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValue(false)

      const signature = await cryptoManager.signProfile(mockProfile)
      const isValid = await cryptoManager.verifyProfile(mockProfile, signature)

      expect(isValid).toBe(false)
    })

    it('should reject signature with mismatched DID', async () => {
      const signature = await cryptoManager.signProfile(mockProfile)
      signature.did = 'did:key:zFakeDID123'

      const isValid = await cryptoManager.verifyProfile(mockProfile, signature)

      expect(isValid).toBe(false)
    })

    it('should handle verification errors gracefully', async () => {
      ;(global.crypto.subtle.importKey as jest.Mock).mockRejectedValue(new Error('Import error'))

      const signature = await cryptoManager.signProfile(mockProfile)
      const isValid = await cryptoManager.verifyProfile(mockProfile, signature)

      expect(isValid).toBe(false)
    })
  })
})

describe('CryptoManager - Reputation Management', () => {
  let cryptoManager: CryptoManager
  let identity: Identity

  beforeEach(async () => {
    cryptoManager = new CryptoManager()
    identity = await cryptoManager.generateIdentity()
  })

  describe('addReputationFeedback', () => {
    const targetDID = 'did:key:zTarget123'

    it('should add reputation feedback (requirement 6.4)', async () => {
      await cryptoManager.addReputationFeedback(targetDID, 4, 'Good interaction')

      const reputation = cryptoManager.getReputationScore(targetDID)
      expect(reputation).toBeDefined()
      expect(reputation!.feedbacks).toHaveLength(1)
      expect(reputation!.feedbacks[0].rating).toBe(4)
      expect(reputation!.feedbacks[0].from).toBe(identity.did)
      expect(reputation!.score).toBe(80) // 4/5 * 100 = 80
    })

    it('should validate rating range', async () => {
      await expect(cryptoManager.addReputationFeedback(targetDID, 0, 'Bad')).rejects.toThrow(
        'Rating must be between 1 and 5'
      )

      await expect(cryptoManager.addReputationFeedback(targetDID, 6, 'Too high')).rejects.toThrow(
        'Rating must be between 1 and 5'
      )
    })

    it('should require initialized identity', async () => {
      const newCryptoManager = new CryptoManager()

      await expect(newCryptoManager.addReputationFeedback(targetDID, 5)).rejects.toThrow(
        'Identity not initialized - cannot add reputation feedback'
      )
    })

    it('should calculate average score correctly', async () => {
      await cryptoManager.addReputationFeedback(targetDID, 5) // 100
      await cryptoManager.addReputationFeedback(targetDID, 3) // 60
      await cryptoManager.addReputationFeedback(targetDID, 4) // 80

      const reputation = cryptoManager.getReputationScore(targetDID)
      expect(reputation!.score).toBe(80) // (5+3+4)/3 * 20 = 80
      expect(reputation!.interactions).toBe(3)
    })
  })

  describe('isSpamLikely', () => {
    const targetDID = 'did:key:zTarget123'

    it('should detect spam based on low reputation (requirement 6.5)', async () => {
      // Add multiple low ratings
      await cryptoManager.addReputationFeedback(targetDID, 1)
      await cryptoManager.addReputationFeedback(targetDID, 1)
      await cryptoManager.addReputationFeedback(targetDID, 1)

      expect(cryptoManager.isSpamLikely(targetDID)).toBe(true)
    })

    it('should not flag users with good reputation', async () => {
      await cryptoManager.addReputationFeedback(targetDID, 5)
      await cryptoManager.addReputationFeedback(targetDID, 4)
      await cryptoManager.addReputationFeedback(targetDID, 5)

      expect(cryptoManager.isSpamLikely(targetDID)).toBe(false)
    })

    it('should not flag unknown users', () => {
      expect(cryptoManager.isSpamLikely('did:key:zUnknown123')).toBe(false)
    })

    it('should not flag users with few interactions', async () => {
      await cryptoManager.addReputationFeedback(targetDID, 1) // Low score but only 1 interaction

      expect(cryptoManager.isSpamLikely(targetDID)).toBe(false)
    })
  })

  describe('verifyReputationFeedback', () => {
    it('should verify valid reputation feedback', async () => {
      const mockFeedback = {
        from: identity.did,
        to: 'did:key:zTarget123',
        rating: 4,
        comment: 'Good',
        timestamp: new Date().toISOString(),
        signature: '0123456789abcdef'
      }

      const isValid = await cryptoManager.verifyReputationFeedback(mockFeedback, identity.publicKey)

      expect(isValid).toBe(true)
      expect(global.crypto.subtle.verify).toHaveBeenCalled()
    })

    it('should handle verification errors', async () => {
      ;(global.crypto.subtle.verify as jest.Mock).mockRejectedValue(new Error('Verify error'))

      const mockFeedback = {
        from: identity.did,
        to: 'did:key:zTarget123',
        rating: 4,
        signature: 'invalid'
      }

      const isValid = await cryptoManager.verifyReputationFeedback(mockFeedback, identity.publicKey)

      expect(isValid).toBe(false)
    })
  })
})

describe('CryptoManager - Identity Verification', () => {
  let cryptoManager: CryptoManager
  let identity: Identity

  beforeEach(async () => {
    cryptoManager = new CryptoManager()
    identity = await cryptoManager.generateIdentity()
  })

  describe('createIdentityProof', () => {
    it('should create identity proof', async () => {
      const proof = await cryptoManager.createIdentityProof()

      expect(proof).toBeDefined()
      const parsedProof = JSON.parse(proof)
      expect(parsedProof.did).toBe(identity.did)
      expect(parsedProof.timestamp).toBeDefined()
      expect(parsedProof.challenge).toBeDefined()
      expect(parsedProof.signature).toMatch(/^[0-9a-f]+$/)
    })

    it('should require initialized identity', async () => {
      const newCryptoManager = new CryptoManager()

      await expect(newCryptoManager.createIdentityProof()).rejects.toThrow('Identity not initialized')
    })
  })

  describe('verifyIdentityProof', () => {
    it('should verify valid identity proof', async () => {
      const proof = await cryptoManager.createIdentityProof()
      const isValid = await cryptoManager.verifyIdentityProof(proof, identity.did)

      expect(isValid).toBe(true)
    })

    it('should reject proof with wrong DID', async () => {
      const proof = await cryptoManager.createIdentityProof()
      const isValid = await cryptoManager.verifyIdentityProof(proof, 'did:key:zWrongDID123')

      expect(isValid).toBe(false)
    })

    it('should reject expired proof', async () => {
      // Mock old timestamp
      const oldProof = {
        did: identity.did,
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
        challenge: [1, 2, 3],
        signature: '0123456789abcdef'
      }

      const isValid = await cryptoManager.verifyIdentityProof(JSON.stringify(oldProof), identity.did)

      expect(isValid).toBe(false)
    })

    it('should handle invalid proof format', async () => {
      const isValid = await cryptoManager.verifyIdentityProof('invalid json', identity.did)

      expect(isValid).toBe(false)
    })
  })
})

describe('CryptoManager - Utility Methods', () => {
  let cryptoManager: CryptoManager

  beforeEach(() => {
    cryptoManager = new CryptoManager()
  })

  describe('generateRandomBytes', () => {
    it('should generate random bytes of specified length', async () => {
      const bytes = await cryptoManager.generateRandomBytes(32)

      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.length).toBe(32)
      expect(global.crypto.getRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array))
    })
  })

  describe('clearAllData', () => {
    it('should clear all identity and reputation data', async () => {
      await cryptoManager.generateIdentity()
      await cryptoManager.addReputationFeedback('did:key:zTest123', 5)

      expect(cryptoManager.hasIdentity()).toBe(true)
      expect(cryptoManager.getReputationScore('did:key:zTest123')).toBeDefined()

      await cryptoManager.clearAllData()

      expect(cryptoManager.hasIdentity()).toBe(false)
      expect(cryptoManager.getReputationScore('did:key:zTest123')).toBeNull()
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('p2p-identity')
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('p2p-reputation')
    })
  })
})

describe('CryptoManager - Double Ratchet Encryption', () => {
  let cryptoManager: CryptoManager
  let identity: Identity

  beforeEach(async () => {
    cryptoManager = new CryptoManager()
    identity = await cryptoManager.generateIdentity()
    
    // Mock AES-GCM operations for Double Ratchet
    ;(global.crypto.subtle.generateKey as jest.Mock).mockImplementation((algorithm) => {
      if (algorithm.name === 'AES-GCM') {
        return Promise.resolve(mockKeyPair.publicKey) // Use as mock AES key
      }
      return Promise.resolve(mockKeyPair)
    })
    
    ;(global.crypto.subtle.encrypt as jest.Mock).mockResolvedValue(new ArrayBuffer(64))
    ;(global.crypto.subtle.decrypt as jest.Mock).mockImplementation((algorithm, key, data) => {
      // Return a mock decrypted message
      return Promise.resolve(new TextEncoder().encode('test message').buffer)
    })
  })

  describe('initializeRatchet', () => {
    it('should initialize ratchet state for a peer (requirement 4.1)', async () => {
      const peerId = 'test-peer-123'
      const mockPublicKey = mockKeyPair.publicKey

      await cryptoManager.initializeRatchet(peerId, mockPublicKey)

      // Verify ratchet state was created (we can't directly access private members, so we test behavior)
      // Try to encrypt a message to verify initialization worked
      const message = 'test message'
      const encrypted = await cryptoManager.encryptMessage(peerId, message)

      expect(encrypted).toBeDefined()
      expect(encrypted.ciphertext).toBeInstanceOf(ArrayBuffer)
      expect(encrypted.header).toBeDefined()
      expect(encrypted.timestamp).toBeInstanceOf(Date)
    })

    it('should handle initialization errors gracefully', async () => {
      const peerId = 'test-peer-123'
      
      // Create a new instance for this test to avoid affecting other tests
      const testCryptoManager = new CryptoManager()
      
      // Mock crypto.getRandomValues to fail only for this test
      const originalGetRandomValues = global.crypto.getRandomValues
      global.crypto.getRandomValues = jest.fn().mockImplementation(() => {
        throw new Error('Random generation failed')
      })

      try {
        await expect(testCryptoManager.initializeRatchet(peerId, mockKeyPair.publicKey))
          .rejects.toThrow('Random generation failed')
      } finally {
        // Always restore original function
        global.crypto.getRandomValues = originalGetRandomValues
      }
    })
  })

  describe('encryptMessage', () => {
    const peerId = 'test-peer-123'
    const testMessage = 'Hello, this is a secret message!'

    beforeEach(async () => {
      await cryptoManager.initializeRatchet(peerId, mockKeyPair.publicKey)
    })

    it('should encrypt messages using Double Ratchet (requirement 4.4)', async () => {
      const encrypted = await cryptoManager.encryptMessage(peerId, testMessage)

      expect(encrypted).toBeDefined()
      expect(encrypted.ciphertext).toBeInstanceOf(ArrayBuffer)
      expect(encrypted.ciphertext.byteLength).toBeGreaterThan(0)
      expect(encrypted.header).toBeDefined()
      expect(encrypted.header.publicKey).toBeInstanceOf(ArrayBuffer)
      expect(encrypted.header.messageNumber).toBeGreaterThanOrEqual(0)
      expect(encrypted.timestamp).toBeInstanceOf(Date)
    })

    it('should increment message number for each message', async () => {
      const encrypted1 = await cryptoManager.encryptMessage(peerId, 'Message 1')
      const encrypted2 = await cryptoManager.encryptMessage(peerId, 'Message 2')

      expect(encrypted2.header.messageNumber).toBe(encrypted1.header.messageNumber + 1)
    })

    it('should throw error for uninitialized peer', async () => {
      const uninitializedPeerId = 'uninitialized-peer'

      await expect(cryptoManager.encryptMessage(uninitializedPeerId, testMessage))
        .rejects.toThrow('Ratchet not initialized for peer: uninitialized-peer')
    })

    it('should handle encryption errors gracefully', async () => {
      // Mock AES-GCM encryption to fail
      ;(global.crypto.subtle.encrypt as jest.Mock).mockRejectedValue(new Error('Encryption failed'))

      await expect(cryptoManager.encryptMessage(peerId, testMessage))
        .rejects.toThrow('Message encryption failed')
    })
  })

  describe('decryptMessage', () => {
    const peerId = 'test-peer-123'
    const testMessage = 'Hello, this is a secret message!'

    beforeEach(async () => {
      await cryptoManager.initializeRatchet(peerId, mockKeyPair.publicKey)
    })

    it('should decrypt messages using Double Ratchet (requirement 4.5)', async () => {
      const encrypted = await cryptoManager.encryptMessage(peerId, testMessage)
      
      // Mock successful decryption
      ;(global.crypto.subtle.decrypt as jest.Mock).mockResolvedValue(
        new TextEncoder().encode(testMessage).buffer
      )

      const decrypted = await cryptoManager.decryptMessage(peerId, encrypted)

      expect(decrypted).toBe(testMessage)
      expect(global.crypto.subtle.decrypt).toHaveBeenCalled()
    })

    it('should throw error for uninitialized peer', async () => {
      const uninitializedPeerId = 'uninitialized-peer'
      const mockEncrypted = {
        ciphertext: new ArrayBuffer(32),
        header: {
          publicKey: new ArrayBuffer(32),
          previousChainLength: 0,
          messageNumber: 0
        },
        timestamp: new Date()
      }

      await expect(cryptoManager.decryptMessage(uninitializedPeerId, mockEncrypted))
        .rejects.toThrow('Ratchet not initialized for peer: uninitialized-peer')
    })

    it('should handle decryption errors gracefully', async () => {
      const encrypted = await cryptoManager.encryptMessage(peerId, testMessage)
      
      // Mock decryption to fail
      ;(global.crypto.subtle.decrypt as jest.Mock).mockRejectedValue(new Error('Decryption failed'))

      await expect(cryptoManager.decryptMessage(peerId, encrypted))
        .rejects.toThrow('Message decryption failed')
    })
  })

  describe('Key Exchange', () => {
    it('should generate pre-key bundle (requirement 4.2)', async () => {
      const bundle = await cryptoManager.generatePreKeyBundle()

      expect(bundle).toBeDefined()
      expect(bundle.identityKey).toBeInstanceOf(Uint8Array)
      expect(bundle.signedPreKey).toBeInstanceOf(Uint8Array)
      expect(bundle.signedPreKeySignature).toBeInstanceOf(Uint8Array)
      expect(bundle.oneTimePreKey).toBeInstanceOf(Uint8Array)
      expect(bundle.timestamp).toBeGreaterThan(0)

      // Verify signature was created
      expect(global.crypto.subtle.sign).toHaveBeenCalled()
    })

    it('should initiate key exchange (requirement 4.3)', async () => {
      const peerId = 'test-peer-456'
      const mockBundle: KeyExchangeBundle = {
        identityKey: new Uint8Array(32),
        signedPreKey: new Uint8Array(32),
        signedPreKeySignature: new Uint8Array(64),
        oneTimePreKey: new Uint8Array(32),
        timestamp: Date.now()
      }

      // Fill with valid data
      crypto.getRandomValues(mockBundle.identityKey)
      crypto.getRandomValues(mockBundle.signedPreKey)
      crypto.getRandomValues(mockBundle.signedPreKeySignature)
      crypto.getRandomValues(mockBundle.oneTimePreKey!)

      // Mock signature verification to succeed
      ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValue(true)

      // For this test, we'll mock the X25519 operations by creating a simpler version
      // that doesn't use the noble curves library
      const originalInitializeRatchet = cryptoManager.initializeRatchet
      cryptoManager.initializeRatchet = jest.fn().mockResolvedValue(undefined)

      const ephemeralPublicKey = await cryptoManager.initiateKeyExchange(peerId, mockBundle)

      expect(ephemeralPublicKey).toBeInstanceOf(Uint8Array)
      expect(ephemeralPublicKey.length).toBe(32)
      expect(global.crypto.subtle.verify).toHaveBeenCalled()
      expect(cryptoManager.initializeRatchet).toHaveBeenCalled()
      
      // Restore original method
      cryptoManager.initializeRatchet = originalInitializeRatchet
    })

    it('should reject invalid signed pre-key signature', async () => {
      const peerId = 'test-peer-456'
      const mockBundle: KeyExchangeBundle = {
        identityKey: new Uint8Array(32),
        signedPreKey: new Uint8Array(32),
        signedPreKeySignature: new Uint8Array(64),
        oneTimePreKey: new Uint8Array(32),
        timestamp: Date.now()
      }

      // Mock signature verification to fail
      ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValue(false)

      await expect(cryptoManager.initiateKeyExchange(peerId, mockBundle))
        .rejects.toThrow('Invalid signed pre-key signature')
    })

    it('should require initialized identity for key exchange', async () => {
      const newCryptoManager = new CryptoManager()
      const mockBundle: KeyExchangeBundle = {
        identityKey: new Uint8Array(32),
        signedPreKey: new Uint8Array(32),
        signedPreKeySignature: new Uint8Array(64),
        timestamp: Date.now()
      }

      await expect(newCryptoManager.generatePreKeyBundle())
        .rejects.toThrow('Identity not initialized - cannot generate pre-key bundle')

      await expect(newCryptoManager.initiateKeyExchange('peer', mockBundle))
        .rejects.toThrow('Identity not initialized - cannot initiate key exchange')
    })
  })

  describe('End-to-End Encryption Flow', () => {
    it('should complete full encryption/decryption cycle (requirements 4.1, 4.4, 4.5)', async () => {
      const peerId = 'e2e-test-peer'
      const originalMessage = 'This is an end-to-end encrypted message!'

      // Initialize ratchet
      await cryptoManager.initializeRatchet(peerId, mockKeyPair.publicKey)

      // Encrypt message
      const encrypted = await cryptoManager.encryptMessage(peerId, originalMessage)
      expect(encrypted.ciphertext.byteLength).toBeGreaterThan(0)

      // Mock successful decryption with original message
      ;(global.crypto.subtle.decrypt as jest.Mock).mockResolvedValue(
        new TextEncoder().encode(originalMessage).buffer
      )

      // Decrypt message
      const decrypted = await cryptoManager.decryptMessage(peerId, encrypted)
      expect(decrypted).toBe(originalMessage)
    })

    it('should handle multiple messages in sequence', async () => {
      const peerId = 'sequence-test-peer'
      const messages = ['Message 1', 'Message 2', 'Message 3']

      await cryptoManager.initializeRatchet(peerId, mockKeyPair.publicKey)

      // Encrypt all messages
      const encryptedMessages = []
      for (const message of messages) {
        const encrypted = await cryptoManager.encryptMessage(peerId, message)
        encryptedMessages.push(encrypted)
      }

      // Verify message numbers increment
      for (let i = 1; i < encryptedMessages.length; i++) {
        expect(encryptedMessages[i].header.messageNumber)
          .toBe(encryptedMessages[i-1].header.messageNumber + 1)
      }

      // Mock decryption for each message
      for (let i = 0; i < messages.length; i++) {
        ;(global.crypto.subtle.decrypt as jest.Mock).mockResolvedValueOnce(
          new TextEncoder().encode(messages[i]).buffer
        )
        
        const decrypted = await cryptoManager.decryptMessage(peerId, encryptedMessages[i])
        expect(decrypted).toBe(messages[i])
      }
    })
  })
})

describe('CryptoManager - Data Persistence', () => {
  let cryptoManager: CryptoManager

  beforeEach(() => {
    cryptoManager = new CryptoManager()
  })

  it('should save and load reputation data', async () => {
    const identity = await cryptoManager.generateIdentity()
    const targetDID = 'did:key:zTarget123'
    
    await cryptoManager.addReputationFeedback(targetDID, 4)

    // Verify data was saved
    expect(global.localStorage.setItem).toHaveBeenCalledWith(
      'p2p-reputation',
      expect.stringContaining(targetDID)
    )

    // Create new instance and load data
    const newCryptoManager = new CryptoManager()
    const mockReputationData = JSON.stringify([{
      did: targetDID,
      score: 80,
      interactions: 1,
      lastUpdated: new Date().toISOString(),
      feedbacks: [{
        from: identity.did,
        rating: 4,
        timestamp: new Date().toISOString(),
        signature: '0123456789abcdef'
      }]
    }])

    ;(global.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'p2p-reputation') return mockReputationData
      if (key === 'p2p-identity') return JSON.stringify({
        did: identity.did,
        publicKey: [1, 2, 3, 4],
        privateKey: [5, 6, 7, 8]
      })
      return null
    })

    // Mock generateDID for the new instance
    const cryptoManagerSpy = jest.spyOn(CryptoManager.prototype as any, 'generateDID')
    cryptoManagerSpy.mockResolvedValue(identity.did)

    await newCryptoManager.loadIdentity()
    const reputation = newCryptoManager.getReputationScore(targetDID)
    
    cryptoManagerSpy.mockRestore()

    expect(reputation).toBeDefined()
    expect(reputation!.score).toBe(80)
    expect(reputation!.interactions).toBe(1)
  })

  it('should clear all data including ratchet states', async () => {
    const identity = await cryptoManager.generateIdentity()
    const peerId = 'test-peer'
    
    // Initialize some data
    await cryptoManager.initializeRatchet(peerId, mockKeyPair.publicKey)
    await cryptoManager.addReputationFeedback('did:key:zTest123', 5)

    // Clear all data
    await cryptoManager.clearAllData()

    expect(cryptoManager.hasIdentity()).toBe(false)
    expect(cryptoManager.getReputationScore('did:key:zTest123')).toBeNull()
    
    // Verify localStorage was cleared
    expect(global.localStorage.removeItem).toHaveBeenCalledWith('p2p-identity')
    expect(global.localStorage.removeItem).toHaveBeenCalledWith('p2p-reputation')
  })
})