import type { Libp2p } from 'libp2p'
import type { PeerId } from '@libp2p/interface'
import { peerIdFromString } from '@libp2p/peer-id'
import { multiaddr } from '@multiformats/multiaddr'

import { PeerInfo, DiscoveryCriteria, NetworkStatus } from './types'
import { DHTDiscovery } from './DHTDiscovery'

export interface BootstrapNode {
  id: string
  multiaddr: string
  protocols: string[]
  region?: string
  reliability: number // 0-1 score based on historical uptime
  lastSeen: Date
  responseTime: number // Average response time in ms
}

export interface PeerRecommendation {
  peerId: string
  score: number // 0-1 recommendation score
  reasons: string[]
  lastInteraction: Date
  successfulConnections: number
  failedConnections: number
  averageLatency: number
  sharedInterests: string[]
  geographicDistance: number // km
}

export interface BootstrapDiscoveryConfig {
  // Bootstrap configuration
  bootstrapNodes: BootstrapNode[]
  maxBootstrapAttempts: number
  bootstrapTimeout: number
  bootstrapRetryDelay: number
  
  // Fallback configuration
  enableDNSBootstrap: boolean
  dnsBootstrapDomains: string[]
  enableWebSocketBootstrap: boolean
  webSocketBootstrapUrls: string[]
  
  // Peer recommendation configuration
  maxRecommendations: number
  recommendationDecayFactor: number // How quickly old interactions lose weight
  minInteractionsForRecommendation: number
  geographicWeightFactor: number // How much to weight geographic proximity
  interestWeightFactor: number // How much to weight shared interests
  
  // Discovery fallback configuration
  fallbackDiscoveryInterval: number
  maxFallbackAttempts: number
  fallbackMethods: ('bootstrap' | 'dns' | 'websocket' | 'mdns')[]
}

export interface PeerInteractionHistory {
  peerId: string
  interactions: PeerInteraction[]
  totalConnections: number
  successfulConnections: number
  failedConnections: number
  averageLatency: number
  lastSeen: Date
  reputation: number // 0-1 based on interaction quality
}

export interface PeerInteraction {
  timestamp: Date
  type: 'connection' | 'message' | 'profile_sync' | 'media_share'
  success: boolean
  latency?: number
  errorReason?: string
  dataSize?: number
}

export class BootstrapDiscoveryManager {
  private libp2p: Libp2p | null = null
  private dhtDiscovery: DHTDiscovery | null = null
  private config: BootstrapDiscoveryConfig
  private peerHistory: Map<string, PeerInteractionHistory> = new Map()
  private bootstrapNodes: Map<string, BootstrapNode> = new Map()
  private fallbackInterval: NodeJS.Timeout | null = null
  private isInitialized = false

  constructor(config: Partial<BootstrapDiscoveryConfig> = {}) {
    this.config = {
      // Default bootstrap nodes (libp2p public bootstrap nodes)
      bootstrapNodes: [
        {
          id: 'QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
          multiaddr: '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
          protocols: ['kad-dht'],
          region: 'global',
          reliability: 0.95,
          lastSeen: new Date(),
          responseTime: 100
        },
        {
          id: 'QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
          multiaddr: '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
          protocols: ['kad-dht'],
          region: 'global',
          reliability: 0.93,
          lastSeen: new Date(),
          responseTime: 120
        }
      ],
      maxBootstrapAttempts: 5,
      bootstrapTimeout: 10000,
      bootstrapRetryDelay: 2000,
      
      enableDNSBootstrap: true,
      dnsBootstrapDomains: ['bootstrap.libp2p.io', 'bootstrap.ipfs.io'],
      enableWebSocketBootstrap: true,
      webSocketBootstrapUrls: [
        'wss://ws-star.discovery.libp2p.io',
        'wss://ws-star1.par.dwebops.pub'
      ],
      
      maxRecommendations: 10,
      recommendationDecayFactor: 0.95,
      minInteractionsForRecommendation: 3,
      geographicWeightFactor: 0.3,
      interestWeightFactor: 0.4,
      
      fallbackDiscoveryInterval: 60000, // 1 minute
      maxFallbackAttempts: 3,
      fallbackMethods: ['bootstrap', 'dns', 'websocket'],
      
      ...config
    }

    // Initialize bootstrap nodes map
    this.config.bootstrapNodes.forEach(node => {
      this.bootstrapNodes.set(node.id, node)
    })
  }

