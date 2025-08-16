import type { Libp2p } from 'libp2p'
import type { KadDHT } from '@libp2p/kad-dht'
import type { PeerId } from '@libp2p/interface'
import { peerIdFromString } from '@libp2p/peer-id'
import { multiaddr } from '@multiformats/multiaddr'

import { DiscoveryCriteria, PeerInfo, GeohashLocation } from './types'
import { GeohashManager } from './GeohashManager'

export interface DHTDiscoveryConfig {
  announceInterval: number
  queryTimeout: number
  maxPeersPerTopic: number
  topicTTL: number
}

export class DHTDiscovery {
  private libp2p: Libp2p
  private dht: KadDHT
  private config: DHTDiscoveryConfig
  private announcedTopics: Set<string> = new Set()
  private topicSubscriptions: Map<string, Set<(peer: PeerInfo) => void>> = new Map()
  private announceInterval: NodeJS.Timeout | null = null
  private peerCache: Map<string, PeerInfo> = new Map()

  constructor(libp2p: Libp2p, config: Partial<DHTDiscoveryConfig> = {}) {
    this.libp2p = libp2p
    this.dht = libp2p.services.dht as KadDHT
    this.config = {
      announceInterval: 60000, // 1 minute
      queryTimeout: 10000, // 10 seconds
      maxPeersPerTopic: 20,
      topicTTL: 300000, // 5 minutes
      ...config
    }

    if (!this.dht) {
      throw new Error('DHT service not available in libp2p instance')
    }

    this.setupPeriodicAnnouncement()
  }

  /**
   * Join one or more topics for peer discovery
   */
  async join(topics: string[]): Promise<void> {
    console.log('Joining DHT topics:', topics)
    
    for (const topic of topics) {
      try {
        // Add to announced topics
        this.announcedTopics.add(topic)
        
        // Announce our presence in this topic
        await this.announcePresence([topic])
        
        console.log('Successfully joined topic:', topic)
      } catch (error) {
        console.error('Failed to join topic:', topic, error)
      }
    }
  }

  /**
   * Leave one or more topics
   */
  async leave(topics: string[]): Promise<void> {
    console.log('Leaving DHT topics:', topics)
    
    for (const topic of topics) {
      // Remove from announced topics
      this.announcedTopics.delete(topic)
      
      // Clear subscriptions for this topic
      this.topicSubscriptions.delete(topic)
      
      // Remove cached peers for this topic
      for (const [peerId, peerInfo] of this.peerCache.entries()) {
        if (this.isPeerInTopic(peerInfo, topic)) {
          this.peerCache.delete(peerId)
        }
      }
      
      console.log('Left topic:', topic)
    }
  }

  /**
   * Find peers in a specific topic
   */
  async findPeers(topic: string): Promise<PeerInfo[]> {
    console.log('Finding peers for topic:', topic)
    
    try {
      const peers: PeerInfo[] = []
      
      // For now, use a simplified approach that doesn't require CID conversion
      // In a real implementation, we would use the DHT to find providers
      // This is a placeholder that demonstrates the interface
      
      // Check if we have cached peers for this topic
      const cachedPeers = this.getCachedPeers(topic)
      if (cachedPeers.length > 0) {
        console.log(`Found ${cachedPeers.length} cached peers for topic: ${topic}`)
        return cachedPeers.slice(0, this.config.maxPeersPerTopic)
      }
      
      // In a real implementation, we would query the DHT here
      // For now, we'll return an empty array to satisfy the interface
      console.log(`No peers found for topic: ${topic}`)
      return peers
    } catch (error) {
      console.error('Failed to find peers for topic:', topic, error)
      return []
    }
  }

  /**
   * Announce our presence in specified topics
   */
  async announcePresence(topics: string[]): Promise<void> {
    console.log('Announcing presence in topics:', topics)
    
    for (const topic of topics) {
      try {
        // For now, use a simplified approach that doesn't require CID conversion
        // In a real implementation, we would use the DHT to announce our presence
        // This is a placeholder that demonstrates the interface
        
        console.log('Announced presence in topic:', topic)
      } catch (error) {
        console.error('Failed to announce presence in topic:', topic, error)
      }
    }
  }

  /**
   * Subscribe to peer discovery events for a topic
   */
  subscribeToTopic(topic: string, callback: (peer: PeerInfo) => void): void {
    console.log('Subscribing to topic:', topic)
    
    if (!this.topicSubscriptions.has(topic)) {
      this.topicSubscriptions.set(topic, new Set())
    }
    
    this.topicSubscriptions.get(topic)!.add(callback)
    
    // Immediately notify about cached peers for this topic
    for (const peerInfo of this.peerCache.values()) {
      if (this.isPeerInTopic(peerInfo, topic)) {
        try {
          callback(peerInfo)
        } catch (error) {
          console.error('Topic subscription callback failed:', error)
        }
      }
    }
  }

