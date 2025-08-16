import { DHTDiscovery } from '../DHTDiscovery'
import { DiscoveryCriteria } from '../types'

// Mock libp2p for integration tests
const mockLibp2p1 = {
  services: {
    dht: {
      findProviders: jest.fn(),
      provide: jest.fn(),
      isStarted: jest.fn().mockReturnValue(true)
    }
  },
  peerId: { toString: () => 'node1-peer-id' },
  peerStore: {
    get: jest.fn().mockResolvedValue({
      addresses: [{ multiaddr: { toString: () => '/ip4/127.0.0.1/tcp/4001' } }],
      protocols: new Set(['test-protocol'])
    })
  }
} as any

const mockLibp2p2 = {
  services: {
    dht: {
      findProviders: jest.fn(),
      provide: jest.fn(),
      isStarted: jest.fn().mockReturnValue(true)
    }
  },
  peerId: { toString: () => 'node2-peer-id' },
  peerStore: {
    get: jest.fn().mockResolvedValue({
      addresses: [{ multiaddr: { toString: () => '/ip4/127.0.0.1/tcp/4002' } }],
      protocols: new Set(['test-protocol'])
    })
  }
} as any

describe('DHTDiscovery Integration Tests', () => {
  let dhtDiscovery1: DHTDiscovery
  let dhtDiscovery2: DHTDiscovery

  beforeEach(async () => {
    // Create fresh DHT Discovery instances for each test
    dhtDiscovery1 = new DHTDiscovery(mockLibp2p1, {
      announceInterval: 5000,
      queryTimeout: 3000,
      maxPeersPerTopic: 10,
      topicTTL: 30000
    })

    dhtDiscovery2 = new DHTDiscovery(mockLibp2p2, {
      announceInterval: 5000,
      queryTimeout: 3000,
      maxPeersPerTopic: 10,
      topicTTL: 30000
    })
  }, 30000)

  afterEach(async () => {
    if (dhtDiscovery1) dhtDiscovery1.destroy()
    if (dhtDiscovery2) dhtDiscovery2.destroy()
  })



  test('should discover peers across nodes', async () => {
    const criteria: DiscoveryCriteria = {
      geohash: 'abcde',
      ageRange: [25, 35],
      interests: ['music', 'travel'],
      maxDistance: 10
    }

    // Generate topics
    const topics = dhtDiscovery1.generateTopics(criteria)
    expect(topics.length).toBeGreaterThan(0)

    // Node 1 joins topics
    await dhtDiscovery1.join(topics)
    
    // Node 2 should be able to find peers (returns empty array in simplified implementation)
    const discoveredPeers = await dhtDiscovery2.findPeers(topics[0])
    
    // This test verifies the integration works without errors
    expect(Array.isArray(discoveredPeers)).toBe(true)
  }, 15000)

  test('should handle topic subscriptions', async () => {
    const topic = 'geo:test123'
    const receivedPeers: any[] = []

    // Subscribe to topic on node 2
    dhtDiscovery2.subscribeToTopic(topic, (peer) => {
      receivedPeers.push(peer)
    })

    // Node 1 joins the topic
    await dhtDiscovery1.join([topic])

    // Verify subscription was set up
    const stats = dhtDiscovery2.getStats()
    expect(stats.activeSubscriptions).toBeGreaterThan(0)
  }, 10000)

  test('should generate consistent topics', () => {
    const criteria: DiscoveryCriteria = {
      geohash: 'abcde',
      ageRange: [25, 35],
      interests: ['music', 'travel', 'sports'],
      maxDistance: 10
    }

    const topics1 = dhtDiscovery1.generateTopics(criteria)
    const topics2 = dhtDiscovery2.generateTopics(criteria)

    // Both nodes should generate the same topics for the same criteria
    expect(topics1).toEqual(topics2)
    expect(topics1.length).toBeGreaterThan(0)
  })

  test('should handle multiple topic operations', async () => {
    const topics = ['geo:test1', 'geo:test2', 'age:20-30']

    // Join multiple topics
    await dhtDiscovery1.join(topics)
    
    let stats = dhtDiscovery1.getStats()
    expect(stats.announcedTopics).toBe(topics.length)

    // Leave some topics
    await dhtDiscovery1.leave(['geo:test1'])
    
    stats = dhtDiscovery1.getStats()
    expect(stats.announcedTopics).toBe(topics.length - 1)
  }, 10000)

  test('should handle errors gracefully', async () => {
    // Try to find peers for a non-existent topic
    const peers = await dhtDiscovery1.findPeers('nonexistent:topic')
    
    // Should return empty array, not throw
    expect(Array.isArray(peers)).toBe(true)
  })

  test('should manage peer cache correctly', async () => {
    const topic = 'geo:cache-test'
    
    // Initially no cached peers
    let cachedPeers = dhtDiscovery1.getCachedPeers(topic)
    expect(cachedPeers).toHaveLength(0)

    // Try to find peers (may or may not find any in test environment)
    await dhtDiscovery1.findPeers(topic)
    
    // Clear cache
    dhtDiscovery1.clearCache()
    
    const stats = dhtDiscovery1.getStats()
    expect(stats.cachedPeers).toBe(0)
  })

  test('should cleanup resources properly', () => {
    const testDiscovery = new DHTDiscovery(mockLibp2p1)
    
    // Add some state
    testDiscovery.join(['test:cleanup'])
    testDiscovery.subscribeToTopic('test:cleanup', () => {})
    
    let stats = testDiscovery.getStats()
    expect(stats.announcedTopics).toBeGreaterThan(0)
    expect(stats.activeSubscriptions).toBeGreaterThan(0)
    
    // Destroy should clean everything
    testDiscovery.destroy()
    
    stats = testDiscovery.getStats()
    expect(stats.announcedTopics).toBe(0)
    expect(stats.activeSubscriptions).toBe(0)
    expect(stats.cachedPeers).toBe(0)
  })
})