  /**
   * Initialize the bootstrap discovery manager
   */
  async initialize(libp2p: Libp2p, dhtDiscovery: DHTDiscovery): Promise<void> {
    if (this.isInitialized) {
      return
    }

    this.libp2p = libp2p
    this.dhtDiscovery = dhtDiscovery
    
    // Load peer history from storage
    await this.loadPeerHistory()
    
    // Start fallback discovery monitoring
    this.startFallbackDiscovery()
    
    this.isInitialized = true
    console.log('Bootstrap Discovery Manager initialized')
  }

  /**
   * Attempt to bootstrap network connection using various methods
   */
  async bootstrapNetwork(): Promise<boolean> {
    if (!this.libp2p) {
      throw new Error('Bootstrap Discovery Manager not initialized')
    }

    console.log('Starting network bootstrap...')
    
    // Try each fallback method in order
    for (const method of this.config.fallbackMethods) {
      try {
        console.log(`Attempting bootstrap via ${method}...`)
        
        let success = false
        switch (method) {
          case 'bootstrap':
            success = await this.bootstrapViaNodes()
            break
          case 'dns':
            success = await this.bootstrapViaDNS()
            break
          case 'websocket':
            success = await this.bootstrapViaWebSocket()
            break
          case 'mdns':
            success = await this.bootstrapViaMDNS()
            break
        }
        
        if (success) {
          console.log(`Bootstrap successful via ${method}`)
          return true
        }
      } catch (error) {
        console.warn(`Bootstrap via ${method} failed:`, error)
      }
    }
    
    console.error('All bootstrap methods failed')
    return false
  }

  /**
   * Get peer recommendations based on history and criteria
   */
  async getPeerRecommendations(criteria: DiscoveryCriteria): Promise<PeerRecommendation[]> {
    const recommendations: PeerRecommendation[] = []
    const now = Date.now()
    
    for (const [peerId, history] of this.peerHistory.entries()) {
      // Skip if not enough interactions
      if (history.interactions.length < this.config.minInteractionsForRecommendation) {
        continue
      }
      
      // Calculate base score from success rate and reputation
      const successRate = history.successfulConnections / Math.max(history.totalConnections, 1)
      let score = (successRate * 0.6) + (history.reputation * 0.4)
      
      // Apply time decay
      const daysSinceLastSeen = (now - history.lastSeen.getTime()) / (1000 * 60 * 60 * 24)
      const timeDecay = Math.pow(this.config.recommendationDecayFactor, daysSinceLastSeen)
      score *= timeDecay
      
      // Calculate geographic proximity bonus (if location data available)
      let geographicDistance = Infinity
      let geographicBonus = 0
      if (criteria.geohash && history.interactions.length > 0) {
        // Simplified distance calculation - in real implementation would use actual geohash distance
        geographicDistance = Math.random() * 100 // Placeholder
        geographicBonus = Math.max(0, (100 - geographicDistance) / 100) * this.config.geographicWeightFactor
        score += geographicBonus
      }
      
      // Calculate shared interests bonus
      const sharedInterests = this.calculateSharedInterests(peerId, criteria.interests)
      const interestBonus = (sharedInterests.length / Math.max(criteria.interests.length, 1)) * this.config.interestWeightFactor
      score += interestBonus
      
      // Generate recommendation reasons
      const reasons: string[] = []
      if (successRate > 0.8) reasons.push('High connection success rate')
      if (history.reputation > 0.7) reasons.push('Good reputation')
      if (history.averageLatency < 200) reasons.push('Low latency')
      if (sharedInterests.length > 0) reasons.push(`${sharedInterests.length} shared interests`)
      if (geographicDistance < 50) reasons.push('Geographically close')
      
      recommendations.push({
        peerId,
        score,
        reasons,
        lastInteraction: history.lastSeen,
        successfulConnections: history.successfulConnections,
        failedConnections: history.failedConnections,
        averageLatency: history.averageLatency,
        sharedInterests,
        geographicDistance
      })
    }
    
    // Sort by score and return top recommendations
    recommendations.sort((a, b) => b.score - a.score)
    return recommendations.slice(0, this.config.maxRecommendations)
  }

