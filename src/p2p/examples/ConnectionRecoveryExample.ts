import { ConnectionRecoveryManager, ConnectionHealth, NetworkPartition } from '../ConnectionRecoveryManager'
import { P2PManager } from '../P2PManager'
import { WebRTCManager } from '../WebRTCManager'

/**
 * Example demonstrating Connection Recovery Manager usage
 * 
 * This example shows how to:
 * 1. Initialize connection recovery with P2P components
 * 2. Monitor network health and peer status
 * 3. Handle various network failure scenarios
 * 4. Implement custom recovery strategies
 * 5. Monitor recovery events and metrics
 */

export class ConnectionRecoveryExample {
  private recoveryManager: ConnectionRecoveryManager
  private p2pManager: P2PManager
  private webrtcManager: WebRTCManager
  private isRunning = false
  
  // Metrics tracking
  private metrics = {
    totalRecoveryAttempts: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    partitionsDetected: 0,
    partitionsRecovered: 0,
    peersReplaced: 0
  }

  constructor() {
    // Initialize P2P components
    this.p2pManager = new P2PManager({
      maxPeers: 20,
      discoveryInterval: 30000,
      reconnectInterval: 5000,
      maxRetries: 3
    })
    
    this.webrtcManager = new WebRTCManager([
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302'
    ])
    
    // Initialize recovery manager with custom configuration
    this.recoveryManager = new ConnectionRecoveryManager({
      // Health monitoring configuration
      healthCheckInterval: 15000, // Check every 15 seconds
      healthCheckTimeout: 3000,   // 3 second timeout for health checks
      maxConsecutiveFailures: 3,  // Mark peer unhealthy after 3 failures
      
      // Reconnection configuration
      maxReconnectAttempts: 5,    // Try up to 5 times
      initialReconnectDelay: 2000, // Start with 2 second delay
      maxReconnectDelay: 120000,  // Max 2 minute delay
      backoffMultiplier: 1.5,     // Moderate exponential backoff
      
      // Peer management configuration
      enablePeerReplacement: true,
      minHealthyPeers: 5,         // Maintain at least 5 healthy peers
      maxUnhealthyPeers: 3,       // Replace peers if more than 3 are unhealthy
      
      // Network partition detection
      partitionDetectionThreshold: 0.7, // Detect partition if 70% peers lost
      partitionRecoveryTimeout: 300000,  // 5 minute recovery timeout
      
      // Bootstrap fallback
      bootstrapNodes: [
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
      ],
      enableBootstrapFallback: true
    })
  }

