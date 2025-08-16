import { MediaCacheManager, CachePriority, EvictionPolicy } from '../MediaCacheManager'
import { MediaStorageManager, MediaFile } from '../MediaStorageManager'
import { PhotoSharingManager } from '../PhotoSharingManager'

/**
 * Example demonstrating media caching and optimization features
 * This shows how to implement intelligent caching, bandwidth optimization,
 * and progressive loading for a P2P dating app
 */

export class MediaCacheOptimizationExample {
  private cacheManager: MediaCacheManager
  private storageManager: MediaStorageManager
  private photoManager: PhotoSharingManager
  private isInitialized = false

  constructor() {
    // Configure cache manager with optimized settings for dating app
    this.cacheManager = new MediaCacheManager({
      maxSize: 100 * 1024 * 1024, // 100MB cache for profile photos
      maxEntries: 500, // Up to 500 cached photos
      defaultTTL: 24 * 60 * 60 * 1000, // 24 hour cache lifetime
      evictionPolicy: EvictionPolicy.LRU, // Least Recently Used eviction
      compressionEnabled: true, // Enable compression for large images
      persistToDisk: true // Persist cache across app restarts
    })

    this.storageManager = new MediaStorageManager()
    this.photoManager = new PhotoSharingManager(this.storageManager)

    this.setupEventHandlers()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    console.log('🚀 Initializing Media Cache Optimization System...')

    try {
      await this.storageManager.initialize()
      await this.photoManager.initialize()
      await this.cacheManager.initialize()

      // Configure bandwidth optimization for mobile-friendly experience
      this.cacheManager.updateBandwidthOptimization({
        enabled: true,
        maxConcurrentDownloads: 3, // Limit concurrent downloads
        priorityQueue: true, // Prioritize important photos
        adaptiveQuality: true, // Adapt quality based on connection
        compressionLevel: 0.8 // Good balance of quality vs size
      })

      // Configure progressive loading for smooth UX
      this.cacheManager.updateProgressiveLoading({
        enabled: true,
        chunkSize: 64 * 1024, // 64KB chunks for responsive loading
        preloadChunks: 2, // Preload first 2 chunks
        qualityLevels: [
          { name: 'thumbnail', width: 150, height: 150, quality: 0.6 },
          { name: 'preview', width: 400, height: 400, quality: 0.7 },
          { name: 'standard', width: 800, height: 800, quality: 0.8 },
          { name: 'high', width: 1200, height: 1200, quality: 0.9 }
        ]
      })

      this.isInitialized = true
      console.log('✅ Media Cache Optimization System initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize Media Cache Optimization System:', error)
      throw error
    }
  }

  private setupEventHandlers(): void {
    // Cache performance monitoring
    this.cacheManager.on('cacheHit', ({ mediaId, size }) => {
      console.log(`📈 Cache hit for ${mediaId} (${this.formatBytes(size)})`)
    })

    this.cacheManager.on('cacheMiss', ({ mediaId }) => {
      console.log(`📉 Cache miss for ${mediaId} - downloading...`)
    })

    // Download progress tracking
    this.cacheManager.on('downloadProgress', (progress) => {
      const percent = Math.round(progress.progress * 100)
      const speed = this.formatBytes(progress.speed)
      console.log(`⬇️ Downloading ${progress.mediaId}: ${percent}% (${speed}/s)`)
    })

    this.cacheManager.on('downloadComplete', ({ mediaId, size }) => {
      console.log(`✅ Download complete: ${mediaId} (${this.formatBytes(size)})`)
    })

    // Cache optimization events
    this.cacheManager.on('entryEvicted', ({ mediaId, size, reason }) => {
      console.log(`🗑️ Evicted ${mediaId} (${this.formatBytes(size)}) - ${reason}`)
    })

    this.cacheManager.on('cacheOptimized', ({ removedCount, freedSize }) => {
      console.log(`🔧 Cache optimized: removed ${removedCount} entries, freed ${this.formatBytes(freedSize)}`)
    })

    // Compression events
    this.cacheManager.on('mediaCached', ({ mediaId, size, originalSize, compressionRatio }) => {
      if (compressionRatio > 1) {
        const savings = Math.round((1 - 1/compressionRatio) * 100)
        console.log(`🗜️ Compressed ${mediaId}: ${savings}% size reduction`)
      }
    })
  }

