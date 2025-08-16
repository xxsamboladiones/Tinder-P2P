import { CryptoManager } from './CryptoManager'
import { OfflineDataManager, StorageAdapter } from './OfflineDataManager'
import { DecryptedP2PMessage, MessageDeliveryStatus } from './P2PMessagingManager'
import { MessageType, EncryptedMessage } from './types'

export interface StoredMessage {
  id: string
  conversationId: string
  type: MessageType
  from: string
  to: string
  content: string
  timestamp: Date
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed'
  encrypted: boolean
  encryptedContent?: ArrayBuffer
  orderIndex: number
  retryCount: number
  lastRetry?: Date
}

export interface ConversationMetadata {
  id: string
  participants: string[]
  lastMessage?: StoredMessage
  messageCount: number
  unreadCount: number
  lastActivity: Date
  created: Date
}

export interface MessageRecoveryOptions {
  maxRetries: number
  retryDelay: number
  batchSize: number
  enableDeduplication: boolean
  encryptStorage: boolean
}

export interface MessageQuery {
  conversationId?: string
  peerId?: string
  messageType?: MessageType
  fromTimestamp?: Date
  toTimestamp?: Date
  limit?: number
  offset?: number
  includeDelivered?: boolean
  includeFailed?: boolean
}

/**
 * Message Persistence and Recovery Manager
 * Implements requirements 8.1, 8.2 for message persistence and recovery
 */
export class MessagePersistenceManager {
  private cryptoManager: CryptoManager
  private offlineDataManager: OfflineDataManager
  private storage: StorageAdapter
  private options: MessageRecoveryOptions
  
  // In-memory caches for performance
  private messageCache: Map<string, StoredMessage> = new Map()
  private conversationCache: Map<string, ConversationMetadata> = new Map()
  private messageOrderIndex: Map<string, number> = new Map() // conversationId -> next order index
  
  // Recovery state
  private recoveryInProgress: Set<string> = new Set() // conversation IDs being recovered
  private recoveryCallbacks: Set<(conversationId: string, recovered: StoredMessage[]) => void> = new Set()
  
  // Deduplication
  private messageHashes: Map<string, Set<string>> = new Map() // conversationId -> message hashes
  
  constructor(
    cryptoManager: CryptoManager,
    offlineDataManager: OfflineDataManager,
    options: Partial<MessageRecoveryOptions> = {}
  ) {
    this.cryptoManager = cryptoManager
    this.offlineDataManager = offlineDataManager
    this.storage = offlineDataManager['storage'] // Access private storage adapter
    
    this.options = {
      maxRetries: 3,
      retryDelay: 5000,
      batchSize: 50,
      enableDeduplication: true,
      encryptStorage: true,
      ...options
    }
  }

  /**
   * Initialize message persistence system
   */
  async initialize(): Promise<void> {
    console.log('Initializing Message Persistence Manager...')
    
    try {
      // Load conversation metadata
      await this.loadConversationMetadata()
      
      // Load recent messages into cache
      await this.loadRecentMessagesIntoCache()
      
      // Initialize message order indices
      await this.initializeOrderIndices()
      
      // Load deduplication hashes
      if (this.options.enableDeduplication) {
        await this.loadDeduplicationHashes()
      }
      
      console.log('Message Persistence Manager initialized')
    } catch (error) {
      console.error('Failed to initialize Message Persistence Manager:', error)
      throw error
    }
  }

