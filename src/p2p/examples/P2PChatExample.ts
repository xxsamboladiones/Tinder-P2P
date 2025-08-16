import { P2PChatManager, ChatConnectionStatus } from '../P2PChatManager'
import { P2PChatHandler, P2PChatMessage, TypingIndicator, ReadReceipt } from '../P2PChatIntegration'
import { P2PManager } from '../P2PManager'
import { CryptoManager } from '../CryptoManager'
import { WebRTCManager } from '../WebRTCManager'

/**
 * P2P Chat Example - Demonstrates complete P2P chat functionality
 * Shows implementation of requirements 4.1, 4.5 for real-time chat interface
 */
export class P2PChatExample {
  private chatManager: P2PChatManager
  private activeChatId: string | null = null
  private currentPeerId: string | null = null

  constructor(
    p2pManager: P2PManager,
    cryptoManager: CryptoManager,
    webrtcManager: WebRTCManager
  ) {
    this.chatManager = new P2PChatManager(p2pManager, cryptoManager, webrtcManager, {
      enableEncryption: true,
      enableTypingIndicators: true,
      enableReadReceipts: true,
      enableMessageHistory: true,
      maxHistorySize: 1000,
      syncTimeout: 30000
    })

    this.setupChatHandlers()
    this.setupConnectionHandlers()
  }

  /**
   * Initialize the P2P chat system
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing P2P Chat Example...')
    
    try {
      await this.chatManager.initialize()
      console.log('✅ P2P Chat system initialized successfully')
      
      this.displayStats()
    } catch (error) {
      console.error('❌ Failed to initialize P2P chat:', error)
      throw error
    }
  }

  /**
   * Start a chat with a peer
   */
  async startChat(peerId: string): Promise<void> {
    console.log(`💬 Starting chat with peer: ${peerId}`)
    
    try {
      const matchId = await this.chatManager.startChat(peerId)
      this.activeChatId = matchId
      this.currentPeerId = peerId
      
      console.log(`✅ Chat started successfully! Match ID: ${matchId}`)
      
      // Display existing message history
      this.displayMessageHistory(matchId)
      
      // Display connection status
      this.displayConnectionStatus(peerId)
      
    } catch (error) {
      console.error(`❌ Failed to start chat with ${peerId}:`, error)
      throw error
    }
  }

  /**
   * Send a message in the active chat
   */
  async sendMessage(text: string): Promise<void> {
    if (!this.activeChatId || !this.currentPeerId) {
      console.warn('⚠️ No active chat. Start a chat first.')
      return
    }

    console.log(`📤 Sending message: "${text}"`)
    
    try {
      const messageId = await this.chatManager.sendMessage(
        this.activeChatId,
        this.currentPeerId,
        text
      )
      
      console.log(`✅ Message sent successfully! ID: ${messageId}`)
    } catch (error) {
      console.error('❌ Failed to send message:', error)
    }
  }

  /**
   * Send typing indicator
   */
  async startTyping(): Promise<void> {
    if (!this.currentPeerId) {
      console.warn('⚠️ No active chat for typing indicator')
      return
    }

    console.log('⌨️ Sending typing indicator...')
    await this.chatManager.sendTypingIndicator(this.currentPeerId, true)
  }

  /**
   * Stop typing indicator
   */
  async stopTyping(): Promise<void> {
    if (!this.currentPeerId) {
      return
    }

    console.log('⌨️ Stopping typing indicator...')
    await this.chatManager.sendTypingIndicator(this.currentPeerId, false)
  }

  /**
   * Mark messages as read
   */
  async markAsRead(): Promise<void> {
    if (!this.activeChatId || !this.currentPeerId) {
      console.warn('⚠️ No active chat to mark as read')
      return
    }

    console.log('👁️ Marking messages as read...')
    
    try {
      await this.chatManager.markMessagesAsRead(this.activeChatId, this.currentPeerId)
      console.log('✅ Messages marked as read')
    } catch (error) {
      console.error('❌ Failed to mark messages as read:', error)
    }
  }

  /**
   * End the current chat
   */
  async endChat(): Promise<void> {
    if (!this.activeChatId || !this.currentPeerId) {
      console.warn('⚠️ No active chat to end')
      return
    }

    console.log(`🔚 Ending chat with peer: ${this.currentPeerId}`)
    
    try {
      await this.chatManager.endChat(this.activeChatId, this.currentPeerId)
      
      this.activeChatId = null
      this.currentPeerId = null
      
      console.log('✅ Chat ended successfully')
    } catch (error) {
      console.error('❌ Failed to end chat:', error)
    }
  }

