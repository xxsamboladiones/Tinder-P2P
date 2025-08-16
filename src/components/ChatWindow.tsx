import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { ConfirmationModal } from './ConfirmationModal'
import { P2PChatWindow } from './P2PChatWindow'
import { P2PChatManager } from '../p2p/P2PChatManager'
import { P2PManager } from '../p2p/P2PManager'
import { CryptoManager } from '../p2p/CryptoManager'
import { WebRTCManager } from '../p2p/WebRTCManager'

interface ChatWindowProps {
  matchId: string
  onBack: () => void
}

// P2P Chat Mode Configuration
interface P2PChatConfig {
  enabled: boolean
  peerId?: string
  fallbackToCentralized: boolean
}

export function ChatWindow({ matchId, onBack }: ChatWindowProps) {
  const [newMessage, setNewMessage] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showUnmatchModal, setShowUnmatchModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [p2pChatConfig, setP2pChatConfig] = useState<P2PChatConfig>({
    enabled: false,
    fallbackToCentralized: true
  })
  const [p2pChatManager, setP2pChatManager] = useState<P2PChatManager | null>(null)
  const [isInitializingP2P, setIsInitializingP2P] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasMarkedAsRead = useRef(false)
  
  const { 
    matches, 
    user, 
    sendMessage, 
    markMessagesAsRead, 
    getMessagesForMatch,
    unmatchUser,
    deleteConversation
  } = useStore()

  const match = matches.find(m => m.id === matchId)
  const messages = getMessagesForMatch(matchId)

  // Initialize P2P chat if enabled
  useEffect(() => {
    const initializeP2PChat = async () => {
      if (!p2pChatConfig.enabled || p2pChatManager || isInitializingP2P) {
        return
      }

      setIsInitializingP2P(true)
      
      try {
        console.log('Initializing P2P chat for match:', matchId)
        
        // Initialize P2P components
        const p2pManager = new P2PManager()
        const cryptoManager = new CryptoManager()
        const webrtcManager = new WebRTCManager()
        
        // Create P2P chat manager
        const chatManager = new P2PChatManager(
          p2pManager,
          cryptoManager,
          webrtcManager,
          {
            enableEncryption: true,
            enableTypingIndicators: true,
            enableReadReceipts: true,
            enableMessageHistory: true
          }
        )
        
        // Initialize the chat manager
        await chatManager.initialize()
        
        // Generate peer ID from match (in real app, this would come from match data)
        const peerId = `peer_${match?.userId || 'unknown'}`
        
        setP2pChatManager(chatManager)
        setP2pChatConfig(prev => ({ ...prev, peerId }))
        
        console.log('P2P chat initialized successfully')
      } catch (error) {
        console.error('Failed to initialize P2P chat:', error)
        
        if (p2pChatConfig.fallbackToCentralized) {
          console.log('Falling back to centralized chat')
          setP2pChatConfig(prev => ({ ...prev, enabled: false }))
        }
      } finally {
        setIsInitializingP2P(false)
      }
    }

    initializeP2PChat()
    
    // Cleanup on unmount
    return () => {
      if (p2pChatManager) {
        p2pChatManager.destroy()
      }
    }
  }, [p2pChatConfig.enabled, matchId, match?.userId])

  // Toggle P2P mode
  const toggleP2PMode = () => {
    setP2pChatConfig(prev => ({ 
      ...prev, 
      enabled: !prev.enabled 
    }))
  }





  useEffect(() => {
    // Marcar mensagens como lidas apenas uma vez quando o componente monta
    if (!hasMarkedAsRead.current) {
      markMessagesAsRead(matchId)
      hasMarkedAsRead.current = true
    }
    
    // Reset quando o matchId muda
    return () => {
      hasMarkedAsRead.current = false
    }
  }, [matchId])

  useEffect(() => {
    // Scroll para a última mensagem
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fechar menu quando clicar fora
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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (newMessage.trim()) {
      sendMessage(matchId, newMessage.trim())
      setNewMessage('')
    }
  }

  const handleUnmatch = () => {
    unmatchUser(matchId)
    setShowUnmatchModal(false)
    onBack()
  }

  const handleDeleteConversation = () => {
    deleteConversation(matchId)
    setShowDeleteModal(false)
  }

  if (!match) {
    console.error('Match não encontrado:', { matchId, availableMatches: matches.map(m => m.id) })
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

  // Render P2P chat if enabled and initialized
  if (p2pChatConfig.enabled && p2pChatManager && p2pChatConfig.peerId) {
    return (
      <P2PChatWindow
        matchId={matchId}
        peerId={p2pChatConfig.peerId}
        p2pChatIntegration={p2pChatManager.getChatIntegration()}
        onBack={onBack}
      />
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
              {p2pChatConfig.enabled && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center">
                  🔒 P2P
                </span>
              )}
              {isInitializingP2P && (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full flex items-center">
                  ⏳ Conectando...
                </span>
              )}
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
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border z-10">
              <button
                onClick={() => {
                  toggleP2PMode()
                  setShowMenu(false)
                }}
                className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
              >
                <span>{p2pChatConfig.enabled ? '🔒' : '🌐'}</span>
                <div className="flex flex-col items-start">
                  <span>{p2pChatConfig.enabled ? 'Chat P2P Ativo' : 'Ativar Chat P2P'}</span>
                  <span className="text-xs text-gray-500">
                    {p2pChatConfig.enabled ? 'Criptografia E2E' : 'Mais privacidade'}
                  </span>
                </div>
                {isInitializingP2P && (
                  <div className="ml-auto">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin"></div>
                  </div>
                )}
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(true)
                  setShowMenu(false)
                }}
                className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2 border-t"
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
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">💕</div>
            <p className="text-gray-500">Vocês deram match!</p>
            <p className="text-gray-400 text-sm mt-1">Comece uma conversa</p>
          </div>
        ) : (
          messages.filter(message => message && message.id).map((message) => {
            const isFromUser = message.senderId === user?.id
            return (
              <div
                key={message.id}
                className={`flex ${isFromUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                    isFromUser
                      ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white'
                      : 'bg-white text-gray-900 shadow-sm'
                  }`}
                >
                  <p className="text-sm">{message.text || 'Mensagem vazia'}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isFromUser ? 'text-red-100' : 'text-gray-500'
                    }`}
                  >
                    {(() => {
                      try {
                        return new Date(message.timestamp).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      } catch (error) {
                        return 'Agora'
                      }
                    })()}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="bg-white border-t p-4">
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite uma mensagem..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 disabled:from-gray-300 disabled:to-gray-300 text-white p-2 rounded-full transition-all duration-200 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
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