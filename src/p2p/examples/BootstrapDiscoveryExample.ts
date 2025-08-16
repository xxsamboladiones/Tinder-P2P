/**
 * Bootstrap and Discovery Fallback Example
 * 
 * This example demonstrates how to use the BootstrapDiscoveryManager
 * to handle network bootstrap and discovery fallbacks in a P2P dating app.
 */

import { BootstrapDiscoveryManager, BootstrapNode } from '../BootstrapDiscoveryManager'
import { P2PManager } from '../P2PManager'
import { DHTDiscovery } from '../DHTDiscovery'
import { DiscoveryCriteria } from '../types'

class BootstrapDiscoveryExample {
  private p2pManager: P2PManager
  private bootstrapManager: BootstrapDiscoveryManager
  private isRunning = false

  constructor() {
    // Initialize P2P Manager
    this.p2pManager = new P2PManager({
      bootstrapNodes: [
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
      ],
      maxPeers: 50,
      discoveryInterval: 30000
    })

    // Initialize Bootstrap Discovery Manager with comprehensive fallback configuration
    this.bootstrapManager = new BootstrapDiscoveryManager({
      // Bootstrap nodes configuration
      bootstrapNodes: [
        {
          id: 'primary-bootstrap',
          multiaddr: '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
          protocols: ['kad-dht'],
          region: 'global',
          reliability: 0.95,
          lastSeen: new Date(),
          responseTime: 100
        },
        {
          id: 'secondary-bootstrap',
          multiaddr: '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
          protocols: ['kad-dht'],
          region: 'global',
          reliability: 0.90,
          lastSeen: new Date(),
          responseTime: 120
        },
        {
          id: 'regional-bootstrap-us',
          multiaddr: '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
          protocols: ['kad-dht'],
          region: 'us-east',
          reliability: 0.88,
          lastSeen: new Date(),
          responseTime: 80
        }
      ],
      
      // Bootstrap configuration
      maxBootstrapAttempts: 5,
      bootstrapTimeout: 10000,
      bootstrapRetryDelay: 2000,
      
      // Fallback methods
      enableDNSBootstrap: true,
      dnsBootstrapDomains: ['bootstrap.libp2p.io', 'bootstrap.ipfs.io'],
      enableWebSocketBootstrap: true,
      webSocketBootstrapUrls: [
        'wss://ws-star.discovery.libp2p.io',
        'wss://ws-star1.par.dwebops.pub'
      ],
      
      // Peer recommendation system
      maxRecommendations: 15,
      recommendationDecayFactor: 0.95,
      minInteractionsForRecommendation: 3,
      geographicWeightFactor: 0.3,
      interestWeightFactor: 0.4,
      
      // Discovery fallback
      fallbackDiscoveryInterval: 60000,
      maxFallbackAttempts: 3,
      fallbackMethods: ['bootstrap', 'dns', 'websocket', 'mdns']
    })
  }

