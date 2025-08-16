import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { P2PChatManager, ChatConnectionStatus } from '../P2PChatManager'
import { P2PManager } from '../P2PManager'
import { CryptoManager } from '../CryptoManager'
import { WebRTCManager } from '../WebRTCManager'
import { P2PChatIntegration } from '../P2PChatIntegration'
import { P2PMessagingManager } from '../P2PMessagingManager'

// Mock dependencies
jest.mock('../P2PManager')
jest.mock('../CryptoManager')
jest.mock('../WebRTCManager')
jest.mock('../P2PChatIntegration')
jest.mock('../P2PMessagingManager')

describe('P2PChatManager', () => {
  let chatManager: P2PChatManager
  let mockP2PManager: any
  let mockCryptoManager: any
  let mockWebRTCManager: any
  let mockChatIntegration: any
  let mockMessagingManager: any

  const testPeerId = 'test-peer-123'
  const myPeerId = 'my-peer-789'
  const testMatchId = 'p2p_match_my-peer-789_test-peer-123'

  beforeEach(() => {
    // Create mocked instances
    mockP2PManager = {
      getPeerId: jest.fn(() => myPeerId),
      getNetworkStatus: jest.fn(() => ({ connected: true })),
      connectToPeer: jest.fn(() => Promise.resolve()),
      onPeerConnected: jest.fn(),
      onPeerDisconnected: jest.fn()
    } as any

    mockCryptoManager = {
      initialize: jest.fn(() => Promise.resolve())
    } as any

    mockWebRTCManager = {
      initialize: jest.fn(() => Promise.resolve())
    } as any

    mockMessagingManager = {
      initialize: jest.fn(() => Promise.resolve()),
      destroy: jest.fn()
    } as any

    mockChatIntegration = {
      initialize: jest.fn(() => Promise.resolve()),
      sendMessage: jest.fn(() => Promise.resolve('msg-123')),
      sendTypingIndicator: jest.fn(() => Promise.resolve()),
      markMessagesAsRead: jest.fn(() => Promise.resolve()),
      getMessageHistory: jest.fn(() => []),
      synchronizeMessageHistory: jest.fn(() => Promise.resolve()),
      clearMessageHistory: jest.fn(),
      addHandler: jest.fn(),
      removeHandler: jest.fn(),
      destroy: jest.fn()
    } as any

    // Mock constructors
    jest.mocked(P2PMessagingManager).mockImplementation(() => mockMessagingManager)
    jest.mocked(P2PChatIntegration).mockImplementation(() => mockChatIntegration)

    chatManager = new P2PChatManager(
      mockP2PManager,
      mockCryptoManager,
      mockWebRTCManager
    )
  })

  afterEach(() => {
    chatManager.destroy()
    jest.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await chatManager.initialize()
      
      expect(mockMessagingManager.initialize).toHaveBeenCalledTimes(1)
      expect(mockChatIntegration.initialize).toHaveBeenCalledTimes(1)
    })

    it('should handle initialization errors', async () => {
      mockMessagingManager.initialize.mockRejectedValue(new Error('Init failed'))
      
      await expect(chatManager.initialize()).rejects.toThrow('Init failed')
    })

    it('should not initialize twice', async () => {
      await chatManager.initialize()
      await chatManager.initialize()
      
      expect(mockMessagingManager.initialize).toHaveBeenCalledTimes(1)
      expect(mockChatIntegration.initialize).toHaveBeenCalledTimes(1)
    })
  })

  describe('chat management', () => {
    beforeEach(async () => {
      await chatManager.initialize()
    })

    it('should start chat successfully', async () => {
      const matchId = await chatManager.startChat(testPeerId)
      
      expect(matchId).toBe(testMatchId)
      expect(mockP2PManager.connectToPeer).toHaveBeenCalledWith(testPeerId)
      expect(mockChatIntegration.synchronizeMessageHistory).toHaveBeenCalledWith(testPeerId, testMatchId)
      expect(chatManager.isChatActive(matchId)).toBe(true)
    })

    it('should handle start chat errors', async () => {
      mockP2PManager.connectToPeer.mockRejectedValue(new Error('Connection failed'))
      
      await expect(chatManager.startChat(testPeerId)).rejects.toThrow('Connection failed')
      
      const status = chatManager.getConnectionStatus(testPeerId)
      expect(status?.status).toBe('error')
    })

    it('should end chat successfully', async () => {
      const matchId = await chatManager.startChat(testPeerId)
      
      await chatManager.endChat(matchId, testPeerId)
      
      expect(chatManager.isChatActive(matchId)).toBe(false)
      expect(mockChatIntegration.clearMessageHistory).toHaveBeenCalledWith(matchId)
      
      const status = chatManager.getConnectionStatus(testPeerId)
      expect(status?.status).toBe('disconnected')
    })

    it('should generate consistent match IDs', async () => {
      const matchId1 = await chatManager.startChat(testPeerId)
      await chatManager.endChat(matchId1, testPeerId)
      
      const matchId2 = await chatManager.startChat(testPeerId)
      
      expect(matchId1).toBe(matchId2)
    })
  })

  describe('message operations', () => {
    beforeEach(async () => {
      await chatManager.initialize()
    })

    it('should send message successfully', async () => {
      const matchId = await chatManager.startChat(testPeerId)
      const messageText = 'Hello, world!'
      
      const messageId = await chatManager.sendMessage(matchId, testPeerId, messageText)
      
      expect(mockChatIntegration.sendMessage).toHaveBeenCalledWith(matchId, testPeerId, messageText)
      expect(messageId).toBe('msg-123')
    })

    it('should reject message for inactive chat', async () => {
      await expect(
        chatManager.sendMessage('inactive-match', testPeerId, 'Test')
      ).rejects.toThrow('Chat not active')
    })

    it('should send typing indicator', async () => {
      await chatManager.sendTypingIndicator(testPeerId, true)
      
      expect(mockChatIntegration.sendTypingIndicator).toHaveBeenCalledWith(testPeerId, true)
    })

    it('should mark messages as read', async () => {
      const matchId = await chatManager.startChat(testPeerId)
      
      await chatManager.markMessagesAsRead(matchId, testPeerId)
      
      expect(mockChatIntegration.markMessagesAsRead).toHaveBeenCalledWith(matchId, testPeerId)
    })

    it('should get message history', async () => {
      const matchId = await chatManager.startChat(testPeerId)
      const mockHistory = [
        {
          id: 'msg-1',
          matchId,
          senderId: testPeerId,
          text: 'Test message',
          timestamp: new Date(),
          read: false,
          encrypted: true
        }
      ]
      
      mockChatIntegration.getMessageHistory.mockReturnValue(mockHistory)
      
      const history = chatManager.getMessageHistory(matchId)
      
      expect(history).toEqual(mockHistory)
      expect(mockChatIntegration.getMessageHistory).toHaveBeenCalledWith(matchId)
    })
  })

  describe('connection status management', () => {
    beforeEach(async () => {
      await chatManager.initialize()
    })

    it('should track connection status', async () => {
      await chatManager.startChat(testPeerId)
      
      const status = chatManager.getConnectionStatus(testPeerId)
      expect(status).toMatchObject({
        peerId: testPeerId,
        status: 'connected'
      })
    })

    it('should handle peer connection events', async () => {
      const connectionHandler = jest.fn()
      chatManager.onConnectionStatusChange(connectionHandler)
      
      // Start a chat which should trigger connection status update
      await chatManager.startChat(testPeerId)
      
      expect(connectionHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          peerId: testPeerId,
          status: 'connected'
        })
      )
    })

    it('should handle peer disconnection events', async () => {
      const connectionHandler = jest.fn()
      chatManager.onConnectionStatusChange(connectionHandler)
      
      // Start chat first
      const matchId = await chatManager.startChat(testPeerId)
      
      // End chat which should trigger disconnection status update
      await chatManager.endChat(matchId, testPeerId)
      
      expect(connectionHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          peerId: testPeerId,
          status: 'disconnected'
        })
      )
    })

    it('should get all active connections', async () => {
      await chatManager.startChat(testPeerId)
      await chatManager.startChat('peer-2')
      
      const connections = chatManager.getActiveConnections()
      
      expect(connections).toHaveLength(2)
      expect(connections.map(c => c.peerId)).toContain(testPeerId)
      expect(connections.map(c => c.peerId)).toContain('peer-2')
    })

    it('should remove connection status handlers', async () => {
      const handler = jest.fn()
      chatManager.onConnectionStatusChange(handler)
      chatManager.removeConnectionStatusHandler(handler)
      
      // Start a chat which would normally trigger connection status update
      await chatManager.startChat(testPeerId)
      
      // Handler should not be called since it was removed
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('handler management', () => {
    beforeEach(async () => {
      await chatManager.initialize()
    })

    it('should add and remove chat handlers', () => {
      const handler = {
        onMessage: jest.fn(),
        onTypingIndicator: jest.fn(),
        onReadReceipt: jest.fn(),
        onMessageDeliveryUpdate: jest.fn()
      }
      
      chatManager.addChatHandler(handler)
      expect(mockChatIntegration.addHandler).toHaveBeenCalledWith(handler)
      
      chatManager.removeChatHandler(handler)
      expect(mockChatIntegration.removeHandler).toHaveBeenCalledWith(handler)
    })
  })

  describe('statistics', () => {
    beforeEach(async () => {
      await chatManager.initialize()
    })

    it('should provide chat statistics', async () => {
      await chatManager.startChat(testPeerId)
      await chatManager.startChat('peer-2')
      
      const mockMessages = [
        {
          id: 'msg-1',
          matchId: testMatchId,
          senderId: testPeerId,
          text: 'Test',
          timestamp: new Date(),
          read: false,
          encrypted: true
        },
        {
          id: 'msg-2',
          matchId: testMatchId,
          senderId: myPeerId,
          text: 'Reply',
          timestamp: new Date(),
          read: true,
          encrypted: false
        }
      ]
      
      mockChatIntegration.getMessageHistory.mockReturnValue(mockMessages)
      
      const stats = chatManager.getStats()
      
      expect(stats.activeChats).toBe(2)
      expect(stats.connectedPeers).toBe(2)
      expect(stats.totalMessages).toBe(4) // 2 messages × 2 chats
      expect(stats.encryptedMessages).toBe(2) // Only encrypted messages
    })
  })

  describe('configuration', () => {
    it('should accept custom configuration', () => {
      const customConfig = {
        enableEncryption: false,
        enableTypingIndicators: false,
        enableReadReceipts: false,
        maxHistorySize: 500
      }
      
      const customChatManager = new P2PChatManager(
        mockP2PManager,
        mockCryptoManager,
        mockWebRTCManager,
        customConfig
      )
      
      const config = (customChatManager as any).config
      expect(config.enableEncryption).toBe(false)
      expect(config.enableTypingIndicators).toBe(false)
      expect(config.enableReadReceipts).toBe(false)
      expect(config.maxHistorySize).toBe(500)
      
      customChatManager.destroy()
    })
  })

  describe('error handling', () => {
    beforeEach(async () => {
      await chatManager.initialize()
    })

    it('should handle network disconnection', async () => {
      mockP2PManager.getNetworkStatus.mockReturnValue({ connected: false })
      
      await expect(chatManager.startChat(testPeerId)).rejects.toThrow('P2P network not connected')
    })

    it('should handle operations before initialization', async () => {
      const uninitializedManager = new P2PChatManager(
        mockP2PManager,
        mockCryptoManager,
        mockWebRTCManager
      )
      
      await expect(uninitializedManager.startChat(testPeerId)).rejects.toThrow('not initialized')
      await expect(uninitializedManager.sendMessage('match', testPeerId, 'test')).rejects.toThrow('not initialized')
      
      uninitializedManager.destroy()
    })
  })

  describe('cleanup', () => {
    it('should cleanup resources on destroy', async () => {
      await chatManager.initialize()
      await chatManager.startChat(testPeerId)
      
      chatManager.destroy()
      
      expect(mockChatIntegration.destroy).toHaveBeenCalledTimes(1)
      expect(mockMessagingManager.destroy).toHaveBeenCalledTimes(1)
      expect(chatManager.isChatActive(testMatchId)).toBe(false)
    })
  })
})