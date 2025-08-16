import { GeohashLocation, DiscoveryCriteria } from './types'

/**
 * GeohashManager handles geohash-based location privacy and discovery
 * Implements 5-digit precision geohash for ~2.4km accuracy
 */
export class GeohashManager {
  private static readonly BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'
  private static readonly BASE32_MAP: { [key: string]: number } = {}
  
  static {
    // Initialize base32 character to number mapping
    for (let i = 0; i < GeohashManager.BASE32.length; i++) {
      GeohashManager.BASE32_MAP[GeohashManager.BASE32[i]] = i
    }
  }

  /**
   * Generate geohash from latitude and longitude coordinates
   * @param latitude Latitude coordinate (-90 to 90)
   * @param longitude Longitude coordinate (-180 to 180)
   * @param precision Number of characters in geohash (default: 5 for ~2.4km)
   * @returns Geohash string
   */
  static encode(latitude: number, longitude: number, precision: number = 5): string {
    if (latitude < -90 || latitude > 90) {
      throw new Error('Latitude must be between -90 and 90')
    }
    if (longitude < -180 || longitude > 180) {
      throw new Error('Longitude must be between -180 and 180')
    }
    if (precision < 1 || precision > 12) {
      throw new Error('Precision must be between 1 and 12')
    }

    let latMin = -90.0
    let latMax = 90.0
    let lonMin = -180.0
    let lonMax = 180.0
    
    let geohash = ''
    let bits = 0
    let bit = 0
    let even = true // Start with longitude
    
    while (geohash.length < precision) {
      if (even) {
        // Process longitude
        const mid = (lonMin + lonMax) / 2
        if (longitude >= mid) {
          bits = (bits << 1) | 1
          lonMin = mid
        } else {
          bits = bits << 1
          lonMax = mid
        }
      } else {
        // Process latitude
        const mid = (latMin + latMax) / 2
        if (latitude >= mid) {
          bits = (bits << 1) | 1
          latMin = mid
        } else {
          bits = bits << 1
          latMax = mid
        }
      }
      
      even = !even
      bit++
      
      if (bit === 5) {
        geohash += GeohashManager.BASE32[bits]
        bits = 0
        bit = 0
      }
    }
    
    return geohash
  }

  /**
   * Decode geohash to latitude and longitude bounds
   * @param geohash Geohash string to decode
   * @returns Object with latitude and longitude bounds
   */
  static decode(geohash: string): {
    latitude: { min: number; max: number }
    longitude: { min: number; max: number }
    center: { latitude: number; longitude: number }
  } {
    if (!geohash || geohash.length === 0) {
      throw new Error('Geohash cannot be empty')
    }

    let latMin = -90.0
    let latMax = 90.0
    let lonMin = -180.0
    let lonMax = 180.0
    
    let even = true // Start with longitude
    
    for (const char of geohash.toLowerCase()) {
      if (!(char in GeohashManager.BASE32_MAP)) {
        throw new Error(`Invalid geohash character: ${char}`)
      }
      
      const bits = GeohashManager.BASE32_MAP[char]
      
      for (let i = 4; i >= 0; i--) {
        const bit = (bits >> i) & 1
        
        if (even) {
          // Process longitude
          const mid = (lonMin + lonMax) / 2
          if (bit === 1) {
            lonMin = mid
          } else {
            lonMax = mid
          }
        } else {
          // Process latitude
          const mid = (latMin + latMax) / 2
          if (bit === 1) {
            latMin = mid
          } else {
            latMax = mid
          }
        }
        
        even = !even
      }
    }
    
    return {
      latitude: { min: latMin, max: latMax },
      longitude: { min: lonMin, max: lonMax },
      center: {
        latitude: (latMin + latMax) / 2,
        longitude: (lonMin + lonMax) / 2
      }
    }
  }

  /**
   * Calculate distance between two geohashes in kilometers
   * @param geohash1 First geohash
   * @param geohash2 Second geohash
   * @returns Distance in kilometers
   */
  static distance(geohash1: string, geohash2: string): number {
    const bounds1 = GeohashManager.decode(geohash1)
    const bounds2 = GeohashManager.decode(geohash2)
    
    return GeohashManager.haversineDistance(
      bounds1.center.latitude,
      bounds1.center.longitude,
      bounds2.center.latitude,
      bounds2.center.longitude
    )
  }

