import { GracefulDegradationManager, OperationMode, P2PFeature } from '../GracefulDegradationManager.js'
import { NetworkStatus } from '../types.js'

/**
 * Example demonstrating graceful degradation features
 * Shows how to implement hybrid mode, feature toggles, and offline functionality
 */

class GracefulDegradationExample {
  private degradationManager: GracefulDegradationManager
  private isRunning = false

  constructor() {
    // Initialize with custom configuration
    this.degradationManager = new GracefulDegradationManager({
      mode: OperationMode.P2P_ONLY,
      fallbackThresholds: {
        maxLatency: 2000,      // 2 seconds max latency
        minPeerCount: 2,       // Need at least 2 peers
        maxFailureRate: 0.25,  // 25% max failure rate
        connectionTimeout: 8000 // 8 seconds connection timeout
      },
      offlineCapabilities: {
        enableLocalStorage: true,
        enableMessageQueue: true,
        enableProfileCache: true,
        maxCacheSize: 150 // 150MB cache
      }
    })

    this.setupEventListeners()
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return
    }

    console.log('🚀 Starting Graceful Degradation Example...')
    
    try {
      await this.degradationManager.initialize()
      this.isRunning = true
      
      console.log('✅ Degradation manager initialized')
      console.log(`📊 Current mode: ${this.degradationManager.getCurrentMode()}`)
      
      // Start the demonstration
      await this.runDemonstration()
      
    } catch (error) {
      console.error('❌ Failed to start degradation manager:', error)
      throw error
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    console.log('🛑 Stopping Graceful Degradation Example...')
    
    await this.degradationManager.destroy()
    this.isRunning = false
    
    console.log('✅ Degradation manager stopped')
  }

  private setupEventListeners(): void {
    // Mode change events
    this.degradationManager.on('modeChanged', (event) => {
      console.log(`🔄 Mode changed: ${event.previousMode} → ${event.newMode}`)
      console.log(`   Reason: ${event.reason}`)
    })

    // Feature toggle events
    this.degradationManager.on('featureEnabled', (event) => {
      console.log(`✅ Feature enabled: ${event.feature}`)
      if (event.reason) {
        console.log(`   Reason: ${event.reason}`)
      }
    })

    this.degradationManager.on('featureDisabled', (event) => {
      console.log(`❌ Feature disabled: ${event.feature}`)
      if (event.reason) {
        console.log(`   Reason: ${event.reason}`)
      }
    })

    // Mode-specific events
    this.degradationManager.on('hybridModeEnabled', () => {
      console.log('🔀 Hybrid mode enabled - P2P with centralized fallbacks')
    })

    this.degradationManager.on('offlineModeEnabled', () => {
      console.log('📱 Offline mode enabled - Local-only functionality')
    })

    this.degradationManager.on('localStorageEnabled', () => {
      console.log('💾 Local storage enabled for offline data')
    })

    this.degradationManager.on('messageQueueEnabled', () => {
      console.log('📬 Message queue enabled for offline messages')
    })

    this.degradationManager.on('profileCacheEnabled', () => {
      console.log('👤 Profile cache enabled for offline profiles')
    })

    // Metrics updates
    this.degradationManager.on('metricsUpdated', (metrics) => {
      console.log('📊 Metrics updated:')
      console.log(`   P2P Health: ${metrics.p2pHealth.connected ? '✅' : '❌'} (${metrics.p2pHealth.peerCount} peers, ${metrics.p2pHealth.latency}ms)`)
      console.log(`   Centralized Health: ${metrics.centralizedHealth.connected ? '✅' : '❌'} (${metrics.centralizedHealth.latency}ms)`)
    })

    // Error handling
    this.degradationManager.on('error', (error) => {
      console.error('❌ Degradation manager error:', error.message)
    })
  }

  private async runDemonstration(): Promise<void> {
    console.log('\n🎭 Starting degradation scenarios demonstration...\n')

    // Scenario 1: Normal P2P operation
    await this.demonstrateNormalOperation()
    await this.sleep(2000)

    // Scenario 2: Network degradation
    await this.demonstrateNetworkDegradation()
    await this.sleep(2000)

    // Scenario 3: Feature-specific failures
    await this.demonstrateFeatureFailures()
    await this.sleep(2000)

    // Scenario 4: Complete network loss
    await this.demonstrateOfflineMode()
    await this.sleep(2000)

    // Scenario 5: Network recovery
    await this.demonstrateNetworkRecovery()
    await this.sleep(2000)

    // Scenario 6: Configuration changes
    await this.demonstrateConfigurationChanges()

    console.log('\n🎉 Demonstration completed!')
  }

