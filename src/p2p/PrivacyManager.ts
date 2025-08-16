import { PrivacyLevel, DataSharingScope, GeolocationPrecision } from './types'

// Simple EventEmitter implementation for browser compatibility
class SimpleEventEmitter {
  private events: { [key: string]: Function[] } = {}

  on(event: string, listener: Function): void {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(listener)
  }

  off(event: string, listener: Function): void {
    if (!this.events[event]) return
    this.events[event] = this.events[event].filter(l => l !== listener)
  }

  emit(event: string, ...args: any[]): void {
    if (!this.events[event]) return
    this.events[event].forEach(listener => listener(...args))
  }

  removeAllListeners(event?: string): void {
    if (event) {
      delete this.events[event]
    } else {
      this.events = {}
    }
  }

  listenerCount(event: string): number {
    return this.events[event]?.length || 0
  }
}

export interface PrivacySettings {
  // General Privacy Level
  privacyLevel: PrivacyLevel
  
  // Data Sharing Controls
  shareProfile: DataSharingScope
  sharePhotos: DataSharingScope
  shareActivity: DataSharingScope
  shareLocation: DataSharingScope
  
  // Location Privacy
  geolocationPrecision: GeolocationPrecision
  hideExactLocation: boolean
  locationHistoryRetention: number // days
  
  // Profile Privacy
  hideAge: boolean
  hideLastSeen: boolean
  hideDistance: boolean
  
  // Communication Privacy
  requireMatchForMessage: boolean
  blockScreenshots: boolean
  messageRetention: number // days, 0 = forever
  
  // Data Retention
  autoDeleteMatches: boolean
  matchRetention: number // days
  profileCacheRetention: number // days
  
  // Advanced Privacy
  enableOnionRouting: boolean
  enableTrafficObfuscation: boolean
  enableMetadataProtection: boolean
  
  // Backup & Export
  enableAutoBackup: boolean
  backupFrequency: number // hours
  encryptBackups: boolean
}

export interface DataExportOptions {
  includeProfile: boolean
  includeMessages: boolean
  includeMatches: boolean
  includeLikes: boolean
  includePhotos: boolean
  includeSettings: boolean
  format: 'json' | 'csv' | 'xml'
  encrypt: boolean
  password?: string
}

export interface BackupData {
  timestamp: Date
  version: string
  profile?: any
  messages?: any[]
  matches?: any[]
  likes?: any[]
  photos?: any[]
  settings?: PrivacySettings
  metadata: {
    totalSize: number
    itemCount: number
    checksum: string
  }
}

export interface PrivacyAuditLog {
  timestamp: Date
  action: string
  dataType: string
  scope: DataSharingScope
  userId?: string
  details: Record<string, any>
}

export class PrivacyManager extends SimpleEventEmitter {
  private settings: PrivacySettings
  private auditLog: PrivacyAuditLog[] = []
  private backupInterval?: number

  constructor() {
    super()
    this.settings = this.getDefaultSettings()
    this.setupAutoBackup()
  }

  // Privacy Settings Management
  getSettings(): PrivacySettings {
    return { ...this.settings }
  }

  updateSettings(newSettings: Partial<PrivacySettings>): void {
    const oldSettings = { ...this.settings }
    this.settings = { ...this.settings, ...newSettings }
    
    // Apply privacy level presets if changed
    if (newSettings.privacyLevel && newSettings.privacyLevel !== oldSettings.privacyLevel) {
      this.applyPrivacyLevelPreset(newSettings.privacyLevel)
    }
    
    // Log privacy changes
    this.logPrivacyChange('settings_updated', 'privacy_settings', { oldSettings, newSettings: this.settings })
    
    // Update auto backup if settings changed
    if (newSettings.enableAutoBackup !== undefined || newSettings.backupFrequency !== undefined) {
      this.setupAutoBackup()
    }
    
    this.emit('settingsUpdated', this.settings)
  }

