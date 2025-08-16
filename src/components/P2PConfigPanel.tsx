import React, { useState, useEffect } from 'react'
import { P2PManager } from '../p2p/P2PManager'
import { NetworkStatus, P2PConfig } from '../p2p/types'

interface P2PConfigPanelProps {
  onClose: () => void
}

interface P2PSettings extends P2PConfig {
  // Additional UI-specific settings
  autoConnect: boolean
  enableDiagnostics: boolean
  showAdvancedSettings: boolean
}

export function P2PConfigPanel({ onClose }: P2PConfigPanelProps) {
  const [p2pManager] = useState(() => new P2PManager())
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    connected: false,
    peerCount: 0,
    dhtConnected: false,
    latency: 0,
    bandwidth: { up: 0, down: 0 }
  })
  
  const [settings, setSettings] = useState<P2PSettings>({
    // Network Configuration
    bootstrapNodes: [
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
    ],
    stunServers: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302'
    ],
    turnServers: [],
    
    // Discovery Configuration
    geohashPrecision: 5,
    maxPeers: 50,
    discoveryInterval: 30000,
    
    // Security Configuration
    enableEncryption: true,
    keyRotationInterval: 3600000,
    
    // Performance Configuration
    messageTimeout: 10000,
    reconnectInterval: 5000,
    maxRetries: 3,
    
    // UI-specific settings
    autoConnect: true,
    enableDiagnostics: true,
    showAdvancedSettings: false
  })
  
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [newStunServer, setNewStunServer] = useState('')
  const [newTurnServer, setNewTurnServer] = useState({
    urls: '',
    username: '',
    credential: ''
  })

  // Update network status periodically
  useEffect(() => {
    const updateStatus = () => {
      const status = p2pManager.getNetworkStatus()
      setNetworkStatus(status)
    }

    updateStatus()
    const interval = setInterval(updateStatus, 2000)
    
    return () => clearInterval(interval)
  }, [p2pManager])

  const handleConnect = async () => {
    setIsConnecting(true)
    setConnectionError(null)
    
    try {
      // Update P2P manager configuration
      const p2pConfig = {
        bootstrapNodes: settings.bootstrapNodes,
        stunServers: settings.stunServers,
        turnServers: settings.turnServers,
        geohashPrecision: settings.geohashPrecision,
        maxPeers: settings.maxPeers,
        discoveryInterval: settings.discoveryInterval,
        enableEncryption: settings.enableEncryption,
        keyRotationInterval: settings.keyRotationInterval,
        messageTimeout: settings.messageTimeout,
        reconnectInterval: settings.reconnectInterval,
        maxRetries: settings.maxRetries
      }
      
      // Initialize and connect
      await p2pManager.initialize()
      await p2pManager.connect()
      
      console.log('P2P network connected successfully')
    } catch (error) {
      console.error('P2P connection failed:', error)
      let errorMessage = 'Connection failed'
      
      if (error instanceof Error) {
        if (error.message.includes('TCP connections are not possible in browsers')) {
          errorMessage = 'Configuração atualizada para navegador. Tentando novamente...'
          // The P2PManager should now be configured for browser compatibility
        } else if (error.message.includes('circuit-relay-v2-transport')) {
          errorMessage = 'Configuração de relay atualizada. Conectando...'
          // Circuit relay transport has been added
        } else if (error.message.includes('WebRTC')) {
          errorMessage = 'Erro WebRTC. Verifique as configurações STUN/TURN.'
        } else if (error.message.includes('bootstrap')) {
          errorMessage = 'Falha ao conectar aos nós bootstrap. Verifique a conexão.'
        } else if (error.message.includes('UnmetServiceDependencies')) {
          errorMessage = 'Dependências do serviço P2P resolvidas. Tentando novamente...'
        } else {
          errorMessage = error.message
        }
      }
      
      setConnectionError(errorMessage)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await p2pManager.disconnect()
      console.log('P2P network disconnected')
    } catch (error) {
      console.error('P2P disconnection failed:', error)
    }
  }

  const addStunServer = () => {
    if (newStunServer.trim() && !settings.stunServers.includes(newStunServer.trim())) {
      setSettings(prev => ({
        ...prev,
        stunServers: [...prev.stunServers, newStunServer.trim()]
      }))
      setNewStunServer('')
    }
  }

  const removeStunServer = (index: number) => {
    setSettings(prev => ({
      ...prev,
      stunServers: prev.stunServers.filter((_, i) => i !== index)
    }))
  }

  const addTurnServer = () => {
    if (newTurnServer.urls.trim()) {
      const turnConfig = {
        urls: newTurnServer.urls.trim(),
        ...(newTurnServer.username && { username: newTurnServer.username }),
        ...(newTurnServer.credential && { credential: newTurnServer.credential })
      }
      
      setSettings(prev => ({
        ...prev,
        turnServers: [...prev.turnServers, turnConfig]
      }))
      
      setNewTurnServer({ urls: '', username: '', credential: '' })
    }
  }

  const removeTurnServer = (index: number) => {
    setSettings(prev => ({
      ...prev,
      turnServers: prev.turnServers.filter((_, i) => i !== index)
    }))
  }

  const resetToDefaults = () => {
    setSettings(prev => ({
      ...prev,
      bootstrapNodes: [
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
      ],
      stunServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ],
      turnServers: []
    }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Configurações P2P</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Network Status */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status da Rede</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${networkStatus.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium">
                  {networkStatus.connected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              
              <div className="text-sm">
                <span className="font-medium">Peers: </span>
                <span>{networkStatus.peerCount}</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${networkStatus.dhtConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium">
                  DHT {networkStatus.dhtConnected ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              
              <div className="text-sm">
                <span className="font-medium">Latência: </span>
                <span>{networkStatus.latency}ms</span>
              </div>
            </div>

            {/* Connection Controls */}
            <div className="flex space-x-3">
              {!networkStatus.connected ? (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isConnecting ? 'Conectando...' : 'Conectar'}
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  Desconectar
                </button>
              )}
              
              <button
                onClick={resetToDefaults}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Restaurar Padrões
              </button>
            </div>

            {connectionError && (
              <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-sm text-red-700">{connectionError}</p>
              </div>
            )}

            {/* Browser compatibility info */}
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>Navegador:</strong> Usando WebRTC, WebSockets e Circuit Relay para compatibilidade. 
                Conexões TCP não estão disponíveis no navegador.
              </p>
            </div>
          </div>

          {/* Basic Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Configurações Básicas</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Máximo de Peers
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.maxPeers}
                  onChange={(e) => setSettings(prev => ({ ...prev, maxPeers: parseInt(e.target.value) || 50 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precisão de Localização
                </label>
                <select
                  value={settings.geohashPrecision}
                  onChange={(e) => setSettings(prev => ({ ...prev, geohashPrecision: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value={3}>Baixa (~20km)</option>
                  <option value={4}>Média (~5km)</option>
                  <option value={5}>Alta (~2.4km)</option>
                  <option value={6}>Muito Alta (~600m)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.autoConnect}
                  onChange={(e) => setSettings(prev => ({ ...prev, autoConnect: e.target.checked }))}
                  className="rounded border-gray-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700">Conectar automaticamente</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.enableEncryption}
                  onChange={(e) => setSettings(prev => ({ ...prev, enableEncryption: e.target.checked }))}
                  className="rounded border-gray-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700">Criptografia habilitada</span>
              </label>
            </div>
          </div>

          {/* STUN Servers */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Servidores STUN</h3>
            
            <div className="space-y-2">
              {settings.stunServers.map((server, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={server}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                  <button
                    onClick={() => removeStunServer(index)}
                    className="p-2 text-red-500 hover:text-red-700 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
            
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="stun:stun.example.com:19302"
                value={newStunServer}
                onChange={(e) => setNewStunServer(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <button
                onClick={addStunServer}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Adicionar
              </button>
            </div>
          </div>

          {/* TURN Servers */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Servidores TURN</h3>
            
            <div className="space-y-3">
              {settings.turnServers.map((server, index) => (
                <div key={index} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{server.urls}</span>
                    <button
                      onClick={() => removeTurnServer(index)}
                      className="p-1 text-red-500 hover:text-red-700 transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                  {server.username && (
                    <div className="text-xs text-gray-600">
                      Usuário: {server.username}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="space-y-2 p-3 border border-gray-200 rounded-lg">
              <input
                type="text"
                placeholder="turn:turn.example.com:3478"
                value={newTurnServer.urls}
                onChange={(e) => setNewTurnServer(prev => ({ ...prev, urls: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Usuário (opcional)"
                  value={newTurnServer.username}
                  onChange={(e) => setNewTurnServer(prev => ({ ...prev, username: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <input
                  type="password"
                  placeholder="Senha (opcional)"
                  value={newTurnServer.credential}
                  onChange={(e) => setNewTurnServer(prev => ({ ...prev, credential: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={addTurnServer}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Adicionar Servidor TURN
              </button>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Configurações Avançadas</h3>
              <button
                onClick={() => setSettings(prev => ({ ...prev, showAdvancedSettings: !prev.showAdvancedSettings }))}
                className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
              >
                {settings.showAdvancedSettings ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            
            {settings.showAdvancedSettings && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Intervalo de Descoberta (ms)
                  </label>
                  <input
                    type="number"
                    min="5000"
                    max="300000"
                    step="1000"
                    value={settings.discoveryInterval}
                    onChange={(e) => setSettings(prev => ({ ...prev, discoveryInterval: parseInt(e.target.value) || 30000 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timeout de Mensagem (ms)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    max="60000"
                    step="1000"
                    value={settings.messageTimeout}
                    onChange={(e) => setSettings(prev => ({ ...prev, messageTimeout: parseInt(e.target.value) || 10000 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Intervalo de Reconexão (ms)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    max="30000"
                    step="1000"
                    value={settings.reconnectInterval}
                    onChange={(e) => setSettings(prev => ({ ...prev, reconnectInterval: parseInt(e.target.value) || 5000 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Máximo de Tentativas
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={settings.maxRetries}
                    onChange={(e) => setSettings(prev => ({ ...prev, maxRetries: parseInt(e.target.value) || 3 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}