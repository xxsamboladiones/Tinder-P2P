import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NetworkDiagnosticsUI } from '../NetworkDiagnosticsUI'
import { NetworkDiagnosticsManager } from '../../p2p/NetworkDiagnosticsManager'
import { P2PManager } from '../../p2p/P2PManager'

// Mock the NetworkDiagnosticsManager
jest.mock('../../p2p/NetworkDiagnosticsManager')
jest.mock('../../p2p/P2PManager')

const mockDiagnosticsManager = {
  initialize: jest.fn(),
  destroy: jest.fn(),
  getNetworkDiagnostics: jest.fn(),
  runNetworkTroubleshooting: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
}

const mockP2PManager = {
  libp2pInstance: {
    status: 'started',
    getConnections: jest.fn(() => []),
    getPeers: jest.fn(() => [])
  }
}

const mockDiagnosticsData = {
  networkStatus: {
    connected: true,
    peerCount: 5,
    dhtConnected: true,
    latency: 150,
    bandwidth: { up: 1000, down: 2000 }
  },
  peerMetrics: [
    {
      peerId: 'peer1',
      connectionState: 'connected' as const,
      latency: 100,
      bandwidth: { up: 500, down: 1000 },
      packetsLost: 0,
      packetsReceived: 100,
      packetsSent: 95,
      connectionQuality: 'excellent' as const,
      lastSeen: new Date(),
      connectionDuration: 30000,
      reconnectAttempts: 0,
      protocols: ['webrtc'],
      multiaddrs: ['/ip4/192.168.1.1/tcp/4001']
    },
    {
      peerId: 'peer2',
      connectionState: 'connected' as const,
      latency: 300,
      bandwidth: { up: 200, down: 500 },
      packetsLost: 5,
      packetsReceived: 100,
      packetsSent: 95,
      connectionQuality: 'fair' as const,
      lastSeen: new Date(),
      connectionDuration: 60000,
      reconnectAttempts: 1,
      protocols: ['webrtc', 'tcp'],
      multiaddrs: ['/ip4/192.168.1.2/tcp/4001']
    }
  ],
  dhtStatus: {
    connected: true,
    routingTableSize: 50,
    knownPeers: 25,
    activeQueries: 3,
    lastBootstrap: new Date()
  },
  troubleshooting: {
    issues: [
      {
        type: 'latency' as const,
        severity: 'medium' as const,
        description: 'High latency detected on some connections',
        timestamp: new Date(),
        resolved: false
      }
    ],
    recommendations: [
      'Check network connection quality',
      'Consider using different STUN servers'
    ],
    healthScore: 75
  },
  performance: {
    averageLatency: 200,
    totalBandwidth: { up: 700, down: 1500 },
    connectionSuccess: 85,
    messageDeliveryRate: 95
  }
}

const mockTroubleshootingResult = {
  issues: [
    {
      type: 'connection' as const,
      severity: 'medium' as const,
      description: 'Some peers have poor connection quality',
      timestamp: new Date(),
      resolved: false
    }
  ],
  recommendations: [
    'Check firewall settings',
    'Try different STUN servers'
  ],
  healthScore: 70,
  canAutoFix: true,
  autoFixActions: [
    'Retry DHT bootstrap',
    'Reset peer connections'
  ]
}