  private applyPrivacyLevelPreset(level: PrivacyLevel): void {
    switch (level) {
      case PrivacyLevel.MINIMAL:
        this.settings = {
          ...this.settings,
          shareProfile: DataSharingScope.MATCHES_ONLY,
          sharePhotos: DataSharingScope.MATCHES_ONLY,
          shareActivity: DataSharingScope.NONE,
          shareLocation: DataSharingScope.NEARBY_USERS,
          geolocationPrecision: GeolocationPrecision.CITY,
          hideExactLocation: true,
          hideAge: true,
          hideLastSeen: true,
          hideDistance: true,
          requireMatchForMessage: true,
          blockScreenshots: true,
          enableOnionRouting: true,
          enableTrafficObfuscation: true,
          enableMetadataProtection: true
        }
        break
        
      case PrivacyLevel.BALANCED:
        this.settings = {
          ...this.settings,
          shareProfile: DataSharingScope.NEARBY_USERS,
          sharePhotos: DataSharingScope.NEARBY_USERS,
          shareActivity: DataSharingScope.MATCHES_ONLY,
          shareLocation: DataSharingScope.NEARBY_USERS,
          geolocationPrecision: GeolocationPrecision.NEIGHBORHOOD,
          hideExactLocation: false,
          hideAge: false,
          hideLastSeen: false,
          hideDistance: false,
          requireMatchForMessage: true,
          blockScreenshots: false,
          enableOnionRouting: false,
          enableTrafficObfuscation: false,
          enableMetadataProtection: true
        }
        break
        
      case PrivacyLevel.OPEN:
        this.settings = {
          ...this.settings,
          shareProfile: DataSharingScope.ALL_USERS,
          sharePhotos: DataSharingScope.ALL_USERS,
          shareActivity: DataSharingScope.NEARBY_USERS,
          shareLocation: DataSharingScope.ALL_USERS,
          geolocationPrecision: GeolocationPrecision.STREET,
          hideExactLocation: false,
          hideAge: false,
          hideLastSeen: false,
          hideDistance: false,
          requireMatchForMessage: false,
          blockScreenshots: false,
          enableOnionRouting: false,
          enableTrafficObfuscation: false,
          enableMetadataProtection: false
        }
        break
    }
  }

  // Data Sharing Controls
  canShareData(dataType: string, targetScope: DataSharingScope, userId?: string): boolean {
    let allowedScope: DataSharingScope
    
    switch (dataType) {
      case 'profile':
        allowedScope = this.settings.shareProfile
        break
      case 'photos':
        allowedScope = this.settings.sharePhotos
        break
      case 'activity':
        allowedScope = this.settings.shareActivity
        break
      case 'location':
        allowedScope = this.settings.shareLocation
        break
      default:
        allowedScope = DataSharingScope.NONE
    }
    
    // Check if target scope is within allowed scope
    const scopeHierarchy = [
      DataSharingScope.NONE,
      DataSharingScope.MATCHES_ONLY,
      DataSharingScope.NEARBY_USERS,
      DataSharingScope.ALL_USERS
    ]
    
    const allowedLevel = scopeHierarchy.indexOf(allowedScope)
    const targetLevel = scopeHierarchy.indexOf(targetScope)
    
    const canShare = targetLevel <= allowedLevel
    
    // Log data sharing decision
    this.logPrivacyChange('data_sharing_check', dataType, {
      targetScope,
      allowedScope,
      userId,
      result: canShare
    })
    
    return canShare
  }

  // Geolocation Privacy
  getObfuscatedLocation(originalGeohash: string): string {
    const precision = this.settings.geolocationPrecision
    const obfuscated = originalGeohash.substring(0, precision)
    
    this.logPrivacyChange('location_obfuscation', 'geolocation', {
      originalPrecision: originalGeohash.length,
      obfuscatedPrecision: precision,
      hideExact: this.settings.hideExactLocation
    })
    
    return obfuscated
  }

  shouldHideLocationMetadata(): boolean {
    return this.settings.hideExactLocation || this.settings.enableMetadataProtection
  }

  // Data Export & Backup
  async exportData(options: DataExportOptions): Promise<string> {
    const exportData: any = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      options
    }

    // Collect data based on options
    if (options.includeProfile) {
      exportData.profile = await this.getProfileData()
    }
    
    if (options.includeMessages) {
      exportData.messages = await this.getMessagesData()
    }
    
    if (options.includeMatches) {
      exportData.matches = await this.getMatchesData()
    }
    
