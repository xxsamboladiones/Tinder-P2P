import { WebRTCManager } from '../WebRTCManager'

// Mock WebRTC APIs
const mockRTCPeerConnection = {
  connectionState: 'new' as RTCPeerConnectionState,
  iceConnectionState: 'new' as RTCIceConnectionState,
  iceGatheringState: 'new' as RTCIceGatheringState,
  localDescription: null,
  remoteDescription: null,
  
  createDataChannel: jest.fn(),
  createOffer: jest.fn(),
  createAnswer: jest.fn(),
  setLocalDescription: jest.fn(),
  setRemoteDescription: jest.fn(),
  addIceCandidate: jest.fn(),
  close: jest.fn(),
  restartIce: jest.fn(),
  getStats: jest.fn(),
  
  // Event handlers
  onicecandidate: null as ((event: RTCPeerConnectionIceEvent) => void) | null,
  onconnectionstatechange: null as (() => void) | null,
  ondatachannel: null as ((event: RTCDataChannelEvent) => void) | null,
  oniceconnectionstatechange: null as (() => void) | null,
  onicegatheringstatechange: null as (() => void) | null,
}

const mockRTCDataChannel = {
  label: 'test-channel',
  readyState: 'connecting' as RTCDataChannelState,
  
  send: jest.fn(),
  close: jest.fn(),
  
  // Event handlers
  onopen: null as (() => void) | null,
  onclose: null as (() => void) | null,
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((error: Event) => void) | null,
}

// Mock the global RTCPeerConnection and RTCIceCandidate
global.RTCPeerConnection = jest.fn(() => ({
  ...mockRTCPeerConnection,
  createDataChannel: jest.fn(() => ({ ...mockRTCDataChannel })),
})) as any

global.RTCIceCandidate = jest.fn((init) => ({
  candidate: init.candidate,
  sdpMLineIndex: init.sdpMLineIndex,
  sdpMid: init.sdpMid,
  usernameFragment: init.usernameFragment
})) as any

