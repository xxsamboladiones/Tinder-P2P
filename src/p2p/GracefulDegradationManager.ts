import { EventEmitter } from './utils/EventEmitter'
import { NetworkStatus, P2PConfig } from './types'

export enum OperationMode {
  P2P_ONLY = 'p2p_only',
  HYBRID = 'hybrid',
  CENTRALIZED_ONLY = 'centralized_only',
  OFFLINE = 'offline'
}

export enum P2PFeature {
  DHT_DISCOVERY = 'dht_discovery',
  WEBRTC_CONNECTIONS = 'webrtc_connections',
  ENCRYPTED_MESSAGING = 'encrypted_messaging',
  PROFILE_SYNC = 'profile_sync',
  MEDIA_SHARING = 'media_sharing',
  PRIVATE_MATCHING = 'private_matching',
  GROUP_COMMUNICATION = 'group_communication'
}

export interface FeatureToggle {
  feature: P2PFeature
  enabled: boolean
  fallbackEnabled: boolean
  lastToggled: Date
  reason?: string
}

export interface DegradationConfig {
  mode: OperationMode
  featureToggles: Map<P2PFeature, FeatureToggle>
  fallbackThresholds: {
    maxLatency: number // ms
    minPeerCount: number
    maxFailureRate: number // 0-1
    connectionTimeout: number // ms
  }
  offlineCapabilities: {
    enableLocalStorage: boolean
    enableMessageQueue: boolean
    enableProfileCache: boolean
    maxCacheSize: number // MB
  }
}

export interface DegradationMetrics {
  currentMode: OperationMode
  p2pHealth: {
    connected: boolean
    peerCount: number
    latency: number
    failureRate: number
  }
  centralizedHealth: {
    connected: boolean
    latency: number
    failureRate: number
  }
  featureStatus: Map<P2PFeature, boolean>
  lastModeChange: Date
  modeChangeReason: string
}

export interface FallbackStrategy {
  trigger: (metrics: DegradationMetrics) => boolean
  action: (manager: GracefulDegradationManager) => Promise<void>
  priority: number
  description: string
}

export class GracefulDegradationManager extends EventEmitter {
  private config: DegradationConfig
  private metrics: DegradationMetrics
  private fallbackStrategies: FallbackStrategy[]
  private monitoringInterval: NodeJS.Timeout | null = null
  private isInitialized = false

