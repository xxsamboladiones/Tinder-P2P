import { P2PMessagingManager, DecryptedP2PMessage } from './P2PMessagingManager'
import { P2PManager } from './P2PManager'
import { MessageType } from './types'

export interface P2PChatMessage {
  id: string
  matchId: string
  senderId: string
  text: string
  timestamp: Date
  read: boolean
  deliveryStatus?: 'pending' | 'sent' | 'delivered' | 'failed'
  encrypted?: boolean
}

export interface TypingIndicator {
  peerId: string
  isTyping: boolean
  timestamp: Date
}

export interface ReadReceipt {
  messageId: string
  peerId: string
  readAt: Date
}

export interface P2PChatHandler {
  onMessage: (message: P2PChatMessage) => void
  onTypingIndicator: (indicator: TypingIndicator) => void
  onReadReceipt: (receipt: ReadReceipt) => void
  onMessageDeliveryUpdate: (messageId: string, status: 'sent' | 'delivered' | 'failed') => void
}

/**
 * P2P Chat Integration - Bridges P2P messaging with chat UI
 * Implements requirements 4.1, 4.5 for real-time chat interface
 */
export class P2PChatIntegration {
  private messagingManager: P2PMessagingManager
  private p2pManager: P2PManager
  private handlers: Set<P2PChatHandler> = new Set()
  
  // Message history synchronization
  private messageHistory: Map<string, P2PChatMessage[]> = new Map()
  private syncedPeers: Set<string> = new Set()
  
  // Typing indicators
  private typingStates: Map<string, TypingIndicator> = new Map()
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map()
  
  // Read receipts
  private readReceipts: Map<string, ReadReceipt[]> = new Map()
  
  // Message mapping (P2P message ID to chat message ID)
  private messageMapping: Map<string, string> = new Map()

  constructor(messagingManager: P2PMessagingManager, p2pManager: P2PManager) {
    this.messagingManager = messagingManager
    this.p2pManager = p2pManager
    
    this.setupMessageHandling()
    this.setupTypingIndicators()
  }

  /**
   * Initialize P2P chat integration
   */
  async initialize(): Promise<void> {
    console.log('Initializing P2P Chat Integration...')
    
    // Ensure messaging manager is initialized
    await this.messagingManager.initialize()
    
    console.log('P2P Chat Integration initialized')
  }

  /**
   * Register chat handler for UI updates
   */
  addHandler(handler: P2PChatHandler): void {
    this.handlers.add(handler)
  }

  /**
   * Remove chat handler
   */
  removeHandler(handler: P2PChatHandler): void {
    this.handlers.delete(handler)
  }

  /**
   * Send chat message via P2P (requirement 4.1)
   */
  async sendMessage(matchId: string, peerId: string, text: string): Promise<string> {
    try {
      // Generate chat message ID
      const chatMessageId = crypto.randomUUID()
      
      // Send via P2P messaging
      const p2pMessageId = await this.messagingManager.sendMessage(peerId, text, MessageType.CHAT)
      
      // Map P2P message ID to chat message ID
      this.messageMapping.set(p2pMessageId, chatMessageId)
      
      // Create chat message object
      const chatMessage: P2PChatMessage = {
        id: chatMessageId,
        matchId,
        senderId: this.p2pManager.getPeerId(),
        text,
        timestamp: new Date(),
        read: true, // Own messages are always read
        deliveryStatus: 'sent',
        encrypted: true
      }
      
      // Add to message history
      this.addToMessageHistory(matchId, chatMessage)
      
      // Notify handlers
      this.notifyHandlers('onMessage', chatMessage)
      
      // Monitor delivery status
      this.monitorDeliveryStatus(p2pMessageId, chatMessageId)
      
      console.log('P2P chat message sent:', chatMessageId, 'to peer:', peerId)
      return chatMessageId
    } catch (error) {
      console.error('Failed to send P2P chat message:', error)
      throw error
    }
  }

  /**
   * Send typing indicator (requirement 4.5)
   */
  async sendTypingIndicator(peerId: string, isTyping: boolean): Promise<void> {
    try {
      await this.messagingManager.sendTypingIndicator(peerId, isTyping)
      console.log('Typing indicator sent:', isTyping, 'to peer:', peerId)
    } catch (error) {
      console.warn('Failed to send typing indicator:', error)
    }
  }

