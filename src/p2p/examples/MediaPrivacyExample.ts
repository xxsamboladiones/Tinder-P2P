/**
 * Media Privacy Controls Example
 * 
 * This example demonstrates comprehensive media privacy controls including:
 * - Access control for shared media
 * - Media expiration and deletion
 * - Selective media sharing based on match status
 * - Temporary access tokens
 * - Batch operations
 */

import { PhotoSharingManager } from '../PhotoSharingManager'
import { MediaStorageManager } from '../MediaStorageManager'
import { MediaPrivacyManager, MediaAccessLevel, MatchStatus } from '../MediaPrivacyManager'

// Mock crypto manager for this example
const mockCryptoManager = {
  signData: async (data: string): Promise<string> => {
    return `signature_${Buffer.from(data).toString('base64').slice(0, 16)}`
  },
  verifySignature: async (data: string, signature: string, publicKey: string): Promise<boolean> => {
    const expectedSignature = await mockCryptoManager.signData(data)
    return signature === expectedSignature
  }
}

// Create mock file for testing
const createMockFile = (name: string, size: number = 2048, type: string = 'image/jpeg'): File => {
  const buffer = new ArrayBuffer(size)
  const view = new Uint8Array(buffer)
  
  // Fill with some mock image data
  for (let i = 0; i < size; i++) {
    view[i] = Math.floor(Math.random() * 256)
  }
  
  const blob = new Blob([buffer], { type })
  return new File([blob], name, { type, lastModified: Date.now() })
}

export class MediaPrivacyExample {
  private photoManager: PhotoSharingManager
  private mediaStorage: MediaStorageManager
  private mediaPrivacy: MediaPrivacyManager

  constructor() {
    this.mediaStorage = new MediaStorageManager()
    this.mediaPrivacy = new MediaPrivacyManager()
    this.photoManager = new PhotoSharingManager(
      this.mediaStorage, 
      this.mediaPrivacy, 
      mockCryptoManager
    )
  }

  async initialize(): Promise<void> {
    console.log('🔐 Initializing Media Privacy Example...')
    
    // Mock network operations to avoid actual uploads
    this.mockNetworkOperations()
    
    await this.photoManager.initialize()
    console.log('✅ Media Privacy system initialized')
  }

