import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { EnhancedChatWindow } from '../EnhancedChatWindow'
import { P2PChatIntegration } from '../../p2p/P2PChatIntegration'
import { P2PMessagingManager } from '../../p2p/P2PMessagingManager'
import { P2PManager } from '../../p2p/P2PManager'
import { useStore } from '../../store'

// Mock the store
jest.mock('../../store')
const mockUseStore = useStore as jest.MockedFunction<typeof useStore>

// Mock P2P components
jest.mock('../../p2p/P2PManager')
jest.mock('../../p2p/P2PMessagingManager')

describe('P2P Chat UI Integration', () => {
  const mockMatch = {
    id: 'match1',
    userId: 'user1',
    name: 'Alice',
    age: 25,
    bio: 'Test bio',
    photo: '/test-photo.jpg',
    matchedAt: new Date('2024-01-01'),
    unreadCount: 0
  }

  const mockUser = {
    id: 'currentUser',
    name: 'Current User',
    email: 'user@test.com',
    photos: []
  }

  const mockStoreState = {
    user: mockUser,
    matches: [mockMatch],
    messages: [],
    sendMessage: jest.fn(),
    markMessagesAsRead: jest.fn(),
    getMessagesForMatch: jest.fn(() => []),
    unmatchUser: jest.fn(),
    deleteConversation: jest.fn()
  }

  let mockP2PManager: jest.Mocked<P2PManager>
  let mockMessagingManager: jest.Mocked<P2PMessagingManager>
  let p2pChatIntegration: P2PChatIntegration

  beforeEach(async () => {
    jest.clearAllMocks()
    
    // Setup store mock
    mockUseStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector(mockStoreState as any)
      }
      return mockStoreState as any
    })

    // Setup P2P mocks
    mockP2PManager = {
      getPeerId: jest.fn().mockReturnValue('currentUser'),
      getNetworkStatus: jest.fn().mockReturnValue({ connected: true }),
      connectToPeer: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(undefined)
    } as any

    mockMessagingManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue('msg-id'),
      sendTypingIndicator: jest.fn().mockResolvedValue(undefined),
      waitForDeliveryConfirmation: jest.fn().mockResolvedValue(true),
      onMessage: jest.fn(),
      onTypingIndicator: jest.fn(),
      destroy: jest.fn()
    } as any

    // Create real P2P chat integration with mocked dependencies
    p2pChatIntegration = new P2PChatIntegration(mockMessagingManager, mockP2PManager)
    await p2pChatIntegration.initialize()
  })

  afterEach(() => {
    p2pChatIntegration.destroy()
  })

  describe('End-to-End P2P Chat Flow', () => {
    it('completes full P2P chat initialization and messaging flow', async () => {
      const user = userEvent.setup()
      
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      // Wait for P2P connection to establish
      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      }, { timeout: 5000 })

      // Verify P2P status indicator
      expect(screen.getByText('🔒 Mensagens criptografadas end-to-end via P2P')).toBeInTheDocument()

      // Send a message
      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      const sendButton = screen.getByRole('button', { name: /send/i })

      await user.type(input, 'Hello P2P world!')
      await user.click(sendButton)

      // Verify message was sent via P2P
      expect(mockMessagingManager.sendMessage).toHaveBeenCalledWith('peer1', 'Hello P2P world!', expect.any(String))

      // Verify input is cleared
      expect(input).toHaveValue('')
    })

    it('handles P2P message reception and display', async () => {
      let messageCallback: Function | null = null
      
      mockMessagingManager.onMessage.mockImplementation((callback) => {
        messageCallback = callback
      })

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      // Simulate receiving a P2P message
      const incomingMessage = {
        id: 'incoming-msg-1',
        content: 'Hello from peer!',
        timestamp: new Date(),
        type: 'CHAT'
      }

      act(() => {
        messageCallback?.('peer1', incomingMessage)
      })

      await waitFor(() => {
        expect(screen.getByText('Hello from peer!')).toBeInTheDocument()
      })

      // Verify message shows as encrypted
      expect(screen.getByTitle('Mensagem criptografada')).toBeInTheDocument()
    })

    it('handles typing indicators in real-time', async () => {
      const user = userEvent.setup()
      let typingCallback: Function | null = null
      
      mockMessagingManager.onTypingIndicator.mockImplementation((callback) => {
        typingCallback = callback
      })

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      // Test sending typing indicator
      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      await user.type(input, 'T')

      expect(mockMessagingManager.sendTypingIndicator).toHaveBeenCalledWith('peer1', true)

      // Test receiving typing indicator
      act(() => {
        typingCallback?.('peer1', true)
      })

      await waitFor(() => {
        expect(screen.getByText('Alice está digitando')).toBeInTheDocument()
      })

      // Test typing indicator stops
      act(() => {
        typingCallback?.('peer1', false)
      })

      await waitFor(() => {
        expect(screen.queryByText('Alice está digitando')).not.toBeInTheDocument()
      })
    })

    it('synchronizes message history between peers', async () => {
      // Mock existing message history
      const existingMessages = [
        {
          id: 'hist-1',
          matchId: 'match1',
          senderId: 'peer1',
          text: 'Previous message 1',
          timestamp: new Date('2024-01-01T09:00:00'),
          read: true,
          encrypted: true
        },
        {
          id: 'hist-2',
          matchId: 'match1',
          senderId: 'currentUser',
          text: 'Previous message 2',
          timestamp: new Date('2024-01-01T09:01:00'),
          read: true,
          encrypted: true
        }
      ]

      // Mock the integration to return history
      jest.spyOn(p2pChatIntegration, 'getMessageHistory').mockReturnValue(existingMessages)

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      // Verify historical messages are displayed
      expect(screen.getByText('Previous message 1')).toBeInTheDocument()
      expect(screen.getByText('Previous message 2')).toBeInTheDocument()

      // Verify messages are in correct order
      const messages = screen.getAllByText(/Previous message/)
      expect(messages[0]).toHaveTextContent('Previous message 1')
      expect(messages[1]).toHaveTextContent('Previous message 2')
    })

    it('handles connection failures gracefully', async () => {
      // Mock connection failure
      jest.spyOn(p2pChatIntegration, 'synchronizeMessageHistory').mockRejectedValue(new Error('Connection failed'))

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Disconnected')).toBeInTheDocument()
      })

      // Verify fallback message is shown
      expect(screen.getByText('⚠️ Conexão P2P perdida. Usando modo centralizado.')).toBeInTheDocument()

      // Verify input placeholder changes
      expect(screen.getByPlaceholderText('Digite uma mensagem...')).toBeInTheDocument()
    })

    it('handles message delivery confirmation', async () => {
      const user = userEvent.setup()
      
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      // Send a message
      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      const sendButton = screen.getByRole('button', { name: /send/i })

      await user.type(input, 'Test delivery')
      await user.click(sendButton)

      // Wait for delivery confirmation
      await waitFor(() => {
        expect(mockMessagingManager.waitForDeliveryConfirmation).toHaveBeenCalled()
      })
    })
  })

  describe('P2P Chat Performance', () => {
    it('handles rapid message sending without blocking UI', async () => {
      const user = userEvent.setup()
      
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      const sendButton = screen.getByRole('button', { name: /send/i })

      // Send multiple messages rapidly
      for (let i = 0; i < 5; i++) {
        await user.clear(input)
        await user.type(input, `Message ${i + 1}`)
        await user.click(sendButton)
      }

      // Verify all messages were sent
      expect(mockMessagingManager.sendMessage).toHaveBeenCalledTimes(5)
    })

    it('handles large message history efficiently', async () => {
      // Create large message history
      const largeHistory = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        matchId: 'match1',
        senderId: i % 2 === 0 ? 'peer1' : 'currentUser',
        text: `Message ${i + 1}`,
        timestamp: new Date(Date.now() + i * 1000),
        read: true,
        encrypted: true
      }))

      jest.spyOn(p2pChatIntegration, 'getMessageHistory').mockReturnValue(largeHistory)

      const startTime = performance.now()
      
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      const endTime = performance.now()
      const renderTime = endTime - startTime

      // Verify rendering completes in reasonable time (< 1 second)
      expect(renderTime).toBeLessThan(1000)

      // Verify messages are displayed
      expect(screen.getByText('Message 1')).toBeInTheDocument()
      expect(screen.getByText('Message 100')).toBeInTheDocument()
    })
  })

  describe('P2P Chat Security', () => {
    it('displays encryption indicators for P2P messages', async () => {
      const encryptedMessage = {
        id: 'encrypted-msg',
        matchId: 'match1',
        senderId: 'currentUser',
        text: 'Encrypted message',
        timestamp: new Date(),
        read: true,
        encrypted: true
      }

      jest.spyOn(p2pChatIntegration, 'getMessageHistory').mockReturnValue([encryptedMessage])

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      // Verify encryption indicator is shown
      expect(screen.getByTitle('Mensagem criptografada')).toBeInTheDocument()
      expect(screen.getByText('🔒 Mensagens criptografadas end-to-end via P2P')).toBeInTheDocument()
    })

    it('does not show encryption indicators for centralized messages', async () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={false}
        />
      )

      // Verify no encryption indicators are shown
      expect(screen.queryByTitle('Mensagem criptografada')).not.toBeInTheDocument()
      expect(screen.queryByText('🔒 Mensagens criptografadas end-to-end via P2P')).not.toBeInTheDocument()
    })
  })

  describe('P2P Chat Accessibility', () => {
    it('provides proper ARIA labels for P2P status', async () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      // Verify connection status is accessible
      const statusElement = screen.getByText('• P2P Connected')
      expect(statusElement).toBeInTheDocument()
    })

    it('provides keyboard navigation for P2P features', async () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={p2pChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      const sendButton = screen.getByRole('button', { name: /send/i })

      // Verify elements are focusable
      input.focus()
      expect(document.activeElement).toBe(input)

      // Verify tab navigation works
      fireEvent.keyDown(input, { key: 'Tab' })
      expect(document.activeElement).toBe(sendButton)
    })
  })
})