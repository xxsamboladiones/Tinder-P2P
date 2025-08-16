export interface WebRTCManagerInterface {
  // Connection Management
  createConnection(peerId: string): Promise<RTCPeerConnection>
  closeConnection(peerId: string): Promise<void>
  
  // Data Channels
  createDataChannel(peerId: string, label: string): Promise<RTCDataChannel>
  onDataChannel(callback: (peerId: string, channel: RTCDataChannel) => void): void
  
  // ICE Handling
  addIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void>
  onIceCandidate(callback: (peerId: string, candidate: RTCIceCandidate) => void): void
  
  // Connection State
  getConnectionState(peerId: string): RTCPeerConnectionState
  onConnectionStateChange(callback: (peerId: string, state: RTCPeerConnectionState) => void): void
  
  // Utility Methods
  getActiveConnections(): string[]
  getDataChannel(peerId: string, label: string): RTCDataChannel | undefined
  hasConnection(peerId: string): boolean
  sendData(peerId: string, label: string, data: string | ArrayBuffer): Promise<void>
  destroy(): void
}

export class WebRTCManager implements WebRTCManagerInterface {
  private connections: Map<string, RTCPeerConnection> = new Map()
  private dataChannels: Map<string, Map<string, RTCDataChannel>> = new Map()
  private iceServers: RTCIceServer[]
  
  // Event callbacks
  private dataChannelCallbacks: Array<(peerId: string, channel: RTCDataChannel) => void> = []
  private iceCandidateCallbacks: Array<(peerId: string, candidate: RTCIceCandidate) => void> = []
  private connectionStateCallbacks: Array<(peerId: string, state: RTCPeerConnectionState) => void> = []
  
  // Connection retry configuration
  private readonly maxRetries = 3
  private readonly retryDelay = 1000 // ms
  private connectionRetries: Map<string, number> = new Map()

  constructor(stunServers: string[] = [], turnServers: RTCIceServer[] = []) {
    // Default STUN servers if none provided
    const defaultStunServers = stunServers.length > 0 ? stunServers : [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302'
    ]
    
    this.iceServers = [
      ...defaultStunServers.map(url => ({ urls: url })),
      ...turnServers
    ]
  }

