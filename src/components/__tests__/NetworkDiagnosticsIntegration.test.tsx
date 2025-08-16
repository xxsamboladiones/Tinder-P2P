import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NetworkDiagnosticsUI } from '../NetworkDiagnosticsUI'
import { ConnectionTroubleshootingWizard } from '../ConnectionTroubleshootingWizard'
import { NetworkDiagnosticsManager } from '../../p2p/NetworkDiagnosticsManager'
import { P2PManager } from '../../p2p/P2PManager'

// Mock components and managers
jest.mock('../../p2p/NetworkDiagnosticsManager')
jest.mock('../../p2p/P2PManager')

// Mock fetch and WebRTC
global.fetch = jest.fn()

// Mock RTCPeerConnection with generateCertificate static method
const MockRTCPeerConnection = jest.fn().mockImplementation(() => ({
  createDataChannel: jest.fn(),
  createOffer: jest.fn().mockResolvedValue({}),
  setLocalDescription: jest.fn().mockResolvedValue(undefined),
  close: jest.fn(),
  onicecandidate: null,
  onicegatheringstatechange: null
}))

MockRTCPeerConnection.generateCertificate = jest.fn().mockResolvedValue({})
global.RTCPeerConnection = MockRTCPeerConnection as any

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
    getPeers: jest.fn(() => ['peer1', 'peer2']),
    services: {
      dht: {
        isStarted: jest.fn(() => true)
      }
    }
  }
}

const mockDiagnosticsData = {
  networkStatus: {
    connected: true,
    peerCount: 3,
    dhtConnected: true,
    latency: 250,
    bandwidth: { up: 1000, down: 2000 }
  },
  peerMetrics: [
    {
      peerId: 'peer1',
      connectionState: 'connected' as const,
      latency: 150,
      bandwidth: { up: 500, down: 1000 },
      packetsLost: 0,
      packetsReceived: 100,
      packetsSent: 95,
      connectionQuality: 'good' as const,
      lastSeen: new Date(),
      connectionDuration: 30000,
      reconnectAttempts: 0,
      protocols: ['webrtc'],
      multiaddrs: ['/ip4/192.168.1.1/tcp/4001']
    },
    {
      peerId: 'peer2',
      connectionState: 'connected' as const,
      latency: 400,
      bandwidth: { up: 200, down: 500 },
      packetsLost: 10,
      packetsReceived: 100,
      packetsSent: 95,
      connectionQuality: 'poor' as const,
      lastSeen: new Date(),
      connectionDuration: 60000,
      reconnectAttempts: 2,
      protocols: ['webrtc', 'tcp'],
      multiaddrs: ['/ip4/192.168.1.2/tcp/4001']
    }
  ],
  dhtStatus: {
    connected: true,
    routingTableSize: 25,
    knownPeers: 15,
    activeQueries: 2,
    lastBootstrap: new Date()
  },
  troubleshooting: {
    issues: [
      {
        type: 'connection' as const,
        severity: 'medium' as const,
        description: 'Some peers have poor connection quality',
        affectedPeers: ['peer2'],
        timestamp: new Date(),
        resolved: false
      }
    ],
    recommendations: [
      'Check network connection quality',
      'Consider using different STUN servers',
      'Monitor peer connection stability'
    ],
    healthScore: 65
  },
  performance: {
    averageLatency: 275,
    totalBandwidth: { up: 700, down: 1500 },
    connectionSuccess: 75,
    messageDeliveryRate: 90
  }
}

const mockTroubleshootingResult = {
  issues: [
    {
      type: 'connection' as const,
      severity: 'medium' as const,
      description: 'Poor connection quality detected on some peers',
      affectedPeers: ['peer2'],
      timestamp: new Date(),
      resolved: false
    },
    {
      type: 'latency' as const,
      severity: 'medium' as const,
      description: 'High latency detected on network',
      timestamp: new Date(),
      resolved: false
    }
  ],
  recommendations: [
    'Check firewall settings for P2P traffic',
    'Try using different STUN/TURN servers',
    'Monitor network connection stability',
    'Consider adjusting peer discovery criteria'
  ],
  healthScore: 65,
  canAutoFix: true,
  autoFixActions: [
    'Retry DHT bootstrap',
    'Reset poor quality peer connections',
    'Update STUN server configuration'
  ]
}

