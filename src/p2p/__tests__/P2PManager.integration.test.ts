import { P2PManager } from '../P2PManager'
import { DiscoveryCriteria } from '../types'

describe('P2PManager Integration', () => {
  let p2pManager: P2PManager

  beforeEach(() => {
    p2pManager = new P2PManager()
  })

  afterEach(async () => {
    try {
      if (p2pManager.isConnected()) {
        await p2pManager.disconnect()
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  test('should create P2PManager instance', () => {
    expect(p2pManager).toBeInstanceOf(P2PManager)
    expect(p2pManager.isConnected()).toBe(false)
  })

  test('should accept custom configuration', () => {
    const customConfig = {
      maxPeers: 25,
      geohashPrecision: 4,
      discoveryInterval: 60000
    }
    
    const customP2P = new P2PManager(customConfig)
    expect(customP2P).toBeInstanceOf(P2PManager)
    expect(customP2P.isConnected()).toBe(false)
  })

  test('should return network status when not initialized', () => {
    const status = p2pManager.getNetworkStatus()
    
    expect(status.connected).toBe(false)
    expect(status.peerCount).toBe(0)
    expect(status.dhtConnected).toBe(false)
    expect(status.latency).toBe(0)
    expect(status.bandwidth).toEqual({ up: 0, down: 0 })
  })

  test('should throw error when getting peer ID without initialization', () => {
    expect(() => {
      p2pManager.getPeerId()
    }).toThrow('P2P Manager not initialized')
  })

  test('should throw error when discovering peers without initialization', async () => {
    const criteria: DiscoveryCriteria = {
      geohash: 'dr5ru',
      ageRange: [25, 35],
      interests: ['music'],
      maxDistance: 10
    }

    await expect(p2pManager.discoverPeers(criteria)).rejects.toThrow('DHT Discovery not initialized')
  })

  test('should throw error when connecting to peer without initialization', async () => {
    await expect(p2pManager.connectToPeer('test-peer-id')).rejects.toThrow('P2P Manager not initialized')
  })

  test('should throw error when broadcasting profile without initialization', async () => {
    const mockProfile = {
      id: 'test-profile',
      serialize: jest.fn(() => new Uint8Array([1, 2, 3]))
    } as any

    await expect(p2pManager.broadcastProfile(mockProfile)).rejects.toThrow('P2P Manager not initialized')
  })

  test('should throw error when sending message without initialization', async () => {
    const mockMessage = {
      ciphertext: new ArrayBuffer(10),
      header: {
        publicKey: new ArrayBuffer(32),
        previousChainLength: 0,
        messageNumber: 1
      },
      timestamp: new Date()
    }

    await expect(p2pManager.sendMessage('test-peer', mockMessage)).rejects.toThrow('P2P Manager not initialized')
  })

  test('should allow profile subscription and unsubscription', () => {
    const mockCallback = jest.fn()
    
    expect(() => {
      p2pManager.subscribeToProfiles(mockCallback)
    }).not.toThrow()

    expect(() => {
      p2pManager.unsubscribeFromProfiles(mockCallback)
    }).not.toThrow()
  })

  test('should allow message handler registration and removal', () => {
    const mockHandler = jest.fn()
    
    expect(() => {
      p2pManager.onMessage(mockHandler)
    }).not.toThrow()

    expect(() => {
      p2pManager.removeMessageHandler(mockHandler)
    }).not.toThrow()
  })

  test('should track connection count and peers', () => {
    expect(p2pManager.getConnectionCount()).toBe(0)
    expect(p2pManager.getConnectedPeers()).toEqual([])
  })

  test('should handle disconnect when not connected', async () => {
    // Should not throw when disconnecting uninitialized manager
    await expect(p2pManager.disconnect()).resolves.not.toThrow()
  })
})