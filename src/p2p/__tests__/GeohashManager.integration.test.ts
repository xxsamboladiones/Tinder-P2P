import { GeohashManager } from '../GeohashManager'
import { DHTDiscovery } from '../DHTDiscovery'
import { DiscoveryCriteria, GeohashLocation } from '../types'

// Mock libp2p for testing
const mockLibp2p = {
  peerId: { toString: () => 'test-peer-id' },
  services: {
    dht: {
      // Mock DHT service
    }
  },
  peerStore: {
    get: jest.fn().mockResolvedValue({
      addresses: [],
      protocols: new Set()
    })
  }
}

describe('GeohashManager Integration', () => {
  let dhtDiscovery: DHTDiscovery

  beforeEach(() => {
    dhtDiscovery = new DHTDiscovery(mockLibp2p as any)
  })

  afterEach(() => {
    dhtDiscovery.destroy()
  })

  describe('Location-based Discovery', () => {
    test('should generate location topics for DHT discovery', () => {
      const location = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
      const topics = GeohashManager.generateLocationTopics(location, true)
      
      expect(topics.length).toBeGreaterThan(0)
      expect(topics.some(topic => topic.startsWith('geo:'))).toBe(true)
      
      // Should include the main geohash
      expect(topics).toContain(`geo:${location.geohash}`)
    })

    test('should create discovery criteria with geohash location', () => {
      const location = GeohashManager.createPrivateLocation(40.7128, -74.0060, 5) // NYC
      
      const criteria: DiscoveryCriteria = {
        geohash: location.geohash,
        ageRange: [25, 35],
        interests: ['music', 'travel'],
        maxDistance: 10
      }
      
      const topics = dhtDiscovery.generateTopics(criteria)
      
      expect(topics.length).toBeGreaterThan(0)
      expect(topics.some(topic => topic.includes(location.geohash))).toBe(true)
    })

    test('should find peers within location range', async () => {
      const searchLocation = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
      const nearbyLocation = GeohashManager.createPrivateLocation(37.7849, -122.4094, 5)
      const farLocation = GeohashManager.createPrivateLocation(40.7128, -74.0060, 5)
      
      // Check if locations are within range
      const isNearbyInRange = GeohashManager.isWithinDistance(searchLocation, nearbyLocation, 10)
      const isFarInRange = GeohashManager.isWithinDistance(searchLocation, farLocation, 10)
      
      expect(isNearbyInRange).toBe(true)
      expect(isFarInRange).toBe(false)
    })

    test('should respect privacy radius for different precisions', () => {
      const exactLat = 37.774929
      const exactLon = -122.419416
      
      // Create locations with different privacy levels
      const highPrivacy = GeohashManager.createPrivateLocation(exactLat, exactLon, 3) // ~78km
      const mediumPrivacy = GeohashManager.createPrivateLocation(exactLat, exactLon, 5) // ~2.4km
      const lowPrivacy = GeohashManager.createPrivateLocation(exactLat, exactLon, 7) // ~76m
      
      const highRadius = GeohashManager.getPrivacyRadius(3)
      const mediumRadius = GeohashManager.getPrivacyRadius(5)
      const lowRadius = GeohashManager.getPrivacyRadius(7)
      
      expect(highRadius).toBeGreaterThan(mediumRadius)
      expect(mediumRadius).toBeGreaterThan(lowRadius)
      
      // Higher precision should be more specific
      expect(lowPrivacy.geohash.startsWith(mediumPrivacy.geohash)).toBe(true)
      expect(mediumPrivacy.geohash.startsWith(highPrivacy.geohash)).toBe(true)
    })
  })

  describe('Privacy Protection', () => {
    test('should not reveal exact coordinates through geohash', () => {
      const exactLat = 37.774929
      const exactLon = -122.419416
      
      const location = GeohashManager.createPrivateLocation(exactLat, exactLon, 5)
      const bounds = GeohashManager.decode(location.geohash)
      
      // The bounds should contain the exact coordinates but not reveal them precisely
      expect(bounds.latitude.min).toBeLessThanOrEqual(exactLat)
      expect(bounds.latitude.max).toBeGreaterThanOrEqual(exactLat)
      expect(bounds.longitude.min).toBeLessThanOrEqual(exactLon)
      expect(bounds.longitude.max).toBeGreaterThanOrEqual(exactLon)
      
      // The center should be close but not exact
      const latDiff = Math.abs(bounds.center.latitude - exactLat)
      const lonDiff = Math.abs(bounds.center.longitude - exactLon)
      
      expect(latDiff).toBeGreaterThan(0)
      expect(lonDiff).toBeGreaterThan(0)
      expect(latDiff).toBeLessThan(0.1) // Within reasonable range
      expect(lonDiff).toBeLessThan(0.1)
    })

    test('should provide consistent privacy for nearby users', () => {
      // Two users very close to each other
      const user1Location = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
      const user2Location = GeohashManager.createPrivateLocation(37.7750, -122.4195, 5)
      
      // They should likely have the same or very similar geohash
      const commonPrefix = GeohashManager.getCommonPrefixLength(
        user1Location.geohash, 
        user2Location.geohash
      )
      
      expect(commonPrefix).toBeGreaterThanOrEqual(4) // At least 4 characters in common
    })

    test('should allow discovery without revealing exact location', () => {
      const userLocation = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
      const topics = GeohashManager.generateLocationTopics(userLocation, true)
      
      // Topics should include broader geohashes for discovery
      const broaderTopics = topics.filter(topic => {
        const match = topic.match(/geo:(.+)/)
        return match && match[1].length < userLocation.geohash.length
      })
      
      expect(broaderTopics.length).toBeGreaterThan(0)
      
      // Should include neighboring geohashes
      const neighborTopics = topics.filter(topic => {
        const match = topic.match(/geo:(.+)/)
        return match && 
               match[1].length === userLocation.geohash.length && 
               match[1] !== userLocation.geohash
      })
      
      expect(neighborTopics.length).toBeGreaterThan(0)
    })
  })

  describe('Discovery Optimization', () => {
    test('should generate efficient topic sets for discovery', () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru',
        ageRange: [25, 35],
        interests: ['music', 'travel', 'sports'],
        maxDistance: 20
      }
      
      const topics = dhtDiscovery.generateTopics(criteria)
      
      // Should generate some topics
      expect(topics.length).toBeGreaterThan(0)
      expect(topics.length).toBeLessThanOrEqual(10)
      
      // Should include location-based topics
      const locationTopics = topics.filter(topic => topic.startsWith('geo:'))
      expect(locationTopics.length).toBeGreaterThan(0)
      
      // Should include the main geohash
      expect(topics.some(topic => topic.includes('dr5ru'))).toBe(true)
    })

    test('should handle invalid geohash gracefully', () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'invalid!',
        ageRange: [25, 35],
        interests: ['music'],
        maxDistance: 20
      }
      
      const topics = dhtDiscovery.generateTopics(criteria)
      
      // Should still generate some topics (age and interest)
      expect(topics.length).toBeGreaterThan(0)
      
      // Should not crash or include invalid characters
      expect(() => dhtDiscovery.generateTopics(criteria)).not.toThrow()
    })

    test('should create privacy-preserving location through DHT', () => {
      const exactLat = 37.774929
      const exactLon = -122.419416
      
      const privateLocation = dhtDiscovery.createPrivateLocation(exactLat, exactLon, 5)
      
      expect(privateLocation.geohash).toBeDefined()
      expect(privateLocation.geohash.length).toBe(5)
      expect(privateLocation.timestamp).toBeInstanceOf(Date)
      
      // Should provide expected privacy radius
      const privacyRadius = dhtDiscovery.getLocationPrivacyRadius(privateLocation.geohash)
      expect(privacyRadius).toBe(2.4) // ~2.4km for 5-digit precision
    })
  })

  describe('Real-world Scenarios', () => {
    test('should handle major city locations', () => {
      const cities = [
        { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
        { name: 'New York', lat: 40.7128, lon: -74.0060 },
        { name: 'London', lat: 51.5074, lon: -0.1278 },
        { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
        { name: 'Sydney', lat: -33.8688, lon: 151.2093 }
      ]
      
      cities.forEach(city => {
        const location = GeohashManager.createPrivateLocation(city.lat, city.lon, 5)
        expect(location.geohash).toBeDefined()
        expect(location.geohash.length).toBe(5)
        
        const bounds = GeohashManager.decode(location.geohash)
        expect(bounds.center.latitude).toBeCloseTo(city.lat, 1)
        expect(bounds.center.longitude).toBeCloseTo(city.lon, 1)
      })
    })

    test('should handle cross-hemisphere distance calculations', () => {
      const northLocation = GeohashManager.createPrivateLocation(60, 0, 5) // Northern hemisphere
      const southLocation = GeohashManager.createPrivateLocation(-60, 0, 5) // Southern hemisphere
      
      const distance = GeohashManager.distance(northLocation.geohash, southLocation.geohash)
      
      // Should be approximately 13,000+ km (cross-hemisphere)
      expect(distance).toBeGreaterThan(10000)
      expect(distance).toBeLessThan(15000)
    })

    test('should provide reasonable neighbor discovery', () => {
      const centerLocation = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
      const neighbors = GeohashManager.getNeighbors(centerLocation.geohash)
      
      expect(neighbors.length).toBeGreaterThan(0)
      expect(neighbors.length).toBeLessThanOrEqual(8)
      
      // All neighbors should be valid geohashes
      neighbors.forEach(neighbor => {
        expect(GeohashManager.isValidGeohash(neighbor)).toBe(true)
        expect(neighbor.length).toBe(centerLocation.geohash.length)
      })
      
      // Neighbors should be reasonably close
      neighbors.forEach(neighbor => {
        const distance = GeohashManager.distance(centerLocation.geohash, neighbor)
        expect(distance).toBeLessThan(10) // Should be within 10km for 5-digit precision
      })
    })
  })

  describe('Performance', () => {
    test('should encode/decode geohashes efficiently', () => {
      const iterations = 1000
      const startTime = Date.now()
      
      for (let i = 0; i < iterations; i++) {
        const lat = (Math.random() - 0.5) * 180 // -90 to 90
        const lon = (Math.random() - 0.5) * 360 // -180 to 180
        
        const geohash = GeohashManager.encode(lat, lon, 5)
        const bounds = GeohashManager.decode(geohash)
        
        expect(geohash.length).toBe(5)
        expect(bounds.center.latitude).toBeCloseTo(lat, 1)
        expect(bounds.center.longitude).toBeCloseTo(lon, 1)
      }
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should complete 1000 encode/decode cycles in reasonable time
      expect(duration).toBeLessThan(1000) // Less than 1 second
    })

    test('should generate topics efficiently', () => {
      const criteria: DiscoveryCriteria = {
        geohash: 'dr5ru',
        ageRange: [25, 35],
        interests: ['music', 'travel', 'sports', 'food', 'art'],
        maxDistance: 20
      }
      
      const iterations = 100
      const startTime = Date.now()
      
      for (let i = 0; i < iterations; i++) {
        const topics = dhtDiscovery.generateTopics(criteria)
        expect(topics.length).toBeGreaterThan(0)
      }
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should generate topics quickly
      expect(duration).toBeLessThan(100) // Less than 100ms for 100 iterations
    })
  })
})