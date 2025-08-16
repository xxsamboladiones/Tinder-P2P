import { ProfileCRDT } from './ProfileCRDT'
import { P2PManager } from './P2PManager'
import { DiscoveryCriteria, PeerInfo } from './types'
import { GeohashManager } from './GeohashManager'

export interface ProfileSyncOptions {
  maxCacheSize: number
  syncInterval: number
  maxRetries: number
  batchSize: number
}

export interface ProfileCacheEntry {
  profile: ProfileCRDT
  lastSeen: Date
  syncCount: number
  source: string // peer ID that provided this profile
}

export class ProfileSyncManager {
  private p2pManager: P2PManager
  private profileCache: Map<string, ProfileCacheEntry> = new Map()
  private syncSubscribers: Set<(profiles: ProfileCRDT[]) => void> = new Set()
  private syncInterval: NodeJS.Timeout | null = null
  private options: ProfileSyncOptions

  constructor(p2pManager: P2PManager, options: Partial<ProfileSyncOptions> = {}) {
    this.p2pManager = p2pManager
    this.options = {
      maxCacheSize: 1000,
      syncInterval: 30000, // 30 seconds
      maxRetries: 3,
      batchSize: 10,
      ...options
    }

    // Subscribe to profile updates from P2P manager
    this.p2pManager.subscribeToProfiles(this.handleProfileUpdate.bind(this))
  }

  /**
   * Start automatic profile synchronization
   */
  startSync(): void {
    if (this.syncInterval) {
      return // Already started
    }

    this.syncInterval = setInterval(async () => {
      try {
        await this.performPeriodicSync()
      } catch (error) {
        console.error('Periodic profile sync failed:', error)
      }
    }, this.options.syncInterval)

    console.log('Profile sync manager started with interval:', this.options.syncInterval)
  }

