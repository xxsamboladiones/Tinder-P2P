import type { Libp2p } from 'libp2p'
import type { Connection, PeerId } from '@libp2p/interface'
import { NetworkStatus, PeerInfo } from './types'
import { EventEmitter } from './utils/EventEmitter'

export interface PeerConnectionMetrics {
  peerId: string
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'failed'
  latency: number
  bandwidth: { up: number; down: number }
  packetsLost: number
  packetsReceived: number
  packetsSent: number
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor'
  lastSeen: Date
  connectionDuration: number
  reconnectAttempts: number
  protocols: string[]
  multiaddrs: string[]
}

export interface NetworkDiagnostics {
  networkStatus: NetworkStatus
  peerMetrics: PeerConnectionMetrics[]
  dhtStatus: {
    connected: boolean
    routingTableSize: number
    knownPeers: number
    activeQueries: number
    lastBootstrap: Date | null
  }
  troubleshooting: {
    issues: NetworkIssue[]
    recommendations: string[]
    healthScore: number // 0-100
  }
  performance: {
    averageLatency: number
    totalBandwidth: { up: number; down: number }
    connectionSuccess: number // percentage
    messageDeliveryRate: number // percentage
  }
}

export interface NetworkIssue {
  type: 'connection' | 'dht' | 'bandwidth' | 'latency' | 'peer_discovery'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  affectedPeers?: string[]
  timestamp: Date
  resolved: boolean
}

export interface NetworkTroubleshootingResult {
  issues: NetworkIssue[]
  recommendations: string[]
  healthScore: number
  canAutoFix: boolean
  autoFixActions: string[]
}

export class NetworkDiagnosticsManager extends EventEmitter {
  private libp2p: Libp2p | null = null
  private peerMetrics: Map<string, PeerConnectionMetrics> = new Map()
  private networkHistory: NetworkStatus[] = []
  private maxHistorySize = 100
  private monitoringInterval: NodeJS.Timeout | null = null
  private latencyTests: Map<string, number[]> = new Map()
  private bandwidthTests: Map<string, { up: number[]; down: number[] }> = new Map()
  private messageStats = {
    sent: 0,
    received: 0,
    failed: 0,
    delivered: 0
  }

  constructor() {
    super()
  }

  initialize(libp2p: Libp2p): void {
    this.libp2p = libp2p
    this.setupEventListeners()
    this.startMonitoring()
  }

  private setupEventListeners(): void {
    if (!this.libp2p) return

    // Connection events
    this.libp2p.addEventListener('peer:connect', (event) => {
      const peerId = event.detail.toString()
      this.onPeerConnected(peerId)
    })

    this.libp2p.addEventListener('peer:disconnect', (event) => {
      const peerId = event.detail.toString()
      this.onPeerDisconnected(peerId)
    })

    // Connection state changes
    this.libp2p.addEventListener('connection:open', (event) => {
      const connection = event.detail
      this.onConnectionOpen(connection)
    })

    this.libp2p.addEventListener('connection:close', (event) => {
      const connection = event.detail
      this.onConnectionClose(connection)
    })
  }