  // Connection Management
  async createConnection(peerId: string): Promise<RTCPeerConnection> {
    if (this.connections.has(peerId)) {
      const existingConnection = this.connections.get(peerId)!
      // Return existing connection if it's still usable
      if (['connecting', 'connected'].includes(existingConnection.connectionState)) {
        return existingConnection
      }
      // Clean up failed connection
      await this.closeConnection(peerId)
    }

    const connection = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all'
    })

    // Set up connection event handlers
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate for peer:', peerId, event.candidate)
        // Notify all registered callbacks
        this.iceCandidateCallbacks.forEach(callback => {
          try {
            callback(peerId, event.candidate!)
          } catch (error) {
            console.error('Error in ICE candidate callback:', error)
          }
        })
      } else {
        console.log('ICE gathering complete for peer:', peerId)
      }
    }

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState
      console.log('Connection state changed for peer:', peerId, state)
      
      // Notify all registered callbacks
      this.connectionStateCallbacks.forEach(callback => {
        try {
          callback(peerId, state)
        } catch (error) {
          console.error('Error in connection state callback:', error)
        }
      })

      // Handle connection failures
      if (state === 'failed' || state === 'disconnected') {
        this.handleConnectionFailure(peerId)
      }
      
      // Reset retry counter on successful connection
      if (state === 'connected') {
        this.connectionRetries.delete(peerId)
      }
    }

    connection.ondatachannel = (event) => {
      const channel = event.channel
      console.log('Received data channel:', peerId, channel.label)
      this.setupDataChannel(peerId, channel.label, channel)
      
      // Notify all registered callbacks
      this.dataChannelCallbacks.forEach(callback => {
        try {
          callback(peerId, channel)
        } catch (error) {
          console.error('Error in data channel callback:', error)
        }
      })
    }

    connection.oniceconnectionstatechange = () => {
      console.log('ICE connection state changed for peer:', peerId, connection.iceConnectionState)
      
      // Handle ICE connection failures
      if (connection.iceConnectionState === 'failed') {
        console.warn('ICE connection failed for peer:', peerId, 'attempting restart')
        connection.restartIce()
      }
    }

    connection.onicegatheringstatechange = () => {
      console.log('ICE gathering state changed for peer:', peerId, connection.iceGatheringState)
    }

    this.connections.set(peerId, connection)
    return connection
  }

  async closeConnection(peerId: string): Promise<void> {
    const connection = this.connections.get(peerId)
    if (connection) {
      // Close all data channels first
      const channels = this.dataChannels.get(peerId)
      if (channels) {
        channels.forEach(channel => {
          if (channel.readyState === 'open') {
            channel.close()
          }
        })
      }
      
      // Close the peer connection
      connection.close()
      
      // Clean up maps
      this.connections.delete(peerId)
      this.dataChannels.delete(peerId)
      this.connectionRetries.delete(peerId)
      
      console.log('Closed connection to peer:', peerId)
    }
  }

  // Data Channels
  async createDataChannel(peerId: string, label: string): Promise<RTCDataChannel> {
    const connection = await this.createConnection(peerId)
    
    // Check if data channel already exists
    const existingChannel = this.getDataChannel(peerId, label)
    if (existingChannel && existingChannel.readyState === 'open') {
      return existingChannel
    }
    
    const channel = connection.createDataChannel(label, {
      ordered: true,
      maxRetransmits: 3,
      maxPacketLifeTime: 3000 // 3 seconds
    })

    this.setupDataChannel(peerId, label, channel)
    
    // Wait for channel to open
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Data channel ${label} failed to open for peer ${peerId}`))
      }, 10000) // 10 second timeout
      
      if (channel.readyState === 'open') {
        clearTimeout(timeout)
        resolve(channel)
      } else {
        channel.onopen = () => {
          clearTimeout(timeout)
          resolve(channel)
        }
        
        channel.onerror = (error) => {
          clearTimeout(timeout)
          reject(error)
        }
      }
    })
  }

  private setupDataChannel(peerId: string, label: string, channel: RTCDataChannel): void {
    if (!this.dataChannels.has(peerId)) {
      this.dataChannels.set(peerId, new Map())
    }

    this.dataChannels.get(peerId)!.set(label, channel)

    channel.onopen = () => {
      console.log('Data channel opened:', peerId, label)
    }

    channel.onclose = () => {
      console.log('Data channel closed:', peerId, label)
      // Remove from map when closed
      const peerChannels = this.dataChannels.get(peerId)
      if (peerChannels) {
        peerChannels.delete(label)
        if (peerChannels.size === 0) {
          this.dataChannels.delete(peerId)
        }
      }
    }

    channel.onmessage = (event) => {
      console.log('Data channel message received:', peerId, label, 
        typeof event.data === 'string' ? event.data.substring(0, 100) : '[Binary Data]')
    }

    channel.onerror = (error) => {
      console.error('Data channel error:', peerId, label, error)
    }

    // Monitor channel state
    const checkState = () => {
      if (channel.readyState === 'closed' || channel.readyState === 'closing') {
        return
      }
      
      // Check again in 30 seconds
      setTimeout(checkState, 30000)
    }
    setTimeout(checkState, 30000)
  }

  onDataChannel(callback: (peerId: string, channel: RTCDataChannel) => void): void {
    this.dataChannelCallbacks.push(callback)
    console.log('Data channel callback registered, total callbacks:', this.dataChannelCallbacks.length)
  }

  // ICE Handling
  async addIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void> {
    const connection = this.connections.get(peerId)
    if (!connection) {
      console.warn('Cannot add ICE candidate: no connection for peer', peerId)
      return
    }

    try {
      // Check if remote description is set
      if (!connection.remoteDescription) {
        console.warn('Cannot add ICE candidate: no remote description for peer', peerId)
        return
      }

      await connection.addIceCandidate(candidate)
      console.log('Added ICE candidate for peer:', peerId)
    } catch (error) {
      console.error('Failed to add ICE candidate for peer:', peerId, error)
      throw error
    }
  }

  onIceCandidate(callback: (peerId: string, candidate: RTCIceCandidate) => void): void {
    this.iceCandidateCallbacks.push(callback)
    console.log('ICE candidate callback registered, total callbacks:', this.iceCandidateCallbacks.length)
  }

  // Connection State
  getConnectionState(peerId: string): RTCPeerConnectionState {
    const connection = this.connections.get(peerId)
    return connection ? connection.connectionState : 'closed'
  }

  onConnectionStateChange(callback: (peerId: string, state: RTCPeerConnectionState) => void): void {
    this.connectionStateCallbacks.push(callback)
    console.log('Connection state change callback registered, total callbacks:', this.connectionStateCallbacks.length)
  }

  // Connection failure handling
  private async handleConnectionFailure(peerId: string): Promise<void> {
    const retryCount = this.connectionRetries.get(peerId) || 0
    
    if (retryCount < this.maxRetries) {
      console.log(`Connection failed for peer ${peerId}, attempting retry ${retryCount + 1}/${this.maxRetries}`)
      this.connectionRetries.set(peerId, retryCount + 1)
      
      // Wait before retrying
      setTimeout(async () => {
        try {
          await this.closeConnection(peerId)
          await this.createConnection(peerId)
        } catch (error) {
          console.error('Failed to retry connection for peer:', peerId, error)
        }
      }, this.retryDelay * Math.pow(2, retryCount)) // Exponential backoff
    } else {
      console.error(`Max retries exceeded for peer ${peerId}, giving up`)
      await this.closeConnection(peerId)
    }
  }

  // Utility Methods
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys()).filter(
      peerId => this.getConnectionState(peerId) === 'connected'
    )
  }

  getDataChannel(peerId: string, label: string): RTCDataChannel | undefined {
    return this.dataChannels.get(peerId)?.get(label)
  }

  hasConnection(peerId: string): boolean {
    return this.connections.has(peerId) && 
           !['closed', 'failed'].includes(this.getConnectionState(peerId))
  }

  async sendData(peerId: string, label: string, data: string | ArrayBuffer): Promise<void> {
    const channel = this.getDataChannel(peerId, label)
    if (!channel) {
      throw new Error(`Data channel not found: ${peerId}/${label}`)
    }
    
    if (channel.readyState !== 'open') {
      throw new Error(`Data channel not open: ${peerId}/${label} (state: ${channel.readyState})`)
    }

    try {
      // Handle different data types for WebRTC DataChannel
      if (typeof data === 'string') {
        channel.send(data)
      } else {
        // For ArrayBuffer, we need to convert to a supported type
        channel.send(new Uint8Array(data))
      }
      console.log('Data sent successfully:', peerId, label, 
        typeof data === 'string' ? data.substring(0, 100) : '[Binary Data]')
    } catch (error) {
      console.error('Failed to send data:', peerId, label, error)
      throw error
    }
  }

  // Get connection statistics
  getConnectionStats(peerId: string): Promise<RTCStatsReport> | null {
    const connection = this.connections.get(peerId)
    return connection ? connection.getStats() : null
  }

  // Get all peer connections
  getAllConnections(): Map<string, RTCPeerConnection> {
    return new Map(this.connections)
  }

  // Get all data channels for a peer
  getPeerDataChannels(peerId: string): Map<string, RTCDataChannel> | undefined {
    return this.dataChannels.get(peerId)
  }

  // Clean up resources
  destroy(): void {
    console.log('Destroying WebRTC Manager...')
    
    // Close all connections
    const closePromises = Array.from(this.connections.keys()).map(peerId => 
      this.closeConnection(peerId)
    )
    
    Promise.all(closePromises).then(() => {
      // Clear all callbacks
      this.dataChannelCallbacks.length = 0
      this.iceCandidateCallbacks.length = 0
      this.connectionStateCallbacks.length = 0
      
      // Clear retry tracking
      this.connectionRetries.clear()
      
      console.log('WebRTC Manager destroyed')
    }).catch(error => {
      console.error('Error during WebRTC Manager destruction:', error)
    })
  }

  // Create offer for initiating connection
  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const connection = await this.createConnection(peerId)
    const offer = await connection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    })
    await connection.setLocalDescription(offer)
    return offer
  }

  // Create answer for responding to connection
  async createAnswer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    const connection = await this.createConnection(peerId)
    await connection.setRemoteDescription(offer)
    const answer = await connection.createAnswer()
    await connection.setLocalDescription(answer)
    return answer
  }

  // Set remote answer
  async setRemoteAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const connection = this.connections.get(peerId)
    if (!connection) {
      throw new Error(`No connection found for peer: ${peerId}`)
    }
    await connection.setRemoteDescription(answer)
  }
}