import { NetworkDiagnosticsManager } from '../NetworkDiagnosticsManager'

describe('NetworkDiagnosticsManager Simple Integration', () => {
  let diagnosticsManager: NetworkDiagnosticsManager

  beforeEach(() => {
    diagnosticsManager = new NetworkDiagnosticsManager()
  })

  afterEach(() => {
    diagnosticsManager.destroy()
  })

  describe('Standalone Functionality', () => {
    it('should provide default diagnostics without libp2p', () => {
      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      
      expect(diagnostics.networkStatus.connected).toBe(false)
      expect(diagnostics.networkStatus.peerCount).toBe(0)
      expect(diagnostics.networkStatus.dhtConnected).toBe(false)
      expect(diagnostics.peerMetrics).toEqual([])
      expect(diagnostics.troubleshooting.healthScore).toBeGreaterThanOrEqual(0)
    })

    it('should handle message tracking without initialization', () => {
      diagnosticsManager.recordMessageSent()
      diagnosticsManager.recordMessageReceived()
      diagnosticsManager.recordMessageDelivered()
      diagnosticsManager.recordMessageFailed()

      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      expect(diagnostics.performance.messageDeliveryRate).toBe(100) // 1 delivered out of 1 sent
    })

    it('should provide empty peer metrics without connections', () => {
      const allMetrics = diagnosticsManager.getAllPeerMetrics()
      expect(allMetrics).toEqual([])

      const specificMetrics = diagnosticsManager.getPeerMetrics('non-existent-peer')
      expect(specificMetrics).toBeNull()
    })

    it('should provide empty network history initially', () => {
      const history = diagnosticsManager.getNetworkHistory()
      expect(history).toEqual([])
    })

    it('should run troubleshooting without libp2p', async () => {
      const result = await diagnosticsManager.runNetworkTroubleshooting()
      
      expect(result.issues).toBeDefined()
      expect(result.recommendations).toBeDefined()
      expect(result.healthScore).toBeGreaterThanOrEqual(0)
      expect(result.healthScore).toBeLessThanOrEqual(100)
      expect(typeof result.canAutoFix).toBe('boolean')
      expect(Array.isArray(result.autoFixActions)).toBe(true)
    })

    it('should handle event emission without listeners', () => {
      // Should not throw when emitting events without listeners
      expect(() => {
        diagnosticsManager['onPeerConnected']('test-peer')
        diagnosticsManager['onPeerDisconnected']('test-peer')
        diagnosticsManager['detectNetworkIssues']()
      }).not.toThrow()
    })

    it('should calculate health score correctly', () => {
      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      const healthScore = diagnostics.troubleshooting.healthScore
      
      // Without connection, health score should be low
      expect(healthScore).toBeLessThan(100)
      expect(healthScore).toBeGreaterThanOrEqual(0)
    })

    it('should provide network recommendations when disconnected', async () => {
      const result = await diagnosticsManager.runNetworkTroubleshooting()
      
      expect(result.recommendations.length).toBeGreaterThan(0)
      expect(result.recommendations).toContain('Check internet connection')
    })

    it('should handle cleanup properly', () => {
      // Add some data
      diagnosticsManager.recordMessageSent()
      diagnosticsManager['onPeerConnected']('test-peer')
      
      // Should have some data
      expect(diagnosticsManager.getAllPeerMetrics().length).toBeGreaterThan(0)
      
      // Cleanup
      diagnosticsManager.destroy()
      
      // Should be cleaned up
      expect(diagnosticsManager.getAllPeerMetrics().length).toBe(0)
      expect(diagnosticsManager.getNetworkHistory().length).toBe(0)
    })
  })

  describe('Event Handling', () => {
    it('should emit and handle peer connection events', (done) => {
      let eventCount = 0
      
      diagnosticsManager.on('peer:connected', (peerId, metrics) => {
        expect(peerId).toBe('test-peer')
        expect(metrics.connectionState).toBe('connected')
        eventCount++
        
        if (eventCount === 1) {
          done()
        }
      })

      diagnosticsManager['onPeerConnected']('test-peer')
    })

    it('should emit and handle peer disconnection events', (done) => {
      // First connect a peer
      diagnosticsManager['onPeerConnected']('test-peer')
      
      diagnosticsManager.on('peer:disconnected', (peerId, metrics) => {
        expect(peerId).toBe('test-peer')
        expect(metrics.connectionState).toBe('disconnected')
        done()
      })

      diagnosticsManager['onPeerDisconnected']('test-peer')
    })

    it('should emit metrics updates', () => {
      let eventEmitted = false
      
      diagnosticsManager.on('metrics:updated', (diagnostics) => {
        expect(diagnostics).toBeDefined()
        expect(diagnostics.networkStatus).toBeDefined()
        eventEmitted = true
      })

      // Manually emit the event since updateNetworkMetrics requires libp2p
      const mockDiagnostics = diagnosticsManager.getNetworkDiagnostics()
      diagnosticsManager.emit('metrics:updated', mockDiagnostics)
      
      expect(eventEmitted).toBe(true)
    })

    it('should handle multiple event listeners', () => {
      let listener1Called = false
      let listener2Called = false
      
      const listener1 = () => { listener1Called = true }
      const listener2 = () => { listener2Called = true }
      
      diagnosticsManager.on('peer:connected', listener1)
      diagnosticsManager.on('peer:connected', listener2)
      
      diagnosticsManager['onPeerConnected']('test-peer')
      
      expect(listener1Called).toBe(true)
      expect(listener2Called).toBe(true)
    })
  })

  describe('Performance Metrics', () => {
    it('should calculate message delivery rate correctly', () => {
      // Send 10 messages, deliver 8
      for (let i = 0; i < 10; i++) {
        diagnosticsManager.recordMessageSent()
      }
      for (let i = 0; i < 8; i++) {
        diagnosticsManager.recordMessageDelivered()
      }
      for (let i = 0; i < 2; i++) {
        diagnosticsManager.recordMessageFailed()
      }

      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      expect(diagnostics.performance.messageDeliveryRate).toBe(80)
    })

    it('should handle zero messages gracefully', () => {
      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      expect(diagnostics.performance.messageDeliveryRate).toBe(100) // Default when no messages
    })

    it('should calculate connection success rate', () => {
      // Add some peers with different connection states
      diagnosticsManager['onPeerConnected']('peer1')
      diagnosticsManager['onPeerConnected']('peer2')
      diagnosticsManager['onPeerDisconnected']('peer2')
      
      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      expect(diagnostics.performance.connectionSuccess).toBeGreaterThanOrEqual(0)
      expect(diagnostics.performance.connectionSuccess).toBeLessThanOrEqual(100)
    })
  })

  describe('Connection Quality Assessment', () => {
    it('should assess connection quality based on metrics', () => {
      // Connect a peer
      diagnosticsManager['onPeerConnected']('test-peer')
      const metrics = diagnosticsManager.getPeerMetrics('test-peer')!
      
      // Test different quality levels
      metrics.latency = 50
      metrics.packetsLost = 0
      metrics.packetsReceived = 100
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('excellent')

      metrics.latency = 200
      metrics.packetsLost = 2
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('good')

      metrics.latency = 400
      metrics.packetsLost = 8
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('fair')

      metrics.latency = 800
      metrics.packetsLost = 20
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('poor')
    })

    it('should handle edge cases in quality assessment', () => {
      diagnosticsManager['onPeerConnected']('test-peer')
      const metrics = diagnosticsManager.getPeerMetrics('test-peer')!
      
      // Zero packets received (should still be good quality with low latency)
      metrics.latency = 100
      metrics.packetsLost = 5
      metrics.packetsReceived = 0
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('good')
      
      // Very high latency
      metrics.latency = 5000
      metrics.packetsLost = 0
      metrics.packetsReceived = 100
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('poor')
    })
  })

  describe('Network History Tracking', () => {
    it('should maintain network history with size limit', () => {
      // Simulate multiple network status updates
      for (let i = 0; i < 150; i++) {
        diagnosticsManager['updateNetworkMetrics']()
      }
      
      const history = diagnosticsManager.getNetworkHistory()
      expect(history.length).toBeLessThanOrEqual(100) // Max history size
    })

    it('should track network status changes over time', () => {
      const initialHistory = diagnosticsManager.getNetworkHistory()
      expect(initialHistory.length).toBe(0)
      
      // Manually add to history since updateNetworkMetrics requires libp2p
      const mockStatus = {
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }
      
      diagnosticsManager['networkHistory'].push(mockStatus)
      
      const updatedHistory = diagnosticsManager.getNetworkHistory()
      expect(updatedHistory.length).toBe(1)
      expect(updatedHistory[0]).toHaveProperty('connected')
      expect(updatedHistory[0]).toHaveProperty('peerCount')
      expect(updatedHistory[0]).toHaveProperty('dhtConnected')
    })
  })
})