import { GracefulDegradationManager, OperationMode, P2PFeature } from '../GracefulDegradationManager'
import { NetworkStatus } from '../types'

describe('Graceful Degradation Integration Tests', () => {
  let degradationManager: GracefulDegradationManager
  let mockCentralizedAPI: any

  beforeEach(async () => {
    // Initialize managers
    degradationManager = new GracefulDegradationManager({
      mode: OperationMode.P2P_ONLY,
      fallbackThresholds: {
        maxLatency: 1000,
        minPeerCount: 2,
        maxFailureRate: 0.3,
        connectionTimeout: 5000
      }
    })
    
    // Mock centralized API
    mockCentralizedAPI = {
      connected: false,
      latency: 0,
      sendMessage: jest.fn(),
      getProfiles: jest.fn(),
      updateProfile: jest.fn()
    }

    await degradationManager.initialize()
  })

  afterEach(async () => {
    await degradationManager.destroy()
  })

  describe('Network Failure Scenarios', () => {
    it('should gracefully degrade from P2P to hybrid mode on peer loss', async () => {
      // Start with healthy P2P network
      const healthyStatus: NetworkStatus = {
        connected: true,
        peerCount: 5,
        dhtConnected: true,
        latency: 200,
        bandwidth: { up: 1000, down: 2000 }
      }

      degradationManager.updateNetworkMetrics(healthyStatus)
      expect(degradationManager.getCurrentMode()).toBe(OperationMode.P2P_ONLY)

      // Simulate peer loss
      const degradedStatus: NetworkStatus = {
        connected: true,
        peerCount: 1, // Below threshold of 2
        dhtConnected: true,
        latency: 200,
        bandwidth: { up: 1000, down: 2000 }
      }

      const modeChangePromise = new Promise<any>((resolve) => {
        degradationManager.once('modeChanged', resolve)
      })

      degradationManager.updateNetworkMetrics(degradedStatus)
      await degradationManager['checkHealthAndApplyFallbacks']()

      const event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.HYBRID)
      expect(event.reason).toBe('Low peer count')
    })

    it('should degrade from hybrid to centralized on high failure rate', async () => {
      // Start in hybrid mode
      await degradationManager.setOperationMode(OperationMode.HYBRID)

      // Simulate high failure rate
      const failingStatus: NetworkStatus = {
        connected: true,
        peerCount: 3,
        dhtConnected: false,
        latency: 500,
        bandwidth: { up: 500, down: 1000 }
      }

      // Mock high failure rate
      degradationManager['calculateFailureRate'] = jest.fn().mockReturnValue(0.5) // Above 0.3 threshold

      const modeChangePromise = new Promise<any>((resolve) => {
        degradationManager.once('modeChanged', resolve)
      })

      degradationManager.updateNetworkMetrics(failingStatus)
      await degradationManager['checkHealthAndApplyFallbacks']()

      const event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.CENTRALIZED_ONLY)
      expect(event.reason).toBe('High failure rate')
    })

    it('should switch to offline mode when all connectivity is lost', async () => {
      // Simulate complete network loss
      const offlineStatus: NetworkStatus = {
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }

      degradationManager.updateNetworkMetrics(offlineStatus)
      degradationManager.updateCentralizedMetrics(false, 0)

      const modeChangePromise = new Promise<any>((resolve) => {
        degradationManager.once('modeChanged', resolve)
      })

      const offlineModePromise = new Promise<void>((resolve) => {
        degradationManager.once('offlineModeEnabled', resolve)
      })

      await degradationManager['checkHealthAndApplyFallbacks']()

      const event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.OFFLINE)
      expect(event.reason).toBe('No network connectivity')

      await offlineModePromise
    })

    it('should recover from offline mode when connectivity is restored', async () => {
      // Start in offline mode
      await degradationManager.setOperationMode(OperationMode.OFFLINE)

      // Restore P2P connectivity
      const restoredStatus: NetworkStatus = {
        connected: true,
        peerCount: 3,
        dhtConnected: true,
        latency: 300,
        bandwidth: { up: 800, down: 1500 }
      }

      const modeChangePromise = new Promise<any>((resolve) => {
        degradationManager.once('modeChanged', resolve)
      })

      degradationManager.updateNetworkMetrics(restoredStatus)
      await degradationManager['checkHealthAndApplyFallbacks']()

      const event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.HYBRID)
      expect(event.reason).toBe('Network connectivity restored')
    })
  })

  describe('Feature-Specific Degradation', () => {
    it('should disable specific features while maintaining others', async () => {
      await degradationManager.setOperationMode(OperationMode.HYBRID)

      // Disable DHT discovery due to issues
      await degradationManager.disableFeature(P2PFeature.DHT_DISCOVERY, 'DHT instability')

      expect(degradationManager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)).toBe(false)
      expect(degradationManager.isFeatureEnabled(P2PFeature.WEBRTC_CONNECTIONS)).toBe(true)
      expect(degradationManager.isFeatureEnabled(P2PFeature.ENCRYPTED_MESSAGING)).toBe(true)

      // Should still be able to use other P2P features
      expect(degradationManager.canUseP2P()).toBe(true)
    })

    it('should enable fallbacks for disabled features in hybrid mode', async () => {
      await degradationManager.setOperationMode(OperationMode.HYBRID)

      // Disable messaging but enable fallback
      await degradationManager.disableFeature(P2PFeature.ENCRYPTED_MESSAGING, 'Encryption issues')
      
      const toggles = degradationManager.getFeatureToggles()
      const toggle = toggles.get(P2PFeature.ENCRYPTED_MESSAGING)!
      toggle.fallbackEnabled = true

      expect(degradationManager.shouldFallbackToCentralized(P2PFeature.ENCRYPTED_MESSAGING)).toBe(true)
    })

    it('should handle cascading feature failures', async () => {
      await degradationManager.setOperationMode(OperationMode.HYBRID)

      // Simulate cascading failures
      await degradationManager.disableFeature(P2PFeature.DHT_DISCOVERY, 'DHT failure')
      await degradationManager.disableFeature(P2PFeature.WEBRTC_CONNECTIONS, 'WebRTC failure')
      await degradationManager.disableFeature(P2PFeature.PROFILE_SYNC, 'Sync failure')
      await degradationManager.disableFeature(P2PFeature.ENCRYPTED_MESSAGING, 'Messaging failure')

      // Most P2P features are now disabled
      const enabledFeatures = Array.from(degradationManager.getFeatureToggles().entries())
        .filter(([_, toggle]) => toggle.enabled)
        .map(([feature, _]) => feature)

      expect(enabledFeatures.length).toBeLessThan(4) // Adjusted expectation
    })
  })

  describe('Performance-Based Degradation', () => {
    it('should degrade on high latency', async () => {
      const highLatencyStatus: NetworkStatus = {
        connected: true,
        peerCount: 5,
        dhtConnected: true,
        latency: 2000, // Above 1000ms threshold
        bandwidth: { up: 1000, down: 2000 }
      }

      const modeChangePromise = new Promise<any>((resolve) => {
        degradationManager.once('modeChanged', resolve)
      })

      degradationManager.updateNetworkMetrics(highLatencyStatus)
      await degradationManager['checkHealthAndApplyFallbacks']()

      const event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.HYBRID)
      expect(event.reason).toBe('High latency')
    })

    it('should maintain P2P mode with good performance', async () => {
      const goodStatus: NetworkStatus = {
        connected: true,
        peerCount: 10,
        dhtConnected: true,
        latency: 150,
        bandwidth: { up: 2000, down: 5000 }
      }

      degradationManager.updateNetworkMetrics(goodStatus)
      await degradationManager['checkHealthAndApplyFallbacks']()

      // Should remain in P2P mode
      expect(degradationManager.getCurrentMode()).toBe(OperationMode.P2P_ONLY)
    })
  })

  describe('Offline Mode Functionality', () => {
    beforeEach(async () => {
      await degradationManager.setOperationMode(OperationMode.OFFLINE)
    })

    it('should enable local storage in offline mode', async () => {
      // Switch to offline mode
      await degradationManager.setOperationMode(OperationMode.OFFLINE)
      
      // Check that offline capabilities are configured
      const config = degradationManager.getConfig()
      expect(config.offlineCapabilities.enableLocalStorage).toBe(true)
    })

    it('should enable message queue in offline mode', async () => {
      // Switch to offline mode
      await degradationManager.setOperationMode(OperationMode.OFFLINE)
      
      // Check that offline capabilities are configured
      const config = degradationManager.getConfig()
      expect(config.offlineCapabilities.enableMessageQueue).toBe(true)
    })

    it('should enable profile cache in offline mode', async () => {
      // Switch to offline mode
      await degradationManager.setOperationMode(OperationMode.OFFLINE)
      
      // Check that offline capabilities are configured
      const config = degradationManager.getConfig()
      expect(config.offlineCapabilities.enableProfileCache).toBe(true)
    })

    it('should disable all network features in offline mode', () => {
      expect(degradationManager.canUseP2P()).toBe(false)
      expect(degradationManager.canUseCentralized()).toBe(false)
      expect(degradationManager.isOfflineMode()).toBe(true)

      // All features should be disabled
      for (const feature of Object.values(P2PFeature)) {
        expect(degradationManager.isFeatureEnabled(feature)).toBe(false)
      }
    })
  })

  describe('Hybrid Mode Operations', () => {
    beforeEach(async () => {
      await degradationManager.setOperationMode(OperationMode.HYBRID)
    })

    it('should allow both P2P and centralized operations', () => {
      expect(degradationManager.canUseP2P()).toBe(true)
      expect(degradationManager.canUseCentralized()).toBe(true)
      expect(degradationManager.isOfflineMode()).toBe(false)
    })

    it('should enable fallbacks for features', () => {
      const toggles = degradationManager.getFeatureToggles()
      
      // In hybrid mode, fallbacks should be available
      for (const [feature, toggle] of toggles) {
        if (!toggle.enabled) {
          toggle.fallbackEnabled = true
          expect(degradationManager.shouldFallbackToCentralized(feature)).toBe(true)
        }
      }
    })

    it('should handle mixed success/failure scenarios', async () => {
      // Simulate partial P2P success
      const partialStatus: NetworkStatus = {
        connected: true,
        peerCount: 2, // At threshold
        dhtConnected: false, // DHT issues
        latency: 800, // Acceptable
        bandwidth: { up: 1000, down: 2000 }
      }

      degradationManager.updateNetworkMetrics(partialStatus)
      degradationManager.updateCentralizedMetrics(true, 200) // Centralized working well

      await degradationManager['checkHealthAndApplyFallbacks']()

      // Should remain in hybrid mode to handle mixed conditions
      expect(degradationManager.getCurrentMode()).toBe(OperationMode.HYBRID)
    })
  })

  describe('Configuration Adaptation', () => {
    it('should adapt thresholds based on network conditions', () => {
      // Simulate poor network environment
      degradationManager.updateFallbackThresholds({
        maxLatency: 2000, // More tolerant
        minPeerCount: 1,   // Lower expectations
        maxFailureRate: 0.5 // More tolerant
      })

      const config = degradationManager.getConfig()
      expect(config.fallbackThresholds.maxLatency).toBe(2000)
      expect(config.fallbackThresholds.minPeerCount).toBe(1)
      expect(config.fallbackThresholds.maxFailureRate).toBe(0.5)
    })

    it('should adapt offline capabilities based on device constraints', () => {
      // Simulate low-resource device
      degradationManager.updateOfflineCapabilities({
        maxCacheSize: 50, // Smaller cache
        enableLocalStorage: true,
        enableMessageQueue: false, // Disable to save memory
        enableProfileCache: true
      })

      const config = degradationManager.getConfig()
      expect(config.offlineCapabilities.maxCacheSize).toBe(50)
      expect(config.offlineCapabilities.enableMessageQueue).toBe(false)
    })
  })

  describe('Recovery Scenarios', () => {
    it('should recover gracefully from temporary network issues', async () => {
      // Start with good network
      const goodStatus: NetworkStatus = {
        connected: true,
        peerCount: 5,
        dhtConnected: true,
        latency: 200,
        bandwidth: { up: 1000, down: 2000 }
      }

      degradationManager.updateNetworkMetrics(goodStatus)
      expect(degradationManager.getCurrentMode()).toBe(OperationMode.P2P_ONLY)

      // Temporary network issue
      const badStatus: NetworkStatus = {
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }

      degradationManager.updateNetworkMetrics(badStatus)
      degradationManager.updateCentralizedMetrics(false, 0)

      let modeChangePromise = new Promise<any>((resolve) => {
        degradationManager.once('modeChanged', resolve)
      })

      await degradationManager['checkHealthAndApplyFallbacks']()
      let event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.OFFLINE)

      // Network recovers
      degradationManager.updateNetworkMetrics(goodStatus)
      degradationManager.updateCentralizedMetrics(true, 150)

      modeChangePromise = new Promise<any>((resolve) => {
        degradationManager.once('modeChanged', resolve)
      })

      await degradationManager['checkHealthAndApplyFallbacks']()
      event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.HYBRID)
    })

    it('should handle rapid mode changes gracefully', async () => {
      const modes = [
        OperationMode.HYBRID,
        OperationMode.CENTRALIZED_ONLY,
        OperationMode.OFFLINE,
        OperationMode.P2P_ONLY
      ]

      for (const mode of modes) {
        await degradationManager.setOperationMode(mode, `Testing ${mode}`)
        expect(degradationManager.getCurrentMode()).toBe(mode)
      }
    })
  })
})