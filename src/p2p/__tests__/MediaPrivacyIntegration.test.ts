import { PhotoSharingManager } from '../PhotoSharingManager'
import { MediaStorageManager } from '../MediaStorageManager'
import { MediaPrivacyManager, MediaAccessLevel, MatchStatus } from '../MediaPrivacyManager'

// Mock file for testing
const createMockFile = (name: string, size: number = 1024, type: string = 'image/jpeg'): File => {
  const buffer = new ArrayBuffer(size)
  const blob = new Blob([buffer], { type })
  return new File([blob], name, { type, lastModified: Date.now() })
}

describe('Media Privacy Integration', () => {
  let photoManager: PhotoSharingManager
  let mediaStorage: MediaStorageManager
  let mediaPrivacy: MediaPrivacyManager
  let mockCryptoManager: any

  beforeEach(async () => {
    // Mock crypto manager
    mockCryptoManager = {
      signData: jest.fn().mockResolvedValue('mock-signature'),
      verifySignature: jest.fn().mockResolvedValue(true)
    }

    // Initialize managers
    mediaStorage = new MediaStorageManager()
    mediaPrivacy = new MediaPrivacyManager()
    photoManager = new PhotoSharingManager(mediaStorage, mediaPrivacy, mockCryptoManager)

    // Mock WebTorrent and IPFS to avoid actual network calls
    jest.spyOn(mediaStorage as any, 'uploadToWebTorrent').mockResolvedValue(undefined)
    jest.spyOn(mediaStorage as any, 'uploadToIPFS').mockResolvedValue(undefined)
    jest.spyOn(mediaStorage as any, 'uploadToCDN').mockResolvedValue(undefined)

    await photoManager.initialize()
  })

  afterEach(async () => {
    await photoManager.destroy()
    jest.restoreAllMocks()
  })

  describe('Photo Upload with Privacy Controls', () => {
    test('should upload photo with privacy settings', async () => {
      const file = createMockFile('test-photo.jpg', 2048)
      const uploaderId = 'user123'

      const photoReference = await photoManager.uploadPhotoWithPrivacy(
        file,
        uploaderId,
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.MATCHES_ONLY,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
      )

      expect(photoReference).toBeDefined()
      expect(photoReference.metadata.uploadedBy).toBe(uploaderId)

      // Check that privacy rules were set
      const accessRule = mediaPrivacy.getMediaAccessRule(photoReference.id)
      expect(accessRule).toBeDefined()
      expect(accessRule!.accessLevel).toBe(MediaAccessLevel.MATCHES_ONLY)

      const expirationRule = mediaPrivacy.getMediaExpirationRule(photoReference.id)
      expect(expirationRule).toBeDefined()
      expect(expirationRule!.expiresAt).toBeInstanceOf(Date)
    })

    test('should upload photo with selective access', async () => {
      const file = createMockFile('selective-photo.jpg')
      const uploaderId = 'user123'
      const allowedUsers = ['user456', 'user789']

      const photoReference = await photoManager.uploadPhotoWithPrivacy(
        file,
        uploaderId,
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.SELECTIVE,
          allowedUsers,
          matchStatusRequired: MatchStatus.MATCHED
        }
      )

      const accessRule = mediaPrivacy.getMediaAccessRule(photoReference.id)
      expect(accessRule!.accessLevel).toBe(MediaAccessLevel.SELECTIVE)
      expect(accessRule!.allowedUsers).toEqual(allowedUsers)
      expect(accessRule!.matchStatusRequired).toBe(MatchStatus.MATCHED)
    })
  })

  describe('Photo Access Control', () => {
    let photoReference: any

    beforeEach(async () => {
      const file = createMockFile('access-test-photo.jpg')
      photoReference = await photoManager.uploadPhotoWithPrivacy(
        file,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.MATCHES_ONLY
        }
      )
    })

    test('should grant access to matched users', async () => {
      const requesterId = 'requester456'
      const accessResponse = await photoManager.requestPhotoAccess(
        photoReference.id,
        requesterId,
        MatchStatus.MATCHED
      )

      expect(accessResponse.granted).toBe(true)
      expect(accessResponse.accessToken).toBeDefined()
    })

    test('should deny access to non-matched users', async () => {
      const requesterId = 'requester456'
      const accessResponse = await photoManager.requestPhotoAccess(
        photoReference.id,
        requesterId,
        MatchStatus.LIKED
      )

      expect(accessResponse.granted).toBe(false)
      expect(accessResponse.reason).toBe('Access requires mutual match')
    })

    test('should download photo with valid access', async () => {
      const requesterId = 'requester456'
      
      // Mock the download method to return a blob
      const mockBlob = new Blob(['mock-image-data'], { type: 'image/jpeg' })
      jest.spyOn(photoManager as any, 'downloadPhoto').mockResolvedValue(mockBlob)

      const blob = await photoManager.downloadPhotoWithAccess(
        photoReference,
        requesterId,
        MatchStatus.MATCHED
      )

      expect(blob).toBeDefined()
      expect(blob.type).toBe('image/jpeg')
    })

    test('should fail to download photo without access', async () => {
      const requesterId = 'requester456'

      await expect(
        photoManager.downloadPhotoWithAccess(
          photoReference,
          requesterId,
          MatchStatus.LIKED
        )
      ).rejects.toThrow('Access denied')
    })

    test('should download photo with valid access token', async () => {
      const requesterId = 'requester456'
      
      // Get access token
      const accessResponse = await photoManager.requestPhotoAccess(
        photoReference.id,
        requesterId,
        MatchStatus.MATCHED
      )

      expect(accessResponse.granted).toBe(true)
      expect(accessResponse.accessToken).toBeDefined()

      // Mock the download method
      const mockBlob = new Blob(['mock-image-data'], { type: 'image/jpeg' })
      jest.spyOn(photoManager as any, 'downloadPhoto').mockResolvedValue(mockBlob)

      const blob = await photoManager.downloadPhotoWithToken(
        photoReference,
        accessResponse.accessToken!,
        requesterId
      )

      expect(blob).toBeDefined()
    })
  })

  describe('Photo Expiration', () => {
    test('should handle photo expiration', async () => {
      const file = createMockFile('expiring-photo.jpg')
      const expiresAt = new Date(Date.now() + 1000) // Expires in 1 second

      const photoReference = await photoManager.uploadPhotoWithPrivacy(
        file,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.PUBLIC,
          expiresAt
        }
      )

      // Should have access before expiration
      const beforeExpiry = await photoManager.requestPhotoAccess(
        photoReference.id,
        'any-user',
        MatchStatus.NO_INTERACTION
      )
      expect(beforeExpiry.granted).toBe(true)

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should not have access after expiration
      const afterExpiry = await photoManager.requestPhotoAccess(
        photoReference.id,
        'any-user',
        MatchStatus.NO_INTERACTION
      )
      expect(afterExpiry.granted).toBe(false)
      expect(afterExpiry.reason).toBe('Media has expired')
    })

    test('should cleanup expired photos', async () => {
      const file = createMockFile('cleanup-photo.jpg')
      const expiresAt = new Date(Date.now() - 1000) // Already expired

      const photoReference = await photoManager.uploadPhotoWithPrivacy(
        file,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.PUBLIC,
          expiresAt
        }
      )

      // Photo should exist initially
      expect(photoManager.getPhoto(photoReference.id)).toBeDefined()

      // Cleanup expired photos
      const expiredIds = await photoManager.cleanupExpiredPhotos()
      expect(expiredIds).toContain(photoReference.id)

      // Photo should be removed
      expect(photoManager.getPhoto(photoReference.id)).toBeUndefined()
    })
  })

  describe('Access Management', () => {
    let photoReference: any

    beforeEach(async () => {
      const file = createMockFile('management-test-photo.jpg')
      photoReference = await photoManager.uploadPhotoWithPrivacy(
        file,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.SELECTIVE,
          allowedUsers: ['user456', 'user789']
        }
      )
    })

    test('should revoke access for specific users', async () => {
      const userId = 'user456'

      // Initially should have access
      const initialAccess = await photoManager.requestPhotoAccess(
        photoReference.id,
        userId,
        MatchStatus.NO_INTERACTION
      )
      expect(initialAccess.granted).toBe(true)

      // Revoke access
      await photoManager.revokePhotoAccess(photoReference.id, userId)

      // Should no longer have access
      const revokedAccess = await photoManager.requestPhotoAccess(
        photoReference.id,
        userId,
        MatchStatus.NO_INTERACTION
      )
      expect(revokedAccess.granted).toBe(false)
    })

    test('should get accessible photos by match status', async () => {
      // Upload photos with different access levels
      const publicFile = createMockFile('public-photo.jpg')
      const publicPhoto = await photoManager.uploadPhotoWithPrivacy(
        publicFile,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        { accessLevel: MediaAccessLevel.PUBLIC }
      )

      const matchFile = createMockFile('match-photo.jpg')
      const matchPhoto = await photoManager.uploadPhotoWithPrivacy(
        matchFile,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        { accessLevel: MediaAccessLevel.MATCHES_ONLY }
      )

      // Test for matched user
      const matchedPhotos = photoManager.getAccessiblePhotos('user456', MatchStatus.MATCHED)
      expect(matchedPhotos.map(p => p.id)).toContain(publicPhoto.id)
      expect(matchedPhotos.map(p => p.id)).toContain(matchPhoto.id)
      expect(matchedPhotos.map(p => p.id)).toContain(photoReference.id) // selective

      // Test for non-matched user
      const nonMatchedPhotos = photoManager.getAccessiblePhotos('user999', MatchStatus.LIKED)
      expect(nonMatchedPhotos.map(p => p.id)).toContain(publicPhoto.id)
      expect(nonMatchedPhotos.map(p => p.id)).not.toContain(matchPhoto.id)
      expect(nonMatchedPhotos.map(p => p.id)).not.toContain(photoReference.id)
    })
  })

  describe('Advanced Privacy Features', () => {
    test('should handle match-based access control', async () => {
      const file = createMockFile('match-based-photo.jpg')
      const photoReference = await photoManager.uploadPhotoWithPrivacy(
        file,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.SELECTIVE,
          allowedUsers: ['user456']
        }
      )

      // Set match-based access
      await mediaPrivacy.setMatchBasedAccess(photoReference.id, {
        [MatchStatus.NO_INTERACTION]: MediaAccessLevel.PRIVATE,
        [MatchStatus.LIKED]: MediaAccessLevel.SELECTIVE,
        [MatchStatus.MATCHED]: MediaAccessLevel.PUBLIC,
        [MatchStatus.BLOCKED]: MediaAccessLevel.PRIVATE
      })

      // Test effective access levels
      expect(mediaPrivacy.getEffectiveAccessLevel(photoReference.id, MatchStatus.NO_INTERACTION))
        .toBe(MediaAccessLevel.PRIVATE)
      expect(mediaPrivacy.getEffectiveAccessLevel(photoReference.id, MatchStatus.LIKED))
        .toBe(MediaAccessLevel.SELECTIVE)
      expect(mediaPrivacy.getEffectiveAccessLevel(photoReference.id, MatchStatus.MATCHED))
        .toBe(MediaAccessLevel.PUBLIC)
      expect(mediaPrivacy.getEffectiveAccessLevel(photoReference.id, MatchStatus.BLOCKED))
        .toBe(MediaAccessLevel.PRIVATE)
    })

    test('should handle temporary access tokens', async () => {
      const file = createMockFile('temp-access-photo.jpg')
      const photoReference = await photoManager.uploadPhotoWithPrivacy(
        file,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.PRIVATE
        }
      )

      const requesterId = 'temp-user'

      // Normal access should be denied
      const normalAccess = await photoManager.requestPhotoAccess(
        photoReference.id,
        requesterId,
        MatchStatus.MATCHED
      )
      expect(normalAccess.granted).toBe(false)

      // Create temporary access
      const tempAccess = await mediaPrivacy.createTemporaryAccess(
        photoReference.id,
        requesterId,
        1, // 1 hour
        2  // 2 uses
      )

      expect(tempAccess.accessToken).toBeDefined()
      expect(tempAccess.usesRemaining).toBe(2)

      // Use temporary access
      const firstUse = await mediaPrivacy.useTemporaryAccess(tempAccess.accessToken)
      expect(firstUse).toBe(true)

      // Validate token
      const isValid = await mediaPrivacy.validateAccessToken(
        tempAccess.accessToken,
        photoReference.id,
        requesterId
      )
      expect(isValid).toBe(true)

      // Use second time
      const secondUse = await mediaPrivacy.useTemporaryAccess(tempAccess.accessToken)
      expect(secondUse).toBe(true)

      // Third use should fail
      const thirdUse = await mediaPrivacy.useTemporaryAccess(tempAccess.accessToken)
      expect(thirdUse).toBe(false)
    })

    test('should handle batch operations', async () => {
      const files = [
        createMockFile('batch1.jpg'),
        createMockFile('batch2.jpg'),
        createMockFile('batch3.jpg')
      ]

      const photoReferences = []
      for (const file of files) {
        const photo = await photoManager.uploadPhotoWithPrivacy(
          file,
          'owner123',
          {
            enableP2P: true,
            enableIPFS: false,
            enableCDN: true,
            generateThumbnail: true,
            stripExif: true,
            maxDimensions: { width: 1024, height: 1024 },
            compressionQuality: 0.8,
            requireVerification: true
          },
          {
            accessLevel: MediaAccessLevel.PUBLIC
          }
        )
        photoReferences.push(photo)
      }

      const mediaIds = photoReferences.map(p => p.id)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

      // Batch update access
      await mediaPrivacy.bulkUpdateAccess(mediaIds, MediaAccessLevel.MATCHES_ONLY, {
        matchStatusRequired: MatchStatus.MATCHED
      })

      // Batch set expiration
      await mediaPrivacy.batchSetExpiration(mediaIds, expiresAt, {
        autoDelete: true,
        notifyBeforeExpiry: true,
        notifyHours: 12
      })

      // Verify changes
      for (const mediaId of mediaIds) {
        const accessRule = mediaPrivacy.getMediaAccessRule(mediaId)
        const expirationRule = mediaPrivacy.getMediaExpirationRule(mediaId)

        expect(accessRule?.accessLevel).toBe(MediaAccessLevel.MATCHES_ONLY)
        expect(accessRule?.matchStatusRequired).toBe(MatchStatus.MATCHED)
        expect(expirationRule?.expiresAt).toEqual(expiresAt)
        expect(expirationRule?.autoDelete).toBe(true)
        expect(expirationRule?.notifyHours).toBe(12)
      }
    })

    test('should get expiring photos', async () => {
      const nearFile = createMockFile('expiring-near.jpg')
      const farFile = createMockFile('expiring-far.jpg')

      const nearExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours
      const farExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours

      const nearPhoto = await photoManager.uploadPhotoWithPrivacy(
        nearFile,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.PUBLIC,
          expiresAt: nearExpiry
        }
      )

      const farPhoto = await photoManager.uploadPhotoWithPrivacy(
        farFile,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.PUBLIC,
          expiresAt: farExpiry
        }
      )

      // Get photos expiring within 24 hours
      const expiringPhotos = photoManager.getExpiringPhotos(24)
      expect(expiringPhotos.map(p => p.id)).toContain(nearPhoto.id)
      expect(expiringPhotos.map(p => p.id)).not.toContain(farPhoto.id)

      // Get photos expiring within 72 hours
      const allExpiringPhotos = photoManager.getExpiringPhotos(72)
      expect(allExpiringPhotos.map(p => p.id)).toContain(nearPhoto.id)
      expect(allExpiringPhotos.map(p => p.id)).toContain(farPhoto.id)
    })
  })

  describe('Privacy Statistics', () => {
    test('should generate privacy statistics', async () => {
      // Upload photos with different privacy settings
      const files = [
        createMockFile('public1.jpg'),
        createMockFile('public2.jpg'),
        createMockFile('match1.jpg'),
        createMockFile('private1.jpg'),
        createMockFile('selective1.jpg')
      ]

      const accessLevels = [
        MediaAccessLevel.PUBLIC,
        MediaAccessLevel.PUBLIC,
        MediaAccessLevel.MATCHES_ONLY,
        MediaAccessLevel.PRIVATE,
        MediaAccessLevel.SELECTIVE
      ]

      for (let i = 0; i < files.length; i++) {
        await photoManager.uploadPhotoWithPrivacy(
          files[i],
          'owner123',
          {
            enableP2P: true,
            enableIPFS: false,
            enableCDN: true,
            generateThumbnail: true,
            stripExif: true,
            maxDimensions: { width: 1024, height: 1024 },
            compressionQuality: 0.8,
            requireVerification: true
          },
          {
            accessLevel: accessLevels[i],
            allowedUsers: accessLevels[i] === MediaAccessLevel.SELECTIVE ? ['user456'] : undefined
          }
        )
      }

      const stats = photoManager.getPrivacyStats()
      expect(stats.totalMediaFiles).toBe(5)
      expect(stats.publicMedia).toBe(2)
      expect(stats.matchOnlyMedia).toBe(1)
      expect(stats.privateMedia).toBe(1)
      expect(stats.selectiveMedia).toBe(1)
    })

    test('should track access requests and responses', async () => {
      const file = createMockFile('stats-photo.jpg')
      const photoReference = await photoManager.uploadPhotoWithPrivacy(
        file,
        'owner123',
        {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: true,
          stripExif: true,
          maxDimensions: { width: 1024, height: 1024 },
          compressionQuality: 0.8,
          requireVerification: true
        },
        {
          accessLevel: MediaAccessLevel.MATCHES_ONLY
        }
      )

      // Generate some access requests
      await photoManager.requestPhotoAccess(photoReference.id, 'user1', MatchStatus.MATCHED) // Should be granted
      await photoManager.requestPhotoAccess(photoReference.id, 'user2', MatchStatus.LIKED)   // Should be denied
      await photoManager.requestPhotoAccess(photoReference.id, 'user3', MatchStatus.MATCHED) // Should be granted

      const accessLog = mediaPrivacy.getMediaAccessLog(photoReference.id)
      expect(accessLog).toHaveLength(3)
      expect(accessLog[0].requesterId).toBe('user1')
      expect(accessLog[1].requesterId).toBe('user2')
      expect(accessLog[2].requesterId).toBe('user3')
    })
  })
})