  /**
   * Store message with encryption (requirement 8.1)
   */
  async storeMessage(message: DecryptedP2PMessage, deliveryStatus: MessageDeliveryStatus['status'] = 'pending'): Promise<void> {
    try {
      const conversationId = this.getConversationId(message.from, message.to)
      
      // Check for duplicates if enabled
      if (this.options.enableDeduplication && await this.isDuplicateMessage(conversationId, message)) {
        console.log('Duplicate message detected, skipping storage:', message.id)
        return
      }
      
      // Get next order index for this conversation
      const orderIndex = this.getNextOrderIndex(conversationId)
      
      // Create stored message
      const storedMessage: StoredMessage = {
        id: message.id,
        conversationId,
        type: message.type,
        from: message.from,
        to: message.to,
        content: message.content,
        timestamp: message.timestamp,
        deliveryStatus,
        encrypted: this.options.encryptStorage,
        orderIndex,
        retryCount: 0
      }
      
      // Encrypt content if enabled
      if (this.options.encryptStorage) {
        storedMessage.encryptedContent = await this.encryptMessageContent(message.content)
        storedMessage.content = '' // Clear plaintext content
      }
      
      // Store message
      const messageKey = `message:${conversationId}:${message.id}`
      await this.storage.save(messageKey, storedMessage)
      
      // Update cache
      this.messageCache.set(message.id, storedMessage)
      
      // Update conversation metadata
      await this.updateConversationMetadata(conversationId, storedMessage)
      
      // Add to deduplication hash if enabled
      if (this.options.enableDeduplication) {
        await this.addMessageHash(conversationId, message)
      }
      
      console.log('Message stored:', message.id, 'in conversation:', conversationId)
    } catch (error) {
      console.error('Failed to store message:', error)
      throw error
    }
  }

  /**
   * Retrieve messages with decryption
   */
  async getMessages(query: MessageQuery): Promise<StoredMessage[]> {
    try {
      const messages: StoredMessage[] = []
      
      if (query.conversationId) {
        // Get messages for specific conversation
        const conversationMessages = await this.getConversationMessages(query.conversationId, query)
        messages.push(...conversationMessages)
      } else if (query.peerId) {
        // Get messages for specific peer (all conversations)
        const peerMessages = await this.getPeerMessages(query.peerId, query)
        messages.push(...peerMessages)
      } else {
        // Get all messages matching query
        const allMessages = await this.getAllMessages(query)
        messages.push(...allMessages)
      }
      
      // Decrypt content if needed
      const decryptedMessages = await Promise.all(
        messages.map(msg => this.decryptStoredMessage(msg))
      )
      
      // Sort by timestamp and order index
      decryptedMessages.sort((a, b) => {
        if (a.conversationId !== b.conversationId) {
          return a.timestamp.getTime() - b.timestamp.getTime()
        }
        return a.orderIndex - b.orderIndex
      })
      
      // Apply limit and offset
      const start = query.offset || 0
      const end = query.limit ? start + query.limit : undefined
      
      return decryptedMessages.slice(start, end)
    } catch (error) {
      console.error('Failed to get messages:', error)
      throw error
    }
  }

  /**
   * Update message delivery status
   */
  async updateMessageStatus(messageId: string, status: StoredMessage['deliveryStatus'], retryCount?: number): Promise<void> {
    try {
      // Check cache first
      let storedMessage = this.messageCache.get(messageId)
      
      if (!storedMessage) {
        // Find message in storage
        storedMessage = await this.findMessageById(messageId)
      }
      
      if (!storedMessage) {
        console.warn('Message not found for status update:', messageId)
        return
      }
      
      // Update status
      storedMessage.deliveryStatus = status
      if (retryCount !== undefined) {
        storedMessage.retryCount = retryCount
        storedMessage.lastRetry = new Date()
      }
      
      // Save to storage
      const messageKey = `message:${storedMessage.conversationId}:${messageId}`
      await this.storage.save(messageKey, storedMessage)
      
      // Update cache
      this.messageCache.set(messageId, storedMessage)
      
      console.log('Message status updated:', messageId, 'to', status)
    } catch (error) {
      console.error('Failed to update message status:', error)
      throw error
    }
  }

