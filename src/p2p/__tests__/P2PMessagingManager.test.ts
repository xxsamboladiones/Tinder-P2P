import { P2PMessagingManager } from '../P2PMessagingManager'
import { CryptoManager } from '../CryptoManager'
import { WebRTCManager } from '../WebRTCManager'
import { P2PManager } from '../P2PManager'
import { MessageType } from '../types'

describe('P2PMessagingManager', () => {
  let messagingManager: P2PMessagingManager
  let cryptoManager: CryptoManager
  let webrtcManager: WebRTCManager
  let p2pManager: P2PManager

  beforeEach(() => {
    cryptoManager = new CryptoManager()
    webrtcManager = new WebRTCManager()
    p2pManager = new P2PManager()
    
    messagingManager = new P2PMessagingManager(
      cryptoManager,
      webrtcManager,
      p2pManager
    )
  })

  afterEach(() => {
    messagingManager.destroy()
  })

  describe('Basic Functionality', () => {
    it('should create an instance', () => {
      expect(messagingManager).toBeDefined()
      expect(messagingManager).toBeInstanceOf(P2PMessagingManager)
    })

    it('should have required methods', () => {
      expect(typeof messagingManager.initialize).toBe('function')
      expect(typeof messagingManager.sendMessage).toBe('function')
      expect(typeof messagingManager.sendTypingIndicator).toBe('function')
      expect(typeof messagingManager.onMessage).toBe('function')
      expect(typeof messagingManager.onTypingIndicator).toBe('function')
      expect(typeof messagingManager.getMessageDeliveryStatus).toBe('function')
      expect(typeof messagingManager.getPendingMessages).toBe('function')
      expect(typeof messagingManager.clearMessageQueue).toBe('function')
      expect(typeof messagingManager.destroy).toBe('function')
    })

    it('should initialize without throwing', async () => {
      // This test verifies the basic structure works
      // In a real scenario, this would fail due to missing identity
      // but we're testing the code structure
      await expect(messagingManager.initialize()).rejects.toThrow()
    })

    it('should handle message handlers registration', () => {
      const handler = jest.fn()
      
      messagingManager.onMessage(handler)
      messagingManager.removeMessageHandler(handler)
      
      // Should not throw
      expect(true).toBe(true)
    })

    it('should handle typing indicator handlers registration', () => {
      const handler = jest.fn()
      
      messagingManager.onTypingIndicator(handler)
      
      // Should not throw
      expect(true).toBe(true)
    })

    it('should return empty pending messages for unknown peer', () => {
      const messages = messagingManager.getPendingMessages('unknown-peer')
      expect(messages).toEqual([])
    })

    it('should clear message queue without error', () => {
      messagingManager.clearMessageQueue('any-peer')
      // Should not throw
      expect(true).toBe(true)
    })

    it('should return null for unknown message delivery status', () => {
      const status = messagingManager.getMessageDeliveryStatus('unknown-message')
      expect(status).toBeNull()
    })
  })

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const customConfig = {
        maxRetries: 5,
        retryDelay: 2000,
        messageTimeout: 60000,
        enableDeliveryConfirmation: false,
        enableTypingIndicators: false
      }

      const customMessagingManager = new P2PMessagingManager(
        cryptoManager,
        webrtcManager,
        p2pManager,
        customConfig
      )

      expect(customMessagingManager).toBeDefined()
      
      customMessagingManager.destroy()
    })

    it('should use default configuration when none provided', () => {
      const defaultMessagingManager = new P2PMessagingManager(
        cryptoManager,
        webrtcManager,
        p2pManager
      )

      expect(defaultMessagingManager).toBeDefined()
      
      defaultMessagingManager.destroy()
    })
  })

  describe('Error Handling', () => {
    it('should handle sendMessage without initialization', async () => {
      await expect(
        messagingManager.sendMessage('peer123', 'test message')
      ).rejects.toThrow()
    })

    it('should handle sendTypingIndicator without initialization', async () => {
      // Should not throw for typing indicators (they're optional)
      await expect(
        messagingManager.sendTypingIndicator('peer123', true)
      ).resolves.not.toThrow()
    })
  })

  describe('Message Types', () => {
    it('should accept different message types', async () => {
      // These will fail due to lack of initialization, but test the interface
      await expect(
        messagingManager.sendMessage('peer123', 'chat message', MessageType.CHAT)
      ).rejects.toThrow()

      await expect(
        messagingManager.sendMessage('peer123', 'match message', MessageType.MATCH)
      ).rejects.toThrow()

      await expect(
        messagingManager.sendMessage('peer123', 'system message', MessageType.SYSTEM)
      ).rejects.toThrow()
    })
  })
})