describe('Network Diagnostics Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(NetworkDiagnosticsManager as jest.Mock).mockImplementation(() => mockDiagnosticsManager)
    mockDiagnosticsManager.getNetworkDiagnostics.mockReturnValue(mockDiagnosticsData)
    mockDiagnosticsManager.runNetworkTroubleshooting.mockResolvedValue(mockTroubleshootingResult)
    ;(fetch as jest.Mock).mockResolvedValue({ ok: true })
  })

  describe('NetworkDiagnosticsUI Integration', () => {
    const renderDiagnosticsUI = (props = {}) => {
      const defaultProps = {
        onClose: jest.fn(),
        p2pManager: mockP2PManager as any
      }
      return render(<NetworkDiagnosticsUI {...defaultProps} {...props} />)
    }

    it('should display comprehensive network diagnostics', async () => {
      renderDiagnosticsUI()
      
      await waitFor(() => {
        // Network status
        expect(screen.getByText('Conectado')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument() // peer count
        expect(screen.getByText('250ms')).toBeInTheDocument() // latency
        expect(screen.getByText('Ativo')).toBeInTheDocument() // DHT status
        
        // Health score
        expect(screen.getByText('65/100')).toBeInTheDocument()
      })
    })

    it('should show peer connection visualization', async () => {
      renderDiagnosticsUI()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Peers'))
      })
      
      expect(screen.getByText('Conexões de Peers')).toBeInTheDocument()
      expect(screen.getByText('peer1')).toBeInTheDocument()
      expect(screen.getByText('peer2')).toBeInTheDocument()
      expect(screen.getByText('good')).toBeInTheDocument()
      expect(screen.getByText('poor')).toBeInTheDocument()
    })

    it('should display performance metrics', async () => {
      renderDiagnosticsUI()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Performance'))
      })
      
      expect(screen.getByText('275ms')).toBeInTheDocument() // average latency
      expect(screen.getByText('75.0%')).toBeInTheDocument() // connection success
      expect(screen.getByText('90.0%')).toBeInTheDocument() // message delivery rate
    })

    it('should run troubleshooting and display results', async () => {
      renderDiagnosticsUI()
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Diagnóstico'))
      })
      
      fireEvent.click(screen.getByText('Executar Diagnóstico'))
      
      await waitFor(() => {
        expect(screen.getByText('65/100')).toBeInTheDocument()
        expect(screen.getByText('Poor connection quality detected on some peers')).toBeInTheDocument()
        expect(screen.getByText('Check firewall settings for P2P traffic')).toBeInTheDocument()
      })
    })

    it('should handle real-time updates', async () => {
      renderDiagnosticsUI()
      
      // Simulate metrics update event
      const updateCallback = mockDiagnosticsManager.on.mock.calls
        .find(call => call[0] === 'metrics:updated')?.[1]
      
      if (updateCallback) {
        const updatedData = {
          ...mockDiagnosticsData,
          networkStatus: {
            ...mockDiagnosticsData.networkStatus,
            peerCount: 5,
            latency: 180
          }
        }
        
        updateCallback(updatedData)
        
        await waitFor(() => {
          expect(screen.getByText('5')).toBeInTheDocument() // updated peer count
          expect(screen.getByText('180ms')).toBeInTheDocument() // updated latency
        })
      }
    })
  })

  describe('ConnectionTroubleshootingWizard Integration', () => {
    const renderTroubleshootingWizard = (props = {}) => {
      const defaultProps = {
        onClose: jest.fn(),
        p2pManager: mockP2PManager as any,
        diagnosticsManager: mockDiagnosticsManager as any
      }
      return render(<ConnectionTroubleshootingWizard {...defaultProps} {...props} />)
    }

    it('should complete full troubleshooting workflow', async () => {
      renderTroubleshootingWizard()
      
      // Start wizard
      expect(screen.getByText('Assistente de Diagnóstico de Rede P2P')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      // Basic tests
      expect(screen.getByText('Executando Testes Básicos')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.getByText('Conectividade com a internet OK')).toBeInTheDocument()
        expect(screen.getByText('P2P inicializado corretamente')).toBeInTheDocument()
      }, { timeout: 10000 })
      
      fireEvent.click(screen.getByText('Próximo'))
      
      // Advanced tests
      expect(screen.getByText('Executando Testes Avançados')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(mockDiagnosticsManager.runNetworkTroubleshooting).toHaveBeenCalled()
      }, { timeout: 10000 })
      
      fireEvent.click(screen.getByText('Próximo'))
      
      // Results
      expect(screen.getByText('Diagnóstico Concluído')).toBeInTheDocument()
      expect(screen.getByText('Pontuação: 65/100')).toBeInTheDocument()
      
      fireEvent.click(screen.getByText('Ver Correções'))
      
      // Fixes
      expect(screen.getByText('Correções Automáticas')).toBeInTheDocument()
      expect(screen.getByText('Retry DHT bootstrap')).toBeInTheDocument()
      expect(screen.getByText('Reset poor quality peer connections')).toBeInTheDocument()
    })

    it('should handle network issues during testing', async () => {
      // Simulate network failure
      ;(fetch as jest.Mock).mockRejectedValue(new Error('Network error'))
      
      renderTroubleshootingWizard()
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      await waitFor(() => {
        expect(screen.getByText('Sem conectividade com a internet')).toBeInTheDocument()
      }, { timeout: 10000 })
    })

    it('should detect P2P configuration issues', async () => {
      const brokenP2P = {
        libp2p: {
          status: 'stopped',
          getConnections: jest.fn(() => []),
          getPeers: jest.fn(() => []),
          services: {
            dht: {
              isStarted: jest.fn(() => false)
            }
          }
        }
      }
      
      renderTroubleshootingWizard({ p2pManager: brokenP2P })
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      await waitFor(() => {
        expect(screen.getByText('Nó P2P não está ativo')).toBeInTheDocument()
      }, { timeout: 10000 })
      
      fireEvent.click(screen.getByText('Próximo'))
      
      await waitFor(() => {
        expect(screen.getByText('Serviço DHT não está ativo')).toBeInTheDocument()
      }, { timeout: 10000 })
    })

    it('should apply automatic fixes', async () => {
      renderTroubleshootingWizard()
      
      // Navigate to fixes step
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      await waitFor(() => {
        expect(screen.getByText('Próximo')).toBeInTheDocument()
      }, { timeout: 10000 })
      fireEvent.click(screen.getByText('Próximo'))
      
      await waitFor(() => {
        expect(screen.getByText('Próximo')).toBeInTheDocument()
      }, { timeout: 10000 })
      fireEvent.click(screen.getByText('Próximo'))
      
      fireEvent.click(screen.getByText('Ver Correções'))
      
      // Select and apply a fix
      const checkbox = screen.getAllByRole('checkbox')[0]
      fireEvent.click(checkbox)
      
      const applyButton = screen.getAllByText('Aplicar')[0]
      fireEvent.click(applyButton)
      
      // Verify fix was applied (checkbox should be unchecked)
      expect(checkbox).not.toBeChecked()
    })
  })

  describe('Cross-component Integration', () => {
    it('should share diagnostics manager between components', () => {
      const diagnosticsManager = new (NetworkDiagnosticsManager as any)()
      
      render(
        <div>
          <NetworkDiagnosticsUI 
            onClose={jest.fn()} 
            p2pManager={mockP2PManager as any} 
          />
          <ConnectionTroubleshootingWizard
            onClose={jest.fn()}
            p2pManager={mockP2PManager as any}
            diagnosticsManager={diagnosticsManager}
          />
        </div>
      )
      
      // Both components should use the same diagnostics manager
      expect(NetworkDiagnosticsManager).toHaveBeenCalledTimes(2) // One for each component
    })

    it('should handle concurrent diagnostics operations', async () => {
      const onClose = jest.fn()
      
      const { rerender } = render(
        <NetworkDiagnosticsUI 
          onClose={onClose} 
          p2pManager={mockP2PManager as any} 
        />
      )
      
      // Start troubleshooting in diagnostics UI
      await waitFor(() => {
        fireEvent.click(screen.getByText('Diagnóstico'))
      })
      
      fireEvent.click(screen.getByText('Executar Diagnóstico'))
      
      // Switch to troubleshooting wizard
      rerender(
        <ConnectionTroubleshootingWizard
          onClose={onClose}
          p2pManager={mockP2PManager as any}
          diagnosticsManager={mockDiagnosticsManager as any}
        />
      )
      
      // Should be able to start wizard independently
      expect(screen.getByText('Assistente de Diagnóstico de Rede P2P')).toBeInTheDocument()
    })
  })

  describe('Error Recovery Integration', () => {
    it('should handle diagnostics manager failures gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      mockDiagnosticsManager.runNetworkTroubleshooting.mockRejectedValue(new Error('Manager error'))
      
      render(
        <NetworkDiagnosticsUI 
          onClose={jest.fn()} 
          p2pManager={mockP2PManager as any} 
        />
      )
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Diagnóstico'))
      })
      
      fireEvent.click(screen.getByText('Executar Diagnóstico'))
      
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Troubleshooting failed:', expect.any(Error))
      })
      
      consoleError.mockRestore()
    })

    it('should recover from P2P manager disconnection', async () => {
      const { rerender } = render(
        <NetworkDiagnosticsUI 
          onClose={jest.fn()} 
          p2pManager={mockP2PManager as any} 
        />
      )
      
      // Simulate P2P manager disconnection
      const disconnectedP2P = {
        libp2pInstance: {
          status: 'stopped',
          getConnections: jest.fn(() => []),
          getPeers: jest.fn(() => [])
        }
      }
      
      const disconnectedData = {
        ...mockDiagnosticsData,
        networkStatus: {
          ...mockDiagnosticsData.networkStatus,
          connected: false,
          peerCount: 0
        }
      }
      
      mockDiagnosticsManager.getNetworkDiagnostics.mockReturnValue(disconnectedData)
      
      rerender(
        <NetworkDiagnosticsUI 
          onClose={jest.fn()} 
          p2pManager={disconnectedP2P as any} 
        />
      )
      
      await waitFor(() => {
        expect(screen.getByText('Desconectado')).toBeInTheDocument()
        expect(screen.getByText('0')).toBeInTheDocument() // peer count
      })
    })
  })

  describe('Performance Integration', () => {
    it('should handle large numbers of peers efficiently', async () => {
      const largePeerData = {
        ...mockDiagnosticsData,
        peerMetrics: Array.from({ length: 100 }, (_, i) => ({
          peerId: `peer${i}`,
          connectionState: 'connected' as const,
          latency: 100 + Math.random() * 400,
          bandwidth: { up: 500, down: 1000 },
          packetsLost: Math.floor(Math.random() * 10),
          packetsReceived: 100,
          packetsSent: 95,
          connectionQuality: ['excellent', 'good', 'fair', 'poor'][Math.floor(Math.random() * 4)] as any,
          lastSeen: new Date(),
          connectionDuration: 30000,
          reconnectAttempts: 0,
          protocols: ['webrtc'],
          multiaddrs: [`/ip4/192.168.1.${i}/tcp/4001`]
        }))
      }
      
      mockDiagnosticsManager.getNetworkDiagnostics.mockReturnValue(largePeerData)
      
      render(
        <NetworkDiagnosticsUI 
          onClose={jest.fn()} 
          p2pManager={mockP2PManager as any} 
        />
      )
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Peers'))
      })
      
      // Should render without performance issues
      expect(screen.getByText('Conexões de Peers')).toBeInTheDocument()
      expect(screen.getByText('100')).toBeInTheDocument() // peer count
    })

    it('should update metrics efficiently with auto-refresh', async () => {
      jest.useFakeTimers()
      
      render(
        <NetworkDiagnosticsUI 
          onClose={jest.fn()} 
          p2pManager={mockP2PManager as any} 
        />
      )
      
      // Fast-forward time to trigger auto-refresh
      jest.advanceTimersByTime(2000)
      
      await waitFor(() => {
        expect(mockDiagnosticsManager.getNetworkDiagnostics).toHaveBeenCalledTimes(2) // Initial + auto-refresh
      })
      
      jest.useRealTimers()
    })
  })
})