import { MediaStorageManager, MediaFile, MediaUploadOptions, MediaDownloadOptions } from '../MediaStorageManager'

// Mock WebTorrent
jest.mock('webtorrent', () => {
  return jest.fn().mockImplementation(() => ({
    seed: jest.fn(),
    add: jest.fn(),
    get: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn()
  }))
})

// Mock Helia
jest.mock('helia', () => ({
  createHelia: jest.fn().mockResolvedValue({
    stop: jest.fn()
  })
}))

jest.mock('@helia/unixfs', () => ({
  unixfs: jest.fn().mockReturnValue({
    addBytes: jest.fn(),
    cat: jest.fn()
  })
}))

// Mock fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>

// Mock crypto.subtle
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
  }
})

// Mock canvas and image for thumbnail generation
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

describe('MediaStorageManager', () => {
  let mediaManager: MediaStorageManager
  let mockFile: File

  beforeEach(() => {
    jest.clearAllMocks()
    mediaManager = new MediaStorageManager('https://test-cdn.com')
    
    // Create mock file
    mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(mockFile, 'arrayBuffer', {
      value: jest.fn().mockResolvedValue(new ArrayBuffer(12))
    })
  })

  afterEach(async () => {
    await mediaManager.destroy()
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(mediaManager.initialize()).resolves.not.toThrow()
    })

    it('should not initialize twice', async () => {
      await mediaManager.initialize()
      await expect(mediaManager.initialize()).resolves.not.toThrow()
    })

    it('should emit initialized event', async () => {
      const initSpy = jest.fn()
      mediaManager.on('initialized', initSpy)
      
      await mediaManager.initialize()
      expect(initSpy).toHaveBeenCalled()
    })
  })

  describe('media upload', () => {
    beforeEach(async () => {
      await mediaManager.initialize()
    })

    it('should upload media with all options enabled', async () => {
      const options: MediaUploadOptions = {
        enableP2P: true,
        enableIPFS: true,
        enableCDN: true,
        generateThumbnail: true
      }

      // Mock successful responses
      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:test',
        on: jest.fn(),
        infoHash: 'testhash'
      }
      
      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation((buffer: any, opts: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 0)
        return mockTorrent
      })

      const mockUnixfs = require('@helia/unixfs').unixfs()
      mockUnixfs.addBytes.mockResolvedValue({ toString: () => 'QmTest123' })

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: 'https://test-cdn.com/files/test' })
      })

      const result = await mediaManager.uploadMedia(mockFile, options)

      expect(result).toMatchObject({
        name: 'test.jpg',
        type: 'image/jpeg',
        torrentMagnet: 'magnet:?xt=urn:btih:test',
        ipfsCid: 'QmTest123',
        url: 'https://test-cdn.com/files/test',
        thumbnail: 'data:image/jpeg;base64,thumbnail'
      })
    })

    it('should upload with P2P only', async () => {
      const options: MediaUploadOptions = {
        enableP2P: true,
        enableIPFS: false,
        enableCDN: false,
        generateThumbnail: false
      }

      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:test',
        on: jest.fn(),
        infoHash: 'testhash'
      }
      
      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation((buffer: any, opts: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 0)
        return mockTorrent
      })

      const result = await mediaManager.uploadMedia(mockFile, options)

      expect(result.torrentMagnet).toBe('magnet:?xt=urn:btih:test')
      expect(result.ipfsCid).toBeUndefined()
      expect(result.url).toBeUndefined()
      expect(result.thumbnail).toBeUndefined()
    })

    it('should emit uploadComplete event', async () => {
      const uploadSpy = jest.fn()
      mediaManager.on('uploadComplete', uploadSpy)

      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:test',
        on: jest.fn(),
        infoHash: 'testhash'
      }
      
      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation((buffer: any, opts: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 0)
        return mockTorrent
      })

      await mediaManager.uploadMedia(mockFile, { enableP2P: true, enableIPFS: false, enableCDN: false, generateThumbnail: false })
      
      expect(uploadSpy).toHaveBeenCalled()
    })
  })

  describe('media download', () => {
    let testMediaFile: MediaFile

    beforeEach(async () => {
      await mediaManager.initialize()
      
      testMediaFile = {
        id: 'test-id',
        name: 'test.jpg',
        size: 1024,
        type: 'image/jpeg',
        hash: 'testhash',
        torrentMagnet: 'magnet:?xt=urn:btih:test',
        ipfsCid: 'QmTest123',
        url: 'https://test-cdn.com/files/test',
        uploadedAt: new Date()
      }
    })

    it('should download from WebTorrent when preferP2P is true', async () => {
      const options: MediaDownloadOptions = {
        preferP2P: true,
        timeout: 5000,
        fallbackToCDN: true
      }

      const mockTorrent = {
        files: [{
          getBuffer: jest.fn().mockImplementation((callback: any) => {
            callback(null, Buffer.from('test content'))
          })
        }]
      }

      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.add.mockImplementation((magnet: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 0)
      })

      const result = await mediaManager.downloadMedia(testMediaFile, options)
      
      expect(result).toBeInstanceOf(Blob)
      expect(mockWebTorrent.add).toHaveBeenCalledWith(testMediaFile.torrentMagnet, expect.any(Function))
    })

    it('should download from CDN when preferP2P is false', async () => {
      const options: MediaDownloadOptions = {
        preferP2P: false,
        timeout: 5000,
        fallbackToCDN: true
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test content']))
      })

      const result = await mediaManager.downloadMedia(testMediaFile, options)
      
      expect(result).toBeInstanceOf(Blob)
      expect(global.fetch).toHaveBeenCalledWith(testMediaFile.url)
    })

    it('should emit downloadComplete event', async () => {
      const downloadSpy = jest.fn()
      mediaManager.on('downloadComplete', downloadSpy)

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test content']))
      })

      await mediaManager.downloadMedia(testMediaFile, { preferP2P: false, timeout: 5000, fallbackToCDN: true })
      
      expect(downloadSpy).toHaveBeenCalledWith(testMediaFile.id)
    })
  })

  describe('media management', () => {
    beforeEach(async () => {
      await mediaManager.initialize()
    })

    it('should store and retrieve media files', async () => {
      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:test',
        on: jest.fn(),
        infoHash: 'testhash'
      }
      
      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation((buffer: any, opts: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 0)
        return mockTorrent
      })

      const uploadedFile = await mediaManager.uploadMedia(mockFile, {
        enableP2P: true,
        enableIPFS: false,
        enableCDN: false,
        generateThumbnail: false
      })

      const retrievedFile = mediaManager.getMediaFile(uploadedFile.id)
      expect(retrievedFile).toEqual(uploadedFile)
    })

    it('should delete media files', async () => {
      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:test',
        on: jest.fn(),
        infoHash: 'testhash',
        destroy: jest.fn()
      }
      
      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation((buffer: any, opts: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 0)
        return mockTorrent
      })
      mockWebTorrent.get.mockReturnValue(mockTorrent)

      const uploadedFile = await mediaManager.uploadMedia(mockFile, {
        enableP2P: true,
        enableIPFS: false,
        enableCDN: false,
        generateThumbnail: false
      })

      const deleted = mediaManager.deleteMediaFile(uploadedFile.id)
      expect(deleted).toBe(true)
      expect(mediaManager.getMediaFile(uploadedFile.id)).toBeUndefined()
    })
  })

  describe('statistics', () => {
    beforeEach(async () => {
      await mediaManager.initialize()
    })

    it('should provide accurate statistics', async () => {
      const mockTorrent = {
        magnetURI: 'magnet:?xt=urn:btih:test',
        on: jest.fn(),
        infoHash: 'testhash'
      }
      
      const mockWebTorrent = require('webtorrent')()
      mockWebTorrent.seed.mockImplementation((buffer: any, opts: any, callback: any) => {
        setTimeout(() => callback(mockTorrent), 0)
        return mockTorrent
      })

      const mockUnixfs = require('@helia/unixfs').unixfs()
      mockUnixfs.addBytes.mockResolvedValue({ toString: () => 'QmTest123' })

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: 'https://test-cdn.com/files/test' })
      })

      await mediaManager.uploadMedia(mockFile, {
        enableP2P: true,
        enableIPFS: true,
        enableCDN: true,
        generateThumbnail: false
      })

      const stats = mediaManager.getStats()
      expect(stats.totalFiles).toBe(1)
      expect(stats.p2pFiles).toBe(1)
      expect(stats.ipfsFiles).toBe(1)
      expect(stats.cdnFiles).toBe(1)
      expect(stats.totalSize).toBeGreaterThan(0)
    })
  })

  describe('cleanup', () => {
    it('should destroy cleanly', async () => {
      await mediaManager.initialize()
      
      const mockWebTorrent = require('webtorrent')()
      const mockHelia = require('helia').createHelia()

      await expect(mediaManager.destroy()).resolves.not.toThrow()
      
      expect(mockWebTorrent.destroy).toHaveBeenCalled()
      expect((await mockHelia).stop).toHaveBeenCalled()
    })

    it('should emit destroyed event', async () => {
      const destroySpy = jest.fn()
      mediaManager.on('destroyed', destroySpy)

      await mediaManager.destroy()
      expect(destroySpy).toHaveBeenCalled()
    })
  })
})