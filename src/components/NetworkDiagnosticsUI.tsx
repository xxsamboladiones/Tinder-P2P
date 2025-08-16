import React, { useState, useEffect, useCallback } from 'react'
import { NetworkDiagnosticsManager, NetworkDiagnostics, PeerConnectionMetrics, NetworkTroubleshootingResult } from '../p2p/NetworkDiagnosticsManager'
import { P2PManager } from '../p2p/P2PManager'

interface NetworkDiagnosticsUIProps {
  onClose: () => void
  p2pManager?: P2PManager
}

type TabType = 'overview' | 'peers' | 'performance' | 'troubleshooting'

export function NetworkDiagnosticsUI({ onClose, p2pManager }: NetworkDiagnosticsUIProps) {
  const [diagnosticsManager] = useState(() => new NetworkDiagnosticsManager())
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [diagnostics, setDiagnostics] = useState<NetworkDiagnostics | null>(null)
  const [isRunningTroubleshooting, setIsRunningTroubleshooting] = useState(false)
  const [troubleshootingResult, setTroubleshootingResult] = useState<NetworkTroubleshootingResult | null>(null)
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Initialize diagnostics manager
  useEffect(() => {
    if (p2pManager?.libp2pInstance) {
      diagnosticsManager.initialize(p2pManager.libp2pInstance)
    }

    return () => {
      diagnosticsManager.destroy()
    }
  }, [diagnosticsManager, p2pManager])

  // Update diagnostics data
  const updateDiagnostics = useCallback(() => {
    const data = diagnosticsManager.getNetworkDiagnostics()
    setDiagnostics(data)
  }, [diagnosticsManager])

  // Auto-refresh diagnostics
  useEffect(() => {
    updateDiagnostics()
    
    if (autoRefresh) {
      const interval = setInterval(updateDiagnostics, 2000)
      return () => clearInterval(interval)
    }
  }, [updateDiagnostics, autoRefresh])

  // Listen for diagnostics events
  useEffect(() => {
    const handleMetricsUpdate = (data: NetworkDiagnostics) => {
      setDiagnostics(data)
    }

    diagnosticsManager.on('metrics:updated', handleMetricsUpdate)
    
    return () => {
      diagnosticsManager.off('metrics:updated', handleMetricsUpdate)
    }
  }, [diagnosticsManager])

  const runTroubleshooting = async () => {
    setIsRunningTroubleshooting(true)
    try {
      const result = await diagnosticsManager.runNetworkTroubleshooting()
      setTroubleshootingResult(result)
    } catch (error) {
      console.error('Troubleshooting failed:', error)
    } finally {
      setIsRunningTroubleshooting(false)
    }
  }

  const getConnectionQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-green-600 bg-green-100'
      case 'good': return 'text-blue-600 bg-blue-100'
      case 'fair': return 'text-yellow-600 bg-yellow-100'
      case 'poor': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    if (score >= 40) return 'text-orange-600'
    return 'text-red-600'
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  if (!diagnostics) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto mb-4"></div>
            <p>Carregando diagnósticos...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Diagnósticos de Rede P2P</h2>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-gray-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">Auto-atualizar</span>
              </label>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex space-x-1 mt-4">
            {[
              { id: 'overview', label: 'Visão Geral' },
              { id: 'peers', label: 'Peers' },
              { id: 'performance', label: 'Performance' },
              { id: 'troubleshooting', label: 'Diagnóstico' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-red-500 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Network Status Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Status da Rede</p>
                      <p className={`text-lg font-bold ${diagnostics.networkStatus.connected ? 'text-green-600' : 'text-red-600'}`}>
                        {diagnostics.networkStatus.connected ? 'Conectado' : 'Desconectado'}
                      </p>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${diagnostics.networkStatus.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-600">Peers Conectados</p>
                  <p className="text-lg font-bold text-gray-900">{diagnostics.networkStatus.peerCount}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-600">Latência Média</p>
                  <p className="text-lg font-bold text-gray-900">{diagnostics.networkStatus.latency}ms</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">DHT</p>
                      <p className={`text-lg font-bold ${diagnostics.dhtStatus.connected ? 'text-green-600' : 'text-red-600'}`}>
                        {diagnostics.dhtStatus.connected ? 'Ativo' : 'Inativo'}
                      </p>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${diagnostics.dhtStatus.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                </div>
              </div>

              {/* Health Score */}
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Saúde da Rede</h3>
                  <span className={`text-2xl font-bold ${getHealthScoreColor(diagnostics.troubleshooting.healthScore)}`}>
                    {diagnostics.troubleshooting.healthScore}/100
                  </span>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                  <div
                    className={`h-3 rounded-full transition-all duration-300 ${
                      diagnostics.troubleshooting.healthScore >= 80 ? 'bg-green-500' :
                      diagnostics.troubleshooting.healthScore >= 60 ? 'bg-yellow-500' :
                      diagnostics.troubleshooting.healthScore >= 40 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${diagnostics.troubleshooting.healthScore}%` }}
                  />
                </div>

                {diagnostics.troubleshooting.recommendations.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Recomendações:</h4>
                    <ul className="space-y-1">
                      {diagnostics.troubleshooting.recommendations.slice(0, 3).map((rec, index) => (
                        <li key={index} className="text-sm text-gray-600 flex items-start">
                          <span className="text-yellow-500 mr-2">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* DHT Status */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Status DHT</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Tabela de Roteamento</p>
                    <p className="text-lg font-bold text-gray-900">{diagnostics.dhtStatus.routingTableSize}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Peers Conhecidos</p>
                    <p className="text-lg font-bold text-gray-900">{diagnostics.dhtStatus.knownPeers}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Consultas Ativas</p>
                    <p className="text-lg font-bold text-gray-900">{diagnostics.dhtStatus.activeQueries}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Último Bootstrap</p>
                    <p className="text-sm text-gray-900">
                      {diagnostics.dhtStatus.lastBootstrap 
                        ? new Date(diagnostics.dhtStatus.lastBootstrap).toLocaleTimeString()
                        : 'Nunca'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'peers' && (
            <div className="space-y-6">
              {/* Peer Connection Visualization */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Conexões de Peers</h3>
                
                {diagnostics.peerMetrics.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Nenhum peer conectado</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {diagnostics.peerMetrics.map((peer) => (
                      <div
                        key={peer.peerId}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                          selectedPeer === peer.peerId ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedPeer(selectedPeer === peer.peerId ? null : peer.peerId)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${
                              peer.connectionState === 'connected' ? 'bg-green-500' :
                              peer.connectionState === 'connecting' ? 'bg-yellow-500' :
                              peer.connectionState === 'disconnected' ? 'bg-gray-500' : 'bg-red-500'
                            }`} />
                            <div>
                              <p className="font-medium text-gray-900">
                                {peer.peerId.slice(0, 12)}...{peer.peerId.slice(-8)}
                              </p>
                              <p className="text-sm text-gray-600 capitalize">{peer.connectionState}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConnectionQualityColor(peer.connectionQuality)}`}>
                              {peer.connectionQuality}
                            </span>
                            <span className="text-sm text-gray-600">{peer.latency}ms</span>
                          </div>
                        </div>

                        {selectedPeer === peer.peerId && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <p className="text-xs font-medium text-gray-600">Duração da Conexão</p>
                                <p className="text-sm text-gray-900">{formatDuration(peer.connectionDuration)}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-600">Tentativas de Reconexão</p>
                                <p className="text-sm text-gray-900">{peer.reconnectAttempts}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-600">Pacotes Enviados</p>
                                <p className="text-sm text-gray-900">{peer.packetsSent}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-600">Pacotes Recebidos</p>
                                <p className="text-sm text-gray-900">{peer.packetsReceived}</p>
                              </div>
                            </div>
                            
                            {peer.protocols.length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-gray-600 mb-1">Protocolos:</p>
                                <div className="flex flex-wrap gap-1">
                                  {peer.protocols.map((protocol, index) => (
                                    <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                      {protocol}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {peer.multiaddrs.length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-gray-600 mb-1">Endereços:</p>
                                <div className="space-y-1">
                                  {peer.multiaddrs.map((addr, index) => (
                                    <p key={index} className="text-xs text-gray-500 font-mono break-all">
                                      {addr}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-6">
              {/* Performance Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Métricas de Rede</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-600">Latência Média:</span>
                      <span className="text-sm text-gray-900">{diagnostics.performance.averageLatency}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-600">Taxa de Sucesso de Conexão:</span>
                      <span className="text-sm text-gray-900">{diagnostics.performance.connectionSuccess.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-600">Taxa de Entrega de Mensagens:</span>
                      <span className="text-sm text-gray-900">{diagnostics.performance.messageDeliveryRate.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Largura de Banda</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-600">Upload Total:</span>
                      <span className="text-sm text-gray-900">{formatBytes(diagnostics.performance.totalBandwidth.up)}/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-600">Download Total:</span>
                      <span className="text-sm text-gray-900">{formatBytes(diagnostics.performance.totalBandwidth.down)}/s</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection Quality Distribution */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribuição da Qualidade das Conexões</h3>
                <div className="grid grid-cols-4 gap-4">
                  {['excellent', 'good', 'fair', 'poor'].map((quality) => {
                    const count = diagnostics.peerMetrics.filter(p => p.connectionQuality === quality).length
                    const percentage = diagnostics.peerMetrics.length > 0 ? (count / diagnostics.peerMetrics.length) * 100 : 0
                    
                    return (
                      <div key={quality} className="text-center">
                        <div className={`w-full h-20 rounded-lg flex items-end justify-center ${getConnectionQualityColor(quality)}`}>
                          <div
                            className="w-full bg-current opacity-30 rounded-lg transition-all duration-300"
                            style={{ height: `${Math.max(percentage, 5)}%` }}
                          />
                        </div>
                        <p className="text-sm font-medium text-gray-900 mt-2 capitalize">{quality}</p>
                        <p className="text-xs text-gray-600">{count} peers</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'troubleshooting' && (
            <div className="space-y-6">
              {/* Troubleshooting Controls */}
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Diagnóstico de Problemas</h3>
                  <button
                    onClick={runTroubleshooting}
                    disabled={isRunningTroubleshooting}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isRunningTroubleshooting ? 'Executando...' : 'Executar Diagnóstico'}
                  </button>
                </div>

                {troubleshootingResult && (
                  <div className="space-y-4">
                    {/* Health Score */}
                    <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
                      <span className="font-medium text-gray-900">Pontuação de Saúde:</span>
                      <span className={`text-xl font-bold ${getHealthScoreColor(troubleshootingResult.healthScore)}`}>
                        {troubleshootingResult.healthScore}/100
                      </span>
                    </div>

                    {/* Issues */}
                    {troubleshootingResult.issues.length > 0 && (
                      <div className="bg-white rounded-lg border p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Problemas Detectados:</h4>
                        <div className="space-y-2">
                          {troubleshootingResult.issues.map((issue, index) => (
                            <div key={index} className={`p-3 rounded-lg border-l-4 ${
                              issue.severity === 'critical' ? 'bg-red-50 border-red-500' :
                              issue.severity === 'high' ? 'bg-orange-50 border-orange-500' :
                              issue.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                              'bg-blue-50 border-blue-500'
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900 capitalize">{issue.type.replace('_', ' ')}</span>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  issue.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                  issue.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                                  issue.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {issue.severity}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">{issue.description}</p>
                              {issue.affectedPeers && issue.affectedPeers.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Peers afetados: {issue.affectedPeers.length}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {troubleshootingResult.recommendations.length > 0 && (
                      <div className="bg-white rounded-lg border p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Recomendações:</h4>
                        <ul className="space-y-2">
                          {troubleshootingResult.recommendations.map((rec, index) => (
                            <li key={index} className="flex items-start text-sm text-gray-600">
                              <span className="text-blue-500 mr-2 mt-0.5">•</span>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Auto-fix Actions */}
                    {troubleshootingResult.canAutoFix && troubleshootingResult.autoFixActions.length > 0 && (
                      <div className="bg-white rounded-lg border p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Correções Automáticas Disponíveis:</h4>
                        <div className="space-y-2">
                          {troubleshootingResult.autoFixActions.map((action, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-green-50 rounded">
                              <span className="text-sm text-gray-700">{action}</span>
                              <button className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors">
                                Aplicar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Current Issues */}
              {diagnostics.troubleshooting.issues.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Problemas Atuais</h3>
                  <div className="space-y-3">
                    {diagnostics.troubleshooting.issues.map((issue, index) => (
                      <div key={index} className={`p-3 rounded-lg border-l-4 ${
                        issue.severity === 'critical' ? 'bg-red-50 border-red-500' :
                        issue.severity === 'high' ? 'bg-orange-50 border-orange-500' :
                        issue.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                        'bg-blue-50 border-blue-500'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 capitalize">{issue.type.replace('_', ' ')}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(issue.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{issue.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Última atualização: {new Date().toLocaleTimeString()}
            </div>
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