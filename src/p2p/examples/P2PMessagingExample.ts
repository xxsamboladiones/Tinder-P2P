/**
 * P2P Messaging Example
 * 
 * This example demonstrates how to use the P2PMessagingManager for encrypted
 * peer-to-peer messaging with delivery confirmation and typing indicators.
 * 
 * Requirements covered:
 * - 4.1: Message routing via WebRTC DataChannels
 * - 4.2: Message encryption using Double Ratchet
 * - 4.4: End-to-end encryption
 * - 4.5: Message delivery confirmation
 */

import { P2PMessagingManager, DecryptedP2PMessage } from '../P2PMessagingManager'
import { CryptoManager } from '../CryptoManager'
import { WebRTCManager } from '../WebRTCManager'
import { P2PManager } from '../P2PManager'
import { MessageType } from '../types'

export class P2PMessagingExample {
  private messagingManager: P2PMessagingManager
  private cryptoManager: CryptoManager
  private webrtcManager: WebRTCManager
  private p2pManager: P2PManager
  
  private messageHistory: Map<string, DecryptedP2PMessage[]> = new Map()
  private typingStatus: Map<string, boolean> = new Map()

  constructor() {
    // Initialize P2P components
    this.cryptoManager = new CryptoManager()
    this.webrtcManager = new WebRTCManager([
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302'
    ])
    this.p2pManager = new P2PManager({
      stunServers: ['stun:stun.l.google.com:19302'],
      enableEncryption: true,
      messageTimeout: 30000
    })
    
    // Create messaging manager
    this.messagingManager = new P2PMessagingManager(
      this.cryptoManager,
      this.webrtcManager,
      this.p2pManager,
      {
        maxRetries: 3,
        retryDelay: 1000,
        messageTimeout: 30000,
        enableDeliveryConfirmation: true,
        enableTypingIndicators: true
      }
    )
  }

  /**
   * Initialize the P2P messaging system
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing P2P Messaging System...')
    
    try {
      // Initialize P2P components
      await this.p2pManager.initialize()
      await this.p2pManager.connect()
      
      // Initialize messaging manager
      await this.messagingManager.initialize()
      
      // Set up message handlers
      this.setupMessageHandlers()
      
      console.log('✅ P2P Messaging System initialized successfully')
      console.log('📱 Your Peer ID:', this.p2pManager.getPeerId())
      
      const identity = this.cryptoManager.getCurrentIdentity()
      if (identity) {
        console.log('🔐 Your DID:', identity.did)
      }
    } catch (error) {
      console.error('❌ Failed to initialize P2P messaging:', error)
      throw error
    }
  }

  /**
   * Set up message and typing indicator handlers
   */
  private setupMessageHandlers(): void {
    // Handle incoming messages
    this.messagingManager.onMessage((peerId: string, message: DecryptedP2PMessage) => {
      console.log(`📨 Message received from ${peerId}:`, message)
      
      // Store message in history
      if (!this.messageHistory.has(peerId)) {
        this.messageHistory.set(peerId, [])
      }
      this.messageHistory.get(peerId)!.push(message)
      
      // Handle different message types
      switch (message.type) {
        case MessageType.CHAT:
          this.handleChatMessage(peerId, message)
          break
        case MessageType.MATCH:
          this.handleMatchMessage(peerId, message)
          break
        case MessageType.SYSTEM:
          this.handleSystemMessage(peerId, message)
          break
        default:
          console.log(`📋 Unknown message type: ${message.type}`)
      }
    })

    // Handle typing indicators
    this.messagingManager.onTypingIndicator((peerId: string, isTyping: boolean) => {
      console.log(`⌨️  ${peerId} is ${isTyping ? 'typing' : 'not typing'}...`)
      this.typingStatus.set(peerId, isTyping)
      
      // In a real app, you would update the UI here
      this.updateTypingIndicatorUI(peerId, isTyping)
    })
  }