  private async demonstrateNormalOperation(): Promise<void> {
    console.log('📡 Scenario 1: Normal P2P Operation')
    
    // Simulate healthy P2P network
    const healthyStatus: NetworkStatus = {
      connected: true,
      peerCount: 8,
      dhtConnected: true,
      latency: 150,
      bandwidth: { up: 2000, down: 5000 }
    }

    this.degradationManager.updateNetworkMetrics(healthyStatus)
    
    console.log('   ✅ All P2P features working normally')
    console.log(`   📊 ${healthyStatus.peerCount} peers connected, ${healthyStatus.latency}ms latency`)
    
    // Check feature status
    const features = [P2PFeature.DHT_DISCOVERY, P2PFeature.WEBRTC_CONNECTIONS, P2PFeature.ENCRYPTED_MESSAGING]
    for (const feature of features) {
      const enabled = this.degradationManager.isFeatureEnabled(feature)
      console.log(`   ${enabled ? '✅' : '❌'} ${feature}: ${enabled ? 'enabled' : 'disabled'}`)
    }
  }

  private async demonstrateNetworkDegradation(): Promise<void> {
    console.log('\n⚠️  Scenario 2: Network Degradation')
    
    // Simulate network issues
    const degradedStatus: NetworkStatus = {
      connected: true,
      peerCount: 1, // Below threshold
      dhtConnected: false,
      latency: 3000, // High latency
      bandwidth: { up: 200, down: 500 }
    }

    console.log('   📉 Simulating network degradation...')
    console.log(`   ⚠️  Only ${degradedStatus.peerCount} peer connected, ${degradedStatus.latency}ms latency`)
    
    this.degradationManager.updateNetworkMetrics(degradedStatus)
    
    // Trigger fallback check
    await this.degradationManager['checkHealthAndApplyFallbacks']()
    
    console.log(`   🔄 Current mode: ${this.degradationManager.getCurrentMode()}`)
  }

  private async demonstrateFeatureFailures(): Promise<void> {
    console.log('\n🔧 Scenario 3: Feature-Specific Failures')
    
    // Simulate DHT failure
    console.log('   ❌ Simulating DHT discovery failure...')
    await this.degradationManager.disableFeature(P2PFeature.DHT_DISCOVERY, 'DHT instability detected')
    
    // Simulate WebRTC issues
    console.log('   ❌ Simulating WebRTC connection issues...')
    await this.degradationManager.disableFeature(P2PFeature.WEBRTC_CONNECTIONS, 'NAT traversal failures')
    
    // Check what's still working
    const workingFeatures = []
    const failedFeatures = []
    
    for (const feature of Object.values(P2PFeature)) {
      if (this.degradationManager.isFeatureEnabled(feature)) {
        workingFeatures.push(feature)
      } else {
        failedFeatures.push(feature)
      }
    }
    
    console.log(`   ✅ Still working: ${workingFeatures.join(', ')}`)
    console.log(`   ❌ Failed: ${failedFeatures.join(', ')}`)
    
    // Enable fallbacks in hybrid mode
    if (this.degradationManager.getCurrentMode() === OperationMode.HYBRID) {
      console.log('   🔄 Enabling centralized fallbacks for failed features...')
      
      const toggles = this.degradationManager.getFeatureToggles()
      for (const feature of failedFeatures) {
        const toggle = toggles.get(feature as P2PFeature)
        if (toggle) {
          toggle.fallbackEnabled = true
          console.log(`   🔀 ${feature}: fallback enabled`)
        }
      }
    }
  }

  private async demonstrateOfflineMode(): Promise<void> {
    console.log('\n📱 Scenario 4: Complete Network Loss (Offline Mode)')
    
    // Simulate complete network loss
    const offlineStatus: NetworkStatus = {
      connected: false,
      peerCount: 0,
      dhtConnected: false,
      latency: 0,
      bandwidth: { up: 0, down: 0 }
    }

    console.log('   📡 Simulating complete network loss...')
    this.degradationManager.updateNetworkMetrics(offlineStatus)
    this.degradationManager.updateCentralizedMetrics(false, 0)
    
    // Trigger offline mode
    await this.degradationManager['checkHealthAndApplyFallbacks']()
    
    console.log(`   🔄 Current mode: ${this.degradationManager.getCurrentMode()}`)
    
    if (this.degradationManager.isOfflineMode()) {
      console.log('   💾 Local storage available for offline data')
      console.log('   📬 Message queue available for pending messages')
      console.log('   👤 Profile cache available for cached profiles')
      
      // Demonstrate offline capabilities
      const config = this.degradationManager.getConfig()
      console.log(`   📊 Cache size limit: ${config.offlineCapabilities.maxCacheSize}MB`)
      console.log(`   🔧 Local storage: ${config.offlineCapabilities.enableLocalStorage ? 'enabled' : 'disabled'}`)
      console.log(`   📨 Message queue: ${config.offlineCapabilities.enableMessageQueue ? 'enabled' : 'disabled'}`)
    }
  }

