import { NetworkDiagnosticsManager, NetworkDiagnostics, PeerConnectionMetrics } from '../NetworkDiagnosticsManager'
import { P2PManager } from '../P2PManager'
import { P2PConfig } from '../types'

/**
 * Example demonstrating comprehensive network diagnostics and monitoring
 * for P2P networks in the Tinder-like application.
 */
export class NetworkDiagnosticsExample {
  private p2pManager: P2PManager
  private diagnosticsManager: NetworkDiagnosticsManager
  private monitoringActive = false

  constructor() {
    // Initialize P2P manager with test configuration
    const config: Partial<P2PConfig> = {
      bootstrapNodes: [
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN'
      ],
      stunServers: ['stun:stun.l.google.com:19302'],
      maxPeers: 20,
      discoveryInterval: 10000
    }

    this.p2pManager = new P2PManager(config)
    this.diagnosticsManager = new NetworkDiagnosticsManager()
  }

  /**
   * Initialize and start network monitoring
   */
  async startNetworkMonitoring(): Promise<void> {
    console.log('🚀 Starting P2P network with diagnostics...')

    try {
      // Initialize P2P network
      await this.p2pManager.initialize()
      await this.p2pManager.connect()

      // Initialize diagnostics with the libp2p instance
      const libp2p = (this.p2pManager as any).libp2p
      if (libp2p) {
        this.diagnosticsManager.initialize(libp2p)
        this.setupDiagnosticsEventHandlers()
        this.monitoringActive = true
        console.log('✅ Network diagnostics initialized successfully')
      } else {
        throw new Error('Failed to get libp2p instance')
      }

      // Start periodic reporting
      this.startPeriodicReporting()

    } catch (error) {
      console.error('❌ Failed to start network monitoring:', error)
      throw error
    }
  }

  /**
   * Set up event handlers for network diagnostics
   */
  private setupDiagnosticsEventHandlers(): void {
    // Monitor peer connections
    this.diagnosticsManager.on('peer:connected', (peerId: string, metrics: PeerConnectionMetrics) => {
      console.log(`🔗 Peer connected: ${peerId}`)
      console.log(`   Connection quality: ${metrics.connectionQuality}`)
      console.log(`   Protocols: ${metrics.protocols.join(', ')}`)
    })

    this.diagnosticsManager.on('peer:disconnected', (peerId: string, metrics: PeerConnectionMetrics) => {
      console.log(`💔 Peer disconnected: ${peerId}`)
      console.log(`   Connection duration: ${metrics.connectionDuration}ms`)
      console.log(`   Reconnect attempts: ${metrics.reconnectAttempts}`)
    })

    // Monitor network issues
    this.diagnosticsManager.on('issues:detected', (issues) => {
      console.log(`⚠️  Network issues detected (${issues.length}):`)
      issues.forEach(issue => {
        const severityIcon = this.getSeverityIcon(issue.severity)
        console.log(`   ${severityIcon} ${issue.type}: ${issue.description}`)
        if (issue.affectedPeers) {
          console.log(`      Affected peers: ${issue.affectedPeers.join(', ')}`)
        }
      })
    })

    // Monitor metrics updates
    this.diagnosticsManager.on('metrics:updated', (diagnostics: NetworkDiagnostics) => {
      // Only log significant changes to avoid spam
      if (this.shouldLogMetricsUpdate(diagnostics)) {
        console.log('📊 Network metrics updated:')
        this.logNetworkStatus(diagnostics.networkStatus)
      }
    })
  }

  /**
   * Start periodic network reporting
   */
  private startPeriodicReporting(): void {
    setInterval(() => {
      if (this.monitoringActive) {
        this.generateNetworkReport()
      }
    }, 30000) // Report every 30 seconds
  }

  /**
   * Generate comprehensive network report
   */
  generateNetworkReport(): void {
    console.log('\n📋 === NETWORK DIAGNOSTICS REPORT ===')
    
    const diagnostics = this.diagnosticsManager.getNetworkDiagnostics()
    
    // Network Status
    console.log('\n🌐 Network Status:')
    this.logNetworkStatus(diagnostics.networkStatus)
    
    // Peer Metrics
    console.log('\n👥 Peer Connections:')
    this.logPeerMetrics(diagnostics.peerMetrics)
    
    // DHT Status
    console.log('\n🕸️  DHT Status:')
    this.logDHTStatus(diagnostics.dhtStatus)
    
    // Performance Metrics
    console.log('\n⚡ Performance Metrics:')
    this.logPerformanceMetrics(diagnostics.performance)
    
    // Troubleshooting
    console.log('\n🔧 Network Health:')
    this.logTroubleshootingInfo(diagnostics.troubleshooting)
    
    console.log('\n=================================\n')
  }

