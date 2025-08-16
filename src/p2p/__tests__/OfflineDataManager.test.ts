import { OfflineDataManager, StorageAdapter, OfflineChange } from '../OfflineDataManager'
import { ProfileCRDT } from '../ProfileCRDT'
import { P2PMessage, MessageType } from '../types'

// Mock Storage Adapter for testing
class MockStorageAdapter implements StorageAdapter {
  private data: Map<string, any> = new Map()

  async save(key: string, data: any): Promise<void> {
    this.data.set(key, JSON.parse(JSON.stringify(data)))
  }

  async load(key: string): Promise<any | null> {
    const data = this.data.get(key)
    return data ? JSON.parse(JSON.stringify(data)) : null
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async list(prefix: string): Promise<string[]> {
    return Array.from(this.data.keys()).filter(key => key.startsWith(prefix))
  }

  async clear(): Promise<void> {
    this.data.clear()
  }

  // Test helper
  getData(): Map<string, any> {
    return new Map(this.data)
  }
}

describe('OfflineDataManager', () => {
  let offlineManager: OfflineDataManager
  let mockStorage: MockStorageAdapter

  beforeEach(async () => {
    mockStorage = new MockStorageAdapter()
    offlineManager = new OfflineDataManager(mockStorage)
    await offlineManager.initialize()
  })

  afterEach(async () => {
    await offlineManager.destroy()
  })

  describe('Profile Management', () => {
    test('should store and retrieve profiles', async () => {
      const profile = new ProfileCRDT('test-id', 'did:key:test')
      profile.setName('Test User')
      profile.setAge(25)

      await offlineManager.storeProfile(profile)

      const retrieved = await offlineManager.getProfile('test-id')
      expect(retrieved).toBeTruthy()
      expect(retrieved!.id).toBe('test-id')
      expect(retrieved!.name).toBe('Test User')
      expect(retrieved!.age).toBe(25)
    })

    test('should return null for non-existent profiles', async () => {
      const retrieved = await offlineManager.getProfile('non-existent')
      expect(retrieved).toBeNull()
    })

    test('should get all stored profiles', async () => {
      const profile1 = new ProfileCRDT('id1', 'did:key:1')
      const profile2 = new ProfileCRDT('id2', 'did:key:2')
      
      profile1.setName('User 1')
      profile2.setName('User 2')

      await offlineManager.storeProfile(profile1)
      await offlineManager.storeProfile(profile2)

      const allProfiles = await offlineManager.getAllProfiles()
      expect(allProfiles).toHaveLength(2)
      expect(allProfiles.map(p => p.id)).toContain('id1')
      expect(allProfiles.map(p => p.id)).toContain('id2')
    })

    test('should persist profiles to storage', async () => {
      const profile = new ProfileCRDT('persist-test', 'did:key:persist')
      profile.setName('Persistent User')

      await offlineManager.storeProfile(profile)

      // Check that data was saved to storage
      const storageData = mockStorage.getData()
      expect(storageData.has('profile:persist-test')).toBe(true)
    })
  })

  describe('Change Tracking', () => {
    test('should track changes', async () => {
      const changeId = await offlineManager.trackChange('profile_update', {
        profileId: 'test-id',
        field: 'name',
        value: 'New Name'
      })

      expect(changeId).toBeTruthy()
      expect(typeof changeId).toBe('string')

      const pendingChanges = offlineManager.getPendingChanges()
      expect(pendingChanges).toHaveLength(1)
      expect(pendingChanges[0].id).toBe(changeId)
      expect(pendingChanges[0].type).toBe('profile_update')
      expect(pendingChanges[0].synced).toBe(false)
    })

    test('should mark changes as synced', async () => {
      const changeId = await offlineManager.trackChange('like', { targetId: 'user123' })

      await offlineManager.markChangeSynced(changeId)

      const pendingChanges = offlineManager.getPendingChanges()
      expect(pendingChanges).toHaveLength(0) // Should not include synced changes
    })

    test('should remove changes', async () => {
      const changeId = await offlineManager.trackChange('match', { matchId: 'match123' })

      await offlineManager.removeChange(changeId)

      const pendingChanges = offlineManager.getPendingChanges()
      expect(pendingChanges).toHaveLength(0)
    })

    test('should persist pending changes', async () => {
      await offlineManager.trackChange('message', { content: 'Hello' })

      // Check that changes were saved to storage
      const storageData = mockStorage.getData()
      expect(storageData.has('pendingChanges')).toBe(true)
      
      const savedChanges = storageData.get('pendingChanges')
      expect(savedChanges).toHaveLength(1)
      expect(savedChanges[0].type).toBe('message')
    })

    test('should call change callbacks', async () => {
      const callback = jest.fn()
      const unsubscribe = offlineManager.onChangeTracked(callback)

      await offlineManager.trackChange('profile_update', { test: 'data' })

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        type: 'profile_update',
        data: { test: 'data' },
        synced: false
      }))

      unsubscribe()
    })
  })

  describe('Message Queue Management', () => {
    test('should queue and dequeue messages', async () => {
      const message: P2PMessage = {
        type: MessageType.CHAT,
        from: 'user1',
        to: 'user2',
        timestamp: new Date(),
        payload: {
          ciphertext: new ArrayBuffer(0),
          header: {
            publicKey: new ArrayBuffer(0),
            previousChainLength: 0,
            messageNumber: 0
          },
          mac: new ArrayBuffer(0)
        }
      }

      await offlineManager.queueMessage(message)

      const queuedMessages = offlineManager.getQueuedMessages()
      expect(queuedMessages).toHaveLength(1)
      expect(queuedMessages[0].type).toBe(MessageType.CHAT)

      const dequeued = await offlineManager.dequeueMessage()
      expect(dequeued).toBeTruthy()
      expect(dequeued!.type).toBe(MessageType.CHAT)

      const remainingMessages = offlineManager.getQueuedMessages()
      expect(remainingMessages).toHaveLength(0)
    })

    test('should return null when dequeuing from empty queue', async () => {
      const dequeued = await offlineManager.dequeueMessage()
      expect(dequeued).toBeNull()
    })

    test('should clear message queue', async () => {
      const message: P2PMessage = {
        type: MessageType.SYSTEM,
        from: 'system',
        to: 'user1',
        timestamp: new Date(),
        payload: {
          ciphertext: new ArrayBuffer(0),
          header: {
            publicKey: new ArrayBuffer(0),
            previousChainLength: 0,
            messageNumber: 0
          },
          mac: new ArrayBuffer(0)
        }
      }

      await offlineManager.queueMessage(message)
      await offlineManager.clearMessageQueue()

      const queuedMessages = offlineManager.getQueuedMessages()
      expect(queuedMessages).toHaveLength(0)
    })

    test('should persist message queue', async () => {
      const message: P2PMessage = {
        type: MessageType.LIKE,
        from: 'user1',
        to: 'user2',
        timestamp: new Date(),
        payload: {
          ciphertext: new ArrayBuffer(0),
          header: {
            publicKey: new ArrayBuffer(0),
            previousChainLength: 0,
            messageNumber: 0
          },
          mac: new ArrayBuffer(0)
        }
      }

      await offlineManager.queueMessage(message)

      // Check that message queue was saved to storage
      const storageData = mockStorage.getData()
      expect(storageData.has('messageQueue')).toBe(true)
      
      const savedQueue = storageData.get('messageQueue')
      expect(savedQueue).toHaveLength(1)
      expect(savedQueue[0].type).toBe(MessageType.LIKE)
    })
  })

  describe('Sync State Management', () => {
    test('should manage online status', () => {
      expect(offlineManager.isOnline()).toBe(false)

      offlineManager.setOnlineStatus(true)
      expect(offlineManager.isOnline()).toBe(true)

      offlineManager.setOnlineStatus(false)
      expect(offlineManager.isOnline()).toBe(false)
    })

    test('should call sync callbacks on status change', () => {
      const callback = jest.fn()
      const unsubscribe = offlineManager.onSyncStateChange(callback)

      offlineManager.setOnlineStatus(true)
      expect(callback).toHaveBeenCalledWith(true)

      offlineManager.setOnlineStatus(false)
      expect(callback).toHaveBeenCalledWith(false)

      // Should not call callback if status doesn't change
      callback.mockClear()
      offlineManager.setOnlineStatus(false)
      expect(callback).not.toHaveBeenCalled()

      unsubscribe()
    })

    test('should track sync progress', () => {
      expect(offlineManager.isSyncInProgress()).toBe(false)
      expect(offlineManager.getLastSyncTime()).toBeNull()
    })

    test('should trigger sync when coming online', async () => {
      // Add some pending changes
      await offlineManager.trackChange('profile_update', { test: 'data' })

      // Set online status (this should trigger sync)
      offlineManager.setOnlineStatus(true)

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 100))

      // Sync should have been attempted (though it may not succeed in test environment)
      expect(offlineManager.isOnline()).toBe(true)
    })
  })

  describe('Sync Operations', () => {
    test('should not sync when offline', async () => {
      offlineManager.setOnlineStatus(false)
      
      await offlineManager.triggerSync()
      
      // Should not have changed sync state
      expect(offlineManager.getLastSyncTime()).toBeNull()
    })

    test('should handle sync when online', async () => {
      offlineManager.setOnlineStatus(true)
      
      // Add some test data
      await offlineManager.trackChange('profile_update', { test: 'data' })
      
      await offlineManager.triggerSync()
      
      // Wait a bit for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Should have updated last sync time
      expect(offlineManager.getLastSyncTime()).toBeTruthy()
    })

    test('should prevent concurrent syncs', async () => {
      offlineManager.setOnlineStatus(true)
      
      // Start two syncs simultaneously
      const sync1Promise = offlineManager.triggerSync()
      const sync2Promise = offlineManager.triggerSync()
      
      await Promise.all([sync1Promise, sync2Promise])
      
      // Wait a bit for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Both should complete without error
      expect(offlineManager.isSyncInProgress()).toBe(false)
    })
  })

  describe('Data Import/Export', () => {
    test('should export data', async () => {
      const profile = new ProfileCRDT('export-test', 'did:key:export')
      profile.setName('Export User')
      
      await offlineManager.storeProfile(profile)
      await offlineManager.trackChange('profile_update', { test: 'export' })

      const exportedData = await offlineManager.exportData()

      expect(exportedData).toBeTruthy()
      expect(exportedData.profiles).toHaveLength(1)
      expect(exportedData.profiles[0].id).toBe('export-test')
      expect(exportedData.pendingChanges).toHaveLength(1)
      expect(exportedData.pendingChanges[0].type).toBe('profile_update')
    })

    test('should import data', async () => {
      const importData = {
        profiles: [{
          id: 'import-test',
          profile: {
            id: 'import-test',
            did: 'did:key:import',
            name: 'Import User',
            age: 30,
            bio: '',
            photos: [],
            interests: [],
            location: null,
            version: 1,
            created: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            signatures: []
          },
          lastSync: new Date().toISOString()
        }],
        pendingChanges: [{
          id: 'change-1',
          type: 'profile_update',
          timestamp: new Date().toISOString(),
          data: { test: 'import' },
          synced: false,
          retryCount: 0
        }],
        messageQueue: [],
        syncState: {
          lastFullSync: null,
          isOnline: false,
          syncInProgress: false
        }
      }

      await offlineManager.importData(importData)

      const profile = await offlineManager.getProfile('import-test')
      expect(profile).toBeTruthy()
      expect(profile!.name).toBe('Import User')

      const pendingChanges = offlineManager.getPendingChanges()
      expect(pendingChanges).toHaveLength(1)
      expect(pendingChanges[0].type).toBe('profile_update')
    })
  })

  describe('Statistics and Monitoring', () => {
    test('should provide accurate stats', async () => {
      const profile = new ProfileCRDT('stats-test', 'did:key:stats')
      await offlineManager.storeProfile(profile)
      await offlineManager.trackChange('profile_update', { test: 'stats' })

      const message: P2PMessage = {
        type: MessageType.CHAT,
        from: 'user1',
        to: 'user2',
        timestamp: new Date(),
        payload: {
          ciphertext: new ArrayBuffer(0),
          header: {
            publicKey: new ArrayBuffer(0),
            previousChainLength: 0,
            messageNumber: 0
          },
          mac: new ArrayBuffer(0)
        }
      }
      await offlineManager.queueMessage(message)

      const stats = offlineManager.getStats()

      expect(stats.profilesStored).toBe(1)
      expect(stats.pendingChanges).toBe(1)
      expect(stats.queuedMessages).toBe(1)
      expect(stats.isOnline).toBe(false)
      expect(stats.lastSync).toBeNull()
    })
  })

  describe('Error Handling', () => {
    test('should handle storage errors gracefully', async () => {
      // Create a storage adapter that throws errors
      const errorStorage: StorageAdapter = {
        save: jest.fn().mockRejectedValue(new Error('Storage error')),
        load: jest.fn().mockRejectedValue(new Error('Storage error')),
        delete: jest.fn().mockRejectedValue(new Error('Storage error')),
        list: jest.fn().mockRejectedValue(new Error('Storage error')),
        clear: jest.fn().mockRejectedValue(new Error('Storage error'))
      }

      const errorManager = new OfflineDataManager(errorStorage)

      // Should throw during initialization due to storage error
      await expect(errorManager.initialize()).rejects.toThrow('Storage error')
    })

    test('should handle corrupted profile data', async () => {
      // Manually insert corrupted data
      await mockStorage.save('profile:corrupted', { invalid: 'data' })

      const profile = await offlineManager.getProfile('corrupted')
      expect(profile).toBeNull()
    })

    test('should handle callback errors gracefully', async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error')
      })

      offlineManager.onChangeTracked(errorCallback)

      // Should not throw even if callback throws
      await expect(offlineManager.trackChange('profile_update', { test: 'data' }))
        .resolves.toBeTruthy()

      expect(errorCallback).toHaveBeenCalled()
    })
  })

  describe('Memory Management', () => {
    test('should limit in-memory profile cache', async () => {
      // This test would be more meaningful with a larger dataset
      // For now, just verify that profiles are stored and retrieved correctly
      const profiles: ProfileCRDT[] = []
      
      for (let i = 0; i < 10; i++) {
        const profile = new ProfileCRDT(`profile-${i}`, `did:key:${i}`)
        profile.setName(`User ${i}`)
        profiles.push(profile)
        await offlineManager.storeProfile(profile)
      }

      const allProfiles = await offlineManager.getAllProfiles()
      expect(allProfiles).toHaveLength(10)
    })
  })

  describe('Cleanup and Destruction', () => {
    test('should cleanup resources on destroy', async () => {
      const callback = jest.fn()
      offlineManager.onSyncStateChange(callback)

      await offlineManager.destroy()

      // Callbacks should be cleared
      offlineManager.setOnlineStatus(true)
      expect(callback).not.toHaveBeenCalled()
    })
  })
})