  /**
   * Initialize and start the connection recovery system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Connection recovery example already running')
      return
    }

    try {
      console.log('🚀 Starting Connection Recovery Example...')
      
      // Initialize P2P components
      await this.p2pManager.initialize()
      await this.p2pManager.connect()
      
      // Initialize recovery manager with dependencies
      this.recoveryManager.initialize(
        this.p2pManager,
        this.webrtcManager,
        this.p2pManager.getDHTDiscovery()!
      )
      
      // Setup event listeners
      this.setupEventListeners()
      
      // Start monitoring
      this.startNetworkMonitoring()
      
      this.isRunning = true
      console.log('✅ Connection Recovery Example started successfully')
      
      // Demonstrate various scenarios
      await this.demonstrateRecoveryScenarios()
      
    } catch (error) {
      console.error('❌ Failed to start Connection Recovery Example:', error)
      throw error
    }
  }

  /**
   * Setup event listeners for recovery events
   */
  private setupEventListeners(): void {
    console.log('📡 Setting up recovery event listeners...')
    
    // Network health monitoring
    this.recoveryManager.on('networkHealthUpdate', (health) => {
      console.log('📊 Network Health Update:', {
        totalPeers: health.totalPeers,
        healthyPeers: health.healthyPeers,
        unhealthyPeers: health.unhealthyPeers,
        healthyRatio: `${(health.healthyRatio * 100).toFixed(1)}%`,
        partition: health.partition ? 'DETECTED' : 'None'
      })
    })
    
    // Peer health events
    this.recoveryManager.on('peerHealthy', (peerId: string, health: ConnectionHealth) => {
      console.log(`✅ Peer ${peerId} is healthy:`, {
        latency: `${health.latency}ms`,
        quality: health.connectionQuality,
        packetLoss: `${(health.packetLoss * 100).toFixed(1)}%`
      })
    })
    
    this.recoveryManager.on('peerUnhealthy', (peerId: string, health: ConnectionHealth) => {
      console.log(`⚠️ Peer ${peerId} is unhealthy:`, {
        consecutiveFailures: health.consecutiveFailures,
        quality: health.connectionQuality,
        lastSeen: health.lastSeen.toISOString()
      })
    })
    
    // Recovery events
    this.recoveryManager.on('peerRecovered', (peerId: string) => {
      console.log(`🔄 Peer ${peerId} recovered successfully`)
      this.metrics.successfulRecoveries++
    })
    
    this.recoveryManager.on('peerRecoveryFailed', (peerId: string, reason: string) => {
      console.log(`❌ Peer ${peerId} recovery failed: ${reason}`)
      this.metrics.failedRecoveries++
    })
    
    this.recoveryManager.on('peerRecoveryAttemptFailed', (peerId: string, error: Error) => {
      console.log(`🔄 Peer ${peerId} recovery attempt failed: ${error.message}`)
      this.metrics.totalRecoveryAttempts++
    })
    
    // Network partition events
    this.recoveryManager.on('networkPartitionDetected', (partition: NetworkPartition) => {
      console.log('🚨 Network partition detected:', {
        partitionSize: partition.partitionSize,
        isolatedPeers: partition.isolatedPeers.length,
        detectedAt: partition.detectedAt.toISOString()
      })
      this.metrics.partitionsDetected++
    })
    
    this.recoveryManager.on('networkPartitionRecovered', (partition: NetworkPartition) => {
      console.log('🎉 Network partition recovered:', {
        duration: partition.recoveredAt 
          ? `${partition.recoveredAt.getTime() - partition.detectedAt.getTime()}ms`
          : 'Unknown',
        recoveredAt: partition.recoveredAt?.toISOString()
      })
      this.metrics.partitionsRecovered++
    })
    
    // Connection events
    this.recoveryManager.on('peerConnected', (peerId: string) => {
      console.log(`🔗 Peer ${peerId} connected`)
    })
    
    this.recoveryManager.on('peerDisconnected', (peerId: string) => {
      console.log(`🔌 Peer ${peerId} disconnected`)
    })
    
    // Error events
    this.recoveryManager.on('healthCheckError', (error: Error) => {
      console.error('❌ Health check error:', error.message)
    })
    
    this.recoveryManager.on('peerDiscoveryFailed', (error: Error) => {
      console.error('❌ Peer discovery failed:', error.message)
    })
    
    this.recoveryManager.on('networkPartitionRecoveryFailed', (error: Error) => {
      console.error('❌ Network partition recovery failed:', error.message)
    })
  }

  /**
   * Start continuous network monitoring
   */
  private startNetworkMonitoring(): void {
    console.log('📈 Starting network monitoring...')
    
    // Monitor network health every 30 seconds
    setInterval(() => {
      this.logNetworkStatus()
    }, 30000)
    
    // Log recovery metrics every minute
    setInterval(() => {
      this.logRecoveryMetrics()
    }, 60000)
  }

  /**
   * Log current network status
   */
  private logNetworkStatus(): void {
    const networkHealth = this.recoveryManager.getNetworkHealth()
    const p2pStatus = this.p2pManager.getNetworkStatus()
    
    console.log('📊 Network Status Report:', {
      timestamp: new Date().toISOString(),
      p2pConnected: p2pStatus.connected,
      totalPeers: networkHealth.totalPeers,
      healthyPeers: networkHealth.healthyPeers,
      unhealthyPeers: networkHealth.unhealthyPeers,
      healthyRatio: `${(networkHealth.healthyRatio * 100).toFixed(1)}%`,
      dhtConnected: p2pStatus.dhtConnected,
      averageLatency: `${p2pStatus.latency}ms`,
      partition: networkHealth.partition ? 'ACTIVE' : 'None'
    })
  }