  /**
   * Get neighboring geohashes for expanded search
   * @param geohash Base geohash
   * @returns Array of neighboring geohashes
   */
  static getNeighbors(geohash: string): string[] {
    const neighbors: string[] = []
    const bounds = GeohashManager.decode(geohash)
    const precision = geohash.length
    
    // Calculate approximate step size for this precision
    const latStep = bounds.latitude.max - bounds.latitude.min
    const lonStep = bounds.longitude.max - bounds.longitude.min
    
    // Generate 8 neighboring geohashes
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],  // North-west, North, North-east
      [0, -1],           [0, 1],   // West, East
      [1, -1],  [1, 0],  [1, 1]    // South-west, South, South-east
    ]
    
    for (const [latDir, lonDir] of directions) {
      const newLat = bounds.center.latitude + (latDir * latStep)
      const newLon = bounds.center.longitude + (lonDir * lonStep)
      
      // Ensure coordinates are within valid bounds
      if (newLat >= -90 && newLat <= 90 && newLon >= -180 && newLon <= 180) {
        const neighborHash = GeohashManager.encode(newLat, newLon, precision)
        if (neighborHash !== geohash) {
          neighbors.push(neighborHash)
        }
      }
    }
    
    return neighbors
  }

  /**
   * Create privacy-preserving location with configurable precision
   * @param latitude Exact latitude
   * @param longitude Exact longitude
   * @param precision Geohash precision (default: 5 for ~2.4km privacy)
   * @returns GeohashLocation object
   */
  static createPrivateLocation(
    latitude: number, 
    longitude: number, 
    precision: number = 5
  ): GeohashLocation {
    const geohash = GeohashManager.encode(latitude, longitude, precision)
    
    return {
      geohash,
      timestamp: new Date()
    }
  }

  /**
   * Generate location-based topics for DHT discovery
   * @param location GeohashLocation
   * @param includeNeighbors Whether to include neighboring geohashes
   * @returns Array of topic strings for DHT
   */
  static generateLocationTopics(
    location: GeohashLocation, 
    includeNeighbors: boolean = true
  ): string[] {
    const topics: string[] = []
    
    // Primary location topic
    topics.push(`geo:${location.geohash}`)
    
    // Add broader location topics for better discovery
    for (let precision = Math.max(1, location.geohash.length - 2); 
         precision < location.geohash.length; 
         precision++) {
      const broaderGeohash = location.geohash.substring(0, precision)
      topics.push(`geo:${broaderGeohash}`)
    }
    
    // Add neighboring geohashes for expanded discovery
    if (includeNeighbors) {
      const neighbors = GeohashManager.getNeighbors(location.geohash)
      for (const neighbor of neighbors) {
        topics.push(`geo:${neighbor}`)
      }
    }
    
    return topics
  }

  /**
   * Check if two locations are within a certain distance
   * @param location1 First location
   * @param location2 Second location
   * @param maxDistanceKm Maximum distance in kilometers
   * @returns True if locations are within distance
   */
  static isWithinDistance(
    location1: GeohashLocation, 
    location2: GeohashLocation, 
    maxDistanceKm: number
  ): boolean {
    const distance = GeohashManager.distance(location1.geohash, location2.geohash)
    return distance <= maxDistanceKm
  }

  /**
   * Get common prefix length between two geohashes
   * Used for proximity matching
   * @param geohash1 First geohash
   * @param geohash2 Second geohash
   * @returns Length of common prefix
   */
  static getCommonPrefixLength(geohash1: string, geohash2: string): number {
    let commonLength = 0
    const minLength = Math.min(geohash1.length, geohash2.length)
    
    for (let i = 0; i < minLength; i++) {
      if (geohash1[i] === geohash2[i]) {
        commonLength++
      } else {
        break
      }
    }
    
    return commonLength
  }

  /**
   * Estimate privacy radius for a given geohash precision
   * @param precision Geohash precision
   * @returns Approximate radius in kilometers
   */
  static getPrivacyRadius(precision: number): number {
    // Approximate geohash precision to radius mapping
    const radiusMap: { [key: number]: number } = {
      1: 2500,   // ±2500km
      2: 630,    // ±630km
      3: 78,     // ±78km
      4: 20,     // ±20km
      5: 2.4,    // ±2.4km (our default)
      6: 0.61,   // ±610m
      7: 0.076,  // ±76m
      8: 0.019,  // ±19m
      9: 0.0024, // ±2.4m
      10: 0.00060, // ±60cm
      11: 0.000074, // ±7.4cm
      12: 0.000019  // ±1.9cm
    }
    
    return radiusMap[precision] || 2.4
  }

  /**
   * Validate geohash format and characters
   * @param geohash Geohash string to validate
   * @returns True if valid geohash
   */
  static isValidGeohash(geohash: string): boolean {
    if (!geohash || geohash.length === 0 || geohash.length > 12) {
      return false
    }
    
    for (const char of geohash.toLowerCase()) {
      if (!(char in GeohashManager.BASE32_MAP)) {
        return false
      }
    }
    
    return true
  }

  /**
   * Calculate Haversine distance between two coordinates
   * @param lat1 First latitude
   * @param lon1 First longitude
   * @param lat2 Second latitude
   * @param lon2 Second longitude
   * @returns Distance in kilometers
   */
  private static haversineDistance(
    lat1: number, 
    lon1: number, 
    lat2: number, 
    lon2: number
  ): number {
    const R = 6371 // Earth's radius in kilometers
    const dLat = GeohashManager.toRadians(lat2 - lat1)
    const dLon = GeohashManager.toRadians(lon2 - lon1)
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(GeohashManager.toRadians(lat1)) * 
              Math.cos(GeohashManager.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  /**
   * Convert degrees to radians
   * @param degrees Degrees to convert
   * @returns Radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
  }
}