    if (options.includeLikes) {
      exportData.likes = await this.getLikesData()
    }
    
    if (options.includePhotos) {
      exportData.photos = await this.getPhotosData()
    }
    
    if (options.includeSettings) {
      exportData.settings = this.settings
    }

    // Format data
    let formattedData: string
    switch (options.format) {
      case 'json':
        formattedData = JSON.stringify(exportData, null, 2)
        break
      case 'csv':
        formattedData = this.convertToCSV(exportData)
        break
      case 'xml':
        formattedData = this.convertToXML(exportData)
        break
      default:
        formattedData = JSON.stringify(exportData, null, 2)
    }

    // Encrypt if requested
    if (options.encrypt && options.password) {
      formattedData = await this.encryptData(formattedData, options.password)
    }

    this.logPrivacyChange('data_export', 'all_data', { options, size: formattedData.length })
    
    return formattedData
  }

  async createBackup(): Promise<BackupData> {
    const backupData: BackupData = {
      timestamp: new Date(),
      version: '1.0.0',
      profile: await this.getProfileData(),
      messages: await this.getMessagesData(),
      matches: await this.getMatchesData(),
      likes: await this.getLikesData(),
      photos: await this.getPhotosData(),
      settings: this.settings,
      metadata: {
        totalSize: 0,
        itemCount: 0,
        checksum: ''
      }
    }

    // Calculate metadata
    backupData.metadata.itemCount = this.countItems(backupData)
    backupData.metadata.checksum = '' // Temporary empty checksum
    
    const serialized = JSON.stringify(backupData)
    backupData.metadata.totalSize = serialized.length
    backupData.metadata.checksum = await this.calculateChecksum(serialized)

    this.logPrivacyChange('backup_created', 'all_data', { 
      size: backupData.metadata.totalSize,
      items: backupData.metadata.itemCount
    })

    return backupData
  }

  async restoreBackup(backupData: BackupData): Promise<void> {
    // Verify backup integrity
    const backupForVerification = { ...backupData }
    const originalChecksum = backupForVerification.metadata.checksum
    backupForVerification.metadata.checksum = ''
    
    const serialized = JSON.stringify(backupForVerification)
    const calculatedChecksum = await this.calculateChecksum(serialized)
    
    if (calculatedChecksum !== originalChecksum) {
      throw new Error('Backup integrity check failed')
    }

    // Restore data
    if (backupData.profile) {
      await this.restoreProfileData(backupData.profile)
    }
    
    if (backupData.messages) {
      await this.restoreMessagesData(backupData.messages)
    }
    
    if (backupData.matches) {
      await this.restoreMatchesData(backupData.matches)
    }
    
    if (backupData.likes) {
      await this.restoreLikesData(backupData.likes)
    }
    
    if (backupData.photos) {
      await this.restorePhotosData(backupData.photos)
    }
    
    if (backupData.settings) {
      this.updateSettings(backupData.settings)
    }

    this.logPrivacyChange('backup_restored', 'all_data', {
      backupTimestamp: backupData.timestamp,
      size: backupData.metadata.totalSize
    })
  }

  // Privacy Audit
  getAuditLog(): PrivacyAuditLog[] {
    return [...this.auditLog]
  }

  clearAuditLog(): void {
    this.auditLog = []
    this.logPrivacyChange('audit_log_cleared', 'audit_log', {})
  }

  // Data Retention
  async cleanupExpiredData(): Promise<void> {
    const now = new Date()
    
    // Clean up location history
    if (this.settings.locationHistoryRetention > 0) {
      const locationCutoff = new Date(now.getTime() - this.settings.locationHistoryRetention * 24 * 60 * 60 * 1000)
      await this.cleanupLocationHistory(locationCutoff)
    }
    
    // Clean up messages
    if (this.settings.messageRetention > 0) {
      const messageCutoff = new Date(now.getTime() - this.settings.messageRetention * 24 * 60 * 60 * 1000)
      await this.cleanupMessages(messageCutoff)
    }
    
    // Clean up matches
    if (this.settings.autoDeleteMatches && this.settings.matchRetention > 0) {
      const matchCutoff = new Date(now.getTime() - this.settings.matchRetention * 24 * 60 * 60 * 1000)
      await this.cleanupMatches(matchCutoff)
    }
    
    // Clean up profile cache
    if (this.settings.profileCacheRetention > 0) {
      const cacheCutoff = new Date(now.getTime() - this.settings.profileCacheRetention * 24 * 60 * 60 * 1000)
      await this.cleanupProfileCache(cacheCutoff)
    }

    this.logPrivacyChange('data_cleanup', 'expired_data', { timestamp: now })
  }

  // Private helper methods
  private getDefaultSettings(): PrivacySettings {
    return {
      privacyLevel: PrivacyLevel.BALANCED,
      shareProfile: DataSharingScope.NEARBY_USERS,
      sharePhotos: DataSharingScope.NEARBY_USERS,
      shareActivity: DataSharingScope.MATCHES_ONLY,
      shareLocation: DataSharingScope.NEARBY_USERS,
      geolocationPrecision: GeolocationPrecision.NEIGHBORHOOD,
      hideExactLocation: false,
      locationHistoryRetention: 30,
      hideAge: false,
      hideLastSeen: false,
      hideDistance: false,
      requireMatchForMessage: true,
      blockScreenshots: false,
      messageRetention: 0,
      autoDeleteMatches: false,
      matchRetention: 365,
      profileCacheRetention: 7,
      enableOnionRouting: false,
      enableTrafficObfuscation: false,
      enableMetadataProtection: true,
      enableAutoBackup: true,
      backupFrequency: 24,
      encryptBackups: true
    }
  }

  private logPrivacyChange(action: string, dataType: string, details: any, userId?: string): void {
    const logEntry: PrivacyAuditLog = {
      timestamp: new Date(),
      action,
      dataType,
      scope: DataSharingScope.NONE,
      userId,
      details
    }
    
    this.auditLog.push(logEntry)
    
    // Keep audit log size manageable
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-500)
    }
    
    this.emit('privacyEvent', logEntry)
  }

  private setupAutoBackup(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval)
    }
    
    if (this.settings.enableAutoBackup) {
      const intervalMs = this.settings.backupFrequency * 60 * 60 * 1000
      this.backupInterval = setInterval(async () => {
        try {
          await this.createBackup()
        } catch (error) {
          console.error('Auto backup failed:', error)
        }
      }, intervalMs) as any
    }
  }

  // Placeholder methods for data operations (to be implemented with actual storage)
  private async getProfileData(): Promise<any> { return {} }
  private async getMessagesData(): Promise<any[]> { return [] }
  private async getMatchesData(): Promise<any[]> { return [] }
  private async getLikesData(): Promise<any[]> { return [] }
  private async getPhotosData(): Promise<any[]> { return [] }
  
  private async restoreProfileData(data: any): Promise<void> {}
  private async restoreMessagesData(data: any[]): Promise<void> {}
  private async restoreMatchesData(data: any[]): Promise<void> {}
  private async restoreLikesData(data: any[]): Promise<void> {}
  private async restorePhotosData(data: any[]): Promise<void> {}
  
  private async cleanupLocationHistory(cutoff: Date): Promise<void> {}
  private async cleanupMessages(cutoff: Date): Promise<void> {}
  private async cleanupMatches(cutoff: Date): Promise<void> {}
  private async cleanupProfileCache(cutoff: Date): Promise<void> {}
  
  private convertToCSV(data: any): string {
    // Simple CSV conversion - in real implementation, use proper CSV library
    return JSON.stringify(data)
  }
  
  private convertToXML(data: any): string {
    // Simple XML conversion - in real implementation, use proper XML library
    return `<data>${JSON.stringify(data)}</data>`
  }
  
  private async encryptData(data: string, password: string): Promise<string> {
    // Placeholder - implement actual encryption
    return btoa(data)
  }
  
  private countItems(data: BackupData): number {
    let count = 0
    if (data.profile) count++
    if (data.messages) count += data.messages.length
    if (data.matches) count += data.matches.length
    if (data.likes) count += data.likes.length
    if (data.photos) count += data.photos.length
    if (data.settings) count++
    return count
  }
  
  private async calculateChecksum(data: string): Promise<string> {
    // Simple checksum - in real implementation, use proper hashing
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }

  destroy(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval)
    }
    this.removeAllListeners()
  }
}