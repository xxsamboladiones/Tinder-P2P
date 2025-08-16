import { GracefulDegradationManager, OperationMode, P2PFeature } from '../GracefulDegradationManager'

describe('GracefulDegradationManager - Simple Tests', () => {
  let manager: GracefulDegradationManager

  beforeEach(() => {
    manager = new GracefulDegradationManager()
  })

  afterEach(async () => {
    await manager.destroy()
  })

  it('should create manager with default configuration', () => {
    expect(manager).toBeInstanceOf(GracefulDegradationManager)
    expect(manager.getCurrentMode()).toBe(OperationMode.P2P_ONLY)
  })

  it('should initialize successfully', async () => {
    await expect(manager.initialize()).resolves.not.toThrow()
  })

  it('should change operation modes', async () => {
    await manager.initialize()
    
    await manager.setOperationMode(OperationMode.HYBRID)
    expect(manager.getCurrentMode()).toBe(OperationMode.HYBRID)
    
    await manager.setOperationMode(OperationMode.OFFLINE)
    expect(manager.getCurrentMode()).toBe(OperationMode.OFFLINE)
  })

  it('should toggle features', async () => {
    await manager.initialize()
    
    expect(manager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)).toBe(true)
    
    await manager.disableFeature(P2PFeature.DHT_DISCOVERY)
    expect(manager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)).toBe(false)
    
    await manager.enableFeature(P2PFeature.DHT_DISCOVERY)
    expect(manager.isFeatureEnabled(P2PFeature.DHT_DISCOVERY)).toBe(true)
  })

  it('should provide correct mode capabilities', async () => {
    await manager.initialize()
    
    // P2P_ONLY mode
    expect(manager.canUseP2P()).toBe(true)
    expect(manager.canUseCentralized()).toBe(false)
    expect(manager.isOfflineMode()).toBe(false)
    
    // HYBRID mode
    await manager.setOperationMode(OperationMode.HYBRID)
    expect(manager.canUseP2P()).toBe(true)
    expect(manager.canUseCentralized()).toBe(true)
    expect(manager.isOfflineMode()).toBe(false)
    
    // CENTRALIZED_ONLY mode
    await manager.setOperationMode(OperationMode.CENTRALIZED_ONLY)
    expect(manager.canUseP2P()).toBe(false)
    expect(manager.canUseCentralized()).toBe(true)
    expect(manager.isOfflineMode()).toBe(false)
    
    // OFFLINE mode
    await manager.setOperationMode(OperationMode.OFFLINE)
    expect(manager.canUseP2P()).toBe(false)
    expect(manager.canUseCentralized()).toBe(false)
    expect(manager.isOfflineMode()).toBe(true)
  })

  it('should update configuration', () => {
    manager.updateFallbackThresholds({
      maxLatency: 2000,
      minPeerCount: 3
    })
    
    const config = manager.getConfig()
    expect(config.fallbackThresholds.maxLatency).toBe(2000)
    expect(config.fallbackThresholds.minPeerCount).toBe(3)
  })

  it('should track metrics', () => {
    const metrics = manager.getMetrics()
    
    expect(metrics).toHaveProperty('currentMode')
    expect(metrics).toHaveProperty('p2pHealth')
    expect(metrics).toHaveProperty('centralizedHealth')
    expect(metrics).toHaveProperty('featureStatus')
    expect(metrics).toHaveProperty('lastModeChange')
  })

  it('should determine fallback requirements', async () => {
    await manager.initialize()
    await manager.setOperationMode(OperationMode.HYBRID)
    
    // Feature enabled - no fallback needed
    expect(manager.shouldFallbackToCentralized(P2PFeature.DHT_DISCOVERY)).toBe(false)
    
    // Disable feature and enable fallback
    await manager.disableFeature(P2PFeature.DHT_DISCOVERY)
    const toggles = manager.getFeatureToggles()
    const toggle = toggles.get(P2PFeature.DHT_DISCOVERY)!
    toggle.fallbackEnabled = true
    
    expect(manager.shouldFallbackToCentralized(P2PFeature.DHT_DISCOVERY)).toBe(true)
  })

  it('should emit events on mode changes', async () => {
    await manager.initialize()
    
    const eventPromise = new Promise<any>((resolve) => {
      manager.once('modeChanged', resolve)
    })
    
    await manager.setOperationMode(OperationMode.HYBRID, 'Test change')
    
    const event = await eventPromise
    expect(event.previousMode).toBe(OperationMode.P2P_ONLY)
    expect(event.newMode).toBe(OperationMode.HYBRID)
    expect(event.reason).toBe('Test change')
  })

  it('should emit events on feature changes', async () => {
    await manager.initialize()
    
    const eventPromise = new Promise<any>((resolve) => {
      manager.once('featureDisabled', resolve)
    })
    
    await manager.disableFeature(P2PFeature.ENCRYPTED_MESSAGING, 'Test disable')
    
    const event = await eventPromise
    expect(event.feature).toBe(P2PFeature.ENCRYPTED_MESSAGING)
    expect(event.reason).toBe('Test disable')
  })
})