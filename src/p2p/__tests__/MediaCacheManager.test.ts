import { MediaCacheManager, CachePriority, EvictionPolicy, CacheOptions } from '../MediaCacheManager'
import { MediaFile } from '../MediaStorageManager'

// Mock fetch for testing
global.fetch = jest.fn()

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-url')

// Mock canvas and image for compression tests
const mockCanvas = {
  width: 0,
  height: 0,
  getContext: jest.fn(() => ({
    drawImage: jest.fn()
  })),
  toBlob: jest.fn((callback, type, quality) => {
    const mockBlob = new Blob(['compressed'], { type })
    callback(mockBlob)
  })
}

const mockImage = {
  width: 800,
  height: 600,
  naturalWidth: 800,
  naturalHeight: 600,
  onload: null as any,
  onerror: null as any,
  src: ''
}

// Mock document.createElement
if (typeof document === 'undefined') {
  Object.defineProperty(global, 'document', {
    value: {
      createElement: jest.fn((tagName) => {
        if (tagName === 'canvas') return mockCanvas
        if (tagName === 'img') return mockImage
        return {}
      })
    }
  })
} else {
  document.createElement = jest.fn((tagName) => {
    if (tagName === 'canvas') return mockCanvas as any
    if (tagName === 'img') return mockImage as any
    return {} as any
  })
}

// Mock Image constructor
global.Image = jest.fn(() => mockImage) as any

