import { GeohashManager } from '../GeohashManager'
import { DHTDiscovery } from '../DHTDiscovery'
import { P2PManager } from '../P2PManager'
import { ProfileSyncManager } from '../ProfileSyncManager'
import { DiscoveryCriteria, GeohashLocation } from '../types'

/**
 * Example demonstrating geohash-based location privacy and discovery
 */
export class GeohashExample {
  private p2pManager: P2PManager
  private profileSync: ProfileSyncManager

  constructor() {
    this.p2pManager = new P2PManager()
    this.profileSync = new ProfileSyncManager(this.p2pManager)
  }

  /**
   * Example 1: Creating privacy-preserving locations
   */
  async demonstrateLocationPrivacy() {
    console.log('=== Location Privacy Example ===')
    
    // User's exact location (e.g., from GPS)
    const exactLat = 37.774929
    const exactLon = -122.419416
    console.log(`Exact location: ${exactLat}, ${exactLon}`)
    
    // Create privacy-preserving locations with different precision levels
    const highPrivacy = GeohashManager.createPrivateLocation(exactLat, exactLon, 3) // ~78km radius
    const mediumPrivacy = GeohashManager.createPrivateLocation(exactLat, exactLon, 5) // ~2.4km radius
    const lowPrivacy = GeohashManager.createPrivateLocation(exactLat, exactLon, 7) // ~76m radius
    
    console.log(`High privacy (3-digit): ${highPrivacy.geohash} (~${GeohashManager.getPrivacyRadius(3)}km radius)`)
    console.log(`Medium privacy (5-digit): ${mediumPrivacy.geohash} (~${GeohashManager.getPrivacyRadius(5)}km radius)`)
    console.log(`Low privacy (7-digit): ${lowPrivacy.geohash} (~${GeohashManager.getPrivacyRadius(7)}km radius)`)
    
    // Decode to show privacy protection
    const bounds = GeohashManager.decode(mediumPrivacy.geohash)
    console.log(`Decoded center: ${bounds.center.latitude}, ${bounds.center.longitude}`)
    console.log(`Privacy protection: Location is within ${bounds.latitude.max - bounds.latitude.min}° lat, ${bounds.longitude.max - bounds.longitude.min}° lon bounds`)
    
    return { highPrivacy, mediumPrivacy, lowPrivacy }
  }

  /**
   * Example 2: Location-based peer discovery
   */
  async demonstrateLocationDiscovery() {
    console.log('\n=== Location-based Discovery Example ===')
    
    await this.p2pManager.initialize()
    
    // Create user location in San Francisco
    const userLocation = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
    console.log(`User location geohash: ${userLocation.geohash}`)
    
    // Generate discovery topics for this location
    const locationTopics = GeohashManager.generateLocationTopics(userLocation, true)
    console.log(`Generated ${locationTopics.length} location topics:`)
    locationTopics.forEach(topic => console.log(`  - ${topic}`))
    
    // Create discovery criteria
    const criteria: DiscoveryCriteria = {
      geohash: userLocation.geohash,
      ageRange: [25, 35],
      interests: ['music', 'travel'],
      maxDistance: 10 // 10km radius
    }
    
    // Generate all discovery topics (location + age + interests)
    const dhtDiscovery = (this.p2pManager as any).dhtDiscovery as DHTDiscovery
    const allTopics = dhtDiscovery.generateTopics(criteria)
    console.log(`\nAll discovery topics (${allTopics.length}):`)
    allTopics.forEach(topic => console.log(`  - ${topic}`))
    
    await this.p2pManager.disconnect()
  }

  /**
   * Example 3: Distance calculations and proximity matching
   */
  async demonstrateDistanceCalculations() {
    console.log('\n=== Distance Calculation Example ===')
    
    // Create locations for different cities
    const sanFrancisco = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
    const newYork = GeohashManager.createPrivateLocation(40.7128, -74.0060, 5)
    const london = GeohashManager.createPrivateLocation(51.5074, -0.1278, 5)
    
    console.log(`San Francisco: ${sanFrancisco.geohash}`)
    console.log(`New York: ${newYork.geohash}`)
    console.log(`London: ${london.geohash}`)
    
    // Calculate distances
    const sfToNy = GeohashManager.distance(sanFrancisco.geohash, newYork.geohash)
    const sfToLondon = GeohashManager.distance(sanFrancisco.geohash, london.geohash)
    const nyToLondon = GeohashManager.distance(newYork.geohash, london.geohash)
    
    console.log(`\nDistances:`)
    console.log(`SF to NY: ${sfToNy.toFixed(0)} km`)
    console.log(`SF to London: ${sfToLondon.toFixed(0)} km`)
    console.log(`NY to London: ${nyToLondon.toFixed(0)} km`)
    
    // Check proximity within different ranges
    const ranges = [50, 500, 5000] // km
    ranges.forEach(range => {
      console.log(`\nWithin ${range}km of San Francisco:`)
      console.log(`  New York: ${GeohashManager.isWithinDistance(sanFrancisco, newYork, range)}`)
      console.log(`  London: ${GeohashManager.isWithinDistance(sanFrancisco, london, range)}`)
    })
  }