  /**
   * Send a chat message to a peer
   */
  async sendChatMessage(peerId: string, content: string): Promise<string> {
    console.log(`📤 Sending chat message to ${peerId}: "${content}"`)
    
    try {
      const messageId = await this.messagingManager.sendMessage(
        peerId, 
        content, 
        MessageType.CHAT
      )
      
      console.log(`✅ Message sent with ID: ${messageId}`)
      
      // Wait for delivery confirmation
      const delivered = await this.messagingManager.waitForDeliveryConfirmation(messageId)
      console.log(`📬 Message ${messageId} ${delivered ? 'delivered' : 'delivery failed'}`)
      
      return messageId
    } catch (error) {
      console.error('❌ Failed to send message:', error)
      throw error
    }
  }

  /**
   * Send a match notification to a peer
   */
  async sendMatchNotification(peerId: string): Promise<string> {
    console.log(`💕 Sending match notification to ${peerId}`)
    
    try {
      const matchData = {
        type: 'new_match',
        timestamp: new Date().toISOString(),
        message: 'You have a new match! 🎉'
      }
      
      const messageId = await this.messagingManager.sendMessage(
        peerId,
        JSON.stringify(matchData),
        MessageType.MATCH
      )
      
      console.log(`✅ Match notification sent with ID: ${messageId}`)
      return messageId
    } catch (error) {
      console.error('❌ Failed to send match notification:', error)
      throw error
    }
  }

  /**
   * Send typing indicator to a peer
   */
  async sendTypingIndicator(peerId: string, isTyping: boolean): Promise<void> {
    console.log(`⌨️  Sending typing indicator to ${peerId}: ${isTyping}`)
    
    try {
      await this.messagingManager.sendTypingIndicator(peerId, isTyping)
    } catch (error) {
      console.warn('⚠️  Failed to send typing indicator:', error)
    }
  }

  /**
   * Get message history with a peer
   */
  getMessageHistory(peerId: string): DecryptedP2PMessage[] {
    return this.messageHistory.get(peerId) || []
  }

  /**
   * Get current typing status for a peer
   */
  isTyping(peerId: string): boolean {
    return this.typingStatus.get(peerId) || false
  }

  /**
   * Get message delivery status
   */
  getMessageStatus(messageId: string): string {
    const status = this.messagingManager.getMessageDeliveryStatus(messageId)
    if (!status) return 'unknown'
    
    return `${status.status} (${status.timestamp.toLocaleTimeString()})`
  }

  /**
   * Handle incoming chat messages
   */
  private handleChatMessage(peerId: string, message: DecryptedP2PMessage): void {
    console.log(`💬 Chat from ${peerId}: "${message.content}"`)
    
    // In a real app, you would:
    // 1. Update the chat UI
    // 2. Show notification if app is in background
    // 3. Play notification sound
    // 4. Update unread message count
    
    this.updateChatUI(peerId, message)
  }

  /**
   * Handle incoming match messages
   */
  private handleMatchMessage(peerId: string, message: DecryptedP2PMessage): void {
    console.log(`💕 Match notification from ${peerId}:`, message.content)
    
    try {
      const matchData = JSON.parse(message.content)
      console.log(`🎉 Match type: ${matchData.type}`)
      
      // In a real app, you would:
      // 1. Show match celebration animation
      // 2. Update matches list
      // 3. Send push notification
      
      this.updateMatchUI(peerId, matchData)
    } catch (error) {
      console.warn('⚠️  Failed to parse match data:', error)
    }
  }

  /**
   * Handle system messages
   */
  private handleSystemMessage(peerId: string, message: DecryptedP2PMessage): void {
    console.log(`🔧 System message from ${peerId}:`, message.content)
    
    // System messages are handled internally by the messaging manager
    // This is just for logging/debugging
  }

  /**
   * Update chat UI (placeholder for real implementation)
   */
  private updateChatUI(peerId: string, message: DecryptedP2PMessage): void {
    // In a real React app, you would dispatch an action to update the store
    console.log(`🖥️  [UI] Update chat for ${peerId}`)
    
    // Example of what you might do:
    // dispatch(addMessage({
    //   chatId: peerId,
    //   message: {
    //     id: message.id,
    //     content: message.content,
    //     timestamp: message.timestamp,
    //     fromSelf: false
    //   }
    // }))
  }

