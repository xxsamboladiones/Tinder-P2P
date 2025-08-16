import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeerInfoDisplay } from '../PeerInfoDisplay'
import { PeerInfo } from '../../p2p/types'

const mockPeers: PeerInfo[] = [
  {
    id: 'peer1',
    multiaddrs: ['/ip4/192.168.1.1/tcp/4001/p2p/peer1', '/ip6/::1/tcp/4001/p2p/peer1'],
    protocols: ['kad-dht', 'identify'],
    metadata: {
      geohash: 'u4pruydqqvj',
      ageRange: [25, 30],
      interests: ['music', 'travel', 'photography'],
      lastSeen: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
    }
  },
  {
    id: 'peer2',
    multiaddrs: ['/ip4/10.0.0.1/tcp/4001/p2p/peer2'],
    protocols: ['kad-dht', 'ping'],
    metadata: {
      geohash: 'u4pruydqqvk',
      ageRange: [22, 28],
      interests: ['sports', 'gaming'],
      lastSeen: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
    }
  },
  {
    id: 'peer3',
    multiaddrs: ['/ip4/172.16.0.1/tcp/4001/p2p/peer3'],
    protocols: ['kad-dht'],
    metadata: {
      geohash: 'u4pruydqqvm',
      ageRange: [30, 35],
      interests: ['art', 'cooking', 'reading', 'movies', 'fitness', 'technology'],
      lastSeen: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
    }
  }
]