  /**
   * Record a peer interaction for future recommendations
   */
  recordPeerInteraction(
    peerId: string, 
    type: PeerInteraction['type'], 
    success: boolean, 
    metadata: Partial<PeerInteraction> = {}
  ): void {
    let history = this.peerHistory.get(peerId)
    
    if (!history) {
      history = {
        peerId,
        interactions: [],
        totalConnections: 0,
        successfulConnections: 0,
        failedConnections: 0,
        averageLatency: 0,
        lastSeen: new Date(),
        reputation: 0.5 // Start with neutral reputation
      }
      this.peerHistory.set(peerId, history)
    }
    
    // Create interaction record
    const interaction: PeerInteraction = {
      timestamp: new Date(),
      type,
      success,
      ...metadata
    }
    
    history.interactions.push(interaction)
    history.lastSeen = new Date()
    
    // Update connection statistics
    if (type === 'connection') {
      history.totalConnections++
      if (success) {
        history.successfulConnections++
      } else {
        history.failedConnections++
      }
    }
    
    // Update average latency
    if (interaction.latency !== undefined) {
      const totalLatency = history.averageLatency * (history.interactions.length - 1) + interaction.latency
      history.averageLatency = totalLatency / history.interactions.length
    }
    
    // Update reputation based on recent interactions
    this.updatePeerReputation(history)
    
    // Limit interaction history size
    if (history.interactions.length > 100) {
      history.interactions = history.interactions.slice(-50) // Keep last 50 interactions
    }
    
    // Persist changes
    this.savePeerHistory()
  }

  /**
   * Handle DHT discovery failure and trigger fallback mechanisms
   */
  async handleDHTFailure(): Promise<void> {
    console.log('DHT discovery failed, triggering fallback mechanisms...')
    
    // Try to bootstrap network connection
    const bootstrapSuccess = await this.bootstrapNetwork()
    
    if (!bootstrapSuccess) {
      console.warn('Bootstrap failed, using peer recommendations as fallback')
      
      // Use peer recommendations to find alternative peers
      const recommendations = await this.getPeerRecommendations({
        geohash: '',
        ageRange: [18, 99],
        interests: [],
        maxDistance: 100
      })
      
      // Try to connect to recommended peers
      for (const recommendation of recommendations.slice(0, 5)) {
        try {
          await this.connectToRecommendedPeer(recommendation)
        } catch (error) {
          console.warn(`Failed to connect to recommended peer ${recommendation.peerId}:`, error)
        }
      }
    }
  }

  /**
   * Get bootstrap and discovery statistics
   */
  getStats(): {
    bootstrapNodes: number
    availableBootstrapNodes: number
    peerHistorySize: number
    averageReputationScore: number
    totalInteractions: number
    fallbackMethodsEnabled: number
  } {
    const availableNodes = Array.from(this.bootstrapNodes.values())
      .filter(node => node.reliability > 0.5).length
    
    const totalInteractions = Array.from(this.peerHistory.values())
      .reduce((sum, history) => sum + history.interactions.length, 0)
    
    const averageReputation = Array.from(this.peerHistory.values())
      .reduce((sum, history) => sum + history.reputation, 0) / Math.max(this.peerHistory.size, 1)
    
    return {
      bootstrapNodes: this.bootstrapNodes.size,
      availableBootstrapNodes: availableNodes,
      peerHistorySize: this.peerHistory.size,
      averageReputationScore: averageReputation,
      totalInteractions,
      fallbackMethodsEnabled: this.config.fallbackMethods.length
    }
  }