  /**
   * Demonstrate basic access control for shared media
   */
  async demonstrateAccessControl(): Promise<void> {
    console.log('\n📋 === Access Control Demo ===')
    
    const userId = 'user_alice'
    const requesterId = 'user_bob'
    
    // Upload photo with different access levels
    const publicFile = createMockFile('public_photo.jpg')
    const publicPhoto = await this.photoManager.uploadPhotoWithPrivacy(
      publicFile,
      userId,
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
    console.log(`📸 Uploaded public photo: ${publicPhoto.id}`)

    // Upload matches-only photo
    const matchFile = createMockFile('match_photo.jpg')
    const matchPhoto = await this.photoManager.uploadPhotoWithPrivacy(
      matchFile,
      userId,
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
    console.log(`💕 Uploaded matches-only photo: ${matchPhoto.id}`)

    // Upload selective access photo
    const selectiveFile = createMockFile('selective_photo.jpg')
    const selectivePhoto = await this.photoManager.uploadPhotoWithPrivacy(
      selectiveFile,
      userId,
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
        allowedUsers: [requesterId],
        matchStatusRequired: MatchStatus.MATCHED
      }
    )
    console.log(`🎯 Uploaded selective photo: ${selectivePhoto.id}`)

    // Test access with different match statuses
    console.log('\n🔍 Testing access with different match statuses:')
    
    // Test public access (should always work)
    const publicAccess = await this.photoManager.requestPhotoAccess(
      publicPhoto.id,
      requesterId,
      MatchStatus.NO_INTERACTION
    )
    console.log(`  Public photo access: ${publicAccess.granted ? '✅ GRANTED' : '❌ DENIED'} - ${publicAccess.reason}`)

    // Test matches-only with no match (should fail)
    const matchNoAccess = await this.photoManager.requestPhotoAccess(
      matchPhoto.id,
      requesterId,
      MatchStatus.LIKED
    )
    console.log(`  Match photo (liked): ${matchNoAccess.granted ? '✅ GRANTED' : '❌ DENIED'} - ${matchNoAccess.reason}`)

    // Test matches-only with match (should succeed)
    const matchAccess = await this.photoManager.requestPhotoAccess(
      matchPhoto.id,
      requesterId,
      MatchStatus.MATCHED
    )
    console.log(`  Match photo (matched): ${matchAccess.granted ? '✅ GRANTED' : '❌ DENIED'} - ${matchAccess.reason}`)

    // Test selective access without required match status (should fail)
    const selectiveNoMatch = await this.photoManager.requestPhotoAccess(
      selectivePhoto.id,
      requesterId,
      MatchStatus.LIKED
    )
    console.log(`  Selective photo (liked): ${selectiveNoMatch.granted ? '✅ GRANTED' : '❌ DENIED'} - ${selectiveNoMatch.reason}`)

    // Test selective access with required match status (should succeed)
    const selectiveMatch = await this.photoManager.requestPhotoAccess(
      selectivePhoto.id,
      requesterId,
      MatchStatus.MATCHED
    )
    console.log(`  Selective photo (matched): ${selectiveMatch.granted ? '✅ GRANTED' : '❌ DENIED'} - ${selectiveMatch.reason}`)

    return { publicPhoto, matchPhoto, selectivePhoto }
  }

  /**
   * Demonstrate media expiration and deletion
   */
  async demonstrateExpiration(): Promise<void> {
    console.log('\n⏰ === Media Expiration Demo ===')
    
    const userId = 'user_charlie'
    
    // Upload photo with short expiration
    const shortExpiryFile = createMockFile('short_expiry.jpg')
    const shortExpiryPhoto = await this.photoManager.uploadPhotoWithPrivacy(
      shortExpiryFile,
      userId,
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
        expiresAt: new Date(Date.now() + 2000) // Expires in 2 seconds
      }
    )
    console.log(`📸 Uploaded photo with 2-second expiration: ${shortExpiryPhoto.id}`)

    // Upload photo with longer expiration
    const longExpiryFile = createMockFile('long_expiry.jpg')
    const longExpiryPhoto = await this.photoManager.uploadPhotoWithPrivacy(
      longExpiryFile,
      userId,
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
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expires in 24 hours
      }
    )
    console.log(`📸 Uploaded photo with 24-hour expiration: ${longExpiryPhoto.id}`)

    // Test access before expiration
    const beforeExpiry = await this.photoManager.requestPhotoAccess(
      shortExpiryPhoto.id,
      'any_user',
      MatchStatus.NO_INTERACTION
    )
    console.log(`  Access before expiry: ${beforeExpiry.granted ? '✅ GRANTED' : '❌ DENIED'}`)

    // Wait for expiration
    console.log('  ⏳ Waiting for expiration...')
    await new Promise(resolve => setTimeout(resolve, 2500))

    // Test access after expiration
    const afterExpiry = await this.photoManager.requestPhotoAccess(
      shortExpiryPhoto.id,
      'any_user',
      MatchStatus.NO_INTERACTION
    )
    console.log(`  Access after expiry: ${afterExpiry.granted ? '✅ GRANTED' : '❌ DENIED'} - ${afterExpiry.reason}`)

    // Demonstrate expiration extension
    console.log('\n🔄 Extending expiration for long-expiry photo...')
    await this.photoManager.setPhotoExpiration(
      longExpiryPhoto.id,
      new Date(Date.now() + 48 * 60 * 60 * 1000), // Extend to 48 hours
      {
        autoDelete: true,
        notifyBeforeExpiry: true,
        notifyHours: 12
      }
    )
    console.log('  ✅ Expiration extended to 48 hours')

    // Get expiring photos
    const expiringPhotos = this.photoManager.getExpiringPhotos(25) // Within 25 hours
    console.log(`  📋 Photos expiring within 25 hours: ${expiringPhotos.length}`)