  /**
   * Send read receipt (requirement 4.5)
   */
  async sendReadReceipt(peerId: string, messageId: string): Promise<void> {
    try {
      const readReceiptData = {
        messageId,
        readAt: new Date().toISOString()
      }
      
      await this.messagingManager.sendMessage(
        peerId, 
        JSON.stringify({ readReceipt: readReceiptData }), 
        MessageType.SYSTEM
      )
      
      console.log('Read receipt sent for message:', messageId, 'to peer:', peerId)
    } catch (error) {
      console.warn('Failed to send read receipt:', error)
    }
  }

  /**
   * Get message history for a match
   */
  getMessageHistory(matchId: string): P2PChatMessage[] {
    return this.messageHistory.get(matchId) || []
  }

  /**
   * Mark messages as read and send read receipts
   */
  async markMessagesAsRead(matchId: string, peerId: string): Promise<void> {
    const messages = this.messageHistory.get(matchId) || []
    const unreadMessages = messages.filter(msg => !msg.read && msg.senderId !== this.p2pManager.getPeerId())
    
    if (unreadMessages.length === 0) {
      return
    }
    
    // Mark messages as read locally
    messages.forEach(msg => {
      if (!msg.read && msg.senderId !== this.p2pManager.getPeerId()) {
        msg.read = true
      }
    })
    
    // Send read receipts for unread messages
    for (const message of unreadMessages) {
      await this.sendReadReceipt(peerId, message.id)
    }
    
    console.log('Marked', unreadMessages.length, 'messages as read for match:', matchId)
  }

  /**
   * Get current typing indicators
   */
  getTypingIndicators(): TypingIndicator[] {
    return Array.from(this.typingStates.values())
  }

  /**
   * Synchronize message history with peer (requirement 4.5)
   */
  async synchronizeMessageHistory(peerId: string, matchId: string): Promise<void> {
    if (this.syncedPeers.has(peerId)) {
      return // Already synced
    }
    
    try {
      console.log('Synchronizing message history with peer:', peerId)
      
      // Request message history from peer
      const syncRequest = {
        type: 'history_sync_request',
        matchId,
        lastMessageId: this.getLastMessageId(matchId),
        timestamp: new Date().toISOString()
      }
      
      await this.messagingManager.sendMessage(
        peerId,
        JSON.stringify(syncRequest),
        MessageType.SYSTEM
      )
      
      this.syncedPeers.add(peerId)
      console.log('Message history sync requested for peer:', peerId)
    } catch (error) {
      console.error('Failed to synchronize message history:', error)
    }
  }

  /**
   * Clear message history for a match
   */
  clearMessageHistory(matchId: string): void {
    this.messageHistory.delete(matchId)
    console.log('Message history cleared for match:', matchId)
  }

  /**
   * Get delivery status for a message
   */
  getMessageDeliveryStatus(messageId: string): 'pending' | 'sent' | 'delivered' | 'failed' | null {
    // Find the message in history
    for (const messages of this.messageHistory.values()) {
      const message = messages.find(msg => msg.id === messageId)
      if (message) {
        return message.deliveryStatus || null
      }
    }
    return null
  }

  /**
   * Destroy chat integration and cleanup resources
   */
  destroy(): void {
    console.log('Destroying P2P Chat Integration...')
    
    // Clear all timeouts
    this.typingTimeouts.forEach(timeout => clearTimeout(timeout))
    this.typingTimeouts.clear()
    
    // Clear handlers and data
    this.handlers.clear()
    this.messageHistory.clear()
    this.syncedPeers.clear()
    this.typingStates.clear()
    this.readReceipts.clear()
    this.messageMapping.clear()
    
    console.log('P2P Chat Integration destroyed')
  }

  // Private Methods

  /**
   * Setup message handling from P2P messaging manager
   */
  private setupMessageHandling(): void {
    this.messagingManager.onMessage((peerId, p2pMessage) => {
      this.handleIncomingP2PMessage(peerId, p2pMessage)
    })
  }

  /**
   * Setup typing indicator handling
   */
  private setupTypingIndicators(): void {
    this.messagingManager.onTypingIndicator((peerId, isTyping) => {
      this.handleTypingIndicator(peerId, isTyping)
    })
  }

  /**
   * Handle incoming P2P message and convert to chat format
   */
  private async handleIncomingP2PMessage(peerId: string, p2pMessage: DecryptedP2PMessage): Promise<void> {
    try {
      if (p2pMessage.type === MessageType.CHAT) {
        // Regular chat message
        await this.handleChatMessage(peerId, p2pMessage)
      } else if (p2pMessage.type === MessageType.SYSTEM) {
        // System message (read receipts, history sync, etc.)
        await this.handleSystemMessage(peerId, p2pMessage)
      }
    } catch (error) {
      console.error('Failed to handle incoming P2P message:', error)
    }
  }

