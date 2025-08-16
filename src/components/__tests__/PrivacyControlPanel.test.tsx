import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PrivacyControlPanel } from '../PrivacyControlPanel'
import { PrivacyLevel, DataSharingScope, GeolocationPrecision } from '../../p2p/types'

// Mock the PrivacyManager
jest.mock('../../p2p/PrivacyManager', () => {
  const mockPrivacyManager = {
    getSettings: jest.fn(() => ({
      privacyLevel: 'balanced',
      shareProfile: 'nearby_users',
      sharePhotos: 'nearby_users',
      shareActivity: 'matches_only',
      shareLocation: 'nearby_users',
      geolocationPrecision: 5,
      hideExactLocation: false,
      locationHistoryRetention: 30,
      hideAge: false,
      hideLastSeen: false,
      hideDistance: false,
      requireMatchForMessage: true,
      blockScreenshots: false,
      messageRetention: 0,
      autoDeleteMatches: false,
      matchRetention: 365,
      profileCacheRetention: 7,
      enableOnionRouting: false,
      enableTrafficObfuscation: false,
      enableMetadataProtection: true,
      enableAutoBackup: true,
      backupFrequency: 24,
      encryptBackups: true
    })),
    updateSettings: jest.fn(),
    exportData: jest.fn(() => Promise.resolve('{"exported": "data"}')),
    createBackup: jest.fn(() => Promise.resolve({
      timestamp: new Date(),
      version: '1.0.0',
      metadata: { totalSize: 1000, itemCount: 5, checksum: 'abc123' }
    })),
    getAuditLog: jest.fn(() => [
      {
        timestamp: new Date(),
        action: 'settings_updated',
        dataType: 'privacy_settings',
        scope: 'none',
        details: { test: 'data' }
      }
    ]),
    clearAuditLog: jest.fn(),
    cleanupExpiredData: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    off: jest.fn(),
    destroy: jest.fn()
  }

  return {
    PrivacyManager: jest.fn(() => mockPrivacyManager),
    PrivacyLevel: {
      MINIMAL: 'minimal',
      BALANCED: 'balanced',
      OPEN: 'open',
      CUSTOM: 'custom'
    },
    DataSharingScope: {
      NONE: 'none',
      MATCHES_ONLY: 'matches_only',
      NEARBY_USERS: 'nearby_users',
      ALL_USERS: 'all_users'
    },
    GeolocationPrecision: {
      CITY: 3,
      DISTRICT: 4,
      NEIGHBORHOOD: 5,
      STREET: 6,
      BUILDING: 7
    }
  }
})

// Mock URL.createObjectURL and related APIs
global.URL.createObjectURL = jest.fn(() => 'mock-url')
global.URL.revokeObjectURL = jest.fn()

// Mock document.createElement for download functionality
const mockClick = jest.fn()
const mockAppendChild = jest.fn()
const mockRemoveChild = jest.fn()

Object.defineProperty(document, 'createElement', {
  value: jest.fn(() => ({
    href: '',
    download: '',
    click: mockClick,
  }))
})

Object.defineProperty(document.body, 'appendChild', {
  value: mockAppendChild
})

Object.defineProperty(document.body, 'removeChild', {
  value: mockRemoveChild
})