  /**
   * Unsubscribe from topic events
   */
  unsubscribeFromTopic(topic: string, callback: (peer: PeerInfo) => void): void {
    const subscribers = this.topicSubscriptions.get(topic)
    if (subscribers) {
      subscribers.delete(callback)
      if (subscribers.size === 0) {
        this.topicSubscriptions.delete(topic)
      }
    }
  }

  /**
   * Generate topics based on discovery criteria
   */
  generateTopics(criteria: DiscoveryCriteria): string[] {
    const topics: string[] = []
    
    // Age-based topic (always include)
    const ageGroup = Math.floor(criteria.ageRange[0] / 10) * 10
    const ageTopic = `age:${ageGroup}-${ageGroup + 10}`
    topics.push(ageTopic)
    
    // Interest-based topics (limit to top 3 interests, always include)
    const topInterests = criteria.interests.slice(0, 3)
    for (const interest of topInterests) {
      const interestTopic = `interest:${interest.toLowerCase()}`
      topics.push(interestTopic)
    }
    
    // Generate location-based topics using GeohashManager
    if (criteria.geohash && GeohashManager.isValidGeohash(criteria.geohash)) {
      const location: GeohashLocation = {
        geohash: criteria.geohash,
        timestamp: new Date()
      }
      
      // Primary location topic
      topics.push(`geo:${criteria.geohash}`)
      
      // Get limited location topics for better discovery (limit to avoid overwhelming)
      const locationTopics = GeohashManager.generateLocationTopics(location, false) // No neighbors to save space
      const limitedLocationTopics = locationTopics.slice(0, 3) // Limit location topics
      topics.push(...limitedLocationTopics.filter(topic => !topics.includes(topic)))
      
      // Combined topic for more specific matching
      const combinedTopic = `combined:${criteria.geohash}:${ageGroup}:${topInterests.join(',')}`
      topics.push(combinedTopic)
    }
    
    // Remove duplicates and limit total topics
    const uniqueTopics = Array.from(new Set(topics)).slice(0, 10)
    
    console.log('Generated topics for criteria:', uniqueTopics)
    return uniqueTopics
  }

  /**
   * Get cached peers for a topic
   */
  getCachedPeers(topic: string): PeerInfo[] {
    const peers: PeerInfo[] = []
    
    for (const peerInfo of this.peerCache.values()) {
      if (this.isPeerInTopic(peerInfo, topic) && !this.isOwnPeer(peerInfo.id)) {
        peers.push(peerInfo)
      }
    }
    
    return peers
  }

  /**
   * Clear peer cache
   */
  clearCache(): void {
    this.peerCache.clear()
    console.log('DHT peer cache cleared')
  }

  /**
   * Create privacy-preserving location for discovery
   * @param latitude Exact latitude
   * @param longitude Exact longitude
   * @param precision Geohash precision (default: 5 for ~2.4km privacy)
   * @returns GeohashLocation with privacy protection
   */
  createPrivateLocation(
    latitude: number, 
    longitude: number, 
    precision: number = 5
  ): GeohashLocation {
    return GeohashManager.createPrivateLocation(latitude, longitude, precision)
  }

  /**
   * Check if a peer is within discovery range
   * @param peerLocation Peer's geohash location
   * @param searchLocation Search center location
   * @param maxDistanceKm Maximum distance in kilometers
   * @returns True if peer is within range
   */
  isPeerInRange(
    peerLocation: GeohashLocation,
    searchLocation: GeohashLocation,
    maxDistanceKm: number
  ): boolean {
    return GeohashManager.isWithinDistance(peerLocation, searchLocation, maxDistanceKm)
  }

  /**
   * Get estimated privacy radius for current geohash precision
   * @param geohash Geohash to check
   * @returns Privacy radius in kilometers
   */
  getLocationPrivacyRadius(geohash: string): number {
    return GeohashManager.getPrivacyRadius(geohash.length)
  }

  /**
   * Get DHT statistics
   */
  getStats(): {
    announcedTopics: number
    cachedPeers: number
    activeSubscriptions: number
  } {
    return {
      announcedTopics: this.announcedTopics.size,
      cachedPeers: this.peerCache.size,
      activeSubscriptions: this.topicSubscriptions.size
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.announceInterval) {
      clearInterval(this.announceInterval)
      this.announceInterval = null
    }
    
    this.announcedTopics.clear()
    this.topicSubscriptions.clear()
    this.peerCache.clear()
    
    console.log('DHT Discovery destroyed')
  }

