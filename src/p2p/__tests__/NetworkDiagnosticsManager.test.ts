import { NetworkDiagnosticsManager, PeerConnectionMetrics, NetworkDiagnostics } from '../NetworkDiagnosticsManager'
import { EventEmitter } from '../utils/EventEmitter'

// Mock libp2p
const mockLibp2p = {
  status: 'started',
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  getConnections: jest.fn(() => [] as any[]),
  getPeers: jest.fn(() => [] as any[]),
  services: {
    dht: {
      isStarted: jest.fn(() => true),
      routingTable: { size: 10 }
    },
    ping: {
      ping: jest.fn()
    }
  }
}

describe('NetworkDiagnosticsManager', () => {
  let diagnosticsManager: NetworkDiagnosticsManager
  let mockConnection: any
  let mockPeerId: string

  beforeEach(() => {
    diagnosticsManager = new NetworkDiagnosticsManager()
    mockPeerId = 'test-peer-id'
    
    mockConnection = {
      remotePeer: {
        toString: () => mockPeerId
      },
      remoteAddr: {
        protos: () => [{ name: 'tcp' }, { name: 'ws' }],
        toString: () => '/ip4/127.0.0.1/tcp/4001'
      }
    }

    // Reset mocks
    jest.clearAllMocks();
    (mockLibp2p.services.ping.ping as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    diagnosticsManager.destroy()
  })

  describe('initialization', () => {
    it('should initialize with libp2p instance', () => {
      expect(() => {
        diagnosticsManager.initialize(mockLibp2p as any)
      }).not.toThrow()
    })

    it('should set up event listeners on initialization', () => {
      diagnosticsManager.initialize(mockLibp2p as any)
      
      expect(mockLibp2p.addEventListener).toHaveBeenCalledWith('peer:connect', expect.any(Function))
      expect(mockLibp2p.addEventListener).toHaveBeenCalledWith('peer:disconnect', expect.any(Function))
      expect(mockLibp2p.addEventListener).toHaveBeenCalledWith('connection:open', expect.any(Function))
      expect(mockLibp2p.addEventListener).toHaveBeenCalledWith('connection:close', expect.any(Function))
    })
  })

  describe('peer connection tracking', () => {
    beforeEach(() => {
      diagnosticsManager.initialize(mockLibp2p as any)
    })

    it('should track peer connections', (done) => {
      diagnosticsManager.on('peer:connected', (peerId: string, metrics: PeerConnectionMetrics) => {
        expect(peerId).toBe(mockPeerId)
        expect(metrics.peerId).toBe(mockPeerId)
        expect(metrics.connectionState).toBe('connected')
        expect(metrics.connectionQuality).toBe('good')
        done()
      })

      // Simulate peer connection event
      const connectHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'peer:connect')?.[1]
      
      if (connectHandler) {
        connectHandler({ detail: mockPeerId })
      }
    })

    it('should track peer disconnections', (done) => {
      // First connect the peer
      const connectHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'peer:connect')?.[1]
      
      if (connectHandler) {
        connectHandler({ detail: mockPeerId })
      }

      diagnosticsManager.on('peer:disconnected', (peerId: string, metrics: PeerConnectionMetrics) => {
        expect(peerId).toBe(mockPeerId)
        expect(metrics.connectionState).toBe('disconnected')
        done()
      })

      // Simulate peer disconnection event
      const disconnectHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'peer:disconnect')?.[1]
      
      if (disconnectHandler) {
        disconnectHandler({ detail: mockPeerId })
      }
    })

    it('should update connection details on connection open', () => {
      // First connect the peer
      const connectHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'peer:connect')?.[1]
      
      if (connectHandler) {
        connectHandler({ detail: mockPeerId })
      }

      // Simulate connection open event
      const openHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'connection:open')?.[1]
      
      if (openHandler) {
        openHandler({ detail: mockConnection })
      }

      const metrics = diagnosticsManager.getPeerMetrics(mockPeerId)
      expect(metrics).toBeTruthy()
      expect(metrics?.protocols).toEqual(['tcp', 'ws'])
      expect(metrics?.multiaddrs).toEqual(['/ip4/127.0.0.1/tcp/4001'])
    })
  })

  describe('network diagnostics', () => {
    beforeEach(() => {
      diagnosticsManager.initialize(mockLibp2p as any)
    })

    it('should provide network diagnostics', () => {
      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      
      expect(diagnostics).toHaveProperty('networkStatus')
      expect(diagnostics).toHaveProperty('peerMetrics')
      expect(diagnostics).toHaveProperty('dhtStatus')
      expect(diagnostics).toHaveProperty('troubleshooting')
      expect(diagnostics).toHaveProperty('performance')
    })

    it('should calculate network status correctly', () => {
      (mockLibp2p.getConnections as jest.Mock).mockReturnValue([mockConnection, mockConnection])
      
      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      
      expect(diagnostics.networkStatus.connected).toBe(true)
      expect(diagnostics.networkStatus.peerCount).toBe(2)
      expect(diagnostics.networkStatus.dhtConnected).toBe(true)
    })

    it('should provide DHT status', () => {
      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      
      expect(diagnostics.dhtStatus.connected).toBe(true)
      expect(diagnostics.dhtStatus.routingTableSize).toBe(10)
    })

    it('should calculate health score', () => {
      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      
      expect(diagnostics.troubleshooting.healthScore).toBeGreaterThan(0)
      expect(diagnostics.troubleshooting.healthScore).toBeLessThanOrEqual(100)
    })
  })

  describe('latency measurement', () => {
    beforeEach(() => {
      diagnosticsManager.initialize(mockLibp2p as any)
    })

    it('should measure peer latency', async () => {
      const latencyMs = 150;
      (mockLibp2p.services.ping.ping as jest.Mock).mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, latencyMs))
      })

      // Connect a peer first
      const connectHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'peer:connect')?.[1]
      
      if (connectHandler) {
        connectHandler({ detail: mockPeerId })
      }

      // Manually trigger latency measurement and verify it works
      const measuredLatency = await diagnosticsManager['measureLatency'](mockPeerId)
      expect(measuredLatency).toBeGreaterThanOrEqual(latencyMs)
    })

    it('should handle ping failures gracefully', async () => {
      (mockLibp2p.services.ping.ping as jest.Mock).mockRejectedValue(new Error('Ping failed'))

      // Connect a peer first
      const connectHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'peer:connect')?.[1]
      
      if (connectHandler) {
        connectHandler({ detail: mockPeerId })
      }

      // Should not throw
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const metrics = diagnosticsManager.getPeerMetrics(mockPeerId)
      expect(metrics?.latency).toBe(0)
    })
  })

  describe('connection quality assessment', () => {
    beforeEach(() => {
      diagnosticsManager.initialize(mockLibp2p as any)
    })

    it('should assess connection quality based on latency', () => {
      // Connect a peer
      const connectHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'peer:connect')?.[1]
      
      if (connectHandler) {
        connectHandler({ detail: mockPeerId })
      }

      const metrics = diagnosticsManager.getPeerMetrics(mockPeerId)!
      
      // Test excellent quality (low latency, no packet loss)
      metrics.latency = 50
      metrics.packetsLost = 0
      metrics.packetsReceived = 100
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('excellent')

      // Test good quality
      metrics.latency = 200
      metrics.packetsLost = 2
      metrics.packetsReceived = 100
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('good')

      // Test fair quality
      metrics.latency = 400
      metrics.packetsLost = 8
      metrics.packetsReceived = 100
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('fair')

      // Test poor quality
      metrics.latency = 800
      metrics.packetsLost = 20
      metrics.packetsReceived = 100
      expect(diagnosticsManager['calculateConnectionQuality'](metrics)).toBe('poor')
    })
  })

  describe('issue detection', () => {
    beforeEach(() => {
      diagnosticsManager.initialize(mockLibp2p as any)
    })

    it('should detect connection issues', (done) => {
      mockLibp2p.status = 'stopped'

      diagnosticsManager.on('issues:detected', (issues) => {
        const connectionIssue = issues.find((issue: any) => issue.type === 'connection')
        expect(connectionIssue).toBeTruthy()
        expect(connectionIssue?.severity).toBe('critical')
        done()
      })

      // Trigger issue detection
      diagnosticsManager['detectNetworkIssues']()
    })

    it('should detect DHT issues', (done) => {
      (mockLibp2p.services.dht.isStarted as jest.Mock).mockReturnValue(false)

      diagnosticsManager.on('issues:detected', (issues) => {
        const dhtIssue = issues.find((issue: any) => issue.type === 'dht')
        expect(dhtIssue).toBeTruthy()
        expect(dhtIssue?.severity).toBe('high')
        done()
      })

      diagnosticsManager['detectNetworkIssues']()
    })

    it('should detect low peer count issues', (done) => {
      (mockLibp2p.getConnections as jest.Mock).mockReturnValue([])

      diagnosticsManager.on('issues:detected', (issues) => {
        const peerIssue = issues.find((issue: any) => issue.type === 'peer_discovery')
        expect(peerIssue).toBeTruthy()
        expect(peerIssue?.severity).toBe('medium')
        done()
      })

      diagnosticsManager['detectNetworkIssues']()
    })
  })

  describe('troubleshooting', () => {
    beforeEach(() => {
      diagnosticsManager.initialize(mockLibp2p as any)
    })

    it('should run network troubleshooting', async () => {
      const result = await diagnosticsManager.runNetworkTroubleshooting()
      
      expect(result).toHaveProperty('issues')
      expect(result).toHaveProperty('recommendations')
      expect(result).toHaveProperty('healthScore')
      expect(result).toHaveProperty('canAutoFix')
      expect(result).toHaveProperty('autoFixActions')
    })

    it('should provide recommendations for connection issues', async () => {
      mockLibp2p.status = 'stopped'
      
      const result = await diagnosticsManager.runNetworkTroubleshooting()
      
      expect(result.recommendations).toContain('Check internet connection')
      expect(result.recommendations).toContain('Verify firewall settings')
    })

    it('should suggest auto-fix actions when possible', async () => {
      (mockLibp2p.services.dht.isStarted as jest.Mock).mockReturnValue(false)
      
      const result = await diagnosticsManager.runNetworkTroubleshooting()
      
      expect(result.canAutoFix).toBe(true)
      expect(result.autoFixActions).toContain('Retry DHT bootstrap')
    })
  })

  describe('message statistics', () => {
    beforeEach(() => {
      diagnosticsManager.initialize(mockLibp2p as any)
    })

    it('should track message statistics', () => {
      diagnosticsManager.recordMessageSent()
      diagnosticsManager.recordMessageReceived()
      diagnosticsManager.recordMessageDelivered()
      diagnosticsManager.recordMessageFailed()

      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      
      // Message delivery rate should be calculated
      expect(diagnostics.performance.messageDeliveryRate).toBeGreaterThanOrEqual(0)
      expect(diagnostics.performance.messageDeliveryRate).toBeLessThanOrEqual(100)
    })

    it('should calculate message delivery rate correctly', () => {
      // Send 10 messages, deliver 8
      for (let i = 0; i < 10; i++) {
        diagnosticsManager.recordMessageSent()
      }
      for (let i = 0; i < 8; i++) {
        diagnosticsManager.recordMessageDelivered()
      }

      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      expect(diagnostics.performance.messageDeliveryRate).toBe(80)
    })
  })

  describe('performance metrics', () => {
    beforeEach(() => {
      diagnosticsManager.initialize(mockLibp2p as any)
    })

    it('should calculate performance metrics', () => {
      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      
      expect(diagnostics.performance).toHaveProperty('averageLatency')
      expect(diagnostics.performance).toHaveProperty('totalBandwidth')
      expect(diagnostics.performance).toHaveProperty('connectionSuccess')
      expect(diagnostics.performance).toHaveProperty('messageDeliveryRate')
    })

    it('should calculate average latency from connected peers', () => {
      // Connect multiple peers with different latencies
      const peer1 = 'peer1'
      const peer2 = 'peer2'
      
      const connectHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'peer:connect')?.[1]
      
      if (connectHandler) {
        connectHandler({ detail: peer1 })
        connectHandler({ detail: peer2 })
      }

      // Set different latencies
      const metrics1 = diagnosticsManager.getPeerMetrics(peer1)!
      const metrics2 = diagnosticsManager.getPeerMetrics(peer2)!
      metrics1.latency = 100
      metrics2.latency = 200

      const diagnostics = diagnosticsManager.getNetworkDiagnostics()
      expect(diagnostics.performance.averageLatency).toBe(150)
    })
  })

  describe('cleanup', () => {
    it('should clean up resources on destroy', () => {
      diagnosticsManager.initialize(mockLibp2p as any)
      
      // Add some data
      const connectHandler = mockLibp2p.addEventListener.mock.calls
        .find(call => call[0] === 'peer:connect')?.[1]
      
      if (connectHandler) {
        connectHandler({ detail: mockPeerId })
      }

      expect(diagnosticsManager.getAllPeerMetrics()).toHaveLength(1)
      
      diagnosticsManager.destroy()
      
      expect(diagnosticsManager.getAllPeerMetrics()).toHaveLength(0)
      expect(diagnosticsManager.getNetworkHistory()).toHaveLength(0)
    })
  })
})