  /**
   * Add a custom bootstrap node
   */
  addBootstrapNode(node: BootstrapNode): void {
    this.bootstrapNodes.set(node.id, node)
    console.log('Added bootstrap node:', node.id)
  }

  /**
   * Remove a bootstrap node
   */
  removeBootstrapNode(nodeId: string): void {
    this.bootstrapNodes.delete(nodeId)
    console.log('Removed bootstrap node:', nodeId)
  }

  /**
   * Update bootstrap node reliability based on connection success
   */
  updateBootstrapNodeReliability(nodeId: string, success: boolean, responseTime?: number): void {
    const node = this.bootstrapNodes.get(nodeId)
    if (!node) return
    
    // Update reliability using exponential moving average
    const alpha = 0.1 // Learning rate
    const newReliability = success ? 1.0 : 0.0
    node.reliability = (1 - alpha) * node.reliability + alpha * newReliability
    
    // Update response time
    if (responseTime !== undefined) {
      node.responseTime = (node.responseTime * 0.8) + (responseTime * 0.2)
    }
    
    node.lastSeen = new Date()
    
    console.log(`Updated bootstrap node ${nodeId} reliability: ${node.reliability.toFixed(3)}`)
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval)
      this.fallbackInterval = null
    }
    
    // Save peer history before cleanup
    this.savePeerHistory()
    
    this.peerHistory.clear()
    this.bootstrapNodes.clear()
    this.isInitialized = false
    
    console.log('Bootstrap Discovery Manager destroyed')
  }

  // Private helper methods

  private async bootstrapViaNodes(): Promise<boolean> {
    if (!this.libp2p) return false
    
    // Sort bootstrap nodes by reliability
    const sortedNodes = Array.from(this.bootstrapNodes.values())
      .sort((a, b) => b.reliability - a.reliability)
    
    for (const node of sortedNodes.slice(0, this.config.maxBootstrapAttempts)) {
      try {
        const startTime = Date.now()
        
        // Try to connect to bootstrap node
        const ma = multiaddr(node.multiaddr)
        const connection = await this.libp2p.dial(ma, {
          signal: AbortSignal.timeout(this.config.bootstrapTimeout)
        })
        
        const responseTime = Date.now() - startTime
        
        if (connection.status === 'open') {
          this.updateBootstrapNodeReliability(node.id, true, responseTime)
          console.log(`Successfully connected to bootstrap node: ${node.id}`)
          return true
        }
      } catch (error) {
        this.updateBootstrapNodeReliability(node.id, false)
        console.warn(`Failed to connect to bootstrap node ${node.id}:`, error)
      }
      
      // Wait before trying next node
      await new Promise(resolve => setTimeout(resolve, this.config.bootstrapRetryDelay))
    }
    
    return false
  }

  private async bootstrapViaDNS(): Promise<boolean> {
    if (!this.config.enableDNSBootstrap || !this.libp2p) return false
    
    for (const domain of this.config.dnsBootstrapDomains) {
      try {
        // In a real implementation, this would resolve DNS records for bootstrap peers
        // For now, we'll simulate DNS bootstrap
        console.log(`Attempting DNS bootstrap via ${domain}`)
        
        // Simulate DNS resolution delay
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // In practice, this would parse DNS TXT records or use dnsaddr protocol
        // to discover bootstrap peers and attempt connections
        
        console.log(`DNS bootstrap via ${domain} completed (simulated)`)
        return true
      } catch (error) {
        console.warn(`DNS bootstrap via ${domain} failed:`, error)
      }
    }
    
    return false
  }

  private async bootstrapViaWebSocket(): Promise<boolean> {
    if (!this.config.enableWebSocketBootstrap || !this.libp2p) return false
    
    for (const wsUrl of this.config.webSocketBootstrapUrls) {
      try {
        console.log(`Attempting WebSocket bootstrap via ${wsUrl}`)
        
        // In a real implementation, this would connect to WebSocket star servers
        // or other WebSocket-based discovery mechanisms
        
        // Simulate WebSocket connection
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        console.log(`WebSocket bootstrap via ${wsUrl} completed (simulated)`)
        return true
      } catch (error) {
        console.warn(`WebSocket bootstrap via ${wsUrl} failed:`, error)
      }
    }
    
    return false
  }

  private async bootstrapViaMDNS(): Promise<boolean> {
    if (!this.libp2p) return false
    
    try {
      console.log('Attempting mDNS bootstrap...')
      
      // In a real implementation, this would use mDNS to discover local peers
      // libp2p has built-in mDNS support that can be enabled
      
      // Simulate mDNS discovery
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      console.log('mDNS bootstrap completed (simulated)')
      return true
    } catch (error) {
      console.warn('mDNS bootstrap failed:', error)
      return false
    }
  }

  private startFallbackDiscovery(): void {
    this.fallbackInterval = setInterval(async () => {
      if (!this.libp2p || !this.dhtDiscovery) return
      
      // Check if DHT is healthy
      const networkStatus = this.getNetworkStatus()
      
      if (!networkStatus.dhtConnected || networkStatus.peerCount < 3) {
        console.log('Network appears unhealthy, triggering fallback discovery...')
        await this.handleDHTFailure()
      }
    }, this.config.fallbackDiscoveryInterval)
  }

  private getNetworkStatus(): NetworkStatus {
    if (!this.libp2p) {
      return {
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }
    }
    
    const connections = this.libp2p.getConnections()
    const dhtService = this.libp2p.services.dht as any
    
    return {
      connected: this.libp2p.status === 'started',
      peerCount: connections.length,
      dhtConnected: dhtService?.isStarted() || false,
      latency: 0, // TODO: Calculate actual latency
      bandwidth: { up: 0, down: 0 }
    }
  }

  private async connectToRecommendedPeer(recommendation: PeerRecommendation): Promise<void> {
    if (!this.libp2p) return
    
    try {
      const peerId = peerIdFromString(recommendation.peerId)
      const connection = await this.libp2p.dial(peerId)
      
      if (connection.status === 'open') {
        this.recordPeerInteraction(recommendation.peerId, 'connection', true)
        console.log(`Connected to recommended peer: ${recommendation.peerId}`)
      }
    } catch (error) {
      this.recordPeerInteraction(recommendation.peerId, 'connection', false, {
        errorReason: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  private calculateSharedInterests(peerId: string, interests: string[]): string[] {
    // In a real implementation, this would look up the peer's interests
    // from profile data or interaction history
    // For now, return a simulated set of shared interests
    const peerInterests = ['music', 'travel', 'food', 'sports'] // Placeholder
    return interests.filter(interest => peerInterests.includes(interest))
  }

  private updatePeerReputation(history: PeerInteractionHistory): void {
    const recentInteractions = history.interactions.slice(-20) // Last 20 interactions
    
    if (recentInteractions.length === 0) {
      history.reputation = 0.5
      return
    }
    
    // Calculate success rate for recent interactions
    const successCount = recentInteractions.filter(i => i.success).length
    const successRate = successCount / recentInteractions.length
    
    // Calculate average response quality (based on latency, data size, etc.)
    const avgLatency = recentInteractions
      .filter(i => i.latency !== undefined)
      .reduce((sum, i) => sum + (i.latency || 0), 0) / recentInteractions.length
    
    const latencyScore = Math.max(0, 1 - (avgLatency / 1000)) // Normalize latency to 0-1
    
    // Combine factors to calculate reputation
    history.reputation = (successRate * 0.7) + (latencyScore * 0.3)
    
    // Ensure reputation stays within bounds
    history.reputation = Math.max(0, Math.min(1, history.reputation))
  }

  private async loadPeerHistory(): Promise<void> {
    try {
      // In a real implementation, this would load from persistent storage
      // For now, we'll start with an empty history
      console.log('Peer history loaded (placeholder)')
    } catch (error) {
      console.warn('Failed to load peer history:', error)
    }
  }

  private savePeerHistory(): void {
    try {
      // In a real implementation, this would save to persistent storage
      // For now, we'll just log the action
      console.log('Peer history saved (placeholder)')
    } catch (error) {
      console.warn('Failed to save peer history:', error)
    }
  }
}