  private startMonitoring(): void {
    // Monitor network status every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this.updateNetworkMetrics()
      this.detectNetworkIssues()
    }, 5000)
  }

  private onPeerConnected(peerId: string): void {
    const metrics: PeerConnectionMetrics = {
      peerId,
      connectionState: 'connected',
      latency: 0,
      bandwidth: { up: 0, down: 0 },
      packetsLost: 0,
      packetsReceived: 0,
      packetsSent: 0,
      connectionQuality: 'good',
      lastSeen: new Date(),
      connectionDuration: 0,
      reconnectAttempts: 0,
      protocols: [],
      multiaddrs: []
    }

    this.peerMetrics.set(peerId, metrics)
    this.emit('peer:connected', peerId, metrics)
  }

  private onPeerDisconnected(peerId: string): void {
    const metrics = this.peerMetrics.get(peerId)
    if (metrics) {
      metrics.connectionState = 'disconnected'
      metrics.lastSeen = new Date()
      this.emit('peer:disconnected', peerId, metrics)
    }
  }

  private onConnectionOpen(connection: Connection): void {
    const peerId = connection.remotePeer.toString()
    const metrics = this.peerMetrics.get(peerId)
    
    if (metrics) {
      metrics.connectionState = 'connected'
      metrics.protocols = connection.remoteAddr.protos().map((p: any) => p.name)
      metrics.multiaddrs = [connection.remoteAddr.toString()]
      metrics.lastSeen = new Date()
    }
  }

  private onConnectionClose(connection: Connection): void {
    const peerId = connection.remotePeer.toString()
    const metrics = this.peerMetrics.get(peerId)
    
    if (metrics) {
      metrics.connectionState = 'disconnected'
      metrics.lastSeen = new Date()
    }
  }

  private updateNetworkMetrics(): void {
    if (!this.libp2p) return

    // Update peer metrics
    for (const [peerId, metrics] of this.peerMetrics) {
      this.updatePeerMetrics(peerId, metrics)
    }

    // Update network history
    const currentStatus = this.getCurrentNetworkStatus()
    this.networkHistory.push(currentStatus)
    
    if (this.networkHistory.length > this.maxHistorySize) {
      this.networkHistory.shift()
    }

    this.emit('metrics:updated', this.getNetworkDiagnostics())
  }

  private async updatePeerMetrics(peerId: string, metrics: PeerConnectionMetrics): Promise<void> {
    try {
      // Test latency
      const latency = await this.measureLatency(peerId)
      if (latency > 0) {
        metrics.latency = latency
        
        // Store latency history
        if (!this.latencyTests.has(peerId)) {
          this.latencyTests.set(peerId, [])
        }
        const latencyHistory = this.latencyTests.get(peerId)!
        latencyHistory.push(latency)
        if (latencyHistory.length > 10) {
          latencyHistory.shift()
        }
      }

      // Update connection quality based on latency and packet loss
      metrics.connectionQuality = this.calculateConnectionQuality(metrics)
      
      // Update connection duration
      if (metrics.connectionState === 'connected') {
        metrics.connectionDuration = Date.now() - metrics.lastSeen.getTime()
      }

    } catch (error) {
      console.warn(`Failed to update metrics for peer ${peerId}:`, error)
    }
  }

  private async measureLatency(peerId: string): Promise<number> {
    if (!this.libp2p) return 0

    try {
      const start = Date.now()
      await (this.libp2p.services.ping as any).ping(peerId)
      return Date.now() - start
    } catch (error) {
      return 0
    }
  }

  private calculateConnectionQuality(metrics: PeerConnectionMetrics): 'excellent' | 'good' | 'fair' | 'poor' {
    const { latency, packetsLost, packetsReceived } = metrics
    
    // Calculate packet loss rate
    const packetLossRate = packetsReceived > 0 ? packetsLost / packetsReceived : 0
    
    if (latency < 100 && packetLossRate < 0.01) return 'excellent'
    if (latency < 300 && packetLossRate < 0.05) return 'good'
    if (latency < 500 && packetLossRate < 0.1) return 'fair'
    return 'poor'
  }

  private getCurrentNetworkStatus(): NetworkStatus {
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
    const averageLatency = this.calculateAverageLatency()
    const totalBandwidth = this.calculateTotalBandwidth()

    return {
      connected: this.libp2p.status === 'started',
      peerCount: connections.length,
      dhtConnected: this.isDHTConnected(),
      latency: averageLatency,
      bandwidth: totalBandwidth
    }
  }

  private calculateAverageLatency(): number {
    const connectedMetrics = Array.from(this.peerMetrics.values())
      .filter(m => m.connectionState === 'connected' && m.latency > 0)
    
    if (connectedMetrics.length === 0) return 0
    
    const totalLatency = connectedMetrics.reduce((sum, m) => sum + m.latency, 0)
    return totalLatency / connectedMetrics.length
  }

  private calculateTotalBandwidth(): { up: number; down: number } {
    const connectedMetrics = Array.from(this.peerMetrics.values())
      .filter(m => m.connectionState === 'connected')
    
    return connectedMetrics.reduce(
      (total, m) => ({
        up: total.up + m.bandwidth.up,
        down: total.down + m.bandwidth.down
      }),
      { up: 0, down: 0 }
    )
  }

  private isDHTConnected(): boolean {
    if (!this.libp2p) return false
    
    try {
      const dhtService = this.libp2p.services.dht as any
      return dhtService?.isStarted() || false
    } catch {
      return false
    }
  }

  private detectNetworkIssues(): void {
    const issues: NetworkIssue[] = []
    const currentStatus = this.getCurrentNetworkStatus()

    // Check for connection issues
    if (!currentStatus.connected) {
      issues.push({
        type: 'connection',
        severity: 'critical',
        description: 'P2P network is not connected',
        timestamp: new Date(),
        resolved: false
      })
    }

    // Check for DHT issues
    if (!currentStatus.dhtConnected) {
      issues.push({
        type: 'dht',
        severity: 'high',
        description: 'DHT is not connected - peer discovery may be limited',
        timestamp: new Date(),
        resolved: false
      })
    }

    // Check for low peer count
    if (currentStatus.peerCount < 3) {
      issues.push({
        type: 'peer_discovery',
        severity: 'medium',
        description: `Low peer count (${currentStatus.peerCount}) - network may be isolated`,
        timestamp: new Date(),
        resolved: false
      })
    }

    // Check for high latency
    if (currentStatus.latency > 1000) {
      issues.push({
        type: 'latency',
        severity: 'medium',
        description: `High network latency (${currentStatus.latency}ms)`,
        timestamp: new Date(),
        resolved: false
      })
    }

    // Check for poor connection quality
    const poorConnections = Array.from(this.peerMetrics.values())
      .filter(m => m.connectionQuality === 'poor')
    
    if (poorConnections.length > 0) {
      issues.push({
        type: 'connection',
        severity: 'medium',
        description: `${poorConnections.length} peer(s) have poor connection quality`,
        affectedPeers: poorConnections.map(m => m.peerId),
        timestamp: new Date(),
        resolved: false
      })
    }

    if (issues.length > 0) {
      this.emit('issues:detected', issues)
    }
  }

  // Public API methods
  getNetworkDiagnostics(): NetworkDiagnostics {
    const currentStatus = this.getCurrentNetworkStatus()
    const peerMetrics = Array.from(this.peerMetrics.values())
    
    return {
      networkStatus: currentStatus,
      peerMetrics,
      dhtStatus: this.getDHTStatus(),
      troubleshooting: this.getTroubleshootingInfo(),
      performance: this.getPerformanceMetrics()
    }
  }

  private getDHTStatus() {
    if (!this.libp2p) {
      return {
        connected: false,
        routingTableSize: 0,
        knownPeers: 0,
        activeQueries: 0,
        lastBootstrap: null
      }
    }

    try {
      const dhtService = this.libp2p.services.dht as any
      return {
        connected: dhtService?.isStarted() || false,
        routingTableSize: dhtService?.routingTable?.size || 0,
        knownPeers: this.libp2p.getPeers().length,
        activeQueries: 0, // TODO: Implement active query tracking
        lastBootstrap: null // TODO: Track last bootstrap time
      }
    } catch {
      return {
        connected: false,
        routingTableSize: 0,
        knownPeers: 0,
        activeQueries: 0,
        lastBootstrap: null
      }
    }
  }

  private getTroubleshootingInfo() {
    const issues: NetworkIssue[] = []
    const recommendations: string[] = []
    
    const currentStatus = this.getCurrentNetworkStatus()
    
    // Analyze current state and provide recommendations
    if (!currentStatus.connected) {
      recommendations.push('Check internet connection')
      recommendations.push('Verify firewall settings')
      recommendations.push('Try different STUN/TURN servers')
    }
    
    if (!currentStatus.dhtConnected) {
      recommendations.push('Check bootstrap node connectivity')
      recommendations.push('Verify DHT configuration')
    }
    
    if (currentStatus.peerCount < 3) {
      recommendations.push('Wait for more peers to join the network')
      recommendations.push('Check geolocation settings')
      recommendations.push('Verify discovery criteria')
    }
    
    const healthScore = this.calculateHealthScore()
    
    return {
      issues,
      recommendations,
      healthScore
    }
  }

  private getPerformanceMetrics() {
    const connectedPeers = Array.from(this.peerMetrics.values())
      .filter(m => m.connectionState === 'connected')
    
    const averageLatency = this.calculateAverageLatency()
    const totalBandwidth = this.calculateTotalBandwidth()
    
    // Calculate connection success rate
    const totalAttempts = Array.from(this.peerMetrics.values())
      .reduce((sum, m) => sum + m.reconnectAttempts + 1, 0)
    const successfulConnections = connectedPeers.length
    const connectionSuccess = totalAttempts > 0 ? (successfulConnections / totalAttempts) * 100 : 0
    
    // Calculate message delivery rate
    const totalMessages = this.messageStats.sent
    const deliveredMessages = this.messageStats.delivered
    const messageDeliveryRate = totalMessages > 0 ? (deliveredMessages / totalMessages) * 100 : 100
    
    return {
      averageLatency,
      totalBandwidth,
      connectionSuccess,
      messageDeliveryRate
    }
  }

  private calculateHealthScore(): number {
    const currentStatus = this.getCurrentNetworkStatus()
    let score = 100
    
    // Deduct points for issues
    if (!currentStatus.connected) score -= 50
    if (!currentStatus.dhtConnected) score -= 20
    if (currentStatus.peerCount < 3) score -= 15
    if (currentStatus.latency > 500) score -= 10
    if (currentStatus.latency > 1000) score -= 10
    
    // Check peer connection quality
    const poorConnections = Array.from(this.peerMetrics.values())
      .filter(m => m.connectionQuality === 'poor').length
    score -= poorConnections * 5
    
    return Math.max(0, score)
  }

  async runNetworkTroubleshooting(): Promise<NetworkTroubleshootingResult> {
    const issues: NetworkIssue[] = []
    const recommendations: string[] = []
    const autoFixActions: string[] = []
    
    // Test basic connectivity
    const connectivityTest = await this.testConnectivity()
    if (!connectivityTest.success) {
      issues.push({
        type: 'connection',
        severity: 'critical',
        description: connectivityTest.error || 'Network connectivity test failed',
        timestamp: new Date(),
        resolved: false
      })
      recommendations.push('Check internet connection')
      recommendations.push('Verify firewall settings')
    }
    
    // Test DHT connectivity
    const dhtTest = await this.testDHTConnectivity()
    if (!dhtTest.success) {
      issues.push({
        type: 'dht',
        severity: 'high',
        description: dhtTest.error || 'DHT connectivity test failed',
        timestamp: new Date(),
        resolved: false
      })
      recommendations.push('Check bootstrap nodes')
      autoFixActions.push('Retry DHT bootstrap')
    }
    
    // Test peer discovery
    const discoveryTest = await this.testPeerDiscovery()
    if (!discoveryTest.success) {
      issues.push({
        type: 'peer_discovery',
        severity: 'medium',
        description: discoveryTest.error || 'Peer discovery test failed',
        timestamp: new Date(),
        resolved: false
      })
      recommendations.push('Adjust discovery criteria')
      recommendations.push('Check geolocation settings')
    }
    
    const healthScore = this.calculateHealthScore()
    const canAutoFix = autoFixActions.length > 0
    
    return {
      issues,
      recommendations,
      healthScore,
      canAutoFix,
      autoFixActions
    }
  }

  private async testConnectivity(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.libp2p || this.libp2p.status !== 'started') {
        return { success: false, error: 'P2P node not started' }
      }
      
      // Test if we can reach any peers
      const connections = this.libp2p.getConnections()
      if (connections.length === 0) {
        return { success: false, error: 'No peer connections available' }
      }
      
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private async testDHTConnectivity(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.libp2p) {
        return { success: false, error: 'P2P node not available' }
      }
      
      const dhtService = this.libp2p.services.dht as any
      if (!dhtService?.isStarted()) {
        return { success: false, error: 'DHT service not started' }
      }
      
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'DHT test failed' }
    }
  }

  private async testPeerDiscovery(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.libp2p) {
        return { success: false, error: 'P2P node not available' }
      }
      
      const peers = this.libp2p.getPeers()
      if (peers.length === 0) {
        return { success: false, error: 'No peers discovered' }
      }
      
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Peer discovery test failed' }
    }
  }

  // Utility methods for external monitoring
  getPeerMetrics(peerId: string): PeerConnectionMetrics | null {
    return this.peerMetrics.get(peerId) || null
  }

  getAllPeerMetrics(): PeerConnectionMetrics[] {
    return Array.from(this.peerMetrics.values())
  }

  getNetworkHistory(): NetworkStatus[] {
    return [...this.networkHistory]
  }

  recordMessageSent(): void {
    this.messageStats.sent++
  }

  recordMessageReceived(): void {
    this.messageStats.received++
  }

  recordMessageDelivered(): void {
    this.messageStats.delivered++
  }

  recordMessageFailed(): void {
    this.messageStats.failed++
  }

  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
    
    this.peerMetrics.clear()
    this.networkHistory.length = 0
    this.latencyTests.clear()
    this.bandwidthTests.clear()
    this.removeAllListeners()
  }
}