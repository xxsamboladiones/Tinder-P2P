import { DHTDiscovery } from '../DHTDiscovery'
import { DiscoveryCriteria, PeerInfo } from '../types'
import type { Libp2p } from 'libp2p'
import type { KadDHT } from '@libp2p/kad-dht'
import type { PeerId } from '@libp2p/interface'

// Mock libp2p and DHT
const mockDHT = {
  findProviders: jest.fn(),
  provide: jest.fn(),
  isStarted: jest.fn().mockReturnValue(true)
} as unknown as KadDHT

const mockPeerId = {
  toString: jest.fn().mockReturnValue('test-peer-id')
} as unknown as PeerId

const mockPeerStore = {
  get: jest.fn().mockResolvedValue({
    addresses: [
      { multiaddr: { toString: () => '/ip4/127.0.0.1/tcp/4001' } }
    ],
    protocols: new Set(['test-protocol'])
  })
}

const mockLibp2p = {
  services: {
    dht: mockDHT
  },
  peerId: mockPeerId,
  peerStore: mockPeerStore
} as unknown as Libp2p

describe('DHTDiscovery', () => {
  let dhtDiscovery: DHTDiscovery

  beforeEach(() => {
    jest.clearAllMocks()
    dhtDiscovery = new DHTDiscovery(mockLibp2p, {
      announceInterval: 1000, // Shorter for testing
      queryTimeout: 5000,
      maxPeersPerTopic: 10,
      topicTTL: 60000
    })
  })

  afterEach(() => {
    dhtDiscovery.destroy()
  })

  describe('Topic Management', () => {
    test('should join topics successfully', async () => {
      const topics = ['geo:abcde', 'age:20-30']
      
      await dhtDiscovery.join(topics)
      
      const stats = dhtDiscovery.getStats()
      expect(stats.announcedTopics).toBe(2)
    })

    test('should leave topics successfully', async () => {
      const topics = ['geo:abcde', 'age:20-30']
      
      // First join topics
      await dhtDiscovery.join(topics)
      expect(dhtDiscovery.getStats().announcedTopics).toBe(2)
      
      // Then leave topics
      await dhtDiscovery.leave(topics)
      expect(dhtDiscovery.getStats().announcedTopics).toBe(0)
    })

    test('should generate topics from discovery criteria', () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru', // Use a valid geohash
        ageRange: [25, 35],
        interests: ['music', 'travel', 'sports', 'reading'],
        maxDistance: 10
      }

      const topics = dhtDiscovery.generateTopics(criteria)
      
      expect(topics.some(topic => topic.includes('dr5ru'))).toBe(true)
      expect(topics).toContain('age:20-30')
      expect(topics).toContain('interest:music')
      expect(topics).toContain('interest:travel')
      expect(topics).toContain('interest:sports')
      
      // Should limit to top 3 interests
      expect(topics.filter(t => t.startsWith('interest:'))).toHaveLength(3)
    })
  })

  describe('Peer Discovery', () => {
    test('should find peers for a topic', async () => {
      // Add peers to cache first
      const mockPeer1: PeerInfo = {
        id: 'peer1',
        multiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
        protocols: ['test-protocol'],
        metadata: {
          geohash: 'abcde',
          ageRange: [25, 35],
          interests: ['music'],
          lastSeen: new Date()
        }
      }
      
      const mockPeer2: PeerInfo = {
        id: 'peer2',
        multiaddrs: ['/ip4/127.0.0.1/tcp/4002'],
        protocols: ['test-protocol'],
        metadata: {
          geohash: 'abcde',
          ageRange: [25, 35],
          interests: ['music'],
          lastSeen: new Date()
        }
      }
      
      // Manually add to cache for testing
      ;(dhtDiscovery as any).peerCache.set('peer1', mockPeer1)
      ;(dhtDiscovery as any).peerCache.set('peer2', mockPeer2)

      const peers = await dhtDiscovery.findPeers('geo:abcde')
      
      expect(peers).toHaveLength(2)
      expect(peers[0].id).toBe('peer1')
      expect(peers[1].id).toBe('peer2')
    })

    test('should limit peers per topic', async () => {
      const maxPeers = 3
      dhtDiscovery = new DHTDiscovery(mockLibp2p, { maxPeersPerTopic: maxPeers })

      // Add more peers than the limit to cache
      for (let i = 0; i < 5; i++) {
        const mockPeer: PeerInfo = {
          id: `peer${i}`,
          multiaddrs: [`/ip4/127.0.0.1/tcp/400${i}`],
          protocols: ['test-protocol'],
          metadata: {
            geohash: 'abcde',
            ageRange: [25, 35],
            interests: ['music'],
            lastSeen: new Date()
          }
        }
        ;(dhtDiscovery as any).peerCache.set(`peer${i}`, mockPeer)
      }

      const peers = await dhtDiscovery.findPeers('geo:abcde')
      
      expect(peers).toHaveLength(maxPeers)
    })

    test('should filter out own peer', async () => {
      // Add own peer and another peer to cache
      const ownPeer: PeerInfo = {
        id: 'test-peer-id', // Own peer ID
        multiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
        protocols: ['test-protocol'],
        metadata: {
          geohash: 'abcde',
          ageRange: [25, 35],
          interests: ['music'],
          lastSeen: new Date()
        }
      }
      
      const otherPeer: PeerInfo = {
        id: 'other-peer',
        multiaddrs: ['/ip4/127.0.0.1/tcp/4002'],
        protocols: ['test-protocol'],
        metadata: {
          geohash: 'abcde',
          ageRange: [25, 35],
          interests: ['music'],
          lastSeen: new Date()
        }
      }
      
      ;(dhtDiscovery as any).peerCache.set('test-peer-id', ownPeer)
      ;(dhtDiscovery as any).peerCache.set('other-peer', otherPeer)

      const peers = await dhtDiscovery.findPeers('geo:abcde')
      
      expect(peers).toHaveLength(1)
      expect(peers[0].id).toBe('other-peer')
    })
  })

  describe('Peer Announcement', () => {
    test('should announce presence in topics', async () => {
      const topics = ['geo:abcde', 'age:20-30']
      
      // Should not throw and complete successfully
      await expect(dhtDiscovery.announcePresence(topics)).resolves.toBeUndefined()
    })

    test('should handle announcement errors gracefully', async () => {
      mockDHT.provide = jest.fn().mockReturnValue(
        (async function* () {
          yield { name: 'QUERY_ERROR', error: new Error('DHT error') }
        })()
      )
      
      // Should not throw
      await expect(dhtDiscovery.announcePresence(['geo:abcde'])).resolves.toBeUndefined()
    })
  })

  describe('Topic Subscriptions', () => {
    test('should subscribe to topic events', () => {
      const callback = jest.fn()
      
      dhtDiscovery.subscribeToTopic('geo:abcde', callback)
      
      const stats = dhtDiscovery.getStats()
      expect(stats.activeSubscriptions).toBe(1)
    })

    test('should notify subscribers of cached peers', () => {
      const callback = jest.fn()
      
      // Add a peer to cache first
      const mockPeer: PeerInfo = {
        id: 'test-peer',
        multiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
        protocols: ['test-protocol'],
        metadata: {
          geohash: 'abcde',
          ageRange: [25, 35],
          interests: ['music'],
          lastSeen: new Date()
        }
      }
      
      // Manually add to cache (accessing private property for testing)
      ;(dhtDiscovery as any).peerCache.set('test-peer', mockPeer)
      
      // Subscribe and expect immediate callback
      dhtDiscovery.subscribeToTopic('geo:abcde', callback)
      
      expect(callback).toHaveBeenCalledWith(mockPeer)
    })

    test('should unsubscribe from topics', () => {
      const callback = jest.fn()
      
      dhtDiscovery.subscribeToTopic('geo:abcde', callback)
      expect(dhtDiscovery.getStats().activeSubscriptions).toBe(1)
      
      dhtDiscovery.unsubscribeFromTopic('geo:abcde', callback)
      expect(dhtDiscovery.getStats().activeSubscriptions).toBe(0)
    })
  })

  describe('Caching', () => {
    test('should cache discovered peers', async () => {
      // Add a peer to cache manually to simulate discovery
      const mockPeer: PeerInfo = {
        id: 'peer1',
        multiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
        protocols: ['test-protocol'],
        metadata: {
          geohash: 'abcde',
          ageRange: [25, 35],
          interests: ['music'],
          lastSeen: new Date()
        }
      }
      
      ;(dhtDiscovery as any).peerCache.set('peer1', mockPeer)

      await dhtDiscovery.findPeers('geo:abcde')
      
      const stats = dhtDiscovery.getStats()
      expect(stats.cachedPeers).toBe(1)
    })

    test('should return cached peers for topic', async () => {
      // Add peer to cache
      const mockPeer: PeerInfo = {
        id: 'cached-peer',
        multiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
        protocols: ['test-protocol'],
        metadata: {
          geohash: 'abcde',
          ageRange: [25, 35],
          interests: ['music'],
          lastSeen: new Date()
        }
      }
      
      ;(dhtDiscovery as any).peerCache.set('cached-peer', mockPeer)
      
      const cachedPeers = dhtDiscovery.getCachedPeers('geo:abcde')
      expect(cachedPeers).toHaveLength(1)
      expect(cachedPeers[0].id).toBe('cached-peer')
    })

    test('should clear cache', () => {
      // Add peer to cache
      const mockPeer: PeerInfo = {
        id: 'cached-peer',
        multiaddrs: [],
        protocols: [],
        metadata: {
          geohash: 'abcde',
          ageRange: [25, 35],
          interests: ['music'],
          lastSeen: new Date()
        }
      }
      
      ;(dhtDiscovery as any).peerCache.set('cached-peer', mockPeer)
      expect(dhtDiscovery.getStats().cachedPeers).toBe(1)
      
      dhtDiscovery.clearCache()
      expect(dhtDiscovery.getStats().cachedPeers).toBe(0)
    })
  })

  describe('Error Handling', () => {
    test('should handle DHT query errors gracefully', async () => {
      mockDHT.findProviders = jest.fn().mockImplementation(() => {
        throw new Error('DHT query failed')
      })

      const peers = await dhtDiscovery.findPeers('geo:abcde')
      
      expect(peers).toEqual([])
    })

    test('should handle peer conversion errors', async () => {
      const mockPeerIds = [{ toString: () => 'peer1' }] as PeerId[]
      const mockProviders = mockPeerIds.map(id => ({ id }))
      
      mockDHT.findProviders = jest.fn().mockReturnValue(
        (async function* () {
          yield {
            name: 'PROVIDER',
            providers: mockProviders
          }
        })()
      )

      // Mock peer store to throw error
      mockPeerStore.get = jest.fn().mockRejectedValue(new Error('Peer not found'))

      const peers = await dhtDiscovery.findPeers('geo:abcde')
      
      // Should handle error gracefully and return empty array
      expect(peers).toEqual([])
    })
  })

  describe('Statistics', () => {
    test('should provide accurate statistics', async () => {
      const topics = ['geo:abcde', 'age:20-30']
      const callback = jest.fn()
      
      await dhtDiscovery.join(topics)
      dhtDiscovery.subscribeToTopic('geo:abcde', callback)
      
      const stats = dhtDiscovery.getStats()
      
      expect(stats.announcedTopics).toBe(2)
      expect(stats.activeSubscriptions).toBe(1)
      expect(stats.cachedPeers).toBe(0) // No peers discovered yet
    })
  })

  describe('Cleanup', () => {
    test('should cleanup resources on destroy', () => {
      const topics = ['geo:abcde']
      const callback = jest.fn()
      
      dhtDiscovery.join(topics)
      dhtDiscovery.subscribeToTopic('geo:abcde', callback)
      
      expect(dhtDiscovery.getStats().announcedTopics).toBe(1)
      expect(dhtDiscovery.getStats().activeSubscriptions).toBe(1)
      
      dhtDiscovery.destroy()
      
      const stats = dhtDiscovery.getStats()
      expect(stats.announcedTopics).toBe(0)
      expect(stats.activeSubscriptions).toBe(0)
      expect(stats.cachedPeers).toBe(0)
    })
  })

  describe('Topic Parsing', () => {
    test('should extract metadata from geo topics', () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'test',
        ageRange: [20, 30],
        interests: [],
        maxDistance: 10
      }
      
      const topics = dhtDiscovery.generateTopics(criteria)
      const geoTopic = topics.find(t => t.startsWith('geo:'))
      
      expect(geoTopic).toBe('geo:test')
    })

    test('should extract metadata from age topics', () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru', // Use valid geohash
        ageRange: [25, 35],
        interests: [],
        maxDistance: 10
      }
      
      const topics = dhtDiscovery.generateTopics(criteria)
      const ageTopic = topics.find(t => t.startsWith('age:'))
      
      expect(ageTopic).toBe('age:20-30')
    })

    test('should extract metadata from interest topics', () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru', // Use valid geohash
        ageRange: [25, 35],
        interests: ['music', 'travel'],
        maxDistance: 10
      }
      
      const topics = dhtDiscovery.generateTopics(criteria)
      const interestTopics = topics.filter(t => t.startsWith('interest:'))
      
      expect(interestTopics).toContain('interest:music')
      expect(interestTopics).toContain('interest:travel')
    })

    test('should create combined topics', () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru', // Use valid geohash
        ageRange: [25, 35],
        interests: ['music', 'travel'],
        maxDistance: 10
      }
      
      const topics = dhtDiscovery.generateTopics(criteria)
      const combinedTopic = topics.find(t => t.startsWith('combined:'))
      
      expect(combinedTopic).toBe('combined:dr5ru:20:music,travel')
    })
  })
})