  /**
   * Stop automatic profile synchronization
   */
  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
      console.log('Profile sync manager stopped')
    }
  }

  /**
   * Manually trigger profile synchronization with specific criteria
   */
  async syncProfiles(criteria: DiscoveryCriteria): Promise<ProfileCRDT[]> {
    try {
      console.log('Starting manual profile sync with criteria:', criteria)
      
      // Use P2P manager to sync profiles
      const profiles = await this.p2pManager.syncProfilesWithCriteria(criteria)
      
      // Update cache with new profiles
      for (const profile of profiles) {
        this.updateProfileCache(profile, 'sync')
      }

      // Notify subscribers
      this.notifySubscribers(profiles)

      console.log('Manual profile sync completed, synced', profiles.length, 'profiles')
      return profiles
    } catch (error) {
      console.error('Manual profile sync failed:', error)
      return []
    }
  }

  /**
   * Request a specific profile by ID
   */
  async requestProfile(peerId: string, profileId: string): Promise<ProfileCRDT | null> {
    try {
      // Check cache first
      const cached = this.profileCache.get(profileId)
      if (cached && this.isProfileFresh(cached)) {
        console.log('Returning cached profile:', profileId)
        return cached.profile
      }

      // Request from peer
      console.log('Requesting profile from peer:', peerId, 'profile:', profileId)
      const profile = await this.p2pManager.requestProfile(peerId, profileId)
      
      if (profile) {
        this.updateProfileCache(profile, peerId)
        this.notifySubscribers([profile])
      }

      return profile
    } catch (error) {
      console.error('Profile request failed:', error)
      return null
    }
  }

  /**
   * Broadcast local profile to network
   */
  async broadcastProfile(profile: ProfileCRDT): Promise<void> {
    try {
      await this.p2pManager.broadcastProfile(profile)
      
      // Update local cache
      this.updateProfileCache(profile, 'local')
      
      // Notify subscribers about the broadcasted profile
      this.notifySubscribers([profile])
      
      console.log('Profile broadcasted:', profile.id)
    } catch (error) {
      console.error('Profile broadcast failed:', error)
      throw error
    }
  }

  /**
   * Get cached profiles matching criteria
   */
  getCachedProfiles(criteria?: Partial<DiscoveryCriteria>): ProfileCRDT[] {
    const profiles: ProfileCRDT[] = []
    
    for (const entry of this.profileCache.values()) {
      if (this.matchesCriteria(entry.profile, criteria)) {
        profiles.push(entry.profile)
      }
    }

    // Sort by last seen (most recent first)
    return profiles.sort((a, b) => {
      const entryA = this.profileCache.get(a.id)!
      const entryB = this.profileCache.get(b.id)!
      return entryB.lastSeen.getTime() - entryA.lastSeen.getTime()
    })
  }

  /**
   * Subscribe to profile sync updates
   */
  onProfileSync(callback: (profiles: ProfileCRDT[]) => void): () => void {
    this.syncSubscribers.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.syncSubscribers.delete(callback)
    }
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): {
    cachedProfiles: number
    totalSyncs: number
    lastSyncTime: Date | null
    cacheHitRate: number
  } {
    const totalSyncs = Array.from(this.profileCache.values())
      .reduce((sum, entry) => sum + entry.syncCount, 0)
    
    const lastSyncTime = Array.from(this.profileCache.values())
      .reduce((latest, entry) => 
        !latest || entry.lastSeen > latest ? entry.lastSeen : latest, 
        null as Date | null
      )

    return {
      cachedProfiles: this.profileCache.size,
      totalSyncs,
      lastSyncTime,
      cacheHitRate: 0 // TODO: Implement cache hit tracking
    }
  }

  /**
   * Clear profile cache
   */
  clearCache(): void {
    this.profileCache.clear()
    console.log('Profile cache cleared')
  }

  /**
   * Remove specific profile from cache
   */
  removeFromCache(profileId: string): boolean {
    const removed = this.profileCache.delete(profileId)
    if (removed) {
      console.log('Profile removed from cache:', profileId)
    }
    return removed
  }

  // Private Methods

  private handleProfileUpdate(profile: ProfileCRDT): void {
    this.updateProfileCache(profile, 'network')
    this.notifySubscribers([profile])
  }

  private updateProfileCache(profile: ProfileCRDT, source: string): void {
    const existing = this.profileCache.get(profile.id)
    
    // Always increment sync count when we see a profile
    const syncCount = existing ? existing.syncCount + 1 : 1
    
    // Only update if this is a newer version or first time seeing this profile
    if (!existing || profile.version > existing.profile.version) {
      // Enforce cache size limit
      if (this.profileCache.size >= this.options.maxCacheSize && !existing) {
        this.evictOldestProfile()
      }

      const entry: ProfileCacheEntry = {
        profile,
        lastSeen: new Date(),
        syncCount,
        source
      }

      this.profileCache.set(profile.id, entry)
      console.log('Profile cache updated:', profile.id, 'version:', profile.version, 'source:', source)
    } else if (existing) {
      // Update sync count and last seen even if we don't update the profile
      existing.syncCount = syncCount
      existing.lastSeen = new Date()
      console.log('Profile sync count updated:', profile.id, 'syncCount:', syncCount)
    }
  }

  private evictOldestProfile(): void {
    let oldestEntry: [string, ProfileCacheEntry] | null = null
    
    for (const entry of this.profileCache.entries()) {
      if (!oldestEntry || entry[1].lastSeen < oldestEntry[1].lastSeen) {
        oldestEntry = entry
      }
    }

    if (oldestEntry) {
      this.profileCache.delete(oldestEntry[0])
      console.log('Evicted oldest profile from cache:', oldestEntry[0])
    }
  }

  private isProfileFresh(entry: ProfileCacheEntry): boolean {
    const maxAge = 5 * 60 * 1000 // 5 minutes
    return Date.now() - entry.lastSeen.getTime() < maxAge
  }

  private matchesCriteria(profile: ProfileCRDT, criteria?: Partial<DiscoveryCriteria>): boolean {
    if (!criteria) {
      return true
    }

    // Check age range
    if (criteria.ageRange) {
      const [minAge, maxAge] = criteria.ageRange
      if (profile.age < minAge || profile.age > maxAge) {
        return false
      }
    }

    // Check interests overlap
    if (criteria.interests && criteria.interests.length > 0) {
      const profileInterests = profile.interests
      const hasCommonInterest = criteria.interests.some(interest => 
        profileInterests.includes(interest)
      )
      if (!hasCommonInterest) {
        return false
      }
    }

    // Check geohash proximity using GeohashManager
    if (criteria.geohash && profile.location) {
      const searchLocation = { geohash: criteria.geohash, timestamp: new Date() }
      
      // Use maxDistance from criteria or default to reasonable range
      const maxDistance = criteria.maxDistance || 50 // 50km default
      
      if (!GeohashManager.isWithinDistance(profile.location, searchLocation, maxDistance)) {
        return false
      }
    }

    return true
  }

  /**
   * Create privacy-preserving location for profile
   * @param latitude Exact latitude
   * @param longitude Exact longitude
   * @param precision Geohash precision (default: 5 for ~2.4km privacy)
   * @returns GeohashLocation with privacy protection
   */
  createPrivateLocation(latitude: number, longitude: number, precision: number = 5) {
    return GeohashManager.createPrivateLocation(latitude, longitude, precision)
  }

  /**
   * Get location privacy radius for a geohash
   * @param geohash Geohash to check
   * @returns Privacy radius in kilometers
   */
  getLocationPrivacyRadius(geohash: string): number {
    return GeohashManager.getPrivacyRadius(geohash.length)
  }

  private notifySubscribers(profiles: ProfileCRDT[]): void {
    this.syncSubscribers.forEach(callback => {
      try {
        callback(profiles)
      } catch (error) {
        console.error('Profile sync subscriber callback failed:', error)
      }
    })
  }

  private async performPeriodicSync(): Promise<void> {
    if (!this.p2pManager.isConnected()) {
      return
    }

    try {
      // Get connected peers
      const connectedPeers = this.p2pManager.getConnectedPeers()
      if (connectedPeers.length === 0) {
        return
      }

      console.log('Performing periodic profile sync with', connectedPeers.length, 'peers')

      // Request profiles from a subset of connected peers
      const peersToSync = connectedPeers.slice(0, this.options.batchSize)
      const syncPromises = peersToSync.map(async (peerId) => {
        try {
          // In a real implementation, we'd maintain a list of known profile IDs per peer
          // For now, we'll assume peer ID matches profile ID
          return await this.requestProfile(peerId, peerId)
        } catch (error) {
          console.warn('Failed to sync profile from peer:', peerId, error)
          return null
        }
      })

      const results = await Promise.allSettled(syncPromises)
      const syncedProfiles = results
        .filter((result): result is PromiseFulfilledResult<ProfileCRDT | null> => 
          result.status === 'fulfilled' && result.value !== null)
        .map(result => result.value!)

      if (syncedProfiles.length > 0) {
        console.log('Periodic sync completed, synced', syncedProfiles.length, 'profiles')
        this.notifySubscribers(syncedProfiles)
      }
    } catch (error) {
      console.error('Periodic sync failed:', error)
    }
  }

  // Cleanup
  destroy(): void {
    this.stopSync()
    this.syncSubscribers.clear()
    this.profileCache.clear()
    console.log('Profile sync manager destroyed')
  }
}