import { PhotoSharingManager, PhotoUploadOptions, PhotoReference } from '../PhotoSharingManager'
import { MediaStorageManager } from '../MediaStorageManager'
import { CryptoManager } from '../CryptoManager'

/**
 * Example demonstrating comprehensive photo sharing functionality
 * including upload, download, verification, and management
 */
export class PhotoSharingExample {
  private photoManager: PhotoSharingManager
  private mediaStorage: MediaStorageManager
  private cryptoManager: CryptoManager

  constructor() {
    // Initialize dependencies
    this.cryptoManager = new CryptoManager()
    this.mediaStorage = new MediaStorageManager('https://cdn.example.com')
    this.photoManager = new PhotoSharingManager(this.mediaStorage, this.cryptoManager)

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Photo upload events
    this.photoManager.on('photoUploaded', (photo: PhotoReference) => {
      console.log('Photo uploaded successfully:', {
        id: photo.id,
        size: photo.metadata.size,
        verified: photo.metadata.isVerified,
        score: photo.metadata.verificationScore
      })
    })

    // Photo download events
    this.photoManager.on('photoDownloaded', (photoId: string) => {
      console.log('Photo downloaded successfully:', photoId)
    })

    // Photo deletion events
    this.photoManager.on('photoDeleted', (photoId: string) => {
      console.log('Photo deleted:', photoId)
    })

    // Error handling
    this.photoManager.on('error', (error: Error) => {
      console.error('Photo sharing error:', error)
    })
  }

  async initialize(): Promise<void> {
    console.log('Initializing photo sharing system...')
    
    try {
      await this.photoManager.initialize()
      console.log('Photo sharing system initialized successfully')
    } catch (error) {
      console.error('Failed to initialize photo sharing system:', error)
      throw error
    }
  }

  /**
   * Example: Upload a profile photo with high quality settings
   */
  async uploadProfilePhoto(file: File, userId: string): Promise<PhotoReference> {
    console.log('Uploading profile photo:', file.name)

    const options: PhotoUploadOptions = {
      enableP2P: true,
      enableIPFS: true,
      enableCDN: true,
      generateThumbnail: true,
      stripExif: true, // Remove metadata for privacy
      maxDimensions: { width: 1920, height: 1080 },
      compressionQuality: 0.85,
      requireVerification: true
    }

    try {
      const photoReference = await this.photoManager.uploadPhoto(file, userId, options)
      
      console.log('Profile photo uploaded:', {
        id: photoReference.id,
        distributionMethods: {
          p2p: !!photoReference.torrentMagnet,
          ipfs: !!photoReference.ipfsCid,
          cdn: !!photoReference.url
        },
        thumbnail: photoReference.thumbnail ? 'Generated' : 'None',
        verified: photoReference.metadata.isVerified
      })

      return photoReference
    } catch (error) {
      console.error('Failed to upload profile photo:', error)
      throw error
    }
  }

  /**
   * Example: Upload a casual photo with P2P-only distribution
   */
  async uploadCasualPhoto(file: File, userId: string): Promise<PhotoReference> {
    console.log('Uploading casual photo for P2P sharing:', file.name)

    const options: PhotoUploadOptions = {
      enableP2P: true,
      enableIPFS: false,
      enableCDN: false, // P2P only for privacy
      generateThumbnail: true,
      stripExif: true,
      maxDimensions: { width: 1024, height: 1024 },
      compressionQuality: 0.7,
      requireVerification: false // Faster upload
    }

    try {
      const photoReference = await this.photoManager.uploadPhoto(file, userId, options)
      
      console.log('Casual photo uploaded to P2P network:', {
        id: photoReference.id,
        magnetLink: photoReference.torrentMagnet,
        size: photoReference.metadata.size
      })

      return photoReference
    } catch (error) {
      console.error('Failed to upload casual photo:', error)
      throw error
    }
  }

  /**
   * Example: Download photo with P2P preference and CDN fallback
   */
  async downloadPhoto(photoReference: PhotoReference): Promise<Blob> {
    console.log('Downloading photo:', photoReference.id)

    try {
      const blob = await this.photoManager.downloadPhoto(photoReference, {
        preferP2P: true,
        timeout: 30000,
        fallbackToCDN: true
      })

      console.log('Photo downloaded successfully:', {
        id: photoReference.id,
        size: blob.size,
        type: blob.type
      })

      return blob
    } catch (error) {
      console.error('Failed to download photo:', error)
      throw error
    }
  }