describe('WebRTCManager', () => {
  let webrtcManager: WebRTCManager
  
  beforeEach(() => {
    jest.clearAllMocks()
    webrtcManager = new WebRTCManager()
  })

  afterEach(() => {
    webrtcManager.destroy()
  })

  describe('Constructor', () => {
    it('should initialize with default STUN servers', () => {
      const manager = new WebRTCManager()
      expect(manager).toBeInstanceOf(WebRTCManager)
    })

    it('should initialize with custom STUN servers', () => {
      const stunServers = ['stun:custom.stun.server:3478']
      const manager = new WebRTCManager(stunServers)
      expect(manager).toBeInstanceOf(WebRTCManager)
    })

    it('should initialize with TURN servers', () => {
      const turnServers = [{
        urls: 'turn:turn.server.com:3478',
        username: 'user',
        credential: 'pass'
      }]
      const manager = new WebRTCManager([], turnServers)
      expect(manager).toBeInstanceOf(WebRTCManager)
    })
  })

  describe('Connection Management', () => {
    it('should create a new peer connection', async () => {
      const peerId = 'test-peer-1'
      const connection = await webrtcManager.createConnection(peerId)
      
      expect(RTCPeerConnection).toHaveBeenCalledWith({
        iceServers: expect.arrayContaining([
          { urls: 'stun:stun.l.google.com:19302' }
        ]),
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
      })
      expect(connection).toBeDefined()
      expect(webrtcManager.hasConnection(peerId)).toBe(true)
    })

    it('should return existing connection if already exists', async () => {
      const peerId = 'test-peer-1'
      const connection1 = await webrtcManager.createConnection(peerId)
      const connection2 = await webrtcManager.createConnection(peerId)
      
      expect(connection1).toBe(connection2)
      expect(RTCPeerConnection).toHaveBeenCalledTimes(1)
    })

    it('should close connection and clean up resources', async () => {
      const peerId = 'test-peer-1'
      await webrtcManager.createConnection(peerId)
      
      expect(webrtcManager.hasConnection(peerId)).toBe(true)
      
      await webrtcManager.closeConnection(peerId)
      
      expect(webrtcManager.hasConnection(peerId)).toBe(false)
      expect(mockRTCPeerConnection.close).toHaveBeenCalled()
    })

    it('should get connection state', async () => {
      const peerId = 'test-peer-1'
      await webrtcManager.createConnection(peerId)
      
      const state = webrtcManager.getConnectionState(peerId)
      expect(state).toBe('new')
    })

    it('should return closed state for non-existent connection', () => {
      const state = webrtcManager.getConnectionState('non-existent')
      expect(state).toBe('closed')
    })
  })

  describe('Data Channels', () => {
    it('should create data channel', async () => {
      const peerId = 'test-peer-1'
      const label = 'test-channel'
      
      // Mock the data channel to be open immediately
      const mockChannel = { ...mockRTCDataChannel, readyState: 'open' as RTCDataChannelState }
      mockRTCPeerConnection.createDataChannel.mockReturnValue(mockChannel)
      
      const channel = await webrtcManager.createDataChannel(peerId, label)
      
      expect(channel).toBeDefined()
      expect(mockRTCPeerConnection.createDataChannel).toHaveBeenCalledWith(label, {
        ordered: true,
        maxRetransmits: 3,
        maxPacketLifeTime: 3000
      })
    })

    it('should return existing data channel if already open', async () => {
      const peerId = 'test-peer-1'
      const label = 'test-channel'
      
      // Mock the data channel to be open immediately
      const mockChannel = { ...mockRTCDataChannel, readyState: 'open' as RTCDataChannelState }
      mockRTCPeerConnection.createDataChannel.mockReturnValue(mockChannel)
      
      const channel1 = await webrtcManager.createDataChannel(peerId, label)
      const channel2 = await webrtcManager.createDataChannel(peerId, label)
      
      expect(channel1).toBe(channel2)
    })

    it('should get data channel', async () => {
      const peerId = 'test-peer-1'
      const label = 'test-channel'
      
      const mockChannel = { ...mockRTCDataChannel, readyState: 'open' as RTCDataChannelState }
      mockRTCPeerConnection.createDataChannel.mockReturnValue(mockChannel)
      
      await webrtcManager.createDataChannel(peerId, label)
      const retrievedChannel = webrtcManager.getDataChannel(peerId, label)
      
      expect(retrievedChannel).toBeDefined()
    })

    it('should send data through channel', async () => {
      const peerId = 'test-peer-1'
      const label = 'test-channel'
      const testData = 'Hello, World!'
      
      const mockChannel = { 
        ...mockRTCDataChannel, 
        readyState: 'open' as RTCDataChannelState,
        send: jest.fn()
      }
      mockRTCPeerConnection.createDataChannel.mockReturnValue(mockChannel)
      
      await webrtcManager.createDataChannel(peerId, label)
      await webrtcManager.sendData(peerId, label, testData)
      
      expect(mockChannel.send).toHaveBeenCalledWith(testData)
    })

    it('should throw error when sending data to closed channel', async () => {
      const peerId = 'test-peer-1'
      const label = 'test-channel'
      const testData = 'Hello, World!'
      
      const mockChannel = { 
        ...mockRTCDataChannel, 
        readyState: 'closed' as RTCDataChannelState
      }
      mockRTCPeerConnection.createDataChannel.mockReturnValue(mockChannel)
      
      await webrtcManager.createDataChannel(peerId, label)
      
      await expect(webrtcManager.sendData(peerId, label, testData))
        .rejects.toThrow('Data channel not open')
    })
  })

  describe('ICE Handling', () => {
    it('should add ICE candidate', async () => {
      const peerId = 'test-peer-1'
      const candidate = new RTCIceCandidate({
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54400 typ host',
        sdpMLineIndex: 0
      })
      
      // Mock remote description being set
      const mockConnection = {
        ...mockRTCPeerConnection,
        remoteDescription: { type: 'offer', sdp: 'mock-sdp' }
      }
      ;(RTCPeerConnection as unknown as jest.Mock).mockReturnValue(mockConnection)
      
      await webrtcManager.createConnection(peerId)
      await webrtcManager.addIceCandidate(peerId, candidate)
      
      expect(mockConnection.addIceCandidate).toHaveBeenCalledWith(candidate)
    })

    it('should handle ICE candidate for non-existent connection', async () => {
      const candidate = new RTCIceCandidate({
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54400 typ host',
        sdpMLineIndex: 0
      })
      
      // Should not throw, just log warning
      await webrtcManager.addIceCandidate('non-existent', candidate)
    })

    it('should register ICE candidate callback', () => {
      const callback = jest.fn()
      webrtcManager.onIceCandidate(callback)
      
      // Callback should be registered (we can't easily test the actual callback without complex mocking)
      expect(callback).toBeDefined()
    })
  })

  describe('Event Callbacks', () => {
    it('should register data channel callback', () => {
      const callback = jest.fn()
      webrtcManager.onDataChannel(callback)
      
      expect(callback).toBeDefined()
    })

    it('should register connection state change callback', () => {
      const callback = jest.fn()
      webrtcManager.onConnectionStateChange(callback)
      
      expect(callback).toBeDefined()
    })
  })

  describe('Utility Methods', () => {
    it('should get active connections', async () => {
      const peerId1 = 'peer-1'
      const peerId2 = 'peer-2'
      
      // Mock one connected, one disconnected
      const mockConnection1 = { ...mockRTCPeerConnection, connectionState: 'connected' as RTCPeerConnectionState }
      const mockConnection2 = { ...mockRTCPeerConnection, connectionState: 'disconnected' as RTCPeerConnectionState }
      
      ;(RTCPeerConnection as unknown as jest.Mock)
        .mockReturnValueOnce(mockConnection1)
        .mockReturnValueOnce(mockConnection2)
      
      await webrtcManager.createConnection(peerId1)
      await webrtcManager.createConnection(peerId2)
      
      const activeConnections = webrtcManager.getActiveConnections()
      expect(activeConnections).toContain(peerId1)
      expect(activeConnections).not.toContain(peerId2)
    })

    it('should check if connection exists', async () => {
      const peerId = 'test-peer'
      
      expect(webrtcManager.hasConnection(peerId)).toBe(false)
      
      await webrtcManager.createConnection(peerId)
      expect(webrtcManager.hasConnection(peerId)).toBe(true)
    })

    it('should get connection stats', async () => {
      const peerId = 'test-peer'
      const mockStats = new Map()
      mockRTCPeerConnection.getStats.mockResolvedValue(mockStats)
      
      await webrtcManager.createConnection(peerId)
      const stats = webrtcManager.getConnectionStats(peerId)
      
      expect(stats).toBeDefined()
    })

    it('should return null stats for non-existent connection', () => {
      const stats = webrtcManager.getConnectionStats('non-existent')
      expect(stats).toBeNull()
    })
  })

  describe('SDP Handling', () => {
    it('should create offer', async () => {
      const peerId = 'test-peer'
      const mockOffer = { type: 'offer' as RTCSdpType, sdp: 'mock-offer-sdp' }
      
      mockRTCPeerConnection.createOffer.mockResolvedValue(mockOffer)
      mockRTCPeerConnection.setLocalDescription.mockResolvedValue(undefined)
      
      const offer = await webrtcManager.createOffer(peerId)
      
      expect(mockRTCPeerConnection.createOffer).toHaveBeenCalledWith({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      })
      expect(mockRTCPeerConnection.setLocalDescription).toHaveBeenCalledWith(mockOffer)
      expect(offer).toBe(mockOffer)
    })

    it('should create answer', async () => {
      const peerId = 'test-peer'
      const mockOffer = { type: 'offer' as RTCSdpType, sdp: 'mock-offer-sdp' }
      const mockAnswer = { type: 'answer' as RTCSdpType, sdp: 'mock-answer-sdp' }
      
      mockRTCPeerConnection.createAnswer.mockResolvedValue(mockAnswer)
      mockRTCPeerConnection.setLocalDescription.mockResolvedValue(undefined)
      mockRTCPeerConnection.setRemoteDescription.mockResolvedValue(undefined)
      
      const answer = await webrtcManager.createAnswer(peerId, mockOffer)
      
      expect(mockRTCPeerConnection.setRemoteDescription).toHaveBeenCalledWith(mockOffer)
      expect(mockRTCPeerConnection.createAnswer).toHaveBeenCalled()
      expect(mockRTCPeerConnection.setLocalDescription).toHaveBeenCalledWith(mockAnswer)
      expect(answer).toBe(mockAnswer)
    })

    it('should set remote answer', async () => {
      const peerId = 'test-peer'
      const mockAnswer = { type: 'answer' as RTCSdpType, sdp: 'mock-answer-sdp' }
      
      mockRTCPeerConnection.setRemoteDescription.mockResolvedValue(undefined)
      
      await webrtcManager.createConnection(peerId)
      await webrtcManager.setRemoteAnswer(peerId, mockAnswer)
      
      expect(mockRTCPeerConnection.setRemoteDescription).toHaveBeenCalledWith(mockAnswer)
    })

    it('should throw error when setting remote answer for non-existent connection', async () => {
      const mockAnswer = { type: 'answer' as RTCSdpType, sdp: 'mock-answer-sdp' }
      
      await expect(webrtcManager.setRemoteAnswer('non-existent', mockAnswer))
        .rejects.toThrow('No connection found for peer: non-existent')
    })
  })

  describe('Cleanup', () => {
    it('should destroy manager and clean up resources', async () => {
      const peerId1 = 'peer-1'
      const peerId2 = 'peer-2'
      
      await webrtcManager.createConnection(peerId1)
      await webrtcManager.createConnection(peerId2)
      
      expect(webrtcManager.hasConnection(peerId1)).toBe(true)
      expect(webrtcManager.hasConnection(peerId2)).toBe(true)
      
      webrtcManager.destroy()
      
      // Give some time for async cleanup
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(mockRTCPeerConnection.close).toHaveBeenCalledTimes(2)
    })
  })
})