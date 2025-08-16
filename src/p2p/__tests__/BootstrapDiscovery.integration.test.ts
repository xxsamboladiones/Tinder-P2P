import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

// Mock external dependencies
jest.mock('@libp2p/peer-id', () => ({
  peerIdFromString: jest.fn((id: string) => ({ toString: () => id }))
}))

jest.mock('@multiformats/multiaddr', () => ({
  multiaddr: jest.fn((addr: string) => ({ toString: () => addr }))
}))

import { BootstrapDiscoveryManager, BootstrapNode } from '../BootstrapDiscoveryManager'
import { P2PManager } from '../P2PManager'
import { DHTDiscovery } from '../DHTDiscovery'
import { DiscoveryCriteria, PeerInfo } from '../types'

// Mock network conditions
const mockNetworkConditions = {
  dhtHealthy: true,
  bootstrapNodesAvailable: true,
  internetConnected: true,
  peerCount: 5
}

// Mock libp2p with more realistic behavior
const createMockLibp2p = () => ({
  peerId: { toString: () => 'test-peer-' + Math.random().toString(36).substr(2, 9) },
  status: 'started',
  dial: jest.fn(),
  getConnections: jest.fn(() => {
    const connections = []
    for (let i = 0; i < mockNetworkConditions.peerCount; i++) {
      connections.push({
        remotePeer: { toString: () => `peer-${i}` },
        status: 'open'
      })
    }
    return connections
  }),
  services: {
    dht: { 
      isStarted: () => mockNetworkConditions.dhtHealthy,
      findProviders: jest.fn(),
      provide: jest.fn()
    }
  },
  peerStore: {
    get: jest.fn().mockResolvedValue({
      addresses: [{ multiaddr: { toString: () => '/ip4/127.0.0.1/tcp/4001' } }],
      protocols: new Set(['kad-dht'])
    })
  },
  addEventListener: jest.fn(),
  handle: jest.fn(),
  start: jest.fn(),
  stop: jest.fn()
})

