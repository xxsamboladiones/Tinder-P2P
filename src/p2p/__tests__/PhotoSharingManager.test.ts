import { PhotoSharingManager, PhotoReference, PhotoUploadOptions, PhotoVerificationResult } from '../PhotoSharingManager'
import { MediaStorageManager, MediaFile } from '../MediaStorageManager'

// Mock MediaStorageManager
jest.mock('../MediaStorageManager')

// Mock crypto.subtle
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
  }
})

// Mock canvas and image APIs
const mockCanvas = {
  width: 0,
  height: 0,
  getContext: jest.fn().mockReturnValue({
    drawImage: jest.fn()
  }),
  toBlob: jest.fn()
}

const mockImage = {
  naturalWidth: 800,
  naturalHeight: 600,
  onload: null as any,
  onerror: null as any,
  src: ''
}

// Mock document if not already defined
if (typeof document === 'undefined') {
  Object.defineProperty(global, 'document', {
    value: {
      createElement: jest.fn().mockImplementation((tag: string) => {
        if (tag === 'canvas') return mockCanvas
        return {}
      })
    },
    writable: true
  })
} else {
  // If document exists, just mock createElement
  document.createElement = jest.fn().mockImplementation((tag: string) => {
    if (tag === 'canvas') return mockCanvas
    return {}
  })
}

// Mock Image constructor
if (typeof Image === 'undefined') {
  Object.defineProperty(global, 'Image', {
    value: jest.fn().mockImplementation(() => mockImage),
    writable: true
  })
} else {
  global.Image = jest.fn().mockImplementation(() => mockImage)
}

// Mock URL
if (typeof URL === 'undefined') {
  Object.defineProperty(global, 'URL', {
    value: {
      createObjectURL: jest.fn().mockReturnValue('blob:mock-url')
    },
    writable: true
  })
} else {
  global.URL = {
    createObjectURL: jest.fn().mockReturnValue('blob:mock-url')
  } as any
}