  /**
   * Log recovery metrics
   */
  private logRecoveryMetrics(): void {
    console.log('📈 Recovery Metrics:', {
      timestamp: new Date().toISOString(),
      totalRecoveryAttempts: this.metrics.totalRecoveryAttempts,
      successfulRecoveries: this.metrics.successfulRecoveries,
      failedRecoveries: this.metrics.failedRecoveries,
      successRate: this.metrics.totalRecoveryAttempts > 0 
        ? `${((this.metrics.successfulRecoveries / this.metrics.totalRecoveryAttempts) * 100).toFixed(1)}%`
        : 'N/A',
      partitionsDetected: this.metrics.partitionsDetected,
      partitionsRecovered: this.metrics.partitionsRecovered,
      peersReplaced: this.metrics.peersReplaced
    })
  }

  /**
   * Demonstrate various recovery scenarios
   */
  private async demonstrateRecoveryScenarios(): Promise<void> {
    console.log('🎭 Demonstrating recovery scenarios...')
    
    // Wait for initial connections
    await this.waitForConnections(3)
    
    // Scenario 1: Single peer recovery
    await this.demonstrateSinglePeerRecovery()
    
    // Wait between scenarios
    await this.sleep(10000)
    
    // Scenario 2: Multiple peer failures
    await this.demonstrateMultiplePeerFailures()
    
    // Wait between scenarios
    await this.sleep(15000)
    
    // Scenario 3: Force network recovery
    await this.demonstrateNetworkRecovery()
  }

  /**
   * Demonstrate single peer recovery
   */
  private async demonstrateSinglePeerRecovery(): Promise<void> {
    console.log('🔄 Demonstrating single peer recovery...')
    
    const connectedPeers = this.p2pManager.getConnectedPeers()
    if (connectedPeers.length === 0) {
      console.log('⚠️ No connected peers to demonstrate recovery')
      return
    }
    
    const targetPeer = connectedPeers[0]
    console.log(`🎯 Targeting peer ${targetPeer} for recovery demonstration`)
    
    // Force peer recovery
    const recoveryResult = await this.recoveryManager.forcePeerRecovery(targetPeer)
    console.log(`🔄 Recovery initiated for ${targetPeer}: ${recoveryResult}`)
    
    // Monitor recovery progress
    const startTime = Date.now()
    const maxWaitTime = 30000 // 30 seconds
    
    while (Date.now() - startTime < maxWaitTime) {
      const health = this.recoveryManager.getPeerHealth(targetPeer)
      if (health?.isHealthy) {
        console.log(`✅ Peer ${targetPeer} recovery completed in ${Date.now() - startTime}ms`)
        break
      }
      await this.sleep(1000)
    }
  }

  /**
   * Demonstrate multiple peer failure handling
   */
  private async demonstrateMultiplePeerFailures(): Promise<void> {
    console.log('🔄 Demonstrating multiple peer failure handling...')
    
    const connectedPeers = this.p2pManager.getConnectedPeers()
    const targetPeers = connectedPeers.slice(0, Math.min(3, connectedPeers.length))
    
    if (targetPeers.length === 0) {
      console.log('⚠️ No connected peers to demonstrate multiple failures')
      return
    }
    
    console.log(`🎯 Simulating failures for peers: ${targetPeers.join(', ')}`)
    
    // Simulate multiple peer failures
    const recoveryPromises = targetPeers.map(peerId => 
      this.recoveryManager.forcePeerRecovery(peerId)
    )
    
    const results = await Promise.all(recoveryPromises)
    console.log('🔄 Multiple recovery results:', results)
    
    // Monitor overall recovery
    const startTime = Date.now()
    const maxWaitTime = 60000 // 60 seconds
    
    while (Date.now() - startTime < maxWaitTime) {
      const networkHealth = this.recoveryManager.getNetworkHealth()
      const healthyRatio = networkHealth.healthyRatio
      
      console.log(`📊 Recovery progress: ${(healthyRatio * 100).toFixed(1)}% healthy peers`)
      
      if (healthyRatio > 0.8) { // 80% healthy
        console.log(`✅ Multiple peer recovery completed in ${Date.now() - startTime}ms`)
        break
      }
      
      await this.sleep(2000)
    }
  }