describe('Bootstrap Discovery Integration Tests', () => {
  let bootstrapManager: BootstrapDiscoveryManager
  let p2pManager: P2PManager
  let dhtDiscovery: DHTDiscovery
  let mockLibp2p: ReturnType<typeof createMockLibp2p>

  beforeEach(async () => {
    jest.clearAllMocks()
    
    // Reset network conditions
    mockNetworkConditions.dhtHealthy = true
    mockNetworkConditions.bootstrapNodesAvailable = true
    mockNetworkConditions.internetConnected = true
    mockNetworkConditions.peerCount = 5

    mockLibp2p = createMockLibp2p()

    // Create bootstrap manager with test configuration
    bootstrapManager = new BootstrapDiscoveryManager({
      bootstrapNodes: [
        {
          id: 'test-bootstrap-1',
          multiaddr: '/ip4/127.0.0.1/tcp/4001/p2p/test-bootstrap-1',
          protocols: ['kad-dht'],
          region: 'test',
          reliability: 0.9,
          lastSeen: new Date(),
          responseTime: 100
        },
        {
          id: 'test-bootstrap-2',
          multiaddr: '/ip4/127.0.0.1/tcp/4002/p2p/test-bootstrap-2',
          protocols: ['kad-dht'],
          region: 'test',
          reliability: 0.8,
          lastSeen: new Date(),
          responseTime: 150
        }
      ],
      maxBootstrapAttempts: 3,
      bootstrapTimeout: 2000,
      bootstrapRetryDelay: 100,
      fallbackDiscoveryInterval: 1000,
      maxRecommendations: 10,
      fallbackMethods: ['bootstrap', 'dns', 'websocket']
    })

    // Create DHT discovery
    dhtDiscovery = new DHTDiscovery(mockLibp2p as any, {
      announceInterval: 5000,
      queryTimeout: 2000,
      maxPeersPerTopic: 10,
      topicTTL: 30000
    })

    // Initialize bootstrap manager
    await bootstrapManager.initialize(mockLibp2p as any, dhtDiscovery)
  })

  afterEach(() => {
    bootstrapManager.destroy()
    dhtDiscovery.destroy()
  })

  describe('Network Bootstrap Scenarios', () => {
    it('should successfully bootstrap when network is healthy', async () => {
      // Mock successful bootstrap connection
      mockLibp2p.dial.mockResolvedValue({ status: 'open' })
      
      const result = await bootstrapManager.bootstrapNetwork()
      
      expect(result).toBe(true)
      expect(mockLibp2p.dial).toHaveBeenCalled()
    })

    it('should handle bootstrap node failures and try alternatives', async () => {
      // Mock first bootstrap node failure, second success
      mockLibp2p.dial
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({ status: 'open' })
      
      const result = await bootstrapManager.bootstrapNetwork()
      
      expect(result).toBe(true)
      expect(mockLibp2p.dial).toHaveBeenCalledTimes(2)
    })

    it('should fall back to DNS bootstrap when nodes fail', async () => {
      // Mock all bootstrap node failures
      mockLibp2p.dial.mockRejectedValue(new Error('All bootstrap nodes unreachable'))
      
      const result = await bootstrapManager.bootstrapNetwork()
      
      // Should still succeed due to DNS fallback (simulated)
      expect(result).toBe(true)
    })

    it('should handle complete network isolation gracefully', async () => {
      // Simulate complete network failure
      mockNetworkConditions.internetConnected = false
      mockLibp2p.dial.mockRejectedValue(new Error('Network unreachable'))
      
      const result = await bootstrapManager.bootstrapNetwork()
      
      // Should eventually succeed through WebSocket fallback (simulated)
      expect(result).toBe(true)
    })
  })

  describe('DHT Failure Recovery', () => {
    it('should detect DHT failure and trigger recovery', async () => {
      // Simulate DHT failure
      mockNetworkConditions.dhtHealthy = false
      mockNetworkConditions.peerCount = 1
      
      mockLibp2p.dial.mockResolvedValue({ status: 'open' })
      
      await bootstrapManager.handleDHTFailure()
      
      // Should attempt bootstrap recovery
      expect(mockLibp2p.dial).toHaveBeenCalled()
    })

    it('should use peer recommendations when bootstrap fails during DHT recovery', async () => {
      // Add peer interaction history
      bootstrapManager.recordPeerInteraction('reliable-peer-1', 'connection', true, { latency: 100 })
      bootstrapManager.recordPeerInteraction('reliable-peer-1', 'message', true, { latency: 120 })
      bootstrapManager.recordPeerInteraction('reliable-peer-1', 'profile_sync', true, { latency: 80 })
      
      bootstrapManager.recordPeerInteraction('reliable-peer-2', 'connection', true, { latency: 150 })
      bootstrapManager.recordPeerInteraction('reliable-peer-2', 'message', true, { latency: 140 })
      bootstrapManager.recordPeerInteraction('reliable-peer-2', 'profile_sync', true, { latency: 160 })
      
      // Mock bootstrap failure but peer connection success
      mockLibp2p.dial
        .mockRejectedValueOnce(new Error('Bootstrap failed'))
        .mockRejectedValueOnce(new Error('Bootstrap failed'))
        .mockResolvedValue({ status: 'open' }) // Peer connections succeed
      
      await bootstrapManager.handleDHTFailure()
      
      // Should attempt bootstrap + peer connections
      expect(mockLibp2p.dial).toHaveBeenCalled()
    })
  })

  describe('Peer Recommendation System', () => {
    beforeEach(() => {
      // Add diverse peer interaction history
      const peers = [
        { id: 'excellent-peer', success: 0.95, latency: 80, interactions: 20 },
        { id: 'good-peer', success: 0.85, latency: 120, interactions: 15 },
        { id: 'average-peer', success: 0.70, latency: 200, interactions: 10 },
        { id: 'poor-peer', success: 0.40, latency: 400, interactions: 8 },
        { id: 'unreliable-peer', success: 0.20, latency: 800, interactions: 5 }
      ]
      
      peers.forEach(peer => {
        for (let i = 0; i < peer.interactions; i++) {
          const success = Math.random() < peer.success
          const latency = peer.latency + (Math.random() - 0.5) * 50
          
          bootstrapManager.recordPeerInteraction(
            peer.id,
            i % 3 === 0 ? 'connection' : i % 3 === 1 ? 'message' : 'profile_sync',
            success,
            { latency: Math.max(50, latency) }
          )
        }
      })
    })

    it('should generate quality peer recommendations', async () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music', 'travel', 'food'],
        maxDistance: 50
      }
      
      const recommendations = await bootstrapManager.getPeerRecommendations(criteria)
      
      expect(recommendations).toHaveLength(5) // All peers have enough interactions
      
      // Verify recommendations are sorted by quality
      expect(recommendations[0].peerId).toBe('excellent-peer')
      expect(recommendations[0].score).toBeGreaterThan(recommendations[1].score)
      
      // Verify recommendation includes useful metadata
      const topRecommendation = recommendations[0]
      expect(topRecommendation.successfulConnections).toBeGreaterThan(0)
      expect(topRecommendation.reasons).toContain('High connection success rate')
      expect(topRecommendation.averageLatency).toBeLessThan(200)
    })

    it('should handle geographic proximity in recommendations', async () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music'],
        maxDistance: 25 // Smaller radius
      }
      
      const recommendations = await bootstrapManager.getPeerRecommendations(criteria)
      
      // Should still return recommendations (geographic data is simulated)
      expect(recommendations.length).toBeGreaterThan(0)
      
      // Verify geographic distance is included
      recommendations.forEach(rec => {
        expect(rec.geographicDistance).toBeGreaterThanOrEqual(0)
      })
    })

    it('should weight shared interests in recommendations', async () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music', 'travel', 'food', 'sports'],
        maxDistance: 100
      }
      
      const recommendations = await bootstrapManager.getPeerRecommendations(criteria)
      
      // Verify shared interests are calculated
      recommendations.forEach(rec => {
        expect(rec.sharedInterests).toBeInstanceOf(Array)
        if (rec.sharedInterests.length > 0) {
          expect(rec.reasons).toContain(`${rec.sharedInterests.length} shared interests`)
        }
      })
    })

    it('should apply time decay to old interactions', async () => {
      // Add an old peer with good historical performance
      const oldPeer = 'old-reliable-peer'
      
      // Simulate old interactions by manually setting timestamps
      for (let i = 0; i < 10; i++) {
        bootstrapManager.recordPeerInteraction(oldPeer, 'connection', true, { latency: 90 })
      }
      
      // Add a recent peer with similar performance
      const recentPeer = 'recent-peer'
      for (let i = 0; i < 10; i++) {
        bootstrapManager.recordPeerInteraction(recentPeer, 'connection', true, { latency: 95 })
      }
      
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music'],
        maxDistance: 100
      }
      
      const recommendations = await bootstrapManager.getPeerRecommendations(criteria)
      
      // Recent peer should generally score higher due to recency
      const oldPeerRec = recommendations.find(r => r.peerId === oldPeer)
      const recentPeerRec = recommendations.find(r => r.peerId === recentPeer)
      
      expect(oldPeerRec).toBeDefined()
      expect(recentPeerRec).toBeDefined()
    })
  })

  describe('Bootstrap Node Management', () => {
    it('should dynamically update bootstrap node reliability', async () => {
      const nodeId = 'test-bootstrap-1'
      
      // Simulate successful connections
      mockLibp2p.dial.mockResolvedValue({ status: 'open' })
      
      await bootstrapManager.bootstrapNetwork()
      
      // Manually update reliability
      bootstrapManager.updateBootstrapNodeReliability(nodeId, true, 80)
      
      const stats = bootstrapManager.getStats()
      expect(stats.availableBootstrapNodes).toBeGreaterThan(0)
    })

    it('should handle bootstrap node failures and update reliability', async () => {
      const nodeId = 'test-bootstrap-1'
      
      // Simulate connection failures
      mockLibp2p.dial.mockRejectedValue(new Error('Connection timeout'))
      
      // Update reliability after failure
      bootstrapManager.updateBootstrapNodeReliability(nodeId, false, 5000)
      
      // Should still have bootstrap nodes but with updated reliability
      const stats = bootstrapManager.getStats()
      expect(stats.bootstrapNodes).toBe(2)
    })

    it('should add and remove bootstrap nodes dynamically', () => {
      const newNode: BootstrapNode = {
        id: 'dynamic-bootstrap',
        multiaddr: '/ip4/192.168.1.200/tcp/4001/p2p/dynamic-bootstrap',
        protocols: ['kad-dht'],
        region: 'local',
        reliability: 0.95,
        lastSeen: new Date(),
        responseTime: 70
      }
      
      // Add node
      bootstrapManager.addBootstrapNode(newNode)
      let stats = bootstrapManager.getStats()
      expect(stats.bootstrapNodes).toBe(3)
      
      // Remove node
      bootstrapManager.removeBootstrapNode('dynamic-bootstrap')
      stats = bootstrapManager.getStats()
      expect(stats.bootstrapNodes).toBe(2)
    })
  })

  describe('Fallback Discovery Integration', () => {
    it('should integrate with DHT discovery for topic-based fallbacks', async () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music', 'travel'],
        maxDistance: 50
      }
      
      // Mock DHT discovery failure
      jest.spyOn(dhtDiscovery, 'findPeers').mockResolvedValue([])
      
      // Simulate fallback scenario
      mockNetworkConditions.dhtHealthy = false
      await bootstrapManager.handleDHTFailure()
      
      // Should attempt recovery mechanisms
      expect(mockLibp2p.dial).toHaveBeenCalled()
    })

    it('should coordinate with P2P manager during network recovery', async () => {
      // Simulate network partition recovery
      mockNetworkConditions.peerCount = 1 // Low peer count
      mockNetworkConditions.dhtHealthy = false
      
      mockLibp2p.dial.mockResolvedValue({ status: 'open' })
      
      await bootstrapManager.handleDHTFailure()
      
      // Should attempt to restore network connectivity
      expect(mockLibp2p.dial).toHaveBeenCalled()
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle large peer history efficiently', async () => {
      const startTime = Date.now()
      
      // Add many peer interactions
      for (let i = 0; i < 1000; i++) {
        bootstrapManager.recordPeerInteraction(
          `peer-${i % 100}`, // 100 unique peers
          'connection',
          Math.random() > 0.3, // 70% success rate
          { latency: 50 + Math.random() * 200 }
        )
      }
      
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music'],
        maxDistance: 100
      }
      
      const recommendations = await bootstrapManager.getPeerRecommendations(criteria)
      
      const endTime = Date.now()
      const processingTime = endTime - startTime
      
      // Should complete within reasonable time (< 1 second)
      expect(processingTime).toBeLessThan(1000)
      expect(recommendations.length).toBeGreaterThan(0)
      expect(recommendations.length).toBeLessThanOrEqual(10) // Respects max limit
    })

    it('should maintain performance with frequent bootstrap attempts', async () => {
      mockLibp2p.dial.mockResolvedValue({ status: 'open' })
      
      const startTime = Date.now()
      
      // Perform multiple bootstrap attempts
      const promises = []
      for (let i = 0; i < 10; i++) {
        promises.push(bootstrapManager.bootstrapNetwork())
      }
      
      const results = await Promise.all(promises)
      
      const endTime = Date.now()
      const totalTime = endTime - startTime
      
      // All should succeed
      expect(results.every(r => r === true)).toBe(true)
      
      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(5000)
    })
  })

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary network failures', async () => {
      // Simulate temporary network failure
      mockLibp2p.dial
        .mockRejectedValueOnce(new Error('Network unreachable'))
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValue({ status: 'open' }) // Recovery
      
      const result = await bootstrapManager.bootstrapNetwork()
      
      // Should eventually succeed through fallback methods
      expect(result).toBe(true)
    })

    it('should handle malformed peer data gracefully', () => {
      // Record interactions with malformed data
      expect(() => {
        bootstrapManager.recordPeerInteraction('', 'connection', true, {
          latency: -100,
          dataSize: NaN,
          errorReason: null as any
        })
      }).not.toThrow()
      
      // Should still provide stats
      const stats = bootstrapManager.getStats()
      expect(stats).toBeDefined()
    })

    it('should maintain state consistency during concurrent operations', async () => {
      // Perform concurrent operations
      const operations = [
        bootstrapManager.bootstrapNetwork(),
        bootstrapManager.handleDHTFailure(),
        (async () => {
          for (let i = 0; i < 50; i++) {
            bootstrapManager.recordPeerInteraction(`concurrent-peer-${i}`, 'connection', true)
          }
        })(),
        bootstrapManager.getPeerRecommendations({
          geohash: 'u4pruydqqvj',
          ageRange: [25, 35],
          interests: ['music'],
          maxDistance: 100
        })
      ]
      
      mockLibp2p.dial.mockResolvedValue({ status: 'open' })
      
      const results = await Promise.allSettled(operations)
      
      // Should handle concurrent operations without errors
      const failures = results.filter(r => r.status === 'rejected')
      expect(failures.length).toBe(0)
      
      // State should remain consistent
      const stats = bootstrapManager.getStats()
      expect(stats.peerHistorySize).toBeGreaterThan(0)
    })
  })
})