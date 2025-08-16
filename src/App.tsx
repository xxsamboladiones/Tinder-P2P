import React from 'react'
import { useStore } from './store'
import { SwipeDeck } from './components/SwipeDeck'
import { AuthForm } from './components/AuthForm'
import { MatchesList } from './components/MatchesList'
import { ChatWindow } from './components/ChatWindow'
import { ProfileEditor } from './components/ProfileEditor'
import { P2PConfigPanel } from './components/P2PConfigPanel'
import { PrivacyControlPanel } from './components/PrivacyControlPanel'

type Tab = 'discover' | 'matches' | 'profile'

export default function App() {
  const user = useStore(s => s.user)

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50">
      {!user ? (
        <div className="flex items-center justify-center min-h-screen p-4">
          <AuthForm />
        </div>
      ) : (
        <HomeScreen />
      )}
    </div>
  )
}

function HomeScreen() {
  const { user, matches, logout } = useStore()
  const [showProfile, setShowProfile] = React.useState(false)
  const [showProfileEditor, setShowProfileEditor] = React.useState(false)
  const [showP2PConfig, setShowP2PConfig] = React.useState(false)
  const [showPrivacyPanel, setShowPrivacyPanel] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<Tab>('discover')
  const [selectedMatchId, setSelectedMatchId] = React.useState<string | null>(null)

  // Calcular total de mensagens não lidas
  const totalUnreadCount = matches.reduce((total, match) => total + match.unreadCount, 0)

  const handleSelectMatch = (matchId: string) => {
    setSelectedMatchId(matchId)
  }

  const handleBackToMatches = () => {
    setSelectedMatchId(null)
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-lg">
                {user?.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Olá, {user?.name}!</h1>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
              title="Perfil"
            >
              ⚙️
            </button>
            <button
              onClick={logout}
              className="p-2 text-gray-600 hover:text-red-600 transition-colors"
              title="Sair"
            >
              🚪
            </button>
          </div>
        </div>
      </header>

      {/* Profile Panel */}
      {showProfile && (
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-md mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Meu Perfil</h3>
              <button
                onClick={() => {
                  setShowProfileEditor(true)
                  setShowProfile(false)
                }}
                className="text-red-500 hover:text-red-600 text-sm font-medium transition-colors"
              >
                Editar
              </button>
            </div>

            {/* Profile Photos */}
            {user?.photos && user.photos.length > 0 && (
              <div className="mb-4">
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {user.photos.slice(0, 3).map((photo, index) => (
                    <img
                      key={index}
                      src={photo}
                      alt={`Foto ${index + 1}`}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                  ))}
                  {user.photos.length > 3 && (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 text-xs flex-shrink-0">
                      +{user.photos.length - 3}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Nome:</span> {user?.name}</p>
              <p><span className="font-medium">Email:</span> {user?.email}</p>
              {user?.age && <p><span className="font-medium">Idade:</span> {user.age} anos</p>}
              <p><span className="font-medium">Bio:</span> {user?.bio || 'Nenhuma bio ainda'}</p>
              <p><span className="font-medium">Fotos:</span> {user?.photos?.length || 0}/6</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-md mx-auto flex">
          <button
            onClick={() => {
              setActiveTab('discover')
              setSelectedMatchId(null)
            }}
            className={`flex-1 py-4 px-4 text-center font-medium transition-colors ${activeTab === 'discover'
              ? 'text-red-500 border-b-2 border-red-500'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <div className="flex items-center justify-center space-x-1">
              <span>🔥</span>
              <span className="text-sm">Descobrir</span>
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('matches')
              setSelectedMatchId(null)
            }}
            className={`flex-1 py-4 px-4 text-center font-medium transition-colors relative ${activeTab === 'matches'
              ? 'text-red-500 border-b-2 border-red-500'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <div className="flex items-center justify-center space-x-1">
              <span>💬</span>
              <span className="text-sm">Matches</span>
              {totalUnreadCount > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {totalUnreadCount}
                </div>
              )}
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('profile')
              setSelectedMatchId(null)
            }}
            className={`flex-1 py-4 px-4 text-center font-medium transition-colors ${activeTab === 'profile'
              ? 'text-red-500 border-b-2 border-red-500'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <div className="flex items-center justify-center space-x-1">
              <span>👤</span>
              <span className="text-sm">Perfil</span>
            </div>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-md mx-auto w-full">
        {activeTab === 'discover' ? (
          <div className="p-4">
            <SwipeDeck />
          </div>
        ) : activeTab === 'matches' ? (
          selectedMatchId ? (
            <div className="h-full">
              <ChatWindow matchId={selectedMatchId} onBack={handleBackToMatches} />
            </div>
          ) : (
            <div className="p-4">
              <MatchesList onSelectMatch={handleSelectMatch} />
            </div>
          )
        ) : (
          <ProfileView onEdit={() => setShowProfileEditor(true)} />
        )}
      </main>

      {/* Profile Editor Modal */}
      {showProfileEditor && (
        <ProfileEditor onClose={() => setShowProfileEditor(false)} />
      )}

      {/* P2P Configuration Modal */}
      {showP2PConfig && (
        <P2PConfigPanel onClose={() => setShowP2PConfig(false)} />
      )}

      {/* Privacy Control Panel Modal */}
      {showPrivacyPanel && (
        <PrivacyControlPanel onClose={() => setShowPrivacyPanel(false)} />
      )}
    </div>
  )
}

function ProfileView({ onEdit }: { onEdit: () => void }) {
  const { user } = useStore()
  const [showP2PConfig, setShowP2PConfig] = React.useState(false)
  const [showPrivacyPanel, setShowPrivacyPanel] = React.useState(false)

  if (!user) return null

  return (
    <div className="p-4 space-y-6">
      {/* Profile Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="text-center mb-6">
          {user.photos && user.photos.length > 0 ? (
            <img
              src={user.photos[0]}
              alt={user.name}
              className="w-32 h-32 rounded-full object-cover mx-auto mb-4"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-gradient-to-r from-red-500 to-pink-500 flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-4xl font-bold">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <h2 className="text-2xl font-bold text-gray-900">{user.name}</h2>
          {user.age && (
            <p className="text-gray-600">{user.age} anos</p>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={onEdit}
            className="w-full bg-gradient-to-r from-red-500 to-pink-500 text-white py-3 rounded-lg font-semibold hover:from-red-600 hover:to-pink-600 transition-all"
          >
            Editar Perfil
          </button>
          
          <button
            onClick={() => setShowP2PConfig(true)}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 transition-all"
          >
            ⚡ Configurações P2P
          </button>
          
          <button
            onClick={() => setShowPrivacyPanel(true)}
            className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-3 rounded-lg font-semibold hover:from-green-600 hover:to-teal-600 transition-all"
          >
            🔒 Controles de Privacidade
          </button>
        </div>
      </div>

      {/* Bio Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Sobre mim</h3>
        <p className="text-gray-600 leading-relaxed">
          {user.bio || 'Adicione uma bio para contar mais sobre você!'}
        </p>
      </div>

      {/* Photos Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Minhas Fotos</h3>

        {user.photos && user.photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {user.photos.map((photo, index) => (
              <div key={index} className="relative">
                <img
                  src={photo}
                  alt={`Foto ${index + 1}`}
                  className="w-full h-32 object-cover rounded-lg"
                />
                {index === 0 && (
                  <div className="absolute top-2 left-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full">
                    Principal
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📸</div>
            <p>Nenhuma foto adicionada ainda</p>
            <p className="text-sm mt-1">Adicione fotos para atrair mais matches!</p>
          </div>
        )}

        <div className="mt-4 text-center">
          <span className="text-sm text-gray-500">
            {user.photos?.length || 0} de 6 fotos
          </span>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Estatísticas</h3>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-red-500">
              {user.photos?.length || 0}
            </div>
            <div className="text-sm text-gray-600">Fotos</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-500">
              {user.bio?.length || 0}
            </div>
            <div className="text-sm text-gray-600">Caracteres na bio</div>
          </div>
        </div>
      </div>

      {/* P2P Configuration Modal */}
      {showP2PConfig && (
        <P2PConfigPanel onClose={() => setShowP2PConfig(false)} />
      )}

      {/* Privacy Control Panel Modal */}
      {showPrivacyPanel && (
        <PrivacyControlPanel onClose={() => setShowPrivacyPanel(false)} />
      )}
    </div>
  )
}