  /**
   * Example: Verify photo integrity and authenticity
   */
  async verifyPhoto(photoReference: PhotoReference): Promise<void> {
    console.log('Verifying photo:', photoReference.id)

    try {
      const result = await this.photoManager.verifyPhoto(photoReference)

      console.log('Photo verification result:', {
        id: photoReference.id,
        isValid: result.isValid,
        score: result.score,
        checks: result.checks,
        warnings: result.warnings,
        errors: result.errors
      })

      if (!result.isValid) {
        console.warn('Photo verification failed:', result.errors)
      } else if (result.warnings.length > 0) {
        console.warn('Photo verification warnings:', result.warnings)
      } else {
        console.log('Photo verification passed with score:', result.score)
      }
    } catch (error) {
      console.error('Photo verification error:', error)
      throw error
    }
  }

  /**
   * Example: Batch upload multiple photos
   */
  async uploadPhotoAlbum(files: File[], userId: string): Promise<PhotoReference[]> {
    console.log(`Uploading photo album with ${files.length} photos`)

    const uploadOptions: PhotoUploadOptions = {
      enableP2P: true,
      enableIPFS: true,
      enableCDN: true,
      generateThumbnail: true,
      stripExif: true,
      maxDimensions: { width: 1600, height: 1200 },
      compressionQuality: 0.8,
      requireVerification: true
    }

    const uploadPromises = files.map(async (file, index) => {
      try {
        console.log(`Uploading photo ${index + 1}/${files.length}: ${file.name}`)
        return await this.photoManager.uploadPhoto(file, userId, uploadOptions)
      } catch (error) {
        console.error(`Failed to upload photo ${file.name}:`, error)
        return null
      }
    })

    const results = await Promise.all(uploadPromises)
    const successful = results.filter(result => result !== null) as PhotoReference[]

    console.log(`Album upload complete: ${successful.length}/${files.length} photos uploaded`)
    
    return successful
  }

  /**
   * Example: Create a photo gallery with thumbnails
   */
  async createPhotoGallery(photoReferences: PhotoReference[]): Promise<void> {
    console.log('Creating photo gallery with', photoReferences.length, 'photos')

    for (const photo of photoReferences) {
      // Display thumbnail immediately
      if (photo.thumbnail) {
        console.log(`Thumbnail available for ${photo.id}:`, photo.thumbnail.substring(0, 50) + '...')
      }

      // Verify photo in background
      this.verifyPhoto(photo).catch(error => {
        console.warn(`Background verification failed for ${photo.id}:`, error)
      })
    }

    // Get gallery statistics
    const stats = this.photoManager.getStats()
    console.log('Gallery statistics:', {
      totalPhotos: stats.totalPhotos,
      verifiedPhotos: stats.verifiedPhotos,
      totalSize: `${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`,
      averageScore: stats.averageVerificationScore,
      distribution: stats.distributionMethods
    })
  }

  /**
   * Example: Clean up old or unverified photos
   */
  async cleanupPhotos(): Promise<void> {
    console.log('Starting photo cleanup...')

    const allPhotos = this.photoManager.getAllPhotos()
    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    let deletedCount = 0

    for (const photo of allPhotos) {
      let shouldDelete = false

      // Delete unverified photos older than a week
      if (!photo.metadata.isVerified && photo.metadata.uploadedAt < oneWeekAgo) {
        console.log(`Deleting unverified old photo: ${photo.id}`)
        shouldDelete = true
      }

      // Delete photos with very low verification scores
      if (photo.metadata.verificationScore < 30) {
        console.log(`Deleting low-score photo: ${photo.id} (score: ${photo.metadata.verificationScore})`)
        shouldDelete = true
      }

      if (shouldDelete) {
        try {
          await this.photoManager.deletePhoto(photo.id)
          deletedCount++
        } catch (error) {
          console.error(`Failed to delete photo ${photo.id}:`, error)
        }
      }
    }

    console.log(`Cleanup complete: ${deletedCount} photos deleted`)
  }

