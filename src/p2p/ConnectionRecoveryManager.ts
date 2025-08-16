import { NetworkStatus, PeerInfo } from './types'

// Browser-compatible EventEmitter implementation
class SimpleEventEmitter {
  private listeners: Map<string, Function[]> = new Map()

  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(listener)
    return this
  }

  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(...args)
        } catch (error) {
          console.error('Event listener error:', error)
        }
      })
      return true
    }
    return false
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
    return this
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length || 0
  }
}

export interface ConnectionHealth {
  peerId: string
  lastSeen: Date
  latency: number
  packetLoss: number
  connectionQuality: 'excellent' | 'good' | 'poor' | 'critical'
  consecutiveFailures: number
  isHealthy: boolean
}

export interface NetworkPartition {
  detected: boolean
  partitionSize: number
  isolatedPeers: string[]
  detectedAt: Date
  recoveredAt?: Date
}

export interface RecoveryStrategy {
  type: 'reconnect' | 'replace_peer' | 'bootstrap' | 'hybrid_fallback'
  priority: number
  maxAttempts: number
  backoffMultiplier: number
  initialDelay: number
}

export interface ConnectionRecoveryConfig {
  // Health monitoring
  healthCheckInterval: number
  healthCheckTimeout: number
  maxConsecutiveFailures: number
  
  // Reconnection
  maxReconnectAttempts: number
  initialReconnectDelay: number
  maxReconnectDelay: number
  backoffMultiplier: number
  
  // Peer replacement
  enablePeerReplacement: boolean
  minHealthyPeers: number
  maxUnhealthyPeers: number
  
  // Network partition detection
  partitionDetectionThreshold: number
  partitionRecoveryTimeout: number
  
  // Bootstrap fallback
  bootstrapNodes: string[]
  enableBootstrapFallback: boolean
}

export class ConnectionRecoveryManager extends SimpleEventEmitter {
  private config: ConnectionRecoveryConfig
  private peerHealth: Map<string, ConnectionHealth> = new Map()
  private reconnectAttempts: Map<string, number> = new Map()
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()
  private healthCheckTimer: NodeJS.Timeout | null = null
  private networkPartition: NetworkPartition | null = null
  private isRecovering = false
  
  // Dependencies
  private p2pManager: any // Will be injected
  private webrtcManager: any // Will be injected
  private dhtDiscovery: any // Will be injected

  constructor(config: Partial<ConnectionRecoveryConfig> = {}) {
    super()
    
    this.config = {
      // Health monitoring defaults
      healthCheckInterval: 30000, // 30 seconds
      healthCheckTimeout: 5000, // 5 seconds
      maxConsecutiveFailures: 3,
      
      // Reconnection defaults
      maxReconnectAttempts: 5,
      initialReconnectDelay: 1000, // 1 second
      maxReconnectDelay: 60000, // 1 minute
      backoffMultiplier: 2,
      
      // Peer replacement defaults
      enablePeerReplacement: true,
      minHealthyPeers: 3,
      maxUnhealthyPeers: 2,
      
      // Network partition detection defaults
      partitionDetectionThreshold: 0.7, // 70% of peers lost
      partitionRecoveryTimeout: 300000, // 5 minutes
      
      // Bootstrap fallback defaults
      bootstrapNodes: [
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
      ],
      enableBootstrapFallback: true,
      
      ...config
    }
  }

  // Initialize with P2P dependencies
  initialize(p2pManager: any, webrtcManager: any, dhtDiscovery: any): void {
    this.p2pManager = p2pManager
    this.webrtcManager = webrtcManager
    this.dhtDiscovery = dhtDiscovery
    
    this.setupEventListeners()
    this.startHealthMonitoring()
    
    console.log('Connection Recovery Manager initialized')
  }

