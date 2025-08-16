import { MediaStorageManager } from '../MediaStorageManager'

// Mock global APIs
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>

Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
  }
})

if (typeof document === 'undefined') {
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
}

if (typeof Image === 'undefined') {
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
}

if (typeof URL === 'undefined') {
  Object.defineProperty(global, 'URL', {
    value: {
      createObjectURL: jest.fn().mockReturnValue('blob:url')
    }
  })
}

describe('MediaStorageManager - Basic Tests', () => {
  let mediaManager: MediaStorageManager

  beforeEach(() => {
    jest.clearAllMocks()
    mediaManager = new MediaStorageManager('https://test-cdn.com')
  })

  afterEach(async () => {
    await mediaManager.destroy()
  })

  it('should create MediaStorageManager instance', () => {
    expect(mediaManager).toBeInstanceOf(MediaStorageManager)
  })

  it('should initialize successfully', async () => {
    await expect(mediaManager.initialize()).resolves.not.toThrow()
  })

  it('should provide empty statistics initially', () => {
    const stats = mediaManager.getStats()
    expect(stats).toEqual({
      totalFiles: 0,
      totalSize: 0,
      p2pFiles: 0,
      ipfsFiles: 0,
      cdnFiles: 0,
      activeDownloads: 0,
      activeUploads: 0
    })
  })

  it('should return undefined for non-existent media file', () => {
    const result = mediaManager.getMediaFile('non-existent-id')
    expect(result).toBeUndefined()
  })

  it('should return empty array for getAllMediaFiles initially', () => {
    const files = mediaManager.getAllMediaFiles()
    expect(files).toEqual([])
  })

  it('should return false when deleting non-existent file', () => {
    const result = mediaManager.deleteMediaFile('non-existent-id')
    expect(result).toBe(false)
  })

  it('should destroy cleanly', async () => {
    await mediaManager.initialize()
    await expect(mediaManager.destroy()).resolves.not.toThrow()
  })

  it('should handle CDN upload when enabled', async () => {
    await mediaManager.initialize()

    // Mock successful CDN response
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://test-cdn.com/files/test123' })
    })

    const testFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
    Object.defineProperty(testFile, 'arrayBuffer', {
      value: jest.fn().mockResolvedValue(new ArrayBuffer(12))
    })

    const result = await mediaManager.uploadMedia(testFile, {
      enableP2P: false,
      enableIPFS: false,
      enableCDN: true,
      generateThumbnail: false
    })

    expect(result).toMatchObject({
      name: 'test.txt',
      type: 'text/plain',
      url: 'https://test-cdn.com/files/test123'
    })
    expect(result.id).toBeDefined()
    expect(result.hash).toBeDefined()
    expect(result.uploadedAt).toBeInstanceOf(Date)
  })

  it('should handle CDN download', async () => {
    await mediaManager.initialize()

    const testMediaFile = {
      id: 'test-id',
      name: 'test.txt',
      size: 12,
      type: 'text/plain',
      hash: 'testhash',
      url: 'https://test-cdn.com/files/test',
      uploadedAt: new Date()
    }

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['test content']))
    })

    const result = await mediaManager.downloadMedia(testMediaFile, {
      preferP2P: false,
      timeout: 5000,
      fallbackToCDN: true
    })

    expect(result).toBeInstanceOf(Blob)
    expect(global.fetch).toHaveBeenCalledWith(testMediaFile.url)
  })

  it('should fail upload when no methods are enabled', async () => {
    await mediaManager.initialize()

    const testFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
    Object.defineProperty(testFile, 'arrayBuffer', {
      value: jest.fn().mockResolvedValue(new ArrayBuffer(12))
    })

    await expect(mediaManager.uploadMedia(testFile, {
      enableP2P: false,
      enableIPFS: false,
      enableCDN: false,
      generateThumbnail: false
    })).rejects.toThrow('No upload methods enabled or available')
  })

  it('should fail download when no methods are available', async () => {
    await mediaManager.initialize()

    const testMediaFile = {
      id: 'test-id',
      name: 'test.txt',
      size: 12,
      type: 'text/plain',
      hash: 'testhash',
      uploadedAt: new Date()
    }

    await expect(mediaManager.downloadMedia(testMediaFile, {
      preferP2P: true,
      timeout: 5000,
      fallbackToCDN: false
    })).rejects.toThrow('No download methods available')
  })
})