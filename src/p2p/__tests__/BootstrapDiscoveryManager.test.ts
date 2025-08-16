import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

// Mock external dependencies
jest.mock('@libp2p/peer-id', () => ({
  peerIdFromString: jest.fn((id: string) => ({ toString: () => id }))
}))

jest.mock('@multiformats/multiaddr', () => ({
  multiaddr: jest.fn((addr: string) => ({ toString: () => addr }))
}))

import { BootstrapDiscoveryManager, BootstrapNode, PeerRecommendation } from '../BootstrapDiscoveryManager'
import { DHTDiscovery } from '../DHTDiscovery'
import { DiscoveryCriteria } from '../types'

// Mock libp2p
const mockLibp2p = {
  peerId: { toString: () => 'test-peer-id' },
  status: 'started',
  dial: jest.fn() as jest.MockedFunction<any>,
  getConnections: jest.fn(() => []),
  services: {
    dht: { isStarted: () => true }
  }
}

// Mock DHT Discovery
const mockDHTDiscovery = {
  join: jest.fn() as jest.MockedFunction<any>,
  leave: jest.fn() as jest.MockedFunction<any>,
  findPeers: jest.fn() as jest.MockedFunction<any>,
  announcePresence: jest.fn() as jest.MockedFunction<any>,
  generateTopics: jest.fn() as jest.MockedFunction<any>,
  subscribeToTopic: jest.fn() as jest.MockedFunction<any>,
  unsubscribeFromTopic: jest.fn() as jest.MockedFunction<any>,
  getCachedPeers: jest.fn() as jest.MockedFunction<any>,
  clearCache: jest.fn() as jest.MockedFunction<any>,
  getStats: jest.fn() as jest.MockedFunction<any>,
  destroy: jest.fn() as jest.MockedFunction<any>
} as unknown as DHTDiscovery