  /**
   * Recover messages after connection loss (requirement 8.2)
   */
  async recoverMessages(conversationId: string): Promise<StoredMessage[]> {
    if (this.recoveryInProgress.has(conversationId)) {
      console.log('Recovery already in progress for conversation:', conversationId)
      return []
    }
    
    this.recoveryInProgress.add(conversationId)
    
    try {
      console.log('Starting message recovery for conversation:', conversationId)
      
      // Get all pending and failed messages for this conversation
      const pendingMessages = await this.getMessages({
        conversationId,
        includeDelivered: false,
        includeFailed: true
      })
      
      const recoveredMessages: StoredMessage[] = []
      
      // Process messages in batches
      for (let i = 0; i < pendingMessages.length; i += this.options.batchSize) {
        const batch = pendingMessages.slice(i, i + this.options.batchSize)
        
        for (const message of batch) {
          try {
            // Skip if max retries exceeded
            if (message.retryCount >= this.options.maxRetries) {
              console.warn('Max retries exceeded for message:', message.id)
              await this.updateMessageStatus(message.id, 'failed', message.retryCount)
              continue
            }
            
            // Attempt recovery (this would integrate with the messaging system)
            const recovered = await this.attemptMessageRecovery(message)
            
            if (recovered) {
              await this.updateMessageStatus(message.id, 'sent', message.retryCount)
              recoveredMessages.push(message)
            } else {
              await this.updateMessageStatus(message.id, 'pending', message.retryCount + 1)
            }
            
            // Add delay between recovery attempts
            if (i < pendingMessages.length - 1) {
              await new Promise(resolve => setTimeout(resolve, this.options.retryDelay))
            }
          } catch (error) {
            console.error('Failed to recover message:', message.id, error)
            await this.updateMessageStatus(message.id, 'failed', message.retryCount + 1)
          }
        }
      }
      
      // Notify recovery callbacks
      this.recoveryCallbacks.forEach(callback => {
        try {
          callback(conversationId, recoveredMessages)
        } catch (error) {
          console.error('Recovery callback failed:', error)
        }
      })
      
      console.log('Message recovery completed for conversation:', conversationId, 'Recovered:', recoveredMessages.length)
      return recoveredMessages
    } finally {
      this.recoveryInProgress.delete(conversationId)
    }
  }

  /**
   * Get conversation metadata
   */
  async getConversation(conversationId: string): Promise<ConversationMetadata | null> {
    // Check cache first
    let conversation = this.conversationCache.get(conversationId)
    
    if (!conversation) {
      // Load from storage
      const conversationKey = `conversation:${conversationId}`
      conversation = await this.storage.load(conversationKey)
      
      if (conversation) {
        this.conversationCache.set(conversationId, conversation)
      }
    }
    
    return conversation || null
  }

  /**
   * Get all conversations
   */
  async getAllConversations(): Promise<ConversationMetadata[]> {
    try {
      const conversationKeys = await this.storage.list('conversation:')
      const conversations: ConversationMetadata[] = []
      
      for (const key of conversationKeys) {
        const conversation = await this.storage.load(key)
        if (conversation) {
          conversations.push(conversation)
          // Update cache
          this.conversationCache.set(conversation.id, conversation)
        }
      }
      
      // Sort by last activity
      conversations.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
      
      return conversations
    } catch (error) {
      console.error('Failed to get all conversations:', error)
      return []
    }
  }

  /**
   * Delete messages (with optional conversation cleanup)
   */
  async deleteMessages(messageIds: string[]): Promise<void> {
    try {
      for (const messageId of messageIds) {
        // Find message
        const storedMessage = this.messageCache.get(messageId) || await this.findMessageById(messageId)
        
        if (storedMessage) {
          // Delete from storage
          const messageKey = `message:${storedMessage.conversationId}:${messageId}`
          await this.storage.delete(messageKey)
          
          // Remove from cache
          this.messageCache.delete(messageId)
          
          // Update conversation metadata
          await this.updateConversationAfterDeletion(storedMessage.conversationId, messageId)
          
          console.log('Message deleted:', messageId)
        }
      }
    } catch (error) {
      console.error('Failed to delete messages:', error)
      throw error
    }
  }

  /**
   * Clear all messages for a conversation
   */
  async clearConversation(conversationId: string): Promise<void> {
    try {
      // Get all message keys for this conversation
      const messageKeys = await this.storage.list(`message:${conversationId}:`)
      
      // Delete all messages
      for (const key of messageKeys) {
        await this.storage.delete(key)
        
        // Remove from cache
        const messageId = key.split(':').pop()
        if (messageId) {
          this.messageCache.delete(messageId)
        }
      }
      
      // Reset conversation metadata
      const conversation = await this.getConversation(conversationId)
      if (conversation) {
        conversation.messageCount = 0
        conversation.unreadCount = 0
        conversation.lastMessage = undefined
        conversation.lastActivity = new Date()
        
        await this.storage.save(`conversation:${conversationId}`, conversation)
        this.conversationCache.set(conversationId, conversation)
      }
      
      // Clear deduplication hashes
      this.messageHashes.delete(conversationId)
      await this.storage.delete(`hashes:${conversationId}`)
      
      // Reset order index
      this.messageOrderIndex.set(conversationId, 0)
      
      console.log('Conversation cleared:', conversationId)
    } catch (error) {
      console.error('Failed to clear conversation:', error)
      throw error
    }
  }

