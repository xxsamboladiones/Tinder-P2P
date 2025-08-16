import { P2PManager } from './P2PManager'
import { P2PMessagingManager } from './P2PMessagingManager'
import { P2PChatIntegration, P2PChatMessage, P2PChatHandler } from './P2PChatIntegration'
import { CryptoManager } from './CryptoManager'
import { WebRTCManager } from './WebRTCManager'

export interface P2PChatConfig {
  enableEncryption: boolean
  enableTypingIndicators: boolean
  enableReadReceipts: boolean
  enableMessageHistory: boolean
  maxHistorySize: number
  syncTimeout: number
}

export interface ChatConnectionStatus {
  peerId: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  lastSeen?: Date
  latency?: number
}

/**
 * P2P Chat Manager - Coordinates all P2P chat functionality
 * Implements requirements 4.1, 4.5 for real-time chat interface integration
 */
export class P2PChatManager {
  private p2pManager: P2PManager
  private messagingManager: P2PMessagingManager
  private chatIntegration: P2PChatIntegration
  private config: P2PChatConfig
  
  // Connection management
  private connectionStatuses: Map<string, ChatConnectionStatus> = new Map()
  private activeChats: Set<string> = new Set()
  
  // Event handlers
  private chatHandlers: Set<P2PChatHandler> = new Set()
  private connectionHandlers: Set<(status: ChatConnectionStatus) => void> = new Set()
  
  // Initialization state
  private initialized = false

  constructor(
    p2pManager: P2PManager,
    cryptoManager: CryptoManager,
    webrtcManager: WebRTCManager,
    config: Partial<P2PChatConfig> = {}
  ) {
    this.p2pManager = p2pManager
    
    // Initialize messaging manager
    this.messagingManager = new P2PMessagingManager(
      cryptoManager,
      webrtcManager,
      p2pManager,
      {
        enableDeliveryConfirmation: config.enableReadReceipts !== false,
        enableTypingIndicators: config.enableTypingIndicators !== false
      }
    )
    
    // Initialize chat integration
    this.chatIntegration = new P2PChatIntegration(this.messagingManager, p2pManager)
    
    this.config = {
      enableEncryption: true,
      enableTypingIndicators: true,
      enableReadReceipts: true,
      enableMessageHistory: true,
      maxHistorySize: 1000,
      syncTimeout: 30000,
      ...config
    }

    this.setupEventHandlers()
  }

  /**
   * Initialize P2P chat manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    console.log('Initializing P2P Chat Manager...')
    
    try {
      // Initialize messaging manager
      await this.messagingManager.initialize()
      
      // Initialize chat integration
      await this.chatIntegration.initialize()
      
      this.initialized = true
      console.log('P2P Chat Manager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize P2P Chat Manager:', error)
      throw error
    }
  }

  /**
   * Start chat with a peer
   */
  async startChat(peerId: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('P2P Chat Manager not initialized')
    }

