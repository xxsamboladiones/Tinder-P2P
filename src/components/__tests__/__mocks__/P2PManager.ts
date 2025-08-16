// Mock P2PManager for testing
export class P2PManager {
  private connected = false
  private peerCount = 0

  getNetworkStatus() {
    return {
      connected: this.connected,
      peerCount: this.peerCount,
      dhtConnected: this.connected,
      latency: this.connected ? 150 : 0,
      bandwidth: { up: this.connected ? 100 : 0, down: this.connected ? 200 : 0 }
    }
  }

  async initialize() {
    // Mock initialization
    return Promise.resolve()
  }

  async connect() {
    this.connected = true
    this.peerCount = 3
    return Promise.resolve()
  }

  async disconnect() {
    this.connected = false
    this.peerCount = 0
    return Promise.resolve()
  }

  async discoverPeers() {
    return []
  }
}