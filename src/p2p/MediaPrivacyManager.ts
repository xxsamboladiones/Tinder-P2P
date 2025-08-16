import { EventEmitter } from './utils/EventEmitter'
import { PhotoReference, PhotoMetadata, MediaExpirationNotification } from './types'

export enum MediaAccessLevel {
  PUBLIC = 'public',           // Anyone can access
  MATCHES_ONLY = 'matches_only', // Only matched users
  PRIVATE = 'private',         // Only the owner
  SELECTIVE = 'selective'      // Custom access list
}

export enum MatchStatus {
  NO_INTERACTION = 'no_interaction',
  LIKED = 'liked',
  MATCHED = 'matched',
  BLOCKED = 'blocked'
}

export interface MediaAccessRule {
  mediaId: string
  accessLevel: MediaAccessLevel
  allowedUsers: string[] // DIDs of users with access
  expiresAt?: Date
  matchStatusRequired?: MatchStatus
  createdAt: Date
  updatedAt: Date
}

export interface MediaAccessRequest {
  mediaId: string
  requesterId: string // DID of requester
  timestamp: Date
  matchStatus: MatchStatus
}

export interface MediaAccessResponse {
  granted: boolean
  reason: string
  expiresAt?: Date
  accessToken?: string // Temporary access token
}

export interface MediaExpirationRule {
  mediaId: string
  expiresAt: Date
  autoDelete: boolean
  notifyBeforeExpiry: boolean
  notifyHours: number // Hours before expiry to notify
}

export interface MediaPrivacyStats {
  totalMediaFiles: number
  publicMedia: number
  matchOnlyMedia: number
  privateMedia: number
  selectiveMedia: number
  expiredMedia: number
  accessRequests: number
  grantedRequests: number
  deniedRequests: number
}

export class MediaPrivacyManager extends EventEmitter {
  private accessRules = new Map<string, MediaAccessRule>()
  private expirationRules = new Map<string, MediaExpirationRule>()
  private accessTokens = new Map<string, { mediaId: string; userId: string; expiresAt: Date }>()
  private accessLog = new Map<string, MediaAccessRequest[]>()
  private isInitialized = false
  private cleanupInterval: NodeJS.Timeout | null = null
  
  // Default settings
  private readonly DEFAULT_ACCESS_LEVEL = MediaAccessLevel.MATCHES_ONLY
  private readonly DEFAULT_EXPIRY_HOURS = 24 * 7 // 7 days
  private readonly ACCESS_TOKEN_VALIDITY_HOURS = 1 // 1 hour
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

