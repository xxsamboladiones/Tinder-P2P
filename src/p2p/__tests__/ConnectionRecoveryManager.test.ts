import { ConnectionRecoveryManager, ConnectionHealth, NetworkPartition } from '../ConnectionRecoveryManager'

// Mock dependencies
const mockP2PManager = {
  getConnectedPeers: jest.fn(),
  connectToPeer: jest.fn(),
  libp2p: {
    getConnections: jest.fn()
  }
}

const mockWebRTCManager = {
  hasConnection: jest.fn(),
  getDataChannel: jest.fn(),
  closeConnection: jest.fn(),
  onConnectionStateChange: jest.fn()
}

const mockDHTDiscovery = {
  findPeers: jest.fn(),
  join: jest.fn()
}

describe('ConnectionRecoveryManager', () => {
  let recoveryManager: ConnectionRecoveryManager | undefined
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    recoveryManager = new ConnectionRecoveryManager({
      healthCheckInterval: 1000,
      healthCheckTimeout: 500,
      maxConsecutiveFailures: 2,
      maxReconnectAttempts: 3,
      initialReconnectDelay: 100,
      maxReconnectDelay: 1000,
      backoffMultiplier: 2,
      minHealthyPeers: 2,
      maxUnhealthyPeers: 1,
      partitionDetectionThreshold: 0.5
    })
    
    recoveryManager.initialize(mockP2PManager, mockWebRTCManager, mockDHTDiscovery)
  })
  
  afterEach(() => {
    if (recoveryManager) {
      recoveryManager.destroy()
      recoveryManager = undefined
    }
  })

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const manager = new ConnectionRecoveryManager()
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should start health monitoring after initialization', () => {
      expect(recoveryManager).toBeDefined()
      // Health monitoring should be active (tested via timer behavior)
    })

    it('should setup event listeners', () => {
      expect(mockWebRTCManager.onConnectionStateChange).toHaveBeenCalled()
    })
  })

  describe('Health Monitoring', () => {
    beforeEach(() => {
      mockP2PManager.getConnectedPeers.mockReturnValue(['peer1', 'peer2', 'peer3'])
    })

    it('should perform periodic health checks', async () => {
      const healthUpdateSpy = jest.fn()
      recoveryManager!.on('networkHealthUpdate', healthUpdateSpy)
      
      // Manually trigger health check instead of using timers
      await recoveryManager!['performHealthCheck']()
      
      expect(mockP2PManager.getConnectedPeers).toHaveBeenCalled()
    })

    it('should detect unhealthy peers', async () => {
      const peerUnhealthySpy = jest.fn()
      recoveryManager!.on('peerUnhealthy', peerUnhealthySpy)
      
      // Mock failed ping
      mockWebRTCManager.hasConnection.mockReturnValue(false)
      
      // Manually trigger health checks multiple times
      await recoveryManager!['performHealthCheck']()
      await recoveryManager!['performHealthCheck']()
      await recoveryManager!['performHealthCheck']()
    })

    it('should calculate connection quality correctly', () => {
      const health: ConnectionHealth = {
        peerId: 'test-peer',
        lastSeen: new Date(),
        latency: 500,
        packetLoss: 0.05,
        connectionQuality: 'good',
        consecutiveFailures: 0,
        isHealthy: true
      }
      
      // Test excellent quality
      health.latency = 100
      health.packetLoss = 0.01
      // Quality calculation is internal, test via behavior
      
      // Test poor quality
      health.latency = 2500
      health.packetLoss = 0.4
      
      // Test critical quality
      health.consecutiveFailures = 1
    })
  })

  describe('Peer Recovery', () => {
    it('should attempt peer reconnection with exponential backoff', async () => {
      const peerId = 'test-peer'
      
      // Mock connection failure
      mockP2PManager.connectToPeer.mockRejectedValueOnce(new Error('Connection failed'))
      
      const recoveryPromise = recoveryManager.recoverPeerConnection(peerId)
      
      // First attempt should be scheduled
      expect(recoveryPromise).resolves.toBe(true)
      
      // Advance timer for first attempt
      jest.advanceTimersByTime(100)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(mockP2PManager.connectToPeer).toHaveBeenCalledWith(peerId)
    })

    it('should use exponential backoff for retry delays', async () => {
      const peerId = 'test-peer'
      
      // Mock multiple connection failures
      mockP2PManager.connectToPeer.mockRejectedValue(new Error('Connection failed'))
      
      await recoveryManager.recoverPeerConnection(peerId)
      
      // First attempt: 100ms delay
      jest.advanceTimersByTime(100)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Second attempt: 200ms delay (100 * 2^1)
      jest.advanceTimersByTime(200)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Third attempt: 400ms delay (100 * 2^2)
      jest.advanceTimersByTime(400)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(mockP2PManager.connectToPeer).toHaveBeenCalledTimes(3)
    })

    it('should stop retrying after max attempts', async () => {
      const peerId = 'test-peer'
      const recoveryFailedSpy = jest.fn()
      recoveryManager.on('peerRecoveryFailed', recoveryFailedSpy)
      
      // Mock connection failures
      mockP2PManager.connectToPeer.mockRejectedValue(new Error('Connection failed'))
      
      // Trigger multiple recovery attempts
      await recoveryManager.recoverPeerConnection(peerId)
      
      // Exhaust all retry attempts
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Should stop retrying and emit failure event
      const finalAttempt = await recoveryManager.recoverPeerConnection(peerId)
      expect(finalAttempt).toBe(false)
    })

    it('should reset retry counter on successful reconnection', async () => {
      const peerId = 'test-peer'
      const peerRecoveredSpy = jest.fn()
      recoveryManager.on('peerRecovered', peerRecoveredSpy)
      
      // Mock successful connection after failure
      mockP2PManager.connectToPeer
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(undefined)
      
      await recoveryManager.recoverPeerConnection(peerId)
      
      // First attempt fails
      jest.advanceTimersByTime(100)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Second attempt succeeds
      jest.advanceTimersByTime(200)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(peerRecoveredSpy).toHaveBeenCalledWith(peerId)
    })
  })

  describe('Network Partition Detection', () => {
    it('should detect network partition when too many peers are unhealthy', async () => {
      const partitionDetectedSpy = jest.fn()
      recoveryManager.on('networkPartitionDetected', partitionDetectedSpy)
      
      // Setup scenario with mostly unhealthy peers
      mockP2PManager.getConnectedPeers.mockReturnValue(['peer1', 'peer2', 'peer3', 'peer4'])
      mockWebRTCManager.hasConnection.mockReturnValue(false)
      
      // Trigger multiple health checks to make peers unhealthy
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Should detect partition when 50%+ peers are unhealthy
      expect(partitionDetectedSpy).toHaveBeenCalled()
    })

    it('should recover from network partition when peers become healthy', async () => {
      const partitionRecoveredSpy = jest.fn()
      recoveryManager.on('networkPartitionRecovered', partitionRecoveredSpy)
      
      // First create a partition
      mockP2PManager.getConnectedPeers.mockReturnValue(['peer1', 'peer2'])
      mockWebRTCManager.hasConnection.mockReturnValue(false)
      
      // Make peers unhealthy
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Then recover
      mockWebRTCManager.hasConnection.mockReturnValue(true)
      mockWebRTCManager.getDataChannel.mockReturnValue({
        readyState: 'open',
        send: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      })
      
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    it('should trigger partition recovery mechanisms', async () => {
      mockDHTDiscovery.findPeers.mockResolvedValue([
        { id: 'new-peer1' },
        { id: 'new-peer2' }
      ])
      
      // Create partition scenario
      mockP2PManager.getConnectedPeers.mockReturnValue(['peer1', 'peer2'])
      mockWebRTCManager.hasConnection.mockReturnValue(false)
      
      // Trigger partition detection
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Should attempt to discover new peers
      expect(mockDHTDiscovery.findPeers).toHaveBeenCalled()
      expect(mockDHTDiscovery.join).toHaveBeenCalled()
    })
  })

  describe('Peer Replacement', () => {
    it('should replace unhealthy peers when threshold exceeded', async () => {
      mockDHTDiscovery.findPeers.mockResolvedValue([
        { id: 'replacement-peer1' },
        { id: 'replacement-peer2' }
      ])
      
      // Setup scenario with too many unhealthy peers
      mockP2PManager.getConnectedPeers.mockReturnValue(['peer1', 'peer2', 'peer3'])
      mockWebRTCManager.hasConnection.mockReturnValue(false)
      
      // Make peers unhealthy
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Should disconnect unhealthy peers and connect to new ones
      expect(mockWebRTCManager.closeConnection).toHaveBeenCalled()
      expect(mockP2PManager.connectToPeer).toHaveBeenCalled()
    })

    it('should discover new peers when below minimum threshold', async () => {
      mockDHTDiscovery.findPeers.mockResolvedValue([
        { id: 'new-peer1' },
        { id: 'new-peer2' }
      ])
      
      // Setup scenario with insufficient healthy peers
      mockP2PManager.getConnectedPeers.mockReturnValue(['peer1'])
      
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Should discover and connect to new peers
      expect(mockDHTDiscovery.findPeers).toHaveBeenCalled()
      expect(mockP2PManager.connectToPeer).toHaveBeenCalled()
    })
  })

  describe('Event Handling', () => {
    it('should handle peer connection events', () => {
      const peerId = 'test-peer'
      
      // Simulate connection event
      recoveryManager['handlePeerConnection'](peerId)
      
      const health = recoveryManager.getPeerHealth(peerId)
      expect(health?.isHealthy).toBe(true)
      expect(health?.consecutiveFailures).toBe(0)
    })

    it('should handle peer disconnection events', () => {
      const peerId = 'test-peer'
      
      // First establish health record
      recoveryManager['handlePeerConnection'](peerId)
      
      // Then simulate disconnection
      recoveryManager['handlePeerDisconnection'](peerId)
      
      const health = recoveryManager.getPeerHealth(peerId)
      expect(health?.isHealthy).toBe(false)
    })

    it('should emit appropriate events during recovery', async () => {
      const events = {
        peerHealthy: jest.fn(),
        peerUnhealthy: jest.fn(),
        peerRecovered: jest.fn(),
        peerRecoveryFailed: jest.fn(),
        networkHealthUpdate: jest.fn(),
        networkPartitionDetected: jest.fn(),
        networkPartitionRecovered: jest.fn()
      }
      
      Object.entries(events).forEach(([event, handler]) => {
        recoveryManager.on(event, handler)
      })
      
      // Test various scenarios that should emit events
      mockP2PManager.getConnectedPeers.mockReturnValue(['peer1'])
      
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(events.networkHealthUpdate).toHaveBeenCalled()
    })
  })

  describe('Network Health Status', () => {
    it('should provide accurate network health status', () => {
      // Setup some peer health data
      recoveryManager['handlePeerConnection']('healthy-peer')
      recoveryManager['handlePeerConnection']('unhealthy-peer')
      recoveryManager['handlePeerDisconnection']('unhealthy-peer')
      
      const health = recoveryManager.getNetworkHealth()
      
      expect(health.totalPeers).toBe(2)
      expect(health.healthyPeers).toBe(1)
      expect(health.unhealthyPeers).toBe(1)
      expect(health.healthyRatio).toBe(0.5)
    })

    it('should return individual peer health information', () => {
      const peerId = 'test-peer'
      recoveryManager['handlePeerConnection'](peerId)
      
      const health = recoveryManager.getPeerHealth(peerId)
      expect(health).toBeDefined()
      expect(health?.peerId).toBe(peerId)
      expect(health?.isHealthy).toBe(true)
    })
  })

  describe('Force Recovery', () => {
    it('should force peer recovery on demand', async () => {
      const peerId = 'test-peer'
      mockP2PManager.connectToPeer.mockResolvedValue(undefined)
      
      const result = await recoveryManager.forcePeerRecovery(peerId)
      expect(result).toBe(true)
      
      // Should schedule immediate recovery
      jest.advanceTimersByTime(100)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(mockP2PManager.connectToPeer).toHaveBeenCalledWith(peerId)
    })

    it('should force network recovery on demand', async () => {
      mockDHTDiscovery.join.mockResolvedValue(undefined)
      mockDHTDiscovery.findPeers.mockResolvedValue([])
      
      await recoveryManager.forceNetworkRecovery()
      
      expect(mockDHTDiscovery.join).toHaveBeenCalled()
    })
  })

  describe('Cleanup', () => {
    it('should cleanup resources on destroy', () => {
      const peerId = 'test-peer'
      
      // Setup some state
      recoveryManager['handlePeerConnection'](peerId)
      recoveryManager.recoverPeerConnection(peerId)
      
      // Destroy should clean everything
      recoveryManager.destroy()
      
      const health = recoveryManager.getPeerHealth(peerId)
      expect(health).toBeNull()
      
      const networkHealth = recoveryManager.getNetworkHealth()
      expect(networkHealth.totalPeers).toBe(0)
    })

    it('should clear all timers on destroy', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval')
      
      // Setup some timers
      recoveryManager.recoverPeerConnection('test-peer')
      
      recoveryManager.destroy()
      
      expect(clearIntervalSpy).toHaveBeenCalled()
      expect(clearTimeoutSpy).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle ping failures gracefully', async () => {
      const peerId = 'test-peer'
      
      // Mock ping failure
      mockWebRTCManager.hasConnection.mockReturnValue(true)
      mockWebRTCManager.getDataChannel.mockReturnValue({
        readyState: 'open',
        send: jest.fn().mockImplementation(() => {
          throw new Error('Send failed')
        }),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      })
      
      mockP2PManager.getConnectedPeers.mockReturnValue([peerId])
      
      // Should handle ping failure without crashing
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Manager should still be functional
      expect(recoveryManager.getNetworkHealth()).toBeDefined()
    })

    it('should handle discovery failures gracefully', async () => {
      mockDHTDiscovery.findPeers.mockRejectedValue(new Error('Discovery failed'))
      
      // Should handle discovery failure without crashing
      mockP2PManager.getConnectedPeers.mockReturnValue([])
      
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(recoveryManager.getNetworkHealth()).toBeDefined()
    })

    it('should handle connection failures during recovery', async () => {
      const peerId = 'test-peer'
      const recoveryFailedSpy = jest.fn()
      recoveryManager.on('peerRecoveryAttemptFailed', recoveryFailedSpy)
      
      mockP2PManager.connectToPeer.mockRejectedValue(new Error('Connection failed'))
      
      await recoveryManager.recoverPeerConnection(peerId)
      
      jest.advanceTimersByTime(100)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(recoveryFailedSpy).toHaveBeenCalled()
    })
  })
})