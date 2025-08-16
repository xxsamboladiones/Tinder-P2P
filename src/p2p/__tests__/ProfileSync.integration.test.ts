import { ProfileSyncManager } from '../ProfileSyncManager'
import { ProfileCRDT } from '../ProfileCRDT'
import { P2PManager } from '../P2PManager'
import { DiscoveryCriteria, PeerInfo } from '../types'

// Mock implementations for integration testing
class MockP2PManager {
  private profiles: Map<string, ProfileCRDT> = new Map()
  private subscribers: Set<(profile: ProfileCRDT) => void> = new Set()
  private connectedPeers: Set<string> = new Set()
  private isConnectedFlag = true

  // Simulate adding a peer with their profile
  addPeer(peerId: string, profile: ProfileCRDT): void {
    this.connectedPeers.add(peerId)
    this.profiles.set(peerId, profile)
  }

  removePeer(peerId: string): void {
    this.connectedPeers.delete(peerId)
    this.profiles.delete(peerId)
  }

  // Simulate receiving a profile update from the network
  simulateProfileUpdate(profile: ProfileCRDT): void {
    this.profiles.set(profile.id, profile)
    this.subscribers.forEach(callback => callback(profile))
  }

  // P2PManager interface implementation
  subscribeToProfiles(callback: (profile: ProfileCRDT) => void): void {
    this.subscribers.add(callback)
  }

  async syncProfilesWithCriteria(criteria: DiscoveryCriteria): Promise<ProfileCRDT[]> {
    const matchingProfiles: ProfileCRDT[] = []
    
    for (const profile of this.profiles.values()) {
      if (this.matchesCriteria(profile, criteria)) {
        matchingProfiles.push(profile)
      }
    }
    
    return matchingProfiles
  }

  async requestProfile(peerId: string, profileId: string): Promise<ProfileCRDT | null> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10))
    
    // Look for profile by profileId first, then by peerId as fallback
    return this.profiles.get(profileId) || this.profiles.get(peerId) || null
  }

  async broadcastProfile(profile: ProfileCRDT): Promise<void> {
    // Simulate broadcasting to all connected peers
    this.profiles.set(profile.id, profile)
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 5))
    
    // Don't trigger subscribers here - that's handled by ProfileSyncManager
  }

  isConnected(): boolean {
    return this.isConnectedFlag
  }

  getConnectedPeers(): string[] {
    return Array.from(this.connectedPeers)
  }

  setConnected(connected: boolean): void {
    this.isConnectedFlag = connected
  }

  private matchesCriteria(profile: ProfileCRDT, criteria: DiscoveryCriteria): boolean {
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

    return true
  }
}

// Helper function to create test profiles
const createTestProfile = (id: string, age: number, interests: string[]): ProfileCRDT => {
  const profile = new ProfileCRDT(id, `did:key:${id}`)
  profile.setName(`User ${id}`)
  profile.setAge(age)
  profile.setBio(`Bio for user ${id}`)
  
  interests.forEach(interest => profile.addInterest(interest))
  
  return profile
}

