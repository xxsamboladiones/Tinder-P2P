import { EventEmitter } from './utils/EventEmitter'
import { MediaFile } from './MediaStorageManager'

export interface CacheEntry {
  id: string
  mediaFile: MediaFile
  data: Blob
  cachedAt: Date
  lastAccessed: Date
  accessCount: number
  size: number
  priority: CachePriority
  expiresAt?: Date
}

export enum CachePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  maxSize: number
  hitRate: number
  missRate: number
  evictionCount: number
  oldestEntry?: Date
  newestEntry?: Date
}

export interface CacheOptions {
  maxSize: number // Maximum cache size in bytes
  maxEntries: number // Maximum number of entries
  defaultTTL: number // Default time-to-live in milliseconds
  evictionPolicy: EvictionPolicy
  compressionEnabled: boolean
  persistToDisk: boolean
}

export enum EvictionPolicy {
  LRU = 'lru', // Least Recently Used
  LFU = 'lfu', // Least Frequently Used
  FIFO = 'fifo', // First In, First Out
  TTL = 'ttl' // Time To Live based
}

export interface BandwidthOptimization {
  enabled: boolean
  maxConcurrentDownloads: number
  priorityQueue: boolean
  adaptiveQuality: boolean
  compressionLevel: number
}

export interface ProgressiveLoadingOptions {
  enabled: boolean
  chunkSize: number // Size of each chunk in bytes
  preloadChunks: number // Number of chunks to preload
  qualityLevels: QualityLevel[]
}

export interface QualityLevel {
  name: string
  width: number
  height: number
  quality: number // 0-1
  bitrate?: number
}

export interface DownloadProgress {
  mediaId: string
  totalSize: number
  downloadedSize: number
  progress: number // 0-1
  speed: number // bytes per second
  estimatedTimeRemaining: number // milliseconds
  currentChunk?: number
  totalChunks?: number
}

export class MediaCacheManager extends EventEmitter {
  private cache = new Map<string, CacheEntry>()
  private accessOrder: string[] = [] // For LRU tracking
  private accessFrequency = new Map<string, number>() // For LFU tracking
  private downloadQueue: string[] = []
  private activeDownloads = new Map<string, Promise<Blob>>()
  private downloadProgress = new Map<string, DownloadProgress>()
  
