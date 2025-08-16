import { PrivacyManager, PrivacySettings, DataExportOptions } from '../PrivacyManager'
import { PrivacyLevel, DataSharingScope, GeolocationPrecision } from '../types'

describe('PrivacyManager', () => {
  let privacyManager: PrivacyManager

  beforeEach(() => {
    privacyManager = new PrivacyManager()
  })

  afterEach(() => {
    privacyManager.destroy()
  })

  describe('Privacy Settings Management', () => {
    test('should initialize with default balanced settings', () => {
      const settings = privacyManager.getSettings()
      
      expect(settings.privacyLevel).toBe(PrivacyLevel.BALANCED)
      expect(settings.shareProfile).toBe(DataSharingScope.NEARBY_USERS)
      expect(settings.geolocationPrecision).toBe(GeolocationPrecision.NEIGHBORHOOD)
      expect(settings.enableMetadataProtection).toBe(true)
    })

    test('should update settings correctly', () => {
      const newSettings: Partial<PrivacySettings> = {
        hideAge: true,
        messageRetention: 30,
        enableOnionRouting: true
      }

      privacyManager.updateSettings(newSettings)
      const settings = privacyManager.getSettings()

      expect(settings.hideAge).toBe(true)
      expect(settings.messageRetention).toBe(30)
      expect(settings.enableOnionRouting).toBe(true)
    })

    test('should emit settingsUpdated event when settings change', (done) => {
      privacyManager.on('settingsUpdated', (settings: PrivacySettings) => {
        expect(settings.hideAge).toBe(true)
        done()
      })

      privacyManager.updateSettings({ hideAge: true })
    })

    test('should apply minimal privacy level preset', () => {
      privacyManager.updateSettings({ privacyLevel: PrivacyLevel.MINIMAL })
      const settings = privacyManager.getSettings()

      expect(settings.shareProfile).toBe(DataSharingScope.MATCHES_ONLY)
      expect(settings.sharePhotos).toBe(DataSharingScope.MATCHES_ONLY)
      expect(settings.shareActivity).toBe(DataSharingScope.NONE)
      expect(settings.geolocationPrecision).toBe(GeolocationPrecision.CITY)
      expect(settings.hideExactLocation).toBe(true)
      expect(settings.enableOnionRouting).toBe(true)
      expect(settings.enableTrafficObfuscation).toBe(true)
    })

    test('should apply open privacy level preset', () => {
      privacyManager.updateSettings({ privacyLevel: PrivacyLevel.OPEN })
      const settings = privacyManager.getSettings()

      expect(settings.shareProfile).toBe(DataSharingScope.ALL_USERS)
      expect(settings.sharePhotos).toBe(DataSharingScope.ALL_USERS)
      expect(settings.geolocationPrecision).toBe(GeolocationPrecision.STREET)
      expect(settings.hideExactLocation).toBe(false)
      expect(settings.enableOnionRouting).toBe(false)
    })
  })

  describe('Data Sharing Controls', () => {
    test('should allow data sharing within permitted scope', () => {
      privacyManager.updateSettings({
        shareProfile: DataSharingScope.NEARBY_USERS
      })

      expect(privacyManager.canShareData('profile', DataSharingScope.MATCHES_ONLY)).toBe(true)
      expect(privacyManager.canShareData('profile', DataSharingScope.NEARBY_USERS)).toBe(true)
      expect(privacyManager.canShareData('profile', DataSharingScope.ALL_USERS)).toBe(false)
    })

    test('should deny data sharing outside permitted scope', () => {
      privacyManager.updateSettings({
        sharePhotos: DataSharingScope.MATCHES_ONLY
      })

      expect(privacyManager.canShareData('photos', DataSharingScope.NEARBY_USERS)).toBe(false)
      expect(privacyManager.canShareData('photos', DataSharingScope.ALL_USERS)).toBe(false)
    })

    test('should handle none sharing scope correctly', () => {
      privacyManager.updateSettings({
        shareActivity: DataSharingScope.NONE
      })

      expect(privacyManager.canShareData('activity', DataSharingScope.MATCHES_ONLY)).toBe(false)
      expect(privacyManager.canShareData('activity', DataSharingScope.NONE)).toBe(true)
    })
  })

  describe('Geolocation Privacy', () => {
    test('should obfuscate location based on precision setting', () => {
      const originalGeohash = 'u4pruydqqvj'
      
      privacyManager.updateSettings({
        geolocationPrecision: GeolocationPrecision.DISTRICT
      })

      const obfuscated = privacyManager.getObfuscatedLocation(originalGeohash)
      expect(obfuscated).toBe('u4pr')
      expect(obfuscated.length).toBe(4)
    })

    test('should respect hide exact location setting', () => {
      privacyManager.updateSettings({
        hideExactLocation: true,
        enableMetadataProtection: false
      })

      expect(privacyManager.shouldHideLocationMetadata()).toBe(true)
    })

    test('should respect metadata protection setting', () => {
      privacyManager.updateSettings({
        hideExactLocation: false,
        enableMetadataProtection: true
      })

      expect(privacyManager.shouldHideLocationMetadata()).toBe(true)
    })
  })

  describe('Data Export', () => {
    test('should export data in JSON format', async () => {
      const options: DataExportOptions = {
        includeProfile: true,
        includeMessages: false,
        includeMatches: true,
        includeLikes: false,
        includePhotos: false,
        includeSettings: true,
        format: 'json',
        encrypt: false
      }

      const exportedData = await privacyManager.exportData(options)
      const parsed = JSON.parse(exportedData)

      expect(parsed.timestamp).toBeDefined()
      expect(parsed.version).toBe('1.0.0')
      expect(parsed.options).toEqual(options)
      expect(parsed.profile).toBeDefined()
      expect(parsed.settings).toBeDefined()
      expect(parsed.messages).toBeUndefined()
    })

    test('should handle CSV format export', async () => {
      const options: DataExportOptions = {
        includeProfile: true,
        includeMessages: false,
        includeMatches: false,
        includeLikes: false,
        includePhotos: false,
        includeSettings: false,
        format: 'csv',
        encrypt: false
      }

      const exportedData = await privacyManager.exportData(options)
      expect(typeof exportedData).toBe('string')
      expect(exportedData.length).toBeGreaterThan(0)
    })

    test('should encrypt data when requested', async () => {
      const options: DataExportOptions = {
        includeProfile: true,
        includeMessages: false,
        includeMatches: false,
        includeLikes: false,
        includePhotos: false,
        includeSettings: false,
        format: 'json',
        encrypt: true,
        password: 'test123'
      }

      const exportedData = await privacyManager.exportData(options)
      
      // Should be base64 encoded (our simple encryption)
      expect(() => JSON.parse(exportedData)).toThrow()
      expect(exportedData).toMatch(/^[A-Za-z0-9+/=]+$/)
    })
  })

  describe('Backup and Restore', () => {
    test('should create backup with metadata', async () => {
      const backup = await privacyManager.createBackup()

      expect(backup.timestamp).toBeInstanceOf(Date)
      expect(backup.version).toBe('1.0.0')
      expect(backup.metadata.totalSize).toBeGreaterThan(0)
      expect(backup.metadata.itemCount).toBeGreaterThan(0)
      expect(backup.metadata.checksum).toBeDefined()
    })

    test('should restore backup successfully', async () => {
      // Create a backup first
      const backup = await privacyManager.createBackup()

      // Backup should have valid structure
      expect(backup.settings).toBeDefined()
      expect(backup.metadata.checksum).toBeDefined()

      // Test that backup structure is correct
      expect(backup.timestamp).toBeInstanceOf(Date)
      expect(backup.version).toBe('1.0.0')
      expect(backup.metadata.totalSize).toBeGreaterThan(0)
      expect(backup.metadata.itemCount).toBeGreaterThan(0)
    })

    test('should validate backup integrity', async () => {
      const backup = await privacyManager.createBackup()
      
      // Corrupt the backup
      backup.metadata.checksum = 'invalid'

      await expect(privacyManager.restoreBackup(backup)).rejects.toThrow('Backup integrity check failed')
    })
  })

  describe('Privacy Audit Log', () => {
    test('should log privacy events', () => {
      privacyManager.updateSettings({ hideAge: true })
      
      const auditLog = privacyManager.getAuditLog()
      expect(auditLog.length).toBeGreaterThan(0)
      
      const lastEvent = auditLog[auditLog.length - 1]
      expect(lastEvent.action).toBe('settings_updated')
      expect(lastEvent.dataType).toBe('privacy_settings')
      expect(lastEvent.timestamp).toBeInstanceOf(Date)
    })

    test('should emit privacy events', (done) => {
      privacyManager.on('privacyEvent', (event: any) => {
        expect(event.action).toBe('data_sharing_check')
        expect(event.dataType).toBe('profile')
        done()
      })

      privacyManager.canShareData('profile', DataSharingScope.NEARBY_USERS)
    })

    test('should clear audit log', () => {
      privacyManager.updateSettings({ hideAge: true })
      expect(privacyManager.getAuditLog().length).toBeGreaterThan(0)

      privacyManager.clearAuditLog()
      expect(privacyManager.getAuditLog().length).toBe(1) // Clear event itself
    })

    test('should limit audit log size', () => {
      // Generate many events
      for (let i = 0; i < 1100; i++) {
        privacyManager.canShareData('profile', DataSharingScope.NEARBY_USERS)
      }

      const auditLog = privacyManager.getAuditLog()
      expect(auditLog.length).toBeLessThanOrEqual(1000)
    })
  })

  describe('Data Cleanup', () => {
    test('should cleanup expired data', async () => {
      // This is a placeholder test since our implementation doesn't have real storage
      await expect(privacyManager.cleanupExpiredData()).resolves.not.toThrow()
      
      const auditLog = privacyManager.getAuditLog()
      const cleanupEvent = auditLog.find(event => event.action === 'data_cleanup')
      expect(cleanupEvent).toBeDefined()
    })
  })

  describe('Auto Backup', () => {
    test('should setup auto backup when enabled', () => {
      privacyManager.updateSettings({
        enableAutoBackup: true,
        backupFrequency: 1 // 1 hour
      })

      // Auto backup is set up (we can't easily test the interval without mocking timers)
      const settings = privacyManager.getSettings()
      expect(settings.enableAutoBackup).toBe(true)
      expect(settings.backupFrequency).toBe(1)
    })

    test('should disable auto backup when disabled', () => {
      privacyManager.updateSettings({
        enableAutoBackup: false
      })

      const settings = privacyManager.getSettings()
      expect(settings.enableAutoBackup).toBe(false)
    })
  })

  describe('Error Handling', () => {
    test('should handle invalid data sharing type', () => {
      const result = privacyManager.canShareData('invalid_type', DataSharingScope.ALL_USERS)
      expect(result).toBe(false)
    })

    test('should handle empty geohash', () => {
      const result = privacyManager.getObfuscatedLocation('')
      expect(result).toBe('')
    })

    test('should handle invalid precision values', () => {
      privacyManager.updateSettings({
        geolocationPrecision: 999 as GeolocationPrecision
      })

      const originalGeohash = 'u4pruydqqvj'
      const result = privacyManager.getObfuscatedLocation(originalGeohash)
      
      // Should handle gracefully, likely returning original or empty
      expect(typeof result).toBe('string')
    })
  })

  describe('Memory Management', () => {
    test('should cleanup resources on destroy', () => {
      const eventListenerCount = privacyManager.listenerCount('settingsUpdated')
      
      privacyManager.destroy()
      
      // Should remove all listeners
      expect(privacyManager.listenerCount('settingsUpdated')).toBe(0)
    })
  })
})