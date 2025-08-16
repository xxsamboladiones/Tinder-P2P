import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { P2PConfigPanel } from '../P2PConfigPanel'
import { PeerInfoDisplay } from '../PeerInfoDisplay'
import { PeerInfo } from '../../p2p/types'

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
    disconnect: jest.fn().mockResolvedValue(undefined),
    discoverPeers: jest.fn().mockResolvedValue([])
  }))
}))

describe('P2P Configuration Integration', () => {
  const mockOnClose = jest.fn()

  const mockPeers: PeerInfo[] = [
    {
      id: 'integration-peer-1',
      multiaddrs: ['/ip4/192.168.1.100/tcp/4001/p2p/integration-peer-1'],
      protocols: ['kad-dht', 'identify'],
      metadata: {
        geohash: 'u4pruydqqvj',
        ageRange: [25, 30],
        interests: ['music', 'travel'],
        lastSeen: new Date(Date.now() - 2 * 60 * 1000)
      }
    },
    {
      id: 'integration-peer-2',
      multiaddrs: ['/ip4/10.0.0.100/tcp/4001/p2p/integration-peer-2'],
      protocols: ['kad-dht', 'ping'],
      metadata: {
        geohash: 'u4pruydqqvk',
        ageRange: [22, 28],
        interests: ['sports', 'gaming'],
        lastSeen: new Date(Date.now() - 5 * 60 * 1000)
      }
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('integrates P2P configuration with peer discovery', async () => {
    const user = userEvent.setup()
    
    // Render both components
    const { rerender } = render(
      <div>
        <P2PConfigPanel onClose={mockOnClose} />
        <PeerInfoDisplay peers={[]} />
      </div>
    )
    
    // Initially no peers
    expect(screen.getByText('Nenhum peer encontrado')).toBeInTheDocument()
    
    // Connect to P2P network
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    // Wait for connection attempt
    await waitFor(() => {
      expect(screen.getByText('Conectando...')).toBeInTheDocument()
    })
    
    // Rerender with discovered peers
    rerender(
      <div>
        <P2PConfigPanel onClose={mockOnClose} />
        <PeerInfoDisplay peers={mockPeers} />
      </div>
    )
    
    // Should now show connected status and peers
    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByText('Peers: 2')).toBeInTheDocument()
    expect(screen.getByText('Peer #1')).toBeInTheDocument()
    expect(screen.getByText('Peer #2')).toBeInTheDocument()
  })

  it('handles connection failure gracefully', async () => {
    const user = userEvent.setup()
    const errorMessage = 'Network connection failed'
    mockP2PManager.connect.mockRejectedValue(new Error(errorMessage))
    
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
    
    // Status should remain disconnected
    expect(screen.getByText('Desconectado')).toBeInTheDocument()
    expect(screen.getByText('Peers: 0')).toBeInTheDocument()
  })

  it('updates peer information when network status changes', async () => {
    const user = userEvent.setup()
    
    // Start with connected state
    mockP2PManager.getNetworkStatus.mockReturnValue({
      connected: true,
      peerCount: 2,
      dhtConnected: true,
      latency: 150,
      bandwidth: { up: 100, down: 200 }
    })
    
    const { rerender } = render(
      <div>
        <P2PConfigPanel onClose={mockOnClose} />
        <PeerInfoDisplay peers={mockPeers} />
      </div>
    )
    
    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByText('Peer #1')).toBeInTheDocument()
    
    // Disconnect
    const disconnectButton = screen.getByText('Desconectar')
    await user.click(disconnectButton)
    
    // Update status to disconnected
    mockP2PManager.getNetworkStatus.mockReturnValue({
      connected: false,
      peerCount: 0,
      dhtConnected: false,
      latency: 0,
      bandwidth: { up: 0, down: 0 }
    })
    
    // Rerender with no peers
    rerender(
      <div>
        <P2PConfigPanel onClose={mockOnClose} />
        <PeerInfoDisplay peers={[]} />
      </div>
    )
    
    expect(screen.getByText('Desconectado')).toBeInTheDocument()
    expect(screen.getByText('Nenhum peer encontrado')).toBeInTheDocument()
  })

  it('reflects configuration changes in network behavior', async () => {
    const user = userEvent.setup()
    
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    // Change max peers setting
    const maxPeersInput = screen.getByDisplayValue('50')
    await user.clear(maxPeersInput)
    await user.type(maxPeersInput, '25')
    
    // Add custom STUN server
    const stunInput = screen.getByPlaceholderText('stun:stun.example.com:19302')
    await user.type(stunInput, 'stun:custom.server.com:19302')
    await user.click(screen.getByText('Adicionar'))
    
    // Connect with new settings
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    // Verify P2P manager was called with updated configuration
    await waitFor(() => {
      expect(mockP2PManager.initialize).toHaveBeenCalled()
      expect(mockP2PManager.connect).toHaveBeenCalled()
    })
    
    // The configuration should include the custom STUN server
    expect(screen.getByDisplayValue('stun:custom.server.com:19302')).toBeInTheDocument()
  })

  it('maintains peer information during configuration changes', async () => {
    const user = userEvent.setup()
    
    // Start with connected state and peers
    mockP2PManager.getNetworkStatus.mockReturnValue({
      connected: true,
      peerCount: 2,
      dhtConnected: true,
      latency: 150,
      bandwidth: { up: 100, down: 200 }
    })
    
    render(
      <div>
        <P2PConfigPanel onClose={mockOnClose} />
        <PeerInfoDisplay peers={mockPeers} />
      </div>
    )
    
    // Verify initial state
    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByText('Peer #1')).toBeInTheDocument()
    
    // Show advanced settings and modify them
    const showAdvancedButton = screen.getByText('Mostrar')
    await user.click(showAdvancedButton)
    
    const discoveryIntervalInput = screen.getByDisplayValue('30000')
    await user.clear(discoveryIntervalInput)
    await user.type(discoveryIntervalInput, '60000')
    
    // Peer information should still be visible
    expect(screen.getByText('Peer #1')).toBeInTheDocument()
    expect(screen.getByText('Peer #2')).toBeInTheDocument()
  })

  it('shows real-time network statistics', async () => {
    const user = userEvent.setup()
    
    // Mock changing network status over time
    let callCount = 0
    mockP2PManager.getNetworkStatus.mockImplementation(() => {
      callCount++
      return {
        connected: true,
        peerCount: callCount, // Simulate changing peer count
        dhtConnected: true,
        latency: 100 + callCount * 10, // Simulate changing latency
        bandwidth: { up: 50 + callCount, down: 100 + callCount }
      }
    })
    
    render(<P2PConfigPanel onClose={mockOnClose} />)
    
    // Connect first
    const connectButton = screen.getByText('Conectar')
    await user.click(connectButton)
    
    // Wait for status updates (the component updates every 2 seconds)
    await waitFor(() => {
      expect(screen.getByText('Conectado')).toBeInTheDocument()
    }, { timeout: 3000 })
    
    // Should show updated statistics
    expect(mockP2PManager.getNetworkStatus).toHaveBeenCalledTimes(1)
  })

  it('handles peer refresh functionality', async () => {
    const user = userEvent.setup()
    const mockOnRefresh = jest.fn()
    
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    const refreshButton = screen.getByTitle('Atualizar')
    await user.click(refreshButton)
    
    expect(mockOnRefresh).toHaveBeenCalled()
  })

  it('displays peer details correctly after configuration', async () => {
    const user = userEvent.setup()
    
    render(
      <div>
        <P2PConfigPanel onClose={mockOnClose} />
        <PeerInfoDisplay peers={mockPeers} />
      </div>
    )
    
    // Show peer details
    const showDetailsButton = screen.getByText('Mostrar Detalhes')
    await user.click(showDetailsButton)
    
    // Click on first peer
    const peer1 = screen.getByText('Peer #1')
    await user.click(peer1)
    
    // Should show detailed peer information
    expect(screen.getByText('Geohash:')).toBeInTheDocument()
    expect(screen.getByText('u4pruydqqvj')).toBeInTheDocument()
    expect(screen.getByText('Protocolos:')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // Protocol count
    expect(screen.getByText('Interesses:')).toBeInTheDocument()
    expect(screen.getByText('music')).toBeInTheDocument()
    expect(screen.getByText('travel')).toBeInTheDocument()
  })
})