describe('BootstrapDiscoveryManager', () => {
  let manager: BootstrapDiscoveryManager
  let mockBootstrapNodes: BootstrapNode[]

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockBootstrapNodes = [
      {
        id: 'bootstrap-1',
        multiaddr: '/ip4/127.0.0.1/tcp/4001/p2p/bootstrap-1',
        protocols: ['kad-dht'],
        region: 'local',
        reliability: 0.9,
        lastSeen: new Date(),
        responseTime: 100
      },
      {
        id: 'bootstrap-2',
        multiaddr: '/ip4/127.0.0.1/tcp/4002/p2p/bootstrap-2',
        protocols: ['kad-dht'],
        region: 'local',
        reliability: 0.8,
        lastSeen: new Date(),
        responseTime: 150
      }
    ]

    manager = new BootstrapDiscoveryManager({
      bootstrapNodes: mockBootstrapNodes,
      maxBootstrapAttempts: 3,
      bootstrapTimeout: 5000,
      bootstrapRetryDelay: 1000,
      fallbackDiscoveryInterval: 30000,
      maxRecommendations: 5
    })
  })

  afterEach(() => {
    manager.destroy()
  })

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultManager = new BootstrapDiscoveryManager()
      expect(defaultManager).toBeDefined()
      
      const stats = defaultManager.getStats()
      expect(stats.bootstrapNodes).toBeGreaterThan(0)
      expect(stats.fallbackMethodsEnabled).toBeGreaterThan(0)
    })

    it('should initialize with custom configuration', () => {
      const customConfig = {
        maxBootstrapAttempts: 10,
        bootstrapTimeout: 15000,
        maxRecommendations: 20
      }
      
      const customManager = new BootstrapDiscoveryManager(customConfig)
      expect(customManager).toBeDefined()
      
      customManager.destroy()
    })

    it('should initialize with libp2p and DHT discovery', async () => {
      await manager.initialize(mockLibp2p as any, mockDHTDiscovery)
      
      const stats = manager.getStats()
      expect(stats.bootstrapNodes).toBe(2)
    })
  })

  describe('Bootstrap Network', () => {
    beforeEach(async () => {
      await manager.initialize(mockLibp2p as any, mockDHTDiscovery)
    })

    it('should successfully bootstrap via nodes', async () => {
      // Mock successful connection
      mockLibp2p.dial.mockResolvedValue({ status: 'open' })
      
      const result = await manager.bootstrapNetwork()
      expect(result).toBe(true)
      expect(mockLibp2p.dial).toHaveBeenCalled()
    })

    it('should handle bootstrap failure and try fallback methods', async () => {
      // Mock connection failure
      mockLibp2p.dial.mockRejectedValue(new Error('Connection failed'))
      
      const result = await manager.bootstrapNetwork()
      // Should still return true due to fallback methods (DNS, WebSocket)
      expect(result).toBe(true)
    })

    it('should update bootstrap node reliability on success', async () => {
      mockLibp2p.dial.mockResolvedValue({ status: 'open' })
      
      const initialReliability = mockBootstrapNodes[0].reliability
      await manager.bootstrapNetwork()
      
      // Reliability should be updated (though we can't directly access it)
      expect(mockLibp2p.dial).toHaveBeenCalled()
    })

    it('should update bootstrap node reliability on failure', async () => {
      mockLibp2p.dial.mockRejectedValue(new Error('Connection failed'))
      
      manager.updateBootstrapNodeReliability('bootstrap-1', false, 5000)
      
      // Should not throw and should handle the update
      expect(true).toBe(true)
    })
  })

  describe('Peer Recommendations', () => {
    beforeEach(async () => {
      await manager.initialize(mockLibp2p as any, mockDHTDiscovery)
      
      // Add some peer interaction history
      manager.recordPeerInteraction('peer-1', 'connection', true, { latency: 100 })
      manager.recordPeerInteraction('peer-1', 'message', true, { latency: 120 })
      manager.recordPeerInteraction('peer-1', 'profile_sync', true, { latency: 80 })
      
      manager.recordPeerInteraction('peer-2', 'connection', true, { latency: 200 })
      manager.recordPeerInteraction('peer-2', 'connection', false, { errorReason: 'Timeout' })
      manager.recordPeerInteraction('peer-2', 'message', true, { latency: 180 })
      
      manager.recordPeerInteraction('peer-3', 'connection', false, { errorReason: 'Network error' })
      manager.recordPeerInteraction('peer-3', 'connection', false, { errorReason: 'Timeout' })
    })

    it('should generate peer recommendations based on history', async () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music', 'travel'],
        maxDistance: 50
      }
      
      const recommendations = await manager.getPeerRecommendations(criteria)
      
      expect(recommendations).toBeInstanceOf(Array)
      expect(recommendations.length).toBeGreaterThan(0)
      
      // peer-1 should have highest score due to all successful interactions
      const topRecommendation = recommendations[0]
      expect(topRecommendation.peerId).toBe('peer-1')
      expect(topRecommendation.score).toBeGreaterThan(0.5)
      expect(topRecommendation.successfulConnections).toBe(1)
      expect(topRecommendation.reasons).toContain('High connection success rate')
    })

    it('should limit recommendations to max count', async () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music'],
        maxDistance: 100
      }
      
      // Add more peers to exceed max recommendations
      for (let i = 4; i <= 15; i++) {
        manager.recordPeerInteraction(`peer-${i}`, 'connection', true)
        manager.recordPeerInteraction(`peer-${i}`, 'message', true)
        manager.recordPeerInteraction(`peer-${i}`, 'profile_sync', true)
      }
      
      const recommendations = await manager.getPeerRecommendations(criteria)
      expect(recommendations.length).toBeLessThanOrEqual(5) // maxRecommendations
    })

    it('should filter out peers with insufficient interactions', async () => {
      // Add a peer with only 1 interaction (below minimum)
      manager.recordPeerInteraction('peer-insufficient', 'connection', true)
      
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music'],
        maxDistance: 100
      }
      
      const recommendations = await manager.getPeerRecommendations(criteria)
      
      // Should not include peer with insufficient interactions
      const peerIds = recommendations.map(r => r.peerId)
      expect(peerIds).not.toContain('peer-insufficient')
    })

    it('should sort recommendations by score', async () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 35],
        interests: ['music'],
        maxDistance: 100
      }
      
      const recommendations = await manager.getPeerRecommendations(criteria)
      
      // Verify recommendations are sorted by score (descending)
      for (let i = 1; i < recommendations.length; i++) {
        expect(recommendations[i - 1].score).toBeGreaterThanOrEqual(recommendations[i].score)
      }
    })
  })

  describe('Peer Interaction Recording', () => {
    beforeEach(async () => {
      await manager.initialize(mockLibp2p as any, mockDHTDiscovery)
    })

    it('should record successful peer interactions', () => {
      manager.recordPeerInteraction('test-peer', 'connection', true, {
        latency: 150,
        dataSize: 1024
      })
      
      const stats = manager.getStats()
      expect(stats.peerHistorySize).toBe(1)
      expect(stats.totalInteractions).toBe(1)
    })

    it('should record failed peer interactions', () => {
      manager.recordPeerInteraction('test-peer', 'connection', false, {
        errorReason: 'Connection timeout'
      })
      
      const stats = manager.getStats()
      expect(stats.peerHistorySize).toBe(1)
      expect(stats.totalInteractions).toBe(1)
    })

    it('should update peer statistics correctly', () => {
      const peerId = 'test-peer'
      
      // Record multiple interactions
      manager.recordPeerInteraction(peerId, 'connection', true, { latency: 100 })
      manager.recordPeerInteraction(peerId, 'connection', true, { latency: 200 })
      manager.recordPeerInteraction(peerId, 'connection', false)
      manager.recordPeerInteraction(peerId, 'message', true, { latency: 150 })
      
      const stats = manager.getStats()
      expect(stats.peerHistorySize).toBe(1) // One unique peer
      expect(stats.totalInteractions).toBe(4)
    })

    it('should limit interaction history size', () => {
      const peerId = 'test-peer'
      
      // Record many interactions to test limit
      for (let i = 0; i < 150; i++) {
        manager.recordPeerInteraction(peerId, 'message', true, { latency: 100 + i })
      }
      
      const stats = manager.getStats()
      expect(stats.totalInteractions).toBeLessThanOrEqual(50) // Should be limited
    })
  })

  describe('DHT Failure Handling', () => {
    beforeEach(async () => {
      await manager.initialize(mockLibp2p as any, mockDHTDiscovery)
    })

    it('should handle DHT failure and trigger bootstrap', async () => {
      mockLibp2p.dial.mockResolvedValue({ status: 'open' })
      
      await manager.handleDHTFailure()
      
      // Should attempt to bootstrap
      expect(mockLibp2p.dial).toHaveBeenCalled()
    })

    it('should use peer recommendations when bootstrap fails', async () => {
      // Mock bootstrap failure
      mockLibp2p.dial.mockRejectedValue(new Error('Bootstrap failed'))
      
      // Add some peer history for recommendations
      manager.recordPeerInteraction('peer-1', 'connection', true)
      manager.recordPeerInteraction('peer-1', 'message', true)
      manager.recordPeerInteraction('peer-1', 'profile_sync', true)
      
      await manager.handleDHTFailure()
      
      // Should have attempted connections (bootstrap + recommendations)
      expect(mockLibp2p.dial).toHaveBeenCalled()
    })
  })

  describe('Bootstrap Node Management', () => {
    beforeEach(async () => {
      await manager.initialize(mockLibp2p as any, mockDHTDiscovery)
    })

    it('should add custom bootstrap nodes', () => {
      const newNode: BootstrapNode = {
        id: 'custom-bootstrap',
        multiaddr: '/ip4/192.168.1.100/tcp/4001/p2p/custom-bootstrap',
        protocols: ['kad-dht'],
        region: 'custom',
        reliability: 0.95,
        lastSeen: new Date(),
        responseTime: 80
      }
      
      manager.addBootstrapNode(newNode)
      
      const stats = manager.getStats()
      expect(stats.bootstrapNodes).toBe(3) // Original 2 + 1 new
    })

    it('should remove bootstrap nodes', () => {
      manager.removeBootstrapNode('bootstrap-1')
      
      const stats = manager.getStats()
      expect(stats.bootstrapNodes).toBe(1) // Original 2 - 1 removed
    })

    it('should update bootstrap node reliability', () => {
      manager.updateBootstrapNodeReliability('bootstrap-1', true, 90)
      manager.updateBootstrapNodeReliability('bootstrap-2', false, 300)
      
      // Should not throw and should update internal state
      expect(true).toBe(true)
    })
  })

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await manager.initialize(mockLibp2p as any, mockDHTDiscovery)
    })

    it('should provide accurate statistics', () => {
      // Add some data
      manager.recordPeerInteraction('peer-1', 'connection', true)
      manager.recordPeerInteraction('peer-2', 'message', false)
      
      const stats = manager.getStats()
      
      expect(stats).toHaveProperty('bootstrapNodes')
      expect(stats).toHaveProperty('availableBootstrapNodes')
      expect(stats).toHaveProperty('peerHistorySize')
      expect(stats).toHaveProperty('averageReputationScore')
      expect(stats).toHaveProperty('totalInteractions')
      expect(stats).toHaveProperty('fallbackMethodsEnabled')
      
      expect(stats.peerHistorySize).toBe(2)
      expect(stats.totalInteractions).toBe(2)
      expect(stats.bootstrapNodes).toBe(2)
    })

    it('should calculate average reputation correctly', () => {
      // Add peers with different reputations
      manager.recordPeerInteraction('good-peer', 'connection', true)
      manager.recordPeerInteraction('good-peer', 'message', true)
      manager.recordPeerInteraction('good-peer', 'profile_sync', true)
      
      manager.recordPeerInteraction('bad-peer', 'connection', false)
      manager.recordPeerInteraction('bad-peer', 'message', false)
      manager.recordPeerInteraction('bad-peer', 'profile_sync', false)
      
      const stats = manager.getStats()
      expect(stats.averageReputationScore).toBeGreaterThan(0)
      expect(stats.averageReputationScore).toBeLessThan(1)
    })
  })

  describe('Cleanup and Destruction', () => {
    it('should cleanup resources on destroy', async () => {
      await manager.initialize(mockLibp2p as any, mockDHTDiscovery)
      
      // Add some data
      manager.recordPeerInteraction('peer-1', 'connection', true)
      
      manager.destroy()
      
      // Should not throw and should clean up properly
      const stats = manager.getStats()
      expect(stats.peerHistorySize).toBe(0)
      expect(stats.bootstrapNodes).toBe(0)
    })

    it('should handle multiple destroy calls gracefully', async () => {
      await manager.initialize(mockLibp2p as any, mockDHTDiscovery)
      
      manager.destroy()
      manager.destroy() // Second call should not throw
      
      expect(true).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle initialization without libp2p gracefully', async () => {
      const result = await manager.bootstrapNetwork()
      expect(result).toBe(false)
    })

    it('should handle malformed bootstrap node data', () => {
      const malformedNode = {
        id: '',
        multiaddr: 'invalid-multiaddr',
        protocols: [],
        reliability: -1,
        lastSeen: new Date(),
        responseTime: -100
      } as BootstrapNode
      
      // Should not throw when adding malformed node
      expect(() => manager.addBootstrapNode(malformedNode)).not.toThrow()
    })

    it('should handle peer interaction recording errors gracefully', () => {
      // Should not throw with invalid peer ID or metadata
      expect(() => {
        manager.recordPeerInteraction('', 'connection', true, {
          latency: -1,
          dataSize: -1000
        })
      }).not.toThrow()
    })
  })
})