  /**
   * Update match UI (placeholder for real implementation)
   */
  private updateMatchUI(peerId: string, matchData: any): void {
    console.log(`🖥️  [UI] Update match for ${peerId}`)
    
    // Example of what you might do:
    // dispatch(addMatch({
    //   peerId,
    //   matchType: matchData.type,
    //   timestamp: matchData.timestamp
    // }))
  }

  /**
   * Update typing indicator UI (placeholder for real implementation)
   */
  private updateTypingIndicatorUI(peerId: string, isTyping: boolean): void {
    console.log(`🖥️  [UI] ${peerId} typing indicator: ${isTyping}`)
    
    // Example of what you might do:
    // dispatch(setTypingIndicator({
    //   peerId,
    //   isTyping
    // }))
  }

  /**
   * Demonstrate conversation flow
   */
  async demonstrateConversation(peerId: string): Promise<void> {
    console.log(`\n🎭 Demonstrating conversation with ${peerId}...\n`)
    
    try {
      // 1. Send typing indicator
      await this.sendTypingIndicator(peerId, true)
      await this.sleep(1000)
      
      // 2. Send first message
      const msg1 = await this.sendChatMessage(peerId, 'Hello! How are you? 👋')
      await this.sleep(2000)
      
      // 3. Stop typing
      await this.sendTypingIndicator(peerId, false)
      await this.sleep(1000)
      
      // 4. Send another message
      const msg2 = await this.sendChatMessage(peerId, 'I hope you\'re having a great day! ☀️')
      await this.sleep(1000)
      
      // 5. Send match notification
      const matchMsg = await this.sendMatchNotification(peerId)
      
      // 6. Show delivery status
      console.log(`\n📊 Message Status Summary:`)
      console.log(`Message 1: ${this.getMessageStatus(msg1)}`)
      console.log(`Message 2: ${this.getMessageStatus(msg2)}`)
      console.log(`Match notification: ${this.getMessageStatus(matchMsg)}`)
      
      // 7. Show message history
      const history = this.getMessageHistory(peerId)
      console.log(`\n📚 Message History (${history.length} messages):`)
      history.forEach((msg, index) => {
        console.log(`${index + 1}. [${msg.type}] ${msg.content.substring(0, 50)}...`)
      })
      
    } catch (error) {
      console.error('❌ Conversation demonstration failed:', error)
    }
  }