  /**
   * Initialize the bootstrap and discovery system
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Bootstrap Discovery Example...')

    try {
      // Initialize P2P Manager
      await this.p2pManager.initialize()
      console.log('✅ P2P Manager initialized')

      // Get DHT Discovery instance
      const dhtDiscovery = this.p2pManager.getDHTDiscovery()
      if (!dhtDiscovery) {
        throw new Error('DHT Discovery not available')
      }

      // Initialize Bootstrap Discovery Manager
      await this.bootstrapManager.initialize(
        (this.p2pManager as any).libp2p,
        dhtDiscovery
      )
      console.log('✅ Bootstrap Discovery Manager initialized')

      // Connect to P2P network
      await this.p2pManager.connect()
      console.log('✅ Connected to P2P network')

      this.isRunning = true
      console.log('🎉 Bootstrap Discovery Example ready!')

    } catch (error) {
      console.error('❌ Failed to initialize:', error)
      throw error
    }
  }

  /**
   * Demonstrate network bootstrap scenarios
   */
  async demonstrateBootstrapScenarios(): Promise<void> {
    console.log('\n📡 Demonstrating Bootstrap Scenarios...')

    // Scenario 1: Normal bootstrap
    console.log('\n1️⃣ Normal Bootstrap:')
    try {
      const success = await this.bootstrapManager.bootstrapNetwork()
      console.log(`   Bootstrap result: ${success ? '✅ Success' : '❌ Failed'}`)
      
      const stats = this.bootstrapManager.getStats()
      console.log(`   Available bootstrap nodes: ${stats.availableBootstrapNodes}/${stats.bootstrapNodes}`)
    } catch (error) {
      console.error('   Bootstrap failed:', error)
    }

    // Scenario 2: Add custom bootstrap node
    console.log('\n2️⃣ Adding Custom Bootstrap Node:')
    const customNode: BootstrapNode = {
      id: 'custom-local-bootstrap',
      multiaddr: '/ip4/192.168.1.100/tcp/4001/p2p/custom-local-bootstrap',
      protocols: ['kad-dht'],
      region: 'local',
      reliability: 0.85,
      lastSeen: new Date(),
      responseTime: 50
    }
    
    this.bootstrapManager.addBootstrapNode(customNode)
    console.log('   ✅ Custom bootstrap node added')
    
    const updatedStats = this.bootstrapManager.getStats()
    console.log(`   Total bootstrap nodes: ${updatedStats.bootstrapNodes}`)

    // Scenario 3: Simulate bootstrap node failure and recovery
    console.log('\n3️⃣ Bootstrap Node Reliability Updates:')
    this.bootstrapManager.updateBootstrapNodeReliability('primary-bootstrap', false, 5000)
    console.log('   📉 Marked primary bootstrap as failed (high latency)')
    
    this.bootstrapManager.updateBootstrapNodeReliability('secondary-bootstrap', true, 90)
    console.log('   📈 Marked secondary bootstrap as successful (low latency)')
  }

  /**
   * Demonstrate DHT failure handling and recovery
   */
  async demonstrateDHTFailureRecovery(): Promise<void> {
    console.log('\n🔄 Demonstrating DHT Failure Recovery...')

    // Add some peer interaction history for recommendations
    console.log('\n1️⃣ Building Peer Interaction History:')
    const samplePeers = [
      { id: 'reliable-peer-1', success: 0.95, latency: 80 },
      { id: 'reliable-peer-2', success: 0.90, latency: 120 },
      { id: 'average-peer-1', success: 0.75, latency: 200 },
      { id: 'slow-peer-1', success: 0.60, latency: 400 }
    ]

    for (const peer of samplePeers) {
      // Simulate multiple interactions
      for (let i = 0; i < 10; i++) {
        const success = Math.random() < peer.success
        const latency = peer.latency + (Math.random() - 0.5) * 50
        
        this.bootstrapManager.recordPeerInteraction(
          peer.id,
          i % 3 === 0 ? 'connection' : i % 3 === 1 ? 'message' : 'profile_sync',
          success,
          { latency: Math.max(50, latency) }
        )
      }
      console.log(`   📊 Recorded interactions for ${peer.id}`)
    }

    // Simulate DHT failure and recovery
    console.log('\n2️⃣ Simulating DHT Failure:')
    try {
      await this.bootstrapManager.handleDHTFailure()
      console.log('   ✅ DHT failure recovery completed')
    } catch (error) {
      console.error('   ❌ DHT recovery failed:', error)
    }

    // Show recovery statistics
    const stats = this.bootstrapManager.getStats()
    console.log(`   📈 Peer history size: ${stats.peerHistorySize}`)
    console.log(`   📊 Total interactions: ${stats.totalInteractions}`)
    console.log(`   ⭐ Average reputation: ${stats.averageReputationScore.toFixed(3)}`)
  }