    // Cleanup expired photos
    const expiredIds = await this.photoManager.cleanupExpiredPhotos()
    console.log(`  🗑️ Cleaned up ${expiredIds.length} expired photos: ${expiredIds.join(', ')}`)
  }

  /**
   * Demonstrate selective media sharing based on match status
   */
  async demonstrateSelectiveSharing(): Promise<void> {
    console.log('\n🎯 === Selective Sharing Demo ===')
    
    const ownerId = 'user_diana'
    const users = ['user_eve', 'user_frank', 'user_grace']
    
    // Upload photos with different selective access rules
    const profileFile = createMockFile('profile_pic.jpg')
    const profilePhoto = await this.photoManager.uploadPhotoWithPrivacy(
      profileFile,
      ownerId,
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
        allowedUsers: [users[0], users[1]], // Only eve and frank
        matchStatusRequired: MatchStatus.LIKED
      }
    )
    console.log(`📸 Uploaded selective profile photo: ${profilePhoto.id}`)

    const intimateFile = createMockFile('intimate_pic.jpg')
    const intimatePhoto = await this.photoManager.uploadPhotoWithPrivacy(
      intimateFile,
      ownerId,
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
        allowedUsers: [users[0]], // Only eve
        matchStatusRequired: MatchStatus.MATCHED
      }
    )
    console.log(`💕 Uploaded intimate photo: ${intimatePhoto.id}`)

    // Test access for different users and match statuses
    console.log('\n🔍 Testing selective access:')
    
    for (const user of users) {
      console.log(`\n  User: ${user}`)
      
      // Test profile photo access (requires LIKED status)
      const profileLiked = await this.photoManager.requestPhotoAccess(
        profilePhoto.id,
        user,
        MatchStatus.LIKED
      )
      console.log(`    Profile (liked): ${profileLiked.granted ? '✅ GRANTED' : '❌ DENIED'} - ${profileLiked.reason}`)

      const profileMatched = await this.photoManager.requestPhotoAccess(
        profilePhoto.id,
        user,
        MatchStatus.MATCHED
      )
      console.log(`    Profile (matched): ${profileMatched.granted ? '✅ GRANTED' : '❌ DENIED'} - ${profileMatched.reason}`)

      // Test intimate photo access (requires MATCHED status)
      const intimateMatched = await this.photoManager.requestPhotoAccess(
        intimatePhoto.id,
        user,
        MatchStatus.MATCHED
      )
      console.log(`    Intimate (matched): ${intimateMatched.granted ? '✅ GRANTED' : '❌ DENIED'} - ${intimateMatched.reason}`)
    }

    // Demonstrate access revocation
    console.log('\n🚫 Revoking access for user_frank...')
    await this.photoManager.revokePhotoAccess(profilePhoto.id, users[1])
    
    const revokedAccess = await this.photoManager.requestPhotoAccess(
      profilePhoto.id,
      users[1],
      MatchStatus.LIKED
    )
    console.log(`  Frank's access after revocation: ${revokedAccess.granted ? '✅ GRANTED' : '❌ DENIED'} - ${revokedAccess.reason}`)

    // Get accessible photos for each user
    console.log('\n📋 Accessible photos by user:')
    for (const user of users) {
      const accessiblePhotos = this.photoManager.getAccessiblePhotos(user, MatchStatus.MATCHED)
      console.log(`  ${user}: ${accessiblePhotos.length} photos accessible`)
    }
  }

  /**
   * Demonstrate temporary access tokens
   */
  async demonstrateTemporaryAccess(): Promise<void> {
    console.log('\n🎫 === Temporary Access Demo ===')
    
    const ownerId = 'user_henry'
    const requesterId = 'user_iris'
    
    // Upload private photo
    const privateFile = createMockFile('private_photo.jpg')
    const privatePhoto = await this.photoManager.uploadPhotoWithPrivacy(
      privateFile,
      ownerId,
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
    console.log(`📸 Uploaded private photo: ${privatePhoto.id}`)

    // Normal access should be denied
    const normalAccess = await this.photoManager.requestPhotoAccess(
      privatePhoto.id,
      requesterId,
      MatchStatus.MATCHED
    )
    console.log(`  Normal access: ${normalAccess.granted ? '✅ GRANTED' : '❌ DENIED'} - ${normalAccess.reason}`)

    // Create temporary access
    console.log('\n🎫 Creating temporary access token...')
    const tempAccess = await this.mediaPrivacy.createTemporaryAccess(
      privatePhoto.id,
      requesterId,
      1, // Valid for 1 hour
      3  // Max 3 uses
    )
    console.log(`  ✅ Temporary access created: ${tempAccess.accessToken}`)
    console.log(`  📅 Expires at: ${tempAccess.expiresAt.toISOString()}`)
    console.log(`  🔢 Uses remaining: ${tempAccess.usesRemaining}`)

    // Use temporary access
    console.log('\n🔓 Using temporary access token...')
    for (let i = 1; i <= 4; i++) {
      const used = await this.mediaPrivacy.useTemporaryAccess(tempAccess.accessToken)
      console.log(`  Use ${i}: ${used ? '✅ SUCCESS' : '❌ FAILED'}`)
      
      if (used) {
        // Validate token and download
        const isValid = await this.mediaPrivacy.validateAccessToken(
          tempAccess.accessToken,
          privatePhoto.id,
          requesterId
        )
        console.log(`    Token validation: ${isValid ? '✅ VALID' : '❌ INVALID'}`)
      }
    }
  }

  /**
   * Demonstrate batch operations
   */
  async demonstrateBatchOperations(): Promise<void> {
    console.log('\n📦 === Batch Operations Demo ===')
    
    const ownerId = 'user_jack'
    const photoIds: string[] = []
    
    // Upload multiple photos
    console.log('📸 Uploading multiple photos...')
    for (let i = 1; i <= 5; i++) {
      const file = createMockFile(`batch_photo_${i}.jpg`)
      const photo = await this.photoManager.uploadPhotoWithPrivacy(
        file,
        ownerId,
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
      photoIds.push(photo.id)
      console.log(`  ✅ Uploaded: ${photo.id}`)
    }

    // Batch update access levels
    console.log('\n🔄 Batch updating access levels to MATCHES_ONLY...')
    await this.mediaPrivacy.bulkUpdateAccess(
      photoIds,
      MediaAccessLevel.MATCHES_ONLY,
      {
        matchStatusRequired: MatchStatus.MATCHED
      }
    )
    console.log('  ✅ Batch access update completed')

    // Batch set expiration
    console.log('\n⏰ Batch setting expiration to 7 days...')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await this.mediaPrivacy.batchSetExpiration(
      photoIds,
      expiresAt,
      {
        autoDelete: true,
        notifyBeforeExpiry: true,
        notifyHours: 24
      }
    )
    console.log('  ✅ Batch expiration set completed')

    // Verify changes
    console.log('\n🔍 Verifying batch changes:')
    for (const photoId of photoIds) {
      const accessRule = this.mediaPrivacy.getMediaAccessRule(photoId)
      const expirationRule = this.mediaPrivacy.getMediaExpirationRule(photoId)
      
      console.log(`  ${photoId}:`)
      console.log(`    Access Level: ${accessRule?.accessLevel}`)
      console.log(`    Match Required: ${accessRule?.matchStatusRequired}`)
      console.log(`    Expires: ${expirationRule?.expiresAt.toISOString()}`)
    }
  }

  /**
   * Demonstrate privacy statistics
   */
  async demonstratePrivacyStats(): Promise<void> {
    console.log('\n📊 === Privacy Statistics Demo ===')
    
    // Get overall privacy statistics
    const privacyStats = this.photoManager.getPrivacyStats()
    console.log('📈 Privacy Statistics:')
    console.log(`  Total Media Files: ${privacyStats.totalMediaFiles}`)
    console.log(`  Public Media: ${privacyStats.publicMedia}`)
    console.log(`  Match-Only Media: ${privacyStats.matchOnlyMedia}`)
    console.log(`  Private Media: ${privacyStats.privateMedia}`)
    console.log(`  Selective Media: ${privacyStats.selectiveMedia}`)
    console.log(`  Expired Media: ${privacyStats.expiredMedia}`)
    console.log(`  Access Requests: ${privacyStats.accessRequests}`)
    console.log(`  Granted Requests: ${privacyStats.grantedRequests}`)
    console.log(`  Denied Requests: ${privacyStats.deniedRequests}`)

    // Get photo sharing statistics
    const photoStats = this.photoManager.getStats()
    console.log('\n📸 Photo Sharing Statistics:')
    console.log(`  Total Photos: ${photoStats.totalPhotos}`)
    console.log(`  Verified Photos: ${photoStats.verifiedPhotos}`)
    console.log(`  Unverified Photos: ${photoStats.unverifiedPhotos}`)
    console.log(`  Total Size: ${(photoStats.totalSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`  Average Verification Score: ${photoStats.averageVerificationScore}`)
    console.log(`  Distribution Methods:`)
    console.log(`    P2P: ${photoStats.distributionMethods.p2p}`)
    console.log(`    IPFS: ${photoStats.distributionMethods.ipfs}`)
    console.log(`    CDN: ${photoStats.distributionMethods.cdn}`)

    // Get photos by access level
    console.log('\n🔐 Photos by Access Level:')
    const accessLevels = [
      MediaAccessLevel.PUBLIC,
      MediaAccessLevel.MATCHES_ONLY,
      MediaAccessLevel.PRIVATE,
      MediaAccessLevel.SELECTIVE
    ]
    
    for (const level of accessLevels) {
      const photos = this.photoManager.getPhotosByAccessLevel(level)
      console.log(`  ${level}: ${photos.length} photos`)
    }
  }

  /**
   * Run the complete media privacy demonstration
   */
  async runDemo(): Promise<void> {
    try {
      await this.initialize()
      
      await this.demonstrateAccessControl()
      await this.demonstrateExpiration()
      await this.demonstrateSelectiveSharing()
      await this.demonstrateTemporaryAccess()
      await this.demonstrateBatchOperations()
      await this.demonstratePrivacyStats()
      
      console.log('\n🎉 === Media Privacy Demo Completed Successfully! ===')
      
    } catch (error) {
      console.error('❌ Demo failed:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  private mockNetworkOperations(): void {
    // Mock WebTorrent operations
    jest.spyOn(this.mediaStorage as any, 'uploadToWebTorrent').mockImplementation(
      async (fileBuffer: ArrayBuffer, mediaFile: any) => {
        mediaFile.torrentMagnet = `magnet:?xt=urn:btih:${mediaFile.hash}&dn=${mediaFile.name}`
        await new Promise(resolve => setTimeout(resolve, 100)) // Simulate network delay
      }
    )

    // Mock IPFS operations
    jest.spyOn(this.mediaStorage as any, 'uploadToIPFS').mockImplementation(
      async (fileBuffer: ArrayBuffer, mediaFile: any) => {
        mediaFile.ipfsCid = `Qm${mediaFile.hash.slice(0, 44)}`
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    )

    // Mock CDN operations
    jest.spyOn(this.mediaStorage as any, 'uploadToCDN').mockImplementation(
      async (fileBuffer: ArrayBuffer, mediaFile: any) => {
        mediaFile.url = `https://cdn.example.com/files/${mediaFile.id}`
        await new Promise(resolve => setTimeout(resolve, 75))
      }
    )

    // Mock download operations
    jest.spyOn(this.photoManager as any, 'downloadPhoto').mockImplementation(
      async (photoReference: any) => {
        const mockData = new Uint8Array(photoReference.metadata.size)
        mockData.fill(42) // Fill with mock data
        return new Blob([mockData], { type: photoReference.metadata.format })
      }
    )
  }

  private async cleanup(): Promise<void> {
    await this.photoManager.destroy()
    jest.restoreAllMocks()
  }
}

// Export for use in tests and examples
export default MediaPrivacyExample

// Example usage
if (require.main === module) {
  const example = new MediaPrivacyExample()
  example.runDemo().catch(console.error)
}