import React, { useState, useEffect } from 'react'
import { 
  PrivacyManager, 
  PrivacySettings,
  DataExportOptions,
  BackupData,
  PrivacyAuditLog
} from '../p2p/PrivacyManager'
import { 
  PrivacyLevel, 
  DataSharingScope, 
  GeolocationPrecision
} from '../p2p/types'

interface PrivacyControlPanelProps {
  onClose: () => void
}

export function PrivacyControlPanel({ onClose }: PrivacyControlPanelProps) {
  const [privacyManager] = useState(() => new PrivacyManager())
  const [settings, setSettings] = useState<PrivacySettings>(privacyManager.getSettings())
  const [activeTab, setActiveTab] = useState<'general' | 'data' | 'location' | 'export' | 'audit'>('general')
  const [auditLog, setAuditLog] = useState<PrivacyAuditLog[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [exportOptions, setExportOptions] = useState<DataExportOptions>({
    includeProfile: true,
    includeMessages: true,
    includeMatches: true,
    includeLikes: false,
    includePhotos: true,
    includeSettings: true,
    format: 'json',
    encrypt: true
  })

  useEffect(() => {
    const handleSettingsUpdate = (newSettings: PrivacySettings) => {
      setSettings(newSettings)
    }

    const handlePrivacyEvent = (event: PrivacyAuditLog) => {
      setAuditLog(prev => [event, ...prev.slice(0, 99)]) // Keep last 100 events
    }

    privacyManager.on('settingsUpdated', handleSettingsUpdate)
    privacyManager.on('privacyEvent', handlePrivacyEvent)

    // Load initial audit log
    setAuditLog(privacyManager.getAuditLog().slice(-100))

    return () => {
      privacyManager.off('settingsUpdated', handleSettingsUpdate)
      privacyManager.off('privacyEvent', handlePrivacyEvent)
    }
  }, [privacyManager])

  const updateSettings = (updates: Partial<PrivacySettings>) => {
    privacyManager.updateSettings(updates)
  }

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const exportedData = await privacyManager.exportData(exportOptions)
      
      // Create download link
      const blob = new Blob([exportedData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tinder-data-export-${new Date().toISOString().split('T')[0]}.${exportOptions.format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      alert('Dados exportados com sucesso!')
    } catch (error) {
      console.error('Export failed:', error)
      alert('Falha na exportação dos dados')
    } finally {
      setIsExporting(false)
    }
  }

  const handleCreateBackup = async () => {
    setIsBackingUp(true)
    try {
      const backup = await privacyManager.createBackup()
      
      // Create download link for backup
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tinder-backup-${backup.timestamp.toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      alert('Backup criado com sucesso!')
    } catch (error) {
      console.error('Backup failed:', error)
      alert('Falha na criação do backup')
    } finally {
      setIsBackingUp(false)
    }
  }

  const getPrivacyLevelDescription = (level: PrivacyLevel): string => {
    switch (level) {
      case PrivacyLevel.MINIMAL:
        return 'Máxima privacidade - compartilha apenas dados essenciais'
      case PrivacyLevel.BALANCED:
        return 'Privacidade equilibrada - configurações padrão recomendadas'
      case PrivacyLevel.OPEN:
        return 'Mais aberto - compartilha mais dados para melhor matching'
      case PrivacyLevel.CUSTOM:
        return 'Configurações personalizadas pelo usuário'
      default:
        return ''
    }
  }

  const getGeolocationDescription = (precision: GeolocationPrecision): string => {
    switch (precision) {
      case GeolocationPrecision.CITY:
        return 'Cidade (~20km de precisão)'
      case GeolocationPrecision.DISTRICT:
        return 'Distrito (~5km de precisão)'
      case GeolocationPrecision.NEIGHBORHOOD:
        return 'Bairro (~2.4km de precisão)'
      case GeolocationPrecision.STREET:
        return 'Rua (~600m de precisão)'
      case GeolocationPrecision.BUILDING:
        return 'Edifício (~120m de precisão)'
      default:
        return ''
    }
  }

  const renderGeneralTab = () => (
    <div className="space-y-6">
      {/* Privacy Level */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Nível de Privacidade</h3>
        <div className="space-y-3">
          {(Object.values(PrivacyLevel) as string[]).map((level) => (
            <label key={level} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="radio"
                name="privacyLevel"
                value={level}
                checked={settings.privacyLevel === level}
                onChange={(e) => updateSettings({ privacyLevel: e.target.value as PrivacyLevel })}
                className="mt-1 text-red-500 focus:ring-red-500"
              />
              <div>
                <div className="font-medium text-gray-900 capitalize">{level}</div>
                <div className="text-sm text-gray-600">{getPrivacyLevelDescription(level as PrivacyLevel)}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Profile Privacy */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacidade do Perfil</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Ocultar idade</span>
            <input
              type="checkbox"
              checked={settings.hideAge}
              onChange={(e) => updateSettings({ hideAge: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
          
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Ocultar última visualização</span>
            <input
              type="checkbox"
              checked={settings.hideLastSeen}
              onChange={(e) => updateSettings({ hideLastSeen: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
          
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Ocultar distância</span>
            <input
              type="checkbox"
              checked={settings.hideDistance}
              onChange={(e) => updateSettings({ hideDistance: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
        </div>
      </div>

      {/* Communication Privacy */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacidade de Comunicação</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Exigir match para mensagens</span>
            <input
              type="checkbox"
              checked={settings.requireMatchForMessage}
              onChange={(e) => updateSettings({ requireMatchForMessage: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
          
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Bloquear capturas de tela</span>
            <input
              type="checkbox"
              checked={settings.blockScreenshots}
              onChange={(e) => updateSettings({ blockScreenshots: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Retenção de mensagens (dias, 0 = para sempre)
            </label>
            <input
              type="number"
              min="0"
              max="365"
              value={settings.messageRetention}
              onChange={(e) => updateSettings({ messageRetention: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  )

  const renderDataTab = () => (
    <div className="space-y-6">
      {/* Data Sharing Controls */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Controles de Compartilhamento</h3>
        <div className="space-y-4">
          {[
            { key: 'shareProfile', label: 'Compartilhar perfil' },
            { key: 'sharePhotos', label: 'Compartilhar fotos' },
            { key: 'shareActivity', label: 'Compartilhar atividade' },
            { key: 'shareLocation', label: 'Compartilhar localização' }
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
              <select
                value={settings[key as keyof PrivacySettings] as string}
                onChange={(e) => updateSettings({ [key]: e.target.value as DataSharingScope })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value={DataSharingScope.NONE}>Não compartilhar</option>
                <option value={DataSharingScope.MATCHES_ONLY}>Apenas matches</option>
                <option value={DataSharingScope.NEARBY_USERS}>Usuários próximos</option>
                <option value={DataSharingScope.ALL_USERS}>Todos os usuários</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Data Retention */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Retenção de Dados</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Auto-deletar matches antigos</span>
            <input
              type="checkbox"
              checked={settings.autoDeleteMatches}
              onChange={(e) => updateSettings({ autoDeleteMatches: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
          
          {settings.autoDeleteMatches && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Retenção de matches (dias)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={settings.matchRetention}
                onChange={(e) => updateSettings({ matchRetention: parseInt(e.target.value) || 365 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cache de perfis (dias)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={settings.profileCacheRetention}
              onChange={(e) => updateSettings({ profileCacheRetention: parseInt(e.target.value) || 7 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Advanced Privacy */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacidade Avançada</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Roteamento Onion</span>
              <p className="text-xs text-gray-500">Maior anonimato, menor velocidade</p>
            </div>
            <input
              type="checkbox"
              checked={settings.enableOnionRouting}
              onChange={(e) => updateSettings({ enableOnionRouting: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
          
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Ofuscação de Tráfego</span>
              <p className="text-xs text-gray-500">Dificulta análise de tráfego</p>
            </div>
            <input
              type="checkbox"
              checked={settings.enableTrafficObfuscation}
              onChange={(e) => updateSettings({ enableTrafficObfuscation: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
          
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Proteção de Metadados</span>
              <p className="text-xs text-gray-500">Remove metadados sensíveis</p>
            </div>
            <input
              type="checkbox"
              checked={settings.enableMetadataProtection}
              onChange={(e) => updateSettings({ enableMetadataProtection: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
        </div>
      </div>
    </div>
  )

  const renderLocationTab = () => (
    <div className="space-y-6">
      {/* Geolocation Precision */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Precisão de Localização</h3>
        <div className="space-y-3">
          {(Object.values(GeolocationPrecision).filter(v => typeof v === 'number') as number[]).map((precision) => (
            <label key={precision} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="radio"
                name="geolocationPrecision"
                value={precision}
                checked={settings.geolocationPrecision === precision}
                onChange={(e) => updateSettings({ geolocationPrecision: parseInt(e.target.value) as GeolocationPrecision })}
                className="mt-1 text-red-500 focus:ring-red-500"
              />
              <div>
                <div className="font-medium text-gray-900">{getGeolocationDescription(precision as GeolocationPrecision)}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Location Privacy */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacidade de Localização</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Ocultar localização exata</span>
              <p className="text-xs text-gray-500">Mostra apenas área aproximada</p>
            </div>
            <input
              type="checkbox"
              checked={settings.hideExactLocation}
              onChange={(e) => updateSettings({ hideExactLocation: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </label>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Retenção do histórico de localização (dias)
            </label>
            <input
              type="number"
              min="0"
              max="365"
              value={settings.locationHistoryRetention}
              onChange={(e) => updateSettings({ locationHistoryRetention: parseInt(e.target.value) || 30 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">0 = não manter histórico</p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderExportTab = () => (
    <div className="space-y-6">
      {/* Data Export */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Exportar Dados</h3>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Dados para incluir:</h4>
            <div className="space-y-2">
              {[
                { key: 'includeProfile', label: 'Perfil' },
                { key: 'includeMessages', label: 'Mensagens' },
                { key: 'includeMatches', label: 'Matches' },
                { key: 'includeLikes', label: 'Likes' },
                { key: 'includePhotos', label: 'Fotos' },
                { key: 'includeSettings', label: 'Configurações' }
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={exportOptions[key as keyof DataExportOptions] as boolean}
                    onChange={(e) => setExportOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="rounded border-gray-300 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Formato</label>
              <select
                value={exportOptions.format}
                onChange={(e) => setExportOptions(prev => ({ ...prev, format: e.target.value as 'json' | 'csv' | 'xml' }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="xml">XML</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={exportOptions.encrypt}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, encrypt: e.target.checked }))}
                  className="rounded border-gray-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">Criptografar</span>
              </label>
            </div>
          </div>
          
          <button
            onClick={handleExportData}
            disabled={isExporting}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? 'Exportando...' : 'Exportar Dados'}
          </button>
        </div>
      </div>

      {/* Backup & Restore */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Backup e Restauração</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Backup automático</span>
              <p className="text-xs text-gray-500">Cria backups automaticamente</p>
            </div>
            <input
              type="checkbox"
              checked={settings.enableAutoBackup}
              onChange={(e) => updateSettings({ enableAutoBackup: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </div>
          
          {settings.enableAutoBackup && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequência do backup (horas)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={settings.backupFrequency}
                onChange={(e) => updateSettings({ backupFrequency: parseInt(e.target.value) || 24 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Criptografar backups</span>
            <input
              type="checkbox"
              checked={settings.encryptBackups}
              onChange={(e) => updateSettings({ encryptBackups: e.target.checked })}
              className="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
          </div>
          
          <button
            onClick={handleCreateBackup}
            disabled={isBackingUp}
            className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isBackingUp ? 'Criando Backup...' : 'Criar Backup Manual'}
          </button>
        </div>
      </div>
    </div>
  )

  const renderAuditTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Log de Auditoria de Privacidade</h3>
        <button
          onClick={() => {
            privacyManager.clearAuditLog()
            setAuditLog([])
          }}
          className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          Limpar Log
        </button>
      </div>
      
      <div className="max-h-96 overflow-y-auto space-y-2">
        {auditLog.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nenhum evento de privacidade registrado</p>
        ) : (
          auditLog.map((event, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-gray-900">{event.action}</span>
                <span className="text-xs text-gray-500">
                  {event.timestamp.toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-gray-600">
                <span className="font-medium">Tipo:</span> {event.dataType}
                {event.userId && (
                  <>
                    <span className="ml-2 font-medium">Usuário:</span> {event.userId.substring(0, 8)}...
                  </>
                )}
              </div>
              {Object.keys(event.details).length > 0 && (
                <div className="mt-1 text-xs text-gray-500">
                  {JSON.stringify(event.details, null, 2)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Controles de Privacidade</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex space-x-8">
            {[
              { id: 'general', label: 'Geral' },
              { id: 'data', label: 'Dados' },
              { id: 'location', label: 'Localização' },
              { id: 'export', label: 'Exportar' },
              { id: 'audit', label: 'Auditoria' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'general' && renderGeneralTab()}
          {activeTab === 'data' && renderDataTab()}
          {activeTab === 'location' && renderLocationTab()}
          {activeTab === 'export' && renderExportTab()}
          {activeTab === 'audit' && renderAuditTab()}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => privacyManager.cleanupExpiredData()}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Limpar Dados Expirados
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}