import { EventEmitter } from './utils/EventEmitter'

export interface MediaFile {
  id: string
  name: string
  size: number
  type: string
  hash: string
  url?: string // CDN fallback URL
  torrentMagnet?: string // WebTorrent magnet link
  ipfsCid?: string // IPFS Content ID
  thumbnail?: string // Base64 encoded thumbnail
  uploadedAt: Date
  expiresAt?: Date
}

export interface MediaUploadOptions {
  enableP2P: boolean
  enableIPFS: boolean
  enableCDN: boolean
  generateThumbnail: boolean
  compressionQuality?: number
  maxSize?: number
}

export interface MediaDownloadOptions {
  preferP2P: boolean
  timeout: number
  fallbackToCDN: boolean
}

export interface MediaStorageStats {
  totalFiles: number
  totalSize: number
  p2pFiles: number
  ipfsFiles: number
  cdnFiles: number
  activeDownloads: number
  activeUploads: number
}

export class MediaStorageManager extends EventEmitter {
  private webTorrentClient: any = null
  private heliaNode: any = null
  private unixfsInstance: any = null
  private isInitialized = false
  private mediaCache = new Map<string, MediaFile>()
  private activeDownloads = new Map<string, Promise<Blob>>()
  private activeUploads = new Map<string, Promise<MediaFile>>()
  private cdnBaseUrl: string