  private async demonstrateNetworkRecovery(): Promise<void> {
    console.log('\n🔄 Scenario 5: Network Recovery')
    
    // Simulate network recovery
    const recoveredStatus: NetworkStatus = {
      connected: true,
      peerCount: 5,
      dhtConnected: true,
      latency: 200,
      bandwidth: { up: 1500, down: 3000 }
    }

    console.log('   📡 Simulating network recovery...')
    console.log(`   ✅ ${recoveredStatus.peerCount} peers reconnected, ${recoveredStatus.latency}ms latency`)
    
    this.degradationManager.updateNetworkMetrics(recoveredStatus)
    this.degradationManager.updateCentralizedMetrics(true, 180)
    
    // Trigger recovery
    await this.degradationManager['checkHealthAndApplyFallbacks']()
    
    console.log(`   🔄 Current mode: ${this.degradationManager.getCurrentMode()}`)
    
    // Re-enable features
    console.log('   🔧 Re-enabling P2P features...')
    await this.degradationManager.enableFeature(P2PFeature.DHT_DISCOVERY, 'Network recovered')
    await this.degradationManager.enableFeature(P2PFeature.WEBRTC_CONNECTIONS, 'Network recovered')
    
    console.log('   ✅ P2P functionality restored')
  }

  private async demonstrateConfigurationChanges(): Promise<void> {
    console.log('\n⚙️  Scenario 6: Dynamic Configuration Changes')
    
    console.log('   🔧 Updating fallback thresholds for poor network conditions...')
    this.degradationManager.updateFallbackThresholds({
      maxLatency: 5000,     // More tolerant
      minPeerCount: 1,      // Lower expectations
      maxFailureRate: 0.5   // More tolerant
    })
    
    console.log('   🔧 Updating offline capabilities for low-resource device...')
    this.degradationManager.updateOfflineCapabilities({
      maxCacheSize: 50,           // Smaller cache
      enableMessageQueue: false,  // Disable to save memory
      enableLocalStorage: true,
      enableProfileCache: true
    })
    
    const config = this.degradationManager.getConfig()
    console.log('   📊 New configuration:')
    console.log(`      Max latency: ${config.fallbackThresholds.maxLatency}ms`)
    console.log(`      Min peers: ${config.fallbackThresholds.minPeerCount}`)
    console.log(`      Max failure rate: ${config.fallbackThresholds.maxFailureRate * 100}%`)
    console.log(`      Cache size: ${config.offlineCapabilities.maxCacheSize}MB`)
    console.log(`      Message queue: ${config.offlineCapabilities.enableMessageQueue ? 'enabled' : 'disabled'}`)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Utility methods for external integration
  getManager(): GracefulDegradationManager {
    return this.degradationManager
  }

  getCurrentStatus(): {
    mode: OperationMode
    canUseP2P: boolean
    canUseCentralized: boolean
    isOffline: boolean
    enabledFeatures: P2PFeature[]
  } {
    const enabledFeatures: P2PFeature[] = []
    
    for (const feature of Object.values(P2PFeature)) {
      if (this.degradationManager.isFeatureEnabled(feature)) {
        enabledFeatures.push(feature)
      }
    }

    return {
      mode: this.degradationManager.getCurrentMode(),
      canUseP2P: this.degradationManager.canUseP2P(),
      canUseCentralized: this.degradationManager.canUseCentralized(),
      isOffline: this.degradationManager.isOfflineMode(),
      enabledFeatures
    }
  }
}

// Example usage
async function runExample(): Promise<void> {
  const example = new GracefulDegradationExample()
  
  try {
    await example.start()
    
    // Let it run for a while
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Show current status
    const status = example.getCurrentStatus()
    console.log('\n📊 Final Status:')
    console.log(`   Mode: ${status.mode}`)
    console.log(`   P2P Available: ${status.canUseP2P}`)
    console.log(`   Centralized Available: ${status.canUseCentralized}`)
    console.log(`   Offline Mode: ${status.isOffline}`)
    console.log(`   Enabled Features: ${status.enabledFeatures.join(', ')}`)
    
  } catch (error) {
    console.error('Example failed:', error)
  } finally {
    await example.stop()
  }
}

// Export for use in other modules
export { GracefulDegradationExample, runExample }

// Run example if this file is executed directly
if (require.main === module) {
  runExample().catch(console.error)
}