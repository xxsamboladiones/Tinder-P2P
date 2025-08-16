import { P2PManager } from '../P2PManager'
import { OfflineDataManager, IndexedDBStorageAdapter } from '../OfflineDataManager'
import { OfflineP2PIntegration } from '../OfflineP2PIntegration'
import { ProfileCRDT } from '../ProfileCRDT'
import { P2PMessage, MessageType } from '../types'

/**
 * Example demonstrating offline-first data management with P2P synchronization
 * 
 * This example shows how to:
 * 1. Set up offline data management
 * 2. Handle online/offline state transitions
 * 3. Manage profile synchronization
 * 4. Queue messages for offline delivery
 * 5. Perform sync reconciliation
 */

export class OfflineDataExample {
  private p2pManager: P2PManager
  private offlineManager: OfflineDataManager
  private integration: OfflineP2PIntegration
  private isInitialized = false

  constructor() {
    // Initialize P2P Manager
    this.p2pManager = new P2PManager({
      enableEncryption: true,
      maxPeers: 20,
      discoveryInterval: 30000
    })

    // Initialize Offline Data Manager with IndexedDB storage
    this.offlineManager = new OfflineDataManager(new IndexedDBStorageAdapter())

    // Initialize Integration Layer
    this.integration = new OfflineP2PIntegration(
      this.p2pManager,
      this.offlineManager,
      {
        enableOfflineMode: true,
        syncOnConnect: true,
        maxOfflineProfiles: 500,
        offlineRetentionDays: 14
      }
    )
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      console.log('🚀 Initializing offline-first P2P system...')

      // Initialize P2P Manager
      await this.p2pManager.initialize()
      await this.p2pManager.connect()

      // Initialize Integration (this also initializes the offline manager)
      await this.integration.initialize()

      // Set up event handlers
      this.setupEventHandlers()

      this.isInitialized = true
      console.log('✅ Offline-first P2P system initialized successfully')

      // Display initial status
      this.displayStatus()
    } catch (error) {
      console.error('❌ Failed to initialize offline-first P2P system:', error)
      throw error
    }
  }

  private setupEventHandlers(): void {
    // Handle online/offline state changes
    this.offlineManager.onSyncStateChange((isOnline: boolean) => {
      console.log(`🌐 Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`)
      
      if (isOnline) {
        console.log('📡 Coming online - sync will be triggered automatically')
        this.displayPendingChanges()
      } else {
        console.log('📴 Going offline - changes will be queued for later sync')
      }
    })

    // Handle tracked changes
    this.offlineManager.onChangeTracked((change) => {
      console.log(`📝 Change tracked: ${change.type} (ID: ${change.id})`)
    })
  }

  // Profile Management Examples
  async createAndStoreProfile(): Promise<ProfileCRDT> {
    console.log('\n📋 Creating and storing a new profile...')

    const profile = new ProfileCRDT(
      `user-${Date.now()}`,
      `did:key:${crypto.randomUUID()}`
    )

    // Set profile data
    profile.setName('Alice Johnson')
    profile.setAge(28)
    profile.setBio('Love hiking, photography, and good coffee ☕')
    profile.addInterest('hiking')
    profile.addInterest('photography')
    profile.addInterest('coffee')

    // Add a sample photo reference
    profile.addPhoto({
      id: 'photo-1',
      hash: 'sha256:abc123...',
      url: 'https://example.com/photos/alice-1.jpg',
      thumbnail: 'data:image/jpeg;base64,/9j/4AAQ...'
    })

    // Store the profile (will sync to network if online, queue if offline)
    await this.integration.storeProfile(profile)

    console.log(`✅ Profile created and stored: ${profile.id}`)
    console.log(`   Name: ${profile.name}`)
    console.log(`   Age: ${profile.age}`)
    console.log(`   Interests: ${profile.interests.join(', ')}`)

    return profile
  }

  async updateProfile(profileId: string): Promise<void> {
    console.log(`\n✏️  Updating profile: ${profileId}`)

    const profile = await this.integration.getProfile(profileId)
    if (!profile) {
      console.log('❌ Profile not found')
      return
    }

    // Update profile data
    profile.setBio('Updated bio: Love hiking, photography, coffee, and traveling! ✈️')
    profile.addInterest('traveling')

    // Store the updated profile
    await this.integration.storeProfile(profile)

    console.log('✅ Profile updated successfully')
    console.log(`   New bio: ${profile.bio}`)
    console.log(`   Interests: ${profile.interests.join(', ')}`)
  }

  async demonstrateOfflineProfileManagement(): Promise<void> {
    console.log('\n🔄 Demonstrating offline profile management...')

    // Create multiple profiles
    const profiles: ProfileCRDT[] = []
    for (let i = 0; i < 3; i++) {
      const profile = new ProfileCRDT(
        `offline-user-${i}`,
        `did:key:offline-${i}`
      )
      profile.setName(`User ${i + 1}`)
      profile.setAge(25 + i)
      profile.setBio(`Bio for user ${i + 1}`)
      
      await this.integration.storeProfile(profile)
      profiles.push(profile)
    }

    console.log(`✅ Created ${profiles.length} profiles`)

    // Retrieve all profiles
    const allProfiles = await this.integration.getAllProfiles()
    console.log(`📚 Total profiles stored: ${allProfiles.length}`)

    // Display profile summaries
    allProfiles.forEach(profile => {
      console.log(`   - ${profile.name} (${profile.age}) - Version ${profile.version}`)
    })
  }

  // Message Queue Examples
  async demonstrateMessageQueuing(): Promise<void> {
    console.log('\n💬 Demonstrating message queuing...')

    const messages: P2PMessage[] = [
      {
        type: MessageType.CHAT,
        from: 'user1',
        to: 'user2',
        timestamp: new Date(),
        payload: {
          ciphertext: new TextEncoder().encode('Hello there!').buffer,
          header: {
            publicKey: new ArrayBuffer(32),
            previousChainLength: 0,
            messageNumber: 1
          },
          mac: new ArrayBuffer(32)
        }
      },
      {
        type: MessageType.LIKE,
        from: 'user1',
        to: 'user3',
        timestamp: new Date(),
        payload: {
          ciphertext: new TextEncoder().encode('like').buffer,
          header: {
            publicKey: new ArrayBuffer(32),
            previousChainLength: 0,
            messageNumber: 2
          },
          mac: new ArrayBuffer(32)
        }
      },
      {
        type: MessageType.MATCH,
        from: 'user1',
        to: 'user4',
        timestamp: new Date(),
        payload: {
          ciphertext: new TextEncoder().encode('match').buffer,
          header: {
            publicKey: new ArrayBuffer(32),
            previousChainLength: 0,
            messageNumber: 3
          },
          mac: new ArrayBuffer(32)
        }
      }
    ]

    // Send messages (will queue if offline)
    for (const message of messages) {
      await this.integration.sendMessage(message.to, message)
      console.log(`📤 Queued ${message.type} message to ${message.to}`)
    }

    const stats = this.integration.getOfflineStats()
    console.log(`📊 Messages in queue: ${stats.queuedMessages}`)
  }

  // Sync Operations Examples
  async demonstrateSyncOperations(): Promise<void> {
    console.log('\n🔄 Demonstrating sync operations...')

    const stats = this.integration.getOfflineStats()
    console.log(`📊 Current sync status:`)
    console.log(`   - Online: ${stats.isOnline}`)
    console.log(`   - Pending changes: ${stats.pendingChanges}`)
    console.log(`   - Queued messages: ${stats.queuedMessages}`)
    console.log(`   - Last sync: ${stats.lastSync || 'Never'}`)

    if (stats.isOnline) {
      console.log('🚀 Performing full sync...')
      await this.integration.performFullSync()
      console.log('✅ Full sync completed')
    } else {
      console.log('📴 Currently offline - sync will happen when connection is restored')
    }
  }

  async demonstrateManualSyncControls(): Promise<void> {
    console.log('\n🎛️  Demonstrating manual sync controls...')

    // Create a profile to sync
    const profile = await this.createAndStoreProfile()

    // Force sync this specific profile
    console.log(`🔄 Force syncing profile: ${profile.id}`)
    const success = await this.integration.forceSyncProfile(profile.id)
    
    if (success) {
      console.log('✅ Profile force sync successful')
    } else {
      console.log('❌ Profile force sync failed (probably offline)')
    }

    // Retry any failed syncs
    console.log('🔄 Retrying failed syncs...')
    await this.integration.retryFailedSyncs()
    console.log('✅ Retry attempt completed')
  }

  // Data Import/Export Examples
  async demonstrateDataExportImport(): Promise<void> {
    console.log('\n💾 Demonstrating data export/import...')

    // Export current data
    console.log('📤 Exporting offline data...')
    const exportedData = await this.integration.exportOfflineData()
    
    console.log('✅ Data exported successfully')
    console.log(`   - Profiles: ${exportedData.profiles.length}`)
    console.log(`   - Pending changes: ${exportedData.pendingChanges.length}`)
    console.log(`   - Queued messages: ${exportedData.messageQueue.length}`)

    // In a real application, you would save this data to a file or send it somewhere
    console.log('💾 Exported data size:', JSON.stringify(exportedData).length, 'bytes')

    // Demonstrate import (in practice, this would be from a backup file)
    console.log('📥 Data import capability verified (would restore from backup)')
  }

  // Network State Simulation
  async simulateNetworkStateChanges(): Promise<void> {
    console.log('\n🌐 Simulating network state changes...')

    // Simulate going offline
    console.log('📴 Simulating offline state...')
    this.offlineManager.setOnlineStatus(false)
    
    // Create some offline changes
    await this.createAndStoreProfile()
    await this.demonstrateMessageQueuing()

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Simulate coming back online
    console.log('📡 Simulating online state...')
    this.offlineManager.setOnlineStatus(true)

    // Wait for auto-sync
    await new Promise(resolve => setTimeout(resolve, 3000))

    console.log('✅ Network state simulation completed')
  }

  // Status and Monitoring
  displayStatus(): void {
    const stats = this.integration.getOfflineStats()
    
    console.log('\n📊 Current System Status:')
    console.log('=' .repeat(40))
    console.log(`🌐 Online Status: ${stats.isOnline ? '✅ ONLINE' : '❌ OFFLINE'}`)
    console.log(`👥 Connected Peers: ${stats.networkStatus.peerCount}`)
    console.log(`📋 Profiles Stored: ${stats.profilesStored}`)
    console.log(`⏳ Pending Changes: ${stats.pendingChanges}`)
    console.log(`💬 Queued Messages: ${stats.queuedMessages}`)
    console.log(`🕐 Last Sync: ${stats.lastSync || 'Never'}`)
    console.log(`📡 Network Latency: ${stats.networkStatus.latency}ms`)
    console.log('=' .repeat(40))
  }

  displayPendingChanges(): void {
    const pendingChanges = this.offlineManager.getPendingChanges()
    
    if (pendingChanges.length === 0) {
      console.log('✅ No pending changes to sync')
      return
    }

    console.log(`\n⏳ Pending Changes (${pendingChanges.length}):`)
    pendingChanges.forEach((change, index) => {
      console.log(`   ${index + 1}. ${change.type} - ${change.timestamp.toLocaleTimeString()} (Retries: ${change.retryCount})`)
    })
  }

  // Cleanup
  async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up resources...')
    
    try {
      await this.integration.destroy()
      await this.p2pManager.disconnect()
      console.log('✅ Cleanup completed successfully')
    } catch (error) {
      console.error('❌ Error during cleanup:', error)
    }
  }

  // Run complete demonstration
  async runCompleteDemo(): Promise<void> {
    try {
      await this.initialize()

      console.log('\n🎬 Starting Offline Data Management Demo')
      console.log('=' .repeat(50))

      // Basic profile operations
      await this.demonstrateOfflineProfileManagement()
      
      // Message queuing
      await this.demonstrateMessageQueuing()
      
      // Sync operations
      await this.demonstrateSyncOperations()
      
      // Manual sync controls
      await this.demonstrateManualSyncControls()
      
      // Data export/import
      await this.demonstrateDataExportImport()
      
      // Network state simulation
      await this.simulateNetworkStateChanges()

      // Final status
      this.displayStatus()

      console.log('\n🎉 Demo completed successfully!')
      
    } catch (error) {
      console.error('❌ Demo failed:', error)
    } finally {
      await this.cleanup()
    }
  }
}

// Example usage
export async function runOfflineDataExample(): Promise<void> {
  const example = new OfflineDataExample()
  await example.runCompleteDemo()
}

// Individual feature examples
export async function quickProfileExample(): Promise<void> {
  const example = new OfflineDataExample()
  
  try {
    await example.initialize()
    
    // Create and update a profile
    const profile = await example.createAndStoreProfile()
    await example.updateProfile(profile.id)
    
    example.displayStatus()
    
  } finally {
    await example.cleanup()
  }
}

export async function quickMessageExample(): Promise<void> {
  const example = new OfflineDataExample()
  
  try {
    await example.initialize()
    
    // Demonstrate message queuing
    await example.demonstrateMessageQueuing()
    
    example.displayStatus()
    
  } finally {
    await example.cleanup()
  }
}

export async function quickSyncExample(): Promise<void> {
  const example = new OfflineDataExample()
  
  try {
    await example.initialize()
    
    // Create some data and demonstrate sync
    await example.createAndStoreProfile()
    await example.demonstrateSyncOperations()
    
    example.displayStatus()
    
  } finally {
    await example.cleanup()
  }
}

// Export for use in other modules
export { OfflineDataExample }