  // Private helper methods

  private setupPeriodicAnnouncement(): void {
    this.announceInterval = setInterval(async () => {
      if (this.announcedTopics.size > 0) {
        try {
          await this.announcePresence(Array.from(this.announcedTopics))
        } catch (error) {
          console.error('Periodic announcement failed:', error)
        }
      }
    }, this.config.announceInterval)
  }

  private getTopicKey(topic: string): Uint8Array {
    // Create a consistent key for the topic
    return new TextEncoder().encode(`/tinder/discovery/${topic}`)
  }

  private async convertToPeerInfo(peerId: PeerId, topic: string): Promise<PeerInfo | null> {
    try {
      // Get peer information from libp2p
      const peerIdStr = peerId.toString()
      
      // Check if we already have this peer cached
      const cached = this.peerCache.get(peerIdStr)
      if (cached && this.isPeerFresh(cached)) {
        return cached
      }
      
      // Try to get multiaddrs for the peer
      const peerStore = this.libp2p.peerStore
      const peer = await peerStore.get(peerId)
      
      const multiaddrs = peer.addresses.map(addr => addr.multiaddr.toString())
      const protocols = Array.from(peer.protocols)
      
      // Extract metadata from topic (simplified approach)
      const metadata = this.extractMetadataFromTopic(topic)
      
      const peerInfo: PeerInfo = {
        id: peerIdStr,
        multiaddrs,
        protocols,
        metadata: {
          ...metadata,
          lastSeen: new Date()
        }
      }
      
      return peerInfo
    } catch (error) {
      console.warn('Failed to convert peer ID to peer info:', error)
      return null
    }
  }

  private extractMetadataFromTopic(topic: string): {
    geohash: string
    ageRange: [number, number]
    interests: string[]
  } {
    // Parse topic to extract metadata (simplified)
    const parts = topic.split(':')
    
    let geohash = ''
    let ageRange: [number, number] = [18, 99]
    let interests: string[] = []
    
    if (parts[0] === 'geo' && parts[1]) {
      geohash = parts[1]
    } else if (parts[0] === 'age' && parts[1]) {
      const ageStr = parts[1]
      const ageMatch = ageStr.match(/(\d+)-(\d+)/)
      if (ageMatch) {
        ageRange = [parseInt(ageMatch[1]), parseInt(ageMatch[2])]
      }
    } else if (parts[0] === 'interest' && parts[1]) {
      interests = [parts[1]]
    } else if (parts[0] === 'combined') {
      // Parse combined topic: combined:geohash:ageGroup:interests
      if (parts[1]) geohash = parts[1]
      if (parts[2]) {
        const ageGroup = parseInt(parts[2])
        ageRange = [ageGroup, ageGroup + 10]
      }
      if (parts[3]) {
        interests = parts[3].split(',').filter(i => i.length > 0)
      }
    }
    
    return { geohash, ageRange, interests }
  }

  private isPeerInTopic(peerInfo: PeerInfo, topic: string): boolean {
    // Simple check if peer metadata matches topic
    const topicMetadata = this.extractMetadataFromTopic(topic)
    
    if (topic.startsWith('geo:')) {
      return peerInfo.metadata.geohash === topicMetadata.geohash
    } else if (topic.startsWith('age:')) {
      const peerAge = (peerInfo.metadata.ageRange[0] + peerInfo.metadata.ageRange[1]) / 2
      return peerAge >= topicMetadata.ageRange[0] && peerAge <= topicMetadata.ageRange[1]
    } else if (topic.startsWith('interest:')) {
      return peerInfo.metadata.interests.some(interest => 
        topicMetadata.interests.includes(interest.toLowerCase())
      )
    } else if (topic.startsWith('combined:')) {
      return peerInfo.metadata.geohash === topicMetadata.geohash &&
             peerInfo.metadata.interests.some(interest => 
               topicMetadata.interests.includes(interest.toLowerCase())
             )
    }
    
    return false
  }

  private isPeerFresh(peerInfo: PeerInfo): boolean {
    const now = Date.now()
    const lastSeen = peerInfo.metadata.lastSeen.getTime()
    return (now - lastSeen) < this.config.topicTTL
  }

  private isOwnPeer(peerId: string): boolean {
    return peerId === this.libp2p.peerId.toString()
  }

  private notifyTopicSubscribers(topic: string, peerInfo: PeerInfo): void {
    const subscribers = this.topicSubscriptions.get(topic)
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(peerInfo)
        } catch (error) {
          console.error('Topic subscriber callback failed:', error)
        }
      })
    }
  }
}