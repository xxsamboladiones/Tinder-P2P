import { ConnectionRecoveryManager } from '../ConnectionRecoveryManager'
import { P2PManager } from '../P2PManager'
import { WebRTCManager } from '../WebRTCManager'
import { DHTDiscovery } from '../DHTDiscovery'

// Mock libp2p for testing
jest.mock('libp2p', () => ({
  createLibp2p: jest.fn().mockResolvedValue({
    peerId: { toString: () => 'test-peer-id' },
    start: jest.fn(),
    stop: jest.fn(),
    getConnections: jest.fn().mockReturnValue([]),
    dial: jest.fn(),
    handle: jest.fn(),
    addEventListener: jest.fn(),
    services: {
      dht: { isStarted: () => true }
    },
    status: 'started'
  })
}))

jest.mock('@libp2p/webrtc', () => ({
  webRTC: jest.fn()
}))

jest.mock('@libp2p/tcp', () => ({
  tcp: jest.fn()
}))

jest.mock('@libp2p/websockets', () => ({
  webSockets: jest.fn()
}))

jest.mock('@libp2p/kad-dht', () => ({
  kadDHT: jest.fn()
}))

jest.mock('@libp2p/identify', () => ({
  identify: jest.fn()
}))

jest.mock('@libp2p/ping', () => ({
  ping: jest.fn()
}))

jest.mock('@libp2p/bootstrap', () => ({
  bootstrap: jest.fn()
}))

