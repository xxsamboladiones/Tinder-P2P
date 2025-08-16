import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConnectionTroubleshootingWizard } from '../ConnectionTroubleshootingWizard'
import { NetworkDiagnosticsManager } from '../../p2p/NetworkDiagnosticsManager'
import { P2PManager } from '../../p2p/P2PManager'

// Mock fetch for internet connectivity test
global.fetch = jest.fn()

// Mock RTCPeerConnection with generateCertificate static method
const MockRTCPeerConnection = jest.fn().mockImplementation(() => ({
  createDataChannel: jest.fn(),
  createOffer: jest.fn().mockResolvedValue({}),
  setLocalDescription: jest.fn().mockResolvedValue(undefined),
  close: jest.fn(),
  onicecandidate: null,
  onicegatheringstatechange: null,
  iceGatheringState: 'new'
})) as any

MockRTCPeerConnection.generateCertificate = jest.fn().mockResolvedValue({})
global.RTCPeerConnection = MockRTCPeerConnection

const mockDiagnosticsManager = {
  getNetworkDiagnostics: jest.fn(),
  runNetworkTroubleshooting: jest.fn()
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

const mockTroubleshootingResult = {
  issues: [
    {
      type: 'connection' as const,
      severity: 'medium' as const,
      description: 'Some connection issues detected',
      timestamp: new Date(),
      resolved: false
    }
  ],
  recommendations: [
    'Check firewall settings',
    'Try different STUN servers'
  ],
  healthScore: 75,
  canAutoFix: true,
  autoFixActions: [
    'Retry DHT bootstrap',
    'Reset peer connections'
  ]
}

const mockDiagnosticsData = {
  peerMetrics: [
    {
      peerId: 'peer1',
      connectionQuality: 'excellent' as const
    },
    {
      peerId: 'peer2',
      connectionQuality: 'poor' as const
    }
  ],
  performance: {
    averageLatency: 200
  }
}

describe('ConnectionTroubleshootingWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDiagnosticsManager.getNetworkDiagnostics.mockReturnValue(mockDiagnosticsData)
    mockDiagnosticsManager.runNetworkTroubleshooting.mockResolvedValue(mockTroubleshootingResult)
    ;(fetch as jest.Mock).mockResolvedValue({ ok: true })
  })

  const renderComponent = (props = {}) => {
    const defaultProps = {
      onClose: jest.fn(),
      p2pManager: mockP2PManager as any,
      diagnosticsManager: mockDiagnosticsManager as any
    }
    return render(<ConnectionTroubleshootingWizard {...defaultProps} {...props} />)
  }

  describe('Welcome Step', () => {
    it('should render welcome screen initially', () => {
      renderComponent()
      
      expect(screen.getByText('Assistente de Diagnóstico de Rede P2P')).toBeInTheDocument()
      expect(screen.getByText('🔧')).toBeInTheDocument()
      expect(screen.getByText('Iniciar Diagnóstico')).toBeInTheDocument()
    })

    it('should display what will be tested', () => {
      renderComponent()
      
      expect(screen.getByText('O que será testado:')).toBeInTheDocument()
      expect(screen.getByText('• Conectividade básica de internet')).toBeInTheDocument()
      expect(screen.getByText('• Configuração do sistema P2P')).toBeInTheDocument()
      expect(screen.getByText('• Servidores STUN/TURN')).toBeInTheDocument()
    })

    it('should start basic tests when start button clicked', () => {
      renderComponent()
      
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      expect(screen.getByText('Executando Testes Básicos')).toBeInTheDocument()
    })
  })

  describe('Basic Tests Step', () => {
    beforeEach(() => {
      renderComponent()
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
    })

    it('should display basic tests screen', () => {
      expect(screen.getByText('Executando Testes Básicos')).toBeInTheDocument()
      expect(screen.getByText('Por favor, aguarde enquanto executamos os testes de diagnóstico...')).toBeInTheDocument()
    })

    it('should show all basic tests', () => {
      expect(screen.getByText('Conectividade de Internet')).toBeInTheDocument()
      expect(screen.getByText('Inicialização do P2P')).toBeInTheDocument()
      expect(screen.getByText('Configuração WebRTC')).toBeInTheDocument()
      expect(screen.getByText('Servidores STUN')).toBeInTheDocument()
    })

    it('should run internet connectivity test', async () => {
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('https://www.google.com/favicon.ico', {
          method: 'HEAD',
          mode: 'no-cors'
        })
      })
    })

    it('should show test results', async () => {
      await waitFor(() => {
        expect(screen.getByText('Conectividade com a internet OK')).toBeInTheDocument()
      }, { timeout: 5000 })
    })

    it('should proceed to advanced tests after completion', async () => {
      await waitFor(() => {
        expect(screen.getByText('Próximo')).toBeInTheDocument()
      }, { timeout: 10000 })
      
      fireEvent.click(screen.getByText('Próximo'))
      
      expect(screen.getByText('Executando Testes Avançados')).toBeInTheDocument()
    })
  })

  describe('Advanced Tests Step', () => {
    beforeEach(async () => {
      renderComponent()
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      await waitFor(() => {
        expect(screen.getByText('Próximo')).toBeInTheDocument()
      }, { timeout: 10000 })
      
      fireEvent.click(screen.getByText('Próximo'))
    })

    it('should display advanced tests screen', () => {
      expect(screen.getByText('Executando Testes Avançados')).toBeInTheDocument()
    })

    it('should show all advanced tests', () => {
      expect(screen.getByText('Conectividade DHT')).toBeInTheDocument()
      expect(screen.getByText('Descoberta de Peers')).toBeInTheDocument()
      expect(screen.getByText('Qualidade das Conexões')).toBeInTheDocument()
      expect(screen.getByText('Latência de Rede')).toBeInTheDocument()
    })

    it('should run full troubleshooting after tests', async () => {
      await waitFor(() => {
        expect(mockDiagnosticsManager.runNetworkTroubleshooting).toHaveBeenCalled()
      }, { timeout: 10000 })
    })
  })

  describe('Results Step', () => {
    beforeEach(async () => {
      renderComponent()
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      // Wait for basic tests
      await waitFor(() => {
        expect(screen.getByText('Próximo')).toBeInTheDocument()
      }, { timeout: 10000 })
      fireEvent.click(screen.getByText('Próximo'))
      
      // Wait for advanced tests
      await waitFor(() => {
        expect(screen.getByText('Próximo')).toBeInTheDocument()
      }, { timeout: 10000 })
      fireEvent.click(screen.getByText('Próximo'))
    })

    it('should display results screen', () => {
      expect(screen.getByText('Diagnóstico Concluído')).toBeInTheDocument()
    })

    it('should show health score', () => {
      expect(screen.getByText('Pontuação: 75/100')).toBeInTheDocument()
    })

    it('should display detected issues', () => {
      expect(screen.getByText('Problemas Detectados:')).toBeInTheDocument()
      expect(screen.getByText('Some connection issues detected')).toBeInTheDocument()
    })

    it('should display recommendations', () => {
      expect(screen.getByText('Recomendações:')).toBeInTheDocument()
      expect(screen.getByText('Check firewall settings')).toBeInTheDocument()
      expect(screen.getByText('Try different STUN servers')).toBeInTheDocument()
    })

    it('should show auto-fix availability', () => {
      expect(screen.getByText('Correções Automáticas Disponíveis:')).toBeInTheDocument()
      expect(screen.getByText(/2 problema\(s\) que podem ser corrigidos automaticamente/)).toBeInTheDocument()
    })

    it('should proceed to fixes when auto-fix available', () => {
      fireEvent.click(screen.getByText('Ver Correções'))
      
      expect(screen.getByText('Correções Automáticas')).toBeInTheDocument()
    })
  })

  describe('Fixes Step', () => {
    beforeEach(async () => {
      renderComponent()
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      // Navigate through all steps
      await waitFor(() => {
        expect(screen.getByText('Próximo')).toBeInTheDocument()
      }, { timeout: 10000 })
      fireEvent.click(screen.getByText('Próximo'))
      
      await waitFor(() => {
        expect(screen.getByText('Próximo')).toBeInTheDocument()
      }, { timeout: 10000 })
      fireEvent.click(screen.getByText('Próximo'))
      
      fireEvent.click(screen.getByText('Ver Correções'))
    })

    it('should display fixes screen', () => {
      expect(screen.getByText('Correções Automáticas')).toBeInTheDocument()
      expect(screen.getByText('Selecione as correções que deseja aplicar automaticamente.')).toBeInTheDocument()
    })

    it('should show available fixes', () => {
      expect(screen.getByText('Retry DHT bootstrap')).toBeInTheDocument()
      expect(screen.getByText('Reset peer connections')).toBeInTheDocument()
    })

    it('should allow selecting fixes', () => {
      const checkbox = screen.getAllByRole('checkbox')[0]
      fireEvent.click(checkbox)
      
      expect(checkbox).toBeChecked()
      expect(screen.getByText('1 correção(ões) selecionada(s) para aplicação.')).toBeInTheDocument()
    })

    it('should apply selected fixes', () => {
      const checkbox = screen.getAllByRole('checkbox')[0]
      fireEvent.click(checkbox)
      
      const applyButton = screen.getAllByText('Aplicar')[0]
      fireEvent.click(applyButton)
      
      // Should remove from selected fixes after applying
      expect(screen.queryByText('1 correção(ões) selecionada(s) para aplicação.')).not.toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('should disable previous button on welcome step', () => {
      renderComponent()
      
      expect(screen.getByText('Anterior')).toBeDisabled()
    })

    it('should allow going back to previous steps', async () => {
      renderComponent()
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      await waitFor(() => {
        expect(screen.getByText('Anterior')).not.toBeDisabled()
      })
      
      fireEvent.click(screen.getByText('Anterior'))
      
      expect(screen.getByText('Assistente de Diagnóstico de Rede P2P')).toBeInTheDocument()
    })

    it('should show progress indicators', () => {
      renderComponent()
      
      const progressDots = document.querySelectorAll('.w-3.h-3.rounded-full')
      expect(progressDots).toHaveLength(5)
    })
  })

  describe('Test Execution', () => {
    describe('Internet Connectivity Test', () => {
      it('should pass when fetch succeeds', async () => {
        ;(fetch as jest.Mock).mockResolvedValue({ ok: true })
        
        renderComponent()
        fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
        
        await waitFor(() => {
          expect(screen.getByText('Conectividade com a internet OK')).toBeInTheDocument()
        })
      })

      it('should fail when fetch fails', async () => {
        ;(fetch as jest.Mock).mockRejectedValue(new Error('Network error'))
        
        renderComponent()
        fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
        
        await waitFor(() => {
          expect(screen.getByText('Sem conectividade com a internet')).toBeInTheDocument()
        })
      })
    })

    describe('P2P Initialization Test', () => {
      it('should pass when P2P is properly initialized', async () => {
        renderComponent()
        fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
        
        await waitFor(() => {
          expect(screen.getByText('P2P inicializado corretamente')).toBeInTheDocument()
        })
      })

      it('should fail when P2P manager is not available', async () => {
        renderComponent({ p2pManager: undefined })
        fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
        
        await waitFor(() => {
          expect(screen.getByText('P2P Manager não inicializado')).toBeInTheDocument()
        })
      })

      it('should fail when P2P node is not started', async () => {
        const notStartedP2P = {
          ...mockP2PManager,
          libp2pInstance: { ...mockP2PManager.libp2pInstance, status: 'stopped' }
        }
        
        renderComponent({ p2pManager: notStartedP2P })
        fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
        
        await waitFor(() => {
          expect(screen.getByText('Nó P2P não está ativo')).toBeInTheDocument()
        })
      })
    })

    describe('WebRTC Configuration Test', () => {
      it('should pass when WebRTC works correctly', async () => {
        const mockPC = {
          createDataChannel: jest.fn(),
          createOffer: jest.fn().mockResolvedValue({}),
          setLocalDescription: jest.fn().mockResolvedValue(undefined),
          close: jest.fn(),
          onicecandidate: null,
          onicegatheringstatechange: null
        }
        
        MockRTCPeerConnection.mockImplementation(() => mockPC)
        
        renderComponent()
        fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
        
        // Simulate ICE candidate event
        setTimeout(() => {
          if (mockPC.onicecandidate) {
            (mockPC.onicecandidate as any)({ candidate: { type: 'host' } })
          }
        }, 100)
        
        await waitFor(() => {
          expect(screen.getByText('WebRTC configurado corretamente')).toBeInTheDocument()
        })
      })

      it('should fail when WebRTC times out', async () => {
        const mockPC = {
          createDataChannel: jest.fn(),
          createOffer: jest.fn().mockResolvedValue({}),
          setLocalDescription: jest.fn().mockResolvedValue(undefined),
          close: jest.fn(),
          onicecandidate: null,
          onicegatheringstatechange: null
        }
        
        MockRTCPeerConnection.mockImplementation(() => mockPC)
        
        renderComponent()
        fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
        
        await waitFor(() => {
          expect(screen.getByText(/Timeout na configuração WebRTC/)).toBeInTheDocument()
        }, { timeout: 10000 })
      })
    })

    describe('DHT Connectivity Test', () => {
      it('should pass when DHT is active', async () => {
        renderComponent()
        fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
        
        // Navigate to advanced tests
        await waitFor(() => {
          expect(screen.getByText('Próximo')).toBeInTheDocument()
        }, { timeout: 10000 })
        fireEvent.click(screen.getByText('Próximo'))
        
        await waitFor(() => {
          expect(screen.getByText(/DHT ativo com \d+ peers conhecidos/)).toBeInTheDocument()
        })
      })

      it('should fail when DHT is not started', async () => {
        const noDHTP2P = {
          ...mockP2PManager,
          libp2pInstance: {
            ...mockP2PManager.libp2pInstance,
            services: {
              dht: {
                isStarted: jest.fn(() => false)
              }
            }
          }
        }
        
        renderComponent({ p2pManager: noDHTP2P })
        fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
        
        // Navigate to advanced tests
        await waitFor(() => {
          expect(screen.getByText('Próximo')).toBeInTheDocument()
        }, { timeout: 10000 })
        fireEvent.click(screen.getByText('Próximo'))
        
        await waitFor(() => {
          expect(screen.getByText('Serviço DHT não está ativo')).toBeInTheDocument()
        })
      })
    })
  })

  describe('Close functionality', () => {
    it('should call onClose when close button clicked', () => {
      const onClose = jest.fn()
      renderComponent({ onClose })
      
      fireEvent.click(screen.getByText('✕'))
      
      expect(onClose).toHaveBeenCalled()
    })

    it('should call onClose when cancel button clicked', () => {
      const onClose = jest.fn()
      renderComponent({ onClose })
      
      fireEvent.click(screen.getByText('Cancelar'))
      
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('should handle test execution errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      mockDiagnosticsManager.runNetworkTroubleshooting.mockRejectedValue(new Error('Test error'))
      
      renderComponent()
      fireEvent.click(screen.getByText('Iniciar Diagnóstico'))
      
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Test execution failed:', expect.any(Error))
      }, { timeout: 15000 })
      
      consoleError.mockRestore()
    })
  })
})