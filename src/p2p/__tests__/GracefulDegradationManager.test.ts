import { GracefulDegradationManager, OperationMode, P2PFeature } from '../GracefulDegradationManager'
import { NetworkStatus } from '../types'

describe('GracefulDegradationManager', () => {
  let manager: GracefulDegradationManager

  beforeEach(() => {
    manager = new GracefulDegradationManager()
  })

  afterEach(async () => {
    await manager.destroy()
  })

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      await manager.initialize()
      
      expect(manager.getCurrentMode()).toBe(OperationMode.P2P_ONLY)
      expect(manager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)).toBe(true)
      expect(manager.isFeatureEnabled(P2PFeature.WEBRTC_CONNECTIONS)).toBe(true)
    })

    it('should initialize with custom configuration', async () => {
      const customManager = new GracefulDegradationManager({
        mode: OperationMode.HYBRID,
        fallbackThresholds: {
          maxLatency: 3000,
          minPeerCount: 2,
          maxFailureRate: 0.2,
          connectionTimeout: 8000
        }
      })

      await customManager.initialize()
      
      expect(customManager.getCurrentMode()).toBe(OperationMode.HYBRID)
      
      const config = customManager.getConfig()
      expect(config.fallbackThresholds.maxLatency).toBe(3000)
      expect(config.fallbackThresholds.minPeerCount).toBe(2)
      
      await customManager.destroy()
    })

    it('should emit initialized event', async () => {
      const initPromise = new Promise<void>((resolve) => {
        manager.once('initialized', resolve)
      })

      await manager.initialize()
      await initPromise
    })
  })

  describe('Operation Mode Management', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should switch to hybrid mode', async () => {
      const modeChangePromise = new Promise<any>((resolve) => {
        manager.once('modeChanged', resolve)
      })

      await manager.setOperationMode(OperationMode.HYBRID, 'Test switch')
      
      expect(manager.getCurrentMode()).toBe(OperationMode.HYBRID)
      
      const event = await modeChangePromise
      expect(event.previousMode).toBe(OperationMode.P2P_ONLY)
      expect(event.newMode).toBe(OperationMode.HYBRID)
      expect(event.reason).toBe('Test switch')
    })

    it('should switch to centralized mode', async () => {
      await manager.setOperationMode(OperationMode.CENTRALIZED_ONLY)
      
      expect(manager.getCurrentMode()).toBe(OperationMode.CENTRALIZED_ONLY)
      expect(manager.canUseCentralized()).toBe(true)
      expect(manager.canUseP2P()).toBe(false)
    })

    it('should switch to offline mode', async () => {
      const offlineModePromise = new Promise<void>((resolve) => {
        manager.once('offlineModeEnabled', resolve)
      })

      await manager.setOperationMode(OperationMode.OFFLINE)
      
      expect(manager.getCurrentMode()).toBe(OperationMode.OFFLINE)
      expect(manager.isOfflineMode()).toBe(true)
      
      await offlineModePromise
    })

    it('should not change mode if already in target mode', async () => {
      const initialMode = manager.getCurrentMode()
      await manager.setOperationMode(initialMode)
      
      expect(manager.getCurrentMode()).toBe(initialMode)
    })
  })

  describe('Feature Toggle Management', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should enable and disable features', async () => {
      const featureDisabledPromise = new Promise<any>((resolve) => {
        manager.once('featureDisabled', resolve)
      })

      await manager.disableFeature(P2PFeature.DHT_DISCOVERY, 'Test disable')
      
      expect(manager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)).toBe(false)
      
      const event = await featureDisabledPromise
      expect(event.feature).toBe(P2PFeature.DHT_DISCOVERY)
      expect(event.reason).toBe('Test disable')

      const featureEnabledPromise = new Promise<any>((resolve) => {
        manager.once('featureEnabled', resolve)
      })

      await manager.enableFeature(P2PFeature.DHT_DISCOVERY, 'Test enable')
      
      expect(manager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)).toBe(true)
      
      const enableEvent = await featureEnabledPromise
      expect(enableEvent.feature).toBe(P2PFeature.DHT_DISCOVERY)
    })

    it('should not change feature state if already in target state', async () => {
      const initialState = manager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)
      
      if (initialState) {
        await manager.enableFeature(P2PFeature.DHT_DISCOVERY)
        expect(manager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)).toBe(true)
      } else {
        await manager.disableFeature(P2PFeature.DHT_DISCOVERY)
        expect(manager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)).toBe(false)
      }
    })

    it('should track feature toggle history', async () => {
      await manager.disableFeature(P2PFeature.ENCRYPTED_MESSAGING, 'Test reason')
      
      const toggles = manager.getFeatureToggles()
      const toggle = toggles.get(P2PFeature.ENCRYPTED_MESSAGING)
      
      expect(toggle).toBeDefined()
      expect(toggle!.enabled).toBe(false)
      expect(toggle!.reason).toBe('Test reason')
      expect(toggle!.lastToggled).toBeInstanceOf(Date)
    })
  })

  describe('Network Metrics and Health Monitoring', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should update P2P network metrics', () => {
      const networkStatus: NetworkStatus = {
        connected: true,
        peerCount: 5,
        dhtConnected: true,
        latency: 200,
        bandwidth: { up: 1000, down: 2000 }
      }

      const metricsPromise = new Promise<any>((resolve) => {
        manager.once('metricsUpdated', resolve)
      })

      manager.updateNetworkMetrics(networkStatus)
      
      const metrics = manager.getMetrics()
      expect(metrics.p2pHealth.connected).toBe(true)
      expect(metrics.p2pHealth.peerCount).toBe(5)
      expect(metrics.p2pHealth.latency).toBe(200)
    })

    it('should update centralized metrics', () => {
      manager.updateCentralizedMetrics(true, 150)
      
      const metrics = manager.getMetrics()
      expect(metrics.centralizedHealth.connected).toBe(true)
      expect(metrics.centralizedHealth.latency).toBe(150)
    })

    it('should request metrics updates during monitoring', (done) => {
      manager.once('metricsUpdateRequested', () => {
        done()
      })

      // Trigger health monitoring manually
      manager['checkHealthAndApplyFallbacks']()
    })
  })

  describe('Fallback Strategies', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should switch to hybrid mode when peer count is low', async () => {
      // Set low peer count threshold
      manager.updateFallbackThresholds({ minPeerCount: 3 })

      const networkStatus: NetworkStatus = {
        connected: true,
        peerCount: 1, // Below threshold
        dhtConnected: true,
        latency: 200,
        bandwidth: { up: 1000, down: 2000 }
      }

      const modeChangePromise = new Promise<any>((resolve) => {
        manager.once('modeChanged', resolve)
      })

      manager.updateNetworkMetrics(networkStatus)
      await manager['checkHealthAndApplyFallbacks']()

      const event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.HYBRID)
      expect(event.reason).toBe('Low peer count')
    })

    it('should switch to hybrid mode when latency is high', async () => {
      // Set low latency threshold
      manager.updateFallbackThresholds({ maxLatency: 1000 })

      const networkStatus: NetworkStatus = {
        connected: true,
        peerCount: 5,
        dhtConnected: true,
        latency: 2000, // Above threshold
        bandwidth: { up: 1000, down: 2000 }
      }

      const modeChangePromise = new Promise<any>((resolve) => {
        manager.once('modeChanged', resolve)
      })

      manager.updateNetworkMetrics(networkStatus)
      await manager['checkHealthAndApplyFallbacks']()

      const event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.HYBRID)
      expect(event.reason).toBe('High latency')
    })

    it('should switch to offline mode when no connectivity', async () => {
      const networkStatus: NetworkStatus = {
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }

      manager.updateNetworkMetrics(networkStatus)
      manager.updateCentralizedMetrics(false, 0)

      const modeChangePromise = new Promise<any>((resolve) => {
        manager.once('modeChanged', resolve)
      })

      await manager['checkHealthAndApplyFallbacks']()

      const event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.OFFLINE)
      expect(event.reason).toBe('No network connectivity')
    })

    it('should restore connectivity when network is available', async () => {
      // First go offline
      await manager.setOperationMode(OperationMode.OFFLINE)

      // Then restore connectivity
      const networkStatus: NetworkStatus = {
        connected: true,
        peerCount: 3,
        dhtConnected: true,
        latency: 300,
        bandwidth: { up: 1000, down: 2000 }
      }

      manager.updateNetworkMetrics(networkStatus)

      const modeChangePromise = new Promise<any>((resolve) => {
        manager.once('modeChanged', resolve)
      })

      await manager['checkHealthAndApplyFallbacks']()

      const event = await modeChangePromise
      expect(event.newMode).toBe(OperationMode.HYBRID)
      expect(event.reason).toBe('Network connectivity restored')
    })
  })

  describe('Configuration Management', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should update fallback thresholds', () => {
      const configPromise = new Promise<any>((resolve) => {
        manager.once('configUpdated', resolve)
      })

      const newThresholds = {
        maxLatency: 3000,
        minPeerCount: 2
      }

      manager.updateFallbackThresholds(newThresholds)

      const config = manager.getConfig()
      expect(config.fallbackThresholds.maxLatency).toBe(3000)
      expect(config.fallbackThresholds.minPeerCount).toBe(2)
    })

    it('should update offline capabilities', () => {
      const newCapabilities = {
        enableLocalStorage: false,
        maxCacheSize: 200
      }

      manager.updateOfflineCapabilities(newCapabilities)

      const config = manager.getConfig()
      expect(config.offlineCapabilities.enableLocalStorage).toBe(false)
      expect(config.offlineCapabilities.maxCacheSize).toBe(200)
    })
  })

  describe('Utility Methods', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should correctly identify P2P availability', () => {
      expect(manager.canUseP2P()).toBe(true)

      manager.setOperationMode(OperationMode.CENTRALIZED_ONLY)
      expect(manager.canUseP2P()).toBe(false)

      manager.setOperationMode(OperationMode.HYBRID)
      expect(manager.canUseP2P()).toBe(true)
    })

    it('should correctly identify centralized availability', () => {
      expect(manager.canUseCentralized()).toBe(false)

      manager.setOperationMode(OperationMode.CENTRALIZED_ONLY)
      expect(manager.canUseCentralized()).toBe(true)

      manager.setOperationMode(OperationMode.HYBRID)
      expect(manager.canUseCentralized()).toBe(true)
    })

    it('should correctly identify offline mode', () => {
      expect(manager.isOfflineMode()).toBe(false)

      manager.setOperationMode(OperationMode.OFFLINE)
      expect(manager.isOfflineMode()).toBe(true)
    })

    it('should determine when to fallback to centralized', async () => {
      await manager.setOperationMode(OperationMode.HYBRID)
      await manager.disableFeature(P2PFeature.DHT_DISCOVERY)

      // Enable fallback for the feature
      const toggles = manager.getFeatureToggles()
      const toggle = toggles.get(P2PFeature.DHT_DISCOVERY)!
      toggle.fallbackEnabled = true

      expect(manager.shouldFallbackToCentralized(P2PFeature.DHT_DISCOVERY)).toBe(true)
      expect(manager.shouldFallbackToCentralized(P2PFeature.WEBRTC_CONNECTIONS)).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle initialization errors', async () => {
      const errorManager = new GracefulDegradationManager()
      
      // Mock an error during initialization
      const originalApplyMode = errorManager['applyOperationMode']
      errorManager['applyOperationMode'] = jest.fn().mockRejectedValue(new Error('Init error'))

      const errorPromise = new Promise<Error>((resolve) => {
        errorManager.once('error', resolve)
      })

      await expect(errorManager.initialize()).rejects.toThrow('Init error')
      
      const error = await errorPromise
      expect(error.message).toBe('Init error')
    })

    it('should rollback on mode change failure', async () => {
      await manager.initialize()
      
      const originalMode = manager.getCurrentMode()
      
      // Mock an error during mode application
      const originalApplyMode = manager['applyOperationMode']
      manager['applyOperationMode'] = jest.fn().mockRejectedValue(new Error('Mode change error'))

      await expect(manager.setOperationMode(OperationMode.HYBRID)).rejects.toThrow('Mode change error')
      
      // Should rollback to original mode
      expect(manager.getCurrentMode()).toBe(originalMode)
    })

    it('should handle monitoring errors gracefully', async () => {
      await manager.initialize()

      const errorPromise = new Promise<Error>((resolve) => {
        manager.once('error', resolve)
      })

      // Mock a strategy that throws an error
      const originalStrategies = manager['fallbackStrategies']
      manager['fallbackStrategies'] = [{
        trigger: () => true,
        action: async () => {
          throw new Error('Monitoring error')
        },
        priority: 10,
        description: 'Test error strategy'
      }]

      // Trigger monitoring - this should catch the error and emit it
      await manager['checkHealthAndApplyFallbacks']()

      const error = await errorPromise
      expect(error.message).toBe('Monitoring error')

      // Restore original strategies
      manager['fallbackStrategies'] = originalStrategies
    })
  })
})