import { MediaStorageManager, MediaUploadOptions, MediaDownloadOptions } from '../MediaStorageManager'

/**
 * Example demonstrating how to use the MediaStorageManager for decentralized media storage
 */
export class MediaStorageExample {
  private mediaManager: MediaStorageManager

  constructor() {
    // Initialize with CDN fallback URL
    this.mediaManager = new MediaStorageManager('https://your-cdn.com')
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.mediaManager.on('initialized', () => {
      console.log('✅ MediaStorageManager initialized')
    })

    this.mediaManager.on('uploadComplete', (mediaFile) => {
      console.log('📤 Upload complete:', mediaFile.name)
      console.log('  - P2P:', !!mediaFile.torrentMagnet)
      console.log('  - IPFS:', !!mediaFile.ipfsCid)
      console.log('  - CDN:', !!mediaFile.url)
    })

    this.mediaManager.on('downloadComplete', (fileId) => {
      console.log('📥 Download complete:', fileId)
    })

    this.mediaManager.on('torrentAdded', (infoHash) => {
      console.log('🌐 Torrent added to swarm:', infoHash)
    })

    this.mediaManager.on('error', (error) => {
      console.error('❌ MediaStorage error:', error)
    })
  }

  /**
   * Initialize the media storage system
   */
  async initialize(): Promise<void> {
    try {
      await this.mediaManager.initialize()
      console.log('MediaStorageManager ready!')
    } catch (error) {
      console.error('Failed to initialize MediaStorageManager:', error)
      throw error
    }
  }

  /**
   * Example 1: Upload a profile photo with all storage methods
   */
  async uploadProfilePhoto(file: File): Promise<void> {
    console.log('\n=== Uploading Profile Photo ===')
    
    const uploadOptions: MediaUploadOptions = {
      enableP2P: true,        // Enable WebTorrent P2P sharing
      enableIPFS: true,       // Enable IPFS storage
      enableCDN: true,        // Enable CDN fallback
      generateThumbnail: true, // Generate thumbnail for images
      compressionQuality: 0.8, // JPEG compression quality
      maxSize: 5 * 1024 * 1024 // 5MB max size
    }

    try {
      const mediaFile = await this.mediaManager.uploadMedia(file, uploadOptions)
      
      console.log('Profile photo uploaded successfully!')
      console.log('File ID:', mediaFile.id)
      console.log('Hash:', mediaFile.hash)
      console.log('Size:', this.formatBytes(mediaFile.size))
      
      if (mediaFile.torrentMagnet) {
        console.log('P2P Magnet:', mediaFile.torrentMagnet.substring(0, 50) + '...')
      }
      
      if (mediaFile.ipfsCid) {
        console.log('IPFS CID:', mediaFile.ipfsCid)
      }
      
      if (mediaFile.url) {
        console.log('CDN URL:', mediaFile.url)
      }
      
      if (mediaFile.thumbnail) {
        console.log('Thumbnail generated:', mediaFile.thumbnail.substring(0, 50) + '...')
      }

    } catch (error) {
      console.error('Failed to upload profile photo:', error)
      throw error
    }
  }

  /**
   * Example 2: Upload media with P2P only (no centralized storage)
   */
  async uploadP2POnly(file: File): Promise<void> {
    console.log('\n=== Uploading P2P Only ===')
    
    const uploadOptions: MediaUploadOptions = {
      enableP2P: true,
      enableIPFS: true,
      enableCDN: false,        // No centralized storage
      generateThumbnail: false
    }

    try {
      const mediaFile = await this.mediaManager.uploadMedia(file, uploadOptions)
      
      console.log('P2P-only upload successful!')
      console.log('Available via:')
      console.log('  - WebTorrent:', !!mediaFile.torrentMagnet)
      console.log('  - IPFS:', !!mediaFile.ipfsCid)
      console.log('  - CDN:', !!mediaFile.url)

    } catch (error) {
      console.error('P2P upload failed:', error)
      throw error
    }
  }

  /**
   * Example 3: Download media preferring P2P
   */
  async downloadMediaP2P(fileId: string): Promise<Blob | null> {
    console.log('\n=== Downloading Media (P2P Preferred) ===')
    
    const mediaFile = this.mediaManager.getMediaFile(fileId)
    if (!mediaFile) {
      console.error('Media file not found:', fileId)
      return null
    }

    const downloadOptions: MediaDownloadOptions = {
      preferP2P: true,        // Try P2P first
      timeout: 30000,         // 30 second timeout
      fallbackToCDN: true     // Fallback to CDN if P2P fails
    }

    try {
      console.log('Attempting download from:')
      console.log('  - WebTorrent:', !!mediaFile.torrentMagnet)
      console.log('  - IPFS:', !!mediaFile.ipfsCid)
      console.log('  - CDN:', !!mediaFile.url)

      const blob = await this.mediaManager.downloadMedia(mediaFile, downloadOptions)
      
      console.log('Download successful!')
      console.log('Blob size:', this.formatBytes(blob.size))
      console.log('Blob type:', blob.type)
      
      return blob

    } catch (error) {
      console.error('Download failed:', error)
      return null
    }
  }

  /**
   * Example 4: Download media preferring CDN (faster)
   */
  async downloadMediaCDN(fileId: string): Promise<Blob | null> {
    console.log('\n=== Downloading Media (CDN Preferred) ===')
    
    const mediaFile = this.mediaManager.getMediaFile(fileId)
    if (!mediaFile) {
      console.error('Media file not found:', fileId)
      return null
    }

    const downloadOptions: MediaDownloadOptions = {
      preferP2P: false,       // Try CDN first
      timeout: 10000,         // 10 second timeout
      fallbackToCDN: true
    }

    try {
      const blob = await this.mediaManager.downloadMedia(mediaFile, downloadOptions)
      
      console.log('CDN download successful!')
      console.log('Blob size:', this.formatBytes(blob.size))
      
      return blob

    } catch (error) {
      console.error('CDN download failed:', error)
      return null
    }
  }