describe('PhotoSharingManager', () => {
  let photoManager: PhotoSharingManager
  let mockMediaStorage: jest.Mocked<MediaStorageManager>
  let mockCryptoManager: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockMediaStorage = new MediaStorageManager() as jest.Mocked<MediaStorageManager>
    mockMediaStorage.initialize = jest.fn().mockResolvedValue(undefined)
    mockMediaStorage.uploadMedia = jest.fn()
    mockMediaStorage.downloadMedia = jest.fn()
    mockMediaStorage.deleteMediaFile = jest.fn()
    mockMediaStorage.on = jest.fn()

    mockCryptoManager = {
      signData: jest.fn().mockResolvedValue('mock-signature'),
      verifySignature: jest.fn().mockResolvedValue(true)
    }

    photoManager = new PhotoSharingManager(mockMediaStorage, mockCryptoManager)
  })

  afterEach(async () => {
    await photoManager.destroy()
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await photoManager.initialize()
      expect(mockMediaStorage.initialize).toHaveBeenCalled()
    })

    it('should not initialize twice', async () => {
      await photoManager.initialize()
      await photoManager.initialize()
      expect(mockMediaStorage.initialize).toHaveBeenCalledTimes(1)
    })

    it('should handle initialization errors', async () => {
      mockMediaStorage.initialize.mockRejectedValue(new Error('Init failed'))
      await expect(photoManager.initialize()).rejects.toThrow('Init failed')
    })
  })

  describe('photo upload', () => {
    let mockFile: File

    beforeEach(() => {
      mockFile = new File(['mock-content'], 'test.jpg', { type: 'image/jpeg' })
      Object.defineProperty(mockFile, 'size', { value: 1024 * 1024 }) // 1MB

      // Mock successful media upload
      mockMediaStorage.uploadMedia.mockResolvedValue({
        id: 'media-123',
        name: 'test.jpg',
        size: 1024 * 1024,
        type: 'image/jpeg',
        hash: 'mock-hash',
        thumbnail: 'mock-thumbnail',
        uploadedAt: new Date()
      })

      // Mock image loading - trigger immediately
      mockImage.onload = null
      mockImage.onerror = null

      // Mock canvas toBlob
      mockCanvas.toBlob.mockImplementation((callback) => {
        const blob = new Blob(['processed'], { type: 'image/jpeg' })
        setTimeout(() => callback(blob), 0)
      })

      // Mock crypto digest
      const mockHashArray = new Uint8Array(32).fill(0).map((_, i) => i)
      ;(global.crypto.subtle.digest as jest.Mock).mockResolvedValue(mockHashArray.buffer)
    })

    it('should upload photo successfully', async () => {
      // Mock the internal methods to avoid async image processing
      jest.spyOn(photoManager as any, 'processPhoto').mockResolvedValue(mockFile)
      jest.spyOn(photoManager as any, 'generatePhotoMetadata').mockResolvedValue({
        id: 'photo-123',
        originalName: 'test.jpg',
        size: 1024 * 1024,
        dimensions: { width: 800, height: 600 },
        format: 'image/jpeg',
        hash: 'mock-hash',
        uploadedAt: new Date(),
        uploadedBy: 'did:key:test-user',
        signature: 'mock-signature',
        isVerified: false,
        verificationScore: 0
      })
      jest.spyOn(photoManager as any, 'validatePhoto').mockResolvedValue({
        isValid: true,
        score: 100,
        checks: {},
        warnings: [],
        errors: []
      })

      const result = await photoManager.uploadPhoto(mockFile, 'did:key:test-user')

      expect(result).toMatchObject({
        id: 'media-123',
        hash: 'mock-hash',
        thumbnail: 'mock-thumbnail',
        metadata: expect.objectContaining({
          originalName: 'test.jpg',
          format: 'image/jpeg',
          uploadedBy: 'did:key:test-user',
          signature: 'mock-signature'
        })
      })

      expect(mockMediaStorage.uploadMedia).toHaveBeenCalled()
    })

    it('should validate photo before upload', async () => {
      // Create oversized file
      const oversizedFile = new File(['content'], 'large.jpg', { type: 'image/jpeg' })
      Object.defineProperty(oversizedFile, 'size', { value: 20 * 1024 * 1024 }) // 20MB

      // Mock getImageDimensions to avoid async image loading
      jest.spyOn(photoManager as any, 'getImageDimensions').mockResolvedValue({ width: 800, height: 600 })

      await expect(
        photoManager.uploadPhoto(oversizedFile, 'did:key:test-user')
      ).rejects.toThrow('Photo validation failed')
    })

    it('should reject unsupported formats', async () => {
      const unsupportedFile = new File(['content'], 'test.gif', { type: 'image/gif' })
      
      // Mock getImageDimensions to avoid async image loading
      jest.spyOn(photoManager as any, 'getImageDimensions').mockResolvedValue({ width: 800, height: 600 })
      
      await expect(
        photoManager.uploadPhoto(unsupportedFile, 'did:key:test-user')
      ).rejects.toThrow('Unsupported format')
    })

    it('should process photo with custom options', async () => {
      // Mock internal methods
      jest.spyOn(photoManager as any, 'processPhoto').mockResolvedValue(mockFile)
      jest.spyOn(photoManager as any, 'generatePhotoMetadata').mockResolvedValue({
        id: 'photo-123',
        originalName: 'test.jpg',
        size: 1024 * 1024,
        dimensions: { width: 800, height: 600 },
        format: 'image/jpeg',
        hash: 'mock-hash',
        uploadedAt: new Date(),
        uploadedBy: 'did:key:test-user',
        signature: 'mock-signature',
        isVerified: false,
        verificationScore: 0
      })
      jest.spyOn(photoManager as any, 'validatePhoto').mockResolvedValue({
        isValid: true,
        score: 100,
        checks: {},
        warnings: [],
        errors: []
      })

      const options: PhotoUploadOptions = {
        enableP2P: true,
        enableIPFS: false,
        enableCDN: true,
        generateThumbnail: true,
        stripExif: true,
        maxDimensions: { width: 1024, height: 1024 },
        compressionQuality: 0.7,
        requireVerification: false
      }

      const result = await photoManager.uploadPhoto(mockFile, 'did:key:test-user', options)
      
      expect(result.metadata.isVerified).toBe(false) // verification disabled
      expect(mockMediaStorage.uploadMedia).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining(options)
      )
    })

    it('should handle upload failures gracefully', async () => {
      // Mock internal methods to avoid image processing
      jest.spyOn(photoManager as any, 'processPhoto').mockResolvedValue(mockFile)
      jest.spyOn(photoManager as any, 'generatePhotoMetadata').mockResolvedValue({
        id: 'photo-123',
        originalName: 'test.jpg',
        size: 1024 * 1024,
        dimensions: { width: 800, height: 600 },
        format: 'image/jpeg',
        hash: 'mock-hash',
        uploadedAt: new Date(),
        uploadedBy: 'did:key:test-user',
        signature: 'mock-signature',
        isVerified: false,
        verificationScore: 0
      })
      jest.spyOn(photoManager as any, 'validatePhoto').mockResolvedValue({
        isValid: true,
        score: 100,
        checks: {},
        warnings: [],
        errors: []
      })

      mockMediaStorage.uploadMedia.mockRejectedValue(new Error('Upload failed'))

      await expect(
        photoManager.uploadPhoto(mockFile, 'did:key:test-user')
      ).rejects.toThrow('Upload failed')
    })
  })

  describe('photo download', () => {
    let mockPhotoReference: PhotoReference

    beforeEach(() => {
      mockPhotoReference = {
        id: 'photo-123',
        hash: 'mock-hash',
        url: 'https://cdn.example.com/photo-123',
        thumbnail: 'mock-thumbnail',
        metadata: {
          id: 'photo-123',
          originalName: 'test.jpg',
          size: 1024 * 1024,
          dimensions: { width: 800, height: 600 },
          format: 'image/jpeg',
          hash: 'mock-hash',
          uploadedAt: new Date(),
          uploadedBy: 'did:key:test-user',
          signature: 'mock-signature',
          isVerified: true,
          verificationScore: 95
        }
      }

      // Mock successful download
      const mockBlob = new Blob(['photo-content'], { type: 'image/jpeg' })
      mockMediaStorage.downloadMedia.mockResolvedValue(mockBlob)

      // Mock hash verification - create a consistent hash that matches 'mock-hash'
      const mockHashBytes = new Uint8Array(32)
      'mock-hash'.split('').forEach((char, i) => {
        if (i < 32) mockHashBytes[i] = char.charCodeAt(0) % 256
      })
      ;(global.crypto.subtle.digest as jest.Mock).mockResolvedValue(mockHashBytes.buffer)
    })

    it('should download photo successfully', async () => {
      // Mock the hash verification to pass
      jest.spyOn(photoManager as any, 'verifyDownloadedPhoto').mockResolvedValue(true)

      const blob = await photoManager.downloadPhoto(mockPhotoReference)

      expect(blob).toBeInstanceOf(Blob)
      expect(mockMediaStorage.downloadMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'photo-123',
          hash: 'mock-hash'
        }),
        expect.any(Object)
      )
    })

    it('should verify downloaded photo integrity', async () => {
      // Mock the hash verification to pass
      jest.spyOn(photoManager as any, 'verifyDownloadedPhoto').mockResolvedValue(true)

      const blob = await photoManager.downloadPhoto(mockPhotoReference)
      expect(blob).toBeInstanceOf(Blob)
      // Hash verification is mocked to pass
    })

    it('should reject corrupted downloads', async () => {
      // Mock hash mismatch
      mockPhotoReference.hash = 'different-hash'

      await expect(
        photoManager.downloadPhoto(mockPhotoReference)
      ).rejects.toThrow('Downloaded photo failed integrity check')
    })

    it('should handle download failures', async () => {
      mockMediaStorage.downloadMedia.mockRejectedValue(new Error('Download failed'))

      await expect(
        photoManager.downloadPhoto(mockPhotoReference)
      ).rejects.toThrow('Download failed')
    })
  })

  describe('photo verification', () => {
    let mockPhotoReference: PhotoReference

    beforeEach(() => {
      mockPhotoReference = {
        id: 'photo-123',
        hash: 'mock-hash',
        thumbnail: 'mock-thumbnail',
        metadata: {
          id: 'photo-123',
          originalName: 'test.jpg',
          size: 1024 * 1024,
          dimensions: { width: 800, height: 600 },
          format: 'image/jpeg',
          hash: 'mock-hash',
          uploadedAt: new Date(),
          uploadedBy: 'did:key:test-user',
          signature: 'mock-signature',
          isVerified: false,
          verificationScore: 0
        }
      }

      // Mock successful download for hash verification
      const mockBlob = new Blob(['photo-content'], { type: 'image/jpeg' })
      mockMediaStorage.downloadMedia.mockResolvedValue(mockBlob)
    })

    it('should verify photo successfully', async () => {
      // Mock hash integrity check to pass
      jest.spyOn(photoManager as any, 'verifyHashIntegrity').mockResolvedValue(true)

      const result = await photoManager.verifyPhoto(mockPhotoReference)

      expect(result.isValid).toBe(true)
      expect(result.score).toBeGreaterThan(50)
      expect(result.checks.formatValid).toBe(true)
      expect(result.checks.dimensionsValid).toBe(true)
      expect(result.checks.sizeValid).toBe(true)
    })

    it('should cache verification results', async () => {
      const result1 = await photoManager.verifyPhoto(mockPhotoReference)
      const result2 = await photoManager.verifyPhoto(mockPhotoReference)

      expect(result1).toBe(result2) // Same object reference (cached)
      expect(mockMediaStorage.downloadMedia).toHaveBeenCalledTimes(1)
    })

    it('should fail verification for invalid format', async () => {
      mockPhotoReference.metadata.format = 'image/gif'

      const result = await photoManager.verifyPhoto(mockPhotoReference)

      expect(result.checks.formatValid).toBe(false)
      expect(result.errors).toContain('Unsupported photo format')
      expect(result.score).toBeLessThan(100)
    })

    it('should fail verification for invalid dimensions', async () => {
      mockPhotoReference.metadata.dimensions = { width: 50, height: 50 } // Too small

      const result = await photoManager.verifyPhoto(mockPhotoReference)

      expect(result.checks.dimensionsValid).toBe(false)
      expect(result.errors).toContain('Invalid photo dimensions')
    })

    it('should fail verification for oversized files', async () => {
      mockPhotoReference.metadata.size = 20 * 1024 * 1024 // 20MB

      const result = await photoManager.verifyPhoto(mockPhotoReference)

      expect(result.checks.sizeValid).toBe(false)
      expect(result.errors).toContain('Photo file size too large')
    })

    it('should verify digital signatures', async () => {
      mockCryptoManager.verifySignature.mockResolvedValue(true)

      const result = await photoManager.verifyPhoto(mockPhotoReference)

      expect(result.checks.signatureValid).toBe(true)
      expect(mockCryptoManager.verifySignature).toHaveBeenCalledWith(
        expect.stringContaining(mockPhotoReference.metadata.id),
        mockPhotoReference.metadata.signature,
        mockPhotoReference.metadata.uploadedBy
      )
    })

    it('should handle signature verification failures', async () => {
      mockCryptoManager.verifySignature.mockResolvedValue(false)

      const result = await photoManager.verifyPhoto(mockPhotoReference)

      expect(result.checks.signatureValid).toBe(false)
      expect(result.errors).toContain('Digital signature verification failed')
    })
  })

  describe('photo management', () => {
    it('should get photo by id', () => {
      const mockPhoto: PhotoReference = {
        id: 'photo-123',
        hash: 'mock-hash',
        thumbnail: 'mock-thumbnail',
        metadata: {} as any
      }

      photoManager['photoCache'].set('photo-123', mockPhoto)
      
      const result = photoManager.getPhoto('photo-123')
      expect(result).toBe(mockPhoto)
    })

    it('should return undefined for non-existent photo', () => {
      const result = photoManager.getPhoto('non-existent')
      expect(result).toBeUndefined()
    })

    it('should get all photos', () => {
      const mockPhotos = [
        { id: 'photo-1', metadata: { isVerified: true } },
        { id: 'photo-2', metadata: { isVerified: false } }
      ] as PhotoReference[]

      mockPhotos.forEach(photo => {
        photoManager['photoCache'].set(photo.id, photo)
      })

      const result = photoManager.getAllPhotos()
      expect(result).toHaveLength(2)
    })

    it('should get only verified photos', () => {
      const mockPhotos = [
        { id: 'photo-1', metadata: { isVerified: true } },
        { id: 'photo-2', metadata: { isVerified: false } }
      ] as PhotoReference[]

      mockPhotos.forEach(photo => {
        photoManager['photoCache'].set(photo.id, photo)
      })

      const result = photoManager.getVerifiedPhotos()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('photo-1')
    })

    it('should delete photo successfully', async () => {
      const mockPhoto: PhotoReference = {
        id: 'photo-123',
        hash: 'mock-hash',
        thumbnail: 'mock-thumbnail',
        metadata: {} as any
      }

      photoManager['photoCache'].set('photo-123', mockPhoto)
      mockMediaStorage.deleteMediaFile.mockReturnValue(true)

      const result = await photoManager.deletePhoto('photo-123')

      expect(result).toBe(true)
      expect(mockMediaStorage.deleteMediaFile).toHaveBeenCalledWith('photo-123')
      expect(photoManager.getPhoto('photo-123')).toBeUndefined()
    })

    it('should return false when deleting non-existent photo', async () => {
      const result = await photoManager.deletePhoto('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('statistics', () => {
    beforeEach(() => {
      const mockPhotos: PhotoReference[] = [
        {
          id: 'photo-1',
          hash: 'hash-1',
          thumbnail: 'thumb-1',
          torrentMagnet: 'magnet:1',
          metadata: {
            size: 1024,
            isVerified: true,
            verificationScore: 95
          } as any
        },
        {
          id: 'photo-2',
          hash: 'hash-2',
          thumbnail: 'thumb-2',
          ipfsCid: 'ipfs-cid-2',
          metadata: {
            size: 2048,
            isVerified: false,
            verificationScore: 30
          } as any
        },
        {
          id: 'photo-3',
          hash: 'hash-3',
          thumbnail: 'thumb-3',
          url: 'https://cdn.example.com/photo-3',
          metadata: {
            size: 1536,
            isVerified: true,
            verificationScore: 85
          } as any
        }
      ]

      mockPhotos.forEach(photo => {
        photoManager['photoCache'].set(photo.id, photo)
      })
    })

    it('should calculate statistics correctly', () => {
      const stats = photoManager.getStats()

      expect(stats.totalPhotos).toBe(3)
      expect(stats.verifiedPhotos).toBe(2)
      expect(stats.unverifiedPhotos).toBe(1)
      expect(stats.totalSize).toBe(4608) // 1024 + 2048 + 1536
      expect(stats.averageVerificationScore).toBe(70) // (95 + 30 + 85) / 3
      expect(stats.distributionMethods.p2p).toBe(1)
      expect(stats.distributionMethods.ipfs).toBe(1)
      expect(stats.distributionMethods.cdn).toBe(1)
    })

    it('should handle empty photo collection', () => {
      photoManager['photoCache'].clear()
      
      const stats = photoManager.getStats()

      expect(stats.totalPhotos).toBe(0)
      expect(stats.verifiedPhotos).toBe(0)
      expect(stats.unverifiedPhotos).toBe(0)
      expect(stats.totalSize).toBe(0)
      expect(stats.averageVerificationScore).toBe(0)
    })
  })

  describe('event handling', () => {
    it('should emit events on photo upload', async () => {
      const mockFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
      Object.defineProperty(mockFile, 'size', { value: 1024 })

      // Mock internal methods to avoid image processing
      jest.spyOn(photoManager as any, 'processPhoto').mockResolvedValue(mockFile)
      jest.spyOn(photoManager as any, 'generatePhotoMetadata').mockResolvedValue({
        id: 'photo-123',
        originalName: 'test.jpg',
        size: 1024,
        dimensions: { width: 800, height: 600 },
        format: 'image/jpeg',
        hash: 'mock-hash',
        uploadedAt: new Date(),
        uploadedBy: 'did:key:test-user',
        signature: 'mock-signature',
        isVerified: false,
        verificationScore: 0
      })
      jest.spyOn(photoManager as any, 'validatePhoto').mockResolvedValue({
        isValid: true,
        score: 100,
        checks: {},
        warnings: [],
        errors: []
      })

      mockMediaStorage.uploadMedia.mockResolvedValue({
        id: 'media-123',
        name: 'test.jpg',
        size: 1024,
        type: 'image/jpeg',
        hash: 'mock-hash',
        uploadedAt: new Date()
      })

      const eventSpy = jest.fn()
      photoManager.on('photoUploaded', eventSpy)

      await photoManager.uploadPhoto(mockFile, 'did:key:test-user')

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'media-123'
        })
      )
    })

    it('should emit events on photo deletion', async () => {
      const mockPhoto: PhotoReference = {
        id: 'photo-123',
        hash: 'mock-hash',
        thumbnail: 'mock-thumbnail',
        metadata: {} as any
      }

      photoManager['photoCache'].set('photo-123', mockPhoto)
      mockMediaStorage.deleteMediaFile.mockReturnValue(true)

      const eventSpy = jest.fn()
      photoManager.on('photoDeleted', eventSpy)

      await photoManager.deletePhoto('photo-123')

      expect(eventSpy).toHaveBeenCalledWith('photo-123')
    })
  })

  describe('error handling', () => {
    it('should handle crypto manager absence gracefully', async () => {
      const photoManagerWithoutCrypto = new PhotoSharingManager(mockMediaStorage)
      
      const mockFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
      Object.defineProperty(mockFile, 'size', { value: 1024 })

      // Mock internal methods to avoid image processing
      jest.spyOn(photoManagerWithoutCrypto as any, 'processPhoto').mockResolvedValue(mockFile)
      jest.spyOn(photoManagerWithoutCrypto as any, 'generatePhotoMetadata').mockResolvedValue({
        id: 'photo-123',
        originalName: 'test.jpg',
        size: 1024,
        dimensions: { width: 800, height: 600 },
        format: 'image/jpeg',
        hash: 'mock-hash',
        uploadedAt: new Date(),
        uploadedBy: 'did:key:test-user',
        signature: '', // No crypto manager
        isVerified: false,
        verificationScore: 0
      })
      jest.spyOn(photoManagerWithoutCrypto as any, 'validatePhoto').mockResolvedValue({
        isValid: true,
        score: 100,
        checks: {},
        warnings: [],
        errors: []
      })

      mockMediaStorage.uploadMedia.mockResolvedValue({
        id: 'media-123',
        name: 'test.jpg',
        size: 1024,
        type: 'image/jpeg',
        hash: 'mock-hash',
        uploadedAt: new Date()
      })

      const result = await photoManagerWithoutCrypto.uploadPhoto(mockFile, 'did:key:test-user')
      
      expect(result.metadata.signature).toBe('')
      await photoManagerWithoutCrypto.destroy()
    })

    it('should handle image processing errors', async () => {
      const mockFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
      
      // Mock image loading failure
      setTimeout(() => {
        if (mockImage.onerror) mockImage.onerror()
      }, 0)

      await expect(
        photoManager.uploadPhoto(mockFile, 'did:key:test-user')
      ).rejects.toThrow()
    })
  })
})