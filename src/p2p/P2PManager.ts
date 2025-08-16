import { createLibp2p, Libp2p } from 'libp2p'
import { webRTC } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { bootstrap } from '@libp2p/bootstrap'

import type { Connection, PeerId } from '@libp2p/interface'
// import { peerIdFromString } from '@libp2p/peer-id'

import { 
  NetworkStatus, 
  DiscoveryCriteria, 
  PeerInfo, 
  P2PConfig,
  EncryptedMessage,
  P2PMessage
} from './types'
import { ProfileCRDT } from './ProfileCRDT'
import { DHTDiscovery } from './DHTDiscovery'
import { ProfileSyncManager } from './ProfileSyncManager'
import { ConnectionRecoveryManager } from './ConnectionRecoveryManager'
import { BootstrapDiscoveryManager } from './BootstrapDiscoveryManager'
import { NetworkDiagnosticsManager } from './NetworkDiagnosticsManager'

export class P2PManager {
  private libp2p: Libp2p | null = null
  private config: P2PConfig
  private isInitialized = false
  private connectedPeers: Map<string, Connection> = new Map()
  private messageHandlers: Map<string, (peerId: string, message: P2PMessage) => void> = new Map()
  private profileSubscribers: Set<(profile: ProfileCRDT) => void> = new Set()
  private discoveryInterval: NodeJS.Timeout | null = null
  private dhtDiscovery: DHTDiscovery | null = null
  private profileSyncManager: ProfileSyncManager | null = null
  private connectionRecoveryManager: ConnectionRecoveryManager | null = null
  private bootstrapDiscoveryManager: BootstrapDiscoveryManager | null = null
  private networkDiagnosticsManager: NetworkDiagnosticsManager | null = null