  /**
   * Example 4: Neighbor discovery for expanded search
   */
  async demonstrateNeighborDiscovery() {
    console.log('\n=== Neighbor Discovery Example ===')
    
    const centerLocation = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
    console.log(`Center location: ${centerLocation.geohash}`)
    
    // Get neighboring geohashes
    const neighbors = GeohashManager.getNeighbors(centerLocation.geohash)
    console.log(`\nFound ${neighbors.length} neighbors:`)
    neighbors.forEach(neighbor => {
      const distance = GeohashManager.distance(centerLocation.geohash, neighbor)
      console.log(`  ${neighbor} (${distance.toFixed(2)} km away)`)
    })
    
    // Show how this expands discovery
    const expandedTopics = [
      `geo:${centerLocation.geohash}`,
      ...neighbors.map(n => `geo:${n}`)
    ]
    console.log(`\nExpanded discovery topics (${expandedTopics.length}):`)
    expandedTopics.forEach(topic => console.log(`  - ${topic}`))
  }

  /**
   * Example 5: Profile synchronization with location filtering
   */
  async demonstrateLocationFiltering() {
    console.log('\n=== Location-based Profile Filtering Example ===')
    
    await this.p2pManager.initialize()
    
    // Create search location in downtown SF
    const searchLocation = GeohashManager.createPrivateLocation(37.7749, -122.4194, 5)
    
    // Simulate profiles at different locations
    const profiles = [
      {
        name: 'Alice',
        location: GeohashManager.createPrivateLocation(37.7849, -122.4094, 5), // ~1km away
        age: 28
      },
      {
        name: 'Bob', 
        location: GeohashManager.createPrivateLocation(37.8049, -122.3994, 5), // ~5km away
        age: 32
      },
      {
        name: 'Charlie',
        location: GeohashManager.createPrivateLocation(40.7128, -74.0060, 5), // NYC - very far
        age: 29
      }
    ]
    
    console.log(`Search location: ${searchLocation.geohash}`)
    console.log('\nProfile locations and distances:')
    
    profiles.forEach(profile => {
      const distance = GeohashManager.distance(searchLocation.geohash, profile.location.geohash)
      const withinRange = GeohashManager.isWithinDistance(searchLocation, profile.location, 10) // 10km
      
      console.log(`${profile.name}: ${profile.location.geohash} (${distance.toFixed(1)}km) - ${withinRange ? 'IN RANGE' : 'OUT OF RANGE'}`)
    })
    
    // Filter profiles by location
    const nearbyProfiles = profiles.filter(profile => 
      GeohashManager.isWithinDistance(searchLocation, profile.location, 10)
    )
    
    console.log(`\nProfiles within 10km: ${nearbyProfiles.map(p => p.name).join(', ')}`)
    
    await this.p2pManager.disconnect()
  }

  /**
   * Example 6: Privacy analysis
   */
  async demonstratePrivacyAnalysis() {
    console.log('\n=== Privacy Analysis Example ===')
    
    const exactLat = 37.774929
    const exactLon = -122.419416
    console.log(`Original coordinates: ${exactLat}, ${exactLon}`)
    
    // Test different precision levels
    const precisions = [3, 4, 5, 6, 7]
    
    console.log('\nPrivacy levels:')
    precisions.forEach(precision => {
      const location = GeohashManager.createPrivateLocation(exactLat, exactLon, precision)
      const bounds = GeohashManager.decode(location.geohash)
      const radius = GeohashManager.getPrivacyRadius(precision)
      
      const latError = Math.abs(bounds.center.latitude - exactLat)
      const lonError = Math.abs(bounds.center.longitude - exactLon)
      
      console.log(`Precision ${precision}: ${location.geohash}`)
      console.log(`  Privacy radius: ~${radius}km`)
      console.log(`  Location error: ${latError.toFixed(6)}° lat, ${lonError.toFixed(6)}° lon`)
      console.log(`  Bounds: ${(bounds.latitude.max - bounds.latitude.min).toFixed(6)}° × ${(bounds.longitude.max - bounds.longitude.min).toFixed(6)}°`)
    })
    
    // Show how precision affects discoverability
    console.log('\nDiscoverability analysis:')
    const location5 = GeohashManager.createPrivateLocation(exactLat, exactLon, 5)
    const location6 = GeohashManager.createPrivateLocation(exactLat, exactLon, 6)
    
    const topics5 = GeohashManager.generateLocationTopics(location5, false)
    const topics6 = GeohashManager.generateLocationTopics(location6, false)
    
    console.log(`5-digit precision generates ${topics5.length} topics`)
    console.log(`6-digit precision generates ${topics6.length} topics`)
    console.log(`Common topics: ${topics5.filter(t => topics6.includes(t)).length}`)
  }

  /**
   * Run all examples
   */
  async runAllExamples() {
    console.log('🔐 Geohash-based Location Privacy Examples\n')
    
    try {
      await this.demonstrateLocationPrivacy()
      await this.demonstrateLocationDiscovery()
      await this.demonstrateDistanceCalculations()
      await this.demonstrateNeighborDiscovery()
      await this.demonstrateLocationFiltering()
      await this.demonstratePrivacyAnalysis()
      
      console.log('\n✅ All examples completed successfully!')
    } catch (error) {
      console.error('❌ Example failed:', error)
    }
  }
}

// Export for testing
export { GeohashExample }

// Run examples if this file is executed directly
if (require.main === module) {
  const example = new GeohashExample()
  example.runAllExamples().catch(console.error)
}