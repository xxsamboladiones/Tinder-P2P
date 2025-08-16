import React, { useState } from 'react'
import { useStore } from '../store'
import { ConfirmationModal } from './ConfirmationModal'

interface MatchesListProps {
  onSelectMatch: (matchId: string) => void
}

export function MatchesList({ onSelectMatch }: MatchesListProps) {
  const { matches, clearCorruptedData, unmatchUser, deleteConversation } = useStore()
  const [showUnmatchModal, setShowUnmatchModal] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null)

  // Verificar se matches é um array válido
  if (!Array.isArray(matches)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <div className="text-6xl mb-4">⚠️</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Erro ao carregar matches</h3>
        <p className="text-gray-500 text-sm mb-4">
          Dados corrompidos detectados
        </p>
        <button
          onClick={clearCorruptedData}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          Limpar dados e reiniciar
        </button>
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <div className="text-6xl mb-4">💔</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum match ainda</h3>
        <p className="text-gray-500 text-sm">
          Continue fazendo swipe para encontrar pessoas incríveis!
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {matches.filter(match => match && match.id).map((match, index) => (
        <div
          key={match.id || `match-${index}`}
          onClick={() => onSelectMatch(match.id)}
          className="flex items-center p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-100"
        >
          {/* Profile Photo */}
          <div className="relative">
            <img
              src={match.photo}
              alt={match.name}
              className="w-12 h-12 rounded-full object-cover"
            />
            {match.unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {match.unreadCount}
              </div>
            )}
          </div>

          {/* Match Info */}
          <div className="flex-1 ml-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{match.name}</h4>
              <span className="text-xs text-gray-500">
                {formatTime(match.lastMessage?.timestamp || match.matchedAt || new Date())}
              </span>
            </div>

            <p className="text-sm text-gray-600 truncate">
              {match.lastMessage?.text || `Vocês deram match!`}
            </p>
          </div>

          {/* Options Menu */}
          <div className="ml-2 flex items-center space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowDeleteModal(match.id)
              }}
              className="p-2 text-gray-400 hover:text-orange-500 transition-colors"
              title="Apagar conversa"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowUnmatchModal(match.id)
              }}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              title="Desfazer match"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      ))}

      {/* Confirmation Modals */}
      {showUnmatchModal && (
        <ConfirmationModal
          isOpen={true}
          title="Desfazer Match"
          message={`Tem certeza que deseja desfazer o match com ${matches.find(m => m.id === showUnmatchModal)?.name}? Esta ação não pode ser desfeita e toda a conversa será perdida.`}
          confirmText="Desfazer Match"
          cancelText="Cancelar"
          type="danger"
          onConfirm={() => {
            unmatchUser(showUnmatchModal)
            setShowUnmatchModal(null)
          }}
          onCancel={() => setShowUnmatchModal(null)}
        />
      )}

      {showDeleteModal && (
        <ConfirmationModal
          isOpen={true}
          title="Apagar Conversa"
          message={`Deseja apagar toda a conversa com ${matches.find(m => m.id === showDeleteModal)?.name}? O match será mantido, mas todas as mensagens serão removidas.`}
          confirmText="Apagar Conversa"
          cancelText="Cancelar"
          type="warning"
          onConfirm={() => {
            deleteConversation(showDeleteModal)
            setShowDeleteModal(null)
          }}
          onCancel={() => setShowDeleteModal(null)}
        />
      )}
    </div>
  )
}

function formatTime(date: Date | string | undefined | null): string {
  try {
    // Verificar se a data existe
    if (!date) {
      return 'agora'
    }

    // Garantir que temos um objeto Date válido
    let dateObj: Date

    if (typeof date === 'string') {
      dateObj = new Date(date)
    } else if (date instanceof Date) {
      dateObj = date
    } else {
      return 'agora'
    }

    // Verificar se a data é válida
    if (!dateObj || isNaN(dateObj.getTime())) {
      return 'agora'
    }

    const now = new Date()
    const diff = now.getTime() - dateObj.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`

    return dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch (error) {
    console.error('Erro ao formatar tempo:', error, date)
    return 'agora'
  }
}