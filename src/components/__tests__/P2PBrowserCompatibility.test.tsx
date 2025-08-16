import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { P2PConfigPanel } from '../P2PConfigPanel'

// Mock P2PManager with browser-compatible behavior
jest.mock('../../p2p/P2PManager', () => ({
  P2PManager: jest.fn().mockImplementation(() => ({
    getNetworkStatus: jest.fn().mockReturnValue({
      connected: false,
      peerCount: 0,
      dhtConnected: false,
      latency: 0,
      bandwidth: { up: 0, down: 0 }
    }),
    initialize: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined)
  }))
}))

describe('P2P Browser Compatibility', () => {
  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows browser compatibility information', () => {
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    expect(screen.getByText(/Navegador:/)).toBeInTheDocument()
    expect(screen.getByText(/WebRTC, WebSockets e Circuit Relay/)).toBeInTheDocument()
    expect(screen.getByText(/Conexões TCP não estão disponíveis/)).toBeInTheDocument()
  })

  it('handles browser-specific connection errors gracefully', async () => {
    const user = userEvent.setup()
    
    // Mock TCP error
    const { P2PManager } = require('../../p2p/P2PManager')
    P2PManager.mockImplementation(() => ({
      getNetworkStatus: jest.fn().mockReturnValue({
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }),
      initialize: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockRejectedValue(new Error('TCP connections are not possible in browsers')),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }))

    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    await waitFor(() => {
      expect(screen.getByText(/Configuração atualizada para navegador/)).toBeInTheDocument()
    })
  })

  it('handles WebRTC errors with helpful message', async () => {
    const user = userEvent.setup()
    
    // Mock WebRTC error
    const { P2PManager } = require('../../p2p/P2PManager')
    P2PManager.mockImplementation(() => ({
      getNetworkStatus: jest.fn().mockReturnValue({
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }),
      initialize: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockRejectedValue(new Error('WebRTC connection failed')),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }))

    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    await waitFor(() => {
      expect(screen.getByText(/Erro WebRTC/)).toBeInTheDocument()
      expect(screen.getByText(/Verifique as configurações STUN\/TURN/)).toBeInTheDocument()
    })
  })

  it('handles bootstrap connection errors', async () => {
    const user = userEvent.setup()
    
    // Mock bootstrap error
    const { P2PManager } = require('../../p2p/P2PManager')
    P2PManager.mockImplementation(() => ({
      getNetworkStatus: jest.fn().mockReturnValue({
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }),
      initialize: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockRejectedValue(new Error('bootstrap node connection failed')),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }))

    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    await waitFor(() => {
      expect(screen.getByText(/Falha ao conectar aos nós bootstrap/)).toBeInTheDocument()
    })
  })

  it('shows default STUN servers suitable for browsers', () => {
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    // Should show Google STUN servers which work in browsers
    expect(screen.getByDisplayValue('stun:stun.l.google.com:19302')).toBeInTheDocument()
    expect(screen.getByDisplayValue('stun:stun1.l.google.com:19302')).toBeInTheDocument()
    expect(screen.getByDisplayValue('stun:stun2.l.google.com:19302')).toBeInTheDocument()
  })

  it('allows configuration of TURN servers for NAT traversal', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const turnUrlInput = screen.getByPlaceholderText('turn:turn.example.com:3478')
    const turnUsernameInput = screen.getByPlaceholderText('Usuário (opcional)')
    const addTurnButton = screen.getByText('Adicionar Servidor TURN')
    
    await user.type(turnUrlInput, 'turn:relay.example.com:3478')
    await user.type(turnUsernameInput, 'testuser')
    await user.click(addTurnButton)
    
    expect(screen.getByText('turn:relay.example.com:3478')).toBeInTheDocument()
    expect(screen.getByText('Usuário: testuser')).toBeInTheDocument()
  })

  it('handles circuit relay dependency errors', async () => {
    const user = userEvent.setup()
    
    // Mock circuit relay error
    const { P2PManager } = require('../../p2p/P2PManager')
    P2PManager.mockImplementation(() => ({
      getNetworkStatus: jest.fn().mockReturnValue({
        connected: false,
        peerCount: 0,
        dhtConnected: false,
        latency: 0,
        bandwidth: { up: 0, down: 0 }
      }),
      initialize: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockRejectedValue(new Error('UnmetServiceDependenciesError: Service "@libp2p/webrtc" required capability "@libp2p/circuit-relay-v2-transport"')),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }))

    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    await waitFor(() => {
      expect(screen.getByText(/Configuração de relay atualizada/)).toBeInTheDocument()
    })
  })

  it('shows WebRTC-specific settings', () => {
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    // Should show settings relevant to WebRTC connections
    expect(screen.getByText('Servidores STUN')).toBeInTheDocument()
    expect(screen.getByText('Servidores TURN')).toBeInTheDocument()
    expect(screen.getByLabelText('Criptografia habilitada')).toBeInTheDocument()
  })
})