  /**
   * Display current chat statistics
   */
  displayStats(): void {
    const stats = this.chatManager.getStats()
    
    console.log('\n📊 P2P Chat Statistics:')
    console.log(`   Active Chats: ${stats.activeChats}`)
    console.log(`   Connected Peers: ${stats.connectedPeers}`)
    console.log(`   Total Messages: ${stats.totalMessages}`)
    console.log(`   Encrypted Messages: ${stats.encryptedMessages}`)
    console.log(`   Encryption Rate: ${stats.totalMessages > 0 ? Math.round((stats.encryptedMessages / stats.totalMessages) * 100) : 0}%`)
  }

  /**
   * Display message history for a chat
   */
  displayMessageHistory(matchId: string): void {
    const history = this.chatManager.getMessageHistory(matchId)
    
    console.log(`\n💬 Message History (${history.length} messages):`)
    
    if (history.length === 0) {
      console.log('   No messages yet. Start the conversation!')
      return
    }

    history.forEach((message, index) => {
      const timestamp = message.timestamp.toLocaleTimeString()
      const sender = message.senderId === this.currentPeerId ? 'Peer' : 'You'
      const readStatus = message.read ? '✓' : '○'
      const encryptedIcon = message.encrypted ? '🔒' : '🔓'
      const deliveryIcon = this.getDeliveryIcon(message.deliveryStatus)
      
      console.log(`   ${index + 1}. [${timestamp}] ${sender}: "${message.text}" ${encryptedIcon}${deliveryIcon}${readStatus}`)
    })
  }

  /**
   * Display connection status for a peer
   */
  displayConnectionStatus(peerId: string): void {
    const status = this.chatManager.getConnectionStatus(peerId)
    
    if (!status) {
      console.log(`🔌 Connection Status: Unknown`)
      return
    }

    const statusIcon = this.getStatusIcon(status.status)
    const lastSeen = status.lastSeen ? status.lastSeen.toLocaleTimeString() : 'Never'
    const latency = status.latency ? `${status.latency}ms` : 'Unknown'
    
    console.log(`🔌 Connection Status: ${statusIcon} ${status.status.toUpperCase()}`)
    console.log(`   Last Seen: ${lastSeen}`)
    console.log(`   Latency: ${latency}`)
  }

  /**
   * Display all active connections
   */
  displayAllConnections(): void {
    const connections = this.chatManager.getActiveConnections()
    
    console.log(`\n🌐 Active Connections (${connections.length}):`)
    
    if (connections.length === 0) {
      console.log('   No active connections')
      return
    }

    connections.forEach((connection, index) => {
      const statusIcon = this.getStatusIcon(connection.status)
      const lastSeen = connection.lastSeen ? connection.lastSeen.toLocaleTimeString() : 'Never'
      
      console.log(`   ${index + 1}. ${connection.peerId} - ${statusIcon} ${connection.status} (Last seen: ${lastSeen})`)
    })
  }

  /**
   * Simulate a conversation flow
   */
  async simulateConversation(peerId: string): Promise<void> {
    console.log('\n🎭 Starting conversation simulation...')
    
    try {
      // Start chat
      await this.startChat(peerId)
      await this.delay(1000)
      
      // Send greeting
      await this.startTyping()
      await this.delay(2000)
      await this.stopTyping()
      await this.sendMessage('Hello! How are you doing today?')
      await this.delay(1000)
      
      // Send follow-up
      await this.startTyping()
      await this.delay(1500)
      await this.stopTyping()
      await this.sendMessage('I hope you\'re having a great day! 😊')
      await this.delay(1000)
      
      // Mark as read
      await this.markAsRead()
      await this.delay(500)
      
      // Display final stats
      this.displayStats()
      this.displayMessageHistory(this.activeChatId!)
      
      console.log('✅ Conversation simulation completed!')
      
    } catch (error) {
      console.error('❌ Conversation simulation failed:', error)
    }
  }

  /**
   * Demonstrate error handling
   */
  async demonstrateErrorHandling(): Promise<void> {
    console.log('\n🚨 Demonstrating error handling...')
    
    // Try to send message without active chat
    await this.sendMessage('This should fail')
    
    // Try to start chat with invalid peer ID
    try {
      await this.startChat('')
    } catch (error) {
      console.log('✅ Correctly handled invalid peer ID error')
    }
    
    // Try to mark messages as read without active chat
    await this.markAsRead()
    
    console.log('✅ Error handling demonstration completed')
  }