  constructor(config?: Partial<DegradationConfig>) {
    super()
    
    this.config = {
      mode: OperationMode.P2P_ONLY,
      featureToggles: new Map(),
      fallbackThresholds: {
        maxLatency: 5000,
        minPeerCount: 1,
        maxFailureRate: 0.3,
        connectionTimeout: 10000
      },
      offlineCapabilities: {
        enableLocalStorage: true,
        enableMessageQueue: true,
        enableProfileCache: true,
        maxCacheSize: 100
      },
      ...config
    }

    this.metrics = {
      currentMode: this.config.mode,
      p2pHealth: {
        connected: false,
        peerCount: 0,
        latency: 0,
        failureRate: 0
      },
      centralizedHealth: {
        connected: false,
        latency: 0,
        failureRate: 0
      },
      featureStatus: new Map(),
      lastModeChange: new Date(),
      modeChangeReason: 'Initial configuration'
    }

    this.fallbackStrategies = this.initializeFallbackStrategies()
    this.initializeFeatureToggles()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Start monitoring network health
      this.startHealthMonitoring()
      
      // Initialize based on current mode
      await this.applyOperationMode(this.config.mode)
      
      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  async destroy(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
    
    this.isInitialized = false
    this.emit('destroyed')
  }

  // Operation Mode Management
  async setOperationMode(mode: OperationMode, reason?: string): Promise<void> {
    if (this.config.mode === mode) {
      return
    }

    const previousMode = this.config.mode
    this.config.mode = mode
    this.metrics.currentMode = mode
    this.metrics.lastModeChange = new Date()
    this.metrics.modeChangeReason = reason || 'Manual change'

    try {
      await this.applyOperationMode(mode)
      this.emit('modeChanged', { previousMode, newMode: mode, reason })
    } catch (error) {
      // Rollback on failure
      this.config.mode = previousMode
      this.metrics.currentMode = previousMode
      this.emit('error', error)
      throw error
    }
  }

  private async applyOperationMode(mode: OperationMode): Promise<void> {
    switch (mode) {
      case OperationMode.P2P_ONLY:
        await this.enableP2PMode()
        break
      case OperationMode.HYBRID:
        await this.enableHybridMode()
        break
      case OperationMode.CENTRALIZED_ONLY:
        await this.enableCentralizedMode()
        break
      case OperationMode.OFFLINE:
        await this.enableOfflineMode()
        break
    }
  }

  private async enableP2PMode(): Promise<void> {
    // Enable all P2P features
    for (const feature of Object.values(P2PFeature)) {
      await this.enableFeature(feature, 'P2P mode enabled')
    }
    
    // Disable centralized fallbacks
    this.emit('p2pModeEnabled')
  }

  private async enableHybridMode(): Promise<void> {
    // Enable P2P features with centralized fallbacks
    for (const feature of Object.values(P2PFeature)) {
      const toggle = this.config.featureToggles.get(feature)
      if (toggle) {
        toggle.fallbackEnabled = true
      }
    }
    
    this.emit('hybridModeEnabled')
  }

  private async enableCentralizedMode(): Promise<void> {
    // Disable P2P features, enable centralized alternatives
    for (const feature of Object.values(P2PFeature)) {
      await this.disableFeature(feature, 'Centralized mode enabled')
    }
    
    this.emit('centralizedModeEnabled')
  }

  private async enableOfflineMode(): Promise<void> {
    // Disable all network features, enable local-only functionality
    for (const feature of Object.values(P2PFeature)) {
      await this.disableFeature(feature, 'Offline mode enabled')
    }
    
    // Enable offline capabilities
    if (this.config.offlineCapabilities.enableLocalStorage) {
      this.emit('localStorageEnabled')
    }
    
    if (this.config.offlineCapabilities.enableMessageQueue) {
      this.emit('messageQueueEnabled')
    }
    
    if (this.config.offlineCapabilities.enableProfileCache) {
      this.emit('profileCacheEnabled')
    }
    
    this.emit('offlineModeEnabled')
  }

  // Feature Toggle Management
  async enableFeature(feature: P2PFeature, reason?: string): Promise<void> {
    const toggle = this.config.featureToggles.get(feature)
    if (!toggle) {
      return
    }

    if (toggle.enabled) {
      return
    }

    toggle.enabled = true
    toggle.lastToggled = new Date()
    toggle.reason = reason

    this.metrics.featureStatus.set(feature, true)
    this.emit('featureEnabled', { feature, reason })
  }

  async disableFeature(feature: P2PFeature, reason?: string): Promise<void> {
    const toggle = this.config.featureToggles.get(feature)
    if (!toggle) {
      return
    }

    if (!toggle.enabled) {
      return
    }

    toggle.enabled = false
    toggle.lastToggled = new Date()
    toggle.reason = reason

    this.metrics.featureStatus.set(feature, false)
    this.emit('featureDisabled', { feature, reason })
  }

  isFeatureEnabled(feature: P2PFeature): boolean {
    const toggle = this.config.featureToggles.get(feature)
    return toggle?.enabled || false
  }

  isFallbackEnabled(feature: P2PFeature): boolean {
    const toggle = this.config.featureToggles.get(feature)
    return toggle?.fallbackEnabled || false
  }

  // Health Monitoring
  private startHealthMonitoring(): void {
    if (this.monitoringInterval) {
      return
    }

    this.monitoringInterval = setInterval(() => {
      this.checkHealthAndApplyFallbacks()
    }, 5000) // Check every 5 seconds
  }

  private async checkHealthAndApplyFallbacks(): Promise<void> {
    try {
      // Update metrics would be called by external systems
      // For now, we'll emit an event to request metrics update
      this.emit('metricsUpdateRequested')

      // Apply fallback strategies based on current metrics
      for (const strategy of this.fallbackStrategies.sort((a, b) => b.priority - a.priority)) {
        if (strategy.trigger(this.metrics)) {
          await strategy.action(this)
          break // Apply only the highest priority strategy
        }
      }
    } catch (error) {
      this.emit('error', error)
    }
  }

  updateNetworkMetrics(networkStatus: NetworkStatus): void {
    this.metrics.p2pHealth = {
      connected: networkStatus.connected,
      peerCount: networkStatus.peerCount,
      latency: networkStatus.latency,
      failureRate: this.calculateFailureRate()
    }

    this.emit('metricsUpdated', this.metrics)
  }

  updateCentralizedMetrics(connected: boolean, latency: number): void {
    this.metrics.centralizedHealth = {
      connected,
      latency,
      failureRate: this.calculateCentralizedFailureRate()
    }

    this.emit('metricsUpdated', this.metrics)
  }

  private calculateFailureRate(): number {
    // This would be calculated based on recent connection attempts
    // For now, return a mock value
    return 0.1
  }

  private calculateCentralizedFailureRate(): number {
    // This would be calculated based on recent API calls
    // For now, return a mock value
    return 0.05
  }

  // Fallback Strategies
  private initializeFallbackStrategies(): FallbackStrategy[] {
    return [
      {
        trigger: (metrics) => 
          metrics.currentMode === OperationMode.P2P_ONLY &&
          metrics.p2pHealth.peerCount < this.config.fallbackThresholds.minPeerCount,
        action: async (manager) => {
          await manager.setOperationMode(OperationMode.HYBRID, 'Low peer count')
        },
        priority: 10,
        description: 'Switch to hybrid mode when peer count is low'
      },
      {
        trigger: (metrics) =>
          metrics.currentMode === OperationMode.P2P_ONLY &&
          metrics.p2pHealth.latency > this.config.fallbackThresholds.maxLatency,
        action: async (manager) => {
          await manager.setOperationMode(OperationMode.HYBRID, 'High latency')
        },
        priority: 8,
        description: 'Switch to hybrid mode when latency is high'
      },
      {
        trigger: (metrics) =>
          metrics.p2pHealth.failureRate > this.config.fallbackThresholds.maxFailureRate,
        action: async (manager) => {
          const currentMetrics = manager.getMetrics()
          if (currentMetrics.currentMode === OperationMode.P2P_ONLY) {
            await manager.setOperationMode(OperationMode.HYBRID, 'High failure rate')
          } else if (currentMetrics.currentMode === OperationMode.HYBRID) {
            await manager.setOperationMode(OperationMode.CENTRALIZED_ONLY, 'High failure rate')
          }
        },
        priority: 9,
        description: 'Degrade mode when failure rate is high'
      },
      {
        trigger: (metrics) =>
          !metrics.p2pHealth.connected && !metrics.centralizedHealth.connected,
        action: async (manager) => {
          await manager.setOperationMode(OperationMode.OFFLINE, 'No network connectivity')
        },
        priority: 15,
        description: 'Switch to offline mode when no connectivity'
      },
      {
        trigger: (metrics) =>
          metrics.currentMode === OperationMode.OFFLINE &&
          (metrics.p2pHealth.connected || metrics.centralizedHealth.connected),
        action: async (manager) => {
          await manager.setOperationMode(OperationMode.HYBRID, 'Network connectivity restored')
        },
        priority: 12,
        description: 'Switch back to hybrid mode when connectivity is restored'
      }
    ]
  }

  private initializeFeatureToggles(): void {
    for (const feature of Object.values(P2PFeature)) {
      this.config.featureToggles.set(feature, {
        feature,
        enabled: true,
        fallbackEnabled: false,
        lastToggled: new Date(),
        reason: 'Initial configuration'
      })
      
      this.metrics.featureStatus.set(feature, true)
    }
  }

  // Getters
  getCurrentMode(): OperationMode {
    return this.config.mode
  }

  getMetrics(): DegradationMetrics {
    return { ...this.metrics }
  }

  getConfig(): DegradationConfig {
    return { ...this.config }
  }

  getFeatureToggles(): Map<P2PFeature, FeatureToggle> {
    return new Map(this.config.featureToggles)
  }

  // Configuration Updates
  updateFallbackThresholds(thresholds: Partial<DegradationConfig['fallbackThresholds']>): void {
    this.config.fallbackThresholds = {
      ...this.config.fallbackThresholds,
      ...thresholds
    }
    
    this.emit('configUpdated', { thresholds })
  }

  updateOfflineCapabilities(capabilities: Partial<DegradationConfig['offlineCapabilities']>): void {
    this.config.offlineCapabilities = {
      ...this.config.offlineCapabilities,
      ...capabilities
    }
    
    this.emit('configUpdated', { capabilities })
  }

  // Utility Methods
  canUseP2P(): boolean {
    return this.config.mode === OperationMode.P2P_ONLY || 
           this.config.mode === OperationMode.HYBRID
  }

  canUseCentralized(): boolean {
    return this.config.mode === OperationMode.CENTRALIZED_ONLY || 
           this.config.mode === OperationMode.HYBRID
  }

  isOfflineMode(): boolean {
    return this.config.mode === OperationMode.OFFLINE
  }

  shouldFallbackToCentralized(feature: P2PFeature): boolean {
    if (!this.canUseCentralized()) {
      return false
    }

    const toggle = this.config.featureToggles.get(feature)
    if (!toggle) {
      return false
    }

    return !toggle.enabled && toggle.fallbackEnabled
  }
}