  /**
   * Handle incoming chat message
   */
  private async handleChatMessage(peerId: string, p2pMessage: DecryptedP2PMessage): Promise<void> {
    // Generate match ID based on peer relationship
    const matchId = this.generateMatchId(peerId)
    
    // Convert P2P message to chat message
    const chatMessage: P2PChatMessage = {
      id: p2pMessage.id,
      matchId,
      senderId: peerId,
      text: p2pMessage.content,
      timestamp: p2pMessage.timestamp,
      read: false, // Incoming messages start as unread
      encrypted: true
    }
    
    // Add to message history
    this.addToMessageHistory(matchId, chatMessage)
    
    // Notify handlers
    this.notifyHandlers('onMessage', chatMessage)
    
    console.log('Received P2P chat message:', chatMessage.id, 'from peer:', peerId)
  }

  /**
   * Handle system messages (read receipts, history sync, etc.)
   */
  private async handleSystemMessage(peerId: string, p2pMessage: DecryptedP2PMessage): Promise<void> {
    try {
      const systemData = JSON.parse(p2pMessage.content)
      
      if (systemData.readReceipt) {
        // Handle read receipt
        const receipt: ReadReceipt = {
          messageId: systemData.readReceipt.messageId,
          peerId,
          readAt: new Date(systemData.readReceipt.readAt)
        }
        
        this.handleReadReceipt(receipt)
      } else if (systemData.type === 'history_sync_request') {
        // Handle history sync request
        await this.handleHistorySyncRequest(peerId, systemData)
      } else if (systemData.type === 'history_sync_response') {
        // Handle history sync response
        await this.handleHistorySyncResponse(peerId, systemData)
      }
    } catch (error) {
      console.warn('Failed to parse system message:', error)
    }
  }

  /**
   * Handle typing indicator
   */
  private handleTypingIndicator(peerId: string, isTyping: boolean): void {
    const indicator: TypingIndicator = {
      peerId,
      isTyping,
      timestamp: new Date()
    }
    
    if (isTyping) {
      this.typingStates.set(peerId, indicator)
      
      // Clear existing timeout
      const existingTimeout = this.typingTimeouts.get(peerId)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }
      
      // Set timeout to clear typing indicator
      const timeout = setTimeout(() => {
        this.typingStates.delete(peerId)
        this.typingTimeouts.delete(peerId)
        
        // Notify handlers that typing stopped
        this.notifyHandlers('onTypingIndicator', {
          peerId,
          isTyping: false,
          timestamp: new Date()
        })
      }, 3000)
      
      this.typingTimeouts.set(peerId, timeout)
    } else {
      this.typingStates.delete(peerId)
      
      // Clear timeout
      const timeout = this.typingTimeouts.get(peerId)
      if (timeout) {
        clearTimeout(timeout)
        this.typingTimeouts.delete(peerId)
      }
    }
    
