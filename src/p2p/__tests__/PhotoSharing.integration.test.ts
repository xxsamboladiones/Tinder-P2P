import { PhotoSharingManager, PhotoReference, PhotoUploadOptions } from '../PhotoSharingManager'
import { MediaStorageManager } from '../MediaStorageManager'
import { CryptoManager } from '../CryptoManager'

// Mock WebTorrent and IPFS for integration tests
const mockWebTorrent = {
  seed: jest.fn(),
  add: jest.fn(),
  destroy: jest.fn(),
  on: jest.fn()
}

const mockHelia = {
  stop: jest.fn()
}

const mockUnixfs = {
  addBytes: jest.fn(),
  cat: jest.fn()
}

// Mock global dependencies
if (typeof window === 'undefined') {
  Object.defineProperty(global, 'window', {
    value: {
      WebTorrent: jest.fn(() => mockWebTorrent)
    },
    writable: true
  })
} else {
  (global as any).window = {
    WebTorrent: jest.fn(() => mockWebTorrent)
  }
}

// Mock helia dynamically since it may not be installed
jest.mock('helia', () => ({
  createHelia: jest.fn().mockResolvedValue(mockHelia)
}), { virtual: true })

jest.mock('@helia/unixfs', () => ({
  unixfs: jest.fn().mockReturnValue(mockUnixfs)
}), { virtual: true })

// Mock fetch for CDN operations
global.fetch = jest.fn()

// Mock crypto.subtle
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn(),
      generateKey: jest.fn(),
      sign: jest.fn(),
      verify: jest.fn(),
      importKey: jest.fn(),
      exportKey: jest.fn()
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
  toBlob: jest.fn(),
  toDataURL: jest.fn().mockReturnValue('data:image/jpeg;base64,mock-thumbnail')
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
}

// Mock Image constructor
if (typeof Image === 'undefined') {
  Object.defineProperty(global, 'Image', {
    value: jest.fn().mockImplementation(() => mockImage),
    writable: true
  })
}

// Mock URL
if (typeof URL === 'undefined') {
  Object.defineProperty(global, 'URL', {
    value: {
      createObjectURL: jest.fn().mockReturnValue('blob:mock-url')
    },
    writable: true
  })
}

