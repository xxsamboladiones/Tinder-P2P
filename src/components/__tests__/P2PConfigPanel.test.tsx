import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { P2PConfigPanel } from '../P2PConfigPanel'

// Mock P2PManager
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

describe('P2PConfigPanel', () => {
  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders P2P configuration panel', () => {
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    expect(screen.getByText('Configurações P2P')).toBeInTheDocument()
    expect(screen.getByText('Status da Rede')).toBeInTheDocument()
    expect(screen.getByText('Configurações Básicas')).toBeInTheDocument()
    expect(screen.getByText('Servidores STUN')).toBeInTheDocument()
    expect(screen.getByText('Servidores TURN')).toBeInTheDocument()
  })

  it('displays network status correctly', () => {
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    expect(screen.getByText('Desconectado')).toBeInTheDocument()
    expect(screen.getByText('Peers: 0')).toBeInTheDocument()
    expect(screen.getByText('DHT Inativo')).toBeInTheDocument()
    expect(screen.getByText('Latência: 0ms')).toBeInTheDocument()
  })

  it('shows connected status when P2P is connected', () => {
    // Mock connected state
    const { P2PManager } = require('../../p2p/P2PManager')
    P2PManager.mockImplementation(() => ({
      getNetworkStatus: jest.fn().mockReturnValue({
        connected: true,
        peerCount: 5,
        dhtConnected: true,
        latency: 150,
        bandwidth: { up: 100, down: 200 }
      }),
      initialize: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }))

    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByText('Peers: 5')).toBeInTheDocument()
    expect(screen.getByText('DHT Ativo')).toBeInTheDocument()
    expect(screen.getByText('Latência: 150ms')).toBeInTheDocument()
  })

  it('handles connection button click', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    // Should show connecting state
    expect(screen.getByText('Conectando...')).toBeInTheDocument()
  })

  it('shows disconnect button when connected', () => {
    // Mock connected state by modifying the mock implementation
    const { P2PManager } = require('../../p2p/P2PManager')
    P2PManager.mockImplementation(() => ({
      getNetworkStatus: jest.fn().mockReturnValue({
        connected: true,
        peerCount: 3,
        dhtConnected: true,
        latency: 100,
        bandwidth: { up: 50, down: 100 }
      }),
      initialize: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }))

    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    expect(screen.getByText('Desconectar')).toBeInTheDocument()
  })

  it('shows connection error when connection fails', async () => {
    const user = userEvent.setup()
    const errorMessage = 'Connection failed'
    
    // Mock failed connection
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
      connect: jest.fn().mockRejectedValue(new Error(errorMessage)),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }))

    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })

  it('allows adding STUN servers', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const stunInput = screen.getByPlaceholderText('stun:stun.example.com:19302')
    const addButton = screen.getByText('Adicionar')
    
    await user.type(stunInput, 'stun:stun.test.com:19302')
    await user.click(addButton)
    
    expect(screen.getByDisplayValue('stun:stun.test.com:19302')).toBeInTheDocument()
  })

  it('allows removing STUN servers', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    // Find the first STUN server remove button (🗑️)
    const removeButtons = screen.getAllByText('🗑️')
    const firstRemoveButton = removeButtons[0]
    
    await user.click(firstRemoveButton)
    
    // The default STUN server should be removed
    expect(screen.queryByDisplayValue('stun:stun.l.google.com:19302')).not.toBeInTheDocument()
  })

  it('allows adding TURN servers', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const turnUrlInput = screen.getByPlaceholderText('turn:turn.example.com:3478')
    const turnUsernameInput = screen.getByPlaceholderText('Usuário (opcional)')
    const turnPasswordInput = screen.getByPlaceholderText('Senha (opcional)')
    const addTurnButton = screen.getByText('Adicionar Servidor TURN')
    
    await user.type(turnUrlInput, 'turn:turn.test.com:3478')
    await user.type(turnUsernameInput, 'testuser')
    await user.type(turnPasswordInput, 'testpass')
    await user.click(addTurnButton)
    
    expect(screen.getByText('turn:turn.test.com:3478')).toBeInTheDocument()
    expect(screen.getByText('Usuário: testuser')).toBeInTheDocument()
  })

  it('updates basic settings', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const maxPeersInput = screen.getByDisplayValue('50')
    await user.clear(maxPeersInput)
    await user.type(maxPeersInput, '100')
    
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  it('toggles advanced settings visibility', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const showAdvancedButton = screen.getByText('Mostrar')
    await user.click(showAdvancedButton)
    
    expect(screen.getByText('Intervalo de Descoberta (ms)')).toBeInTheDocument()
    expect(screen.getByText('Timeout de Mensagem (ms)')).toBeInTheDocument()
    
    const hideAdvancedButton = screen.getByText('Ocultar')
    await user.click(hideAdvancedButton)
    
    expect(screen.queryByText('Intervalo de Descoberta (ms)')).not.toBeInTheDocument()
  })

  it('resets to default settings', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    // First modify some settings
    const maxPeersInput = screen.getByDisplayValue('50')
    await user.clear(maxPeersInput)
    await user.type(maxPeersInput, '100')
    
    // Then reset
    const resetButton = screen.getByText('Restaurar Padrões')
    await user.click(resetButton)
    
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
  })

  it('handles checkbox toggles', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const autoConnectCheckbox = screen.getByLabelText('Conectar automaticamente')
    const encryptionCheckbox = screen.getByLabelText('Criptografia habilitada')
    
    expect(autoConnectCheckbox).toBeChecked()
    expect(encryptionCheckbox).toBeChecked()
    
    await user.click(autoConnectCheckbox)
    await user.click(encryptionCheckbox)
    
    expect(autoConnectCheckbox).not.toBeChecked()
    expect(encryptionCheckbox).not.toBeChecked()
  })

  it('closes panel when close button is clicked', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const closeButton = screen.getByText('✕')
    await user.click(closeButton)
    
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('closes panel when Fechar button is clicked', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const closeButton = screen.getByText('Fechar')
    await user.click(closeButton)
    
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('validates STUN server input', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const stunInput = screen.getByPlaceholderText('stun:stun.example.com:19302')
    const addButton = screen.getByText('Adicionar')
    
    // Try to add empty STUN server
    await user.click(addButton)
    
    // Should not add empty server (no new input field should appear)
    const stunInputs = screen.getAllByDisplayValue(/stun:/)
    const initialCount = stunInputs.length
    
    // Add valid STUN server
    await user.type(stunInput, 'stun:valid.server.com:19302')
    await user.click(addButton)
    
    const newStunInputs = screen.getAllByDisplayValue(/stun:/)
    expect(newStunInputs.length).toBe(initialCount + 1)
  })

  it('prevents duplicate STUN servers', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const stunInput = screen.getByPlaceholderText('stun:stun.example.com:19302')
    const addButton = screen.getByText('Adicionar')
    
    // Try to add existing STUN server
    await user.type(stunInput, 'stun:stun.l.google.com:19302')
    await user.click(addButton)
    
    // Should not add duplicate (count should remain the same)
    const stunInputs = screen.getAllByDisplayValue('stun:stun.l.google.com:19302')
    expect(stunInputs.length).toBe(1) // Only the original one
  })

  it('updates geohash precision setting', async () => {
    const user = userEvent.setup()
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const precisionSelect = screen.getByDisplayValue('Alta (~2.4km)')
    await user.selectOptions(precisionSelect, 'Muito Alta (~600m)')
    
    expect(screen.getByDisplayValue('Muito Alta (~600m)')).toBeInTheDocument()
  })

  it('shows connecting state during connection', async () => {
    const user = userEvent.setup()
    
    // Mock slow connection
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
      connect: jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100))),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }))

    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    expect(screen.getByText('Conectando...')).toBeInTheDocument()
    expect(screen.getByText('Conectando...')).toBeDisabled()
  })
})