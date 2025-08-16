import { ProfileSyncManager, ProfileSyncOptions } from '../ProfileSyncManager'
import { ProfileCRDT } from '../ProfileCRDT'
import { P2PManager } from '../P2PManager'
import { DiscoveryCriteria } from '../types'

// Mock P2PManager
const mockP2PManager = {
    subscribeToProfiles: jest.fn(),
    syncProfilesWithCriteria: jest.fn(),
    requestProfile: jest.fn(),
    broadcastProfile: jest.fn(),
    isConnected: jest.fn(),
    getConnectedPeers: jest.fn()
}

// Mock ProfileCRDT
const createMockProfile = (id: string, version: number = 1, interests: string[] = []): ProfileCRDT => {
    const profile = new ProfileCRDT(id, `did:key:${id}`)
    profile.setName(`User ${id}`)
    profile.setAge(25)
    profile.setBio(`Bio for user ${id}`)

    // Add specified interests
    interests.forEach(interest => profile.addInterest(interest))

        // Mock version by directly setting it
        ; (profile as any).profileMap.set('version', version)

    return profile
}

describe('ProfileSyncManager', () => {
    let syncManager: ProfileSyncManager
    let mockP2P: jest.Mocked<P2PManager>

    beforeEach(() => {
        jest.clearAllMocks()
        mockP2P = mockP2PManager as any

        // Default mock implementations
        mockP2P.isConnected.mockReturnValue(true)
        mockP2P.getConnectedPeers.mockReturnValue(['peer1', 'peer2', 'peer3'])
        mockP2P.syncProfilesWithCriteria.mockResolvedValue([])
        mockP2P.requestProfile.mockResolvedValue(null)
        mockP2P.broadcastProfile.mockResolvedValue()

        const options: Partial<ProfileSyncOptions> = {
            maxCacheSize: 100,
            syncInterval: 1000, // 1 second for testing
            maxRetries: 2,
            batchSize: 5
        }

        syncManager = new ProfileSyncManager(mockP2P, options)
    })

    afterEach(() => {
        syncManager.destroy()
    })

    describe('Constructor and Configuration', () => {
        test('should create ProfileSyncManager with default options', () => {
            const defaultSyncManager = new ProfileSyncManager(mockP2P)
            expect(defaultSyncManager).toBeInstanceOf(ProfileSyncManager)

            const stats = defaultSyncManager.getSyncStats()
            expect(stats.cachedProfiles).toBe(0)

            defaultSyncManager.destroy()
        })

        test('should create ProfileSyncManager with custom options', () => {
            const customOptions: ProfileSyncOptions = {
                maxCacheSize: 50,
                syncInterval: 5000,
                maxRetries: 5,
                batchSize: 3
            }

            const customSyncManager = new ProfileSyncManager(mockP2P, customOptions)
            expect(customSyncManager).toBeInstanceOf(ProfileSyncManager)

            customSyncManager.destroy()
        })

        test('should subscribe to P2P profile updates on creation', () => {
            expect(mockP2P.subscribeToProfiles).toHaveBeenCalledTimes(1)
            expect(mockP2P.subscribeToProfiles).toHaveBeenCalledWith(expect.any(Function))
        })
    })

    describe('Profile Cache Management', () => {
        test('should cache profiles when received from network', () => {
            const profile = createMockProfile('user1')

            // Simulate profile update from P2P manager
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile)

            const cachedProfiles = syncManager.getCachedProfiles()
            expect(cachedProfiles).toHaveLength(1)
            expect(cachedProfiles[0].id).toBe('user1')
        })

        test('should update cached profile with newer version', () => {
            const profile1 = createMockProfile('user1', 1)
            const profile2 = createMockProfile('user1', 2)

            // Add first version
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile1)

            // Add newer version
            profileUpdateCallback(profile2)

            const cachedProfiles = syncManager.getCachedProfiles()
            expect(cachedProfiles).toHaveLength(1)
            expect(cachedProfiles[0].version).toBe(2)
        })

        test('should not update cached profile with older version', () => {
            const profile1 = createMockProfile('user1', 2)
            const profile2 = createMockProfile('user1', 1)

            // Add newer version first
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile1)

            // Try to add older version
            profileUpdateCallback(profile2)

            const cachedProfiles = syncManager.getCachedProfiles()
            expect(cachedProfiles).toHaveLength(1)
            expect(cachedProfiles[0].version).toBe(2)
        })

        test('should enforce cache size limit', () => {
            const smallCacheSyncManager = new ProfileSyncManager(mockP2P, { maxCacheSize: 2 })

            const profile1 = createMockProfile('user1')
            const profile2 = createMockProfile('user2')
            const profile3 = createMockProfile('user3')

            // Simulate profile updates
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[1][0] // Second call for new instance
            profileUpdateCallback(profile1)
            profileUpdateCallback(profile2)
            profileUpdateCallback(profile3) // Should evict oldest

            const cachedProfiles = smallCacheSyncManager.getCachedProfiles()
            expect(cachedProfiles).toHaveLength(2)

            smallCacheSyncManager.destroy()
        })

        test('should clear cache', () => {
            const profile = createMockProfile('user1')

            // Add profile to cache
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile)

            expect(syncManager.getCachedProfiles()).toHaveLength(1)

            syncManager.clearCache()
            expect(syncManager.getCachedProfiles()).toHaveLength(0)
        })

        test('should remove specific profile from cache', () => {
            const profile1 = createMockProfile('user1')
            const profile2 = createMockProfile('user2')

            // Add profiles to cache
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile1)
            profileUpdateCallback(profile2)

            expect(syncManager.getCachedProfiles()).toHaveLength(2)

            const removed = syncManager.removeFromCache('user1')
            expect(removed).toBe(true)
            expect(syncManager.getCachedProfiles()).toHaveLength(1)
            expect(syncManager.getCachedProfiles()[0].id).toBe('user2')
        })
    })

    describe('Profile Filtering and Criteria Matching', () => {
        test('should filter cached profiles by age range', () => {
            const profile1 = createMockProfile('user1')
            profile1.setAge(25)
            const profile2 = createMockProfile('user2')
            profile2.setAge(35)
            const profile3 = createMockProfile('user3')
            profile3.setAge(45)

            // Add profiles to cache
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile1)
            profileUpdateCallback(profile2)
            profileUpdateCallback(profile3)

            const criteria: Partial<DiscoveryCriteria> = {
                ageRange: [30, 40]
            }

            const filteredProfiles = syncManager.getCachedProfiles(criteria)
            expect(filteredProfiles).toHaveLength(1)
            expect(filteredProfiles[0].age).toBe(35)
        })

        test('should filter cached profiles by interests', () => {
            const profile1 = createMockProfile('user1', 1, ['music', 'travel'])
            const profile2 = createMockProfile('user2', 1, ['sports', 'cooking'])
            const profile3 = createMockProfile('user3', 1, ['music', 'art'])

            // Add profiles to cache
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile1)
            profileUpdateCallback(profile2)
            profileUpdateCallback(profile3)

            const criteria: Partial<DiscoveryCriteria> = {
                interests: ['music']
            }

            const filteredProfiles = syncManager.getCachedProfiles(criteria)
            expect(filteredProfiles).toHaveLength(2)
            expect(filteredProfiles.map(p => p.id).sort()).toEqual(['user1', 'user3'])
        })

        test('should return all profiles when no criteria provided', () => {
            const profile1 = createMockProfile('user1')
            const profile2 = createMockProfile('user2')

            // Add profiles to cache
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile1)
            profileUpdateCallback(profile2)

            const allProfiles = syncManager.getCachedProfiles()
            expect(allProfiles).toHaveLength(2)
        })
    })

    describe('Manual Profile Synchronization', () => {
        test('should sync profiles with criteria', async () => {
            const mockProfiles = [
                createMockProfile('user1'),
                createMockProfile('user2')
            ]

            mockP2P.syncProfilesWithCriteria.mockResolvedValue(mockProfiles)

            const criteria: DiscoveryCriteria = {
                geohash: 'dr5ru',
                ageRange: [25, 35],
                interests: ['music'],
                maxDistance: 10
            }

            const syncedProfiles = await syncManager.syncProfiles(criteria)

            expect(mockP2P.syncProfilesWithCriteria).toHaveBeenCalledWith(criteria)
            expect(syncedProfiles).toHaveLength(2)
            expect(syncManager.getCachedProfiles()).toHaveLength(2)
        })

        test('should handle sync failure gracefully', async () => {
            mockP2P.syncProfilesWithCriteria.mockRejectedValue(new Error('Sync failed'))

            const criteria: DiscoveryCriteria = {
                geohash: 'dr5ru',
                ageRange: [25, 35],
                interests: ['music'],
                maxDistance: 10
            }

            const syncedProfiles = await syncManager.syncProfiles(criteria)

            expect(syncedProfiles).toHaveLength(0)
            expect(syncManager.getCachedProfiles()).toHaveLength(0)
        })
    })

    describe('Profile Request and Replication', () => {
        test('should request profile from peer', async () => {
            const mockProfile = createMockProfile('user1')
            mockP2P.requestProfile.mockResolvedValue(mockProfile)

            const profile = await syncManager.requestProfile('peer1', 'user1')

            expect(mockP2P.requestProfile).toHaveBeenCalledWith('peer1', 'user1')
            expect(profile).toBe(mockProfile)
            expect(syncManager.getCachedProfiles()).toHaveLength(1)
        })

        test('should return cached profile if fresh', async () => {
            const mockProfile = createMockProfile('user1')

            // Add profile to cache first
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(mockProfile)

            // Request the same profile
            const profile = await syncManager.requestProfile('peer1', 'user1')

            // Should not call P2P manager since profile is cached and fresh
            expect(mockP2P.requestProfile).not.toHaveBeenCalled()
            expect(profile?.id).toBe('user1')
        })

        test('should handle profile request failure', async () => {
            mockP2P.requestProfile.mockRejectedValue(new Error('Request failed'))

            const profile = await syncManager.requestProfile('peer1', 'user1')

            expect(profile).toBeNull()
        })
    })

    describe('Profile Broadcasting', () => {
        test('should broadcast profile to network', async () => {
            const profile = createMockProfile('user1')

            await syncManager.broadcastProfile(profile)

            expect(mockP2P.broadcastProfile).toHaveBeenCalledWith(profile)
            expect(syncManager.getCachedProfiles()).toHaveLength(1)
        })

        test('should handle broadcast failure', async () => {
            const profile = createMockProfile('user1')
            mockP2P.broadcastProfile.mockRejectedValue(new Error('Broadcast failed'))

            await expect(syncManager.broadcastProfile(profile)).rejects.toThrow('Broadcast failed')
        })
    })

    describe('Subscription and Event Handling', () => {
        test('should notify subscribers of profile updates', () => {
            const mockCallback = jest.fn()
            const unsubscribe = syncManager.onProfileSync(mockCallback)

            const profile = createMockProfile('user1')

            // Simulate profile update
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile)

            expect(mockCallback).toHaveBeenCalledWith([profile])

            // Test unsubscribe
            unsubscribe()

            const profile2 = createMockProfile('user2')
            profileUpdateCallback(profile2)

            // Should not be called again after unsubscribe
            expect(mockCallback).toHaveBeenCalledTimes(1)
        })

        test('should handle subscriber callback errors gracefully', () => {
            const mockCallback = jest.fn(() => {
                throw new Error('Callback error')
            })

            syncManager.onProfileSync(mockCallback)

            const profile = createMockProfile('user1')

            // Should not throw even if callback throws
            expect(() => {
                const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
                profileUpdateCallback(profile)
            }).not.toThrow()

            expect(mockCallback).toHaveBeenCalled()
        })
    })

    describe('Sync Statistics', () => {
        test('should provide accurate sync statistics', () => {
            const profile1 = createMockProfile('user1')
            const profile2 = createMockProfile('user2')

            // Add profiles to cache
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile1)
            profileUpdateCallback(profile2)

            const stats = syncManager.getSyncStats()

            expect(stats.cachedProfiles).toBe(2)
            expect(stats.totalSyncs).toBe(2)
            expect(stats.lastSyncTime).toBeInstanceOf(Date)
        })

        test('should return zero stats for empty cache', () => {
            const stats = syncManager.getSyncStats()

            expect(stats.cachedProfiles).toBe(0)
            expect(stats.totalSyncs).toBe(0)
            expect(stats.lastSyncTime).toBeNull()
        })
    })

    describe('Automatic Sync Management', () => {
        test('should start and stop automatic sync', () => {
            // Mock timer functions
            jest.useFakeTimers()

            syncManager.startSync()

            // Fast-forward time to trigger sync
            jest.advanceTimersByTime(1000)

            // Should attempt to sync with connected peers
            expect(mockP2P.getConnectedPeers).toHaveBeenCalled()

            syncManager.stopSync()

            // Clear timers and restore
            jest.clearAllTimers()
            jest.useRealTimers()
        })

        test('should not start sync if already started', () => {
            jest.useFakeTimers()

            syncManager.startSync()
            syncManager.startSync() // Second call should be ignored

            // Should only set up one interval
            expect(jest.getTimerCount()).toBe(1)

            syncManager.stopSync()
            jest.useRealTimers()
        })

        test('should handle periodic sync when not connected', () => {
            jest.useFakeTimers()
            mockP2P.isConnected.mockReturnValue(false)

            syncManager.startSync()

            // Fast-forward time
            jest.advanceTimersByTime(1000)

            // Should not attempt to get connected peers when not connected
            expect(mockP2P.getConnectedPeers).not.toHaveBeenCalled()

            syncManager.stopSync()
            jest.useRealTimers()
        })
    })

    describe('Cleanup and Destruction', () => {
        test('should clean up resources on destroy', () => {
            const profile = createMockProfile('user1')

            // Add some data
            const profileUpdateCallback = mockP2P.subscribeToProfiles.mock.calls[0][0]
            profileUpdateCallback(profile)

            syncManager.startSync()

            expect(syncManager.getCachedProfiles()).toHaveLength(1)

            syncManager.destroy()

            // Cache should be cleared
            expect(syncManager.getCachedProfiles()).toHaveLength(0)
        })
    })
})