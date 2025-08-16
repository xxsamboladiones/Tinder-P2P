import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { ConfirmationModal } from './ConfirmationModal'
import { P2PChatIntegration, P2PChatMessage, TypingIndicator, ReadReceipt, P2PChatHandler } from '../p2p/P2PChatIntegration'

interface P2PChatWindowProps {
  matchId: string
  peerId: string
  p2pChatIntegration: P2PChatIntegration
  onBack: () => void
}

interface TypingState {
  [peerId: string]: boolean
}

export function P2PChatWindow({ matchId, peerId, p2pChatIntegration, onBack }: P2PChatWindowProps) {
  const [newMessage, setNewMessage] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showUnmatchModal, setShowUnmatchModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [typingStates, setTypingStates] = useState<TypingState>({})
  const [p2pMessages, setP2pMessages] = useState<P2PChatMessage[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasMarkedAsRead = useRef(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout>()
  const lastTypingTime = useRef<number>(0)
  
  const { 
    matches, 
    user, 
    unmatchUser,
    deleteConversation
  } = useStore()

  const match = matches.find(m => m.id === matchId)

  // P2P Chat Handler
  const chatHandler: P2PChatHandler = useCallback({
    onMessage: (message: P2PChatMessage) => {
      if (message.matchId === matchId) {
        setP2pMessages(prev => {
          // Check if message already exists
          if (prev.some(msg => msg.id === message.id)) {
            return prev
          }
          
          // Add new message and sort by timestamp
          const updated = [...prev, message].sort((a, b) => 
            a.timestamp.getTime() - b.timestamp.getTime()
          )
          return updated
        })
      }
    },
    
    onTypingIndicator: (indicator: TypingIndicator) => {
      if (indicator.peerId === peerId) {
        setTypingStates(prev => ({
          ...prev,
          [indicator.peerId]: indicator.isTyping
        }))
      }
    },
    
    onReadReceipt: (receipt: ReadReceipt) => {
      console.log('Read receipt received:', receipt)
      // Update message read status in UI if needed
    },
    
    onMessageDeliveryUpdate: (messageId: string, status: 'sent' | 'delivered' | 'failed') => {
      setP2pMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, deliveryStatus: status }
          : msg
      ))
    }
  }, [matchId, peerId])

  // Initialize P2P chat integration
  useEffect(() => {
    const initializeP2PChat = async () => {
      try {
        await p2pChatIntegration.initialize()
        p2pChatIntegration.addHandler(chatHandler)
        
        // Load existing message history
        const history = p2pChatIntegration.getMessageHistory(matchId)
        setP2pMessages(history)
        
        // Synchronize message history with peer
        await p2pChatIntegration.synchronizeMessageHistory(peerId, matchId)
        
        setConnectionStatus('connected')
      } catch (error) {
        console.error('Failed to initialize P2P chat:', error)
        setConnectionStatus('disconnected')
      }
    }

    initializeP2PChat()

    return () => {
      p2pChatIntegration.removeHandler(chatHandler)
    }
  }, [p2pChatIntegration, chatHandler, matchId, peerId])

  // Mark messages as read when component mounts or messages change
  useEffect(() => {
    const markAsRead = async () => {
      if (!hasMarkedAsRead.current && p2pMessages.length > 0) {
        try {
          await p2pChatIntegration.markMessagesAsRead(matchId, peerId)
          hasMarkedAsRead.current = true
        } catch (error) {
          console.error('Failed to mark messages as read:', error)
        }
      }
    }

    markAsRead()
    
    // Reset when matchId changes
    return () => {
      hasMarkedAsRead.current = false
    }
  }, [p2pChatIntegration, matchId, peerId, p2pMessages])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [p2pMessages])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMenu) {
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  // Handle typing indicators
  const handleTypingStart = useCallback(async () => {
    const now = Date.now()
    lastTypingTime.current = now
    
    if (!isTyping) {
      setIsTyping(true)
      try {
        await p2pChatIntegration.sendTypingIndicator(peerId, true)
      } catch (error) {
        console.warn('Failed to send typing indicator:', error)
      }
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    
    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(async () => {
      if (Date.now() - lastTypingTime.current >= 1000) {
        setIsTyping(false)
        try {
          await p2pChatIntegration.sendTypingIndicator(peerId, false)
        } catch (error) {
          console.warn('Failed to send typing stop indicator:', error)
        }
      }
    }, 1000)
  }, [p2pChatIntegration, peerId, isTyping])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    const messageText = newMessage.trim()
    setNewMessage('')
    
    // Stop typing indicator
    if (isTyping) {
      setIsTyping(false)
      try {
        await p2pChatIntegration.sendTypingIndicator(peerId, false)
      } catch (error) {
        console.warn('Failed to send typing stop indicator:', error)
      }
    }

    try {
      await p2pChatIntegration.sendMessage(matchId, peerId, messageText)
    } catch (error) {
      console.error('Failed to send P2P message:', error)
      // TODO: Show error message to user
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
    handleTypingStart()
  }

  const handleUnmatch = () => {
    unmatchUser(matchId)
    p2pChatIntegration.clearMessageHistory(matchId)
    setShowUnmatchModal(false)
    onBack()
  }

  const handleDeleteConversation = () => {
    deleteConversation(matchId)
    p2pChatIntegration.clearMessageHistory(matchId)
    setShowDeleteModal(false)
  }

  const getDeliveryStatusIcon = (status?: string) => {
    switch (status) {
      case 'sent':
        return '✓'
      case 'delivered':
        return '✓✓'
      case 'failed':
        return '❌'
      default:
        return '⏳'
    }
  }

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-500'
      case 'connecting':
        return 'text-yellow-500'
      case 'disconnected':
        return 'text-red-500'
      default:
        return 'text-gray-500'
    }
  }

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'P2P Connected'
      case 'connecting':
        return 'Connecting...'
      case 'disconnected':
        return 'Disconnected'
      default:
        return 'Unknown'
    }
  }

  if (!match) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b px-4 py-3 flex items-center">
          <button
            onClick={onBack}
            className="mr-3 p-1 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="font-semibold text-gray-900">Erro</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-gray-500 mb-2">Match não encontrado</p>
            <p className="text-sm text-gray-400">ID: {matchId}</p>
            <button
              onClick={onBack}
              className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="mr-3 p-1 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <img
            src={match.photo}
            alt={match.name}
            className="w-10 h-10 rounded-full object-cover mr-3"
          />
          
          <div>
            <h3 className="font-semibold text-gray-900">{match.name}</h3>
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-500">
                Match em {new Date(match.matchedAt).toLocaleDateString('pt-BR')}
              </p>
              <span className={`text-xs ${getConnectionStatusColor()}`}>
                • {getConnectionStatusText()}
              </span>
            </div>
          </div>
        </div>

        {/* Menu Button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border z-10">
              <button
                onClick={() => {
                  setShowDeleteModal(true)
                  setShowMenu(false)
                }}
                className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
              >
                <span>🗑️</span>
                <span>Apagar conversa</span>
              </button>
              <button
                onClick={() => {
                  setShowUnmatchModal(true)
                  setShowMenu(false)
                }}
                className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 border-t"
              >
                <span>💔</span>
                <span>Desfazer match</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {p2pMessages.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">💕</div>
            <p className="text-gray-500">Vocês deram match!</p>
            <p className="text-gray-400 text-sm mt-1">Comece uma conversa segura via P2P</p>
            {connectionStatus === 'connected' && (
              <div className="mt-2 text-xs text-green-600 flex items-center justify-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Conexão P2P estabelecida
              </div>
            )}
          </div>
        ) : (
          p2pMessages.map((message) => {
            const isFromUser = message.senderId === user?.id || message.senderId === peerId // Handle both user ID and peer ID
            const isOwnMessage = message.senderId !== peerId
            
            return (
              <div
                key={message.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                    isOwnMessage
                      ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white'
                      : 'bg-white text-gray-900 shadow-sm'
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                  <div className={`flex items-center justify-between text-xs mt-1 ${
                    isOwnMessage ? 'text-red-100' : 'text-gray-500'
                  }`}>
                    <span>
                      {message.timestamp.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    {isOwnMessage && (
                      <div className="flex items-center space-x-1">
                        {message.encrypted && (
                          <span title="Mensagem criptografada">🔒</span>
                        )}
                        <span title={`Status: ${message.deliveryStatus || 'pending'}`}>
                          {getDeliveryStatusIcon(message.deliveryStatus)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
        
        {/* Typing Indicators */}
        {Object.entries(typingStates).map(([peerIdTyping, typing]) => 
          typing && peerIdTyping === peerId ? (
            <div key={`typing-${peerIdTyping}`} className="flex justify-start">
              <div className="bg-gray-200 text-gray-600 px-4 py-2 rounded-2xl text-sm">
                <span className="flex items-center">
                  <span className="mr-2">{match.name} está digitando</span>
                  <div className="flex space-x-1">
                    <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce"></div>
                    <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </span>
              </div>
            </div>
          ) : null
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="bg-white border-t p-4">
        {connectionStatus === 'disconnected' && (
          <div className="mb-2 text-center text-sm text-red-600 bg-red-50 py-2 px-4 rounded-lg">
            ⚠️ Conexão P2P perdida. Tentando reconectar...
          </div>
        )}
        
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            placeholder={connectionStatus === 'connected' ? "Digite uma mensagem segura..." : "Aguardando conexão..."}
            disabled={connectionStatus !== 'connected'}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || connectionStatus !== 'connected'}
            className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 disabled:from-gray-300 disabled:to-gray-300 text-white p-2 rounded-full transition-all duration-200 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
        
        {connectionStatus === 'connected' && (
          <div className="mt-2 text-xs text-gray-500 text-center">
            🔒 Mensagens criptografadas end-to-end via P2P
          </div>
        )}
      </div>

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={showUnmatchModal}
        title="Desfazer Match"
        message={`Tem certeza que deseja desfazer o match com ${match.name}? Esta ação não pode ser desfeita e toda a conversa será perdida.`}
        confirmText="Desfazer Match"
        cancelText="Cancelar"
        type="danger"
        onConfirm={handleUnmatch}
        onCancel={() => setShowUnmatchModal(false)}
      />

      <ConfirmationModal
        isOpen={showDeleteModal}
        title="Apagar Conversa"
        message={`Deseja apagar toda a conversa com ${match.name}? O match será mantido, mas todas as mensagens serão removidas.`}
        confirmText="Apagar Conversa"
        cancelText="Cancelar"
        type="warning"
        onConfirm={handleDeleteConversation}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  )
}