    try {
      console.log('Starting chat with peer:', peerId)
      
      // Generate match ID for this chat
      const matchId = this.generateMatchId(peerId)
      
      // Update connection status
      this.updateConnectionStatus(peerId, 'connecting')
      
      // Ensure P2P connection exists
      await this.ensureP2PConnection(peerId)
      
      // Add to active chats
      this.activeChats.add(matchId)
      
      // Synchronize message history
      if (this.config.enableMessageHistory) {
        await this.chatIntegration.synchronizeMessageHistory(peerId, matchId)
      }
      
      // Update connection status to connected
      this.updateConnectionStatus(peerId, 'connected')
      
      console.log('Chat started successfully with peer:', peerId, 'matchId:', matchId)
      return matchId
    } catch (error) {
      console.error('Failed to start chat with peer:', peerId, error)
      this.updateConnectionStatus(peerId, 'error')
      throw error
    }
  }

  /**
   * Send message to peer
   */
  async sendMessage(matchId: string, peerId: string, text: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('P2P Chat Manager not initialized')
    }

    if (!this.activeChats.has(matchId)) {
      throw new Error('Chat not active for match ID: ' + matchId)
    }

    try {
      const messageId = await this.chatIntegration.sendMessage(matchId, peerId, text)
      console.log('Message sent via P2P Chat Manager:', messageId)
      return messageId
    } catch (error) {
      console.error('Failed to send message:', error)
      throw error
    }
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(peerId: string, isTyping: boolean): Promise<void> {
    if (!this.config.enableTypingIndicators) {
      return
    }

    try {
      await this.chatIntegration.sendTypingIndicator(peerId, isTyping)
    } catch (error) {
      console.warn('Failed to send typing indicator:', error)
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(matchId: string, peerId: string): Promise<void> {
    if (!this.config.enableReadReceipts) {
      return
    }

    try {
      await this.chatIntegration.markMessagesAsRead(matchId, peerId)
    } catch (error) {
      console.warn('Failed to mark messages as read:', error)
    }
  }

  /**
   * Get message history for a match
   */
  getMessageHistory(matchId: string): P2PChatMessage[] {
    return this.chatIntegration.getMessageHistory(matchId)
  }

  /**
   * Get chat integration instance
   */
  getChatIntegration(): P2PChatIntegration {
    return this.chatIntegration
  }

  /**
   * Get connection status for a peer
   */
  getConnectionStatus(peerId: string): ChatConnectionStatus | null {
    return this.connectionStatuses.get(peerId) || null
  }

  /**
   * Get all active chat connections
   */
  getActiveConnections(): ChatConnectionStatus[] {
    return Array.from(this.connectionStatuses.values())
  }

  /**
   * Check if chat is active
   */
  isChatActive(matchId: string): boolean {
    return this.activeChats.has(matchId)
  }

  /**
   * End chat with peer
   */
  async endChat(matchId: string, peerId: string): Promise<void> {
    console.log('Ending chat:', matchId, 'with peer:', peerId)
    
    // Remove from active chats
    this.activeChats.delete(matchId)
    
    // Clear message history if configured
    if (this.config.enableMessageHistory) {
      this.chatIntegration.clearMessageHistory(matchId)
    }
    
    // Update connection status
    this.updateConnectionStatus(peerId, 'disconnected')
    
    console.log('Chat ended successfully')
  }

  /**
   * Add chat handler
   */
  addChatHandler(handler: P2PChatHandler): void {
    this.chatHandlers.add(handler)
    this.chatIntegration.addHandler(handler)
  }

  /**
   * Remove chat handler
   */
  removeChatHandler(handler: P2PChatHandler): void {
    this.chatHandlers.delete(handler)
    this.chatIntegration.removeHandler(handler)
  }

  /**
   * Add connection status handler
   */
  onConnectionStatusChange(handler: (status: ChatConnectionStatus) => void): void {
    this.connectionHandlers.add(handler)
  }

  /**
   * Remove connection status handler
   */
  removeConnectionStatusHandler(handler: (status: ChatConnectionStatus) => void): void {
    this.connectionHandlers.delete(handler)
  }

  /**
   * Get chat statistics
   */
  getStats(): {
    activeChats: number
    connectedPeers: number
    totalMessages: number
    encryptedMessages: number
  } {
    const allMessages = Array.from(this.activeChats).flatMap(matchId => 
      this.chatIntegration.getMessageHistory(matchId)
    )
    
    return {
      activeChats: this.activeChats.size,
      connectedPeers: Array.from(this.connectionStatuses.values())
        .filter(status => status.status === 'connected').length,
      totalMessages: allMessages.length,
      encryptedMessages: allMessages.filter(msg => msg.encrypted).length
    }
  }

  /**
   * Destroy chat manager and cleanup resources
   */
  destroy(): void {
    console.log('Destroying P2P Chat Manager...')
    
    // Clear active chats
    this.activeChats.clear()
    
    // Clear handlers
    this.chatHandlers.clear()
    this.connectionHandlers.clear()
    
    // Clear connection statuses
    this.connectionStatuses.clear()
    
    // Destroy components
    this.chatIntegration.destroy()
    this.messagingManager.destroy()
    
    this.initialized = false
    console.log('P2P Chat Manager destroyed')
  }

  // Private Methods

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Monitor P2P manager connection events
    // Note: P2PManager uses libp2p's addEventListener internally
    // For now, we'll handle connection status updates manually
    // In a full implementation, we would expose event emitters from P2PManager
  }

  /**
   * Ensure P2P connection exists with peer
   */
  private async ensureP2PConnection(peerId: string): Promise<void> {
    try {
      // Check if already connected
      const networkStatus = this.p2pManager.getNetworkStatus()
      if (!networkStatus.connected) {
        throw new Error('P2P network not connected')
      }

      // Try to establish connection if not exists
      await this.p2pManager.connectToPeer(peerId)
      
      console.log('P2P connection ensured with peer:', peerId)
    } catch (error) {
      console.error('Failed to ensure P2P connection:', error)
      throw error
    }
  }

  /**
   * Generate match ID for peer relationship
   */
  private generateMatchId(peerId: string): string {
    const myPeerId = this.p2pManager.getPeerId()
    // Create consistent match ID regardless of who initiates
    const sortedIds = [myPeerId, peerId].sort()
    return `p2p_match_${sortedIds[0]}_${sortedIds[1]}`
  }

  /**
   * Update connection status and notify handlers
   */
  private updateConnectionStatus(peerId: string, status: ChatConnectionStatus['status']): void {
    const currentStatus = this.connectionStatuses.get(peerId)
    
    const newStatus: ChatConnectionStatus = {
      peerId,
      status,
      lastSeen: status === 'connected' ? new Date() : currentStatus?.lastSeen,
      latency: currentStatus?.latency
    }
    
    this.connectionStatuses.set(peerId, newStatus)
    
    // Notify handlers
    this.connectionHandlers.forEach(handler => {
      try {
        handler(newStatus)
      } catch (error) {
        console.error('Connection status handler failed:', error)
      }
    })
    
    console.log('Connection status updated for peer:', peerId, 'status:', status)
  }

  /**
   * Cleanup inactive connections
   */
  private cleanupInactiveConnections(): void {
    const now = new Date()
    const timeout = 5 * 60 * 1000 // 5 minutes
    
    for (const [peerId, status] of this.connectionStatuses.entries()) {
      if (status.lastSeen && (now.getTime() - status.lastSeen.getTime()) > timeout) {
        if (status.status === 'connected') {
          this.updateConnectionStatus(peerId, 'disconnected')
        }
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanupInactiveConnections()
    }, 60000) // Run every minute
  }
}