  /**
   * Demonstrate intelligent photo loading for profile browsing
   */
  async demonstrateProfileBrowsing(): Promise<void> {
    console.log('\n📱 === Profile Browsing Demo ===')

    // Simulate user profiles with photos
    const profiles = [
      {
        userId: 'user1',
        photos: [
          { id: 'photo1', url: 'https://cdn.example.com/user1/profile.jpg', size: 2 * 1024 * 1024 },
          { id: 'photo2', url: 'https://cdn.example.com/user1/beach.jpg', size: 3 * 1024 * 1024 }
        ]
      },
      {
        userId: 'user2',
        photos: [
          { id: 'photo3', url: 'https://cdn.example.com/user2/selfie.jpg', size: 1.5 * 1024 * 1024 },
          { id: 'photo4', url: 'https://cdn.example.com/user2/hiking.jpg', size: 4 * 1024 * 1024 }
        ]
      },
      {
        userId: 'user3',
        photos: [
          { id: 'photo5', url: 'https://cdn.example.com/user3/portrait.jpg', size: 2.5 * 1024 * 1024 }
        ]
      }
    ]

    // Step 1: Preload thumbnails for smooth scrolling
    console.log('🔄 Preloading thumbnails for smooth scrolling...')
    const thumbnailPromises = profiles.flatMap(profile =>
      profile.photos.map(photo => {
        const mediaFile = this.createMediaFile(photo)
        return this.cacheManager.preloadMedia(mediaFile, CachePriority.HIGH, 'thumbnail')
      })
    )
    await Promise.all(thumbnailPromises)

    // Step 2: Load preview quality when user focuses on a profile
    console.log('👀 User focused on profile - loading preview quality...')
    const focusedProfile = profiles[0]
    for (const photo of focusedProfile.photos) {
      const mediaFile = this.createMediaFile(photo)
      await this.cacheManager.getMedia(mediaFile, CachePriority.HIGH, { quality: 'preview' })
    }

    // Step 3: Load full quality when user views photo details
    console.log('🔍 User viewing photo details - loading full quality...')
    const detailPhoto = focusedProfile.photos[0]
    const mediaFile = this.createMediaFile(detailPhoto)
    await this.cacheManager.getMedia(mediaFile, CachePriority.CRITICAL, { quality: 'high' })

    // Step 4: Preload next profile photos in background
    console.log('⏭️ Preloading next profile photos in background...')
    const nextProfile = profiles[1]
    const backgroundPromises = nextProfile.photos.map(photo => {
      const mediaFile = this.createMediaFile(photo)
      return this.cacheManager.preloadMedia(mediaFile, CachePriority.LOW, 'preview')
    })
    await Promise.all(backgroundPromises)

    this.printCacheStats()
  }

  /**
   * Demonstrate progressive loading for large photos
   */
  async demonstrateProgressiveLoading(): Promise<void> {
    console.log('\n📊 === Progressive Loading Demo ===')

    // Simulate a large photo (10MB)
    const largePhoto = {
      id: 'large-photo',
      url: 'https://cdn.example.com/large-photo.jpg',
      size: 10 * 1024 * 1024 // 10MB
    }

    const mediaFile = this.createMediaFile(largePhoto)

    console.log('📥 Starting progressive download of large photo...')
    
    // Track download progress
    const progressHandler = (progress: any) => {
      const percent = Math.round(progress.progress * 100)
      const speed = this.formatBytes(progress.speed)
      const eta = Math.round(progress.estimatedTimeRemaining / 1000)
      
      if (progress.totalChunks) {
        console.log(`📊 Progress: ${percent}% (chunk ${progress.currentChunk}/${progress.totalChunks}) - ${speed}/s - ETA: ${eta}s`)
      } else {
        console.log(`📊 Progress: ${percent}% - ${speed}/s - ETA: ${eta}s`)
      }
    }

    this.cacheManager.on('downloadProgress', progressHandler)

    try {
      const blob = await this.cacheManager.getMedia(
        mediaFile, 
        CachePriority.NORMAL, 
        { enableProgressive: true }
      )
      
      console.log(`✅ Progressive download complete: ${this.formatBytes(blob.size)}`)
    } finally {
      this.cacheManager.off('downloadProgress', progressHandler)
    }
  }