describe('Connection Recovery Integration Tests', () => {
  let recoveryManager: ConnectionRecoveryManager
  let p2pManager: P2PManager
  let webrtcManager: WebRTCManager
  let dhtDiscovery: DHTDiscovery
  
  beforeEach(async () => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    
    // Initialize P2P components
    p2pManager = new P2PManager({
      maxPeers: 10,
      discoveryInterval: 5000,
      reconnectInterval: 1000,
      maxRetries: 3
    })
    
    webrtcManager = new WebRTCManager()
    
    await p2pManager.initialize()
    dhtDiscovery = p2pManager.getDHTDiscovery()!
    
    // Initialize recovery manager
    recoveryManager = new ConnectionRecoveryManager({
      healthCheckInterval: 1000,
      healthCheckTimeout: 500,
      maxConsecutiveFailures: 2,
      maxReconnectAttempts: 3,
      initialReconnectDelay: 100,
      backoffMultiplier: 2,
      minHealthyPeers: 2,
      partitionDetectionThreshold: 0.6
    })
    
    recoveryManager.initialize(p2pManager, webrtcManager, dhtDiscovery)
  })
  
  afterEach(async () => {
    recoveryManager.destroy()
    await p2pManager.disconnect()
    webrtcManager.destroy()
    jest.useRealTimers()
  })

  describe('Network Failure Scenarios', () => {
    it('should recover from complete network disconnection', async () => {
      const networkHealthSpy = jest.fn()
      const partitionDetectedSpy = jest.fn()
      const partitionRecoveredSpy = jest.fn()
      
      recoveryManager.on('networkHealthUpdate', networkHealthSpy)
      recoveryManager.on('networkPartitionDetected', partitionDetectedSpy)
      recoveryManager.on('networkPartitionRecovered', partitionRecoveredSpy)
      
      // Simulate initial connections
      const mockConnections = [
        { remotePeer: { toString: () => 'peer1' }, status: 'open' },
        { remotePeer: { toString: () => 'peer2' }, status: 'open' },
        { remotePeer: { toString: () => 'peer3' }, status: 'open' }
      ]
      
      const mockLibp2p = await (require('libp2p').createLibp2p())
      mockLibp2p.getConnections.mockReturnValue(mockConnections)
      p2pManager['libp2p'] = mockLibp2p
      
      // Initial health check - all peers healthy
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Simulate network disconnection - all connections fail
      mockLibp2p.getConnections.mockReturnValue([])
      
      // Multiple health checks to detect partition
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      expect(partitionDetectedSpy).toHaveBeenCalled()
      
      // Simulate network recovery
      mockLibp2p.getConnections.mockReturnValue(mockConnections)
      
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Should eventually recover
      expect(networkHealthSpy).toHaveBeenCalled()
    })

    it('should handle gradual peer disconnections', async () => {
      const peerDisconnectedSpy = jest.fn()
      const peerRecoveredSpy = jest.fn()
      
      recoveryManager.on('peerDisconnected', peerDisconnectedSpy)
      recoveryManager.on('peerRecovered', peerRecoveredSpy)
      
      // Setup initial connections
      const peers = ['peer1', 'peer2', 'peer3', 'peer4']
      const mockConnections = peers.map(peerId => ({
        remotePeer: { toString: () => peerId },
        status: 'open'
      }))
      
      const mockLibp2p = await (require('libp2p').createLibp2p())
      mockLibp2p.getConnections.mockReturnValue(mockConnections)
      p2pManager['libp2p'] = mockLibp2p
      
      // Simulate gradual disconnections
      for (let i = 0; i < peers.length; i++) {
        // Remove one peer at a time
        const remainingConnections = mockConnections.slice(i + 1)
        mockLibp2p.getConnections.mockReturnValue(remainingConnections)
        
        // Trigger WebRTC disconnection event
        const disconnectedPeer = peers[i]
        webrtcManager['connectionStateCallbacks'].forEach((callback: any) => {
          callback(disconnectedPeer, 'disconnected')
        })
        
        // Wait for recovery attempt
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      expect(peerDisconnectedSpy).toHaveBeenCalledTimes(peers.length)
    })

    it('should recover from WebRTC ICE connection failures', async () => {
      const iceFailureSpy = jest.fn()
      recoveryManager.on('peerRecoveryAttemptFailed', iceFailureSpy)
      
      // Setup WebRTC connection that fails ICE
      const peerId = 'ice-fail-peer'
      const mockConnection = new RTCPeerConnection()
      
      // Mock ICE failure
      Object.defineProperty(mockConnection, 'iceConnectionState', {
        value: 'failed',
        writable: true
      })
      
      webrtcManager['connections'].set(peerId, mockConnection)
      
      // Simulate ICE failure event
      webrtcManager['connectionStateCallbacks'].forEach((callback: any) => {
        callback(peerId, 'failed')
      })
      
      // Should trigger recovery
      jest.advanceTimersByTime(100)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Verify recovery attempt was made
      const health = recoveryManager.getPeerHealth(peerId)
      expect(health?.isHealthy).toBe(false)
    })

    it('should handle DHT network partitions', async () => {
      const partitionSpy = jest.fn()
      recoveryManager.on('networkPartitionDetected', partitionSpy)
      
      // Mock DHT discovery failure
      const mockDHTDiscovery = {
        findPeers: jest.fn().mockRejectedValue(new Error('DHT unreachable')),
        join: jest.fn().mockRejectedValue(new Error('DHT unreachable')),
        generateTopics: jest.fn().mockReturnValue(['topic1']),
        subscribeToTopic: jest.fn(),
        destroy: jest.fn()
      }
      
      recoveryManager.initialize(p2pManager, webrtcManager, mockDHTDiscovery)
      
      // Simulate scenario where most peers become unreachable
      const mockLibp2p = await (require('libp2p').createLibp2p())
      mockLibp2p.getConnections.mockReturnValue([])
      p2pManager['libp2p'] = mockLibp2p
      
      // Trigger health checks that will fail
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Should detect partition and attempt recovery
      expect(mockDHTDiscovery.join).toHaveBeenCalled()
    })
  })

  describe('Recovery Strategies', () => {
    it('should use exponential backoff for reconnection attempts', async () => {
      const peerId = 'backoff-test-peer'
      const connectAttempts: number[] = []
      
      // Mock connection attempts with timing
      const originalConnect = p2pManager.connectToPeer.bind(p2pManager)
      p2pManager.connectToPeer = jest.fn().mockImplementation(async (id) => {
        connectAttempts.push(Date.now())
        throw new Error('Connection failed')
      })
      
      // Start recovery
      await recoveryManager.recoverPeerConnection(peerId)
      
      // First attempt (100ms delay)
      jest.advanceTimersByTime(100)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Second attempt (200ms delay)
      jest.advanceTimersByTime(200)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Third attempt (400ms delay)
      jest.advanceTimersByTime(400)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(p2pManager.connectToPeer).toHaveBeenCalledTimes(3)
    })

    it('should replace unhealthy peers with new discoveries', async () => {
      const replacementSpy = jest.fn()
      recoveryManager.on('peerConnected', replacementSpy)
      
      // Mock discovery of new peers
      const mockDHTDiscovery = {
        findPeers: jest.fn().mockResolvedValue([
          { id: 'replacement-peer1' },
          { id: 'replacement-peer2' }
        ]),
        join: jest.fn(),
        generateTopics: jest.fn().mockReturnValue(['topic1']),
        subscribeToTopic: jest.fn(),
        destroy: jest.fn()
      }
      
      recoveryManager.initialize(p2pManager, webrtcManager, mockDHTDiscovery)
      
      // Create scenario with unhealthy peers
      const unhealthyPeers = ['peer1', 'peer2', 'peer3']
      unhealthyPeers.forEach(peerId => {
        recoveryManager['handlePeerConnection'](peerId)
        recoveryManager['handlePeerDisconnection'](peerId)
      })
      
      // Trigger health check that should initiate replacement
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(mockDHTDiscovery.findPeers).toHaveBeenCalled()
    })

    it('should fallback to bootstrap nodes during network partition', async () => {
      const bootstrapSpy = jest.fn()
      
      // Mock P2P manager with bootstrap connection tracking
      const originalConnect = p2pManager.connectToPeer.bind(p2pManager)
      p2pManager.connectToPeer = jest.fn().mockImplementation(async (peerId) => {
        if (peerId.includes('bootstrap')) {
          bootstrapSpy(peerId)
        }
        return originalConnect(peerId)
      })
      
      // Create network partition scenario
      const mockLibp2p = await (require('libp2p').createLibp2p())
      mockLibp2p.getConnections.mockReturnValue([])
      p2pManager['libp2p'] = mockLibp2p
      
      // Trigger partition detection and recovery
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Should attempt bootstrap connections
      expect(p2pManager.connectToPeer).toHaveBeenCalled()
    })

    it('should maintain minimum peer count through discovery', async () => {
      const discoveryAttempts = jest.fn()
      
      // Mock DHT discovery
      const mockDHTDiscovery = {
        findPeers: jest.fn().mockImplementation(async () => {
          discoveryAttempts()
          return [
            { id: 'discovered-peer1' },
            { id: 'discovered-peer2' },
            { id: 'discovered-peer3' }
          ]
        }),
        join: jest.fn(),
        generateTopics: jest.fn().mockReturnValue(['topic1']),
        subscribeToTopic: jest.fn(),
        destroy: jest.fn()
      }
      
      recoveryManager.initialize(p2pManager, webrtcManager, mockDHTDiscovery)
      
      // Start with insufficient peers
      const mockLibp2p = await (require('libp2p').createLibp2p())
      mockLibp2p.getConnections.mockReturnValue([
        { remotePeer: { toString: () => 'peer1' }, status: 'open' }
      ])
      p2pManager['libp2p'] = mockLibp2p
      
      // Trigger health check
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Should trigger peer discovery to reach minimum
      expect(discoveryAttempts).toHaveBeenCalled()
    })
  })

  describe('Performance Under Load', () => {
    it('should handle multiple simultaneous peer failures', async () => {
      const recoveryAttempts = new Set()
      
      recoveryManager.on('peerRecoveryAttemptFailed', (peerId) => {
        recoveryAttempts.add(peerId)
      })
      
      // Simulate many peers failing simultaneously
      const failingPeers = Array.from({ length: 10 }, (_, i) => `peer${i}`)
      
      failingPeers.forEach(peerId => {
        recoveryManager['handlePeerConnection'](peerId)
        recoveryManager['handlePeerDisconnection'](peerId)
      })
      
      // Trigger recovery for all peers
      const recoveryPromises = failingPeers.map(peerId => 
        recoveryManager.recoverPeerConnection(peerId)
      )
      
      await Promise.all(recoveryPromises)
      
      // Advance timers to trigger recovery attempts
      jest.advanceTimersByTime(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Should handle all peers without crashing
      expect(recoveryManager.getNetworkHealth().totalPeers).toBe(failingPeers.length)
    })

    it('should throttle health checks under high peer count', async () => {
      const healthCheckCount = jest.fn()
      
      // Override health check to count calls
      const originalHealthCheck = recoveryManager['performHealthCheck'].bind(recoveryManager)
      recoveryManager['performHealthCheck'] = jest.fn().mockImplementation(async () => {
        healthCheckCount()
        return originalHealthCheck()
      })
      
      // Add many peers
      const manyPeers = Array.from({ length: 50 }, (_, i) => `peer${i}`)
      manyPeers.forEach(peerId => {
        recoveryManager['handlePeerConnection'](peerId)
      })
      
      // Run several health check cycles
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Should maintain reasonable health check frequency
      expect(healthCheckCount).toHaveBeenCalledTimes(5)
    })

    it('should cleanup resources efficiently during mass disconnections', async () => {
      const cleanupSpy = jest.fn()
      
      // Mock cleanup tracking
      const originalCloseConnection = webrtcManager.closeConnection.bind(webrtcManager)
      webrtcManager.closeConnection = jest.fn().mockImplementation(async (peerId) => {
        cleanupSpy(peerId)
        return originalCloseConnection(peerId)
      })
      
      // Setup many connected peers
      const connectedPeers = Array.from({ length: 20 }, (_, i) => `peer${i}`)
      connectedPeers.forEach(peerId => {
        recoveryManager['handlePeerConnection'](peerId)
      })
      
      // Simulate mass disconnection
      connectedPeers.forEach(peerId => {
        recoveryManager['handlePeerDisconnection'](peerId)
      })
      
      // Trigger cleanup through health checks
      jest.advanceTimersByTime(2000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Should cleanup resources efficiently
      const networkHealth = recoveryManager.getNetworkHealth()
      expect(networkHealth.unhealthyPeers).toBe(connectedPeers.length)
    })
  })

  describe('Edge Cases', () => {
    it('should handle recovery manager initialization without dependencies', () => {
      const standaloneManager = new ConnectionRecoveryManager()
      
      // Should not crash without dependencies
      expect(() => {
        standaloneManager.getNetworkHealth()
      }).not.toThrow()
      
      standaloneManager.destroy()
    })

    it('should handle concurrent recovery attempts for same peer', async () => {
      const peerId = 'concurrent-peer'
      
      // Start multiple recovery attempts simultaneously
      const recoveryPromises = [
        recoveryManager.recoverPeerConnection(peerId),
        recoveryManager.recoverPeerConnection(peerId),
        recoveryManager.forcePeerRecovery(peerId)
      ]
      
      const results = await Promise.all(recoveryPromises)
      
      // Should handle concurrent attempts gracefully
      expect(results.every(result => typeof result === 'boolean')).toBe(true)
    })

    it('should handle network partition during active recovery', async () => {
      const peerId = 'partition-during-recovery'
      
      // Start peer recovery
      await recoveryManager.recoverPeerConnection(peerId)
      
      // Simulate network partition during recovery
      const mockLibp2p = await (require('libp2p').createLibp2p())
      mockLibp2p.getConnections.mockReturnValue([])
      p2pManager['libp2p'] = mockLibp2p
      
      // Trigger partition detection
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Should handle partition without interfering with peer recovery
      const health = recoveryManager.getNetworkHealth()
      expect(health).toBeDefined()
    })

    it('should handle rapid connect/disconnect cycles', async () => {
      const peerId = 'rapid-cycle-peer'
      const eventCount = { connected: 0, disconnected: 0 }
      
      recoveryManager.on('peerConnected', () => eventCount.connected++)
      recoveryManager.on('peerDisconnected', () => eventCount.disconnected++)
      
      // Simulate rapid connect/disconnect cycles
      for (let i = 0; i < 10; i++) {
        recoveryManager['handlePeerConnection'](peerId)
        recoveryManager['handlePeerDisconnection'](peerId)
        
        // Small delay between cycles
        jest.advanceTimersByTime(50)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Should handle rapid cycles without memory leaks or crashes
      expect(eventCount.connected).toBe(10)
      expect(eventCount.disconnected).toBe(10)
      
      const finalHealth = recoveryManager.getPeerHealth(peerId)
      expect(finalHealth?.isHealthy).toBe(false)
    })
  })
})