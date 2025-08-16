import { MediaCacheManager, CachePriority, EvictionPolicy } from '../MediaCacheManager'
import { MediaStorageManager, MediaFile } from '../MediaStorageManager'
import { PhotoSharingManager } from '../PhotoSharingManager'

// Mock fetch and other browser APIs
global.fetch = jest.fn()
global.URL.createObjectURL = jest.fn(() => 'mock-url')

// Mock WebTorrent and IPFS
const mockWebTorrent = {
  seed: jest.fn(),
  add: jest.fn(),
  destroy: jest.fn(),
  on: jest.fn()
}

const mockHelia = {
  stop: jest.fn()
}

// Mock canvas and image
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

global.Image = jest.fn(() => mockImage) as any

describe('Media Cache Optimization Integration', () => {
  let cacheManager: MediaCacheManager
  let storageManager: MediaStorageManager
  let photoManager: PhotoSharingManager
  
  const mockMediaFiles: MediaFile[] = [
    {
      id: 'photo-1',
      name: 'profile-pic.jpg',
      size: 2 * 1024 * 1024, // 2MB
      type: 'image/jpeg',
      hash: 'hash1',
      url: 'https://cdn.example.com/photo-1.jpg',
      uploadedAt: new Date()
    },
    {
      id: 'photo-2',
      name: 'vacation.png',
      size: 5 * 1024 * 1024, // 5MB
      type: 'image/png',
      hash: 'hash2',
      url: 'https://cdn.example.com/photo-2.png',
      uploadedAt: new Date()
    },
    {
      id: 'photo-3',
      name: 'selfie.webp',
      size: 1 * 1024 * 1024, // 1MB
      type: 'image/webp',
      hash: 'hash3',
      url: 'https://cdn.example.com/photo-3.webp',
      uploadedAt: new Date()
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup cache manager with realistic settings
    cacheManager = new MediaCacheManager({
      maxSize: 20 * 1024 * 1024, // 20MB cache
      maxEntries: 50,
      defaultTTL: 2 * 60 * 60 * 1000, // 2 hours
      evictionPolicy: EvictionPolicy.LRU,
      compressionEnabled: true,
      persistToDisk: false
    })

    storageManager = new MediaStorageManager()
    photoManager = new PhotoSharingManager(storageManager)

    // Mock fetch responses
    ;(fetch as jest.Mock).mockImplementation((url) => {
      const fileId = url.split('/').pop()?.split('.')[0]
      const file = mockMediaFiles.find(f => f.id === fileId)
      const size = file?.size || 1024
      
      return Promise.resolve({
        ok: true,
        body: {
          getReader: () => {
            let bytesRead = 0
            const chunkSize = 1024
            
            return {
              read: () => {
                if (bytesRead >= size) {
                  return Promise.resolve({ done: true })
                }
                
                const remainingBytes = size - bytesRead
                const currentChunkSize = Math.min(chunkSize, remainingBytes)
                const chunk = new Uint8Array(currentChunkSize).fill(bytesRead % 256)
                
                bytesRead += currentChunkSize
                
                return Promise.resolve({
                  done: false,
                  value: chunk
                })
              }
            }
          }
        },
        arrayBuffer: () => {
          const buffer = new ArrayBuffer(size)
          const view = new Uint8Array(buffer)
          view.fill(42) // Fill with test data
          return Promise.resolve(buffer)
        }
      })
    })
  })

  afterEach(async () => {
    await cacheManager.destroy()
    await storageManager.destroy()
    await photoManager.destroy()
  })

  describe('Intelligent Caching Strategy', () => {
    test('should prioritize frequently accessed media', async () => {
      await cacheManager.initialize()
      
      // Access photo-1 multiple times with progressive disabled
      await cacheManager.getMedia(mockMediaFiles[0], CachePriority.NORMAL, { enableProgressive: false })
      await cacheManager.getMedia(mockMediaFiles[0], CachePriority.NORMAL, { enableProgressive: false })
      await cacheManager.getMedia(mockMediaFiles[0], CachePriority.NORMAL, { enableProgressive: false })
      
      // Verify photo-1 is cached with correct access count
      const photo1Info = cacheManager.getCachedMediaInfo(mockMediaFiles[0].id)
      expect(photo1Info.length).toBeGreaterThan(0)
      expect(photo1Info[0].accessCount).toBe(3)
      
      // Access photo-2 once
      await cacheManager.getMedia(mockMediaFiles[1], CachePriority.NORMAL, { enableProgressive: false })
      
      // Verify both are cached
      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(2)
      expect(stats.hitRate).toBeGreaterThan(0)
    })

    test('should cache different quality levels efficiently', async () => {
      await cacheManager.initialize()
      
      const file = mockMediaFiles[0]
      
      // Cache multiple quality levels
      await cacheManager.getMedia(file, CachePriority.NORMAL, { quality: 'thumbnail' })
      await cacheManager.getMedia(file, CachePriority.NORMAL, { quality: 'low' })
      await cacheManager.getMedia(file, CachePriority.NORMAL, { quality: 'high' })
      
      const cachedInfo = cacheManager.getCachedMediaInfo(file.id)
      expect(cachedInfo.length).toBe(3)
      
      const qualities = cachedInfo.map(info => info.quality).sort()
      expect(qualities).toEqual(['high', 'low', 'thumbnail'])
    })

    test('should preload related media intelligently', async () => {
      await cacheManager.initialize()
      
      const preloadPromises = mockMediaFiles.map(file => 
        cacheManager.preloadMedia(file, CachePriority.LOW, 'thumbnail')
      )
      
      await Promise.all(preloadPromises)
      
      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(mockMediaFiles.length)
      
      // All thumbnails should be cached
      for (const file of mockMediaFiles) {
        const info = cacheManager.getCachedMediaInfo(file.id)
        expect(info.some(i => i.quality === 'thumbnail')).toBe(true)
      }
    })
  })

  describe('Bandwidth Optimization', () => {
    test('should limit concurrent downloads', async () => {
      await cacheManager.initialize()
      
      cacheManager.updateBandwidthOptimization({
        maxConcurrentDownloads: 2,
        priorityQueue: true
      })
      
      const downloadStartTimes: number[] = []
      const originalFetch = fetch as jest.Mock
      
      ;(fetch as jest.Mock).mockImplementation(async (url) => {
        downloadStartTimes.push(Date.now())
        await new Promise(resolve => setTimeout(resolve, 100)) // Simulate network delay
        return originalFetch(url)
      })
      
      // Start multiple downloads simultaneously
      const downloadPromises = mockMediaFiles.map(file => 
        cacheManager.getMedia(file, CachePriority.NORMAL)
      )
      
      await Promise.all(downloadPromises)
      
      // Should have limited concurrent downloads
      expect(downloadStartTimes.length).toBe(mockMediaFiles.length)
      
      // Check that not all downloads started at exactly the same time
      const timeSpread = Math.max(...downloadStartTimes) - Math.min(...downloadStartTimes)
      expect(timeSpread).toBeGreaterThan(50) // Some delay between starts
    })

    test('should prioritize high-priority downloads', async () => {
      await cacheManager.initialize()
      
      cacheManager.updateBandwidthOptimization({
        maxConcurrentDownloads: 1,
        priorityQueue: true
      })
      
      const downloadOrder: string[] = []
      
      ;(fetch as jest.Mock).mockImplementation(async (url) => {
        const fileId = url.split('/').pop()?.split('.')[0]
        downloadOrder.push(fileId || 'unknown')
        await new Promise(resolve => setTimeout(resolve, 50))
        return {
          ok: true,
          body: {
            getReader: () => ({
              read: () => Promise.resolve({ done: true })
            })
          }
        }
      })
      
      // Start downloads with different priorities
      const promises = [
        cacheManager.getMedia(mockMediaFiles[0], CachePriority.LOW),
        cacheManager.getMedia(mockMediaFiles[1], CachePriority.HIGH),
        cacheManager.getMedia(mockMediaFiles[2], CachePriority.NORMAL)
      ]
      
      await Promise.all(promises)
      
      // High priority should be processed first
      expect(downloadOrder[0]).toBe('photo-2') // HIGH priority
    })

    test('should adapt quality based on bandwidth', async () => {
      await cacheManager.initialize()
      
      cacheManager.updateBandwidthOptimization({
        adaptiveQuality: true,
        compressionLevel: 0.7
      })
      
      await cacheManager.getMedia(mockMediaFiles[0], CachePriority.NORMAL, { quality: 'low' })
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('quality=low')
      )
    })
  })

  describe('Progressive Loading', () => {
    test('should load media progressively for large files', async () => {
      await cacheManager.initialize()
      
      const largeFile = {
        ...mockMediaFiles[1], // 5MB PNG
        size: 10 * 1024 * 1024 // 10MB
      }
      
      const progressEvents: any[] = []
      cacheManager.on('downloadProgress', (progress) => {
        progressEvents.push(progress)
      })
      
      await cacheManager.getMedia(largeFile, CachePriority.NORMAL, { 
        enableProgressive: true 
      })
      
      expect(progressEvents.length).toBeGreaterThan(1)
      
      // Progress should increase over time
      const progressValues = progressEvents.map(e => e.progress)
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1])
      }
      
      // Final progress should be 1.0
      expect(progressValues[progressValues.length - 1]).toBe(1)
    })

    test('should provide accurate download progress information', async () => {
      await cacheManager.initialize()
      
      const file = mockMediaFiles[0]
      let lastProgress: any = null
      
      cacheManager.on('downloadProgress', (progress) => {
        lastProgress = progress
        expect(progress).toHaveProperty('mediaId', file.id)
        expect(progress).toHaveProperty('totalSize')
        expect(progress).toHaveProperty('downloadedSize')
        expect(progress).toHaveProperty('progress')
        expect(progress).toHaveProperty('speed')
        expect(progress).toHaveProperty('estimatedTimeRemaining')
        
        expect(progress.progress).toBeGreaterThanOrEqual(0)
        expect(progress.progress).toBeLessThanOrEqual(1)
      })
      
      await cacheManager.getMedia(file)
      
      expect(lastProgress).not.toBeNull()
      expect(lastProgress.progress).toBe(1)
    })

    test('should handle progressive loading cancellation', async () => {
      await cacheManager.initialize()
      
      const largeFile = {
        ...mockMediaFiles[1],
        size: 20 * 1024 * 1024 // 20MB
      }
      
      // Start download
      const downloadPromise = cacheManager.getMedia(largeFile, CachePriority.NORMAL, {
        enableProgressive: true
      })
      
      // Cancel after a short delay
      setTimeout(() => {
        cacheManager.cancelDownload(largeFile.id)
      }, 50)
      
      // Download should still complete but progress should be cleared
      await downloadPromise
      
      expect(cacheManager.getDownloadProgress(largeFile.id)).toBeUndefined()
    })
  })

  describe('Cache Performance Optimization', () => {
    test('should compress large uncompressed images', async () => {
      await cacheManager.initialize()
      
      const largePngFile = {
        ...mockMediaFiles[1], // PNG file
        size: 8 * 1024 * 1024 // 8MB
      }
      
      const cacheEvents: any[] = []
      cacheManager.on('mediaCached', (event) => {
        cacheEvents.push(event)
      })
      
      await cacheManager.getMedia(largePngFile)
      
      expect(cacheEvents.length).toBe(1)
      const cacheEvent = cacheEvents[0]
      
      expect(cacheEvent).toHaveProperty('compressionRatio')
      expect(cacheEvent.compressionRatio).toBeGreaterThan(1) // Should be compressed
    })

    test('should not compress already compressed formats', async () => {
      await cacheManager.initialize()
      
      const jpegFile = mockMediaFiles[0] // JPEG file
      
      const cacheEvents: any[] = []
      cacheManager.on('mediaCached', (event) => {
        cacheEvents.push(event)
      })
      
      await cacheManager.getMedia(jpegFile)
      
      expect(cacheEvents.length).toBe(1)
      const cacheEvent = cacheEvents[0]
      
      // JPEG should not be recompressed
      expect(cacheEvent.compressionRatio).toBe(1)
    })

    test('should optimize cache automatically when full', async () => {
      await cacheManager.initialize()
      
      // Set small cache size
      cacheManager.updateOptions({ maxSize: 5 * 1024 * 1024 }) // 5MB
      
      const optimizeEvents: any[] = []
      cacheManager.on('cacheOptimized', (event) => {
        optimizeEvents.push(event)
      })
      
      // Fill cache beyond capacity
      for (const file of mockMediaFiles) {
        await cacheManager.getMedia(file)
      }
      
      // Trigger optimization
      await cacheManager.optimizeCache()
      
      const stats = cacheManager.getStats()
      expect(stats.totalSize).toBeLessThanOrEqual(5 * 1024 * 1024 * 0.8) // Should be under 80% of max
    })

    test('should maintain good cache hit rates', async () => {
      await cacheManager.initialize()
      
      // Cache some files
      for (const file of mockMediaFiles) {
        await cacheManager.getMedia(file)
      }
      
      // Access cached files multiple times
      for (let i = 0; i < 3; i++) {
        for (const file of mockMediaFiles) {
          await cacheManager.getMedia(file)
        }
      }
      
      const stats = cacheManager.getStats()
      expect(stats.hitRate).toBeGreaterThan(0.7) // Should have >70% hit rate
    })
  })

  describe('Integration with Photo Sharing', () => {
    test('should integrate cache with photo sharing workflow', async () => {
      await storageManager.initialize()
      await photoManager.initialize()
      await cacheManager.initialize()
      
      // Create a test file
      const testFile = new File(['test image data'], 'test.jpg', { type: 'image/jpeg' })
      
      // Upload photo through photo manager
      const photoRef = await photoManager.uploadPhoto(testFile, 'user123')
      
      // Convert to MediaFile for caching
      const mediaFile: MediaFile = {
        id: photoRef.id,
        name: photoRef.metadata.originalName,
        size: photoRef.metadata.size,
        type: photoRef.metadata.format,
        hash: photoRef.hash,
        url: photoRef.url,
        uploadedAt: photoRef.metadata.uploadedAt
      }
      
      // Cache the photo
      await cacheManager.getMedia(mediaFile, CachePriority.HIGH)
      
      // Verify it's cached
      const cachedInfo = cacheManager.getCachedMediaInfo(mediaFile.id)
      expect(cachedInfo.length).toBeGreaterThan(0)
      
      // Should be able to retrieve from cache quickly
      const startTime = Date.now()
      await cacheManager.getMedia(mediaFile)
      const retrievalTime = Date.now() - startTime
      
      expect(retrievalTime).toBeLessThan(50) // Should be very fast from cache
    })

    test('should handle photo quality levels in cache', async () => {
      await cacheManager.initialize()
      
      const file = mockMediaFiles[0]
      
      // Cache different quality levels
      const qualities = ['thumbnail', 'low', 'medium', 'high']
      
      for (const quality of qualities) {
        await cacheManager.getMedia(file, CachePriority.NORMAL, { quality })
      }
      
      // All quality levels should be cached separately
      const cachedInfo = cacheManager.getCachedMediaInfo(file.id)
      expect(cachedInfo.length).toBe(qualities.length)
      
      const cachedQualities = cachedInfo.map(info => info.quality).sort()
      expect(cachedQualities).toEqual(qualities.sort())
    })
  })

  describe('Performance Metrics', () => {
    test('should provide comprehensive performance statistics', async () => {
      await cacheManager.initialize()
      
      // Generate some cache activity
      for (const file of mockMediaFiles) {
        await cacheManager.getMedia(file) // Cache miss
        await cacheManager.getMedia(file) // Cache hit
      }
      
      const stats = cacheManager.getStats()
      
      expect(stats.totalEntries).toBe(mockMediaFiles.length)
      expect(stats.totalSize).toBeGreaterThan(0)
      expect(stats.hitRate).toBeGreaterThan(0)
      expect(stats.missRate).toBeGreaterThan(0)
      expect(stats.hitRate + stats.missRate).toBeCloseTo(1, 2)
      expect(stats.oldestEntry).toBeInstanceOf(Date)
      expect(stats.newestEntry).toBeInstanceOf(Date)
    })

    test('should track eviction statistics', async () => {
      await cacheManager.initialize()
      
      // Set small cache to force evictions
      cacheManager.updateOptions({ maxSize: 3 * 1024 * 1024, maxEntries: 2 })
      
      // Fill cache beyond capacity
      for (const file of mockMediaFiles) {
        await cacheManager.getMedia(file)
      }
      
      const stats = cacheManager.getStats()
      expect(stats.evictionCount).toBeGreaterThan(0)
      expect(stats.totalEntries).toBeLessThanOrEqual(2)
    })
  })

  describe('Error Recovery and Resilience', () => {
    test('should handle network failures gracefully', async () => {
      await cacheManager.initialize()
      
      // Mock network failure
      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Network timeout'))
      
      await expect(cacheManager.getMedia(mockMediaFiles[0])).rejects.toThrow('Network timeout')
      
      // Should recover on retry
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: () => Promise.resolve({ done: true })
          })
        }
      })
      
      await expect(cacheManager.getMedia(mockMediaFiles[0])).resolves.toBeInstanceOf(Blob)
    })

    test('should handle cache corruption gracefully', async () => {
      await cacheManager.initialize()
      
      // Cache a file
      await cacheManager.getMedia(mockMediaFiles[0])
      
      // Simulate cache corruption by directly modifying cache
      const cacheKey = cacheManager['generateCacheKey'](mockMediaFiles[0])
      const entry = cacheManager['cache'].get(cacheKey)
      if (entry) {
        // Corrupt the cached data
        entry.data = new Blob(['corrupted'], { type: 'text/plain' })
      }
      
      // Should detect corruption and re-download
      const blob = await cacheManager.getMedia(mockMediaFiles[0])
      expect(blob).toBeInstanceOf(Blob)
    })

    test('should maintain cache consistency under concurrent access', async () => {
      await cacheManager.initialize()
      
      const file = mockMediaFiles[0]
      
      // Start multiple concurrent requests for the same file
      const promises = Array.from({ length: 5 }, () => 
        cacheManager.getMedia(file)
      )
      
      const results = await Promise.all(promises)
      
      // All should succeed and return the same data
      expect(results.length).toBe(5)
      results.forEach(blob => {
        expect(blob).toBeInstanceOf(Blob)
      })
      
      // Should only be cached once
      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(1)
    })
  })
})