  /**
   * Demonstrate bandwidth optimization features
   */
  async demonstrateBandwidthOptimization(): Promise<void> {
    console.log('\n🌐 === Bandwidth Optimization Demo ===')

    // Simulate different network conditions
    const networkScenarios = [
      { name: 'High-speed WiFi', maxConcurrent: 5, quality: 'high' },
      { name: 'Mobile 4G', maxConcurrent: 3, quality: 'standard' },
      { name: 'Slow 3G', maxConcurrent: 1, quality: 'preview' }
    ]

    for (const scenario of networkScenarios) {
      console.log(`📶 Optimizing for ${scenario.name}...`)
      
      // Update bandwidth settings
      this.cacheManager.updateBandwidthOptimization({
        maxConcurrentDownloads: scenario.maxConcurrent,
        adaptiveQuality: true
      })

      // Simulate downloading multiple photos
      const photos = Array.from({ length: 5 }, (_, i) => ({
        id: `photo-${scenario.name}-${i}`,
        url: `https://cdn.example.com/${scenario.name.toLowerCase()}/photo${i}.jpg`,
        size: 2 * 1024 * 1024
      }))

      const startTime = Date.now()
      const downloadPromises = photos.map(photo => {
        const mediaFile = this.createMediaFile(photo)
        return this.cacheManager.getMedia(mediaFile, CachePriority.NORMAL, { 
          quality: scenario.quality 
        })
      })

      await Promise.all(downloadPromises)
      const duration = Date.now() - startTime
      
      console.log(`⏱️ Downloaded ${photos.length} photos in ${duration}ms (${scenario.name})`)
    }
  }

  /**
   * Demonstrate cache optimization and management
   */
  async demonstrateCacheOptimization(): Promise<void> {
    console.log('\n🔧 === Cache Optimization Demo ===')

    // Fill cache with various photos
    console.log('📦 Filling cache with test photos...')
    const testPhotos = Array.from({ length: 20 }, (_, i) => ({
      id: `test-photo-${i}`,
      url: `https://cdn.example.com/test/photo${i}.jpg`,
      size: Math.random() * 5 * 1024 * 1024 // Random size up to 5MB
    }))

    // Add photos with different priorities and access patterns
    for (let i = 0; i < testPhotos.length; i++) {
      const photo = testPhotos[i]
      const mediaFile = this.createMediaFile(photo)
      
      // Vary priority and access frequency
      const priority = i < 5 ? CachePriority.HIGH : 
                      i < 10 ? CachePriority.NORMAL : CachePriority.LOW
      
      await this.cacheManager.getMedia(mediaFile, priority)
      
      // Access some photos multiple times to simulate user behavior
      if (i < 3) {
        await this.cacheManager.getMedia(mediaFile, priority)
        await this.cacheManager.getMedia(mediaFile, priority)
      }
    }

    this.printCacheStats()

    // Demonstrate cache optimization
    console.log('🔧 Running cache optimization...')
    const optimizationResult = await this.cacheManager.optimizeCache()
    console.log(`✅ Optimization complete: removed ${optimizationResult.removedCount} entries, freed ${this.formatBytes(optimizationResult.freedSize)}`)

    this.printCacheStats()

    // Demonstrate selective cache clearing
    console.log('🗑️ Removing specific photos from cache...')
    const removedCount = testPhotos.slice(0, 5).reduce((count, photo) => {
      return this.cacheManager.removeFromCache(photo.id) ? count + 1 : count
    }, 0)
    console.log(`🗑️ Removed ${removedCount} photos from cache`)

    this.printCacheStats()
  }

  /**
   * Demonstrate cache performance monitoring
   */
  async demonstratePerformanceMonitoring(): Promise<void> {
    console.log('\n📊 === Performance Monitoring Demo ===')

    // Simulate realistic usage patterns
    const photos = Array.from({ length: 10 }, (_, i) => ({
      id: `perf-photo-${i}`,
      url: `https://cdn.example.com/perf/photo${i}.jpg`,
      size: 2 * 1024 * 1024
    }))

    console.log('📈 Simulating realistic usage patterns...')

    // First access - all cache misses
    console.log('🔄 First access (cache misses)...')
    for (const photo of photos) {
      const mediaFile = this.createMediaFile(photo)
      await this.cacheManager.getMedia(mediaFile)
    }

    // Second access - all cache hits
    console.log('🔄 Second access (cache hits)...')
    for (const photo of photos) {
      const mediaFile = this.createMediaFile(photo)
      await this.cacheManager.getMedia(mediaFile)
    }

    // Random access pattern
    console.log('🔄 Random access pattern...')
    for (let i = 0; i < 20; i++) {
      const randomPhoto = photos[Math.floor(Math.random() * photos.length)]
      const mediaFile = this.createMediaFile(randomPhoto)
      await this.cacheManager.getMedia(mediaFile)
    }

    // Print detailed performance statistics
    this.printDetailedStats()
  }