  constructor() {
    super()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Load existing rules from storage
      await this.loadAccessRules()
      await this.loadExpirationRules()
      
      // Start cleanup timer
      this.startCleanupTimer()
      
      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      console.error('Failed to initialize MediaPrivacyManager:', error)
      throw error
    }
  }

  /**
   * Set access control for a media file
   */
  async setMediaAccess(
    mediaId: string,
    accessLevel: MediaAccessLevel,
    options: {
      allowedUsers?: string[]
      expiresAt?: Date
      matchStatusRequired?: MatchStatus
    } = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const rule: MediaAccessRule = {
      mediaId,
      accessLevel,
      allowedUsers: options.allowedUsers || [],
      expiresAt: options.expiresAt,
      matchStatusRequired: options.matchStatusRequired,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    this.accessRules.set(mediaId, rule)
    await this.saveAccessRules()
    
    this.emit('accessRuleUpdated', rule)
  }

  /**
   * Set expiration rule for a media file
   */
  async setMediaExpiration(
    mediaId: string,
    expiresAt: Date,
    options: {
      autoDelete?: boolean
      notifyBeforeExpiry?: boolean
      notifyHours?: number
    } = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const rule: MediaExpirationRule = {
      mediaId,
      expiresAt,
      autoDelete: options.autoDelete ?? true,
      notifyBeforeExpiry: options.notifyBeforeExpiry ?? true,
      notifyHours: options.notifyHours ?? 24
    }

    this.expirationRules.set(mediaId, rule)
    await this.saveExpirationRules()
    
    this.emit('expirationRuleUpdated', rule)
  }

  /**
   * Check if a user can access a media file
   */
  async checkMediaAccess(
    mediaId: string,
    requesterId: string,
    matchStatus: MatchStatus
  ): Promise<MediaAccessResponse> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    // Log the access request
    this.logAccessRequest(mediaId, requesterId, matchStatus)

    // Check if media has expired
    const expirationRule = this.expirationRules.get(mediaId)
    if (expirationRule && new Date() > expirationRule.expiresAt) {
      return {
        granted: false,
        reason: 'Media has expired'
      }
    }

    // Get access rule (use default if none exists)
    const accessRule = this.accessRules.get(mediaId) || {
      mediaId,
      accessLevel: this.DEFAULT_ACCESS_LEVEL,
      allowedUsers: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // Check if access rule has expired
    if (accessRule.expiresAt && new Date() > accessRule.expiresAt) {
      return {
        granted: false,
        reason: 'Access rule has expired'
      }
    }

    // Check access based on level
    switch (accessRule.accessLevel) {
      case MediaAccessLevel.PUBLIC:
        return this.grantAccess(mediaId, requesterId)

      case MediaAccessLevel.PRIVATE:
        return {
          granted: false,
          reason: 'Media is private'
        }

      case MediaAccessLevel.MATCHES_ONLY:
        if (matchStatus === MatchStatus.MATCHED) {
          return this.grantAccess(mediaId, requesterId)
        }
        return {
          granted: false,
          reason: 'Access requires mutual match'
        }

      case MediaAccessLevel.SELECTIVE:
        if (accessRule.allowedUsers.includes(requesterId)) {
          // Check match status requirement if specified
          if (accessRule.matchStatusRequired && matchStatus !== accessRule.matchStatusRequired) {
            return {
              granted: false,
              reason: `Access requires match status: ${accessRule.matchStatusRequired}`
            }
          }
          return this.grantAccess(mediaId, requesterId)
        }
        return {
          granted: false,
          reason: 'User not in allowed list'
        }

      default:
        return {
          granted: false,
          reason: 'Unknown access level'
        }
    }
  }

  /**
   * Grant access and generate temporary access token
   */
  private grantAccess(mediaId: string, userId: string): MediaAccessResponse {
    const accessToken = this.generateAccessToken()
    const expiresAt = new Date(Date.now() + this.ACCESS_TOKEN_VALIDITY_HOURS * 60 * 60 * 1000)
    
    this.accessTokens.set(accessToken, {
      mediaId,
      userId,
      expiresAt
    })

    return {
      granted: true,
      reason: 'Access granted',
      expiresAt,
      accessToken
    }
  }

  /**
   * Validate an access token
   */
  async validateAccessToken(token: string, mediaId: string, userId: string): Promise<boolean> {
    const tokenData = this.accessTokens.get(token)
    
    if (!tokenData) {
      return false
    }

    if (new Date() > tokenData.expiresAt) {
      this.accessTokens.delete(token)
      return false
    }

    return tokenData.mediaId === mediaId && tokenData.userId === userId
  }

  /**
   * Revoke access for a user to a specific media
   */
  async revokeMediaAccess(mediaId: string, userId: string): Promise<void> {
    const rule = this.accessRules.get(mediaId)
    if (!rule) return

    if (rule.accessLevel === MediaAccessLevel.SELECTIVE) {
      rule.allowedUsers = rule.allowedUsers.filter(id => id !== userId)
      rule.updatedAt = new Date()
      await this.saveAccessRules()
    }

    // Revoke any active access tokens
    for (const [token, tokenData] of this.accessTokens.entries()) {
      if (tokenData.mediaId === mediaId && tokenData.userId === userId) {
        this.accessTokens.delete(token)
      }
    }

    this.emit('accessRevoked', { mediaId, userId })
  }

  /**
   * Delete expired media files
   */
  async cleanupExpiredMedia(): Promise<string[]> {
    const now = new Date()
    const expiredMediaIds: string[] = []

    for (const [mediaId, rule] of this.expirationRules.entries()) {
      if (now > rule.expiresAt) {
        if (rule.autoDelete) {
          expiredMediaIds.push(mediaId)
          this.expirationRules.delete(mediaId)
          this.accessRules.delete(mediaId)
          
          // Clean up access tokens
          for (const [token, tokenData] of this.accessTokens.entries()) {
            if (tokenData.mediaId === mediaId) {
              this.accessTokens.delete(token)
            }
          }
          
          // Clean up access log
          this.accessLog.delete(mediaId)
          
          this.emit('mediaExpired', mediaId)
        } else {
          // Just notify about expiration
          this.emit('mediaExpirationWarning', mediaId)
        }
      } else if (rule.notifyBeforeExpiry) {
        // Check if we should notify about upcoming expiration
        const hoursUntilExpiry = (rule.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
        if (hoursUntilExpiry <= rule.notifyHours && hoursUntilExpiry > 0) {
          this.emit('mediaExpirationNotification', {
            mediaId,
            expiresAt: rule.expiresAt,
            hoursRemaining: Math.ceil(hoursUntilExpiry)
          })
        }
      }
    }

    if (expiredMediaIds.length > 0) {
      await this.saveAccessRules()
      await this.saveExpirationRules()
    }

    return expiredMediaIds
  }

  /**
   * Get media access rule
   */
  getMediaAccessRule(mediaId: string): MediaAccessRule | undefined {
    return this.accessRules.get(mediaId)
  }

  /**
   * Get media expiration rule
   */
  getMediaExpirationRule(mediaId: string): MediaExpirationRule | undefined {
    return this.expirationRules.get(mediaId)
  }

  /**
   * Get access log for a media file
   */
  getMediaAccessLog(mediaId: string): MediaAccessRequest[] {
    return this.accessLog.get(mediaId) || []
  }

  /**
   * Get all media files accessible by a user based on match status
   */
  getAccessibleMedia(userId: string, matchStatus: MatchStatus): string[] {
    const accessibleMedia: string[] = []

    for (const [mediaId, rule] of this.accessRules.entries()) {
      // Check expiration
      if (rule.expiresAt && new Date() > rule.expiresAt) {
        continue
      }

      // Check media expiration
      const expirationRule = this.expirationRules.get(mediaId)
      if (expirationRule && new Date() > expirationRule.expiresAt) {
        continue
      }

      // Check access level
      switch (rule.accessLevel) {
        case MediaAccessLevel.PUBLIC:
          accessibleMedia.push(mediaId)
          break
        case MediaAccessLevel.MATCHES_ONLY:
          if (matchStatus === MatchStatus.MATCHED) {
            accessibleMedia.push(mediaId)
          }
          break
        case MediaAccessLevel.SELECTIVE:
          if (rule.allowedUsers.includes(userId)) {
            if (!rule.matchStatusRequired || matchStatus === rule.matchStatusRequired) {
              accessibleMedia.push(mediaId)
            }
          }
          break
      }
    }

    return accessibleMedia
  }

  /**
   * Update match status and refresh access permissions
   */
  async updateMatchStatus(userId: string, newMatchStatus: MatchStatus): Promise<void> {
    // This would typically be called when match status changes
    // to update access permissions accordingly
    this.emit('matchStatusUpdated', { userId, matchStatus: newMatchStatus })
  }

  /**
   * Get privacy statistics
   */
  getPrivacyStats(): MediaPrivacyStats {
    const totalRequests = Array.from(this.accessLog.values())
      .reduce((sum, requests) => sum + requests.length, 0)
    
    // Count granted vs denied (simplified - in real implementation would track this)
    const grantedRequests = Math.floor(totalRequests * 0.7) // Placeholder
    const deniedRequests = totalRequests - grantedRequests

    const accessLevelCounts = {
      [MediaAccessLevel.PUBLIC]: 0,
      [MediaAccessLevel.MATCHES_ONLY]: 0,
      [MediaAccessLevel.PRIVATE]: 0,
      [MediaAccessLevel.SELECTIVE]: 0
    }

    for (const rule of this.accessRules.values()) {
      accessLevelCounts[rule.accessLevel]++
    }

    const expiredCount = Array.from(this.expirationRules.values())
      .filter(rule => new Date() > rule.expiresAt).length

    return {
      totalMediaFiles: this.accessRules.size,
      publicMedia: accessLevelCounts[MediaAccessLevel.PUBLIC],
      matchOnlyMedia: accessLevelCounts[MediaAccessLevel.MATCHES_ONLY],
      privateMedia: accessLevelCounts[MediaAccessLevel.PRIVATE],
      selectiveMedia: accessLevelCounts[MediaAccessLevel.SELECTIVE],
      expiredMedia: expiredCount,
      accessRequests: totalRequests,
      grantedRequests,
      deniedRequests
    }
  }

  /**
   * Bulk update access levels for multiple media files
   */
  async bulkUpdateAccess(
    mediaIds: string[],
    accessLevel: MediaAccessLevel,
    options: {
      allowedUsers?: string[]
      expiresAt?: Date
      matchStatusRequired?: MatchStatus
    } = {}
  ): Promise<void> {
    for (const mediaId of mediaIds) {
      await this.setMediaAccess(mediaId, accessLevel, options)
    }
    this.emit('bulkAccessUpdate', { mediaIds, accessLevel, options })
  }

  /**
   * Get media files expiring within specified hours
   */
  getExpiringMedia(withinHours: number = 24): string[] {
    const cutoffTime = new Date(Date.now() + withinHours * 60 * 60 * 1000)
    const expiringMedia: string[] = []
    
    for (const [mediaId, rule] of this.expirationRules.entries()) {
      if (rule.expiresAt <= cutoffTime && rule.expiresAt > new Date()) {
        expiringMedia.push(mediaId)
      }
    }
    
    return expiringMedia
  }

  /**
   * Extend expiration time for a media file
   */
  async extendMediaExpiration(
    mediaId: string,
    additionalHours: number
  ): Promise<void> {
    const rule = this.expirationRules.get(mediaId)
    if (!rule) {
      throw new Error(`No expiration rule found for media: ${mediaId}`)
    }

    const newExpiresAt = new Date(rule.expiresAt.getTime() + additionalHours * 60 * 60 * 1000)
    rule.expiresAt = newExpiresAt
    
    await this.saveExpirationRules()
    this.emit('expirationExtended', { mediaId, newExpiresAt, additionalHours })
  }

  /**
   * Set media access based on match status with automatic updates
   */
  async setMatchBasedAccess(
    mediaId: string,
    statusLevels: {
      [MatchStatus.NO_INTERACTION]?: MediaAccessLevel
      [MatchStatus.LIKED]?: MediaAccessLevel
      [MatchStatus.MATCHED]?: MediaAccessLevel
      [MatchStatus.BLOCKED]?: MediaAccessLevel
    }
  ): Promise<void> {
    // Store match-based access rules for dynamic access control
    let rule = this.accessRules.get(mediaId)
    if (!rule) {
      rule = {
        mediaId,
        accessLevel: MediaAccessLevel.PRIVATE,
        allowedUsers: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    // Store match status levels in metadata
    (rule as any).matchStatusLevels = statusLevels
    rule.updatedAt = new Date()
    
    this.accessRules.set(mediaId, rule)
    await this.saveAccessRules()
    
    this.emit('matchBasedAccessSet', { mediaId, matchStatusLevels: statusLevels })
  }

  /**
   * Get effective access level based on current match status
   */
  getEffectiveAccessLevel(mediaId: string, matchStatus: MatchStatus): MediaAccessLevel {
    const rule = this.accessRules.get(mediaId)
    if (!rule) {
      return this.DEFAULT_ACCESS_LEVEL
    }

    const statusLevels = (rule as any).matchStatusLevels
    if (statusLevels && statusLevels[matchStatus]) {
      return statusLevels[matchStatus]
    }

    return rule.accessLevel
  }

  /**
   * Batch set expiration for multiple media files
   */
  async batchSetExpiration(
    mediaIds: string[],
    expiresAt: Date,
    options: {
      autoDelete?: boolean
      notifyBeforeExpiry?: boolean
      notifyHours?: number
    } = {}
  ): Promise<void> {
    const promises = mediaIds.map(mediaId => 
      this.setMediaExpiration(mediaId, expiresAt, options)
    )
    
    await Promise.all(promises)
    this.emit('batchExpirationSet', { mediaIds, expiresAt, options })
  }

  /**
   * Get media files by owner
   */
  getMediaByOwner(ownerId: string): string[] {
    const mediaIds: string[] = []
    
    for (const [mediaId, rule] of this.accessRules.entries()) {
      // In a real implementation, we'd store owner info in the rule
      // For now, we'll check if the user is the only one with full access
      if (rule.accessLevel === MediaAccessLevel.PRIVATE || 
          (rule.accessLevel === MediaAccessLevel.SELECTIVE && 
           rule.allowedUsers.length === 1 && 
           rule.allowedUsers[0] === ownerId)) {
        mediaIds.push(mediaId)
      }
    }
    
    return mediaIds
  }

  /**
   * Create temporary access link with expiration
   */
  async createTemporaryAccess(
    mediaId: string,
    requesterId: string,
    validForHours: number = 1,
    maxUses: number = 1
  ): Promise<{ accessToken: string; expiresAt: Date; usesRemaining: number }> {
    const accessToken = this.generateAccessToken()
    const expiresAt = new Date(Date.now() + validForHours * 60 * 60 * 1000)
    
    this.accessTokens.set(accessToken, {
      mediaId,
      userId: requesterId,
      expiresAt,
      usesRemaining: maxUses,
      maxUses
    } as any)

    this.emit('temporaryAccessCreated', { mediaId, requesterId, accessToken, expiresAt, maxUses })
    
    return { accessToken, expiresAt, usesRemaining: maxUses }
  }

  /**
   * Use temporary access token (decrements usage count)
   */
  async useTemporaryAccess(accessToken: string): Promise<boolean> {
    const tokenData = this.accessTokens.get(accessToken) as any
    if (!tokenData) {
      return false
    }

    if (new Date() > tokenData.expiresAt) {
      this.accessTokens.delete(accessToken)
      return false
    }

    if (tokenData.usesRemaining <= 0) {
      this.accessTokens.delete(accessToken)
      return false
    }

    tokenData.usesRemaining--
    
    if (tokenData.usesRemaining <= 0) {
      this.accessTokens.delete(accessToken)
    }

    this.emit('temporaryAccessUsed', { accessToken, usesRemaining: tokenData.usesRemaining })
    return true
  }

  /**
   * Remove all access rules and expiration rules for a media file
   */
  async removeMediaPrivacyRules(mediaId: string): Promise<void> {
    const hadAccessRule = this.accessRules.has(mediaId)
    const hadExpirationRule = this.expirationRules.has(mediaId)
    
    this.accessRules.delete(mediaId)
    this.expirationRules.delete(mediaId)
    
    // Clean up access tokens
    for (const [token, tokenData] of this.accessTokens.entries()) {
      if (tokenData.mediaId === mediaId) {
        this.accessTokens.delete(token)
      }
    }
    
    // Clean up access log
    this.accessLog.delete(mediaId)
    
    if (hadAccessRule || hadExpirationRule) {
      await this.saveAccessRules()
      await this.saveExpirationRules()
      this.emit('privacyRulesRemoved', mediaId)
    }
  }

  private logAccessRequest(mediaId: string, requesterId: string, matchStatus: MatchStatus): void {
    const request: MediaAccessRequest = {
      mediaId,
      requesterId,
      timestamp: new Date(),
      matchStatus
    }

    if (!this.accessLog.has(mediaId)) {
      this.accessLog.set(mediaId, [])
    }
    
    this.accessLog.get(mediaId)!.push(request)
    
    // Keep only last 100 requests per media to prevent memory bloat
    const requests = this.accessLog.get(mediaId)!
    if (requests.length > 100) {
      requests.splice(0, requests.length - 100)
    }
  }

  private generateAccessToken(): string {
    return `access_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredMedia()
        this.cleanupExpiredTokens()
      } catch (error) {
        console.error('Cleanup error:', error)
      }
    }, this.CLEANUP_INTERVAL_MS)
  }

  private cleanupExpiredTokens(): void {
    const now = new Date()
    for (const [token, tokenData] of this.accessTokens.entries()) {
      if (now > tokenData.expiresAt) {
        this.accessTokens.delete(token)
      }
    }
  }

  private async loadAccessRules(): Promise<void> {
    try {
      // In a real implementation, this would load from persistent storage
      // For now, we'll simulate loading from localStorage in browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem('media_access_rules')
        if (stored) {
          const rules = JSON.parse(stored)
          for (const [mediaId, rule] of Object.entries(rules)) {
            this.accessRules.set(mediaId, {
              ...rule as MediaAccessRule,
              createdAt: new Date((rule as any).createdAt),
              updatedAt: new Date((rule as any).updatedAt),
              expiresAt: (rule as any).expiresAt ? new Date((rule as any).expiresAt) : undefined
            })
          }
        }
      }
      console.log(`Loaded ${this.accessRules.size} access rules from storage`)
    } catch (error) {
      console.warn('Failed to load access rules:', error)
    }
  }

  private async saveAccessRules(): Promise<void> {
    try {
      // In a real implementation, this would save to persistent storage
      if (typeof window !== 'undefined' && window.localStorage) {
        const rules: Record<string, any> = {}
        for (const [mediaId, rule] of this.accessRules.entries()) {
          rules[mediaId] = {
            ...rule,
            createdAt: rule.createdAt.toISOString(),
            updatedAt: rule.updatedAt.toISOString(),
            expiresAt: rule.expiresAt?.toISOString()
          }
        }
        localStorage.setItem('media_access_rules', JSON.stringify(rules))
      }
      console.log(`Saved ${this.accessRules.size} access rules to storage`)
    } catch (error) {
      console.warn('Failed to save access rules:', error)
    }
  }

  private async loadExpirationRules(): Promise<void> {
    try {
      // In a real implementation, this would load from persistent storage
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem('media_expiration_rules')
        if (stored) {
          const rules = JSON.parse(stored)
          for (const [mediaId, rule] of Object.entries(rules)) {
            this.expirationRules.set(mediaId, {
              ...rule as MediaExpirationRule,
              expiresAt: new Date((rule as any).expiresAt)
            })
          }
        }
      }
      console.log(`Loaded ${this.expirationRules.size} expiration rules from storage`)
    } catch (error) {
      console.warn('Failed to load expiration rules:', error)
    }
  }

  private async saveExpirationRules(): Promise<void> {
    try {
      // In a real implementation, this would save to persistent storage
      if (typeof window !== 'undefined' && window.localStorage) {
        const rules: Record<string, any> = {}
        for (const [mediaId, rule] of this.expirationRules.entries()) {
          rules[mediaId] = {
            ...rule,
            expiresAt: rule.expiresAt.toISOString()
          }
        }
        localStorage.setItem('media_expiration_rules', JSON.stringify(rules))
      }
      console.log(`Saved ${this.expirationRules.size} expiration rules to storage`)
    } catch (error) {
      console.warn('Failed to save expiration rules:', error)
    }
  }

  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    this.accessRules.clear()
    this.expirationRules.clear()
    this.accessTokens.clear()
    this.accessLog.clear()

    this.isInitialized = false
    this.emit('destroyed')
  }
}