  /**
   * Example 5: Batch upload multiple files
   */
  async batchUpload(files: File[]): Promise<void> {
    console.log('\n=== Batch Upload ===')
    console.log(`Uploading ${files.length} files...`)

    const uploadOptions: MediaUploadOptions = {
      enableP2P: true,
      enableIPFS: false,      // Skip IPFS for faster batch processing
      enableCDN: true,
      generateThumbnail: true
    }

    try {
      // Upload files concurrently
      const uploadPromises = files.map(file => 
        this.mediaManager.uploadMedia(file, uploadOptions)
      )

      const results = await Promise.allSettled(uploadPromises)
      
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      
      console.log(`Batch upload complete: ${successful} successful, ${failed} failed`)
      
      // Log failed uploads
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Failed to upload ${files[index].name}:`, result.reason)
        }
      })

    } catch (error) {
      console.error('Batch upload error:', error)
      throw error
    }
  }

  /**
   * Example 6: Media management operations
   */
  async manageMedia(): Promise<void> {
    console.log('\n=== Media Management ===')
    
    // Get all media files
    const allFiles = this.mediaManager.getAllMediaFiles()
    console.log(`Total media files: ${allFiles.length}`)
    
    // Get statistics
    const stats = this.mediaManager.getStats()
    console.log('Storage statistics:')
    console.log('  - Total files:', stats.totalFiles)
    console.log('  - Total size:', this.formatBytes(stats.totalSize))
    console.log('  - P2P files:', stats.p2pFiles)
    console.log('  - IPFS files:', stats.ipfsFiles)
    console.log('  - CDN files:', stats.cdnFiles)
    console.log('  - Active downloads:', stats.activeDownloads)
    console.log('  - Active uploads:', stats.activeUploads)
    
    // Find old files (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const oldFiles = allFiles.filter(file => file.uploadedAt < thirtyDaysAgo)
    
    if (oldFiles.length > 0) {
      console.log(`Found ${oldFiles.length} old files (>30 days)`)
      
      // Optionally delete old files
      for (const file of oldFiles) {
        console.log(`Deleting old file: ${file.name}`)
        this.mediaManager.deleteMediaFile(file.id)
      }
    }
  }

  /**
   * Example 7: Handle media sharing between users
   */
  async shareMediaWithUser(fileId: string, userId: string): Promise<string | null> {
    console.log('\n=== Sharing Media ===')
    
    const mediaFile = this.mediaManager.getMediaFile(fileId)
    if (!mediaFile) {
      console.error('Media file not found:', fileId)
      return null
    }

    // Create a shareable link/reference
    const shareData = {
      fileId: mediaFile.id,
      name: mediaFile.name,
      size: mediaFile.size,
      type: mediaFile.type,
      hash: mediaFile.hash,
      // Include all available access methods
      torrentMagnet: mediaFile.torrentMagnet,
      ipfsCid: mediaFile.ipfsCid,
      url: mediaFile.url,
      thumbnail: mediaFile.thumbnail
    }

    // In a real app, you would send this via P2P messaging
    const shareLink = JSON.stringify(shareData)
    console.log(`Sharing ${mediaFile.name} with user ${userId}`)
    console.log('Share data size:', this.formatBytes(shareLink.length))
    
    return shareLink
  }

  /**
   * Example 8: Receive shared media from another user
   */
  async receiveSharedMedia(shareData: string): Promise<Blob | null> {
    console.log('\n=== Receiving Shared Media ===')
    
    try {
      const mediaInfo = JSON.parse(shareData)
      console.log(`Receiving: ${mediaInfo.name} (${this.formatBytes(mediaInfo.size)})`)
      
      // Create a temporary MediaFile object
      const mediaFile = {
        id: mediaInfo.fileId,
        name: mediaInfo.name,
        size: mediaInfo.size,
        type: mediaInfo.type,
        hash: mediaInfo.hash,
        torrentMagnet: mediaInfo.torrentMagnet,
        ipfsCid: mediaInfo.ipfsCid,
        url: mediaInfo.url,
        thumbnail: mediaInfo.thumbnail,
        uploadedAt: new Date()
      }

      // Download the shared media
      const blob = await this.mediaManager.downloadMedia(mediaFile, {
        preferP2P: true,
        timeout: 30000,
        fallbackToCDN: true
      })

      console.log('Shared media received successfully!')
      return blob

    } catch (error) {
      console.error('Failed to receive shared media:', error)
      return null
    }
  }

  /**
   * Utility function to format bytes
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.mediaManager.destroy()
    console.log('MediaStorageManager destroyed')
  }
}

/**
 * Example usage
 */
export async function runMediaStorageExample(): Promise<void> {
  const example = new MediaStorageExample()
  
  try {
    // Initialize
    await example.initialize()
    
    // Create a mock file for demonstration
    const mockFile = new File(['Hello, P2P world!'], 'test.txt', { type: 'text/plain' })
    
    // Upload with all methods
    await example.uploadProfilePhoto(mockFile)
    
    // Upload P2P only
    await example.uploadP2POnly(mockFile)
    
    // Manage media
    await example.manageMedia()
    
    // Clean up
    await example.destroy()
    
  } catch (error) {
    console.error('Example failed:', error)
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  runMediaStorageExample()
}