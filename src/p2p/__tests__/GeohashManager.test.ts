import { GeohashManager } from '../GeohashManager'
import { GeohashLocation } from '../types'

describe('GeohashManager', () => {
  describe('encode', () => {
    test('should encode coordinates to geohash', () => {
      // Test known coordinates
      const geohash = GeohashManager.encode(37.7749, -122.4194, 5) // San Francisco
      expect(geohash).toBe('9q8yy')
      expect(geohash.length).toBe(5)
    })

    test('should handle different precisions', () => {
      const lat = 40.7128
      const lon = -74.0060 // New York
      
      const hash1 = GeohashManager.encode(lat, lon, 1)
      const hash3 = GeohashManager.encode(lat, lon, 3)
      const hash5 = GeohashManager.encode(lat, lon, 5)
      
      expect(hash1.length).toBe(1)
      expect(hash3.length).toBe(3)
      expect(hash5.length).toBe(5)
      
      // Longer hashes should start with shorter ones
      expect(hash3.startsWith(hash1)).toBe(true)
      expect(hash5.startsWith(hash3)).toBe(true)
    })

    test('should throw error for invalid coordinates', () => {
      expect(() => GeohashManager.encode(91, 0)).toThrow('Latitude must be between -90 and 90')
      expect(() => GeohashManager.encode(-91, 0)).toThrow('Latitude must be between -90 and 90')
      expect(() => GeohashManager.encode(0, 181)).toThrow('Longitude must be between -180 and 180')
      expect(() => GeohashManager.encode(0, -181)).toThrow('Longitude must be between -180 and 180')
    })

    test('should throw error for invalid precision', () => {
      expect(() => GeohashManager.encode(0, 0, 0)).toThrow('Precision must be between 1 and 12')
      expect(() => GeohashManager.encode(0, 0, 13)).toThrow('Precision must be between 1 and 12')
    })
  })

  describe('decode', () => {
    test('should decode geohash to bounds', () => {
      const geohash = '9q8yy'
      const bounds = GeohashManager.decode(geohash)
      
      expect(bounds.latitude.min).toBeLessThan(bounds.latitude.max)
      expect(bounds.longitude.min).toBeLessThan(bounds.longitude.max)
      expect(bounds.center.latitude).toBeCloseTo(37.77, 1)
      expect(bounds.center.longitude).toBeCloseTo(-122.42, 1)
    })

    test('should handle different precision decoding', () => {
      const hash1 = 'd'
      const hash5 = 'dr5ru'
      
      const bounds1 = GeohashManager.decode(hash1)
      const bounds5 = GeohashManager.decode(hash5)
      
      // Higher precision should have smaller bounds
      const range1 = bounds1.latitude.max - bounds1.latitude.min
      const range5 = bounds5.latitude.max - bounds5.latitude.min
      
      expect(range5).toBeLessThan(range1)
    })

    test('should throw error for invalid geohash', () => {
      expect(() => GeohashManager.decode('')).toThrow('Geohash cannot be empty')
      expect(() => GeohashManager.decode('invalid!')).toThrow('Invalid geohash character: i')
    })
  })

  describe('distance', () => {
    test('should calculate distance between geohashes', () => {
      const sf = '9q8yy' // San Francisco
      const ny = 'dr5ru' // New York
      
      const distance = GeohashManager.distance(sf, ny)
      
      // Distance between SF and NY is approximately 4000km
      expect(distance).toBeGreaterThan(3000)
      expect(distance).toBeLessThan(5000)
    })

    test('should return 0 for same geohash', () => {
      const geohash = '9q8yy'
      const distance = GeohashManager.distance(geohash, geohash)
      
      expect(distance).toBeCloseTo(0, 1)
    })

    test('should calculate short distances accurately', () => {
      // Two nearby locations in San Francisco
      const loc1 = GeohashManager.encode(37.7749, -122.4194, 8)
      const loc2 = GeohashManager.encode(37.7849, -122.4094, 8)
      
      const distance = GeohashManager.distance(loc1, loc2)
      
      // Should be roughly 1-2 km
      expect(distance).toBeGreaterThan(0.5)
      expect(distance).toBeLessThan(5)
    })
  })

  describe('getNeighbors', () => {
    test('should return neighboring geohashes', () => {
      const geohash = 'dr5ru'
      const neighbors = GeohashManager.getNeighbors(geohash)
      
      expect(neighbors.length).toBeGreaterThan(0)
      expect(neighbors.length).toBeLessThanOrEqual(8)
      
      // All neighbors should have same precision
      neighbors.forEach(neighbor => {
        expect(neighbor.length).toBe(geohash.length)
        expect(neighbor).not.toBe(geohash)
      })
    })

    test('should handle edge cases near poles', () => {
      // Near north pole
      const northGeohash = GeohashManager.encode(89, 0, 3)
      const northNeighbors = GeohashManager.getNeighbors(northGeohash)
      
      expect(northNeighbors.length).toBeGreaterThan(0)
      
      // Near south pole
      const southGeohash = GeohashManager.encode(-89, 0, 3)
      const southNeighbors = GeohashManager.getNeighbors(southGeohash)
      
      expect(southNeighbors.length).toBeGreaterThan(0)
    })
  })

  describe('createPrivateLocation', () => {
    test('should create private location with default precision', () => {
      const location = GeohashManager.createPrivateLocation(37.7749, -122.4194)
      
      expect(location.geohash).toBeDefined()
      expect(location.geohash.length).toBe(5)
      expect(location.timestamp).toBeInstanceOf(Date)
    })

    test('should create private location with custom precision', () => {
      const location = GeohashManager.createPrivateLocation(37.7749, -122.4194, 3)
      
      expect(location.geohash.length).toBe(3)
    })

    test('should create different locations for nearby coordinates', () => {
      const loc1 = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
      const loc2 = GeohashManager.createPrivateLocation(37.7750, -122.4195, 5)
      
      // Should be same or very similar due to precision
      expect(loc1.geohash.substring(0, 4)).toBe(loc2.geohash.substring(0, 4))
    })
  })

  describe('generateLocationTopics', () => {
    test('should generate location topics', () => {
      const location: GeohashLocation = {
        geohash: 'dr5ru',
        timestamp: new Date()
      }
      
      const topics = GeohashManager.generateLocationTopics(location, false)
      
      expect(topics.length).toBeGreaterThan(0)
      expect(topics).toContain('geo:dr5ru')
      
      // Should include broader topics
      expect(topics.some(topic => topic.includes('geo:dr5r'))).toBe(true)
      expect(topics.some(topic => topic.includes('geo:dr5'))).toBe(true)
    })

    test('should include neighbors when requested', () => {
      const location: GeohashLocation = {
        geohash: 'dr5ru',
        timestamp: new Date()
      }
      
      const topicsWithNeighbors = GeohashManager.generateLocationTopics(location, true)
      const topicsWithoutNeighbors = GeohashManager.generateLocationTopics(location, false)
      
      expect(topicsWithNeighbors.length).toBeGreaterThan(topicsWithoutNeighbors.length)
    })
  })

  describe('isWithinDistance', () => {
    test('should check if locations are within distance', () => {
      // Use more distant locations to ensure they're in different geohash cells
      const sanFrancisco: GeohashLocation = {
        geohash: GeohashManager.encode(37.7749, -122.4194, 5),
        timestamp: new Date()
      }
      
      const newYork: GeohashLocation = {
        geohash: GeohashManager.encode(40.7128, -74.0060, 5),
        timestamp: new Date()
      }
      
      // Should be within 5000km (cross-country)
      expect(GeohashManager.isWithinDistance(sanFrancisco, newYork, 5000)).toBe(true)
      
      // Should not be within 1000km
      expect(GeohashManager.isWithinDistance(sanFrancisco, newYork, 1000)).toBe(false)
    })

    test('should handle same location', () => {
      const location: GeohashLocation = {
        geohash: 'dr5ru',
        timestamp: new Date()
      }
      
      expect(GeohashManager.isWithinDistance(location, location, 1)).toBe(true)
    })
  })

  describe('getCommonPrefixLength', () => {
    test('should calculate common prefix length', () => {
      expect(GeohashManager.getCommonPrefixLength('dr5ru', 'dr5rv')).toBe(4)
      expect(GeohashManager.getCommonPrefixLength('dr5ru', 'dr6ru')).toBe(2)
      expect(GeohashManager.getCommonPrefixLength('dr5ru', 'xr5ru')).toBe(0)
      expect(GeohashManager.getCommonPrefixLength('dr5ru', 'dr5ru')).toBe(5)
    })

    test('should handle different length strings', () => {
      expect(GeohashManager.getCommonPrefixLength('dr5', 'dr5ru')).toBe(3)
      expect(GeohashManager.getCommonPrefixLength('dr5ru', 'dr5')).toBe(3)
    })
  })

  describe('getPrivacyRadius', () => {
    test('should return correct privacy radius for different precisions', () => {
      expect(GeohashManager.getPrivacyRadius(1)).toBe(2500)
      expect(GeohashManager.getPrivacyRadius(3)).toBe(78)
      expect(GeohashManager.getPrivacyRadius(5)).toBe(2.4)
      expect(GeohashManager.getPrivacyRadius(7)).toBe(0.076)
    })

    test('should return default for unknown precision', () => {
      expect(GeohashManager.getPrivacyRadius(15)).toBe(2.4)
    })
  })

  describe('isValidGeohash', () => {
    test('should validate correct geohashes', () => {
      expect(GeohashManager.isValidGeohash('dr5ru')).toBe(true)
      expect(GeohashManager.isValidGeohash('9q8yy')).toBe(true)
      expect(GeohashManager.isValidGeohash('u')).toBe(true)
      expect(GeohashManager.isValidGeohash('0123456789bc')).toBe(true)
    })

    test('should reject invalid geohashes', () => {
      expect(GeohashManager.isValidGeohash('')).toBe(false)
      expect(GeohashManager.isValidGeohash('invalid!')).toBe(false)
      expect(GeohashManager.isValidGeohash('toolonggeohash123')).toBe(false)
      expect(GeohashManager.isValidGeohash('a')).toBe(false) // 'a' is not in base32
      expect(GeohashManager.isValidGeohash('l')).toBe(false) // 'l' is not in base32
    })
  })

  describe('privacy and security', () => {
    test('should provide consistent privacy radius', () => {
      const location = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
      const radius = GeohashManager.getPrivacyRadius(5)
      
      expect(radius).toBe(2.4) // ~2.4km for 5-digit precision
    })

    test('should not reveal exact coordinates', () => {
      const exactLat = 37.774929
      const exactLon = -122.419416
      
      const location = GeohashManager.createPrivateLocation(exactLat, exactLon, 5)
      const bounds = GeohashManager.decode(location.geohash)
      
      // The decoded center should be different from exact coordinates
      expect(bounds.center.latitude).not.toBe(exactLat)
      expect(bounds.center.longitude).not.toBe(exactLon)
      
      // But should be reasonably close
      expect(Math.abs(bounds.center.latitude - exactLat)).toBeLessThan(0.1)
      expect(Math.abs(bounds.center.longitude - exactLon)).toBeLessThan(0.1)
    })

    test('should provide location privacy through geohash precision', () => {
      const exactLat = 37.774929
      const exactLon = -122.419416
      
      // Test different privacy levels
      const precise = GeohashManager.createPrivateLocation(exactLat, exactLon, 8)
      const moderate = GeohashManager.createPrivateLocation(exactLat, exactLon, 5)
      const broad = GeohashManager.createPrivateLocation(exactLat, exactLon, 3)
      
      const preciseRadius = GeohashManager.getPrivacyRadius(8)
      const moderateRadius = GeohashManager.getPrivacyRadius(5)
      const broadRadius = GeohashManager.getPrivacyRadius(3)
      
      expect(preciseRadius).toBeLessThan(moderateRadius)
      expect(moderateRadius).toBeLessThan(broadRadius)
      
      // More precise geohash should start with less precise one
      expect(precise.geohash.startsWith(moderate.geohash)).toBe(true)
      expect(moderate.geohash.startsWith(broad.geohash)).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('should handle coordinates at boundaries', () => {
      // Test boundary coordinates
      const north = GeohashManager.encode(90, 0, 5)
      const south = GeohashManager.encode(-90, 0, 5)
      const east = GeohashManager.encode(0, 180, 5)
      const west = GeohashManager.encode(0, -180, 5)
      
      expect(north).toBeDefined()
      expect(south).toBeDefined()
      expect(east).toBeDefined()
      expect(west).toBeDefined()
      
      // Should be able to decode them back
      expect(() => GeohashManager.decode(north)).not.toThrow()
      expect(() => GeohashManager.decode(south)).not.toThrow()
      expect(() => GeohashManager.decode(east)).not.toThrow()
      expect(() => GeohashManager.decode(west)).not.toThrow()
    })

    test('should handle zero coordinates', () => {
      const zero = GeohashManager.encode(0, 0, 5)
      expect(zero).toBeDefined()
      expect(zero.length).toBe(5)
      
      const bounds = GeohashManager.decode(zero)
      expect(bounds.center.latitude).toBeCloseTo(0, 1)
      expect(bounds.center.longitude).toBeCloseTo(0, 1)
    })
  })
})