describe('NetworkDiagnosticsUI', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(NetworkDiagnosticsManager as jest.Mock).mockImplementation(() => mockDiagnosticsManager)
    mockDiagnosticsManager.getNetworkDiagnostics.mockReturnValue(mockDiagnosticsData)
    mockDiagnosticsManager.runNetworkTroubleshooting.mockResolvedValue(mockTroubleshootingResult)
  })

  const renderComponent = (props = {}) => {
    const defaultProps = {
      onClose: jest.fn(),
      p2pManager: mockP2PManager as any
    }
    return render(<NetworkDiagnosticsUI {...defaultProps} {...props} />)
  }

  describe('Initialization', () => {
    it('should render loading state initially', () => {
      mockDiagnosticsManager.getNetworkDiagnostics.mockReturnValue(null)
      renderComponent()
      
      expect(screen.getByText('Carregando diagnósticos...')).toBeInTheDocument()
    })

    it('should initialize diagnostics manager with P2P manager', () => {
      renderComponent()
      
      expect(mockDiagnosticsManager.initialize).toHaveBeenCalledWith(mockP2PManager.libp2pInstance)
    })

    it('should setup event listeners', () => {
      renderComponent()
      
      expect(mockDiagnosticsManager.on).toHaveBeenCalledWith('metrics:updated', expect.any(Function))
    })
  })

  describe('Overview Tab', () => {
    it('should display network status overview', async () => {
      renderComponent()
      
      await waitFor(() => {
        expect(screen.getByText('Conectado')).toBeInTheDocument()
        expect(screen.getByText('5')).toBeInTheDocument() // peer count
        expect(screen.getByText('150ms')).toBeInTheDocument() // latency
        expect(screen.getByText('Ativo')).toBeInTheDocument() // DHT status
      })
    })

    it('should display health score with correct color', async () => {
      renderComponent()
      
      await waitFor(() => {
        const healthScore = screen.getByText('75/100')
        expect(healthScore).toBeInTheDocument()
        expect(healthScore).toHaveClass('text-yellow-600')
      })
    })

    it('should display recommendations', async () => {
      renderComponent()
      
      await waitFor(() => {
        expect(screen.getByText('Check network connection quality')).toBeInTheDocument()
        expect(screen.getByText('Consider using different STUN servers')).toBeInTheDocument()
      })
    })

    it('should display DHT status information', async () => {
      renderComponent()
      
      await waitFor(() => {
        expect(screen.getByText('50')).toBeInTheDocument() // routing table size
        expect(screen.getByText('25')).toBeInTheDocument() // known peers
        expect(screen.getByText('3')).toBeInTheDocument() // active queries
      })
    })
  })

  describe('Peers Tab', () => {
    it('should switch to peers tab and display peer list', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Peers'))
      })
      
      expect(screen.getByText('Conexões de Peers')).toBeInTheDocument()
      expect(screen.getByText((content, element) => 
        content.includes('peer1') && element?.tagName.toLowerCase() === 'p'
      )).toBeInTheDocument()
      expect(screen.getByText((content, element) => 
        content.includes('peer2') && element?.tagName.toLowerCase() === 'p'
      )).toBeInTheDocument()
    })

    it('should display peer connection quality badges', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Peers'))
      })
      
      expect(screen.getByText('excellent')).toBeInTheDocument()
      expect(screen.getByText('fair')).toBeInTheDocument()
    })

    it('should expand peer details when clicked', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Peers'))
      })
      
      const peerElement = screen.getByText((content, element) => 
        content.includes('peer1') && element?.tagName.toLowerCase() === 'p'
      ).closest('div')
      fireEvent.click(peerElement!)
      
      expect(screen.getByText('Duração da Conexão')).toBeInTheDocument()
      expect(screen.getByText('Tentativas de Reconexão')).toBeInTheDocument()
    })

    it('should display no peers message when no peers connected', async () => {
      const emptyDiagnostics = { ...mockDiagnosticsData, peerMetrics: [] }
      mockDiagnosticsManager.getNetworkDiagnostics.mockReturnValue(emptyDiagnostics)
      
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Peers'))
      })
      
      expect(screen.getByText('Nenhum peer conectado')).toBeInTheDocument()
    })
  })

  describe('Performance Tab', () => {
    it('should display performance metrics', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Performance'))
      })
      
      expect(screen.getByText('Métricas de Rede')).toBeInTheDocument()
      expect(screen.getByText('200ms')).toBeInTheDocument() // average latency
      expect(screen.getByText('85.0%')).toBeInTheDocument() // connection success
      expect(screen.getByText('95.0%')).toBeInTheDocument() // message delivery rate
    })

    it('should display bandwidth information', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Performance'))
      })
      
      expect(screen.getByText('Largura de Banda')).toBeInTheDocument()
    })

    it('should display connection quality distribution', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Performance'))
      })
      
      expect(screen.getByText('Distribuição da Qualidade das Conexões')).toBeInTheDocument()
    })
  })

  describe('Troubleshooting Tab', () => {
    it('should display troubleshooting controls', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Diagnóstico'))
      })
      
      expect(screen.getByText('Diagnóstico de Problemas')).toBeInTheDocument()
      expect(screen.getByText('Executar Diagnóstico')).toBeInTheDocument()
    })

    it('should run troubleshooting when button clicked', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Diagnóstico'))
      })
      
      fireEvent.click(screen.getByText('Executar Diagnóstico'))
      
      expect(mockDiagnosticsManager.runNetworkTroubleshooting).toHaveBeenCalled()
    })

    it('should display troubleshooting results', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Diagnóstico'))
      })
      
      fireEvent.click(screen.getByText('Executar Diagnóstico'))
      
      await waitFor(() => {
        expect(screen.getByText('70/100')).toBeInTheDocument()
        expect(screen.getByText('Some peers have poor connection quality')).toBeInTheDocument()
      })
    })

    it('should display current issues', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Diagnóstico'))
      })
      
      expect(screen.getByText('Problemas Atuais')).toBeInTheDocument()
      expect(screen.getByText('High latency detected on some connections')).toBeInTheDocument()
    })
  })

  describe('Auto-refresh', () => {
    it('should have auto-refresh enabled by default', async () => {
      renderComponent()
      
      await waitFor(() => {
        const checkbox = screen.getByLabelText('Auto-atualizar') as HTMLInputElement
        expect(checkbox.checked).toBe(true)
      })
    })

    it('should toggle auto-refresh when checkbox clicked', async () => {
      renderComponent()
      
      await waitFor(() => {
        const checkbox = screen.getByLabelText('Auto-atualizar')
        fireEvent.click(checkbox)
        expect((checkbox as HTMLInputElement).checked).toBe(false)
      })
    })
  })

  describe('Close functionality', () => {
    it('should call onClose when close button clicked', async () => {
      const onClose = jest.fn()
      renderComponent({ onClose })
      
      await waitFor(() => {
        fireEvent.click(screen.getAllByText('✕')[0])
      })
      
      expect(onClose).toHaveBeenCalled()
    })

    it('should call onClose when footer close button clicked', async () => {
      const onClose = jest.fn()
      renderComponent({ onClose })
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Fechar'))
      })
      
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('Cleanup', () => {
    it('should cleanup diagnostics manager on unmount', () => {
      const { unmount } = renderComponent()
      
      unmount()
      
      expect(mockDiagnosticsManager.destroy).toHaveBeenCalled()
    })

    it('should remove event listeners on unmount', () => {
      const { unmount } = renderComponent()
      
      unmount()
      
      expect(mockDiagnosticsManager.off).toHaveBeenCalledWith('metrics:updated', expect.any(Function))
    })
  })

  describe('Error handling', () => {
    it('should handle missing P2P manager gracefully', () => {
      renderComponent({ p2pManager: undefined })
      
      expect(mockDiagnosticsManager.initialize).not.toHaveBeenCalled()
    })

    it('should handle P2P manager without libp2p instance', () => {
      renderComponent({ p2pManager: { libp2pInstance: null } })
      
      expect(mockDiagnosticsManager.initialize).not.toHaveBeenCalled()
    })

    it('should handle troubleshooting errors', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      mockDiagnosticsManager.runNetworkTroubleshooting.mockRejectedValue(new Error('Test error'))
      
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Diagnóstico'))
      })
      
      fireEvent.click(screen.getByText('Executar Diagnóstico'))
      
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Troubleshooting failed:', expect.any(Error))
      })
      
      consoleError.mockRestore()
    })
  })

  describe('Utility functions', () => {
    it('should format bytes correctly', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Performance'))
      })
      
      // The component should format bandwidth values
      expect(screen.getByText(/KB\/s|MB\/s|GB\/s/)).toBeInTheDocument()
    })

    it('should format duration correctly', async () => {
      renderComponent()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Peers'))
      })
      
      const peerElement = screen.getByText((content, element) => 
        content.includes('peer1') && element?.tagName.toLowerCase() === 'p'
      ).closest('div')
      fireEvent.click(peerElement!)
      
      // Should display formatted duration (specifically the connection duration)
      expect(screen.getByText('30s')).toBeInTheDocument()
    })
  })
})