import { CryptoManager } from './CryptoManager'
import { WebRTCManager } from './WebRTCManager'
import { P2PManager } from './P2PManager'
import { 
  EncryptedMessage, 
  P2PMessage, 
  MessageType, 
  EncryptedPayload,
  RatchetHeader 
} from './types'

export interface P2PMessageHandler {
  (peerId: string, message: DecryptedP2PMessage): void
}

export interface DecryptedP2PMessage {
  id: string
  type: MessageType
  from: string
  to: string
  content: string
  timestamp: Date
  deliveryConfirmation?: boolean
}

export interface MessageDeliveryStatus {
  messageId: string
  peerId: string
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  timestamp: Date
  retryCount: number
}

export interface P2PMessagingConfig {
  maxRetries: number
  retryDelay: number
  messageTimeout: number
  enableDeliveryConfirmation: boolean
  enableTypingIndicators: boolean
}

/**
 * P2P Messaging Manager - Handles encrypted messaging via WebRTC DataChannels
 * Implements requirements 4.1, 4.2, 4.4, 4.5
 */
export class P2PMessagingManager {
  private cryptoManager: CryptoManager
  private webrtcManager: WebRTCManager
  private p2pManager: P2PManager
  private config: P2PMessagingConfig
  
  // Message handling
  private messageHandlers: Set<P2PMessageHandler> = new Set()
  private pendingMessages: Map<string, MessageDeliveryStatus> = new Map()
  private messageQueue: Map<string, DecryptedP2PMessage[]> = new Map()
  
  // Delivery confirmation tracking
  private deliveryCallbacks: Map<string, (delivered: boolean) => void> = new Map()
  private deliveryTimeouts: Map<string, NodeJS.Timeout> = new Map()
  
  // Typing indicators
  private typingIndicators: Map<string, NodeJS.Timeout> = new Map()
  private typingCallbacks: Set<(peerId: string, isTyping: boolean) => void> = new Set()

  constructor(
    cryptoManager: CryptoManager,
    webrtcManager: WebRTCManager,
    p2pManager: P2PManager,
    config: Partial<P2PMessagingConfig> = {}
  ) {
    this.cryptoManager = cryptoManager
    this.webrtcManager = webrtcManager
    this.p2pManager = p2pManager
    
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      messageTimeout: 30000,
      enableDeliveryConfirmation: true,
      enableTypingIndicators: true,
      ...config
    }