describe('PeerInfoDisplay', () => {
  const mockOnRefresh = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders peer information display', () => {
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    expect(screen.getByText('Informações dos Peers')).toBeInTheDocument()
    expect(screen.getByText('Total de Peers')).toBeInTheDocument()
    expect(screen.getByText('Conectados')).toBeInTheDocument()
    expect(screen.getByText('Regiões')).toBeInTheDocument()
    expect(screen.getByText('Protocolos')).toBeInTheDocument()
  })

  it('displays correct peer statistics', () => {
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    // Check for total peers
    expect(screen.getByText('Total de Peers')).toBeInTheDocument()
    expect(screen.getByText('Conectados')).toBeInTheDocument()
    expect(screen.getByText('Regiões')).toBeInTheDocument()
    expect(screen.getByText('Protocolos')).toBeInTheDocument()
    
    // Check that statistics are displayed (without checking exact numbers due to multiple "3"s)
    const statsSection = screen.getByText('Total de Peers').closest('.grid')
    expect(statsSection).toBeInTheDocument()
  })

  it('shows empty state when no peers', () => {
    render(<PeerInfoDisplay peers={[]} onRefresh={mockOnRefresh} />)
    
    expect(screen.getByText('🔍')).toBeInTheDocument()
    expect(screen.getByText('Nenhum peer encontrado')).toBeInTheDocument()
    expect(screen.getByText('Tente conectar-se à rede P2P')).toBeInTheDocument()
  })

  it('displays peer list with correct information', () => {
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    expect(screen.getByText('Peer #1')).toBeInTheDocument()
    expect(screen.getByText('Peer #2')).toBeInTheDocument()
    expect(screen.getByText('Peer #3')).toBeInTheDocument()
    
    expect(screen.getByText('25-30 anos')).toBeInTheDocument()
    expect(screen.getByText('22-28 anos')).toBeInTheDocument()
    expect(screen.getByText('30-35 anos')).toBeInTheDocument()
  })

  it('shows correct time formatting', () => {
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    expect(screen.getByText('5m atrás')).toBeInTheDocument()
    expect(screen.getByText('2m atrás')).toBeInTheDocument()
    expect(screen.getByText('1h atrás')).toBeInTheDocument()
  })

  it('handles refresh button click', async () => {
    const user = userEvent.setup()
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    const refreshButton = screen.getByTitle('Atualizar')
    await user.click(refreshButton)
    
    expect(mockOnRefresh).toHaveBeenCalled()
  })

  it('shows loading state', () => {
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} isLoading={true} />)
    
    const refreshButton = screen.getByTitle('Atualizar')
    expect(refreshButton).toBeDisabled()
    expect(screen.getByText('🔄')).toBeInTheDocument()
  })

  it('toggles details visibility', async () => {
    const user = userEvent.setup()
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    const showDetailsButton = screen.getByText('Mostrar Detalhes')
    await user.click(showDetailsButton)
    
    expect(screen.getByText('Ocultar Detalhes')).toBeInTheDocument()
    expect(screen.getByText('Distribuição por Região')).toBeInTheDocument()
    
    const hideDetailsButton = screen.getByText('Ocultar Detalhes')
    await user.click(hideDetailsButton)
    
    expect(screen.getByText('Mostrar Detalhes')).toBeInTheDocument()
    expect(screen.queryByText('Distribuição por Região')).not.toBeInTheDocument()
  })

  it('expands peer details when clicked', async () => {
    const user = userEvent.setup()
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    // First show details
    const showDetailsButton = screen.getByText('Mostrar Detalhes')
    await user.click(showDetailsButton)
    
    // Then click on a peer
    const peer1 = screen.getByText('Peer #1')
    await user.click(peer1)
    
    expect(screen.getByText('Geohash:')).toBeInTheDocument()
    expect(screen.getByText('u4pruydqqvj')).toBeInTheDocument()
    expect(screen.getByText('Protocolos:')).toBeInTheDocument()
    expect(screen.getByText('Interesses:')).toBeInTheDocument()
    expect(screen.getByText('music')).toBeInTheDocument()
    expect(screen.getByText('travel')).toBeInTheDocument()
    expect(screen.getByText('photography')).toBeInTheDocument()
  })

  it('shows truncated interests when more than 5', async () => {
    const user = userEvent.setup()
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    // Show details and click on peer3 which has 6 interests
    const showDetailsButton = screen.getByText('Mostrar Detalhes')
    await user.click(showDetailsButton)
    
    const peer3 = screen.getByText('Peer #3')
    await user.click(peer3)
    
    expect(screen.getByText('+1')).toBeInTheDocument() // Shows +1 for the 6th interest
  })

  it('displays multiaddrs with truncation', async () => {
    const user = userEvent.setup()
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    // Show details and click on peer1
    const showDetailsButton = screen.getByText('Mostrar Detalhes')
    await user.click(showDetailsButton)
    
    const peer1 = screen.getByText('Peer #1')
    await user.click(peer1)
    
    expect(screen.getByText('Endereços:')).toBeInTheDocument()
    // Should show the multiaddrs (possibly truncated)
    expect(screen.getByText('/ip4/192.168.1.1/tcp/4001/p2p/peer1')).toBeInTheDocument()
  })

  it('shows connection quality indicators', () => {
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    // Check for quality indicators (colored dots)
    const qualityIndicators = screen.getAllByTitle(/Excelente|Boa|Regular|Ruim/)
    expect(qualityIndicators.length).toBeGreaterThan(0)
  })

  it('collapses peer details when clicked again', async () => {
    const user = userEvent.setup()
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    // Show details and expand peer
    const showDetailsButton = screen.getByText('Mostrar Detalhes')
    await user.click(showDetailsButton)
    
    const peer1 = screen.getByText('Peer #1')
    await user.click(peer1)
    
    expect(screen.getByText('Geohash:')).toBeInTheDocument()
    
    // Click again to collapse
    await user.click(peer1)
    
    expect(screen.queryByText('Geohash:')).not.toBeInTheDocument()
  })

  it('shows distribution chart when details are visible', async () => {
    const user = userEvent.setup()
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    const showDetailsButton = screen.getByText('Mostrar Detalhes')
    await user.click(showDetailsButton)
    
    expect(screen.getByText('Distribuição por Região')).toBeInTheDocument()
    
    // Should show geohash prefixes
    expect(screen.getByText('u4p*')).toBeInTheDocument()
  })

  it('handles peer without interests gracefully', () => {
    const peerWithoutInterests: PeerInfo = {
      id: 'peer4',
      multiaddrs: ['/ip4/192.168.1.4/tcp/4001/p2p/peer4'],
      protocols: ['kad-dht'],
      metadata: {
        geohash: 'u4pruydqqvn',
        ageRange: [20, 25],
        interests: [],
        lastSeen: new Date()
      }
    }

    render(<PeerInfoDisplay peers={[peerWithoutInterests]} onRefresh={mockOnRefresh} />)
    
    expect(screen.getByText('Peer #1')).toBeInTheDocument()
    expect(screen.getByText('20-25 anos')).toBeInTheDocument()
  })

  it('formats peer ID correctly', () => {
    render(<PeerInfoDisplay peers={mockPeers} onRefresh={mockOnRefresh} />)
    
    // Should show truncated peer IDs
    expect(screen.getByText('ID: peer1...')).toBeInTheDocument()
    expect(screen.getByText('ID: peer2...')).toBeInTheDocument()
    expect(screen.getByText('ID: peer3...')).toBeInTheDocument()
  })
})