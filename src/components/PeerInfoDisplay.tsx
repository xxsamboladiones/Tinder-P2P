import React, { useState, useEffect } from 'react'
import { PeerInfo } from '../p2p/types'

interface PeerInfoDisplayProps {
  peers: PeerInfo[]
  onRefresh?: () => void
  isLoading?: boolean
}

interface PeerStats {
  totalPeers: number
  connectedPeers: number
  averageLatency: number
  geohashDistribution: Record<string, number>
  protocolDistribution: Record<string, number>
}

export function PeerInfoDisplay({ peers, onRefresh, isLoading = false }: PeerInfoDisplayProps) {
  const [selectedPeer, setSelectedPeer] = useState<PeerInfo | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [stats, setStats] = useState<PeerStats>({
    totalPeers: 0,
    connectedPeers: 0,
    averageLatency: 0,
    geohashDistribution: {},
    protocolDistribution: {}
  })

  // Calculate peer statistics
  useEffect(() => {
    const geohashDist: Record<string, number> = {}
    const protocolDist: Record<string, number> = {}
    
    peers.forEach(peer => {
      // Count geohash distribution
      const geohash = peer.metadata.geohash.substring(0, 3) // First 3 chars for broader area
      geohashDist[geohash] = (geohashDist[geohash] || 0) + 1
      
      // Count protocol distribution
      peer.protocols.forEach(protocol => {
        protocolDist[protocol] = (protocolDist[protocol] || 0) + 1
      })
    })

    setStats({
      totalPeers: peers.length,
      connectedPeers: peers.length, // Assuming all displayed peers are connected
      averageLatency: 0, // Would need actual latency data
      geohashDistribution: geohashDist,
      protocolDistribution: protocolDist
    })
  }, [peers])

  const formatTimestamp = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d atrás`
    if (hours > 0) return `${hours}h atrás`
    if (minutes > 0) return `${minutes}m atrás`
    return 'Agora'
  }

  const getConnectionQuality = (peer: PeerInfo) => {
    const now = new Date()
    const timeSinceLastSeen = now.getTime() - peer.metadata.lastSeen.getTime()
    const minutesAgo = timeSinceLastSeen / 60000

    if (minutesAgo < 5) return { quality: 'excellent', color: 'bg-green-500', label: 'Excelente' }
    if (minutesAgo < 15) return { quality: 'good', color: 'bg-yellow-500', label: 'Boa' }
    if (minutesAgo < 60) return { quality: 'fair', color: 'bg-orange-500', label: 'Regular' }
    return { quality: 'poor', color: 'bg-red-500', label: 'Ruim' }
  }

  const getAgeRangeLabel = (ageRange: [number, number]) => {
    return `${ageRange[0]}-${ageRange[1]} anos`
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Informações dos Peers</h3>
          <div className="flex items-center space-x-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
                title="Atualizar"
              >
                {isLoading ? '🔄' : '↻'}
              </button>
            )}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
            >
              {showDetails ? 'Ocultar Detalhes' : 'Mostrar Detalhes'}
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Summary */}
      <div className="px-4 py-3 bg-gray-50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">{stats.totalPeers}</div>
            <div className="text-xs text-gray-600">Total de Peers</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{stats.connectedPeers}</div>
            <div className="text-xs text-gray-600">Conectados</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600">
              {Object.keys(stats.geohashDistribution).length}
            </div>
            <div className="text-xs text-gray-600">Regiões</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600">
              {Object.keys(stats.protocolDistribution).length}
            </div>
            <div className="text-xs text-gray-600">Protocolos</div>
          </div>
        </div>
      </div>

      {/* Peer List */}
      <div className="max-h-96 overflow-y-auto">
        {peers.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            <div className="text-4xl mb-2">🔍</div>
            <p>Nenhum peer encontrado</p>
            <p className="text-sm mt-1">Tente conectar-se à rede P2P</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {peers.map((peer, index) => {
              const quality = getConnectionQuality(peer)
              
              return (
                <div
                  key={peer.id}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedPeer(selectedPeer?.id === peer.id ? null : peer)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${quality.color}`} title={quality.label} />
                      <div>
                        <div className="font-medium text-sm text-gray-900">
                          Peer #{index + 1}
                        </div>
                        <div className="text-xs text-gray-500">
                          ID: {peer.id.substring(0, 12)}...
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-sm text-gray-600">
                        {getAgeRangeLabel(peer.metadata.ageRange)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTimestamp(peer.metadata.lastSeen)}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {selectedPeer?.id === peer.id && showDetails && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Geohash:</span>
                          <span className="ml-2 text-gray-600">{peer.metadata.geohash}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Protocolos:</span>
                          <span className="ml-2 text-gray-600">{peer.protocols.length}</span>
                        </div>
                      </div>
                      
                      {peer.metadata.interests.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700 text-sm">Interesses:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {peer.metadata.interests.slice(0, 5).map((interest, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                              >
                                {interest}
                              </span>
                            ))}
                            {peer.metadata.interests.length > 5 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                +{peer.metadata.interests.length - 5}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <span className="font-medium text-gray-700 text-sm">Endereços:</span>
                        <div className="mt-1 space-y-1">
                          {peer.multiaddrs.slice(0, 3).map((addr, idx) => (
                            <div key={idx} className="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                              {addr.length > 50 ? `${addr.substring(0, 50)}...` : addr}
                            </div>
                          ))}
                          {peer.multiaddrs.length > 3 && (
                            <div className="text-xs text-gray-500">
                              +{peer.multiaddrs.length - 3} endereços adicionais
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Distribution Charts (Simple) */}
      {showDetails && Object.keys(stats.geohashDistribution).length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Distribuição por Região</h4>
          <div className="space-y-1">
            {Object.entries(stats.geohashDistribution)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([geohash, count]) => (
                <div key={geohash} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{geohash}*</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(count / stats.totalPeers) * 100}%` }}
                      />
                    </div>
                    <span className="text-gray-700 w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}