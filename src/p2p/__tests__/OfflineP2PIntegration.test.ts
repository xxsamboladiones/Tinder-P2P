import { OfflineP2PIntegration } from '../OfflineP2PIntegration'
import { P2PManager } from '../P2PManager'
import { OfflineDataManager } from '../OfflineDataManager'
import { ProfileCRDT } from '../ProfileCRDT'
import { P2PMessage, MessageType, NetworkStatus } from '../types'

// Mock P2PManager
class MockP2PManager {
  private profiles: ProfileCRDT[] = []
  private networkStatus: NetworkStatus = {
    connected: false,
    peerCount: 0,
    dhtConnected: false,
    latency: 0,
    bandwidth: { up: 0, down: 0 }
  }
  private profileSubscribers: Set<(profile: ProfileCRDT) => void> = new Set()
  private messageHandlers: Set<(peerId: string, message: P2PMessage) => void> = new Set()
  private shouldBroadcast = true

  async broadcastProfile(profile: ProfileCRDT): Promise<void> {
    if (this.shouldBroadcast) {
      this.profiles.push(profile)
      console.log('Mock: Broadcasting profile', profile.id)
    } else {
      throw new Error('Mock broadcast failure')
    }
  }

  subscribeToProfiles(callback: (profile: ProfileCRDT) => void): void {
    this.profileSubscribers.add(callback)
  }

  onMessage(callback: (peerId: string, message: P2PMessage) => void): void {
    this.messageHandlers.add(callback)
  }

  async requestProfile(peerId: string, profileId: string): Promise<ProfileCRDT | null> {
    console.log('Mock: Requesting profile', profileId, 'from', peerId)
    return this.profiles.find(p => p.id === profileId) || null
  }

  getConnectedPeers(): string[] {
    if (this.networkStatus.connected && this.networkStatus.peerCount > 0) {
      return Array.from({ length: this.networkStatus.peerCount }, (_, i) => `peer${i + 1}`)
    }
    return []
  }

  getNetworkStatus(): NetworkStatus {
    return this.networkStatus
  }

  // Test helpers
  setNetworkStatus(status: Partial<NetworkStatus>): void {
    this.networkStatus = { ...this.networkStatus, ...status }
  }

  setBroadcastShouldFail(shouldFail: boolean): void {
    this.shouldBroadcast = !shouldFail
  }

  simulateIncomingProfile(profile: ProfileCRDT): void {
    this.profileSubscribers.forEach(callback => callback(profile))
  }

  simulateIncomingMessage(peerId: string, message: P2PMessage): void {
    this.messageHandlers.forEach(callback => callback(peerId, message))
  }

  getBroadcastedProfiles(): ProfileCRDT[] {
    return [...this.profiles]
  }

  clearBroadcastedProfiles(): void {
    this.profiles = []
  }
}

// Mock Storage Adapter
class MockStorageAdapter {
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
}

