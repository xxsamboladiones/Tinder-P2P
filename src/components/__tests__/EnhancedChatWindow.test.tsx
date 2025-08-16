import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { EnhancedChatWindow } from '../EnhancedChatWindow'
import { useStore } from '../../store'
import { P2PChatIntegration, P2PChatMessage, P2PChatHandler } from '../../p2p/P2PChatIntegration'

// Mock the store
jest.mock('../../store')
const mockUseStore = useStore as jest.MockedFunction<typeof useStore>

// Mock P2P Chat Integration
jest.mock('../../p2p/P2PChatIntegration')
const MockP2PChatIntegration = P2PChatIntegration as jest.MockedClass<typeof P2PChatIntegration>

describe('EnhancedChatWindow', () => {
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

  const mockMessages = [
    {
      id: 'msg1',
      matchId: 'match1',
      senderId: 'user1',
      text: 'Hello!',
      timestamp: new Date('2024-01-01T10:00:00'),
      read: false
    },
    {
      id: 'msg2',
      matchId: 'match1',
      senderId: 'currentUser',
      text: 'Hi there!',
      timestamp: new Date('2024-01-01T10:01:00'),
      read: true
    }
  ]

  const mockStoreState = {
    user: mockUser,
    matches: [mockMatch],
    messages: mockMessages,
    sendMessage: jest.fn(),
    markMessagesAsRead: jest.fn(),
    getMessagesForMatch: jest.fn(() => mockMessages),
    unmatchUser: jest.fn(),
    deleteConversation: jest.fn()
  }

  let mockP2PChatIntegration: jest.Mocked<P2PChatIntegration>

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup store mock
    mockUseStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector(mockStoreState as any)
      }
      return mockStoreState as any
    })

    // Setup P2P integration mock
    mockP2PChatIntegration = {
      addHandler: jest.fn(),
      removeHandler: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue('p2p-msg-id'),
      sendTypingIndicator: jest.fn().mockResolvedValue(undefined),
      markMessagesAsRead: jest.fn().mockResolvedValue(undefined),
      getMessageHistory: jest.fn().mockReturnValue([]),
      synchronizeMessageHistory: jest.fn().mockResolvedValue(undefined),
      clearMessageHistory: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn()
    } as any
  })

  describe('Centralized Mode', () => {
    it('renders chat window in centralized mode', () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={false}
        />
      )

      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('• Centralized')).toBeInTheDocument()
      expect(screen.getByText('Hello!')).toBeInTheDocument()
      expect(screen.getByText('Hi there!')).toBeInTheDocument()
    })

    it('sends message via centralized system', async () => {
      const user = userEvent.setup()
      
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={false}
        />
      )

      const input = screen.getByPlaceholderText('Digite uma mensagem...')
      const sendButton = screen.getByRole('button', { name: /send/i })

      await user.type(input, 'Test message')
      await user.click(sendButton)

      expect(mockStoreState.sendMessage).toHaveBeenCalledWith('match1', 'Test message')
    })

    it('marks messages as read via centralized system', async () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={false}
        />
      )

      await waitFor(() => {
        expect(mockStoreState.markMessagesAsRead).toHaveBeenCalledWith('match1')
      })
    })
  })

  describe('P2P Mode', () => {
    it('renders chat window in P2P mode', async () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })
      
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Digite uma mensagem segura...')).toBeInTheDocument()
    })

    it('initializes P2P chat integration', async () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(mockP2PChatIntegration.addHandler).toHaveBeenCalled()
        expect(mockP2PChatIntegration.getMessageHistory).toHaveBeenCalledWith('match1')
        expect(mockP2PChatIntegration.synchronizeMessageHistory).toHaveBeenCalledWith('peer1', 'match1')
      })
    })

    it('sends message via P2P system', async () => {
      const user = userEvent.setup()
      
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      const sendButton = screen.getByRole('button', { name: /send/i })

      await user.type(input, 'P2P test message')
      await user.click(sendButton)

      expect(mockP2PChatIntegration.sendMessage).toHaveBeenCalledWith('match1', 'peer1', 'P2P test message')
    })

    it('marks messages as read via P2P system', async () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(mockP2PChatIntegration.markMessagesAsRead).toHaveBeenCalledWith('match1', 'peer1')
      })
    })

    it('handles P2P message reception', async () => {
      let messageHandler: P2PChatHandler | null = null
      
      mockP2PChatIntegration.addHandler.mockImplementation((handler) => {
        messageHandler = handler
      })

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(mockP2PChatIntegration.addHandler).toHaveBeenCalled()
      })

      // Simulate receiving a P2P message
      const p2pMessage: P2PChatMessage = {
        id: 'p2p-msg-1',
        matchId: 'match1',
        senderId: 'peer1',
        text: 'P2P message received',
        timestamp: new Date(),
        read: false,
        encrypted: true
      }

      act(() => {
        messageHandler?.onMessage(p2pMessage)
      })

      await waitFor(() => {
        expect(screen.getByText('P2P message received')).toBeInTheDocument()
        expect(screen.getByTitle('Mensagem criptografada')).toBeInTheDocument()
      })
    })
  })

  describe('Typing Indicators', () => {
    it('sends typing indicator when user starts typing', async () => {
      const user = userEvent.setup()
      
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      
      await user.type(input, 'T')

      await waitFor(() => {
        expect(mockP2PChatIntegration.sendTypingIndicator).toHaveBeenCalledWith('peer1', true)
      })
    })

    it('displays typing indicator from peer', async () => {
      let messageHandler: P2PChatHandler | null = null
      
      mockP2PChatIntegration.addHandler.mockImplementation((handler) => {
        messageHandler = handler
      })

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(mockP2PChatIntegration.addHandler).toHaveBeenCalled()
      })

      // Simulate receiving typing indicator
      act(() => {
        messageHandler?.onTypingIndicator({
          peerId: 'peer1',
          isTyping: true,
          timestamp: new Date()
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Alice está digitando')).toBeInTheDocument()
      })
    })

    it('stops typing indicator after timeout', async () => {
      jest.useFakeTimers()
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      
      await user.type(input, 'Test')

      // Fast-forward time to trigger typing stop
      act(() => {
        jest.advanceTimersByTime(1500)
      })

      await waitFor(() => {
        expect(mockP2PChatIntegration.sendTypingIndicator).toHaveBeenCalledWith('peer1', false)
      })

      jest.useRealTimers()
    })
  })

  describe('Message History Synchronization', () => {
    it('loads P2P message history on initialization', async () => {
      const p2pHistory: P2PChatMessage[] = [
        {
          id: 'p2p-hist-1',
          matchId: 'match1',
          senderId: 'peer1',
          text: 'Historical P2P message',
          timestamp: new Date('2024-01-01T09:00:00'),
          read: true,
          encrypted: true
        }
      ]

      mockP2PChatIntegration.getMessageHistory.mockReturnValue(p2pHistory)

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Historical P2P message')).toBeInTheDocument()
      })
    })

    it('synchronizes message history with peer', async () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(mockP2PChatIntegration.synchronizeMessageHistory).toHaveBeenCalledWith('peer1', 'match1')
      })
    })

    it('merges centralized and P2P messages correctly', async () => {
      const p2pHistory: P2PChatMessage[] = [
        {
          id: 'p2p-hist-1',
          matchId: 'match1',
          senderId: 'peer1',
          text: 'P2P message',
          timestamp: new Date('2024-01-01T10:00:30'),
          read: true,
          encrypted: true
        }
      ]

      mockP2PChatIntegration.getMessageHistory.mockReturnValue(p2pHistory)

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        // Should show P2P message only (centralized messages filtered out in P2P mode)
        expect(screen.getByText('P2P message')).toBeInTheDocument()
        expect(screen.getByTitle('Mensagem criptografada')).toBeInTheDocument()
      })
    })
  })

  describe('Connection Status', () => {
    it('shows connecting status during initialization', () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      expect(screen.getByText('• Connecting...')).toBeInTheDocument()
    })

    it('shows connected status after successful initialization', async () => {
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })
    })

    it('shows disconnected status on initialization failure', async () => {
      mockP2PChatIntegration.synchronizeMessageHistory.mockRejectedValue(new Error('Connection failed'))

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Disconnected')).toBeInTheDocument()
      })
    })

    it('shows fallback message when P2P is disconnected', async () => {
      mockP2PChatIntegration.synchronizeMessageHistory.mockRejectedValue(new Error('Connection failed'))

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('⚠️ Conexão P2P perdida. Usando modo centralizado.')).toBeInTheDocument()
      })
    })
  })

  describe('Message Delivery Status', () => {
    it('shows delivery status icons for P2P messages', async () => {
      let messageHandler: P2PChatHandler | null = null
      
      mockP2PChatIntegration.addHandler.mockImplementation((handler) => {
        messageHandler = handler
      })

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(mockP2PChatIntegration.addHandler).toHaveBeenCalled()
      })

      // Simulate receiving a message with delivery status
      const p2pMessage: P2PChatMessage = {
        id: 'p2p-msg-1',
        matchId: 'match1',
        senderId: 'currentUser',
        text: 'Test message',
        timestamp: new Date(),
        read: true,
        encrypted: true,
        deliveryStatus: 'delivered'
      }

      act(() => {
        messageHandler?.onMessage(p2pMessage)
      })

      await waitFor(() => {
        expect(screen.getByTitle('Status: delivered')).toBeInTheDocument()
      })
    })

    it('updates delivery status when notified', async () => {
      let messageHandler: P2PChatHandler | null = null
      
      mockP2PChatIntegration.addHandler.mockImplementation((handler) => {
        messageHandler = handler
      })

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(mockP2PChatIntegration.addHandler).toHaveBeenCalled()
      })

      // First add a message
      const p2pMessage: P2PChatMessage = {
        id: 'p2p-msg-1',
        matchId: 'match1',
        senderId: 'currentUser',
        text: 'Test message',
        timestamp: new Date(),
        read: true,
        encrypted: true,
        deliveryStatus: 'sent'
      }

      act(() => {
        messageHandler?.onMessage(p2pMessage)
      })

      // Then update delivery status
      act(() => {
        messageHandler?.onMessageDeliveryUpdate('p2p-msg-1', 'delivered')
      })

      await waitFor(() => {
        expect(screen.getByTitle('Status: delivered')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('handles message send failure gracefully', async () => {
      const user = userEvent.setup()
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      mockP2PChatIntegration.sendMessage.mockRejectedValue(new Error('Send failed'))

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      const sendButton = screen.getByRole('button', { name: /send/i })

      await user.type(input, 'Test message')
      await user.click(sendButton)

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to send message:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })

    it('handles typing indicator failure gracefully', async () => {
      const user = userEvent.setup()
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      
      mockP2PChatIntegration.sendTypingIndicator.mockRejectedValue(new Error('Typing indicator failed'))

      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('• P2P Connected')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Digite uma mensagem segura...')
      
      await user.type(input, 'T')

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to send P2P typing indicator:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Cleanup', () => {
    it('removes P2P handler on unmount', () => {
      const { unmount } = render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      unmount()

      expect(mockP2PChatIntegration.removeHandler).toHaveBeenCalled()
    })

    it('clears message history on unmatch', async () => {
      const user = userEvent.setup()
      
      render(
        <EnhancedChatWindow
          matchId="match1"
          onBack={jest.fn()}
          enableP2P={true}
          p2pChatIntegration={mockP2PChatIntegration}
          peerId="peer1"
        />
      )

      // Open menu and click unmatch
      const menuButton = screen.getByRole('button', { name: /menu/i })
      await user.click(menuButton)
      
      const unmatchButton = screen.getByText('Desfazer match')
      await user.click(unmatchButton)
      
      const confirmButton = screen.getByText('Desfazer Match')
      await user.click(confirmButton)

      expect(mockP2PChatIntegration.clearMessageHistory).toHaveBeenCalledWith('match1')
      expect(mockStoreState.unmatchUser).toHaveBeenCalledWith('match1')
    })
  })
})