  /**
   * Log network status information
   */
  private logNetworkStatus(status: any): void {
    const statusIcon = status.connected ? '🟢' : '🔴'
    console.log(`   ${statusIcon} Connected: ${status.connected}`)
    console.log(`   👥 Peer Count: ${status.peerCount}`)
    console.log(`   🕸️  DHT Connected: ${status.dhtConnected}`)
    console.log(`   ⏱️  Average Latency: ${status.latency}ms`)
    console.log(`   📊 Bandwidth: ↑${status.bandwidth.up} ↓${status.bandwidth.down} KB/s`)
  }

  /**
   * Log peer connection metrics
   */
  private logPeerMetrics(peerMetrics: PeerConnectionMetrics[]): void {
    if (peerMetrics.length === 0) {
      console.log('   No peer connections')
      return
    }

    peerMetrics.forEach(peer => {
      const qualityIcon = this.getQualityIcon(peer.connectionQuality)
      const stateIcon = peer.connectionState === 'connected' ? '🟢' : '🔴'
      
      console.log(`   ${stateIcon} ${peer.peerId.substring(0, 12)}...`)
      console.log(`      Quality: ${qualityIcon} ${peer.connectionQuality}`)
      console.log(`      Latency: ${peer.latency}ms`)
      console.log(`      Packets: ↑${peer.packetsSent} ↓${peer.packetsReceived} ❌${peer.packetsLost}`)
      
      if (peer.protocols.length > 0) {
        console.log(`      Protocols: ${peer.protocols.join(', ')}`)
      }
    })
  }

  /**
   * Log DHT status information
   */
  private logDHTStatus(dhtStatus: any): void {
    const dhtIcon = dhtStatus.connected ? '🟢' : '🔴'
    console.log(`   ${dhtIcon} DHT Connected: ${dhtStatus.connected}`)
    console.log(`   📋 Routing Table Size: ${dhtStatus.routingTableSize}`)
    console.log(`   👥 Known Peers: ${dhtStatus.knownPeers}`)
    console.log(`   🔍 Active Queries: ${dhtStatus.activeQueries}`)
    
    if (dhtStatus.lastBootstrap) {
      console.log(`   🚀 Last Bootstrap: ${dhtStatus.lastBootstrap.toLocaleString()}`)
    }
  }

  /**
   * Log performance metrics
   */
  private logPerformanceMetrics(performance: any): void {
    console.log(`   ⏱️  Average Latency: ${performance.averageLatency}ms`)
    console.log(`   📊 Total Bandwidth: ↑${performance.totalBandwidth.up} ↓${performance.totalBandwidth.down} KB/s`)
    console.log(`   🔗 Connection Success: ${performance.connectionSuccess.toFixed(1)}%`)
    console.log(`   📨 Message Delivery Rate: ${performance.messageDeliveryRate.toFixed(1)}%`)
  }

  /**
   * Log troubleshooting information
   */
  private logTroubleshootingInfo(troubleshooting: any): void {
    const healthIcon = this.getHealthIcon(troubleshooting.healthScore)
    console.log(`   ${healthIcon} Health Score: ${troubleshooting.healthScore}/100`)
    
    if (troubleshooting.issues.length > 0) {
      console.log(`   ⚠️  Active Issues: ${troubleshooting.issues.length}`)
    }
    
    if (troubleshooting.recommendations.length > 0) {
      console.log('   💡 Recommendations:')
      troubleshooting.recommendations.forEach((rec: string) => {
        console.log(`      • ${rec}`)
      })
    }
  }

  /**
   * Run network troubleshooting and display results
   */
  async runTroubleshooting(): Promise<void> {
    console.log('🔧 Running network troubleshooting...')
    
    try {
      const result = await this.diagnosticsManager.runNetworkTroubleshooting()
      
      console.log('\n🔍 Troubleshooting Results:')
      console.log(`   Health Score: ${result.healthScore}/100`)
      
      if (result.issues.length > 0) {
        console.log('\n❌ Issues Found:')
        result.issues.forEach(issue => {
          const severityIcon = this.getSeverityIcon(issue.severity)
          console.log(`   ${severityIcon} ${issue.type}: ${issue.description}`)
        })
      }
      
      if (result.recommendations.length > 0) {
        console.log('\n💡 Recommendations:')
        result.recommendations.forEach(rec => {
          console.log(`   • ${rec}`)
        })
      }
      
      if (result.canAutoFix && result.autoFixActions.length > 0) {
        console.log('\n🔧 Auto-fix Actions Available:')
        result.autoFixActions.forEach(action => {
          console.log(`   • ${action}`)
        })
      }
      
    } catch (error) {
      console.error('❌ Troubleshooting failed:', error)
    }
  }