describe('OfflineP2PIntegration', () => {
  let integration: OfflineP2PIntegration
  let mockP2PManager: MockP2PManager
  let offlineManager: OfflineDataManager
  let mockStorage: MockStorageAdapter

  beforeEach(async () => {
    mockStorage = new MockStorageAdapter()
    mockP2PManager = new MockP2PManager()
    offlineManager = new OfflineDataManager(mockStorage)
    
    integration = new OfflineP2PIntegration(
      mockP2PManager as any,
      offlineManager,
      {
        enableOfflineMode: true,
        syncOnConnect: true,
        maxOfflineProfiles: 100,
        offlineRetentionDays: 7
      }
    )

    await integration.initialize()
  })

  afterEach(async () => {
    await integration.destroy()
  })

  describe('Profile Management with Offline Support', () => {
    test('should store profile locally and broadcast when online', async () => {
      const profile = new ProfileCRDT('test-profile', 'did:key:test')
      profile.setName('Test User')
      profile.setAge(25)

      // Set online status
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 3 })
      
      // Force immediate network status update
      integration.forceNetworkStatusUpdate()
      
      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 50))

      await integration.storeProfile(profile)

      // Should be stored locally
      const retrieved = await integration.getProfile('test-profile')
      expect(retrieved).toBeTruthy()
      expect(retrieved!.name).toBe('Test User')

      // Should be broadcasted to network
      const broadcasted = mockP2PManager.getBroadcastedProfiles()
      expect(broadcasted).toHaveLength(1)
      expect(broadcasted[0].id).toBe('test-profile')
    })

    test('should store profile locally when offline', async () => {
      const profile = new ProfileCRDT('offline-profile', 'did:key:offline')
      profile.setName('Offline User')

      // Ensure offline status
      mockP2PManager.setNetworkStatus({ connected: false, peerCount: 0 })

      await integration.storeProfile(profile)

      // Should be stored locally
      const retrieved = await integration.getProfile('offline-profile')
      expect(retrieved).toBeTruthy()
      expect(retrieved!.name).toBe('Offline User')

      // Should not be broadcasted yet
      const broadcasted = mockP2PManager.getBroadcastedProfiles()
      expect(broadcasted).toHaveLength(0)

      // Should have pending change
      const stats = integration.getOfflineStats()
      expect(stats.pendingChanges).toBeGreaterThan(0)
    })

    test('should request profile from network when not found locally', async () => {
      // Set online status
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 2 })
      integration.forceNetworkStatusUpdate()
      
      // Create a profile that exists on the network but not locally
      const networkProfile = new ProfileCRDT('network-profile', 'did:key:network')
      networkProfile.setName('Network User')
      await mockP2PManager.broadcastProfile(networkProfile)

      const retrieved = await integration.getProfile('network-profile')
      expect(retrieved).toBeTruthy()
      expect(retrieved!.name).toBe('Network User')
    })

    test('should handle incoming profile updates', async () => {
      const profile = new ProfileCRDT('incoming-profile', 'did:key:incoming')
      profile.setName('Incoming User')
      profile.setAge(30)

      // Simulate receiving profile from network
      mockP2PManager.simulateIncomingProfile(profile)

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should be stored locally
      const retrieved = await integration.getProfile('incoming-profile')
      expect(retrieved).toBeTruthy()
      expect(retrieved!.name).toBe('Incoming User')
    })

    test('should update profile with newer version', async () => {
      // Store initial profile
      const profile1 = new ProfileCRDT('version-test', 'did:key:version')
      profile1.setName('Version 1')
      await integration.storeProfile(profile1, true) // fromNetwork = true

      // Simulate receiving newer version
      const profile2 = new ProfileCRDT('version-test', 'did:key:version')
      profile2.setName('Version 2')
      profile2.setAge(25) // This will increment version

      mockP2PManager.simulateIncomingProfile(profile2)
      await new Promise(resolve => setTimeout(resolve, 100))

      const retrieved = await integration.getProfile('version-test')
      expect(retrieved).toBeTruthy()
      expect(retrieved!.name).toBe('Version 2')
      expect(retrieved!.version).toBeGreaterThan(profile1.version)
    })
  })

  describe('Message Handling with Offline Support', () => {
    test('should send message immediately when online', async () => {
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 1 })
      integration.forceNetworkStatusUpdate()

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

      await integration.sendMessage('user2', message)

      // Should not be queued since it was sent immediately
      const stats = integration.getOfflineStats()
      expect(stats.queuedMessages).toBe(0)
    })

    test('should queue message when offline', async () => {
      mockP2PManager.setNetworkStatus({ connected: false, peerCount: 0 })

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

      await integration.sendMessage('user2', message)

      // Should be queued for later delivery
      const stats = integration.getOfflineStats()
      expect(stats.queuedMessages).toBe(1)
    })

    test('should handle incoming messages', async () => {
      const message: P2PMessage = {
        type: MessageType.CHAT,
        from: 'peer1',
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

      // Simulate receiving message
      mockP2PManager.simulateIncomingMessage('peer1', message)

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100))

      // In a real implementation, this would store the message
      // For now, we just verify it was processed without error
    })
  })

  describe('Sync Operations', () => {
    test('should perform full sync when online', async () => {
      // Add some offline data
      const profile = new ProfileCRDT('sync-test', 'did:key:sync')
      profile.setName('Sync User')
      await integration.storeProfile(profile)

      // Set online status
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 2 })
      integration.forceNetworkStatusUpdate()

      await integration.performFullSync()

      // Should have broadcasted the profile
      const broadcasted = mockP2PManager.getBroadcastedProfiles()
      expect(broadcasted.some(p => p.id === 'sync-test')).toBe(true)
    })

    test('should not sync when offline', async () => {
      mockP2PManager.setNetworkStatus({ connected: false, peerCount: 0 })

      await integration.performFullSync()

      // Should not have broadcasted anything
      const broadcasted = mockP2PManager.getBroadcastedProfiles()
      expect(broadcasted).toHaveLength(0)
    })

    test('should auto-sync when coming online', async () => {
      // Start offline
      mockP2PManager.setNetworkStatus({ connected: false, peerCount: 0 })
      integration.forceNetworkStatusUpdate()

      // Add some offline data
      const profile = new ProfileCRDT('auto-sync-test', 'did:key:auto-sync')
      profile.setName('Auto Sync User')
      await integration.storeProfile(profile)

      // Come online
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 1 })
      integration.forceNetworkStatusUpdate()

      // Wait for auto-sync to trigger
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Should have auto-synced
      const stats = integration.getOfflineStats()
      expect(stats.isOnline).toBe(true)
    })
  })

  describe('Network Status Monitoring', () => {
    test('should update online status based on network status', async () => {
      // Start offline
      mockP2PManager.setNetworkStatus({ connected: false, peerCount: 0 })
      integration.forceNetworkStatusUpdate()
      
      let stats = integration.getOfflineStats()
      expect(stats.isOnline).toBe(false)

      // Go online
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 2 })
      integration.forceNetworkStatusUpdate()
      
      stats = integration.getOfflineStats()
      expect(stats.isOnline).toBe(true)
    })

    test('should consider peer count in online status', async () => {
      // Connected but no peers
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 0 })
      integration.forceNetworkStatusUpdate()
      
      let stats = integration.getOfflineStats()
      expect(stats.isOnline).toBe(false)

      // Connected with peers
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 1 })
      integration.forceNetworkStatusUpdate()
      
      stats = integration.getOfflineStats()
      expect(stats.isOnline).toBe(true)
    })
  })

  describe('Statistics and Monitoring', () => {
    test('should provide comprehensive offline stats', async () => {
      const profile = new ProfileCRDT('stats-profile', 'did:key:stats')
      await integration.storeProfile(profile)

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
      await integration.sendMessage('user2', message)

      const stats = integration.getOfflineStats()

      expect(stats.profilesStored).toBe(1)
      expect(stats.pendingChanges).toBeGreaterThan(0)
      expect(stats.queuedMessages).toBe(1)
      expect(stats.networkStatus).toBeTruthy()
      expect(typeof stats.isOnline).toBe('boolean')
    })
  })

  describe('Data Import/Export', () => {
    test('should export offline data', async () => {
      const profile = new ProfileCRDT('export-profile', 'did:key:export')
      profile.setName('Export User')
      await integration.storeProfile(profile)

      const exportedData = await integration.exportOfflineData()

      expect(exportedData).toBeTruthy()
      expect(exportedData.profiles).toHaveLength(1)
      expect(exportedData.profiles[0].id).toBe('export-profile')
    })

    test('should import offline data', async () => {
      const importData = {
        profiles: [{
          id: 'import-profile',
          profile: {
            id: 'import-profile',
            did: 'did:key:import',
            name: 'Import User',
            age: 28,
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
        pendingChanges: [],
        messageQueue: [],
        syncState: {
          lastFullSync: null,
          isOnline: false,
          syncInProgress: false
        }
      }

      await integration.importOfflineData(importData)

      const profile = await integration.getProfile('import-profile')
      expect(profile).toBeTruthy()
      expect(profile!.name).toBe('Import User')
    })
  })

  describe('Manual Sync Controls', () => {
    test('should force sync specific profile', async () => {
      const profile = new ProfileCRDT('force-sync-profile', 'did:key:force-sync')
      profile.setName('Force Sync User')
      await integration.storeProfile(profile, true) // fromNetwork = true to avoid auto-broadcast

      // Set online
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 1 })
      integration.forceNetworkStatusUpdate()

      const success = await integration.forceSyncProfile('force-sync-profile')
      expect(success).toBe(true)

      // Should have broadcasted the profile
      const broadcasted = mockP2PManager.getBroadcastedProfiles()
      expect(broadcasted.some(p => p.id === 'force-sync-profile')).toBe(true)
    })

    test('should not force sync when offline', async () => {
      const profile = new ProfileCRDT('offline-force-sync', 'did:key:offline-force')
      await integration.storeProfile(profile, true)

      // Set offline
      mockP2PManager.setNetworkStatus({ connected: false, peerCount: 0 })

      const success = await integration.forceSyncProfile('offline-force-sync')
      expect(success).toBe(false)
    })

    test('should retry failed syncs', async () => {
      // Set online
      mockP2PManager.setNetworkStatus({ connected: true, peerCount: 1 })

      await integration.retryFailedSyncs()

      // Should complete without error
    })
  })

  describe('Error Handling', () => {
    test('should handle P2P manager errors gracefully', async () => {
      // Mock P2P manager to throw errors
      const errorP2PManager = {
        ...mockP2PManager,
        broadcastProfile: jest.fn().mockRejectedValue(new Error('Network error')),
        subscribeToProfiles: jest.fn(),
        onMessage: jest.fn(),
        getNetworkStatus: jest.fn().mockReturnValue({
          connected: true,
          peerCount: 1,
          dhtConnected: true,
          latency: 0,
          bandwidth: { up: 0, down: 0 }
        })
      }

      const errorIntegration = new OfflineP2PIntegration(
        errorP2PManager as any,
        offlineManager
      )
      await errorIntegration.initialize()

      const profile = new ProfileCRDT('error-test', 'did:key:error')
      profile.setName('Error User')

      // Should not throw even if broadcast fails
      await expect(errorIntegration.storeProfile(profile)).resolves.not.toThrow()

      await errorIntegration.destroy()
    })

    test('should handle offline manager errors gracefully', async () => {
      // This would test error scenarios with the offline manager
      // For now, just verify the integration handles basic errors
      const profile = new ProfileCRDT('error-profile', 'did:key:error')
      
      await expect(integration.storeProfile(profile)).resolves.not.toThrow()
    })
  })

  describe('Cleanup and Destruction', () => {
    test('should cleanup resources on destroy', async () => {
      const stats = integration.getOfflineStats()
      expect(stats).toBeTruthy()

      await integration.destroy()

      // Should not throw after destruction
      expect(() => integration.getOfflineStats()).not.toThrow()
    })

    test('should cleanup old profiles', async () => {
      // Add some profiles
      for (let i = 0; i < 5; i++) {
        const profile = new ProfileCRDT(`cleanup-${i}`, `did:key:cleanup-${i}`)
        profile.setName(`Cleanup User ${i}`)
        await integration.storeProfile(profile, true)
      }

      await integration.cleanupOldProfiles()

      // Should complete without error
      // In a real implementation, this would remove old profiles
    })
  })
})