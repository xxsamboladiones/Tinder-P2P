import { P2PManager } from '../P2PManager'
import { ProfileSyncManager } from '../ProfileSyncManager'
import { ProfileCRDT } from '../ProfileCRDT'
import { DiscoveryCriteria } from '../types'

/**
 * Example demonstrating Profile Synchronization functionality
 * 
 * This example shows how to:
 * 1. Set up profile synchronization
 * 2. Broadcast profiles to the network
 * 3. Subscribe to profile updates
 * 4. Request specific profiles from peers
 * 5. Sync profiles based on criteria
 */

export class ProfileSyncExample {
  private p2pManager: P2PManager
  private profileSyncManager: ProfileSyncManager | null = null

  constructor() {
    // Initialize P2P Manager with configuration
    this.p2pManager = new P2PManager({
      maxPeers: 20,
      discoveryInterval: 30000,
      geohashPrecision: 5
    })
  }

  /**
   * Initialize the P2P network and profile synchronization
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing P2P network...')
      
      // Initialize P2P Manager
      await this.p2pManager.initialize()
      await this.p2pManager.connect()
      
      // Get the profile sync manager
      this.profileSyncManager = this.p2pManager.getProfileSyncManager()
      
      if (!this.profileSyncManager) {
        throw new Error('Profile sync manager not available')
      }

      // Subscribe to profile updates
      this.setupProfileSubscriptions()
      
      console.log('✅ P2P network and profile sync initialized')
      console.log('📡 Peer ID:', this.p2pManager.getPeerId())
      
    } catch (error) {
      console.error('❌ Failed to initialize P2P network:', error)
      throw error
    }
  }

  /**
   * Create and broadcast a sample profile
   */
  async createAndBroadcastProfile(): Promise<ProfileCRDT> {
    if (!this.profileSyncManager) {
      throw new Error('Profile sync manager not initialized')
    }

    try {
      console.log('👤 Creating sample profile...')
      
      // Create a sample profile
      const profile = new ProfileCRDT('user123', 'did:key:user123')
      profile.setName('Alice Johnson')
      profile.setAge(28)
      profile.setBio('Love hiking, photography, and good coffee ☕')
      
      // Add interests
      profile.addInterest('photography')
      profile.addInterest('hiking')
      profile.addInterest('travel')
      profile.addInterest('coffee')
      
      // Add sample photos (URLs)
      profile.addPhoto({
        id: 'photo1',
        hash: 'abc123',
        url: 'https://example.com/photo1.jpg',
        thumbnail: 'https://example.com/photo1_thumb.jpg'
      })
      
      // Set location (geohash for San Francisco area)
      profile.setLocation({
        geohash: 'dr5ru', // San Francisco area
        timestamp: new Date()
      })

      console.log('📤 Broadcasting profile to network...')
      
      // Broadcast the profile
      await this.profileSyncManager.broadcastProfile(profile)
      
      console.log('✅ Profile broadcasted successfully')
      console.log('📊 Profile details:', {
        id: profile.id,
        name: profile.name,
        age: profile.age,
        interests: profile.interests,
        version: profile.version
      })
      
      return profile
      
    } catch (error) {
      console.error('❌ Failed to create and broadcast profile:', error)
      throw error
    }
  }