  /**
   * Demonstrate message tracking
   */
  demonstrateMessageTracking(): void {
    console.log('📨 Demonstrating message tracking...')
    
    // Simulate sending messages
    for (let i = 0; i < 10; i++) {
      this.diagnosticsManager.recordMessageSent()
      
      // Simulate some messages being delivered
      if (Math.random() > 0.2) {
        this.diagnosticsManager.recordMessageDelivered()
      } else {
        this.diagnosticsManager.recordMessageFailed()
      }
    }
    
    // Simulate receiving messages
    for (let i = 0; i < 8; i++) {
      this.diagnosticsManager.recordMessageReceived()
    }
    
    const diagnostics = this.diagnosticsManager.getNetworkDiagnostics()
    console.log(`   Delivery Rate: ${diagnostics.performance.messageDeliveryRate.toFixed(1)}%`)
  }

  /**
   * Get network history and analyze trends
   */
  analyzeNetworkTrends(): void {
    console.log('📈 Analyzing network trends...')
    
    const history = this.diagnosticsManager.getNetworkHistory()
    
    if (history.length < 2) {
      console.log('   Not enough data for trend analysis')
      return
    }
    
    const recent = history.slice(-5) // Last 5 measurements
    const avgLatency = recent.reduce((sum, status) => sum + status.latency, 0) / recent.length
    const avgPeerCount = recent.reduce((sum, status) => sum + status.peerCount, 0) / recent.length
    
    console.log(`   Average Latency (last 5): ${avgLatency.toFixed(1)}ms`)
    console.log(`   Average Peer Count (last 5): ${avgPeerCount.toFixed(1)}`)
    
    // Check for trends
    const latencyTrend = this.calculateTrend(recent.map(s => s.latency))
    const peerTrend = this.calculateTrend(recent.map(s => s.peerCount))
    
    console.log(`   Latency Trend: ${this.getTrendDescription(latencyTrend)}`)
    console.log(`   Peer Count Trend: ${this.getTrendDescription(peerTrend)}`)
  }

  /**
   * Helper methods for formatting and analysis
   */
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return '🚨'
      case 'high': return '⚠️'
      case 'medium': return '⚡'
      case 'low': return '💡'
      default: return '❓'
    }
  }

  private getQualityIcon(quality: string): string {
    switch (quality) {
      case 'excellent': return '🟢'
      case 'good': return '🟡'
      case 'fair': return '🟠'
      case 'poor': return '🔴'
      default: return '❓'
    }
  }

  private getHealthIcon(score: number): string {
    if (score >= 90) return '🟢'
    if (score >= 70) return '🟡'
    if (score >= 50) return '🟠'
    return '🔴'
  }

  private shouldLogMetricsUpdate(diagnostics: NetworkDiagnostics): boolean {
    // Only log if there are significant changes
    return diagnostics.troubleshooting.issues.length > 0 ||
           diagnostics.networkStatus.peerCount === 0 ||
           !diagnostics.networkStatus.connected
  }

  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable'
    
    const first = values[0]
    const last = values[values.length - 1]
    const change = (last - first) / first
    
    if (change > 0.1) return 'increasing'
    if (change < -0.1) return 'decreasing'
    return 'stable'
  }

  private getTrendDescription(trend: string): string {
    switch (trend) {
      case 'increasing': return '📈 Increasing'
      case 'decreasing': return '📉 Decreasing'
      case 'stable': return '➡️ Stable'
      default: return '❓ Unknown'
    }
  }

  /**
   * Stop monitoring and cleanup
   */
  async stopMonitoring(): Promise<void> {
    console.log('🛑 Stopping network monitoring...')
    
    this.monitoringActive = false
    this.diagnosticsManager.destroy()
    await this.p2pManager.disconnect()
    
    console.log('✅ Network monitoring stopped')
  }
}

/**
 * Example usage of the NetworkDiagnosticsExample
 */
async function runNetworkDiagnosticsDemo(): Promise<void> {
  const example = new NetworkDiagnosticsExample()
  
  try {
    // Start monitoring
    await example.startNetworkMonitoring()
    
    // Wait for network to stabilize
    await new Promise(resolve => setTimeout(resolve, 10000))
    
    // Generate initial report
    example.generateNetworkReport()
    
    // Run troubleshooting
    await example.runTroubleshooting()
    
    // Demonstrate message tracking
    example.demonstrateMessageTracking()
    
    // Wait and analyze trends
    await new Promise(resolve => setTimeout(resolve, 30000))
    example.analyzeNetworkTrends()
    
    // Final report
    example.generateNetworkReport()
    
  } catch (error) {
    console.error('Demo failed:', error)
  } finally {
    await example.stopMonitoring()
  }
}

// Export for use in other modules
export { runNetworkDiagnosticsDemo }

// Run demo if this file is executed directly
if (require.main === module) {
  runNetworkDiagnosticsDemo().catch(console.error)
}