  // Start health monitoring
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck()
    }, this.config.healthCheckInterval)
    
    console.log('Health monitoring started with interval:', this.config.healthCheckInterval)
  }

  // Perform health check on all connected peers
  private async performHealthCheck(): Promise<void> {
    if (!this.p2pManager || this.isRecovering) {
      return
    }

    try {
      const connectedPeers = this.p2pManager.getConnectedPeers()
      const healthCheckPromises = connectedPeers.map((peerId: string) => 
        this.checkPeerHealth(peerId)
      )

      await Promise.allSettled(healthCheckPromises)
      
      // Analyze overall network health
      await this.analyzeNetworkHealth()
      
      // Trigger recovery if needed
      await this.triggerRecoveryIfNeeded()
      
    } catch (error) {
      console.error('Health check failed:', error)
      this.emit('healthCheckError', error)
    }
  }

  // Check health of individual peer
  private async checkPeerHealth(peerId: string): Promise<void> {
    const startTime = Date.now()
    let health = this.peerHealth.get(peerId) || this.createInitialHealth(peerId)

    try {
      // Perform ping test
      const pingResult = await this.pingPeer(peerId)
      const latency = Date.now() - startTime
      
      if (pingResult.success) {
        // Update healthy status
        health.lastSeen = new Date()
        health.latency = latency
        health.packetLoss = Math.max(0, health.packetLoss - 0.1) // Gradual recovery
        health.consecutiveFailures = 0
        health.isHealthy = true
        health.connectionQuality = this.calculateConnectionQuality(health)
        
        this.emit('peerHealthy', peerId, health)
      } else {
        // Update unhealthy status
        health.consecutiveFailures++
        health.packetLoss = Math.min(1, health.packetLoss + 0.2)
        health.isHealthy = health.consecutiveFailures < this.config.maxConsecutiveFailures
        health.connectionQuality = this.calculateConnectionQuality(health)
        
        this.emit('peerUnhealthy', peerId, health)
        
        // Trigger recovery for unhealthy peer
        if (!health.isHealthy) {
          await this.recoverPeerConnection(peerId)
        }
      }
    } catch (error) {
      console.error('Peer health check failed:', peerId, error)
      health.consecutiveFailures++
      health.isHealthy = false
      health.connectionQuality = 'critical'
      
      this.emit('peerHealthCheckFailed', peerId, error)
    }

    this.peerHealth.set(peerId, health)
  }

  // Ping peer to test connectivity
  private async pingPeer(peerId: string): Promise<{ success: boolean; latency?: number }> {
    const startTime = Date.now()
    
    try {
      // Use WebRTC data channel ping if available
      if (this.webrtcManager && this.webrtcManager.hasConnection(peerId)) {
        const channel = this.webrtcManager.getDataChannel(peerId, 'ping')
        if (channel && channel.readyState === 'open') {
          const pingId = crypto.randomUUID()
          const pingMessage = JSON.stringify({ type: 'ping', id: pingId, timestamp: startTime })
          
          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              resolve({ success: false })
            }, this.config.healthCheckTimeout)
            
            const handlePong = (event: MessageEvent) => {
              try {
                const data = JSON.parse(event.data)
                if (data.type === 'pong' && data.id === pingId) {
                  clearTimeout(timeout)
                  channel.removeEventListener('message', handlePong)
                  resolve({ success: true, latency: Date.now() - startTime })
                }
              } catch (error) {
                // Ignore parsing errors
              }
            }
            
            channel.addEventListener('message', handlePong)
            channel.send(pingMessage)
          })
        }
      }
      
      // Fallback to libp2p ping if available
      if (this.p2pManager && this.p2pManager.libp2p) {
        // Simplified ping - in real implementation would use libp2p ping service
        const connections = this.p2pManager.libp2p.getConnections()
        const connection = connections.find((conn: any) => conn.remotePeer.toString() === peerId)
        
        if (connection && connection.status === 'open') {
          return { success: true, latency: Date.now() - startTime }
        }
      }
      
      return { success: false }
    } catch (error) {
      console.error('Ping failed for peer:', peerId, error)
      return { success: false }
    }
  }

  // Calculate connection quality based on metrics
  private calculateConnectionQuality(health: ConnectionHealth): 'excellent' | 'good' | 'poor' | 'critical' {
    if (health.consecutiveFailures > 0) {
      return 'critical'
    }
    
    if (health.packetLoss > 0.3 || health.latency > 2000) {
      return 'poor'
    }
    
    if (health.packetLoss > 0.1 || health.latency > 1000) {
      return 'good'
    }
    
    return 'excellent'
  }

  // Create initial health record for new peer
  private createInitialHealth(peerId: string): ConnectionHealth {
    return {
      peerId,
      lastSeen: new Date(),
      latency: 0,
      packetLoss: 0,
      connectionQuality: 'good',
      consecutiveFailures: 0,
      isHealthy: true
    }
  }

  // Analyze overall network health and detect partitions
  private async analyzeNetworkHealth(): Promise<void> {
    const allPeers = Array.from(this.peerHealth.values())
    const healthyPeers = allPeers.filter(peer => peer.isHealthy)
    const unhealthyPeers = allPeers.filter(peer => !peer.isHealthy)
    
    const healthyRatio = allPeers.length > 0 ? healthyPeers.length / allPeers.length : 1
    
    // Detect network partition
    if (healthyRatio < (1 - this.config.partitionDetectionThreshold) && allPeers.length > 2) {
      if (!this.networkPartition) {
        this.networkPartition = {
          detected: true,
          partitionSize: healthyPeers.length,
          isolatedPeers: unhealthyPeers.map(peer => peer.peerId),
          detectedAt: new Date()
        }
        
        console.warn('Network partition detected:', this.networkPartition)
        this.emit('networkPartitionDetected', this.networkPartition)
        
        // Start partition recovery
        await this.recoverFromNetworkPartition()
      }
    } else if (this.networkPartition && healthyRatio > 0.8) {
      // Network partition recovered
      this.networkPartition.recoveredAt = new Date()
      console.log('Network partition recovered:', this.networkPartition)
      this.emit('networkPartitionRecovered', this.networkPartition)
      this.networkPartition = null
    }
    
    // Emit network health status
    this.emit('networkHealthUpdate', {
      totalPeers: allPeers.length,
      healthyPeers: healthyPeers.length,
      unhealthyPeers: unhealthyPeers.length,
      healthyRatio,
      partition: this.networkPartition
    })
  }

  // Trigger recovery mechanisms if needed
  private async triggerRecoveryIfNeeded(): Promise<void> {
    const healthyPeers = Array.from(this.peerHealth.values()).filter(peer => peer.isHealthy)
    const unhealthyPeers = Array.from(this.peerHealth.values()).filter(peer => !peer.isHealthy)
    
    // Check if we need more healthy peers
    if (healthyPeers.length < this.config.minHealthyPeers) {
      console.log('Insufficient healthy peers, triggering peer discovery')
      await this.discoverAndConnectNewPeers()
    }
    
    // Check if we have too many unhealthy peers
    if (unhealthyPeers.length > this.config.maxUnhealthyPeers && this.config.enablePeerReplacement) {
      console.log('Too many unhealthy peers, triggering peer replacement')
      await this.replaceUnhealthyPeers(unhealthyPeers.slice(0, this.config.maxUnhealthyPeers))
    }
  }

  // Recover individual peer connection with exponential backoff
  async recoverPeerConnection(peerId: string): Promise<boolean> {
    const currentAttempts = this.reconnectAttempts.get(peerId) || 0
    
    if (currentAttempts >= this.config.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached for peer:', peerId)
      this.emit('peerRecoveryFailed', peerId, 'max_attempts_reached')
      return false
    }

    // Clear existing timer
    const existingTimer = this.reconnectTimers.get(peerId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.config.initialReconnectDelay * Math.pow(this.config.backoffMultiplier, currentAttempts),
      this.config.maxReconnectDelay
    )

    console.log(`Scheduling reconnection attempt ${currentAttempts + 1} for peer ${peerId} in ${delay}ms`)
    
    const timer = setTimeout(async () => {
      try {
        this.reconnectAttempts.set(peerId, currentAttempts + 1)
        
        // Attempt reconnection
        console.log(`Attempting to reconnect to peer: ${peerId} (attempt ${currentAttempts + 1})`)
        
        // Close existing connection first
        if (this.webrtcManager) {
          await this.webrtcManager.closeConnection(peerId)
        }
        
        // Wait a bit before reconnecting
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Attempt new connection
        if (this.p2pManager) {
          await this.p2pManager.connectToPeer(peerId)
        }
        
        // Reset attempts on success
        this.reconnectAttempts.delete(peerId)
        this.reconnectTimers.delete(peerId)
        
        console.log('Successfully reconnected to peer:', peerId)
        this.emit('peerRecovered', peerId)
        
      } catch (error) {
        console.error('Reconnection attempt failed for peer:', peerId, error)
        this.emit('peerRecoveryAttemptFailed', peerId, error)
        
        // Schedule next attempt
        await this.recoverPeerConnection(peerId)
      }
    }, delay)

    this.reconnectTimers.set(peerId, timer)
    return true
  }

  // Discover and connect to new peers
  private async discoverAndConnectNewPeers(): Promise<void> {
    try {
      if (!this.dhtDiscovery) {
        console.warn('DHT Discovery not available for peer discovery')
        return
      }

      // Use basic discovery criteria
      const criteria = {
        geohash: '12345', // Default geohash - should be configurable
        ageRange: [18, 99] as [number, number],
        interests: [],
        maxDistance: 50000 // 50km
      }

      const discoveredPeers = await this.dhtDiscovery.findPeers('general')
      console.log('Discovered', discoveredPeers.length, 'new peers for connection')

      // Connect to discovered peers
      const connectionPromises = discoveredPeers
        .filter((peer: any) => !this.peerHealth.has(peer.id))
        .slice(0, this.config.minHealthyPeers)
        .map(async (peer: any) => {
          try {
            if (this.p2pManager) {
              await this.p2pManager.connectToPeer(peer.id)
              console.log('Connected to new peer:', peer.id)
            }
          } catch (error) {
            console.warn('Failed to connect to discovered peer:', peer.id, error)
          }
        })

      await Promise.allSettled(connectionPromises)
    } catch (error) {
      console.error('Peer discovery failed:', error)
      this.emit('peerDiscoveryFailed', error)
    }
  }

  // Replace unhealthy peers with new ones
  private async replaceUnhealthyPeers(unhealthyPeers: ConnectionHealth[]): Promise<void> {
    console.log('Replacing', unhealthyPeers.length, 'unhealthy peers')
    
    // Disconnect unhealthy peers
    const disconnectPromises = unhealthyPeers.map(async (peer) => {
      try {
        if (this.webrtcManager) {
          await this.webrtcManager.closeConnection(peer.peerId)
        }
        this.peerHealth.delete(peer.peerId)
        this.reconnectAttempts.delete(peer.peerId)
        
        const timer = this.reconnectTimers.get(peer.peerId)
        if (timer) {
          clearTimeout(timer)
          this.reconnectTimers.delete(peer.peerId)
        }
        
        console.log('Disconnected unhealthy peer:', peer.peerId)
      } catch (error) {
        console.warn('Failed to disconnect unhealthy peer:', peer.peerId, error)
      }
    })

    await Promise.allSettled(disconnectPromises)
    
    // Discover and connect to new peers
    await this.discoverAndConnectNewPeers()
  }

  // Recover from network partition
  private async recoverFromNetworkPartition(): Promise<void> {
    if (this.isRecovering) {
      return
    }

    this.isRecovering = true
    console.log('Starting network partition recovery')

    try {
      // Strategy 1: Try to reconnect to bootstrap nodes
      if (this.config.enableBootstrapFallback) {
        await this.connectToBootstrapNodes()
      }

      // Strategy 2: Aggressive peer discovery
      await this.discoverAndConnectNewPeers()

      // Strategy 3: Reset DHT connections
      if (this.dhtDiscovery) {
        try {
          // Rejoin DHT network
          await this.dhtDiscovery.join(['general', 'recovery'])
          console.log('Rejoined DHT network for partition recovery')
        } catch (error) {
          console.warn('Failed to rejoin DHT network:', error)
        }
      }

      // Wait for recovery timeout
      setTimeout(() => {
        if (this.networkPartition && !this.networkPartition.recoveredAt) {
          console.warn('Network partition recovery timeout reached')
          this.emit('networkPartitionRecoveryTimeout', this.networkPartition)
        }
        this.isRecovering = false
      }, this.config.partitionRecoveryTimeout)

    } catch (error) {
      console.error('Network partition recovery failed:', error)
      this.emit('networkPartitionRecoveryFailed', error)
      this.isRecovering = false
    }
  }

  // Connect to bootstrap nodes as fallback
  private async connectToBootstrapNodes(): Promise<void> {
    console.log('Connecting to bootstrap nodes for recovery')
    
    const connectionPromises = this.config.bootstrapNodes.map(async (bootstrapNode) => {
      try {
        // Extract peer ID from multiaddr (simplified)
        const peerId = bootstrapNode.split('/').pop()
        if (peerId && this.p2pManager) {
          await this.p2pManager.connectToPeer(peerId)
          console.log('Connected to bootstrap node:', peerId)
        }
      } catch (error) {
        console.warn('Failed to connect to bootstrap node:', bootstrapNode, error)
      }
    })

    await Promise.allSettled(connectionPromises)
  }

  // Setup event listeners for P2P events
  private setupEventListeners(): void {
    // Listen for WebRTC connection state changes
    if (this.webrtcManager) {
      this.webrtcManager.onConnectionStateChange((peerId: string, state: RTCPeerConnectionState) => {
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          console.log('WebRTC connection lost for peer:', peerId, state)
          this.handlePeerDisconnection(peerId)
        } else if (state === 'connected') {
          console.log('WebRTC connection established for peer:', peerId)
          this.handlePeerConnection(peerId)
        }
      })
    }
  }

  // Handle peer connection events
  private handlePeerConnection(peerId: string): void {
    // Reset health status for reconnected peer
    const health = this.peerHealth.get(peerId) || this.createInitialHealth(peerId)
    health.isHealthy = true
    health.consecutiveFailures = 0
    health.lastSeen = new Date()
    this.peerHealth.set(peerId, health)
    
    // Clear reconnection attempts
    this.reconnectAttempts.delete(peerId)
    const timer = this.reconnectTimers.get(peerId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(peerId)
    }
    
    this.emit('peerConnected', peerId)
  }

  // Handle peer disconnection events
  private handlePeerDisconnection(peerId: string): void {
    const health = this.peerHealth.get(peerId)
    if (health) {
      health.isHealthy = false
      health.consecutiveFailures++
      this.peerHealth.set(peerId, health)
    }
    
    this.emit('peerDisconnected', peerId)
    
    // Trigger recovery
    this.recoverPeerConnection(peerId)
  }

  // Get current network health status
  getNetworkHealth(): {
    totalPeers: number
    healthyPeers: number
    unhealthyPeers: number
    healthyRatio: number
    partition: NetworkPartition | null
    peerHealth: ConnectionHealth[]
  } {
    const allPeers = Array.from(this.peerHealth.values())
    const healthyPeers = allPeers.filter(peer => peer.isHealthy)
    const unhealthyPeers = allPeers.filter(peer => !peer.isHealthy)
    
    return {
      totalPeers: allPeers.length,
      healthyPeers: healthyPeers.length,
      unhealthyPeers: unhealthyPeers.length,
      healthyRatio: allPeers.length > 0 ? healthyPeers.length / allPeers.length : 1,
      partition: this.networkPartition,
      peerHealth: allPeers
    }
  }

  // Get peer health information
  getPeerHealth(peerId: string): ConnectionHealth | null {
    return this.peerHealth.get(peerId) || null
  }

  // Force recovery for specific peer
  async forcePeerRecovery(peerId: string): Promise<boolean> {
    console.log('Forcing recovery for peer:', peerId)
    
    // Reset attempts counter
    this.reconnectAttempts.delete(peerId)
    
    // Clear existing timer
    const timer = this.reconnectTimers.get(peerId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(peerId)
    }
    
    return await this.recoverPeerConnection(peerId)
  }

  // Force network recovery
  async forceNetworkRecovery(): Promise<void> {
    console.log('Forcing network recovery')
    this.isRecovering = false // Reset recovery flag
    await this.recoverFromNetworkPartition()
  }

  // Cleanup and destroy
  destroy(): void {
    console.log('Destroying Connection Recovery Manager')
    
    // Clear health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    
    // Clear all reconnection timers
    this.reconnectTimers.forEach(timer => clearTimeout(timer))
    this.reconnectTimers.clear()
    
    // Clear all data
    this.peerHealth.clear()
    this.reconnectAttempts.clear()
    this.networkPartition = null
    this.isRecovering = false
    
    // Remove all listeners
    this.removeAllListeners()
    
    console.log('Connection Recovery Manager destroyed')
  }
}