  /**
   * Discover and sync profiles based on criteria
   */
  async discoverAndSyncProfiles(): Promise<ProfileCRDT[]> {
    if (!this.profileSyncManager) {
      throw new Error('Profile sync manager not initialized')
    }

    try {
      console.log('🔍 Discovering profiles with matching criteria...')
      
      // Define discovery criteria
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru', // San Francisco area
        ageRange: [25, 35], // Ages 25-35
        interests: ['photography', 'travel'], // Common interests
        maxDistance: 50 // Within 50km
      }

      console.log('🎯 Search criteria:', criteria)
      
      // Sync profiles matching criteria
      const profiles = await this.profileSyncManager.syncProfiles(criteria)
      
      console.log(`✅ Found ${profiles.length} matching profiles`)
      
      // Display found profiles
      profiles.forEach((profile, index) => {
        console.log(`👤 Profile ${index + 1}:`, {
          id: profile.id,
          name: profile.name,
          age: profile.age,
          interests: profile.interests,
          commonInterests: profile.interests.filter(interest => 
            criteria.interests.includes(interest)
          )
        })
      })
      
      return profiles
      
    } catch (error) {
      console.error('❌ Failed to discover profiles:', error)
      return []
    }
  }

  /**
   * Request a specific profile from a peer
   */
  async requestSpecificProfile(peerId: string, profileId: string): Promise<ProfileCRDT | null> {
    if (!this.profileSyncManager) {
      throw new Error('Profile sync manager not initialized')
    }

    try {
      console.log(`📥 Requesting profile ${profileId} from peer ${peerId}...`)
      
      const profile = await this.profileSyncManager.requestProfile(peerId, profileId)
      
      if (profile) {
        console.log('✅ Profile received:', {
          id: profile.id,
          name: profile.name,
          age: profile.age,
          version: profile.version
        })
      } else {
        console.log('❌ Profile not found or request failed')
      }
      
      return profile
      
    } catch (error) {
      console.error('❌ Failed to request profile:', error)
      return null
    }
  }

  /**
   * Get cached profiles and display statistics
   */
  displayCachedProfiles(): void {
    if (!this.profileSyncManager) {
      throw new Error('Profile sync manager not initialized')
    }

    console.log('📊 Profile Cache Statistics:')
    
    // Get sync statistics
    const stats = this.profileSyncManager.getSyncStats()
    console.log('📈 Sync Stats:', stats)
    
    // Get all cached profiles
    const cachedProfiles = this.profileSyncManager.getCachedProfiles()
    console.log(`💾 Cached Profiles (${cachedProfiles.length}):`)
    
    cachedProfiles.forEach((profile, index) => {
      console.log(`  ${index + 1}. ${profile.name} (${profile.age}) - v${profile.version}`)
      console.log(`     Interests: ${profile.interests.join(', ')}`)
      console.log(`     Last updated: ${profile.lastUpdated.toLocaleString()}`)
    })
  }

  /**
   * Filter cached profiles by specific criteria
   */
  filterCachedProfiles(criteria: Partial<DiscoveryCriteria>): ProfileCRDT[] {
    if (!this.profileSyncManager) {
      throw new Error('Profile sync manager not initialized')
    }

    console.log('🔍 Filtering cached profiles with criteria:', criteria)
    
    const filteredProfiles = this.profileSyncManager.getCachedProfiles(criteria)
    
    console.log(`✅ Found ${filteredProfiles.length} matching cached profiles`)
    
    filteredProfiles.forEach((profile, index) => {
      console.log(`  ${index + 1}. ${profile.name} (${profile.age})`)
    })
    
    return filteredProfiles
  }

  /**
   * Set up profile update subscriptions
   */
  private setupProfileSubscriptions(): void {
    if (!this.profileSyncManager) {
      return
    }

    // Subscribe to profile sync updates
    this.profileSyncManager.onProfileSync((profiles) => {
      console.log(`🔄 Received ${profiles.length} profile update(s):`)
      
      profiles.forEach(profile => {
        console.log(`  📝 ${profile.name} (${profile.id}) - v${profile.version}`)
        console.log(`     Bio: ${profile.bio}`)
        console.log(`     Interests: ${profile.interests.join(', ')}`)
      })
    })

    console.log('👂 Profile update subscriptions set up')
  }

  /**
   * Get network status and connected peers
   */
  getNetworkStatus(): void {
    const status = this.p2pManager.getNetworkStatus()
    const connectedPeers = this.p2pManager.getConnectedPeers()
    
    console.log('🌐 Network Status:', {
      connected: status.connected,
      peerCount: status.peerCount,
      dhtConnected: status.dhtConnected,
      connectedPeers: connectedPeers.length
    })
    
    if (connectedPeers.length > 0) {
      console.log('👥 Connected Peers:')
      connectedPeers.forEach((peerId, index) => {
        console.log(`  ${index + 1}. ${peerId}`)
      })
    }
  }

  /**
   * Clean up and disconnect
   */
  async cleanup(): Promise<void> {
    try {
      console.log('🧹 Cleaning up P2P network...')
      
      if (this.profileSyncManager) {
        this.profileSyncManager.stopSync()
      }
      
      await this.p2pManager.disconnect()
      
      console.log('✅ P2P network disconnected')
      
    } catch (error) {
      console.error('❌ Failed to cleanup P2P network:', error)
    }
  }
}

/**
 * Example usage function
 */
export async function runProfileSyncExample(): Promise<void> {
  const example = new ProfileSyncExample()
  
  try {
    // Initialize the P2P network
    await example.initialize()
    
    // Wait a bit for network to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Create and broadcast a profile
    const myProfile = await example.createAndBroadcastProfile()
    
    // Display network status
    example.getNetworkStatus()
    
    // Wait a bit for potential peer discovery
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Try to discover profiles
    const discoveredProfiles = await example.discoverAndSyncProfiles()
    
    // Display cached profiles
    example.displayCachedProfiles()
    
    // Filter profiles by age
    example.filterCachedProfiles({
      ageRange: [25, 30]
    })
    
    // Filter profiles by interests
    example.filterCachedProfiles({
      interests: ['photography']
    })
    
    // Wait a bit to see any incoming profile updates
    console.log('⏳ Waiting for potential profile updates...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Final status
    example.displayCachedProfiles()
    example.getNetworkStatus()
    
  } catch (error) {
    console.error('❌ Example failed:', error)
  } finally {
    // Clean up
    await example.cleanup()
  }
}

// Export for use in other modules
export default ProfileSyncExample

// If running this file directly
if (require.main === module) {
  runProfileSyncExample().catch(console.error)
}