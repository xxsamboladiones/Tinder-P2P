import { WebRTCManager } from '../WebRTCManager'

// Integration tests for WebRTC Manager
// These tests simulate more realistic scenarios with multiple peers and complex interactions

describe('WebRTCManager Integration Tests', () => {
  let manager1: WebRTCManager
  let manager2: WebRTCManager
  
  // Mock WebRTC APIs for integration testing
  const createMockPeerConnection = () => {
    let _connectionState: RTCPeerConnectionState = 'new'
    let _iceConnectionState: RTCIceConnectionState = 'new'
    let _localDescription: RTCSessionDescription | null = null
    let _remoteDescription: RTCSessionDescription | null = null
    
    const mockConnection = {
      iceGatheringState: 'new' as RTCIceGatheringState,
      
      createDataChannel: jest.fn((label: string) => createMockDataChannel(label)),
      createOffer: jest.fn(() => Promise.resolve({
        type: 'offer' as RTCSdpType,
        sdp: 'mock-offer-sdp'
      })),
      createAnswer: jest.fn(() => Promise.resolve({
        type: 'answer' as RTCSdpType,
        sdp: 'mock-answer-sdp'
      })),
      setLocalDescription: jest.fn((desc) => {
        _localDescription = desc as RTCSessionDescription
        return Promise.resolve()
      }),
      setRemoteDescription: jest.fn((desc) => {
        _remoteDescription = desc as RTCSessionDescription
        // Simulate connection state change
        setTimeout(() => {
          _connectionState = 'connected'
          if (mockConnection.onconnectionstatechange) {
            mockConnection.onconnectionstatechange({} as Event)
          }
        }, 10)
        return Promise.resolve()
      }),
      addIceCandidate: jest.fn(() => Promise.resolve()),
      close: jest.fn(() => {
        _connectionState = 'closed'
        if (mockConnection.onconnectionstatechange) {
          mockConnection.onconnectionstatechange({} as Event)
        }
      }),
      restartIce: jest.fn(),
      getStats: jest.fn(() => Promise.resolve(new Map())),
      
      // Event handlers
      onicecandidate: null as ((event: RTCPeerConnectionIceEvent) => void) | null,
      onconnectionstatechange: null as ((event: Event) => void) | null,
      ondatachannel: null as ((event: RTCDataChannelEvent) => void) | null,
      oniceconnectionstatechange: null as ((event: Event) => void) | null,
      onicegatheringstatechange: null as ((event: Event) => void) | null,
      
      // Getters for current state
      get connectionState() { return _connectionState },
      get iceConnectionState() { return _iceConnectionState },
      get localDescription() { return _localDescription },
      get remoteDescription() { return _remoteDescription },
    }
    
    return mockConnection
  }
  
  const createMockDataChannel = (label: string) => {
    let _readyState: RTCDataChannelState = 'connecting'
    
    const mockChannel = {
      label,
      
      send: jest.fn(),
      close: jest.fn(() => {
        _readyState = 'closed'
        if (mockChannel.onclose) {
          mockChannel.onclose()
        }
      }),
      
      // Event handlers
      onopen: null as (() => void) | null,
      onclose: null as (() => void) | null,
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((error: Event) => void) | null,
      
      // Getter for current state
      get readyState() { return _readyState },
      
      // Simulate opening
      _simulateOpen() {
        _readyState = 'open'
        if (mockChannel.onopen) {
          mockChannel.onopen()
        }
      }
    }
    
    // Simulate channel opening after a short delay
    setTimeout(() => {
      mockChannel._simulateOpen()
    }, 50)
    
    return mockChannel
  }

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock RTCPeerConnection and RTCIceCandidate globally
    global.RTCPeerConnection = jest.fn(() => createMockPeerConnection()) as any
    global.RTCIceCandidate = jest.fn((init) => ({
      candidate: init.candidate,
      sdpMLineIndex: init.sdpMLineIndex,
      sdpMid: init.sdpMid,
      usernameFragment: init.usernameFragment
    })) as any
    
    manager1 = new WebRTCManager(['stun:stun.l.google.com:19302'])
    manager2 = new WebRTCManager(['stun:stun.l.google.com:19302'])
  })

  afterEach(() => {
    manager1.destroy()
    manager2.destroy()
  })

  describe('Peer-to-Peer Connection Establishment', () => {
    it('should establish connection between two peers', async () => {
      const peer1Id = 'peer-1'
      const peer2Id = 'peer-2'
      
      // Simulate connection establishment
      const connection1 = await manager1.createConnection(peer1Id)
      const connection2 = await manager2.createConnection(peer2Id)
      
      expect(connection1).toBeDefined()
      expect(connection2).toBeDefined()
      expect(manager1.hasConnection(peer1Id)).toBe(true)
      expect(manager2.hasConnection(peer2Id)).toBe(true)
    })

    it('should handle SDP offer/answer exchange', async () => {
      const peer1Id = 'peer-1'
      const peer2Id = 'peer-2'
      
      // Peer 1 creates offer
      const offer = await manager1.createOffer(peer1Id)
      expect(offer.type).toBe('offer')
      expect(offer.sdp).toBeDefined()
      
      // Peer 2 creates answer
      const answer = await manager2.createAnswer(peer2Id, offer)
      expect(answer.type).toBe('answer')
      expect(answer.sdp).toBeDefined()
      
      // Peer 1 sets remote answer
      await manager1.setRemoteAnswer(peer1Id, answer)
      
      // Wait for connection state changes
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(manager1.getConnectionState(peer1Id)).toBe('connected')
      expect(manager2.getConnectionState(peer2Id)).toBe('connected')
    })
  })

  describe('Data Channel Communication', () => {
    it('should create and manage data channels', async () => {
      const peer1Id = 'peer-1'
      const channelLabel = 'test-channel'
      
      const channel = await manager1.createDataChannel(peer1Id, channelLabel)
      
      expect(channel).toBeDefined()
      expect(channel.label).toBe(channelLabel)
      
      // Wait for channel to open
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const retrievedChannel = manager1.getDataChannel(peer1Id, channelLabel)
      expect(retrievedChannel).toBe(channel)
    })

    it('should send data through data channel', async () => {
      const peer1Id = 'peer-1'
      const channelLabel = 'test-channel'
      const testMessage = 'Hello, P2P World!'
      
      const channel = await manager1.createDataChannel(peer1Id, channelLabel)
      
      // Wait for channel to open
      await new Promise(resolve => setTimeout(resolve, 100))
      
      await manager1.sendData(peer1Id, channelLabel, testMessage)
      
      expect(channel.send).toHaveBeenCalledWith(testMessage)
    })

    it('should handle binary data transmission', async () => {
      const peer1Id = 'peer-1'
      const channelLabel = 'binary-channel'
      const binaryData = new ArrayBuffer(1024)
      
      const channel = await manager1.createDataChannel(peer1Id, channelLabel)
      
      // Wait for channel to open
      await new Promise(resolve => setTimeout(resolve, 100))
      
      await manager1.sendData(peer1Id, channelLabel, binaryData)
      
      expect(channel.send).toHaveBeenCalledWith(new Uint8Array(binaryData))
    })
  })

  describe('Multiple Peer Management', () => {
    it('should manage multiple peer connections simultaneously', async () => {
      const peerIds = ['peer-1', 'peer-2', 'peer-3']
      
      // Create connections to multiple peers
      const connections = await Promise.all(
        peerIds.map(peerId => manager1.createConnection(peerId))
      )
      
      expect(connections).toHaveLength(3)
      connections.forEach(connection => {
        expect(connection).toBeDefined()
      })
      
      // Check all connections exist
      peerIds.forEach(peerId => {
        expect(manager1.hasConnection(peerId)).toBe(true)
      })
      
      // Get active connections (they should all be in 'new' state initially)
      const activeConnections = manager1.getActiveConnections()
      expect(activeConnections).toHaveLength(0) // None are 'connected' yet
    })

    it('should create multiple data channels per peer', async () => {
      const peerId = 'multi-channel-peer'
      const channelLabels = ['channel-1', 'channel-2', 'channel-3']
      
      // Create multiple channels
      const channels = await Promise.all(
        channelLabels.map(label => manager1.createDataChannel(peerId, label))
      )
      
      expect(channels).toHaveLength(3)
      
      // Wait for channels to open
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Verify all channels are accessible
      channelLabels.forEach(label => {
        const channel = manager1.getDataChannel(peerId, label)
        expect(channel).toBeDefined()
        expect(channel!.label).toBe(label)
      })
    })
  })

  describe('Event Handling', () => {
    it('should handle connection state changes', async () => {
      const peerId = 'event-test-peer'
      const stateChangeCallback = jest.fn()
      
      manager1.onConnectionStateChange(stateChangeCallback)
      
      // Create connection and simulate state change
      await manager1.createConnection(peerId)
      
      // Simulate remote description setting (triggers state change)
      const mockAnswer = { type: 'answer' as RTCSdpType, sdp: 'mock-sdp' }
      await manager1.setRemoteAnswer(peerId, mockAnswer)
      
      // Wait for state change
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(stateChangeCallback).toHaveBeenCalledWith(peerId, 'connected')
    })

    it('should handle ICE candidates', async () => {
      const peerId = 'ice-test-peer'
      const iceCandidateCallback = jest.fn()
      
      manager1.onIceCandidate(iceCandidateCallback)
      
      const connection = await manager1.createConnection(peerId)
      
      // Simulate ICE candidate generation
      const mockCandidate = new RTCIceCandidate({
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54400 typ host',
        sdpMLineIndex: 0
      })
      
      // Trigger ICE candidate event
      if (connection.onicecandidate) {
        connection.onicecandidate({ candidate: mockCandidate } as RTCPeerConnectionIceEvent)
      }
      
      expect(iceCandidateCallback).toHaveBeenCalledWith(peerId, mockCandidate)
    })

    it('should handle data channel events', async () => {
      const peerId = 'datachannel-event-peer'
      const dataChannelCallback = jest.fn()
      
      manager1.onDataChannel(dataChannelCallback)
      
      const connection = await manager1.createConnection(peerId)
      const mockChannel = createMockDataChannel('incoming-channel')
      
      // Simulate incoming data channel
      if (connection.ondatachannel) {
        connection.ondatachannel({ channel: mockChannel } as unknown as RTCDataChannelEvent)
      }
      
      expect(dataChannelCallback).toHaveBeenCalledWith(peerId, mockChannel)
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle connection failures gracefully', async () => {
      const peerId = 'failing-peer'
      
      // Create connection
      const connection = await manager1.createConnection(peerId)
      expect(manager1.hasConnection(peerId)).toBe(true)
      
      // Simulate connection failure
      Object.defineProperty(connection, 'connectionState', {
        get: () => 'failed'
      })
      if (connection.onconnectionstatechange) {
        connection.onconnectionstatechange({} as Event)
      }
      
      // Wait for failure handling
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Connection should still exist (retry mechanism)
      expect(manager1.hasConnection(peerId)).toBe(true)
    })

    it('should handle data channel send errors', async () => {
      const peerId = 'error-peer'
      const channelLabel = 'error-channel'
      
      const channel = await manager1.createDataChannel(peerId, channelLabel)
      
      // Mock channel as closed
      Object.defineProperty(channel, 'readyState', {
        get: () => 'closed'
      })
      
      // Attempt to send data should throw error
      await expect(manager1.sendData(peerId, channelLabel, 'test'))
        .rejects.toThrow('Data channel not open')
    })

    it('should handle ICE candidate errors', async () => {
      const peerId = 'ice-error-peer'
      const mockCandidate = new RTCIceCandidate({
        candidate: 'invalid-candidate',
        sdpMLineIndex: 0
      })
      
      const connection = await manager1.createConnection(peerId)
      
      // Mock addIceCandidate to throw error
      connection.addIceCandidate = jest.fn().mockRejectedValue(new Error('Invalid candidate'))
      
      await expect(manager1.addIceCandidate(peerId, mockCandidate))
        .rejects.toThrow('Invalid candidate')
    })
  })

  describe('Resource Management', () => {
    it('should clean up resources on connection close', async () => {
      const peerId = 'cleanup-peer'
      const channelLabel = 'cleanup-channel'
      
      // Create connection and channel
      await manager1.createConnection(peerId)
      const channel = await manager1.createDataChannel(peerId, channelLabel)
      
      expect(manager1.hasConnection(peerId)).toBe(true)
      expect(manager1.getDataChannel(peerId, channelLabel)).toBeDefined()
      
      // Close connection
      await manager1.closeConnection(peerId)
      
      expect(manager1.hasConnection(peerId)).toBe(false)
      expect(manager1.getDataChannel(peerId, channelLabel)).toBeUndefined()
      expect(channel.close).toHaveBeenCalled()
    })

    it('should handle manager destruction', async () => {
      const peerIds = ['peer-1', 'peer-2', 'peer-3']
      
      // Create multiple connections
      await Promise.all(peerIds.map(peerId => manager1.createConnection(peerId)))
      
      // Verify connections exist
      peerIds.forEach(peerId => {
        expect(manager1.hasConnection(peerId)).toBe(true)
      })
      
      // Destroy manager
      manager1.destroy()
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // All connections should be closed
      peerIds.forEach(peerId => {
        expect(manager1.hasConnection(peerId)).toBe(false)
      })
    })
  })

  describe('Statistics and Monitoring', () => {
    it('should provide connection statistics', async () => {
      const peerId = 'stats-peer'
      
      await manager1.createConnection(peerId)
      const stats = manager1.getConnectionStats(peerId)
      
      expect(stats).toBeDefined()
      expect(stats).toBeInstanceOf(Promise)
    })

    it('should track active connections', async () => {
      const connectedPeerId = 'connected-peer'
      const disconnectedPeerId = 'disconnected-peer'
      
      // Create connections
      const connectedConnection = await manager1.createConnection(connectedPeerId)
      const disconnectedConnection = await manager1.createConnection(disconnectedPeerId)
      
      // Mock connection states by overriding the getter
      Object.defineProperty(connectedConnection, 'connectionState', {
        get: () => 'connected'
      })
      Object.defineProperty(disconnectedConnection, 'connectionState', {
        get: () => 'disconnected'
      })
      
      const activeConnections = manager1.getActiveConnections()
      
      expect(activeConnections).toContain(connectedPeerId)
      expect(activeConnections).not.toContain(disconnectedPeerId)
    })

    it('should provide peer data channels information', async () => {
      const peerId = 'channels-peer'
      const channelLabels = ['channel-1', 'channel-2']
      
      // Create channels
      await Promise.all(
        channelLabels.map(label => manager1.createDataChannel(peerId, label))
      )
      
      const peerChannels = manager1.getPeerDataChannels(peerId)
      
      expect(peerChannels).toBeDefined()
      expect(peerChannels!.size).toBe(2)
      channelLabels.forEach(label => {
        expect(peerChannels!.has(label)).toBe(true)
      })
    })
  })
})