describe('PrivacyControlPanel', () => {
  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock window.alert
    window.alert = jest.fn()
  })

  test('should render privacy control panel', () => {
    render(<PrivacyControlPanel onClose={mockOnClose} />)
    
    expect(screen.getByText('Controles de Privacidade')).toBeInTheDocument()
    expect(screen.getByText('Geral')).toBeInTheDocument()
    expect(screen.getByText('Dados')).toBeInTheDocument()
    expect(screen.getByText('Localização')).toBeInTheDocument()
    expect(screen.getByText('Exportar')).toBeInTheDocument()
    expect(screen.getByText('Auditoria')).toBeInTheDocument()
  })

  test('should close panel when close button is clicked', () => {
    render(<PrivacyControlPanel onClose={mockOnClose} />)
    
    const closeButton = screen.getByText('✕')
    fireEvent.click(closeButton)
    
    expect(mockOnClose).toHaveBeenCalled()
  })

  describe('General Tab', () => {
    test('should display privacy level options', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      expect(screen.getByText('Nível de Privacidade')).toBeInTheDocument()
      expect(screen.getByDisplayValue('balanced')).toBeChecked()
      expect(screen.getByText('Máxima privacidade - compartilha apenas dados essenciais')).toBeInTheDocument()
    })

    test('should update privacy level when changed', () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const minimalRadio = screen.getByDisplayValue('minimal')
      fireEvent.click(minimalRadio)
      
      expect(mockInstance.updateSettings).toHaveBeenCalledWith({ privacyLevel: 'minimal' })
    })

    test('should display profile privacy controls', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      expect(screen.getByText('Privacidade do Perfil')).toBeInTheDocument()
      expect(screen.getByText('Ocultar idade')).toBeInTheDocument()
      expect(screen.getByText('Ocultar última visualização')).toBeInTheDocument()
      expect(screen.getByText('Ocultar distância')).toBeInTheDocument()
    })

    test('should toggle profile privacy settings', () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const hideAgeCheckbox = screen.getByRole('checkbox', { name: /ocultar idade/i })
      fireEvent.click(hideAgeCheckbox)
      
      expect(mockInstance.updateSettings).toHaveBeenCalledWith({ hideAge: true })
    })

    test('should display communication privacy controls', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      expect(screen.getByText('Privacidade de Comunicação')).toBeInTheDocument()
      expect(screen.getByText('Exigir match para mensagens')).toBeInTheDocument()
      expect(screen.getByText('Bloquear capturas de tela')).toBeInTheDocument()
    })
  })

  describe('Data Tab', () => {
    test('should switch to data tab', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const dataTab = screen.getByText('Dados')
      fireEvent.click(dataTab)
      
      expect(screen.getByText('Controles de Compartilhamento')).toBeInTheDocument()
    })

    test('should display data sharing controls', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const dataTab = screen.getByText('Dados')
      fireEvent.click(dataTab)
      
      expect(screen.getByText('Compartilhar perfil')).toBeInTheDocument()
      expect(screen.getByText('Compartilhar fotos')).toBeInTheDocument()
      expect(screen.getByText('Compartilhar atividade')).toBeInTheDocument()
      expect(screen.getByText('Compartilhar localização')).toBeInTheDocument()
    })

    test('should update data sharing settings', () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const dataTab = screen.getByText('Dados')
      fireEvent.click(dataTab)
      
      const profileSelect = screen.getByDisplayValue('nearby_users')
      fireEvent.change(profileSelect, { target: { value: 'matches_only' } })
      
      expect(mockInstance.updateSettings).toHaveBeenCalledWith({ shareProfile: 'matches_only' })
    })

    test('should display advanced privacy options', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const dataTab = screen.getByText('Dados')
      fireEvent.click(dataTab)
      
      expect(screen.getByText('Privacidade Avançada')).toBeInTheDocument()
      expect(screen.getByText('Roteamento Onion')).toBeInTheDocument()
      expect(screen.getByText('Ofuscação de Tráfego')).toBeInTheDocument()
      expect(screen.getByText('Proteção de Metadados')).toBeInTheDocument()
    })
  })

  describe('Location Tab', () => {
    test('should switch to location tab', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const locationTab = screen.getByText('Localização')
      fireEvent.click(locationTab)
      
      expect(screen.getByText('Precisão de Localização')).toBeInTheDocument()
    })

    test('should display geolocation precision options', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const locationTab = screen.getByText('Localização')
      fireEvent.click(locationTab)
      
      expect(screen.getByText('Cidade (~20km de precisão)')).toBeInTheDocument()
      expect(screen.getByText('Bairro (~2.4km de precisão)')).toBeInTheDocument()
      expect(screen.getByText('Rua (~600m de precisão)')).toBeInTheDocument()
    })

    test('should update geolocation precision', () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const locationTab = screen.getByText('Localização')
      fireEvent.click(locationTab)
      
      const cityRadio = screen.getByDisplayValue('3')
      fireEvent.click(cityRadio)
      
      expect(mockInstance.updateSettings).toHaveBeenCalledWith({ geolocationPrecision: 3 })
    })
  })

  describe('Export Tab', () => {
    test('should switch to export tab', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const exportTab = screen.getByText('Exportar')
      fireEvent.click(exportTab)
      
      expect(screen.getByText('Exportar Dados')).toBeInTheDocument()
      expect(screen.getByText('Backup e Restauração')).toBeInTheDocument()
    })

    test('should display export options', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const exportTab = screen.getByText('Exportar')
      fireEvent.click(exportTab)
      
      expect(screen.getByText('Perfil')).toBeInTheDocument()
      expect(screen.getByText('Mensagens')).toBeInTheDocument()
      expect(screen.getByText('Matches')).toBeInTheDocument()
      expect(screen.getByText('Fotos')).toBeInTheDocument()
    })

    test('should export data when button is clicked', async () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const exportTab = screen.getByText('Exportar')
      fireEvent.click(exportTab)
      
      const exportButton = screen.getByText('Exportar Dados')
      fireEvent.click(exportButton)
      
      await waitFor(() => {
        expect(mockInstance.exportData).toHaveBeenCalled()
      })
      
      expect(window.alert).toHaveBeenCalledWith('Dados exportados com sucesso!')
    })

    test('should create backup when button is clicked', async () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const exportTab = screen.getByText('Exportar')
      fireEvent.click(exportTab)
      
      const backupButton = screen.getByText('Criar Backup Manual')
      fireEvent.click(backupButton)
      
      await waitFor(() => {
        expect(mockInstance.createBackup).toHaveBeenCalled()
      })
      
      expect(window.alert).toHaveBeenCalledWith('Backup criado com sucesso!')
    })
  })

  describe('Audit Tab', () => {
    test('should switch to audit tab', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const auditTab = screen.getByText('Auditoria')
      fireEvent.click(auditTab)
      
      expect(screen.getByText('Log de Auditoria de Privacidade')).toBeInTheDocument()
    })

    test('should display audit log entries', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const auditTab = screen.getByText('Auditoria')
      fireEvent.click(auditTab)
      
      expect(screen.getByText('settings_updated')).toBeInTheDocument()
      expect(screen.getByText('privacy_settings')).toBeInTheDocument()
    })

    test('should clear audit log when button is clicked', () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const auditTab = screen.getByText('Auditoria')
      fireEvent.click(auditTab)
      
      const clearButton = screen.getByText('Limpar Log')
      fireEvent.click(clearButton)
      
      expect(mockInstance.clearAuditLog).toHaveBeenCalled()
    })
  })

  describe('Footer Actions', () => {
    test('should cleanup expired data when button is clicked', () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const cleanupButton = screen.getByText('Limpar Dados Expirados')
      fireEvent.click(cleanupButton)
      
      expect(mockInstance.cleanupExpiredData).toHaveBeenCalled()
    })

    test('should close panel when footer close button is clicked', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const closeButtons = screen.getAllByText('Fechar')
      const footerCloseButton = closeButtons[closeButtons.length - 1]
      fireEvent.click(footerCloseButton)
      
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    test('should handle export error gracefully', async () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      mockInstance.exportData.mockRejectedValueOnce(new Error('Export failed'))
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const exportTab = screen.getByText('Exportar')
      fireEvent.click(exportTab)
      
      const exportButton = screen.getByText('Exportar Dados')
      fireEvent.click(exportButton)
      
      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Falha na exportação dos dados')
      })
    })

    test('should handle backup error gracefully', async () => {
      const { PrivacyManager } = require('../../p2p/PrivacyManager')
      const mockInstance = new PrivacyManager()
      mockInstance.createBackup.mockRejectedValueOnce(new Error('Backup failed'))
      
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const exportTab = screen.getByText('Exportar')
      fireEvent.click(exportTab)
      
      const backupButton = screen.getByText('Criar Backup Manual')
      fireEvent.click(backupButton)
      
      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Falha na criação do backup')
      })
    })
  })

  describe('Accessibility', () => {
    test('should have proper ARIA labels and roles', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      // Check for proper form controls
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)
      
      const radioButtons = screen.getAllByRole('radio')
      expect(radioButtons.length).toBeGreaterThan(0)
      
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    test('should support keyboard navigation', () => {
      render(<PrivacyControlPanel onClose={mockOnClose} />)
      
      const firstTab = screen.getByText('Geral')
      firstTab.focus()
      expect(document.activeElement).toBe(firstTab)
    })
  })
})