  /**
   * Example: Monitor photo sharing performance
   */
  async monitorPerformance(): Promise<void> {
    console.log('Starting performance monitoring...')

    const stats = this.photoManager.getStats()
    
    console.log('Current performance metrics:', {
      totalPhotos: stats.totalPhotos,
      verifiedPhotos: stats.verifiedPhotos,
      unverifiedPhotos: stats.unverifiedPhotos,
      totalSize: `${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`,
      averageVerificationScore: stats.averageVerificationScore,
      distributionBreakdown: {
        p2pPhotos: stats.distributionMethods.p2p,
        ipfsPhotos: stats.distributionMethods.ipfs,
        cdnPhotos: stats.distributionMethods.cdn
      }
    })

    // Monitor verification scores
    const verifiedPhotos = this.photoManager.getVerifiedPhotos()
    const highQualityPhotos = verifiedPhotos.filter(p => p.metadata.verificationScore >= 80)
    const mediumQualityPhotos = verifiedPhotos.filter(p => p.metadata.verificationScore >= 50 && p.metadata.verificationScore < 80)
    const lowQualityPhotos = verifiedPhotos.filter(p => p.metadata.verificationScore < 50)

    console.log('Quality distribution:', {
      highQuality: highQualityPhotos.length,
      mediumQuality: mediumQualityPhotos.length,
      lowQuality: lowQualityPhotos.length
    })
  }

  /**
   * Example: Handle photo sharing errors gracefully
   */
  async handlePhotoSharingErrors(): Promise<void> {
    console.log('Demonstrating error handling...')

    try {
      // Try to upload an invalid file
      const invalidFile = new File([''], 'empty.txt', { type: 'text/plain' })
      await this.photoManager.uploadPhoto(invalidFile, 'did:key:test-user')
    } catch (error) {
      console.log('Expected error for invalid file:', error.message)
    }

    try {
      // Try to download a non-existent photo
      const fakePhoto: PhotoReference = {
        id: 'non-existent',
        hash: 'fake-hash',
        thumbnail: '',
        metadata: {
          id: 'non-existent',
          originalName: 'fake.jpg',
          size: 1024,
          dimensions: { width: 100, height: 100 },
          format: 'image/jpeg',
          hash: 'fake-hash',
          uploadedAt: new Date(),
          uploadedBy: 'did:key:fake-user',
          signature: '',
          isVerified: false,
          verificationScore: 0
        }
      }

      await this.photoManager.downloadPhoto(fakePhoto)
    } catch (error) {
      console.log('Expected error for non-existent photo:', error.message)
    }
  }

  async destroy(): Promise<void> {
    console.log('Shutting down photo sharing system...')
    await this.photoManager.destroy()
    await this.mediaStorage.destroy()
    console.log('Photo sharing system shut down')
  }
}

// Example usage
export async function runPhotoSharingExample(): Promise<void> {
  const example = new PhotoSharingExample()

  try {
    await example.initialize()

    // Simulate file uploads (in real app, these would come from file inputs)
    const mockFiles = [
      new File(['photo1-content'], 'profile.jpg', { type: 'image/jpeg' }),
      new File(['photo2-content'], 'casual.jpg', { type: 'image/jpeg' }),
      new File(['photo3-content'], 'group.jpg', { type: 'image/jpeg' })
    ]

    // Upload profile photo
    const profilePhoto = await example.uploadProfilePhoto(mockFiles[0], 'did:key:user123')
    
    // Upload casual photo
    const casualPhoto = await example.uploadCasualPhoto(mockFiles[1], 'did:key:user123')
    
    // Upload photo album
    const albumPhotos = await example.uploadPhotoAlbum(mockFiles, 'did:key:user123')
    
    // Create gallery
    await example.createPhotoGallery([profilePhoto, casualPhoto, ...albumPhotos])
    
    // Download and verify photos
    await example.downloadPhoto(profilePhoto)
    await example.verifyPhoto(profilePhoto)
    
    // Monitor performance
    await example.monitorPerformance()
    
    // Demonstrate error handling
    await example.handlePhotoSharingErrors()
    
    // Cleanup
    await example.cleanupPhotos()

  } catch (error) {
    console.error('Photo sharing example failed:', error)
  } finally {
    await example.destroy()
  }
}

// Export for use in other modules
export { PhotoSharingExample }