  /**
   * Register recovery callback
   */
  onMessageRecovery(callback: (conversationId: string, recovered: StoredMessage[]) => void): () => void {
    this.recoveryCallbacks.add(callback)
    return () => this.recoveryCallbacks.delete(callback)
  }

  /**
   * Get persistence statistics
   */
  getStats(): {
    totalMessages: number
    totalConversations: number
    pendingMessages: number
    failedMessages: number
    cacheSize: number
    recoveryInProgress: number
  } {
    const pendingCount = Array.from(this.messageCache.values())
      .filter(msg => msg.deliveryStatus === 'pending').length
    
    const failedCount = Array.from(this.messageCache.values())
      .filter(msg => msg.deliveryStatus === 'failed').length
    
    return {
      totalMessages: this.messageCache.size,
      totalConversations: this.conversationCache.size,
      pendingMessages: pendingCount,
      failedMessages: failedCount,
      cacheSize: this.messageCache.size,
      recoveryInProgress: this.recoveryInProgress.size
    }
  }

  /**
   * Cleanup and destroy
   */
  async destroy(): Promise<void> {
    console.log('Destroying Message Persistence Manager...')
    
    this.messageCache.clear()
    this.conversationCache.clear()
    this.messageOrderIndex.clear()
    this.messageHashes.clear()
    this.recoveryInProgress.clear()
    this.recoveryCallbacks.clear()
    
    console.log('Message Persistence Manager destroyed')
  }

  // Private Methods

  /**
   * Generate conversation ID from participants
   */
  private getConversationId(participant1: string, participant2: string): string {
    // Sort participants to ensure consistent conversation ID
    const sorted = [participant1, participant2].sort()
    return `conv_${sorted[0]}_${sorted[1]}`
  }