  /**
   * Demonstrate error handling
   */
  async demonstrateErrorHandling(): Promise<void> {
    console.log(`\n🚨 Demonstrating error handling...\n`)
    
    const nonExistentPeer = 'non-existent-peer-123'
    
    try {
      // This should fail because the peer doesn't exist
      await this.sendChatMessage(nonExistentPeer, 'This should fail')
    } catch (error) {
      console.log(`✅ Expected error caught:`, error instanceof Error ? error.message : String(error))
    }
    
    // Demonstrate delivery timeout
    try {
      console.log(`⏰ Testing delivery timeout...`)
      const messageId = await this.sendChatMessage('timeout-peer', 'Timeout test')
      
      // Wait for delivery confirmation with short timeout
      const delivered = await Promise.race([
        this.messagingManager.waitForDeliveryConfirmation(messageId),
        this.sleep(2000).then(() => false)
      ])
      
      console.log(`📬 Delivery result: ${delivered ? 'delivered' : 'timeout'}`)
    } catch (error) {
      console.log(`✅ Timeout error handled:`, error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Show system statistics
   */
  showStatistics(): void {
    console.log(`\n📈 P2P Messaging Statistics:`)
    console.log(`Connected peers: ${this.p2pManager.getConnectionCount()}`)
    console.log(`Message history entries: ${this.messageHistory.size}`)
    console.log(`Active typing indicators: ${Array.from(this.typingStatus.values()).filter(Boolean).length}`)
    
    const networkStatus = this.p2pManager.getNetworkStatus()
    console.log(`Network status:`, {
      connected: networkStatus.connected,
      peerCount: networkStatus.peerCount,
      dhtConnected: networkStatus.dhtConnected
    })
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log(`\n🧹 Cleaning up P2P messaging system...`)
    
    try {
      this.messagingManager.destroy()
      this.webrtcManager.destroy()
      await this.p2pManager.disconnect()
      await this.cryptoManager.clearAllData()
      
      console.log(`✅ Cleanup completed`)
    } catch (error) {
      console.error('❌ Cleanup failed:', error)
    }
  }

  /**
   * Utility function to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Example usage
 */
export async function runP2PMessagingExample(): Promise<void> {
  console.log(`\n🎯 P2P Messaging Example Starting...\n`)
  
  const example = new P2PMessagingExample()
  
  try {
    // Initialize the system
    await example.initialize()
    
    // Show initial statistics
    example.showStatistics()
    
    // Demonstrate conversation (with a mock peer)
    await example.demonstrateConversation('example-peer-123')
    
    // Demonstrate error handling
    await example.demonstrateErrorHandling()
    
    // Show final statistics
    example.showStatistics()
    
  } catch (error) {
    console.error('❌ Example failed:', error)
  } finally {
    // Always cleanup
    await example.cleanup()
  }
  
  console.log(`\n🏁 P2P Messaging Example Completed\n`)
}

// Run the example if this file is executed directly
if (require.main === module) {
  runP2PMessagingExample().catch(console.error)
}

/**
 * Integration with existing Tinder app store
 * 
 * Here's how you would integrate this with the existing store:
 */
export class TinderP2PIntegration {
  private messagingManager: P2PMessagingManager
  private store: any // Your Zustand store
  
  constructor(messagingManager: P2PMessagingManager, store: any) {
    this.messagingManager = messagingManager
    this.store = store
    
    this.setupIntegration()
  }
  
  private setupIntegration(): void {
    // Handle incoming P2P messages and update store
    this.messagingManager.onMessage((peerId: string, message: DecryptedP2PMessage) => {
      if (message.type === MessageType.CHAT) {
        // Convert P2P message to store message format
        const storeMessage = {
          id: message.id,
          matchId: peerId, // Use peerId as matchId for P2P
          senderId: message.from,
          text: message.content,
          timestamp: message.timestamp,
          read: false
        }
        
        // Add to store
        this.store.getState().messages.push(storeMessage)
        
        // Update match with last message
        const matches = this.store.getState().matches
        const matchIndex = matches.findIndex((m: any) => m.id === peerId)
        if (matchIndex >= 0) {
          matches[matchIndex].lastMessage = storeMessage
          matches[matchIndex].unreadCount += 1
        }
        
        // Trigger store update
        this.store.setState({
          messages: [...this.store.getState().messages],
          matches: [...matches]
        })
      }
    })
    
    // Handle typing indicators
    this.messagingManager.onTypingIndicator((peerId: string, isTyping: boolean) => {
      // Update typing status in store or trigger UI update
      console.log(`Peer ${peerId} is ${isTyping ? 'typing' : 'not typing'}`)
    })
  }
  
  // Override store's sendMessage to use P2P
  async sendP2PMessage(matchId: string, text: string): Promise<void> {
    try {
      const messageId = await this.messagingManager.sendMessage(matchId, text, MessageType.CHAT)
      
      // Add to local store immediately (optimistic update)
      const currentUser = this.store.getState().user
      if (currentUser) {
        const storeMessage = {
          id: messageId,
          matchId,
          senderId: currentUser.id,
          text,
          timestamp: new Date(),
          read: true
        }
        
        this.store.getState().messages.push(storeMessage)
        
        // Update match with last message
        const matches = this.store.getState().matches
        const matchIndex = matches.findIndex((m: any) => m.id === matchId)
        if (matchIndex >= 0) {
          matches[matchIndex].lastMessage = storeMessage
        }
        
        this.store.setState({
          messages: [...this.store.getState().messages],
          matches: [...matches]
        })
      }
    } catch (error) {
      console.error('Failed to send P2P message:', error)
      // Handle error (show notification, retry, etc.)
    }
  }
}