    // Notify handlers
    this.notifyHandlers('onTypingIndicator', indicator)
  }

  /**
   * Handle read receipt
   */
  private handleReadReceipt(receipt: ReadReceipt): void {
    // Add to read receipts
    if (!this.readReceipts.has(receipt.messageId)) {
      this.readReceipts.set(receipt.messageId, [])
    }
    this.readReceipts.get(receipt.messageId)!.push(receipt)
    
    // Notify handlers
    this.notifyHandlers('onReadReceipt', receipt)
    
    console.log('Received read receipt for message:', receipt.messageId, 'from peer:', receipt.peerId)
  }

  /**
   * Handle history sync request
   */
  private async handleHistorySyncRequest(peerId: string, request: any): Promise<void> {
    const matchId = request.matchId
    const lastMessageId = request.lastMessageId
    
    // Get messages after the last message ID
    const messages = this.getMessageHistory(matchId)
    const messagesToSync = this.getMessagesAfter(messages, lastMessageId)
    
    if (messagesToSync.length > 0) {
      const syncResponse = {
        type: 'history_sync_response',
        matchId,
        messages: messagesToSync.map(msg => ({
          id: msg.id,
          senderId: msg.senderId,
          text: msg.text,
          timestamp: msg.timestamp.toISOString()
        }))
      }
      
      await this.messagingManager.sendMessage(
        peerId,
        JSON.stringify(syncResponse),
        MessageType.SYSTEM
      )
      
      console.log('Sent', messagesToSync.length, 'messages in history sync response to peer:', peerId)
    }
  }

  /**
   * Handle history sync response
   */
  private async handleHistorySyncResponse(peerId: string, response: any): Promise<void> {
    const matchId = response.matchId
    const syncedMessages = response.messages
    
    for (const msgData of syncedMessages) {
      const chatMessage: P2PChatMessage = {
        id: msgData.id,
        matchId,
        senderId: msgData.senderId,
        text: msgData.text,
        timestamp: new Date(msgData.timestamp),
        read: msgData.senderId === this.p2pManager.getPeerId(), // Own messages are read
        encrypted: true
      }
      
      // Add to history if not already present
      if (!this.hasMessage(matchId, msgData.id)) {
        this.addToMessageHistory(matchId, chatMessage)
        this.notifyHandlers('onMessage', chatMessage)
      }
    }
    
    console.log('Synchronized', syncedMessages.length, 'messages from peer:', peerId)
  }

  /**
   * Monitor delivery status for sent messages
   */
  private async monitorDeliveryStatus(p2pMessageId: string, chatMessageId: string): Promise<void> {
    try {
      // Wait for delivery confirmation
      const delivered = await this.messagingManager.waitForDeliveryConfirmation(p2pMessageId)
      
      // Update message delivery status
      this.updateMessageDeliveryStatus(chatMessageId, delivered ? 'delivered' : 'failed')
      
      // Notify handlers
      this.notifyHandlers('onMessageDeliveryUpdate', chatMessageId, delivered ? 'delivered' : 'failed')
    } catch (error) {
      console.warn('Failed to monitor delivery status:', error)
      this.updateMessageDeliveryStatus(chatMessageId, 'failed')
      this.notifyHandlers('onMessageDeliveryUpdate', chatMessageId, 'failed')
    }
  }

  /**
   * Add message to history
   */
  private addToMessageHistory(matchId: string, message: P2PChatMessage): void {
    if (!this.messageHistory.has(matchId)) {
      this.messageHistory.set(matchId, [])
    }
    
    const messages = this.messageHistory.get(matchId)!
    
    // Check if message already exists
    if (!messages.some(msg => msg.id === message.id)) {
      messages.push(message)
      
      // Sort messages by timestamp
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    }
  }

  /**
   * Update message delivery status
   */
  private updateMessageDeliveryStatus(messageId: string, status: 'sent' | 'delivered' | 'failed'): void {
    for (const messages of this.messageHistory.values()) {
      const message = messages.find(msg => msg.id === messageId)
      if (message) {
        message.deliveryStatus = status
        break
      }
    }
  }

  /**
   * Generate match ID based on peer relationship
   */
  private generateMatchId(peerId: string): string {
    const myPeerId = this.p2pManager.getPeerId()
    // Create consistent match ID regardless of who initiates
    const sortedIds = [myPeerId, peerId].sort()
    return `p2p_match_${sortedIds[0]}_${sortedIds[1]}`
  }

  /**
   * Get last message ID for a match
   */
  private getLastMessageId(matchId: string): string | null {
    const messages = this.messageHistory.get(matchId) || []
    return messages.length > 0 ? messages[messages.length - 1].id : null
  }

  /**
   * Get messages after a specific message ID
   */
  private getMessagesAfter(messages: P2PChatMessage[], lastMessageId: string | null): P2PChatMessage[] {
    if (!lastMessageId) {
      return messages
    }
    
    const lastIndex = messages.findIndex(msg => msg.id === lastMessageId)
    return lastIndex >= 0 ? messages.slice(lastIndex + 1) : messages
  }

  /**
   * Check if message exists in history
   */
  private hasMessage(matchId: string, messageId: string): boolean {
    const messages = this.messageHistory.get(matchId) || []
    return messages.some(msg => msg.id === messageId)
  }

  /**
   * Notify all handlers
   */
  private notifyHandlers(method: keyof P2PChatHandler, ...args: any[]): void {
    this.handlers.forEach(handler => {
      try {
        const handlerMethod = handler[method] as Function
        if (typeof handlerMethod === 'function') {
          handlerMethod.apply(handler, args)
        }
      } catch (error) {
        console.error('Handler callback failed:', error)
      }
    })
  }
}