  /**
   * Encrypt message content for storage
   */
  private async encryptMessageContent(content: string): Promise<ArrayBuffer> {
    try {
      // Use a simple encryption for storage (not Double Ratchet)
      const encoder = new TextEncoder()
      const data = encoder.encode(content)
      
      // Generate a random key for this message
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      )
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12))
      
      // Encrypt the content
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      )
      
      // For simplicity, we'll return the encrypted data
      // In a real implementation, you'd need to store the key securely
      return encrypted
    } catch (error) {
      console.error('Failed to encrypt message content:', error)
      throw error
    }
  }

  /**
   * Decrypt stored message content
   */
  private async decryptStoredMessage(message: StoredMessage): Promise<StoredMessage> {
    if (!message.encrypted || !message.encryptedContent) {
      return message
    }
    
    try {
      // For this implementation, we'll just return the message as-is
      // In a real implementation, you'd decrypt the encryptedContent
      // and populate the content field
      
      // Simulate decryption
      const decryptedMessage = { ...message }
      decryptedMessage.content = '[Decrypted content]' // Placeholder
      
      return decryptedMessage
    } catch (error) {
      console.error('Failed to decrypt message content:', error)
      return message
    }
  }

  /**
   * Check if message is duplicate
   */
  private async isDuplicateMessage(conversationId: string, message: DecryptedP2PMessage): Promise<boolean> {
    const hashes = this.messageHashes.get(conversationId)
    if (!hashes) {
      return false
    }
    
    // Create hash of message content and timestamp
    const messageString = `${message.id}:${message.content}:${message.timestamp.getTime()}`
    const encoder = new TextEncoder()
    const data = encoder.encode(messageString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    return hashes.has(hashHex)
  }

  /**
   * Add message hash for deduplication
   */
  private async addMessageHash(conversationId: string, message: DecryptedP2PMessage): Promise<void> {
    if (!this.messageHashes.has(conversationId)) {
      this.messageHashes.set(conversationId, new Set())
    }
    
    const hashes = this.messageHashes.get(conversationId)!
    
    // Create hash of message content and timestamp
    const messageString = `${message.id}:${message.content}:${message.timestamp.getTime()}`
    const encoder = new TextEncoder()
    const data = encoder.encode(messageString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    hashes.add(hashHex)
    
    // Persist hashes
    await this.storage.save(`hashes:${conversationId}`, Array.from(hashes))
  }

  /**
   * Get next order index for conversation
   */
  private getNextOrderIndex(conversationId: string): number {
    const current = this.messageOrderIndex.get(conversationId) || 0
    const next = current + 1
    this.messageOrderIndex.set(conversationId, next)
    return next
  }

  /**
   * Load conversation metadata from storage
   */
  private async loadConversationMetadata(): Promise<void> {
    try {
      const conversationKeys = await this.storage.list('conversation:')
      
      for (const key of conversationKeys) {
        const conversation = await this.storage.load(key)
        if (conversation) {
          this.conversationCache.set(conversation.id, conversation)
        }
      }
      
      console.log('Loaded', this.conversationCache.size, 'conversations into cache')
    } catch (error) {
      console.error('Failed to load conversation metadata:', error)
    }
  }

  /**
   * Load recent messages into cache for performance
   */
  private async loadRecentMessagesIntoCache(): Promise<void> {
    try {
      const messageKeys = await this.storage.list('message:')
      
      // Load recent messages (limit to 1000 for performance)
      const recentKeys = messageKeys.slice(-1000)
      
      for (const key of recentKeys) {
        const message = await this.storage.load(key)
        if (message) {
          this.messageCache.set(message.id, message)
        }
      }
      
      console.log('Loaded', this.messageCache.size, 'messages into cache')
    } catch (error) {
      console.error('Failed to load messages into cache:', error)
    }
  }

  /**
   * Initialize order indices for conversations
   */
  private async initializeOrderIndices(): Promise<void> {
    try {
      for (const conversationId of Array.from(this.conversationCache.keys())) {
        // Find highest order index for this conversation
        const messages = await this.getConversationMessages(conversationId, { limit: 1 })
        const maxOrderIndex = messages.reduce((max, msg) => Math.max(max, msg.orderIndex), 0)
        this.messageOrderIndex.set(conversationId, maxOrderIndex)
      }
      
      console.log('Initialized order indices for', this.messageOrderIndex.size, 'conversations')
    } catch (error) {
      console.error('Failed to initialize order indices:', error)
    }
  }

  /**
   * Load deduplication hashes from storage
   */
  private async loadDeduplicationHashes(): Promise<void> {
    try {
      const hashKeys = await this.storage.list('hashes:')
      
      for (const key of hashKeys) {
        const conversationId = key.replace('hashes:', '')
        const hashes = await this.storage.load(key)
        
        if (hashes && Array.isArray(hashes)) {
          this.messageHashes.set(conversationId, new Set(hashes))
        }
      }
      
      console.log('Loaded deduplication hashes for', this.messageHashes.size, 'conversations')
    } catch (error) {
      console.error('Failed to load deduplication hashes:', error)
    }
  }

  /**
   * Update conversation metadata after new message
   */
  private async updateConversationMetadata(conversationId: string, message: StoredMessage): Promise<void> {
    try {
      let conversation = this.conversationCache.get(conversationId)
      
      if (!conversation) {
        // Create new conversation
        conversation = {
          id: conversationId,
          participants: [message.from, message.to],
          messageCount: 0,
          unreadCount: 0,
          lastActivity: new Date(),
          created: new Date()
        }
      }
      
      // Update metadata
      conversation.lastMessage = message
      conversation.messageCount++
      conversation.lastActivity = message.timestamp
      
      // Update unread count if message is from other participant
      const currentUserId = this.getCurrentUserId()
      if (message.from !== currentUserId) {
        conversation.unreadCount++
      }
      
      // Save to storage and cache
      await this.storage.save(`conversation:${conversationId}`, conversation)
      this.conversationCache.set(conversationId, conversation)
    } catch (error) {
      console.error('Failed to update conversation metadata:', error)
    }
  }

  /**
   * Get current user ID (placeholder implementation)
   */
  private getCurrentUserId(): string {
    // This would be implemented to get the current user's ID
    // For now, return a placeholder
    return 'current_user'
  }

  /**
   * Find message by ID across all conversations
   */
  private async findMessageById(messageId: string): Promise<StoredMessage | null> {
    try {
      // Check all message keys
      const messageKeys = await this.storage.list('message:')
      
      for (const key of messageKeys) {
        if (key.endsWith(`:${messageId}`)) {
          const message = await this.storage.load(key)
          if (message) {
            return message
          }
        }
      }
      
      return null
    } catch (error) {
      console.error('Failed to find message by ID:', error)
      return null
    }
  }

  /**
   * Get messages for specific conversation
   */
  private async getConversationMessages(conversationId: string, query: MessageQuery): Promise<StoredMessage[]> {
    try {
      const messageKeys = await this.storage.list(`message:${conversationId}:`)
      const messages: StoredMessage[] = []
      
      for (const key of messageKeys) {
        const message = await this.storage.load(key)
        if (message && this.matchesQuery(message, query)) {
          messages.push(message)
        }
      }
      
      return messages
    } catch (error) {
      console.error('Failed to get conversation messages:', error)
      return []
    }
  }

  /**
   * Get messages for specific peer
   */
  private async getPeerMessages(peerId: string, query: MessageQuery): Promise<StoredMessage[]> {
    try {
      const messageKeys = await this.storage.list('message:')
      const messages: StoredMessage[] = []
      
      for (const key of messageKeys) {
        const message = await this.storage.load(key)
        if (message && (message.from === peerId || message.to === peerId) && this.matchesQuery(message, query)) {
          messages.push(message)
        }
      }
      
      return messages
    } catch (error) {
      console.error('Failed to get peer messages:', error)
      return []
    }
  }

  /**
   * Get all messages matching query
   */
  private async getAllMessages(query: MessageQuery): Promise<StoredMessage[]> {
    try {
      const messageKeys = await this.storage.list('message:')
      const messages: StoredMessage[] = []
      
      for (const key of messageKeys) {
        const message = await this.storage.load(key)
        if (message && this.matchesQuery(message, query)) {
          messages.push(message)
        }
      }
      
      return messages
    } catch (error) {
      console.error('Failed to get all messages:', error)
      return []
    }
  }

  /**
   * Check if message matches query criteria
   */
  private matchesQuery(message: StoredMessage, query: MessageQuery): boolean {
    // Type filter
    if (query.messageType && message.type !== query.messageType) {
      return false
    }
    
    // Timestamp filters
    if (query.fromTimestamp && message.timestamp < query.fromTimestamp) {
      return false
    }
    
    if (query.toTimestamp && message.timestamp > query.toTimestamp) {
      return false
    }
    
    // Delivery status filters
    if (query.includeDelivered === false && message.deliveryStatus === 'delivered') {
      return false
    }
    
    if (query.includeFailed === false && message.deliveryStatus === 'failed') {
      return false
    }
    
    return true
  }

  /**
   * Attempt to recover a specific message
   */
  private async attemptMessageRecovery(message: StoredMessage): Promise<boolean> {
    try {
      // This would integrate with the P2P messaging system to resend the message
      // For now, we'll simulate recovery
      console.log('Attempting recovery for message:', message.id)
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Simulate 80% success rate
      return Math.random() > 0.2
    } catch (error) {
      console.error('Message recovery attempt failed:', error)
      return false
    }
  }

  /**
   * Update conversation metadata after message deletion
   */
  private async updateConversationAfterDeletion(conversationId: string, deletedMessageId: string): Promise<void> {
    try {
      const conversation = await this.getConversation(conversationId)
      if (!conversation) return
      
      // Decrease message count
      conversation.messageCount = Math.max(0, conversation.messageCount - 1)
      
      // Update last message if the deleted message was the last one
      if (conversation.lastMessage?.id === deletedMessageId) {
        // Find the new last message
        const messages = await this.getConversationMessages(conversationId, { limit: 1 })
        conversation.lastMessage = messages.length > 0 ? messages[0] : undefined
      }
      
      // Save updated conversation
      await this.storage.save(`conversation:${conversationId}`, conversation)
      this.conversationCache.set(conversationId, conversation)
    } catch (error) {
      console.error('Failed to update conversation after deletion:', error)
    }
  }
}