    this.setupMessageHandling()
  }

  /**
   * Initialize P2P messaging system
   */
  async initialize(): Promise<void> {
    console.log('Initializing P2P Messaging Manager...')
    
    // Ensure crypto manager has identity
    if (!this.cryptoManager.hasIdentity()) {
      await this.cryptoManager.generateIdentity()
    }

    // Set up WebRTC data channel handlers
    this.webrtcManager.onDataChannel((peerId, channel) => {
      if (channel.label === 'messaging') {
        this.setupDataChannelHandlers(peerId, channel)
      }
    })

    console.log('P2P Messaging Manager initialized')
  }

  /**
   * Send encrypted message to peer (requirement 4.1, 4.2)
   */
  async sendMessage(
    peerId: string, 
    content: string, 
    type: MessageType = MessageType.CHAT
  ): Promise<string> {
    const messageId = crypto.randomUUID()
    
    try {
      // Create message object
      const message: DecryptedP2PMessage = {
        id: messageId,
        type,
        from: this.p2pManager.getPeerId(),
        to: peerId,
        content,
        timestamp: new Date(),
        deliveryConfirmation: this.config.enableDeliveryConfirmation
      }

      // Encrypt message using Double Ratchet (requirement 4.2)
      const encryptedMessage = await this.encryptMessage(peerId, message)
      
      // Send via WebRTC DataChannel (requirement 4.1)
      await this.sendEncryptedMessage(peerId, encryptedMessage)
      
      // Track delivery status
      this.trackMessageDelivery(messageId, peerId)
      
      console.log('Message sent:', messageId, 'to peer:', peerId)
      return messageId
    } catch (error) {
      console.error('Failed to send message:', error)
      this.updateDeliveryStatus(messageId, peerId, 'failed')
      throw error
    }
  }

  /**
   * Send typing indicator to peer
   */
  async sendTypingIndicator(peerId: string, isTyping: boolean): Promise<void> {
    if (!this.config.enableTypingIndicators) return

    try {
      const message: DecryptedP2PMessage = {
        id: crypto.randomUUID(),
        type: MessageType.SYSTEM,
        from: this.p2pManager.getPeerId(),
        to: peerId,
        content: JSON.stringify({ typing: isTyping }),
        timestamp: new Date(),
        deliveryConfirmation: false
      }

      const encryptedMessage = await this.encryptMessage(peerId, message)
      await this.sendEncryptedMessage(peerId, encryptedMessage)
    } catch (error) {
      console.warn('Failed to send typing indicator:', error)
    }
  }

  /**
   * Register message handler
   */
  onMessage(handler: P2PMessageHandler): void {
    this.messageHandlers.add(handler)
  }

  /**
   * Remove message handler
   */
  removeMessageHandler(handler: P2PMessageHandler): void {
    this.messageHandlers.delete(handler)
  }

  /**
   * Register typing indicator handler
   */
  onTypingIndicator(callback: (peerId: string, isTyping: boolean) => void): void {
    this.typingCallbacks.add(callback)
  }

  /**
   * Get message delivery status
   */
  getMessageDeliveryStatus(messageId: string): MessageDeliveryStatus | null {
    return this.pendingMessages.get(messageId) || null
  }

  /**
   * Get pending messages for a peer
   */
  getPendingMessages(peerId: string): DecryptedP2PMessage[] {
    return this.messageQueue.get(peerId) || []
  }

  /**
   * Clear message queue for peer
   */
  clearMessageQueue(peerId: string): void {
    this.messageQueue.delete(peerId)
  }

  /**
   * Destroy messaging manager and cleanup resources
   */
  destroy(): void {
    console.log('Destroying P2P Messaging Manager...')
    
    // Clear all timeouts
    this.deliveryTimeouts.forEach(timeout => clearTimeout(timeout))
    this.deliveryTimeouts.clear()
    
    this.typingIndicators.forEach(timeout => clearTimeout(timeout))
    this.typingIndicators.clear()
    
    // Clear handlers and queues
    this.messageHandlers.clear()
    this.typingCallbacks.clear()
    this.pendingMessages.clear()
    this.messageQueue.clear()
    this.deliveryCallbacks.clear()
    
    console.log('P2P Messaging Manager destroyed')
  }

  // Private Methods

  /**
   * Setup message handling from P2P Manager
   */
  private setupMessageHandling(): void {
    this.p2pManager.onMessage((peerId, p2pMessage) => {
      this.handleIncomingP2PMessage(peerId, p2pMessage)
    })
  }

  /**
   * Setup WebRTC DataChannel handlers for messaging
   */
  private setupDataChannelHandlers(peerId: string, channel: RTCDataChannel): void {
    console.log('Setting up messaging data channel for peer:', peerId)
    
    channel.onmessage = async (event) => {
      try {
        await this.handleDataChannelMessage(peerId, event.data)
      } catch (error) {
        console.error('Error handling data channel message:', error)
      }
    }

    channel.onopen = () => {
      console.log('Messaging data channel opened for peer:', peerId)
      // Send any queued messages
      this.processMessageQueue(peerId)
    }

    channel.onclose = () => {
      console.log('Messaging data channel closed for peer:', peerId)
    }

    channel.onerror = (error) => {
      console.error('Messaging data channel error for peer:', peerId, error)
    }
  }

  /**
   * Encrypt message using Double Ratchet (requirement 4.2)
   */
  private async encryptMessage(peerId: string, message: DecryptedP2PMessage): Promise<EncryptedMessage> {
    try {
      // Initialize ratchet if not exists
      if (!this.cryptoManager.hasIdentity()) {
        throw new Error('Crypto manager not initialized')
      }

      // Serialize message for encryption
      const messageJson = JSON.stringify({
        id: message.id,
        type: message.type,
        from: message.from,
        to: message.to,
        content: message.content,
        timestamp: message.timestamp.toISOString(),
        deliveryConfirmation: message.deliveryConfirmation
      })

      // Encrypt using Double Ratchet
      const encryptedMessage = await this.cryptoManager.encryptMessage(peerId, messageJson)
      
      return encryptedMessage
    } catch (error) {
      console.error('Message encryption failed:', error)
      throw new Error(`Message encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Decrypt message using Double Ratchet (requirement 4.2)
   */
  private async decryptMessage(peerId: string, encryptedMessage: EncryptedMessage): Promise<DecryptedP2PMessage> {
    try {
      // Decrypt using Double Ratchet
      const decryptedJson = await this.cryptoManager.decryptMessage(peerId, encryptedMessage)
      
      // Parse decrypted message
      const messageData = JSON.parse(decryptedJson)
      
      return {
        id: messageData.id,
        type: messageData.type,
        from: messageData.from,
        to: messageData.to,
        content: messageData.content,
        timestamp: new Date(messageData.timestamp),
        deliveryConfirmation: messageData.deliveryConfirmation
      }
    } catch (error) {
      console.error('Message decryption failed:', error)
      throw new Error(`Message decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Send encrypted message via WebRTC DataChannel (requirement 4.1)
   */
  private async sendEncryptedMessage(peerId: string, encryptedMessage: EncryptedMessage): Promise<void> {
    try {
      // Ensure data channel exists
      let channel = this.webrtcManager.getDataChannel(peerId, 'messaging')
      
      if (!channel || channel.readyState !== 'open') {
        // Create messaging data channel if it doesn't exist
        channel = await this.webrtcManager.createDataChannel(peerId, 'messaging')
      }

      // Serialize encrypted message for transmission
      const messageData = {
        ciphertext: Array.from(new Uint8Array(encryptedMessage.ciphertext)),
        header: {
          publicKey: Array.from(new Uint8Array(encryptedMessage.header.publicKey)),
          previousChainLength: encryptedMessage.header.previousChainLength,
          messageNumber: encryptedMessage.header.messageNumber
        },
        timestamp: encryptedMessage.timestamp.toISOString()
      }

      const serializedMessage = JSON.stringify(messageData)
      
      // Send via WebRTC DataChannel
      await this.webrtcManager.sendData(peerId, 'messaging', serializedMessage)
      
      console.log('Encrypted message sent via WebRTC to peer:', peerId)
    } catch (error) {
      console.error('Failed to send encrypted message:', error)
      throw error
    }
  }

  /**
   * Handle incoming P2P message
   */
  private async handleIncomingP2PMessage(peerId: string, p2pMessage: P2PMessage): Promise<void> {
    try {
      // Convert P2PMessage to EncryptedMessage format
      const encryptedMessage: EncryptedMessage = {
        ciphertext: p2pMessage.payload.ciphertext,
        header: p2pMessage.payload.header,
        timestamp: p2pMessage.timestamp
      }

      // Decrypt message
      const decryptedMessage = await this.decryptMessage(peerId, encryptedMessage)
      
      // Handle different message types
      await this.processDecryptedMessage(peerId, decryptedMessage)
      
    } catch (error) {
      console.error('Failed to handle incoming P2P message:', error)
    }
  }

  /**
   * Handle incoming WebRTC DataChannel message
   */
  private async handleDataChannelMessage(peerId: string, data: string | ArrayBuffer): Promise<void> {
    try {
      let messageText: string
      
      if (data instanceof ArrayBuffer) {
        messageText = new TextDecoder().decode(data)
      } else {
        messageText = data
      }

      // Parse message data
      const messageData = JSON.parse(messageText)
      
      // Reconstruct EncryptedMessage
      const encryptedMessage: EncryptedMessage = {
        ciphertext: new Uint8Array(messageData.ciphertext).buffer,
        header: {
          publicKey: new Uint8Array(messageData.header.publicKey).buffer,
          previousChainLength: messageData.header.previousChainLength,
          messageNumber: messageData.header.messageNumber
        },
        timestamp: new Date(messageData.timestamp)
      }

      // Decrypt and process message
      const decryptedMessage = await this.decryptMessage(peerId, encryptedMessage)
      await this.processDecryptedMessage(peerId, decryptedMessage)
      
    } catch (error) {
      console.error('Failed to handle data channel message:', error)
    }
  }

  /**
   * Process decrypted message and handle different types
   */
  private async processDecryptedMessage(peerId: string, message: DecryptedP2PMessage): Promise<void> {
    console.log('Processing decrypted message:', message.type, 'from peer:', peerId)
    
    try {
      // Handle delivery confirmation requests (requirement 4.5)
      if (message.deliveryConfirmation) {
        await this.sendDeliveryConfirmation(peerId, message.id)
      }

      // Handle different message types
      switch (message.type) {
        case MessageType.CHAT:
          // Regular chat message
          this.notifyMessageHandlers(peerId, message)
          break
          
        case MessageType.SYSTEM:
          // System message (typing indicators, etc.)
          await this.handleSystemMessage(peerId, message)
          break
          
        case MessageType.MATCH:
          // Match notification
          this.notifyMessageHandlers(peerId, message)
          break
          
        default:
          console.warn('Unknown message type:', message.type)
          this.notifyMessageHandlers(peerId, message)
      }
    } catch (error) {
      console.error('Failed to process decrypted message:', error)
    }
  }

  /**
   * Handle system messages (typing indicators, delivery confirmations)
   */
  private async handleSystemMessage(peerId: string, message: DecryptedP2PMessage): Promise<void> {
    try {
      const systemData = JSON.parse(message.content)
      
      if (systemData.typing !== undefined) {
        // Typing indicator
        this.handleTypingIndicator(peerId, systemData.typing)
      } else if (systemData.deliveryConfirmation) {
        // Delivery confirmation
        this.handleDeliveryConfirmation(systemData.messageId)
      }
    } catch (error) {
      console.warn('Failed to parse system message:', error)
    }
  }

  /**
   * Handle typing indicator
   */
  private handleTypingIndicator(peerId: string, isTyping: boolean): void {
    // Clear existing timeout
    const existingTimeout = this.typingIndicators.get(peerId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Notify callbacks
    this.typingCallbacks.forEach(callback => {
      try {
        callback(peerId, isTyping)
      } catch (error) {
        console.error('Typing indicator callback failed:', error)
      }
    })

    // Set timeout to clear typing indicator
    if (isTyping) {
      const timeout = setTimeout(() => {
        this.typingCallbacks.forEach(callback => {
          try {
            callback(peerId, false)
          } catch (error) {
            console.error('Typing indicator timeout callback failed:', error)
          }
        })
        this.typingIndicators.delete(peerId)
      }, 3000) // Clear after 3 seconds

      this.typingIndicators.set(peerId, timeout)
    }
  }

  /**
   * Send delivery confirmation (requirement 4.5)
   */
  private async sendDeliveryConfirmation(peerId: string, messageId: string): Promise<void> {
    try {
      const confirmationMessage: DecryptedP2PMessage = {
        id: crypto.randomUUID(),
        type: MessageType.SYSTEM,
        from: this.p2pManager.getPeerId(),
        to: peerId,
        content: JSON.stringify({ deliveryConfirmation: true, messageId }),
        timestamp: new Date(),
        deliveryConfirmation: false
      }

      const encryptedMessage = await this.encryptMessage(peerId, confirmationMessage)
      await this.sendEncryptedMessage(peerId, encryptedMessage)
      
      console.log('Delivery confirmation sent for message:', messageId)
    } catch (error) {
      console.warn('Failed to send delivery confirmation:', error)
    }
  }

  /**
   * Handle delivery confirmation (requirement 4.5)
   */
  private handleDeliveryConfirmation(messageId: string): void {
    const callback = this.deliveryCallbacks.get(messageId)
    if (callback) {
      callback(true)
      this.deliveryCallbacks.delete(messageId)
    }

    // Clear timeout
    const timeout = this.deliveryTimeouts.get(messageId)
    if (timeout) {
      clearTimeout(timeout)
      this.deliveryTimeouts.delete(messageId)
    }

    // Update delivery status
    const status = this.pendingMessages.get(messageId)
    if (status) {
      status.status = 'delivered'
      status.timestamp = new Date()
    }

    console.log('Delivery confirmation received for message:', messageId)
  }

  /**
   * Track message delivery status (requirement 4.5)
   */
  private trackMessageDelivery(messageId: string, peerId: string): void {
    const status: MessageDeliveryStatus = {
      messageId,
      peerId,
      status: 'sent',
      timestamp: new Date(),
      retryCount: 0
    }

    this.pendingMessages.set(messageId, status)

    // Set delivery timeout
    if (this.config.enableDeliveryConfirmation) {
      const timeout = setTimeout(() => {
        const callback = this.deliveryCallbacks.get(messageId)
        if (callback) {
          callback(false)
          this.deliveryCallbacks.delete(messageId)
        }

        // Update status to failed
        const currentStatus = this.pendingMessages.get(messageId)
        if (currentStatus) {
          currentStatus.status = 'failed'
          currentStatus.timestamp = new Date()
        }

        this.deliveryTimeouts.delete(messageId)
        console.warn('Message delivery timeout:', messageId)
      }, this.config.messageTimeout)

      this.deliveryTimeouts.set(messageId, timeout)
    }
  }

  /**
   * Update message delivery status
   */
  private updateDeliveryStatus(messageId: string, peerId: string, status: MessageDeliveryStatus['status']): void {
    const deliveryStatus = this.pendingMessages.get(messageId)
    if (deliveryStatus) {
      deliveryStatus.status = status
      deliveryStatus.timestamp = new Date()
    } else {
      this.pendingMessages.set(messageId, {
        messageId,
        peerId,
        status,
        timestamp: new Date(),
        retryCount: 0
      })
    }
  }

  /**
   * Process message queue for peer when connection is established
   */
  private async processMessageQueue(peerId: string): Promise<void> {
    const queuedMessages = this.messageQueue.get(peerId)
    if (!queuedMessages || queuedMessages.length === 0) {
      return
    }

    console.log('Processing', queuedMessages.length, 'queued messages for peer:', peerId)

    for (const message of queuedMessages) {
      try {
        const encryptedMessage = await this.encryptMessage(peerId, message)
        await this.sendEncryptedMessage(peerId, encryptedMessage)
      } catch (error) {
        console.error('Failed to send queued message:', error)
      }
    }

    // Clear queue after processing
    this.messageQueue.delete(peerId)
  }

  /**
   * Notify all message handlers
   */
  private notifyMessageHandlers(peerId: string, message: DecryptedP2PMessage): void {
    this.messageHandlers.forEach(handler => {
      try {
        handler(peerId, message)
      } catch (error) {
        console.error('Message handler callback failed:', error)
      }
    })
  }

  /**
   * Queue message for later delivery when peer comes online
   */
  private queueMessage(peerId: string, message: DecryptedP2PMessage): void {
    if (!this.messageQueue.has(peerId)) {
      this.messageQueue.set(peerId, [])
    }
    
    this.messageQueue.get(peerId)!.push(message)
    console.log('Message queued for peer:', peerId, 'Queue size:', this.messageQueue.get(peerId)!.length)
  }

  /**
   * Wait for message delivery confirmation
   */
  async waitForDeliveryConfirmation(messageId: string): Promise<boolean> {
    if (!this.config.enableDeliveryConfirmation) {
      return true // Assume delivered if confirmations are disabled
    }

    return new Promise((resolve) => {
      this.deliveryCallbacks.set(messageId, resolve)
    })
  }
}