describe('PhotoSharing Integration Tests', () => {
  let photoManager: PhotoSharingManager
  let mediaStorage: MediaStorageManager
  let cryptoManager: CryptoManager
  let mockFile: File

  beforeEach(async () => {
    jest.clearAllMocks()

    // Setup crypto manager
    cryptoManager = new CryptoManager()
    
    // Mock crypto operations
    const mockHashArray = new Uint8Array(32).fill(0).map((_, i) => i)
    ;(global.crypto.subtle.digest as jest.Mock).mockResolvedValue(mockHashArray.buffer)
    ;(global.crypto.subtle.sign as jest.Mock).mockResolvedValue(new ArrayBuffer(64))
    ;(global.crypto.subtle.verify as jest.Mock).mockResolvedValue(true)
    ;(global.crypto.subtle.generateKey as jest.Mock).mockResolvedValue({
      publicKey: {},
      privateKey: {}
    })

    // Setup media storage
    mediaStorage = new MediaStorageManager('https://test-cdn.example.com')
    
    // Setup photo manager
    photoManager = new PhotoSharingManager(mediaStorage, cryptoManager)

    // Create mock file
    mockFile = new File(['mock-photo-content'], 'test-photo.jpg', { 
      type: 'image/jpeg',
      lastModified: Date.now()
    })
    Object.defineProperty(mockFile, 'size', { value: 2 * 1024 * 1024 }) // 2MB

    // Mock successful image loading
    setTimeout(() => {
      if (mockImage.onload) mockImage.onload()
    }, 0)

    // Mock canvas operations
    mockCanvas.toBlob.mockImplementation((callback, type, quality) => {
      const blob = new Blob(['processed-photo-content'], { type: type || 'image/jpeg' })
      setTimeout(() => callback(blob), 0)
    })

    // Mock WebTorrent operations
    mockWebTorrent.seed.mockImplementation((buffer, options, callback) => {
      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:mock-hash',
        infoHash: 'mock-info-hash',
        on: jest.fn()
      }
      setTimeout(() => callback(mockTorrent), 100)
      return mockTorrent
    })

    // Mock IPFS operations
    mockUnixfs.addBytes.mockResolvedValue({
      toString: () => 'QmMockIPFSHash'
    })

    // Mock CDN upload
    ;(global.fetch as jest.Mock).mockImplementation((url, options) => {
      if (url.includes('/upload')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            url: 'https://test-cdn.example.com/files/mock-file-id'
          })
        })
      }
      // Mock CDN download
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['downloaded-content'], { type: 'image/jpeg' }))
      })
    })
  })

  afterEach(async () => {
    await photoManager.destroy()
    await mediaStorage.destroy()
  })

  describe('End-to-End Photo Upload and Download', () => {
    it('should upload photo to all storage methods and download successfully', async () => {
      // Initialize managers
      await photoManager.initialize()

      // Upload photo with all methods enabled
      const uploadOptions: PhotoUploadOptions = {
        enableP2P: true,
        enableIPFS: true,
        enableCDN: true,
        generateThumbnail: true,
        stripExif: true,
        maxDimensions: { width: 1920, height: 1080 },
        compressionQuality: 0.8,
        requireVerification: true
      }

      const photoReference = await photoManager.uploadPhoto(
        mockFile,
        'did:key:test-user-123',
        uploadOptions
      )

      // Verify upload result
      expect(photoReference).toMatchObject({
        id: expect.stringMatching(/^media_/),
        hash: expect.any(String),
        torrentMagnet: 'magnet:?xt=urn:btih:mock-hash',
        ipfsCid: 'QmMockIPFSHash',
        url: 'https://test-cdn.example.com/files/mock-file-id',
        thumbnail: 'data:image/jpeg;base64,mock-thumbnail',
        metadata: expect.objectContaining({
          originalName: 'test-photo.jpg',
          format: 'image/jpeg',
          uploadedBy: 'did:key:test-user-123',
          isVerified: true,
          verificationScore: expect.any(Number)
        })
      })

      // Verify all storage methods were called
      expect(mockWebTorrent.seed).toHaveBeenCalled()
      expect(mockUnixfs.addBytes).toHaveBeenCalled()
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/upload'),
        expect.objectContaining({ method: 'POST' })
      )

      // Download the photo
      const downloadedBlob = await photoManager.downloadPhoto(photoReference)

      expect(downloadedBlob).toBeInstanceOf(Blob)
      expect(downloadedBlob.type).toBe('image/jpeg')
    })

    it('should handle P2P-only upload and download', async () => {
      await photoManager.initialize()

      const uploadOptions: PhotoUploadOptions = {
        enableP2P: true,
        enableIPFS: false,
        enableCDN: false,
        generateThumbnail: true,
        stripExif: false,
        maxDimensions: { width: 1024, height: 1024 },
        compressionQuality: 0.9,
        requireVerification: false
      }

      const photoReference = await photoManager.uploadPhoto(
        mockFile,
        'did:key:test-user-456',
        uploadOptions
      )

      expect(photoReference.torrentMagnet).toBeDefined()
      expect(photoReference.ipfsCid).toBeUndefined()
      expect(photoReference.url).toBeUndefined()

      // Mock WebTorrent download
      mockWebTorrent.add.mockImplementation((magnetURI, callback) => {
        const mockTorrent = {
          files: [{
            getBuffer: (cb: (err: any, buffer: Buffer) => void) => {
              cb(null, Buffer.from('p2p-downloaded-content'))
            }
          }]
        }
        setTimeout(() => callback(mockTorrent), 100)
      })

      const downloadedBlob = await photoManager.downloadPhoto(photoReference)
      expect(downloadedBlob).toBeInstanceOf(Blob)
    })

    it('should fallback to CDN when P2P fails', async () => {
      await photoManager.initialize()

      const photoReference: PhotoReference = {
        id: 'photo-fallback-test',
        hash: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
        torrentMagnet: 'magnet:?xt=urn:btih:failing-hash',
        url: 'https://test-cdn.example.com/files/fallback-photo',
        thumbnail: 'mock-thumbnail',
        metadata: {
          id: 'photo-fallback-test',
          originalName: 'fallback.jpg',
          size: 1024,
          dimensions: { width: 800, height: 600 },
          format: 'image/jpeg',
          hash: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
          uploadedAt: new Date(),
          uploadedBy: 'did:key:test-user',
          signature: 'mock-signature',
          isVerified: true,
          verificationScore: 90
        }
      }

      // Mock WebTorrent failure
      mockWebTorrent.add.mockImplementation((magnetURI, callback) => {
        // Simulate P2P failure by not calling callback
        setTimeout(() => {
          throw new Error('P2P download failed')
        }, 100)
      })

      const downloadedBlob = await photoManager.downloadPhoto(photoReference, {
        preferP2P: true,
        timeout: 5000,
        fallbackToCDN: true
      })

      expect(downloadedBlob).toBeInstanceOf(Blob)
      expect(global.fetch).toHaveBeenCalledWith(photoReference.url)
    })
  })

  describe('Photo Verification Integration', () => {
    it('should perform comprehensive photo verification', async () => {
      await photoManager.initialize()

      const photoReference = await photoManager.uploadPhoto(
        mockFile,
        'did:key:verified-user',
        { requireVerification: true } as PhotoUploadOptions
      )

      const verificationResult = await photoManager.verifyPhoto(photoReference)

      expect(verificationResult).toMatchObject({
        isValid: true,
        score: expect.any(Number),
        checks: {
          hashIntegrity: true,
          signatureValid: true,
          formatValid: true,
          dimensionsValid: true,
          sizeValid: true,
          contentSafe: true
        },
        warnings: expect.any(Array),
        errors: expect.any(Array)
      })

      expect(verificationResult.score).toBeGreaterThan(50)
    })

    it('should detect and reject corrupted photos', async () => {
      await photoManager.initialize()

      // Create a photo reference with mismatched hash
      const corruptedPhoto: PhotoReference = {
        id: 'corrupted-photo',
        hash: 'wrong-hash-value',
        url: 'https://test-cdn.example.com/files/corrupted',
        thumbnail: 'mock-thumbnail',
        metadata: {
          id: 'corrupted-photo',
          originalName: 'corrupted.jpg',
          size: 1024,
          dimensions: { width: 800, height: 600 },
          format: 'image/jpeg',
          hash: 'wrong-hash-value',
          uploadedAt: new Date(),
          uploadedBy: 'did:key:test-user',
          signature: 'mock-signature',
          isVerified: false,
          verificationScore: 0
        }
      }

      const verificationResult = await photoManager.verifyPhoto(corruptedPhoto)

      expect(verificationResult.isValid).toBe(false)
      expect(verificationResult.checks.hashIntegrity).toBe(false)
      expect(verificationResult.errors).toContain('Hash integrity check failed')
    })
  })

  describe('Photo Management Integration', () => {
    it('should manage photo lifecycle completely', async () => {
      await photoManager.initialize()

      // Upload multiple photos
      const photo1 = await photoManager.uploadPhoto(mockFile, 'did:key:user1')
      const photo2 = await photoManager.uploadPhoto(mockFile, 'did:key:user2')

      // Verify photos are stored
      expect(photoManager.getAllPhotos()).toHaveLength(2)
      expect(photoManager.getPhoto(photo1.id)).toBeDefined()
      expect(photoManager.getPhoto(photo2.id)).toBeDefined()

      // Get statistics
      const stats = photoManager.getStats()
      expect(stats.totalPhotos).toBe(2)
      expect(stats.totalSize).toBeGreaterThan(0)

      // Delete one photo
      const deleted = await photoManager.deletePhoto(photo1.id)
      expect(deleted).toBe(true)
      expect(photoManager.getAllPhotos()).toHaveLength(1)
      expect(photoManager.getPhoto(photo1.id)).toBeUndefined()

      // Verify updated statistics
      const updatedStats = photoManager.getStats()
      expect(updatedStats.totalPhotos).toBe(1)
    })

    it('should handle concurrent uploads and downloads', async () => {
      await photoManager.initialize()

      // Create multiple files
      const files = Array.from({ length: 3 }, (_, i) => 
        new File([`content-${i}`], `photo-${i}.jpg`, { type: 'image/jpeg' })
      )

      files.forEach(file => {
        Object.defineProperty(file, 'size', { value: 1024 * (1 + Math.random()) })
      })

      // Upload all files concurrently
      const uploadPromises = files.map((file, i) => 
        photoManager.uploadPhoto(file, `did:key:user-${i}`)
      )

      const photoReferences = await Promise.all(uploadPromises)

      expect(photoReferences).toHaveLength(3)
      expect(photoManager.getAllPhotos()).toHaveLength(3)

      // Download all photos concurrently
      const downloadPromises = photoReferences.map(ref => 
        photoManager.downloadPhoto(ref)
      )

      const blobs = await Promise.all(downloadPromises)

      expect(blobs).toHaveLength(3)
      blobs.forEach(blob => {
        expect(blob).toBeInstanceOf(Blob)
      })
    })
  })

  describe('Error Recovery Integration', () => {
    it('should recover from partial upload failures', async () => {
      await photoManager.initialize()

      // Mock IPFS failure but P2P and CDN success
      mockUnixfs.addBytes.mockRejectedValue(new Error('IPFS unavailable'))

      const photoReference = await photoManager.uploadPhoto(mockFile, 'did:key:test-user')

      // Should still succeed with P2P and CDN
      expect(photoReference.torrentMagnet).toBeDefined()
      expect(photoReference.url).toBeDefined()
      expect(photoReference.ipfsCid).toBeUndefined()
    })

    it('should handle network timeouts gracefully', async () => {
      await photoManager.initialize()

      const photoReference: PhotoReference = {
        id: 'timeout-test',
        hash: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
        torrentMagnet: 'magnet:?xt=urn:btih:timeout-hash',
        thumbnail: 'mock-thumbnail',
        metadata: {
          id: 'timeout-test',
          originalName: 'timeout.jpg',
          size: 1024,
          dimensions: { width: 800, height: 600 },
          format: 'image/jpeg',
          hash: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
          uploadedAt: new Date(),
          uploadedBy: 'did:key:test-user',
          signature: 'mock-signature',
          isVerified: true,
          verificationScore: 90
        }
      }

      // Mock slow WebTorrent response
      mockWebTorrent.add.mockImplementation(() => {
        // Never call callback to simulate timeout
      })

      await expect(
        photoManager.downloadPhoto(photoReference, {
          preferP2P: true,
          timeout: 100, // Very short timeout
          fallbackToCDN: false
        })
      ).rejects.toThrow()
    })
  })

  describe('Performance Integration', () => {
    it('should handle large photo uploads efficiently', async () => {
      await photoManager.initialize()

      // Create a larger mock file
      const largeFile = new File(['x'.repeat(5 * 1024 * 1024)], 'large-photo.jpg', { 
        type: 'image/jpeg' 
      })
      Object.defineProperty(largeFile, 'size', { value: 5 * 1024 * 1024 }) // 5MB

      const startTime = Date.now()
      
      const photoReference = await photoManager.uploadPhoto(largeFile, 'did:key:test-user', {
        compressionQuality: 0.6,
        maxDimensions: { width: 1920, height: 1080 }
      } as PhotoUploadOptions)

      const uploadTime = Date.now() - startTime

      expect(photoReference).toBeDefined()
      expect(uploadTime).toBeLessThan(10000) // Should complete within 10 seconds
    })

    it('should cache verification results for performance', async () => {
      await photoManager.initialize()

      const photoReference = await photoManager.uploadPhoto(mockFile, 'did:key:test-user')

      // First verification
      const startTime1 = Date.now()
      const result1 = await photoManager.verifyPhoto(photoReference)
      const time1 = Date.now() - startTime1

      // Second verification (should be cached)
      const startTime2 = Date.now()
      const result2 = await photoManager.verifyPhoto(photoReference)
      const time2 = Date.now() - startTime2

      expect(result1).toBe(result2) // Same object reference
      expect(time2).toBeLessThan(time1) // Cached should be faster
    })
  })
})