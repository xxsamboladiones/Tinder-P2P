import { MediaStorageManager } from '../MediaStorageManager'
import { P2PManager } from '../P2PManager'

// Mock dependencies for integration test
jest.mock('webtorrent')
jest.mock('helia')
jest.mock('@helia/unixfs')

// Mock fetch for CDN operations
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>

// Mock crypto and DOM APIs
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
  }
})

Object.defineProperty(global, 'document', {
  value: {
    createElement: jest.fn().mockReturnValue({
      getContext: jest.fn().mockReturnValue({
        drawImage: jest.fn()
      }),
      width: 0,
      height: 0,
      toDataURL: jest.fn().mockReturnValue('data:image/jpeg;base64,thumbnail')
    })
  }
})

Object.defineProperty(global, 'Image', {
  value: class {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    src = ''
    width = 100
    height = 100
    
    constructor() {
      setTimeout(() => {
        if (this.onload) this.onload()
      }, 0)
    }
  }
})

Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: jest.fn().mockReturnValue('blob:url')
  }
})

describe('MediaStorage Integration Tests', () => {
  let mediaManager: MediaStorageManager
  let p2pManager: P2PManager

  beforeEach(async () => {
    jest.clearAllMocks()
    
    // Initialize managers
    mediaManager = new MediaStorageManager('https://test-cdn.com')
    p2pManager = new P2PManager({
      bootstrapNodes: ['test-node'],
      stunServers: ['stun:test.com'],
      turnServers: [],
      geohashPrecision: 5,
      maxPeers: 10,
      discoveryInterval: 5000,
      enableEncryption: true,
      keyRotationInterval: 3600000,
      messageTimeout: 30000,
      reconnectInterval: 5000,
      maxRetries: 3
    })

    await mediaManager.initialize()
  })

  afterEach(async () => {
    await mediaManager.destroy()
    await p2pManager.disconnect()
  })

  describe('P2P Media Sharing Workflow', () => {
    it('should complete full media sharing workflow', async () => {
      // Mock WebTorrent for P2P sharing
      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:test123',
        on: jest.fn(),
        infoHash: 'test123',
        files: [{
          getBuffer: jest.fn().mockImplementation((callback: any) => {
            callback(null, Buffer.from('test image data'))
          })
        }]
      }

      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation((buffer: any, opts: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 0)
        return mockTorrent
      })
      mockWebTorrent.add.mockImplementation((magnet: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 0)
      })

      // Mock IPFS
      const mockUnixfs = require('@helia/unixfs').unixfs()
      mockUnixfs.addBytes.mockResolvedValue({ toString: () => 'QmTest123' })
      mockUnixfs.cat.mockImplementation(async function* () {
        yield new Uint8Array(Buffer.from('test image data'))
      })

      // Mock CDN
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ url: 'https://test-cdn.com/files/test123' })
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(new Blob(['test image data']))
        })

      // Create test file
      const testFile = new File(['test image data'], 'test.jpg', { type: 'image/jpeg' })
      Object.defineProperty(testFile, 'arrayBuffer', {
        value: jest.fn().mockResolvedValue(new ArrayBuffer(15))
      })

      // Step 1: Upload media with all storage methods
      const uploadedMedia = await mediaManager.uploadMedia(testFile, {
        enableP2P: true,
        enableIPFS: true,
        enableCDN: true,
        generateThumbnail: true
      })

      expect(uploadedMedia).toMatchObject({
        name: 'test.jpg',
        type: 'image/jpeg',
        torrentMagnet: 'magnet:?xt=urn:btih:test123',
        ipfsCid: 'QmTest123',
        url: 'https://test-cdn.com/files/test123',
        thumbnail: 'data:image/jpeg;base64,thumbnail'
      })

      // Step 2: Download media preferring P2P
      const downloadedBlob = await mediaManager.downloadMedia(uploadedMedia, {
        preferP2P: true,
        timeout: 5000,
        fallbackToCDN: true
      })

      expect(downloadedBlob).toBeInstanceOf(Blob)
      expect(mockWebTorrent.add).toHaveBeenCalledWith(uploadedMedia.torrentMagnet, expect.any(Function))

      // Step 3: Verify statistics
      const stats = mediaManager.getStats()
      expect(stats.totalFiles).toBe(1)
      expect(stats.p2pFiles).toBe(1)
      expect(stats.ipfsFiles).toBe(1)
      expect(stats.cdnFiles).toBe(1)
    })

    it('should handle P2P failure and fallback to CDN', async () => {
      // Mock WebTorrent to fail
      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation(() => {
        const mockTorrent = { on: jest.fn() }
        setTimeout(() => {
          const errorCallback = mockTorrent.on.mock.calls.find((call: any) => call[0] === 'error')?.[1]
          if (errorCallback) errorCallback(new Error('WebTorrent failed'))
        }, 0)
        return mockTorrent
      })

      // Mock IPFS to fail
      const mockUnixfs = require('@helia/unixfs').unixfs()
      mockUnixfs.addBytes.mockRejectedValue(new Error('IPFS failed'))

      // Mock CDN to succeed
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ url: 'https://test-cdn.com/files/test123' })
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(new Blob(['test image data']))
        })

      const testFile = new File(['test image data'], 'test.jpg', { type: 'image/jpeg' })
      Object.defineProperty(testFile, 'arrayBuffer', {
        value: jest.fn().mockResolvedValue(new ArrayBuffer(15))
      })

      // Upload should succeed with CDN only
      const uploadedMedia = await mediaManager.uploadMedia(testFile, {
        enableP2P: true,
        enableIPFS: true,
        enableCDN: true,
        generateThumbnail: false
      })

      expect(uploadedMedia.url).toBe('https://test-cdn.com/files/test123')
      expect(uploadedMedia.torrentMagnet).toBeUndefined()
      expect(uploadedMedia.ipfsCid).toBeUndefined()

      // Download should work from CDN
      const downloadedBlob = await mediaManager.downloadMedia(uploadedMedia, {
        preferP2P: true,
        timeout: 5000,
        fallbackToCDN: true
      })

      expect(downloadedBlob).toBeInstanceOf(Blob)
    })

    it('should handle concurrent uploads and downloads', async () => {
      // Mock successful operations
      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:test123',
        on: jest.fn(),
        infoHash: 'test123',
        files: [{
          getBuffer: jest.fn().mockImplementation((callback: any) => {
            callback(null, Buffer.from('test image data'))
          })
        }]
      }

      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation((buffer: any, opts: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 100) // Add delay to test concurrency
        return mockTorrent
      })
      mockWebTorrent.add.mockImplementation((magnet: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 50)
      })

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: 'https://test-cdn.com/files/test' }),
        blob: () => Promise.resolve(new Blob(['test image data']))
      })

      // Create multiple test files
      const files = Array.from({ length: 3 }, (_, i) => {
        const file = new File([`test image data ${i}`], `test${i}.jpg`, { type: 'image/jpeg' })
        Object.defineProperty(file, 'arrayBuffer', {
          value: jest.fn().mockResolvedValue(new ArrayBuffer(15 + i))
        })
        return file
      })

      // Upload multiple files concurrently
      const uploadPromises = files.map(file => 
        mediaManager.uploadMedia(file, {
          enableP2P: true,
          enableIPFS: false,
          enableCDN: true,
          generateThumbnail: false
        })
      )

      const uploadedFiles = await Promise.all(uploadPromises)
      expect(uploadedFiles).toHaveLength(3)

      // Download multiple files concurrently
      const downloadPromises = uploadedFiles.map(file =>
        mediaManager.downloadMedia(file, {
          preferP2P: false, // Use CDN for faster test
          timeout: 5000,
          fallbackToCDN: true
        })
      )

      const downloadedBlobs = await Promise.all(downloadPromises)
      expect(downloadedBlobs).toHaveLength(3)
      downloadedBlobs.forEach(blob => {
        expect(blob).toBeInstanceOf(Blob)
      })

      // Verify statistics
      const stats = mediaManager.getStats()
      expect(stats.totalFiles).toBe(3)
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle network disconnection during upload', async () => {
      const testFile = new File(['test image data'], 'test.jpg', { type: 'image/jpeg' })
      Object.defineProperty(testFile, 'arrayBuffer', {
        value: jest.fn().mockResolvedValue(new ArrayBuffer(15))
      })

      // Mock all methods to fail
      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation(() => {
        throw new Error('Network disconnected')
      })

      const mockUnixfs = require('@helia/unixfs').unixfs()
      mockUnixfs.addBytes.mockRejectedValue(new Error('Network disconnected'))

      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network disconnected'))

      // Upload should fail
      await expect(mediaManager.uploadMedia(testFile, {
        enableP2P: true,
        enableIPFS: true,
        enableCDN: true,
        generateThumbnail: false
      })).rejects.toThrow('Failed to upload media to any storage method')
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle large file uploads efficiently', async () => {
      // Create a large mock file (simulate 10MB)
      const largeFile = new File(['x'.repeat(10 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' })
      Object.defineProperty(largeFile, 'arrayBuffer', {
        value: jest.fn().mockResolvedValue(new ArrayBuffer(10 * 1024 * 1024))
      })

      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:large123',
        on: jest.fn(),
        infoHash: 'large123'
      }

      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation((buffer: any, opts: any, callback: any) => {
        // Simulate processing time for large file
        setTimeout(() => callback(mockTorrent), 200)
        return mockTorrent
      })

      const startTime = Date.now()
      const uploadedMedia = await mediaManager.uploadMedia(largeFile, {
        enableP2P: true,
        enableIPFS: false,
        enableCDN: false,
        generateThumbnail: false
      })
      const uploadTime = Date.now() - startTime

      expect(uploadedMedia.torrentMagnet).toBe('magnet:?xt=urn:btih:large123')
      expect(uploadedMedia.size).toBe(10 * 1024 * 1024)
      expect(uploadTime).toBeLessThan(5000) // Should complete within 5 seconds
    })
  })
})