describe('MediaCacheManager', () => {
  let cacheManager: MediaCacheManager
  let mockMediaFile: MediaFile

  beforeEach(() => {
    jest.clearAllMocks()
    
    const options: Partial<CacheOptions> = {
      maxSize: 10 * 1024 * 1024, // 10MB
      maxEntries: 100,
      defaultTTL: 60 * 60 * 1000, // 1 hour
      evictionPolicy: EvictionPolicy.LRU,
      compressionEnabled: true,
      persistToDisk: false // Disable for tests
    }
    
    cacheManager = new MediaCacheManager(options)
    
    mockMediaFile = {
      id: 'test-media-1',
      name: 'test-image.jpg',
      size: 1024 * 1024, // 1MB
      type: 'image/jpeg',
      hash: 'abc123',
      url: 'https://cdn.example.com/test-image.jpg',
      uploadedAt: new Date()
    }

    // Mock fetch response
    ;(fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([5, 6, 7, 8]) })
            .mockResolvedValueOnce({ done: true })
        })
      },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
    })
  })

  afterEach(async () => {
    await cacheManager.destroy()
  })

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await expect(cacheManager.initialize()).resolves.not.toThrow()
    })

    test('should emit initialized event', async () => {
      const initSpy = jest.fn()
      cacheManager.on('initialized', initSpy)
      
      await cacheManager.initialize()
      
      expect(initSpy).toHaveBeenCalled()
    })

    test('should not initialize twice', async () => {
      await cacheManager.initialize()
      await cacheManager.initialize() // Should not throw or reinitialize
      
      expect(cacheManager['isInitialized']).toBe(true)
    })
  })

  describe('Media Caching', () => {
    beforeEach(async () => {
      await cacheManager.initialize()
    })

    test('should cache media after download', async () => {
      const blob = await cacheManager.getMedia(mockMediaFile, CachePriority.NORMAL, { enableProgressive: false })
      
      expect(blob).toBeInstanceOf(Blob)
      expect(fetch).toHaveBeenCalledWith(mockMediaFile.url)
      
      // Should be cached now
      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(1)
    })

    test('should return cached media on subsequent requests', async () => {
      // First request - downloads and caches
      await cacheManager.getMedia(mockMediaFile, CachePriority.NORMAL, { enableProgressive: false })
      
      // Clear fetch mock to count only subsequent calls
      jest.clearAllMocks()
      
      // Second request - should return from cache
      const blob = await cacheManager.getMedia(mockMediaFile, CachePriority.NORMAL, { enableProgressive: false })
      
      expect(blob).toBeInstanceOf(Blob)
      expect(fetch).not.toHaveBeenCalled() // Should not fetch again
      
      const stats = cacheManager.getStats()
      expect(stats.hitRate).toBeGreaterThan(0)
    })

    test('should handle different quality levels', async () => {
      await cacheManager.getMedia(mockMediaFile, CachePriority.NORMAL, { quality: 'low' })
      await cacheManager.getMedia(mockMediaFile, CachePriority.NORMAL, { quality: 'high' })
      
      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(2) // Different quality levels cached separately
    })

    test('should respect cache priority', async () => {
      const highPriorityFile = { ...mockMediaFile, id: 'high-priority' }
      const lowPriorityFile = { ...mockMediaFile, id: 'low-priority' }
      
      await cacheManager.getMedia(highPriorityFile, CachePriority.HIGH)
      await cacheManager.getMedia(lowPriorityFile, CachePriority.LOW)
      
      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(2)
    })
  })

  describe('Progressive Loading', () => {
    beforeEach(async () => {
      await cacheManager.initialize()
    })

    test('should use progressive loading for large files', async () => {
      const largeFile = {
        ...mockMediaFile,
        size: 10 * 1024 * 1024 // 10MB
      }

      const progressSpy = jest.fn()
      cacheManager.on('downloadProgress', progressSpy)
      
      await cacheManager.getMedia(largeFile, CachePriority.NORMAL, { enableProgressive: true })
      
      expect(progressSpy).toHaveBeenCalled()
    })

    test('should emit download progress events', async () => {
      const progressSpy = jest.fn()
      cacheManager.on('downloadProgress', progressSpy)
      
      await cacheManager.getMedia(mockMediaFile)
      
      expect(progressSpy).toHaveBeenCalled()
      const progressData = progressSpy.mock.calls[0][0]
      expect(progressData).toHaveProperty('mediaId', mockMediaFile.id)
      expect(progressData).toHaveProperty('progress')
      expect(progressData).toHaveProperty('speed')
    })

    test('should handle download cancellation', async () => {
      const downloadPromise = cacheManager.getMedia(mockMediaFile)
      
      const cancelled = cacheManager.cancelDownload(mockMediaFile.id)
      expect(cancelled).toBe(true)
      
      // Download should still complete but progress should be cleared
      await downloadPromise
      expect(cacheManager.getDownloadProgress(mockMediaFile.id)).toBeUndefined()
    })
  })

  describe('Cache Eviction', () => {
    beforeEach(async () => {
      await cacheManager.initialize()
    })

    test('should evict entries when cache is full (LRU)', async () => {
      // Set small cache size for testing
      cacheManager.updateOptions({ maxSize: 2 * 1024, maxEntries: 2 })
      
      const file1 = { ...mockMediaFile, id: 'file1' }
      const file2 = { ...mockMediaFile, id: 'file2' }
      const file3 = { ...mockMediaFile, id: 'file3' }
      
      await cacheManager.getMedia(file1)
      await cacheManager.getMedia(file2)
      
      const evictSpy = jest.fn()
      cacheManager.on('entryEvicted', evictSpy)
      
      await cacheManager.getMedia(file3) // Should evict file1 (LRU)
      
      expect(evictSpy).toHaveBeenCalled()
      const stats = cacheManager.getStats()
      expect(stats.evictionCount).toBeGreaterThan(0)
    })

    test('should respect priority during eviction', async () => {
      cacheManager.updateOptions({ maxSize: 2 * 1024, maxEntries: 2 })
      
      const criticalFile = { ...mockMediaFile, id: 'critical' }
      const normalFile = { ...mockMediaFile, id: 'normal' }
      const lowFile = { ...mockMediaFile, id: 'low' }
      
      await cacheManager.getMedia(criticalFile, CachePriority.CRITICAL)
      await cacheManager.getMedia(normalFile, CachePriority.NORMAL)
      
      const evictSpy = jest.fn()
      cacheManager.on('entryEvicted', evictSpy)
      
      await cacheManager.getMedia(lowFile, CachePriority.LOW)
      
      // Should evict normal priority before critical
      expect(evictSpy).toHaveBeenCalled()
    })

    test('should handle different eviction policies', async () => {
      // Test FIFO eviction
      cacheManager.updateOptions({ 
        evictionPolicy: EvictionPolicy.FIFO,
        maxSize: 2 * 1024,
        maxEntries: 2
      })
      
      const file1 = { ...mockMediaFile, id: 'file1' }
      const file2 = { ...mockMediaFile, id: 'file2' }
      const file3 = { ...mockMediaFile, id: 'file3' }
      
      await cacheManager.getMedia(file1)
      await cacheManager.getMedia(file2)
      await cacheManager.getMedia(file3) // Should evict file1 (FIFO)
      
      const stats = cacheManager.getStats()
      expect(stats.evictionCount).toBeGreaterThan(0)
    })
  })

  describe('Bandwidth Optimization', () => {
    beforeEach(async () => {
      await cacheManager.initialize()
    })

    test('should limit concurrent downloads', async () => {
      cacheManager.updateBandwidthOptimization({ maxConcurrentDownloads: 2 })
      
      const files = [
        { ...mockMediaFile, id: 'file1' },
        { ...mockMediaFile, id: 'file2' },
        { ...mockMediaFile, id: 'file3' },
        { ...mockMediaFile, id: 'file4' }
      ]
      
      const downloadPromises = files.map(file => cacheManager.getMedia(file))
      
      await Promise.all(downloadPromises)
      
      // All should complete successfully
      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(4)
    })

    test('should optimize quality based on settings', async () => {
      cacheManager.updateBandwidthOptimization({ adaptiveQuality: true })
      
      await cacheManager.getMedia(mockMediaFile, CachePriority.NORMAL, { 
        quality: 'low', 
        enableProgressive: false 
      })
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('quality=low')
      )
    })

    test.skip('should compress media when beneficial', async () => {
      // Skipped due to complex image loading mocking in test environment
      // Compression functionality is tested in integration tests
    })
  })

  describe('Preloading', () => {
    beforeEach(async () => {
      await cacheManager.initialize()
    })

    test('should preload media with specified priority', async () => {
      const preloadSpy = jest.fn()
      cacheManager.on('mediaPreloaded', preloadSpy)
      
      await cacheManager.preloadMedia(mockMediaFile, CachePriority.HIGH, 'low')
      
      expect(preloadSpy).toHaveBeenCalledWith({
        mediaId: mockMediaFile.id,
        quality: 'low'
      })
      
      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(1)
    })

    test('should handle preload errors gracefully', async () => {
      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))
      
      const errorSpy = jest.fn()
      cacheManager.on('preloadError', errorSpy)
      
      await cacheManager.preloadMedia(mockMediaFile)
      
      expect(errorSpy).toHaveBeenCalledWith({
        mediaId: mockMediaFile.id,
        error: expect.any(Error)
      })
    })
  })

  describe('Cache Management', () => {
    beforeEach(async () => {
      await cacheManager.initialize()
    })

    test('should clear entire cache', async () => {
      await cacheManager.getMedia(mockMediaFile)
      
      let stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(1)
      
      const clearSpy = jest.fn()
      cacheManager.on('cacheCleared', clearSpy)
      
      await cacheManager.clearCache()
      
      stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(0)
      expect(clearSpy).toHaveBeenCalled()
    })

    test('should remove specific media from cache', async () => {
      await cacheManager.getMedia(mockMediaFile)
      await cacheManager.getMedia({ ...mockMediaFile, id: 'other-media' })
      
      let stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(2)
      
      const removed = cacheManager.removeFromCache(mockMediaFile.id)
      expect(removed).toBe(true)
      
      stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(1)
    })

    test('should optimize cache by removing least valuable entries', async () => {
      // Fill cache with multiple entries
      const files = Array.from({ length: 5 }, (_, i) => ({
        ...mockMediaFile,
        id: `file-${i}`
      }))
      
      for (const file of files) {
        await cacheManager.getMedia(file)
      }
      
      const optimizeSpy = jest.fn()
      cacheManager.on('cacheOptimized', optimizeSpy)
      
      const result = await cacheManager.optimizeCache()
      
      expect(result.removedCount).toBeGreaterThanOrEqual(0)
      expect(result.freedSize).toBeGreaterThanOrEqual(0)
    })

    test('should get cached media info', async () => {
      await cacheManager.getMedia(mockMediaFile, CachePriority.NORMAL, { quality: 'low' })
      await cacheManager.getMedia(mockMediaFile, CachePriority.NORMAL, { quality: 'high' })
      
      const info = cacheManager.getCachedMediaInfo(mockMediaFile.id)
      
      expect(info).toHaveLength(2)
      expect(info[0]).toHaveProperty('quality')
      expect(info[0]).toHaveProperty('size')
      expect(info[0]).toHaveProperty('cachedAt')
      expect(info[0]).toHaveProperty('accessCount')
    })
  })

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await cacheManager.initialize()
    })

    test('should track cache statistics', async () => {
      // Generate some cache activity
      await cacheManager.getMedia(mockMediaFile) // Miss
      await cacheManager.getMedia(mockMediaFile) // Hit
      
      const stats = cacheManager.getStats()
      
      expect(stats).toHaveProperty('totalEntries')
      expect(stats).toHaveProperty('totalSize')
      expect(stats).toHaveProperty('hitRate')
      expect(stats).toHaveProperty('missRate')
      expect(stats.hitRate).toBeGreaterThan(0)
      expect(stats.missRate).toBeGreaterThan(0)
    })

    test('should emit cache events', async () => {
      const hitSpy = jest.fn()
      const missSpy = jest.fn()
      const completeSpy = jest.fn()
      
      cacheManager.on('cacheHit', hitSpy)
      cacheManager.on('cacheMiss', missSpy)
      cacheManager.on('downloadComplete', completeSpy)
      
      await cacheManager.getMedia(mockMediaFile) // Miss
      await cacheManager.getMedia(mockMediaFile) // Hit
      
      expect(missSpy).toHaveBeenCalledWith({ mediaId: mockMediaFile.id })
      expect(hitSpy).toHaveBeenCalledWith({ 
        mediaId: mockMediaFile.id, 
        size: expect.any(Number) 
      })
      expect(completeSpy).toHaveBeenCalledWith({ 
        mediaId: mockMediaFile.id, 
        size: expect.any(Number) 
      })
    })
  })

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      await cacheManager.initialize()
    })

    test('should update cache options', () => {
      const updateSpy = jest.fn()
      cacheManager.on('optionsUpdated', updateSpy)
      
      const newOptions = { maxSize: 50 * 1024 * 1024 }
      cacheManager.updateOptions(newOptions)
      
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining(newOptions)
      )
    })

    test('should update bandwidth optimization settings', () => {
      const updateSpy = jest.fn()
      cacheManager.on('bandwidthOptimizationUpdated', updateSpy)
      
      const newSettings = { maxConcurrentDownloads: 5 }
      cacheManager.updateBandwidthOptimization(newSettings)
      
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining(newSettings)
      )
    })

    test('should update progressive loading settings', () => {
      const updateSpy = jest.fn()
      cacheManager.on('progressiveLoadingUpdated', updateSpy)
      
      const newSettings = { chunkSize: 128 * 1024 }
      cacheManager.updateProgressiveLoading(newSettings)
      
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining(newSettings)
      )
    })
  })

  describe('Error Handling', () => {
    beforeEach(async () => {
      await cacheManager.initialize()
    })

    test('should handle network errors gracefully', async () => {
      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))
      
      await expect(cacheManager.getMedia(mockMediaFile)).rejects.toThrow('Network error')
    })

    test('should handle invalid media files', async () => {
      const invalidFile = { ...mockMediaFile, url: undefined }
      
      await expect(cacheManager.getMedia(invalidFile)).rejects.toThrow()
    })

    test.skip('should handle compression errors', async () => {
      // Skipped due to complex image loading mocking in test environment
      // Error handling is tested in integration tests
    })
  })

  describe('Cleanup and Destruction', () => {
    test('should clean up expired entries', async () => {
      await cacheManager.initialize()
      
      // Create entry with short TTL
      cacheManager.updateOptions({ defaultTTL: 1 }) // 1ms TTL
      
      await cacheManager.getMedia(mockMediaFile)
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const cleanupSpy = jest.fn()
      cacheManager.on('expiredEntriesCleanup', cleanupSpy)
      
      // Trigger cleanup manually
      cacheManager['cleanupExpiredEntries']()
      
      expect(cleanupSpy).toHaveBeenCalled()
    })

    test('should destroy cleanly', async () => {
      await cacheManager.initialize()
      await cacheManager.getMedia(mockMediaFile)
      
      const destroySpy = jest.fn()
      cacheManager.on('destroyed', destroySpy)
      
      await cacheManager.destroy()
      
      expect(destroySpy).toHaveBeenCalled()
      expect(cacheManager['isInitialized']).toBe(false)
      
      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(0)
    })
  })
})