  constructor(config: Partial<P2PConfig> = {}) {
    this.config = {
      // Default configuration
      bootstrapNodes: [
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
      ],
      stunServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
      ],
      turnServers: [],
      geohashPrecision: 5,
      maxPeers: 50,
      discoveryInterval: 30000,
      enableEncryption: true,
      keyRotationInterval: 3600000,
      messageTimeout: 10000,
      reconnectInterval: 5000,
      maxRetries: 3,
      ...config
    }
  }

  // Network Management
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      this.libp2p = await createLibp2p({
        addresses: {
          listen: []
        },
        transports: [
          webRTC(),
          webSockets(),
          circuitRelayTransport()
        ],
        connectionEncrypters: [
          noise()
        ],
        streamMuxers: [
          yamux()
        ],
        peerDiscovery: [
          bootstrap({
            list: this.config.bootstrapNodes
          })
        ],
        services: {
          dht: kadDHT({
            kBucketSize: 20
          }),
          identify: identify(),
          ping: ping()
        }
      })

      // Set up event listeners
      this.setupEventListeners()

      await this.libp2p.start()
      
      // Initialize DHT Discovery
      this.dhtDiscovery = new DHTDiscovery(this.libp2p)
      
      // Initialize Profile Sync Manager
      this.profileSyncManager = new ProfileSyncManager(this)
      
      // Initialize Connection Recovery Manager
      this.connectionRecoveryManager = new ConnectionRecoveryManager({
        healthCheckInterval: 30000,
        healthCheckTimeout: 5000,
        maxConsecutiveFailures: 3,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 1000,
        maxReconnectDelay: 60000,
        backoffMultiplier: 2,
        enablePeerReplacement: true,
        minHealthyPeers: 3,
        maxUnhealthyPeers: 2,
        partitionDetectionThreshold: 0.7,
        partitionRecoveryTimeout: 300000,
        bootstrapNodes: this.config.bootstrapNodes,
        enableBootstrapFallback: true
      })
      
      // Initialize Bootstrap Discovery Manager
      this.bootstrapDiscoveryManager = new BootstrapDiscoveryManager({
        bootstrapNodes: this.config.bootstrapNodes.map(addr => ({
          id: addr.split('/').pop() || 'unknown',
          multiaddr: addr,
          protocols: ['kad-dht'],
          region: 'global',
          reliability: 0.9,
          lastSeen: new Date(),
          responseTime: 100
        })),
        maxBootstrapAttempts: 5,
        bootstrapTimeout: 10000,
        bootstrapRetryDelay: 2000,
        enableDNSBootstrap: true,
        dnsBootstrapDomains: ['bootstrap.libp2p.io'],
        enableWebSocketBootstrap: true,
        webSocketBootstrapUrls: ['wss://ws-star.discovery.libp2p.io'],
        maxRecommendations: 10,
        fallbackDiscoveryInterval: 60000,
        maxFallbackAttempts: 3,
        fallbackMethods: ['bootstrap', 'dns', 'websocket']
      })
      
      await this.bootstrapDiscoveryManager.initialize(this.libp2p, this.dhtDiscovery)
      
      // Initialize Network Diagnostics Manager
      this.networkDiagnosticsManager = new NetworkDiagnosticsManager()
      this.networkDiagnosticsManager.initialize(this.libp2p)
      
      this.isInitialized = true
      
      console.log('P2P Manager initialized with peer ID:', this.libp2p.peerId.toString())
    } catch (error) {
      console.error('Failed to initialize P2P Manager:', error)
      throw error
    }
  }

  async connect(): Promise<void> {
    if (!this.libp2p) {
      throw new Error('P2P Manager not initialized')
    }

    // Start periodic peer discovery
    this.startPeriodicDiscovery()
    
    // Start profile synchronization
    if (this.profileSyncManager) {
      this.profileSyncManager.startSync()
    }
    
    // Initialize and start connection recovery
    if (this.connectionRecoveryManager) {
      // Create a simple WebRTC manager for recovery (in real implementation, this would be injected)
      const webrtcManager = {
        hasConnection: (peerId: string) => this.connectedPeers.has(peerId),
        getDataChannel: () => null,
        closeConnection: async (peerId: string) => {
          const connection = this.connectedPeers.get(peerId)
          if (connection) {
            await connection.close()
            this.connectedPeers.delete(peerId)
          }
        },
        onConnectionStateChange: () => {}
      }
      
      this.connectionRecoveryManager.initialize(this, webrtcManager, this.dhtDiscovery)
    }
    
    console.log('P2P Manager connected to network')
  }

  async disconnect(): Promise<void> {
    // Stop periodic discovery
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval)
      this.discoveryInterval = null
    }

    // Cleanup Bootstrap Discovery Manager
    if (this.bootstrapDiscoveryManager) {
      this.bootstrapDiscoveryManager.destroy()
      this.bootstrapDiscoveryManager = null
    }

    // Cleanup Connection Recovery Manager
    if (this.connectionRecoveryManager) {
      this.connectionRecoveryManager.destroy()
      this.connectionRecoveryManager = null
    }

    // Cleanup Profile Sync Manager
    if (this.profileSyncManager) {
      this.profileSyncManager.destroy()
      this.profileSyncManager = null
    }

    // Cleanup DHT Discovery
    if (this.dhtDiscovery) {
      this.dhtDiscovery.destroy()
      this.dhtDiscovery = null
    }

    // Cleanup Network Diagnostics Manager
    if (this.networkDiagnosticsManager) {
      this.networkDiagnosticsManager.destroy()
      this.networkDiagnosticsManager = null
    }

    // Close all peer connections
    this.connectedPeers.clear()

    if (this.libp2p) {
      await this.libp2p.stop()
      this.isInitialized = false
      console.log('P2P Manager disconnected')
    }
  }

  getNetworkStatus(): NetworkStatus {
    if (!this.libp2p) {
      return {
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }
    }

    const connections = this.libp2p.getConnections()
    const dhtService = this.libp2p.services.dht as any
    
    return {
      connected: this.isInitialized && this.libp2p.status === 'started',
      peerCount: connections.length,
      dhtConnected: dhtService?.isStarted() || false,
      latency: this.calculateAverageLatency(),
      bandwidth: { up: 0, down: 0 } // TODO: Implement bandwidth calculation
    }
  }

  // Peer Discovery
  async discoverPeers(criteria: DiscoveryCriteria): Promise<PeerInfo[]> {
    if (!this.dhtDiscovery) {
      throw new Error('DHT Discovery not initialized')
    }

    try {
      // Generate topics based on criteria
      const topics = this.dhtDiscovery.generateTopics(criteria)
      console.log('Discovering peers for topics:', topics)

      // Join topics for discovery
      await this.dhtDiscovery.join(topics)

      // Find peers in each topic
      const allPeers: PeerInfo[] = []
      for (const topic of topics) {
        const topicPeers = await this.dhtDiscovery.findPeers(topic)
        allPeers.push(...topicPeers)
      }

      // Remove duplicates and limit results
      const uniquePeers = this.deduplicatePeers(allPeers)
      const discoveredPeers = uniquePeers.slice(0, this.config.maxPeers)

      // If DHT discovery returns few peers, try bootstrap fallback
      if (discoveredPeers.length < 5 && this.bootstrapDiscoveryManager) {
        console.log('DHT discovery returned few peers, trying bootstrap fallback...')
        
        try {
          // Get peer recommendations as fallback
          const recommendations = await this.bootstrapDiscoveryManager.getPeerRecommendations(criteria)
          
          // Convert recommendations to PeerInfo format
          const fallbackPeers: PeerInfo[] = recommendations.map(rec => ({
            id: rec.peerId,
            multiaddrs: [`/p2p/${rec.peerId}`], // Simplified multiaddr
            protocols: ['kad-dht'],
            metadata: {
              geohash: criteria.geohash,
              ageRange: criteria.ageRange,
              interests: rec.sharedInterests,
              lastSeen: rec.lastInteraction
            }
          }))
          
          // Merge with discovered peers
          const combinedPeers = [...discoveredPeers, ...fallbackPeers]
          const finalPeers = this.deduplicatePeers(combinedPeers)
          
          console.log(`Bootstrap fallback added ${fallbackPeers.length} peer recommendations`)
          return finalPeers.slice(0, this.config.maxPeers)
        } catch (fallbackError) {
          console.warn('Bootstrap fallback failed:', fallbackError)
        }
      }

      return discoveredPeers
    } catch (error) {
      console.error('Peer discovery failed:', error)
      
      // Try bootstrap fallback as last resort
      if (this.bootstrapDiscoveryManager) {
        console.log('DHT discovery completely failed, using bootstrap fallback only...')
        
        try {
          await this.handleDHTFailure()
          
          // Return peer recommendations as fallback
          const recommendations = await this.bootstrapDiscoveryManager.getPeerRecommendations(criteria)
          return recommendations.map(rec => ({
            id: rec.peerId,
            multiaddrs: [`/p2p/${rec.peerId}`],
            protocols: ['kad-dht'],
            metadata: {
              geohash: criteria.geohash,
              ageRange: criteria.ageRange,
              interests: rec.sharedInterests,
              lastSeen: rec.lastInteraction
            }
          }))
        } catch (bootstrapError) {
          console.error('Bootstrap fallback also failed:', bootstrapError)
        }
      }
      
      return []
    }
  }

  async connectToPeer(peerId: string): Promise<void> {
    if (!this.libp2p) {
      throw new Error('P2P Manager not initialized')
    }

    const startTime = Date.now()
    
    try {
      // Check if already connected
      if (this.connectedPeers.has(peerId)) {
        console.log('Already connected to peer:', peerId)
        this.recordPeerInteraction(peerId, 'connection', true, { 
          latency: 0,
          cached: true 
        })
        return
      }

      // Attempt to dial the peer
      // TODO: Convert string to PeerId object when libp2p types are fixed
      const connection = await this.libp2p.dial(peerId as any)
      
      const latency = Date.now() - startTime
      
      if (connection.status === 'open') {
        this.connectedPeers.set(peerId, connection)
        console.log('Successfully connected to peer:', peerId)
        
        // Record successful connection
        this.recordPeerInteraction(peerId, 'connection', true, { latency })
      } else {
        // Record failed connection
        this.recordPeerInteraction(peerId, 'connection', false, { 
          latency,
          errorReason: `Connection status: ${connection.status}`
        })
        throw new Error(`Connection failed with status: ${connection.status}`)
      }
    } catch (error) {
      const latency = Date.now() - startTime
      
      // Record failed connection
      this.recordPeerInteraction(peerId, 'connection', false, { 
        latency,
        errorReason: error instanceof Error ? error.message : 'Unknown error'
      })
      
      console.error('Failed to connect to peer:', peerId, error)
      throw error
    }
  }

  // Data Synchronization
  async broadcastProfile(profile: ProfileCRDT): Promise<void> {
    if (!this.libp2p) {
      throw new Error('P2P Manager not initialized')
    }

    try {
      // Serialize profile for transmission
      const profileData = profile.serialize()
      const profileMetadata = {
        id: profile.id,
        did: profile.did,
        version: profile.version,
        timestamp: profile.lastUpdated.toISOString()
      }
      
      // Create broadcast message
      const broadcastMessage = {
        type: 'profile_broadcast',
        metadata: profileMetadata,
        data: Array.from(profileData) // Convert to array for JSON serialization
      }
      
      // Broadcast to all connected peers
      const connections = this.libp2p.getConnections()
      const broadcastPromises = connections.map(async (connection) => {
        try {
          // Create a stream for profile data
          const stream = await connection.newStream('/tinder/profile/1.0.0')
          const messageData = new TextEncoder().encode(JSON.stringify(broadcastMessage))
          await stream.sink([messageData])
          await stream.close()
        } catch (error) {
          console.warn('Failed to broadcast to peer:', connection.remotePeer.toString(), error)
        }
      })

      await Promise.allSettled(broadcastPromises)
      console.log('Profile broadcasted to', connections.length, 'peers')
    } catch (error) {
      console.error('Profile broadcast failed:', error)
      throw error
    }
  }

  subscribeToProfiles(callback: (profile: ProfileCRDT) => void): void {
    this.profileSubscribers.add(callback)
    console.log('Subscribed to profile updates, total subscribers:', this.profileSubscribers.size)
  }

  // On-demand profile replication
  async requestProfile(peerId: string, profileId: string): Promise<ProfileCRDT | null> {
    if (!this.libp2p) {
      throw new Error('P2P Manager not initialized')
    }

    try {
      const connection = this.connectedPeers.get(peerId) || await this.libp2p.dial(peerId as any)
      
      // Create request message
      const requestMessage = {
        type: 'profile_request',
        profileId,
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }

      // Send profile request
      const stream = await connection.newStream('/tinder/profile-request/1.0.0')
      const messageData = new TextEncoder().encode(JSON.stringify(requestMessage))
      await stream.sink([messageData])
      await stream.close()

      // Wait for response (simplified - in production would use proper request/response handling)
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Profile request timeout'))
        }, this.config.messageTimeout)

        const responseHandler = (profile: ProfileCRDT) => {
          if (profile.id === profileId) {
            clearTimeout(timeout)
            this.profileSubscribers.delete(responseHandler)
            resolve(profile)
          }
        }

        this.profileSubscribers.add(responseHandler)
      })
    } catch (error) {
      console.error('Profile request failed:', error)
      return null
    }
  }

  // Selective profile synchronization based on criteria
  async syncProfilesWithCriteria(criteria: DiscoveryCriteria): Promise<ProfileCRDT[]> {
    if (!this.libp2p) {
      throw new Error('P2P Manager not initialized')
    }

    try {
      // Discover peers matching criteria
      const peers = await this.discoverPeers(criteria)
      console.log('Found', peers.length, 'peers matching criteria for profile sync')

      // Request profiles from discovered peers
      const profilePromises = peers.map(async (peer) => {
        try {
          // Connect to peer if not already connected
          if (!this.connectedPeers.has(peer.id)) {
            await this.connectToPeer(peer.id)
          }

          // Request their profile (assuming profile ID matches peer ID for simplicity)
          return await this.requestProfile(peer.id, peer.id)
        } catch (error) {
          console.warn('Failed to sync profile from peer:', peer.id, error)
          return null
        }
      })

      const profiles = await Promise.allSettled(profilePromises)
      const successfulProfiles = profiles
        .filter((result): result is PromiseFulfilledResult<ProfileCRDT | null> => 
          result.status === 'fulfilled' && result.value !== null)
        .map(result => result.value!)

      console.log('Successfully synced', successfulProfiles.length, 'profiles')
      return successfulProfiles
    } catch (error) {
      console.error('Profile sync with criteria failed:', error)
      return []
    }
  }

  // Batch profile updates for efficiency
  async broadcastProfileUpdates(profiles: ProfileCRDT[]): Promise<void> {
    if (!this.libp2p) {
      throw new Error('P2P Manager not initialized')
    }

    try {
      // Create batch update message
      const batchMessage = {
        type: 'profile_batch_update',
        profiles: profiles.map(profile => ({
          id: profile.id,
          did: profile.did,
          version: profile.version,
          timestamp: profile.lastUpdated.toISOString(),
          data: Array.from(profile.serialize())
        })),
        batchId: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }

      // Broadcast to all connected peers
      const connections = this.libp2p.getConnections()
      const broadcastPromises = connections.map(async (connection) => {
        try {
          const stream = await connection.newStream('/tinder/profile-batch/1.0.0')
          const messageData = new TextEncoder().encode(JSON.stringify(batchMessage))
          await stream.sink([messageData])
          await stream.close()
        } catch (error) {
          console.warn('Failed to send batch update to peer:', connection.remotePeer.toString(), error)
        }
      })

      await Promise.allSettled(broadcastPromises)
      console.log('Batch profile updates sent to', connections.length, 'peers')
    } catch (error) {
      console.error('Batch profile update failed:', error)
      throw error
    }
  }

  // Messaging
  async sendMessage(peerId: string, message: EncryptedMessage): Promise<void> {
    if (!this.libp2p) {
      throw new Error('P2P Manager not initialized')
    }

    try {
      const connection = this.connectedPeers.get(peerId) || await this.libp2p.dial(peerId as any)
      
      // Create a stream for messaging
      const stream = await connection.newStream('/tinder/message/1.0.0')
      
      // Serialize the encrypted message
      const messageData = new Uint8Array([
        ...new Uint8Array(message.ciphertext),
        ...new TextEncoder().encode(JSON.stringify({
          header: message.header,
          timestamp: message.timestamp.toISOString()
        }))
      ])

      await stream.sink([messageData])
      await stream.close()
      
      console.log('Message sent to peer:', peerId)
    } catch (error) {
      console.error('Failed to send message to peer:', peerId, error)
      throw error
    }
  }

  onMessage(callback: (peerId: string, message: P2PMessage) => void): void {
    const handlerId = Math.random().toString(36).substr(2, 9)
    this.messageHandlers.set(handlerId, callback)
    console.log('Message handler registered with ID:', handlerId)
  }

  // Private Helper Methods
  private setupEventListeners(): void {
    if (!this.libp2p) return

    // Handle incoming connections
    this.libp2p.addEventListener('peer:connect', (event) => {
      const peerId = event.detail.toString()
      console.log('Peer connected:', peerId)
    })

    this.libp2p.addEventListener('peer:disconnect', (event) => {
      const peerId = event.detail.toString()
      this.connectedPeers.delete(peerId)
      console.log('Peer disconnected:', peerId)
    })

    // Handle incoming streams
    this.libp2p.handle('/tinder/profile/1.0.0', ({ stream, connection }) => {
      this.handleIncomingProfile(stream, connection.remotePeer)
    })

    this.libp2p.handle('/tinder/profile-request/1.0.0', ({ stream, connection }) => {
      this.handleProfileRequest(stream, connection.remotePeer)
    })

    this.libp2p.handle('/tinder/profile-batch/1.0.0', ({ stream, connection }) => {
      this.handleProfileBatch(stream, connection.remotePeer)
    })

    this.libp2p.handle('/tinder/message/1.0.0', ({ stream, connection }) => {
      this.handleIncomingMessage(stream, connection.remotePeer)
    })
  }

  private async handleIncomingProfile(stream: any, remotePeer: PeerId): Promise<void> {
    try {
      // Read profile data from stream
      const chunks: Uint8Array[] = []
      for await (const chunk of stream.source) {
        chunks.push(chunk)
      }
      
      const messageData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
      let offset = 0
      for (const chunk of chunks) {
        messageData.set(chunk, offset)
        offset += chunk.length
      }

      // Parse the message
      const messageText = new TextDecoder().decode(messageData)
      const message = JSON.parse(messageText)

      if (message.type === 'profile_broadcast') {
        // Convert array back to Uint8Array
        const profileData = new Uint8Array(message.data)
        
        // Deserialize profile with metadata
        const profile = ProfileCRDT.deserialize(profileData, message.metadata.id, message.metadata.did)
        
        // Verify profile integrity
        if (profile.id === message.metadata.id && profile.version >= message.metadata.version) {
          // Notify subscribers
          this.profileSubscribers.forEach(callback => {
            try {
              callback(profile)
            } catch (error) {
              console.error('Profile subscriber callback failed:', error)
            }
          })

          console.log('Received profile broadcast from peer:', remotePeer.toString(), 'Profile ID:', profile.id)
        } else {
          console.warn('Profile integrity check failed for peer:', remotePeer.toString())
        }
      }
    } catch (error) {
      console.error('Failed to handle incoming profile:', error)
    }
  }

  private async handleProfileRequest(stream: any, remotePeer: PeerId): Promise<void> {
    try {
      // Read request data from stream
      const chunks: Uint8Array[] = []
      for await (const chunk of stream.source) {
        chunks.push(chunk)
      }
      
      const messageData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
      let offset = 0
      for (const chunk of chunks) {
        messageData.set(chunk, offset)
        offset += chunk.length
      }

      // Parse the request
      const messageText = new TextDecoder().decode(messageData)
      const request = JSON.parse(messageText)

      if (request.type === 'profile_request') {
        console.log('Received profile request from peer:', remotePeer.toString(), 'for profile:', request.profileId)
        
        // In a real implementation, this would check if we have the requested profile
        // and send it back. For now, we'll just log the request.
        // The actual profile sharing would be handled by the application layer
        // that maintains a profile store/cache.
      }
    } catch (error) {
      console.error('Failed to handle profile request:', error)
    }
  }

  private async handleProfileBatch(stream: any, remotePeer: PeerId): Promise<void> {
    try {
      // Read batch data from stream
      const chunks: Uint8Array[] = []
      for await (const chunk of stream.source) {
        chunks.push(chunk)
      }
      
      const messageData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
      let offset = 0
      for (const chunk of chunks) {
        messageData.set(chunk, offset)
        offset += chunk.length
      }

      // Parse the batch message
      const messageText = new TextDecoder().decode(messageData)
      const batchMessage = JSON.parse(messageText)

      if (batchMessage.type === 'profile_batch_update') {
        console.log('Received profile batch from peer:', remotePeer.toString(), 'with', batchMessage.profiles.length, 'profiles')
        
        // Process each profile in the batch
        for (const profileData of batchMessage.profiles) {
          try {
            const profileBytes = new Uint8Array(profileData.data)
            const profile = ProfileCRDT.deserialize(profileBytes, profileData.id, profileData.did)
            
            // Verify profile integrity
            if (profile.id === profileData.id && profile.version >= profileData.version) {
              // Notify subscribers
              this.profileSubscribers.forEach(callback => {
                try {
                  callback(profile)
                } catch (error) {
                  console.error('Profile subscriber callback failed:', error)
                }
              })
            }
          } catch (error) {
            console.warn('Failed to process profile in batch:', profileData.id, error)
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle profile batch:', error)
    }
  }

  private async handleIncomingMessage(stream: any, remotePeer: PeerId): Promise<void> {
    try {
      // Read message data from stream
      const chunks: Uint8Array[] = []
      for await (const chunk of stream.source) {
        chunks.push(chunk)
      }
      
      // Parse message (simplified for now)
      const peerId = remotePeer.toString()
      
      // Notify message handlers
      this.messageHandlers.forEach(callback => {
        try {
          // Create a basic P2P message structure
          const message: P2PMessage = {
            type: 'chat' as any,
            from: peerId,
            to: this.getPeerId(),
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
          callback(peerId, message)
        } catch (error) {
          console.error('Message handler callback failed:', error)
        }
      })

      console.log('Received message from peer:', peerId)
    } catch (error) {
      console.error('Failed to handle incoming message:', error)
    }
  }



  private startPeriodicDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval)
    }

    this.discoveryInterval = setInterval(async () => {
      try {
        // Perform basic peer discovery
        const connections = this.libp2p?.getConnections() || []
        console.log('Periodic discovery - connected peers:', connections.length)
        
        // Maintain connection count within limits
        if (connections.length > this.config.maxPeers) {
          // Close oldest connections
          const excessConnections = connections.slice(this.config.maxPeers)
          for (const connection of excessConnections) {
            try {
              await connection.close()
            } catch (error) {
              console.warn('Failed to close excess connection:', error)
            }
          }
        }
      } catch (error) {
        console.error('Periodic discovery failed:', error)
      }
    }, this.config.discoveryInterval)
  }

  private calculateAverageLatency(): number {
    // Simple latency calculation based on ping
    // TODO: Implement actual latency measurement
    return 0
  }

  // Utility Methods
  getPeerId(): string {
    if (!this.libp2p) {
      throw new Error('P2P Manager not initialized')
    }
    return this.libp2p.peerId.toString()
  }

  isConnected(): boolean {
    return this.isInitialized && this.libp2p !== null && this.libp2p.status === 'started'
  }

  getConnectedPeers(): string[] {
    return Array.from(this.connectedPeers.keys())
  }

  getConnectionCount(): number {
    return this.connectedPeers.size
  }

  // Cleanup method
  unsubscribeFromProfiles(callback: (profile: ProfileCRDT) => void): void {
    this.profileSubscribers.delete(callback)
  }

  removeMessageHandler(callback: (peerId: string, message: P2PMessage) => void): void {
    for (const [id, handler] of this.messageHandlers.entries()) {
      if (handler === callback) {
        this.messageHandlers.delete(id)
        break
      }
    }
  }

  // Profile Sync Manager Methods
  getProfileSyncManager(): ProfileSyncManager | null {
    return this.profileSyncManager
  }

  // DHT Discovery Methods
  getDHTDiscovery(): DHTDiscovery | null {
    return this.dhtDiscovery
  }

  // Connection Recovery Methods
  getConnectionRecoveryManager(): ConnectionRecoveryManager | null {
    return this.connectionRecoveryManager
  }

  // Force peer recovery
  async forcePeerRecovery(peerId: string): Promise<boolean> {
    if (!this.connectionRecoveryManager) {
      console.warn('Connection Recovery Manager not available')
      return false
    }
    return await this.connectionRecoveryManager.forcePeerRecovery(peerId)
  }

  // Force network recovery
  async forceNetworkRecovery(): Promise<void> {
    if (!this.connectionRecoveryManager) {
      console.warn('Connection Recovery Manager not available')
      return
    }
    await this.connectionRecoveryManager.forceNetworkRecovery()
  }

  // Get network health status
  getNetworkHealth(): any {
    if (!this.connectionRecoveryManager) {
      return {
        totalPeers: this.connectedPeers.size,
        healthyPeers: this.connectedPeers.size,
        unhealthyPeers: 0,
        healthyRatio: 1,
        partition: null,
        peerHealth: []
      }
    }
    return this.connectionRecoveryManager.getNetworkHealth()
  }

  // Bootstrap Discovery Methods
  getBootstrapDiscoveryManager(): BootstrapDiscoveryManager | null {
    return this.bootstrapDiscoveryManager
  }

  // Bootstrap network connection
  async bootstrapNetwork(): Promise<boolean> {
    if (!this.bootstrapDiscoveryManager) {
      console.warn('Bootstrap Discovery Manager not available')
      return false
    }
    return await this.bootstrapDiscoveryManager.bootstrapNetwork()
  }

  // Get peer recommendations
  async getPeerRecommendations(criteria: DiscoveryCriteria): Promise<any[]> {
    if (!this.bootstrapDiscoveryManager) {
      console.warn('Bootstrap Discovery Manager not available')
      return []
    }
    return await this.bootstrapDiscoveryManager.getPeerRecommendations(criteria)
  }

  // Record peer interaction for recommendations
  recordPeerInteraction(peerId: string, type: string, success: boolean, metadata: any = {}): void {
    if (this.bootstrapDiscoveryManager) {
      this.bootstrapDiscoveryManager.recordPeerInteraction(peerId, type as any, success, metadata)
    }
  }

  // Handle DHT failure with bootstrap fallback
  async handleDHTFailure(): Promise<void> {
    if (!this.bootstrapDiscoveryManager) {
      console.warn('Bootstrap Discovery Manager not available')
      return
    }
    await this.bootstrapDiscoveryManager.handleDHTFailure()
  }

  // Get bootstrap and discovery statistics
  getBootstrapStats(): any {
    if (!this.bootstrapDiscoveryManager) {
      return {
        bootstrapNodes: 0,
        availableBootstrapNodes: 0,
        peerHistorySize: 0,
        averageReputationScore: 0,
        totalInteractions: 0,
        fallbackMethodsEnabled: 0
      }
    }
    return this.bootstrapDiscoveryManager.getStats()
  }

  async joinDiscoveryTopics(criteria: DiscoveryCriteria): Promise<void> {
    if (!this.dhtDiscovery) {
      throw new Error('DHT Discovery not initialized')
    }

    const topics = this.dhtDiscovery.generateTopics(criteria)
    await this.dhtDiscovery.join(topics)
  }

  async leaveDiscoveryTopics(criteria: DiscoveryCriteria): Promise<void> {
    if (!this.dhtDiscovery) {
      throw new Error('DHT Discovery not initialized')
    }

    const topics = this.dhtDiscovery.generateTopics(criteria)
    await this.dhtDiscovery.leave(topics)
  }

  subscribeToDiscoveryTopic(topic: string, callback: (peer: PeerInfo) => void): void {
    if (!this.dhtDiscovery) {
      throw new Error('DHT Discovery not initialized')
    }

    this.dhtDiscovery.subscribeToTopic(topic, callback)
  }

  // Helper Methods
  private deduplicatePeers(peers: PeerInfo[]): PeerInfo[] {
    const seen = new Set<string>()
    const unique: PeerInfo[] = []

    for (const peer of peers) {
      if (!seen.has(peer.id)) {
        seen.add(peer.id)
        unique.push(peer)
      }
    }

    return unique
  }

  // Network Diagnostics Methods
  getNetworkDiagnostics() {
    if (!this.networkDiagnosticsManager) {
      throw new Error('Network diagnostics not initialized')
    }
    return this.networkDiagnosticsManager.getNetworkDiagnostics()
  }

  async runNetworkTroubleshooting() {
    if (!this.networkDiagnosticsManager) {
      throw new Error('Network diagnostics not initialized')
    }
    return this.networkDiagnosticsManager.runNetworkTroubleshooting()
  }

  getPeerMetrics(peerId: string) {
    if (!this.networkDiagnosticsManager) {
      return null
    }
    return this.networkDiagnosticsManager.getPeerMetrics(peerId)
  }

  getAllPeerMetrics() {
    if (!this.networkDiagnosticsManager) {
      return []
    }
    return this.networkDiagnosticsManager.getAllPeerMetrics()
  }

  getNetworkHistory() {
    if (!this.networkDiagnosticsManager) {
      return []
    }
    return this.networkDiagnosticsManager.getNetworkHistory()
  }

  // Message tracking for diagnostics
  recordMessageSent() {
    this.networkDiagnosticsManager?.recordMessageSent()
  }

  recordMessageReceived() {
    this.networkDiagnosticsManager?.recordMessageReceived()
  }

  recordMessageDelivered() {
    this.networkDiagnosticsManager?.recordMessageDelivered()
  }

  recordMessageFailed() {
    this.networkDiagnosticsManager?.recordMessageFailed()
  }

  // Event subscription for diagnostics
  onNetworkDiagnosticsUpdate(callback: (diagnostics: any) => void) {
    this.networkDiagnosticsManager?.on('metrics:updated', callback)
  }

  onNetworkIssuesDetected(callback: (issues: any[]) => void) {
    this.networkDiagnosticsManager?.on('issues:detected', callback)
  }

  onPeerConnected(callback: (peerId: string, metrics: any) => void) {
    this.networkDiagnosticsManager?.on('peer:connected', callback)
  }

  onPeerDisconnected(callback: (peerId: string, metrics: any) => void) {
    this.networkDiagnosticsManager?.on('peer:disconnected', callback)
  }

  // Getter for libp2p instance (for diagnostics and testing)
  get libp2pInstance(): Libp2p | null {
    return this.libp2p
  }
}