describe('Profile Synchronization Integration Tests', () => {
  let mockP2P: MockP2PManager
  let syncManager: ProfileSyncManager

  beforeEach(() => {
    mockP2P = new MockP2PManager()
    syncManager = new ProfileSyncManager(mockP2P as any, {
      maxCacheSize: 100,
      syncInterval: 100, // Fast interval for testing
      maxRetries: 2,
      batchSize: 5
    })
  })

  afterEach(() => {
    syncManager.destroy()
  })

  describe('Multi-Peer Profile Synchronization', () => {
    test('should sync profiles from multiple peers', async () => {
      // Create test profiles for different peers
      const profile1 = createTestProfile('user1', 25, ['music', 'travel'])
      const profile2 = createTestProfile('user2', 30, ['sports', 'cooking'])
      const profile3 = createTestProfile('user3', 28, ['music', 'art'])

      // Add peers with their profiles
      mockP2P.addPeer('peer1', profile1)
      mockP2P.addPeer('peer2', profile2)
      mockP2P.addPeer('peer3', profile3)

      // Define sync criteria
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru',
        ageRange: [20, 35],
        interests: ['music'],
        maxDistance: 10
      }

      // Perform sync
      const syncedProfiles = await syncManager.syncProfiles(criteria)

      // Should sync profiles matching criteria (user1 and user3 have music interest)
      expect(syncedProfiles).toHaveLength(2)
      expect(syncedProfiles.map(p => p.id).sort()).toEqual(['user1', 'user3'])

      // Profiles should be cached
      const cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(2)
    })

    test('should handle profile updates from network', async () => {
      const profile = createTestProfile('user1', 25, ['music'])
      
      // Track profile updates
      const profileUpdates: ProfileCRDT[] = []
      const unsubscribe = syncManager.onProfileSync((profiles) => {
        profileUpdates.push(...profiles)
      })

      // Simulate profile update from network
      mockP2P.simulateProfileUpdate(profile)

      // Should receive the profile update
      expect(profileUpdates).toHaveLength(1)
      expect(profileUpdates[0].id).toBe('user1')

      // Profile should be cached
      const cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(1)
      expect(cachedProfiles[0].id).toBe('user1')

      unsubscribe()
    })

    test('should handle concurrent profile updates', async () => {
      const profiles = [
        createTestProfile('user1', 25, ['music']),
        createTestProfile('user2', 30, ['sports']),
        createTestProfile('user3', 28, ['art'])
      ]

      // Track all profile updates
      const allUpdates: ProfileCRDT[] = []
      const unsubscribe = syncManager.onProfileSync((profiles) => {
        allUpdates.push(...profiles)
      })

      // Simulate concurrent profile updates
      const updatePromises = profiles.map(profile => 
        new Promise<void>(resolve => {
          setTimeout(() => {
            mockP2P.simulateProfileUpdate(profile)
            resolve()
          }, Math.random() * 50) // Random delay up to 50ms
        })
      )

      await Promise.all(updatePromises)

      // Should receive all profile updates
      expect(allUpdates).toHaveLength(3)
      expect(allUpdates.map(p => p.id).sort()).toEqual(['user1', 'user2', 'user3'])

      // All profiles should be cached
      const cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(3)

      unsubscribe()
    })
  })

  describe('Profile Version Conflict Resolution', () => {
    test('should handle profile version conflicts correctly', async () => {
      const profile1v1 = createTestProfile('user1', 25, ['music'])
      const profile1v2 = createTestProfile('user1', 26, ['music', 'travel'])
      
      // Manually set versions
      ;(profile1v1 as any).profileMap.set('version', 1)
      ;(profile1v2 as any).profileMap.set('version', 2)

      // Simulate receiving older version first
      mockP2P.simulateProfileUpdate(profile1v1)
      
      let cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(1)
      expect(cachedProfiles[0].version).toBe(1)
      expect(cachedProfiles[0].age).toBe(25)

      // Simulate receiving newer version
      mockP2P.simulateProfileUpdate(profile1v2)
      
      cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(1)
      expect(cachedProfiles[0].version).toBe(2)
      expect(cachedProfiles[0].age).toBe(26)
      expect(cachedProfiles[0].interests).toContain('travel')
    })

    test('should reject older profile versions', async () => {
      const profile1v2 = createTestProfile('user1', 26, ['music', 'travel'])
      const profile1v1 = createTestProfile('user1', 25, ['music'])
      
      // Manually set versions
      ;(profile1v2 as any).profileMap.set('version', 2)
      ;(profile1v1 as any).profileMap.set('version', 1)

      // Simulate receiving newer version first
      mockP2P.simulateProfileUpdate(profile1v2)
      
      let cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(1)
      expect(cachedProfiles[0].version).toBe(2)

      // Simulate receiving older version (should be ignored)
      mockP2P.simulateProfileUpdate(profile1v1)
      
      cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(1)
      expect(cachedProfiles[0].version).toBe(2) // Should still be version 2
      expect(cachedProfiles[0].age).toBe(26) // Should still have newer data
    })
  })

  describe('On-Demand Profile Replication', () => {
    test('should request specific profile from peer', async () => {
      const profile = createTestProfile('user1', 25, ['music'])
      mockP2P.addPeer('peer1', profile)

      // Request specific profile
      const requestedProfile = await syncManager.requestProfile('peer1', 'user1')

      expect(requestedProfile).not.toBeNull()
      expect(requestedProfile!.id).toBe('user1')
      expect(requestedProfile!.age).toBe(25)

      // Profile should be cached
      const cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(1)
      expect(cachedProfiles[0].id).toBe('user1')
    })

    test('should return cached profile if available and fresh', async () => {
      const profile = createTestProfile('user1', 25, ['music'])
      
      // Add profile to cache first
      mockP2P.simulateProfileUpdate(profile)
      
      // Request the same profile (should return cached version)
      const requestedProfile = await syncManager.requestProfile('peer1', 'user1')

      expect(requestedProfile).not.toBeNull()
      expect(requestedProfile!.id).toBe('user1')
    })

    test('should handle profile request failure', async () => {
      // Request non-existent profile
      const requestedProfile = await syncManager.requestProfile('peer1', 'nonexistent')

      expect(requestedProfile).toBeNull()
    })
  })

  describe('Profile Broadcasting', () => {
    test('should broadcast profile to network', async () => {
      const profile = createTestProfile('user1', 25, ['music'])

      await syncManager.broadcastProfile(profile)

      // Profile should be cached locally
      const cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(1)
      expect(cachedProfiles[0].id).toBe('user1')
    })

    test('should notify subscribers when broadcasting profile', async () => {
      const profile = createTestProfile('user1', 25, ['music'])
      
      const profileUpdates: ProfileCRDT[] = []
      const unsubscribe = syncManager.onProfileSync((profiles) => {
        profileUpdates.push(...profiles)
      })

      await syncManager.broadcastProfile(profile)

      expect(profileUpdates).toHaveLength(1)
      expect(profileUpdates[0].id).toBe('user1')

      unsubscribe()
    })
  })

  describe('Network Resilience', () => {
    test('should handle disconnection gracefully', async () => {
      // Start with connected state
      expect(mockP2P.isConnected()).toBe(true)

      // Simulate disconnection
      mockP2P.setConnected(false)

      // Sync should handle disconnection gracefully
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru',
        ageRange: [20, 35],
        interests: ['music'],
        maxDistance: 10
      }

      const syncedProfiles = await syncManager.syncProfiles(criteria)
      expect(syncedProfiles).toHaveLength(0) // Should return empty array, not throw
    })

    test('should resume sync after reconnection', async () => {
      const profile = createTestProfile('user1', 25, ['music'])
      
      // Start disconnected
      mockP2P.setConnected(false)
      
      // Add profile while disconnected
      mockP2P.addPeer('peer1', profile)
      
      // Reconnect
      mockP2P.setConnected(true)
      
      // Sync should work after reconnection
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru',
        ageRange: [20, 35],
        interests: ['music'],
        maxDistance: 10
      }

      const syncedProfiles = await syncManager.syncProfiles(criteria)
      expect(syncedProfiles).toHaveLength(1)
      expect(syncedProfiles[0].id).toBe('user1')
    })
  })

  describe('Performance and Scalability', () => {
    test('should handle large number of profiles efficiently', async () => {
      const startTime = Date.now()
      
      // Create many profiles
      const profiles: ProfileCRDT[] = []
      for (let i = 0; i < 100; i++) {
        const profile = createTestProfile(`user${i}`, 20 + (i % 40), ['music', 'travel'])
        profiles.push(profile)
        mockP2P.addPeer(`peer${i}`, profile)
      }

      // Sync all profiles
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru',
        ageRange: [20, 60],
        interests: ['music'],
        maxDistance: 10
      }

      const syncedProfiles = await syncManager.syncProfiles(criteria)
      
      const endTime = Date.now()
      const duration = endTime - startTime

      expect(syncedProfiles).toHaveLength(100)
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
      
      // All profiles should be cached
      const cachedProfiles = syncManager.getCachedProfiles()
      expect(cachedProfiles).toHaveLength(100)
    })

    test('should enforce cache size limits with many profiles', async () => {
      // Create sync manager with small cache
      const smallCacheSyncManager = new ProfileSyncManager(mockP2P as any, {
        maxCacheSize: 10,
        syncInterval: 1000,
        maxRetries: 2,
        batchSize: 5
      })

      // Add more profiles than cache limit
      for (let i = 0; i < 20; i++) {
        const profile = createTestProfile(`user${i}`, 25, ['music'])
        mockP2P.simulateProfileUpdate(profile)
      }

      // Cache should not exceed limit
      const cachedProfiles = smallCacheSyncManager.getCachedProfiles()
      expect(cachedProfiles.length).toBeLessThanOrEqual(10)

      smallCacheSyncManager.destroy()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed profile data gracefully', async () => {
      // This test would be more relevant with actual network serialization
      // For now, we'll test that the sync manager handles null profiles
      
      const profile = createTestProfile('user1', 25, ['music'])
      mockP2P.addPeer('peer1', profile)
      
      // Remove the profile to simulate a failed request
      mockP2P.removePeer('peer1')
      
      const requestedProfile = await syncManager.requestProfile('peer1', 'user1')
      expect(requestedProfile).toBeNull()
    })

    test('should handle subscriber callback errors', async () => {
      const profile = createTestProfile('user1', 25, ['music'])
      
      // Add a subscriber that throws an error
      const errorCallback = jest.fn(() => {
        throw new Error('Subscriber error')
      })
      
      const normalCallback = jest.fn()
      
      syncManager.onProfileSync(errorCallback)
      syncManager.onProfileSync(normalCallback)
      
      // Should not throw even if one subscriber throws
      expect(() => {
        mockP2P.simulateProfileUpdate(profile)
      }).not.toThrow()
      
      // Normal callback should still be called
      expect(normalCallback).toHaveBeenCalledWith([profile])
      expect(errorCallback).toHaveBeenCalled()
    })
  })

  describe('Sync Statistics and Monitoring', () => {
    test('should provide accurate sync statistics', async () => {
      const profile1 = createTestProfile('user1', 25, ['music'])
      const profile2 = createTestProfile('user2', 30, ['sports'])
      
      // Add profiles
      mockP2P.simulateProfileUpdate(profile1)
      mockP2P.simulateProfileUpdate(profile2)
      
      const stats = syncManager.getSyncStats()
      
      expect(stats.cachedProfiles).toBe(2)
      expect(stats.totalSyncs).toBe(2)
      expect(stats.lastSyncTime).toBeInstanceOf(Date)
      expect(stats.lastSyncTime!.getTime()).toBeLessThanOrEqual(Date.now())
    })

    test('should track sync statistics over time', async () => {
      const profile = createTestProfile('user1', 25, ['music'])
      
      // Initial stats
      let stats = syncManager.getSyncStats()
      expect(stats.cachedProfiles).toBe(0)
      expect(stats.totalSyncs).toBe(0)
      
      // Add profile
      mockP2P.simulateProfileUpdate(profile)
      
      stats = syncManager.getSyncStats()
      expect(stats.cachedProfiles).toBe(1)
      expect(stats.totalSyncs).toBe(1)
      
      // Update same profile (should increment sync count)
      const updatedProfile = createTestProfile('user1', 26, ['music', 'travel'])
      ;(updatedProfile as any).profileMap.set('version', 2)
      mockP2P.simulateProfileUpdate(updatedProfile)
      
      stats = syncManager.getSyncStats()
      expect(stats.cachedProfiles).toBe(1) // Still one unique profile
      expect(stats.totalSyncs).toBe(2) // But sync count increased
    })
  })
})