  /**
   * Demonstrate network recovery
   */
  private async demonstrateNetworkRecovery(): Promise<void> {
    console.log('🌐 Demonstrating network recovery...')
    
    // Force network recovery
    await this.recoveryManager.forceNetworkRecovery()
    console.log('🔄 Network recovery initiated')
    
    // Monitor network recovery progress
    const startTime = Date.now()
    const maxWaitTime = 120000 // 2 minutes
    
    while (Date.now() - startTime < maxWaitTime) {
      const networkHealth = this.recoveryManager.getNetworkHealth()
      const p2pStatus = this.p2pManager.getNetworkStatus()
      
      console.log(`🌐 Network recovery progress:`, {
        connected: p2pStatus.connected,
        peerCount: p2pStatus.peerCount,
        dhtConnected: p2pStatus.dhtConnected,
        healthyPeers: networkHealth.healthyPeers
      })
      
      if (p2pStatus.connected && p2pStatus.peerCount >= 3 && networkHealth.healthyPeers >= 2) {
        console.log(`✅ Network recovery completed in ${Date.now() - startTime}ms`)
        break
      }
      
      await this.sleep(5000)
    }
  }

  /**
   * Wait for minimum number of connections
   */
  private async waitForConnections(minConnections: number, timeout = 60000): Promise<void> {
    console.log(`⏳ Waiting for ${minConnections} connections...`)
    
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      const connectedPeers = this.p2pManager.getConnectedPeers()
      
      if (connectedPeers.length >= minConnections) {
        console.log(`✅ ${connectedPeers.length} connections established`)
        return
      }
      
      console.log(`⏳ Current connections: ${connectedPeers.length}/${minConnections}`)
      await this.sleep(2000)
    }
    
    console.log(`⚠️ Timeout waiting for connections`)
  }

  /**
   * Get current recovery statistics
   */
  getRecoveryStats(): any {
    const networkHealth = this.recoveryManager.getNetworkHealth()
    
    return {
      networkHealth,
      metrics: { ...this.metrics },
      isRunning: this.isRunning,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Manually trigger peer recovery
   */
  async triggerPeerRecovery(peerId: string): Promise<boolean> {
    console.log(`🔄 Manually triggering recovery for peer: ${peerId}`)
    return await this.recoveryManager.forcePeerRecovery(peerId)
  }

  /**
   * Manually trigger network recovery
   */
  async triggerNetworkRecovery(): Promise<void> {
    console.log('🌐 Manually triggering network recovery')
    await this.recoveryManager.forceNetworkRecovery()
  }

  /**
   * Stop the connection recovery example
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Connection recovery example not running')
      return
    }

    try {
      console.log('🛑 Stopping Connection Recovery Example...')
      
      // Cleanup recovery manager
      this.recoveryManager.destroy()
      
      // Cleanup P2P components
      await this.p2pManager.disconnect()
      this.webrtcManager.destroy()
      
      this.isRunning = false
      console.log('✅ Connection Recovery Example stopped')
      
      // Final metrics report
      console.log('📊 Final Recovery Metrics:', this.metrics)
      
    } catch (error) {
      console.error('❌ Error stopping Connection Recovery Example:', error)
      throw error
    }
  }

  /**
   * Utility function to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Example usage
export async function runConnectionRecoveryExample(): Promise<void> {
  const example = new ConnectionRecoveryExample()
  
  try {
    await example.start()
    
    // Run for 5 minutes
    console.log('🕐 Running example for 5 minutes...')
    await new Promise(resolve => setTimeout(resolve, 300000))
    
    // Get final stats
    const stats = example.getRecoveryStats()
    console.log('📊 Final Statistics:', JSON.stringify(stats, null, 2))
    
  } catch (error) {
    console.error('❌ Example failed:', error)
  } finally {
    await example.stop()
  }
}

// Run example if called directly
if (require.main === module) {
  runConnectionRecoveryExample().catch(console.error)
}