  constructor(cdnBaseUrl = 'https://cdn.example.com') {
    super()
    this.cdnBaseUrl = cdnBaseUrl
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Initialize WebTorrent (if available)
      if (typeof window !== 'undefined' && (window as any).WebTorrent) {
        this.webTorrentClient = new (window as any).WebTorrent()
        this.setupWebTorrentHandlers()
      }

      // Initialize Helia/IPFS (if available)
      try {
        const { createHelia } = await import('helia')
        const { unixfs } = await import('@helia/unixfs')
        this.heliaNode = await createHelia()
        this.unixfsInstance = unixfs(this.heliaNode)
      } catch (error) {
        console.warn('IPFS/Helia not available:', error)
      }
      
      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      console.error('Failed to initialize MediaStorageManager:', error)
      throw error
    }
  }

  private setupWebTorrentHandlers(): void {
    if (!this.webTorrentClient) return

    this.webTorrentClient.on('error', (error: Error) => {
      console.error('WebTorrent error:', error)
      this.emit('error', error)
    })

    this.webTorrentClient.on('torrent', (torrent: any) => {
      console.log('Torrent added:', torrent.infoHash)
      this.emit('torrentAdded', torrent.infoHash)
    })
  }

  async uploadMedia(
    file: File,
    options: MediaUploadOptions = {
      enableP2P: true,
      enableIPFS: true,
      enableCDN: true,
      generateThumbnail: true
    }
  ): Promise<MediaFile> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const fileId = this.generateFileId()
    const uploadPromise = this.performUpload(file, fileId, options)
    this.activeUploads.set(fileId, uploadPromise)

    try {
      const result = await uploadPromise
      this.mediaCache.set(fileId, result)
      this.emit('uploadComplete', result)
      return result
    } finally {
      this.activeUploads.delete(fileId)
    }
  }

  private async performUpload(
    file: File,
    fileId: string,
    options: MediaUploadOptions
  ): Promise<MediaFile> {
    const fileBuffer = await file.arrayBuffer()
    const hash = await this.calculateHash(fileBuffer)
    
    const mediaFile: MediaFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      hash,
      uploadedAt: new Date()
    }

    // Generate thumbnail if requested
    if (options.generateThumbnail && file.type.startsWith('image/')) {
      try {
        mediaFile.thumbnail = await this.generateThumbnail(file)
      } catch (error) {
        console.warn('Failed to generate thumbnail:', error)
      }
    }

    const uploadPromises: Promise<void>[] = []

    // Upload to WebTorrent (P2P)
    if (options.enableP2P && this.webTorrentClient) {
      uploadPromises.push(this.uploadToWebTorrent(fileBuffer, mediaFile))
    }

    // Upload to IPFS
    if (options.enableIPFS && this.unixfsInstance) {
      uploadPromises.push(this.uploadToIPFS(fileBuffer, mediaFile))
    }

    // Upload to CDN
    if (options.enableCDN) {
      uploadPromises.push(this.uploadToCDN(fileBuffer, mediaFile))
    }

    // Wait for at least one upload to succeed
    if (uploadPromises.length === 0) {
      throw new Error('No upload methods enabled or available')
    }

    try {
      const results = await Promise.allSettled(uploadPromises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      
      if (successful === 0) {
        throw new Error('All upload methods failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      throw new Error('Failed to upload media to any storage method')
    }

    return mediaFile
  }

  private async uploadToWebTorrent(
    fileBuffer: ArrayBuffer,
    mediaFile: MediaFile
  ): Promise<void> {
    if (!this.webTorrentClient) {
      throw new Error('WebTorrent not available')
    }

    return new Promise((resolve, reject) => {
      const torrent = this.webTorrentClient.seed(
        Buffer.from(fileBuffer),
        {
          name: mediaFile.name,
          comment: `Media file: ${mediaFile.id}`
        },
        (torrent: any) => {
          mediaFile.torrentMagnet = torrent.magnetURI
          console.log('WebTorrent upload complete:', torrent.infoHash)
          resolve()
        }
      )

      torrent.on('error', (error: Error) => {
        console.error('WebTorrent upload error:', error)
        reject(error)
      })

      // Set timeout for upload
      setTimeout(() => {
        reject(new Error('WebTorrent upload timeout'))
      }, 30000)
    })
  }

  private async uploadToIPFS(
    fileBuffer: ArrayBuffer,
    mediaFile: MediaFile
  ): Promise<void> {
    if (!this.unixfsInstance) {
      throw new Error('IPFS not available')
    }

    try {
      const cid = await this.unixfsInstance.addBytes(new Uint8Array(fileBuffer))
      mediaFile.ipfsCid = cid.toString()
      console.log('IPFS upload complete:', mediaFile.ipfsCid)
    } catch (error) {
      console.error('IPFS upload error:', error)
      throw error
    }
  }

  private async uploadToCDN(
    fileBuffer: ArrayBuffer,
    mediaFile: MediaFile
  ): Promise<void> {
    try {
      // Simulate CDN upload - in real implementation, this would use actual CDN API
      const formData = new FormData()
      formData.append('file', new Blob([fileBuffer]), mediaFile.name)
      formData.append('id', mediaFile.id)

      const response = await fetch(`${this.cdnBaseUrl}/upload`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`CDN upload failed: ${response.statusText}`)
      }

      const result = await response.json()
      mediaFile.url = result.url || `${this.cdnBaseUrl}/files/${mediaFile.id}`
      console.log('CDN upload complete:', mediaFile.url)
    } catch (error) {
      console.error('CDN upload error:', error)
      throw error
    }
  }

  async downloadMedia(
    mediaFile: MediaFile,
    options: MediaDownloadOptions = {
      preferP2P: true,
      timeout: 30000,
      fallbackToCDN: true
    }
  ): Promise<Blob> {
    if (this.activeDownloads.has(mediaFile.id)) {
      return this.activeDownloads.get(mediaFile.id)!
    }

    const downloadPromise = this.performDownload(mediaFile, options)
    this.activeDownloads.set(mediaFile.id, downloadPromise)

    try {
      const result = await downloadPromise
      this.emit('downloadComplete', mediaFile.id)
      return result
    } finally {
      this.activeDownloads.delete(mediaFile.id)
    }
  }

  private async performDownload(
    mediaFile: MediaFile,
    options: MediaDownloadOptions
  ): Promise<Blob> {
    const downloadMethods: (() => Promise<Blob>)[] = []

    // Prioritize P2P if preferred
    if (options.preferP2P) {
      if (mediaFile.torrentMagnet && this.webTorrentClient) {
        downloadMethods.push(() => this.downloadFromWebTorrent(mediaFile))
      }
      if (mediaFile.ipfsCid && this.unixfsInstance) {
        downloadMethods.push(() => this.downloadFromIPFS(mediaFile))
      }
      if (mediaFile.url && options.fallbackToCDN) {
        downloadMethods.push(() => this.downloadFromCDN(mediaFile))
      }
    } else {
      // Prioritize CDN
      if (mediaFile.url) {
        downloadMethods.push(() => this.downloadFromCDN(mediaFile))
      }
      if (mediaFile.torrentMagnet && this.webTorrentClient) {
        downloadMethods.push(() => this.downloadFromWebTorrent(mediaFile))
      }
      if (mediaFile.ipfsCid && this.unixfsInstance) {
        downloadMethods.push(() => this.downloadFromIPFS(mediaFile))
      }
    }

    if (downloadMethods.length === 0) {
      throw new Error('No download methods available')
    }

    // Try each method until one succeeds
    for (const downloadMethod of downloadMethods) {
      try {
        const result = await Promise.race([
          downloadMethod(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Download timeout')), options.timeout)
          )
        ])
        return result
      } catch (error) {
        console.warn('Download method failed, trying next:', error)
        continue
      }
    }

    throw new Error('All download methods failed')
  }

  private async downloadFromWebTorrent(mediaFile: MediaFile): Promise<Blob> {
    if (!mediaFile.torrentMagnet || !this.webTorrentClient) {
      throw new Error('WebTorrent not available')
    }

    return new Promise((resolve, reject) => {
      this.webTorrentClient.add(mediaFile.torrentMagnet!, (torrent: any) => {
        const file = torrent.files[0]
        if (!file) {
          reject(new Error('No files in torrent'))
          return
        }

        file.getBuffer((err: Error | null, buffer: Buffer) => {
          if (err) {
            reject(err)
            return
          }
          
          const blob = new Blob([new Uint8Array(buffer)], { type: mediaFile.type })
          resolve(blob)
        })
      })
    })
  }

  private async downloadFromIPFS(mediaFile: MediaFile): Promise<Blob> {
    if (!mediaFile.ipfsCid || !this.unixfsInstance) {
      throw new Error('IPFS not available')
    }

    try {
      const { CID } = await import('multiformats/cid')
      const cid = CID.parse(mediaFile.ipfsCid)
      const chunks: Uint8Array[] = []
      
      for await (const chunk of this.unixfsInstance.cat(cid)) {
        chunks.push(chunk)
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }

      return new Blob([result], { type: mediaFile.type })
    } catch (error) {
      console.error('IPFS download error:', error)
      throw error
    }
  }

  private async downloadFromCDN(mediaFile: MediaFile): Promise<Blob> {
    if (!mediaFile.url) {
      throw new Error('No CDN URL available')
    }

    const response = await fetch(mediaFile.url)
    if (!response.ok) {
      throw new Error(`CDN download failed: ${response.statusText}`)
    }

    return response.blob()
  }

  private async generateThumbnail(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()

      img.onload = () => {
        // Set thumbnail size
        const maxSize = 150
        let { width, height } = img
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width
            width = maxSize
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height
        ctx?.drawImage(img, 0, 0, width, height)
        
        const thumbnail = canvas.toDataURL('image/jpeg', 0.7)
        resolve(thumbnail)
      }

      img.onerror = () => reject(new Error('Failed to generate thumbnail'))
      img.src = URL.createObjectURL(file)
    })
  }

  private async calculateHash(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  private generateFileId(): string {
    return `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  getMediaFile(id: string): MediaFile | undefined {
    return this.mediaCache.get(id)
  }

  getAllMediaFiles(): MediaFile[] {
    return Array.from(this.mediaCache.values())
  }

  deleteMediaFile(id: string): boolean {
    const mediaFile = this.mediaCache.get(id)
    if (!mediaFile) return false

    // Remove from WebTorrent
    if (mediaFile.torrentMagnet && this.webTorrentClient) {
      const torrent = this.webTorrentClient.get(mediaFile.torrentMagnet)
      if (torrent) {
        torrent.destroy()
      }
    }

    this.mediaCache.delete(id)
    this.emit('mediaDeleted', id)
    return true
  }

  getStats(): MediaStorageStats {
    const files = Array.from(this.mediaCache.values())
    
    return {
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      p2pFiles: files.filter(f => f.torrentMagnet).length,
      ipfsFiles: files.filter(f => f.ipfsCid).length,
      cdnFiles: files.filter(f => f.url).length,
      activeDownloads: this.activeDownloads.size,
      activeUploads: this.activeUploads.size
    }
  }

  async destroy(): Promise<void> {
    // Clean up WebTorrent
    if (this.webTorrentClient) {
      this.webTorrentClient.destroy()
      this.webTorrentClient = null
    }
    
    // Clean up Helia
    if (this.heliaNode) {
      await this.heliaNode.stop()
      this.heliaNode = null
    }

    // Clear caches
    this.mediaCache.clear()
    this.activeDownloads.clear()
    this.activeUploads.clear()

    this.isInitialized = false
    this.emit('destroyed')
  }
}