  /**
   * Demonstrate integration with photo sharing features
   */
  async demonstratePhotoSharingIntegration(): Promise<void> {
    console.log('\n🤝 === Photo Sharing Integration Demo ===')

    // Simulate uploading a photo
    console.log('📤 Uploading new photo...')
    const testFile = new File(['test photo data'], 'my-photo.jpg', { type: 'image/jpeg' })
    
    try {
      const photoRef = await this.photoManager.uploadPhoto(testFile, 'user123', {
        enableP2P: true,
        enableIPFS: false,
        enableCDN: true,
        generateThumbnail: true,
        stripExif: true,
        maxDimensions: { width: 1200, height: 1200 },
        compressionQuality: 0.8,
        requireVerification: true
      })

      console.log(`✅ Photo uploaded: ${photoRef.id}`)

      // Convert to MediaFile and cache it
      const mediaFile: MediaFile = {
        id: photoRef.id,
        name: photoRef.metadata.originalName,
        size: photoRef.metadata.size,
        type: photoRef.metadata.format,
        hash: photoRef.hash,
        url: photoRef.url,
        uploadedAt: photoRef.metadata.uploadedAt
      }

      // Cache the uploaded photo with high priority
      console.log('💾 Caching uploaded photo...')
      await this.cacheManager.getMedia(mediaFile, CachePriority.CRITICAL)

      // Cache thumbnail version
      console.log('🖼️ Caching thumbnail version...')
      await this.cacheManager.getMedia(mediaFile, CachePriority.HIGH, { quality: 'thumbnail' })

      console.log('✅ Photo sharing integration complete')
    } catch (error) {
      console.log('⚠️ Photo sharing integration demo skipped (simulated environment)')
    }
  }

  private createMediaFile(photo: { id: string; url: string; size: number }): MediaFile {
    return {
      id: photo.id,
      name: `${photo.id}.jpg`,
      size: photo.size,
      type: 'image/jpeg',
      hash: `hash_${photo.id}`,
      url: photo.url,
      uploadedAt: new Date()
    }
  }

  private printCacheStats(): void {
    const stats = this.cacheManager.getStats()
    console.log('\n📊 Cache Statistics:')
    console.log(`   Entries: ${stats.totalEntries}`)
    console.log(`   Size: ${this.formatBytes(stats.totalSize)} / ${this.formatBytes(stats.maxSize)}`)
    console.log(`   Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`)
    console.log(`   Miss Rate: ${(stats.missRate * 100).toFixed(1)}%`)
    console.log(`   Evictions: ${stats.evictionCount}`)
    if (stats.oldestEntry) {
      console.log(`   Oldest Entry: ${stats.oldestEntry.toLocaleTimeString()}`)
    }
    if (stats.newestEntry) {
      console.log(`   Newest Entry: ${stats.newestEntry.toLocaleTimeString()}`)
    }
  }

  private printDetailedStats(): void {
    const stats = this.cacheManager.getStats()
    
    console.log('\n📈 Detailed Performance Statistics:')
    console.log(`   Cache Efficiency: ${(stats.hitRate * 100).toFixed(2)}%`)
    console.log(`   Storage Utilization: ${((stats.totalSize / stats.maxSize) * 100).toFixed(1)}%`)
    console.log(`   Average Entry Size: ${this.formatBytes(stats.totalSize / stats.totalEntries)}`)
    
    const cacheAge = stats.newestEntry && stats.oldestEntry ? 
      stats.newestEntry.getTime() - stats.oldestEntry.getTime() : 0
    console.log(`   Cache Age Spread: ${Math.round(cacheAge / 1000)}s`)
    
    // Calculate estimated memory savings from compression
    const estimatedOriginalSize = stats.totalSize * 1.3 // Assume 30% compression on average
    const savings = estimatedOriginalSize - stats.totalSize
    console.log(`   Estimated Compression Savings: ${this.formatBytes(savings)}`)
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  /**
   * Run all demonstrations
   */
  async runAllDemonstrations(): Promise<void> {
    try {
      await this.initialize()
      
      await this.demonstrateProfileBrowsing()
      await this.demonstrateProgressiveLoading()
      await this.demonstrateBandwidthOptimization()
      await this.demonstrateCacheOptimization()
      await this.demonstratePerformanceMonitoring()
      await this.demonstratePhotoSharingIntegration()
      
      console.log('\n🎉 All media cache optimization demonstrations completed successfully!')
      
    } catch (error) {
      console.error('❌ Demonstration failed:', error)
      throw error
    }
  }

  async destroy(): Promise<void> {
    await this.cacheManager.destroy()
    await this.photoManager.destroy()
    await this.storageManager.destroy()
    console.log('🧹 Media Cache Optimization Example cleaned up')
  }
}

// Example usage
export async function runMediaCacheOptimizationExample(): Promise<void> {
  const example = new MediaCacheOptimizationExample()
  
  try {
    await example.runAllDemonstrations()
  } finally {
    await example.destroy()
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runMediaCacheOptimizationExample().catch(console.error)
}