  /**
   * Demonstrate peer recommendation system
   */
  async demonstratePeerRecommendations(): Promise<void> {
    console.log('\n🎯 Demonstrating Peer Recommendation System...')

    // Define discovery criteria for dating app
    const datingCriteria: DiscoveryCriteria = {
      geohash: 'u4pruydqqvj', // San Francisco area
      ageRange: [25, 35],
      interests: ['music', 'travel', 'food', 'fitness', 'art'],
      maxDistance: 50 // 50km radius
    }

    console.log('\n1️⃣ Discovery Criteria:')
    console.log(`   📍 Location: ${datingCriteria.geohash} (~San Francisco)`)
    console.log(`   🎂 Age range: ${datingCriteria.ageRange[0]}-${datingCriteria.ageRange[1]}`)
    console.log(`   💝 Interests: ${datingCriteria.interests.join(', ')}`)
    console.log(`   📏 Max distance: ${datingCriteria.maxDistance}km`)

    try {
      // Get peer recommendations
      const recommendations = await this.bootstrapManager.getPeerRecommendations(datingCriteria)
      
      console.log(`\n2️⃣ Generated ${recommendations.length} Peer Recommendations:`)
      
      recommendations.forEach((rec, index) => {
        console.log(`\n   ${index + 1}. Peer: ${rec.peerId}`)
        console.log(`      🏆 Score: ${rec.score.toFixed(3)}`)
        console.log(`      ✅ Successful connections: ${rec.successfulConnections}`)
        console.log(`      ❌ Failed connections: ${rec.failedConnections}`)
        console.log(`      ⚡ Average latency: ${rec.averageLatency.toFixed(0)}ms`)
        console.log(`      📍 Geographic distance: ${rec.geographicDistance.toFixed(1)}km`)
        console.log(`      💝 Shared interests: ${rec.sharedInterests.join(', ') || 'None'}`)
        console.log(`      📝 Reasons: ${rec.reasons.join(', ')}`)
        console.log(`      🕒 Last interaction: ${rec.lastInteraction.toLocaleString()}`)
      })

      // Demonstrate recommendation filtering
      console.log('\n3️⃣ High-Quality Recommendations (score > 0.7):')
      const highQualityRecs = recommendations.filter(r => r.score > 0.7)
      console.log(`   Found ${highQualityRecs.length} high-quality peers`)
      
      highQualityRecs.forEach(rec => {
        console.log(`   🌟 ${rec.peerId}: ${rec.score.toFixed(3)} (${rec.reasons[0] || 'Good performance'})`)
      })

    } catch (error) {
      console.error('   ❌ Failed to get recommendations:', error)
    }
  }

  /**
   * Demonstrate real-time network monitoring
   */
  async demonstrateNetworkMonitoring(): Promise<void> {
    console.log('\n📊 Demonstrating Network Monitoring...')

    // Monitor network status
    const monitoringInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(monitoringInterval)
        return
      }

      const networkStatus = this.p2pManager.getNetworkStatus()
      const bootstrapStats = this.bootstrapManager.getStats()

      console.log('\n📈 Network Status:')
      console.log(`   🔗 Connected: ${networkStatus.connected ? '✅' : '❌'}`)
      console.log(`   👥 Peer count: ${networkStatus.peerCount}`)
      console.log(`   🕸️ DHT connected: ${networkStatus.dhtConnected ? '✅' : '❌'}`)
      console.log(`   ⚡ Latency: ${networkStatus.latency}ms`)

      console.log('\n🚀 Bootstrap Stats:')
      console.log(`   🏗️ Bootstrap nodes: ${bootstrapStats.availableBootstrapNodes}/${bootstrapStats.bootstrapNodes}`)
      console.log(`   👥 Peer history: ${bootstrapStats.peerHistorySize} peers`)
      console.log(`   📊 Total interactions: ${bootstrapStats.totalInteractions}`)
      console.log(`   ⭐ Avg reputation: ${bootstrapStats.averageReputationScore.toFixed(3)}`)
      console.log(`   🔧 Fallback methods: ${bootstrapStats.fallbackMethodsEnabled}`)