  /**
   * Cleanup and destroy resources
   */
  destroy(): void {
    console.log('🧹 Cleaning up P2P Chat Example...')
    
    this.chatManager.destroy()
    this.activeChatId = null
    this.currentPeerId = null
    
    console.log('✅ Cleanup completed')
  }

  // Private helper methods

  private setupChatHandlers(): void {
    const chatHandler: P2PChatHandler = {
      onMessage: (message: P2PChatMessage) => {
        const timestamp = message.timestamp.toLocaleTimeString()
        const encryptedIcon = message.encrypted ? '🔒' : '🔓'
        
        console.log(`\n📨 New message received:`)
        console.log(`   From: ${message.senderId}`)
        console.log(`   Text: "${message.text}"`)
        console.log(`   Time: ${timestamp}`)
        console.log(`   Encrypted: ${encryptedIcon}`)
        
        // Auto-mark as read after a delay
        setTimeout(() => {
          if (this.activeChatId === message.matchId && this.currentPeerId === message.senderId) {
            this.markAsRead()
          }
        }, 2000)
      },

      onTypingIndicator: (indicator: TypingIndicator) => {
        const action = indicator.isTyping ? 'started' : 'stopped'
        console.log(`⌨️ ${indicator.peerId} ${action} typing...`)
      },

      onReadReceipt: (receipt: ReadReceipt) => {
        const timestamp = receipt.readAt.toLocaleTimeString()
        console.log(`👁️ Message read by ${receipt.peerId} at ${timestamp}`)
      },

      onMessageDeliveryUpdate: (messageId: string, status: 'sent' | 'delivered' | 'failed') => {
        const statusIcon = this.getDeliveryIcon(status)
        console.log(`📬 Message ${messageId} delivery status: ${statusIcon} ${status.toUpperCase()}`)
      }
    }

    this.chatManager.addChatHandler(chatHandler)
  }

  private setupConnectionHandlers(): void {
    this.chatManager.onConnectionStatusChange((status: ChatConnectionStatus) => {
      const statusIcon = this.getStatusIcon(status.status)
      const timestamp = new Date().toLocaleTimeString()
      
      console.log(`\n🔌 Connection status changed:`)
      console.log(`   Peer: ${status.peerId}`)
      console.log(`   Status: ${statusIcon} ${status.status.toUpperCase()}`)
      console.log(`   Time: ${timestamp}`)
      
      if (status.latency) {
        console.log(`   Latency: ${status.latency}ms`)
      }
    })
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'connected': return '🟢'
      case 'connecting': return '🟡'
      case 'disconnected': return '🔴'
      case 'error': return '❌'
      default: return '⚪'
    }
  }

  private getDeliveryIcon(status?: string): string {
    switch (status) {
      case 'sent': return '📤'
      case 'delivered': return '✅'
      case 'failed': return '❌'
      default: return '⏳'
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Example usage function
export async function runP2PChatExample(): Promise<void> {
  console.log('🎯 P2P Chat Example - Real-time Chat Interface Demo')
  console.log('=' .repeat(60))
  
  // Note: In a real implementation, these would be properly initialized
  // This is just for demonstration purposes
  const mockP2PManager = {} as P2PManager
  const mockCryptoManager = {} as CryptoManager
  const mockWebRTCManager = {} as WebRTCManager
  
  const chatExample = new P2PChatExample(
    mockP2PManager,
    mockCryptoManager,
    mockWebRTCManager
  )
  
  try {
    // Initialize the system
    await chatExample.initialize()
    
    // Demonstrate basic chat functionality
    console.log('\n📋 Basic Chat Operations:')
    await chatExample.startChat('peer-123')
    await chatExample.sendMessage('Hello, this is a test message!')
    await chatExample.sendMessage('How are you doing today?')
    await chatExample.markAsRead()
    
    // Display statistics
    chatExample.displayStats()
    
    // Demonstrate typing indicators
    console.log('\n⌨️ Typing Indicators:')
    await chatExample.startTyping()
    await new Promise(resolve => setTimeout(resolve, 2000))
    await chatExample.stopTyping()
    
    // Simulate full conversation
    await chatExample.simulateConversation('peer-456')
    
    // Demonstrate error handling
    await chatExample.demonstrateErrorHandling()
    
    // Display all connections
    chatExample.displayAllConnections()
    
    // End chat
    await chatExample.endChat()
    
    console.log('\n🎉 P2P Chat Example completed successfully!')
    
  } catch (error) {
    console.error('💥 P2P Chat Example failed:', error)
  } finally {
    // Cleanup
    chatExample.destroy()
  }
}

// Export for use in other examples or tests
export { P2PChatExample }