  private options: CacheOptions
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  }
  
  private isInitialized = false
  private cleanupInterval: NodeJS.Timeout | null = null
  private bandwidthOptimization: BandwidthOptimization
  private progressiveLoading: ProgressiveLoadingOptions

  constructor(options: Partial<CacheOptions> = {}) {
    super()
    
    this.options = {
      maxSize: options.maxSize || 100 * 1024 * 1024, // 100MB default
      maxEntries: options.maxEntries || 1000,
      defaultTTL: options.defaultTTL || 24 * 60 * 60 * 1000, // 24 hours
      evictionPolicy: options.evictionPolicy || EvictionPolicy.LRU,
      compressionEnabled: options.compressionEnabled ?? true,
      persistToDisk: options.persistToDisk ?? true
    }

    this.bandwidthOptimization = {
      enabled: true,
      maxConcurrentDownloads: 3,
      priorityQueue: true,
      adaptiveQuality: true,
      compressionLevel: 0.8
    }

    this.progressiveLoading = {
      enabled: true,
      chunkSize: 64 * 1024, // 64KB chunks
      preloadChunks: 3,
      qualityLevels: [
        { name: 'thumbnail', width: 150, height: 150, quality: 0.5 },
        { name: 'low', width: 400, height: 400, quality: 0.6 },
        { name: 'medium', width: 800, height: 800, quality: 0.8 },
        { name: 'high', width: 1200, height: 1200, quality: 0.9 },
        { name: 'original', width: 4096, height: 4096, quality: 1.0 }
      ]
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Load cache from persistent storage if enabled
      if (this.options.persistToDisk) {
        await this.loadCacheFromDisk()
      }

      // Start cleanup timer
      this.startCleanupTimer()
      
      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      console.error('Failed to initialize MediaCacheManager:', error)
      throw error
    }
  }

  /**
   * Get media from cache or download if not cached
   */
  async getMedia(
    mediaFile: MediaFile,
    priority: CachePriority = CachePriority.NORMAL,
    progressiveOptions?: {
      quality?: string
      enableProgressive?: boolean
    }
  ): Promise<Blob> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const cacheKey = this.generateCacheKey(mediaFile, progressiveOptions?.quality)
    
    // Check cache first
    const cached = this.getCachedEntry(cacheKey)
    if (cached) {
      this.updateAccessInfo(cacheKey)
      this.stats.hits++
      this.emit('cacheHit', { mediaId: mediaFile.id, size: cached.size })
      return cached.data
    }

    this.stats.misses++
    this.emit('cacheMiss', { mediaId: mediaFile.id })

    // Download and cache
    return this.downloadAndCache(mediaFile, priority, progressiveOptions)
  }

  /**
   * Download media with progressive loading and bandwidth optimization
   */
  private async downloadAndCache(
    mediaFile: MediaFile,
    priority: CachePriority,
    progressiveOptions?: {
      quality?: string
      enableProgressive?: boolean
    }
  ): Promise<Blob> {
    const cacheKey = this.generateCacheKey(mediaFile, progressiveOptions?.quality)
    
    // Check if already downloading
    if (this.activeDownloads.has(cacheKey)) {
      return this.activeDownloads.get(cacheKey)!
    }

    // Add to download queue with priority
    if (this.bandwidthOptimization.priorityQueue) {
      this.addToDownloadQueue(cacheKey, priority)
    }

    const downloadPromise = this.performDownload(mediaFile, progressiveOptions)
    this.activeDownloads.set(cacheKey, downloadPromise)

    try {
      const blob = await downloadPromise
      
      // Cache the result
      await this.cacheMedia(cacheKey, mediaFile, blob, priority)
      
      return blob
    } finally {
      this.activeDownloads.delete(cacheKey)
      this.removeFromDownloadQueue(cacheKey)
    }
  }

  /**
   * Perform the actual download with progressive loading
   */
  private async performDownload(
    mediaFile: MediaFile,
    progressiveOptions?: {
      quality?: string
      enableProgressive?: boolean
    }
  ): Promise<Blob> {
    const enableProgressive = progressiveOptions?.enableProgressive ?? this.progressiveLoading.enabled
    const quality = progressiveOptions?.quality

    if (enableProgressive && mediaFile.size > this.progressiveLoading.chunkSize * 2) {
      return this.downloadProgressively(mediaFile, quality)
    } else {
      return this.downloadComplete(mediaFile, quality)
    }
  }

  /**
   * Download media progressively in chunks
   */
  private async downloadProgressively(
    mediaFile: MediaFile,
    quality?: string
  ): Promise<Blob> {
    const totalSize = mediaFile.size
    const chunkSize = this.progressiveLoading.chunkSize
    const totalChunks = Math.ceil(totalSize / chunkSize)
    
    const progress: DownloadProgress = {
      mediaId: mediaFile.id,
      totalSize,
      downloadedSize: 0,
      progress: 0,
      speed: 0,
      estimatedTimeRemaining: 0,
      currentChunk: 0,
      totalChunks
    }

    this.downloadProgress.set(mediaFile.id, progress)
    
    const chunks: Uint8Array[] = []
    const startTime = Date.now()

    try {
      // Download chunks sequentially or in parallel based on bandwidth
      const maxConcurrent = this.bandwidthOptimization.maxConcurrentDownloads
      
      for (let i = 0; i < totalChunks; i += maxConcurrent) {
        const chunkPromises: Promise<Uint8Array>[] = []
        
        for (let j = 0; j < maxConcurrent && i + j < totalChunks; j++) {
          const chunkIndex = i + j
          const start = chunkIndex * chunkSize
          const end = Math.min(start + chunkSize - 1, totalSize - 1)
          
          chunkPromises.push(this.downloadChunk(mediaFile, start, end, quality))
        }

        const chunkResults = await Promise.all(chunkPromises)
        chunks.push(...chunkResults)

        // Update progress
        progress.currentChunk = i + chunkPromises.length
        progress.downloadedSize = progress.currentChunk * chunkSize
        progress.progress = Math.min(progress.downloadedSize / totalSize, 1)
        
        const elapsed = Date.now() - startTime
        progress.speed = progress.downloadedSize / (elapsed / 1000)
        progress.estimatedTimeRemaining = elapsed * (1 - progress.progress) / progress.progress

        this.emit('downloadProgress', { ...progress })
      }

      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }

      const blob = new Blob([result], { type: mediaFile.type })
      
      progress.progress = 1
      progress.downloadedSize = totalSize
      this.emit('downloadComplete', { mediaId: mediaFile.id, size: totalSize })
      
      return blob
    } finally {
      this.downloadProgress.delete(mediaFile.id)
    }
  }

  /**
   * Download a specific chunk of media
   */
  private async downloadChunk(
    mediaFile: MediaFile,
    start: number,
    end: number,
    quality?: string
  ): Promise<Uint8Array> {
    // Try P2P sources first if available
    if (mediaFile.torrentMagnet || mediaFile.ipfsCid) {
      try {
        return await this.downloadChunkP2P(mediaFile, start, end)
      } catch (error) {
        console.warn('P2P chunk download failed, falling back to CDN:', error)
      }
    }

    // Fallback to CDN
    if (mediaFile.url) {
      return this.downloadChunkCDN(mediaFile.url, start, end, quality)
    }

    throw new Error('No download sources available')
  }

  /**
   * Download chunk from P2P sources
   */
  private async downloadChunkP2P(
    mediaFile: MediaFile,
    start: number,
    end: number
  ): Promise<Uint8Array> {
    // This would integrate with WebTorrent or IPFS for chunk-based downloads
    // For now, we'll simulate the behavior
    throw new Error('P2P chunk download not implemented in this version')
  }

  /**
   * Download chunk from CDN with range request
   */
  private async downloadChunkCDN(
    url: string,
    start: number,
    end: number,
    quality?: string
  ): Promise<Uint8Array> {
    const headers: Record<string, string> = {
      'Range': `bytes=${start}-${end}`
    }

    if (quality) {
      headers['Accept'] = this.getAcceptHeaderForQuality(quality)
    }

    const response = await fetch(url, { headers })
    
    if (!response.ok) {
      throw new Error(`CDN chunk download failed: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }

  /**
   * Download complete media file
   */
  private async downloadComplete(mediaFile: MediaFile, quality?: string): Promise<Blob> {
    const progress: DownloadProgress = {
      mediaId: mediaFile.id,
      totalSize: mediaFile.size,
      downloadedSize: 0,
      progress: 0,
      speed: 0,
      estimatedTimeRemaining: 0
    }

    this.downloadProgress.set(mediaFile.id, progress)
    const startTime = Date.now()

    try {
      let url = mediaFile.url
      
      // Apply quality optimization if requested
      if (quality && this.bandwidthOptimization.adaptiveQuality) {
        url = this.getQualityOptimizedUrl(mediaFile.url, quality)
      }

      if (!url) {
        throw new Error('No download URL available')
      }

      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body available')
      }

      const chunks: Uint8Array[] = []
      let downloadedSize = 0

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        
        chunks.push(value)
        downloadedSize += value.length
        
        // Update progress
        progress.downloadedSize = downloadedSize
        progress.progress = downloadedSize / mediaFile.size
        
        const elapsed = Date.now() - startTime
        progress.speed = downloadedSize / (elapsed / 1000)
        progress.estimatedTimeRemaining = elapsed * (1 - progress.progress) / progress.progress

        this.emit('downloadProgress', { ...progress })
      }

      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }

      const blob = new Blob([result], { type: mediaFile.type })
      
      this.emit('downloadComplete', { mediaId: mediaFile.id, size: totalLength })
      
      return blob
    } finally {
      this.downloadProgress.delete(mediaFile.id)
    }
  }

  /**
   * Cache media with intelligent eviction
   */
  private async cacheMedia(
    cacheKey: string,
    mediaFile: MediaFile,
    data: Blob,
    priority: CachePriority
  ): Promise<void> {
    const size = data.size
    
    // Check if we need to make space
    await this.ensureCacheSpace(size)
    
    // Compress if enabled and beneficial
    let finalData = data
    if (this.options.compressionEnabled && this.shouldCompress(mediaFile)) {
      try {
        finalData = await this.compressMedia(data, mediaFile.type)
      } catch (error) {
        console.warn('Media compression failed, using original:', error)
      }
    }

    const entry: CacheEntry = {
      id: cacheKey,
      mediaFile,
      data: finalData,
      cachedAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      size: finalData.size,
      priority,
      expiresAt: new Date(Date.now() + this.options.defaultTTL)
    }

    this.cache.set(cacheKey, entry)
    this.updateAccessOrder(cacheKey)
    
    // Persist to disk if enabled
    if (this.options.persistToDisk) {
      await this.persistCacheEntry(entry)
    }

    this.emit('mediaCached', { 
      mediaId: mediaFile.id, 
      size: finalData.size, 
      originalSize: data.size,
      compressionRatio: data.size / finalData.size
    })
  }

  /**
   * Ensure there's enough space in cache
   */
  private async ensureCacheSpace(requiredSize: number): Promise<void> {
    const currentSize = this.getCurrentCacheSize()
    const availableSpace = this.options.maxSize - currentSize
    
    if (availableSpace >= requiredSize && this.cache.size < this.options.maxEntries) {
      return // Enough space available
    }

    // Need to evict entries
    const toEvict = this.selectEntriesForEviction(requiredSize)
    
    for (const entryId of toEvict) {
      await this.evictEntry(entryId)
    }
  }

  /**
   * Select entries for eviction based on policy
   */
  private selectEntriesForEviction(requiredSize: number): string[] {
    const entries = Array.from(this.cache.entries())
    const toEvict: string[] = []
    let freedSize = 0

    switch (this.options.evictionPolicy) {
      case EvictionPolicy.LRU:
        // Sort by last accessed (oldest first)
        entries.sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime())
        break
        
      case EvictionPolicy.LFU:
        // Sort by access count (least frequent first)
        entries.sort((a, b) => a[1].accessCount - b[1].accessCount)
        break
        
      case EvictionPolicy.FIFO:
        // Sort by cached time (oldest first)
        entries.sort((a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime())
        break
        
      case EvictionPolicy.TTL:
        // Sort by expiration time (soonest to expire first)
        entries.sort((a, b) => {
          const aExpiry = a[1].expiresAt?.getTime() || Infinity
          const bExpiry = b[1].expiresAt?.getTime() || Infinity
          return aExpiry - bExpiry
        })
        break
    }

    // Select entries to evict, respecting priority
    for (const [entryId, entry] of entries) {
      // Don't evict critical priority items unless absolutely necessary
      if (entry.priority === CachePriority.CRITICAL && freedSize < requiredSize * 0.8) {
        continue
      }
      
      toEvict.push(entryId)
      freedSize += entry.size
      
      if (freedSize >= requiredSize && toEvict.length >= 1) {
        break
      }
    }

    return toEvict
  }

  /**
   * Evict a cache entry
   */
  private async evictEntry(entryId: string): Promise<void> {
    const entry = this.cache.get(entryId)
    if (!entry) return

    this.cache.delete(entryId)
    this.removeFromAccessOrder(entryId)
    this.accessFrequency.delete(entryId)
    
    // Remove from persistent storage
    if (this.options.persistToDisk) {
      await this.removeCacheEntryFromDisk(entryId)
    }

    this.stats.evictions++
    this.emit('entryEvicted', { 
      mediaId: entry.mediaFile.id, 
      size: entry.size,
      reason: this.options.evictionPolicy
    })
  }

  /**
   * Get cached entry and update access info
   */
  private getCachedEntry(cacheKey: string): CacheEntry | null {
    const entry = this.cache.get(cacheKey)
    if (!entry) return null

    // Check if expired
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.evictEntry(cacheKey)
      return null
    }

    return entry
  }

  /**
   * Update access information for cache entry
   */
  private updateAccessInfo(cacheKey: string): void {
    const entry = this.cache.get(cacheKey)
    if (!entry) return

    entry.lastAccessed = new Date()
    entry.accessCount++
    
    this.updateAccessOrder(cacheKey)
    this.accessFrequency.set(cacheKey, entry.accessCount)
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(cacheKey: string): void {
    // Remove from current position
    const index = this.accessOrder.indexOf(cacheKey)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
    
    // Add to end (most recently used)
    this.accessOrder.push(cacheKey)
  }

  /**
   * Remove from access order tracking
   */
  private removeFromAccessOrder(cacheKey: string): void {
    const index = this.accessOrder.indexOf(cacheKey)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  /**
   * Generate cache key for media
   */
  private generateCacheKey(mediaFile: MediaFile, quality?: string): string {
    const qualityPart = quality ? `_${quality}` : ''
    return `${mediaFile.id}_${mediaFile.hash}${qualityPart}`
  }

  /**
   * Get current total cache size
   */
  private getCurrentCacheSize(): number {
    return Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0)
  }

  /**
   * Check if media should be compressed
   */
  private shouldCompress(mediaFile: MediaFile): boolean {
    // Don't compress already compressed formats
    const compressedFormats = ['image/jpeg', 'image/webp', 'video/mp4', 'video/webm']
    if (compressedFormats.includes(mediaFile.type)) {
      return false
    }

    // Compress large files
    return mediaFile.size > 1024 * 1024 // 1MB threshold
  }

  /**
   * Compress media data
   */
  private async compressMedia(data: Blob, mimeType: string): Promise<Blob> {
    // For images, we can use canvas compression
    if (mimeType.startsWith('image/')) {
      return this.compressImage(data, mimeType)
    }

    // For other types, we could use compression libraries
    // For now, return original
    return data
  }

  /**
   * Compress image using canvas
   */
  private async compressImage(data: Blob, mimeType: string): Promise<Blob> {
    // In test environment, return original
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return data
    }

    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()

      // Set timeout for image loading
      const timeout = setTimeout(() => {
        reject(new Error('Image compression timeout'))
      }, 1000)

      img.onload = () => {
        clearTimeout(timeout)
        try {
          canvas.width = img.width
          canvas.height = img.height
          ctx?.drawImage(img, 0, 0)
          
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob)
              } else {
                reject(new Error('Failed to compress image'))
              }
            },
            mimeType,
            this.bandwidthOptimization.compressionLevel
          )
        } catch (error) {
          reject(error)
        }
      }

      img.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Failed to load image for compression'))
      }
      
      try {
        img.src = URL.createObjectURL(data)
      } catch (error) {
        clearTimeout(timeout)
        reject(error)
      }
    })
  }

  /**
   * Get quality-optimized URL
   */
  private getQualityOptimizedUrl(baseUrl?: string, quality?: string): string | undefined {
    if (!baseUrl || !quality) return baseUrl

    // This would typically add quality parameters to the URL
    // For example: ?quality=low, ?w=400&h=400, etc.
    const url = new URL(baseUrl)
    url.searchParams.set('quality', quality)
    
    const qualityLevel = this.progressiveLoading.qualityLevels.find(q => q.name === quality)
    if (qualityLevel) {
      url.searchParams.set('w', qualityLevel.width.toString())
      url.searchParams.set('h', qualityLevel.height.toString())
      url.searchParams.set('q', qualityLevel.quality.toString())
    }
    
    return url.toString()
  }

  /**
   * Get Accept header for quality
   */
  private getAcceptHeaderForQuality(quality: string): string {
    const qualityLevel = this.progressiveLoading.qualityLevels.find(q => q.name === quality)
    if (!qualityLevel) {
      return 'image/*'
    }

    // Return appropriate Accept header based on quality
    if (qualityLevel.quality < 0.7) {
      return 'image/webp, image/jpeg;q=0.8, image/*;q=0.5'
    } else {
      return 'image/webp, image/png, image/jpeg, image/*'
    }
  }

  /**
   * Add to download queue with priority
   */
  private addToDownloadQueue(cacheKey: string, priority: CachePriority): void {
    // Insert based on priority (higher priority first)
    let insertIndex = this.downloadQueue.length
    
    for (let i = 0; i < this.downloadQueue.length; i++) {
      const existingKey = this.downloadQueue[i]
      const existingEntry = this.cache.get(existingKey)
      const existingPriority = existingEntry?.priority || CachePriority.NORMAL
      
      if (priority > existingPriority) {
        insertIndex = i
        break
      }
    }
    
    this.downloadQueue.splice(insertIndex, 0, cacheKey)
  }

  /**
   * Remove from download queue
   */
  private removeFromDownloadQueue(cacheKey: string): void {
    const index = this.downloadQueue.indexOf(cacheKey)
    if (index > -1) {
      this.downloadQueue.splice(index, 1)
    }
  }

  /**
   * Start cleanup timer for expired entries
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries()
    }, 60 * 60 * 1000) // Run every hour
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = new Date()
    const expiredKeys: string[] = []

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.evictEntry(key)
    }

    if (expiredKeys.length > 0) {
      this.emit('expiredEntriesCleanup', { count: expiredKeys.length })
    }
  }

  /**
   * Load cache from persistent storage
   */
  private async loadCacheFromDisk(): Promise<void> {
    try {
      // In a real implementation, this would load from IndexedDB or file system
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem('media_cache_metadata')
        if (stored) {
          const metadata = JSON.parse(stored)
          console.log(`Loaded cache metadata for ${Object.keys(metadata).length} entries`)
          // Note: Actual blob data would be stored separately in IndexedDB
        }
      }
    } catch (error) {
      console.warn('Failed to load cache from disk:', error)
    }
  }

  /**
   * Persist cache entry to disk
   */
  private async persistCacheEntry(entry: CacheEntry): Promise<void> {
    try {
      // In a real implementation, this would save to IndexedDB
      if (typeof window !== 'undefined' && window.localStorage) {
        const metadata = {
          id: entry.id,
          mediaFile: entry.mediaFile,
          cachedAt: entry.cachedAt.toISOString(),
          lastAccessed: entry.lastAccessed.toISOString(),
          accessCount: entry.accessCount,
          size: entry.size,
          priority: entry.priority,
          expiresAt: entry.expiresAt?.toISOString()
        }
        
        const existing = localStorage.getItem('media_cache_metadata')
        const allMetadata = existing ? JSON.parse(existing) : {}
        allMetadata[entry.id] = metadata
        
        localStorage.setItem('media_cache_metadata', JSON.stringify(allMetadata))
      }
    } catch (error) {
      console.warn('Failed to persist cache entry:', error)
    }
  }

  /**
   * Remove cache entry from disk
   */
  private async removeCacheEntryFromDisk(entryId: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const existing = localStorage.getItem('media_cache_metadata')
        if (existing) {
          const allMetadata = JSON.parse(existing)
          delete allMetadata[entryId]
          localStorage.setItem('media_cache_metadata', JSON.stringify(allMetadata))
        }
      }
    } catch (error) {
      console.warn('Failed to remove cache entry from disk:', error)
    }
  }

  // Public API methods

  /**
   * Preload media with specified priority
   */
  async preloadMedia(
    mediaFile: MediaFile,
    priority: CachePriority = CachePriority.LOW,
    quality?: string
  ): Promise<void> {
    try {
      await this.getMedia(mediaFile, priority, { quality, enableProgressive: true })
      this.emit('mediaPreloaded', { mediaId: mediaFile.id, quality })
    } catch (error) {
      this.emit('preloadError', { mediaId: mediaFile.id, error })
    }
  }

  /**
   * Get download progress for a media file
   */
  getDownloadProgress(mediaId: string): DownloadProgress | undefined {
    return this.downloadProgress.get(mediaId)
  }

  /**
   * Cancel ongoing download
   */
  cancelDownload(mediaId: string): boolean {
    const progress = this.downloadProgress.get(mediaId)
    if (progress) {
      this.downloadProgress.delete(mediaId)
      this.emit('downloadCancelled', { mediaId })
      return true
    }
    return false
  }

  /**
   * Clear entire cache
   */
  async clearCache(): Promise<void> {
    const clearedCount = this.cache.size
    const clearedSize = this.getCurrentCacheSize()
    
    this.cache.clear()
    this.accessOrder.length = 0
    this.accessFrequency.clear()
    
    // Clear persistent storage
    if (this.options.persistToDisk) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem('media_cache_metadata')
        }
      } catch (error) {
        console.warn('Failed to clear persistent cache:', error)
      }
    }

    this.emit('cacheCleared', { clearedCount, clearedSize })
  }

  /**
   * Remove specific media from cache
   */
  removeFromCache(mediaId: string): boolean {
    const keys = Array.from(this.cache.keys()).filter(key => key.startsWith(mediaId))
    let removed = false
    
    for (const key of keys) {
      if (this.cache.has(key)) {
        this.evictEntry(key)
        removed = true
      }
    }
    
    return removed
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values())
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0)
    const totalRequests = this.stats.hits + this.stats.misses
    
    return {
      totalEntries: this.cache.size,
      totalSize,
      maxSize: this.options.maxSize,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.misses / totalRequests : 0,
      evictionCount: this.stats.evictions,
      oldestEntry: entries.length > 0 ? 
        new Date(Math.min(...entries.map(e => e.cachedAt.getTime()))) : undefined,
      newestEntry: entries.length > 0 ? 
        new Date(Math.max(...entries.map(e => e.cachedAt.getTime()))) : undefined
    }
  }

  /**
   * Update cache options
   */
  updateOptions(newOptions: Partial<CacheOptions>): void {
    this.options = { ...this.options, ...newOptions }
    this.emit('optionsUpdated', this.options)
  }

  /**
   * Update bandwidth optimization settings
   */
  updateBandwidthOptimization(settings: Partial<BandwidthOptimization>): void {
    this.bandwidthOptimization = { ...this.bandwidthOptimization, ...settings }
    this.emit('bandwidthOptimizationUpdated', this.bandwidthOptimization)
  }

  /**
   * Update progressive loading settings
   */
  updateProgressiveLoading(settings: Partial<ProgressiveLoadingOptions>): void {
    this.progressiveLoading = { ...this.progressiveLoading, ...settings }
    this.emit('progressiveLoadingUpdated', this.progressiveLoading)
  }

  /**
   * Get cached media info
   */
  getCachedMediaInfo(mediaId: string): Array<{
    quality?: string
    size: number
    cachedAt: Date
    lastAccessed: Date
    accessCount: number
  }> {
    const info: Array<{
      quality?: string
      size: number
      cachedAt: Date
      lastAccessed: Date
      accessCount: number
    }> = []

    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(mediaId)) {
        const qualityMatch = key.match(/_([^_]+)$/)
        const quality = qualityMatch ? qualityMatch[1] : undefined
        
        info.push({
          quality,
          size: entry.size,
          cachedAt: entry.cachedAt,
          lastAccessed: entry.lastAccessed,
          accessCount: entry.accessCount
        })
      }
    }

    return info
  }

  /**
   * Optimize cache by removing least valuable entries
   */
  async optimizeCache(): Promise<{ removedCount: number; freedSize: number }> {
    const targetSize = this.options.maxSize * 0.8 // Target 80% of max size
    const currentSize = this.getCurrentCacheSize()
    
    if (currentSize <= targetSize) {
      return { removedCount: 0, freedSize: 0 }
    }

    const toFree = currentSize - targetSize
    const toEvict = this.selectEntriesForEviction(toFree)
    
    let freedSize = 0
    for (const entryId of toEvict) {
      const entry = this.cache.get(entryId)
      if (entry) {
        freedSize += entry.size
        await this.evictEntry(entryId)
      }
    }

    this.emit('cacheOptimized', { removedCount: toEvict.length, freedSize })
    return { removedCount: toEvict.length, freedSize }
  }

  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    // Cancel all active downloads
    for (const mediaId of this.downloadProgress.keys()) {
      this.cancelDownload(mediaId)
    }

    this.cache.clear()
    this.accessOrder.length = 0
    this.accessFrequency.clear()
    this.downloadQueue.length = 0
    this.activeDownloads.clear()
    this.downloadProgress.clear()

    this.isInitialized = false
    this.emit('destroyed')
  }
}