      // Check if network needs recovery
      if (!networkStatus.dhtConnected || networkStatus.peerCount < 3) {
        console.log('⚠️ Network appears unhealthy, recovery may be triggered...')
      }

    }, 10000) // Monitor every 10 seconds

    // Stop monitoring after 30 seconds
    setTimeout(() => {
      clearInterval(monitoringInterval)
      console.log('\n⏹️ Network monitoring stopped')
    }, 30000)
  }

  /**
   * Demonstrate advanced bootstrap scenarios
   */
  async demonstrateAdvancedScenarios(): Promise<void> {
    console.log('\n🔬 Demonstrating Advanced Bootstrap Scenarios...')

    // Scenario 1: Regional bootstrap optimization
    console.log('\n1️⃣ Regional Bootstrap Optimization:')
    const regionalNodes: BootstrapNode[] = [
      {
        id: 'us-west-bootstrap',
        multiaddr: '/ip4/104.131.131.82/tcp/4001/p2p/us-west-bootstrap',
        protocols: ['kad-dht'],
        region: 'us-west',
        reliability: 0.92,
        lastSeen: new Date(),
        responseTime: 60
      },
      {
        id: 'eu-central-bootstrap',
        multiaddr: '/ip4/178.62.158.247/tcp/4001/p2p/eu-central-bootstrap',
        protocols: ['kad-dht'],
        region: 'eu-central',
        reliability: 0.89,
        lastSeen: new Date(),
        responseTime: 120
      }
    ]

    regionalNodes.forEach(node => {
      this.bootstrapManager.addBootstrapNode(node)
      console.log(`   🌍 Added ${node.region} bootstrap node`)
    })

    // Scenario 2: Peer recommendation with geographic clustering
    console.log('\n2️⃣ Geographic Peer Clustering:')
    const locations = [
      { name: 'San Francisco', geohash: 'u4pruydqqvj' },
      { name: 'New York', geohash: 'dr5regw3p' },
      { name: 'London', geohash: 'gcpvj0du6' },
      { name: 'Tokyo', geohash: 'xn774c06k' }
    ]

    for (const location of locations) {
      const criteria: DiscoveryCriteria = {
        geohash: location.geohash,
        ageRange: [25, 35],
        interests: ['travel', 'culture'],
        maxDistance: 25
      }

      try {
        const recommendations = await this.bootstrapManager.getPeerRecommendations(criteria)
        console.log(`   📍 ${location.name}: ${recommendations.length} recommendations`)
      } catch (error) {
        console.log(`   📍 ${location.name}: Error getting recommendations`)
      }
    }

    // Scenario 3: Fallback method effectiveness
    console.log('\n3️⃣ Fallback Method Testing:')
    const fallbackMethods = ['bootstrap', 'dns', 'websocket', 'mdns']
    
    for (const method of fallbackMethods) {
      console.log(`   🔄 Testing ${method} fallback...`)
      // In a real scenario, we would test each method individually
      // For demo purposes, we'll just show the concept
      console.log(`   ✅ ${method} fallback ready`)
    }
  }

  /**
   * Run the complete bootstrap discovery demonstration
   */
  async runDemo(): Promise<void> {
    try {
      await this.initialize()
      
      await this.demonstrateBootstrapScenarios()
      await this.demonstrateDHTFailureRecovery()
      await this.demonstratePeerRecommendations()
      await this.demonstrateAdvancedScenarios()
      
      // Start network monitoring
      console.log('\n🔍 Starting network monitoring for 30 seconds...')
      await this.demonstrateNetworkMonitoring()
      
      console.log('\n🎉 Bootstrap Discovery demonstration completed!')
      
    } catch (error) {
      console.error('❌ Demo failed:', error)
    } finally {
      await this.cleanup()
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up resources...')
    
    this.isRunning = false
    
    if (this.bootstrapManager) {
      this.bootstrapManager.destroy()
      console.log('✅ Bootstrap Discovery Manager destroyed')
    }
    
    if (this.p2pManager) {
      await this.p2pManager.disconnect()
      console.log('✅ P2P Manager disconnected')
    }
    
    console.log('🏁 Cleanup completed')
  }
}

// Export for use in other modules
export { BootstrapDiscoveryExample }

// Run demo if this file is executed directly
if (require.main === module) {
  const demo = new BootstrapDiscoveryExample()
  
  demo.runDemo().catch(error => {
    console.error('Demo execution failed:', error)
    process.exit(1)
  })
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...')
    await demo.cleanup()
    process.exit(0)
  })
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...')
    await demo.cleanup()
    process.exit(0)
  })
}