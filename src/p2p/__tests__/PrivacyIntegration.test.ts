import { PrivacyManager } from '../PrivacyManager'
import { P2PManager } from '../P2PManager'
import { PrivacyLevel, DataSharingScope, GeolocationPrecision } from '../types'

// Mock P2PManager for integration testing
jest.mock('../P2PManager', () => {
  return {
    P2PManager: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      getNetworkStatus: jest.fn().mockReturnValue({
        connected: true,
        peerCount: 5,
        dhtConnected: true,
        latency: 50,
        bandwidth: { up: 100, down: 200 }
      }),
      broadcastProfile: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      discoverPeers: jest.fn().mockResolvedValue([]),
      on: jest.fn(),
      off: jest.fn()
    }))
  }
})

describe('Privacy Integration Tests', () => {
  let privacyManager: PrivacyManager
  let p2pManager: P2PManager

  beforeEach(() => {
    privacyManager = new PrivacyManager()
    p2pManager = new P2PManager()
  })

  afterEach(() => {
    privacyManager.destroy()
  })

  describe('Privacy-Aware Data Sharing', () => {
    test('should respect privacy settings when sharing profile data', () => {
      // Set minimal privacy
      privacyManager.updateSettings({
        privacyLevel: PrivacyLevel.MINIMAL,
        shareProfile: DataSharingScope.MATCHES_ONLY
      })

      // Test data sharing permissions
      expect(privacyManager.canShareData('profile', DataSharingScope.MATCHES_ONLY)).toBe(true)
      expect(privacyManager.canShareData('profile', DataSharingScope.NEARBY_USERS)).toBe(false)
      expect(privacyManager.canShareData('profile', DataSharingScope.ALL_USERS)).toBe(false)
    })

    test('should apply geolocation obfuscation based on privacy settings', () => {
      const originalGeohash = 'u4pruydqqvj8'
      
      // Test different precision levels
      privacyManager.updateSettings({
        geolocationPrecision: GeolocationPrecision.CITY
      })
      expect(privacyManager.getObfuscatedLocation(originalGeohash)).toBe('u4p')

      privacyManager.updateSettings({
        geolocationPrecision: GeolocationPrecision.NEIGHBORHOOD
      })
      expect(privacyManager.getObfuscatedLocation(originalGeohash)).toBe('u4pru')
    })

    test('should handle photo sharing based on privacy level', () => {
      // Minimal privacy - photos only to matches
      privacyManager.updateSettings({
        privacyLevel: PrivacyLevel.MINIMAL
      })
      expect(privacyManager.canShareData('photos', DataSharingScope.MATCHES_ONLY)).toBe(true)
      expect(privacyManager.canShareData('photos', DataSharingScope.NEARBY_USERS)).toBe(false)

      // Open privacy - photos to all users
      privacyManager.updateSettings({
        privacyLevel: PrivacyLevel.OPEN
      })
      expect(privacyManager.canShareData('photos', DataSharingScope.ALL_USERS)).toBe(true)
    })
  })

  describe('Privacy Event Logging', () => {
    test('should log data sharing decisions', () => {
      const initialLogLength = privacyManager.getAuditLog().length

      // Perform data sharing checks
      privacyManager.canShareData('profile', DataSharingScope.NEARBY_USERS, 'user123')
      privacyManager.canShareData('photos', DataSharingScope.MATCHES_ONLY, 'user456')

      const auditLog = privacyManager.getAuditLog()
      expect(auditLog.length).toBe(initialLogLength + 2)

      const profileEvent = auditLog.find(event => 
        event.action === 'data_sharing_check' && event.dataType === 'profile'
      )
      expect(profileEvent).toBeDefined()
      expect(profileEvent?.details.userId).toBe('user123')
    })

    test('should log location obfuscation events', () => {
      const initialLogLength = privacyManager.getAuditLog().length

      privacyManager.getObfuscatedLocation('u4pruydqqvj8')

      const auditLog = privacyManager.getAuditLog()
      expect(auditLog.length).toBe(initialLogLength + 1)

      const locationEvent = auditLog.find(event => 
        event.action === 'location_obfuscation'
      )
      expect(locationEvent).toBeDefined()
      expect(locationEvent?.dataType).toBe('geolocation')
    })
  })

  describe('Privacy Settings Persistence', () => {
    test('should maintain privacy settings across sessions', async () => {
      // Update settings
      const customSettings = {
        privacyLevel: PrivacyLevel.CUSTOM,
        hideAge: true,
        enableOnionRouting: true,
        messageRetention: 30
      }
      
      privacyManager.updateSettings(customSettings)
      
      // Create backup to simulate persistence
      const backup = await privacyManager.createBackup()
      expect(backup.settings).toBeDefined()
      expect(backup.settings?.hideAge).toBe(true)
      expect(backup.settings?.enableOnionRouting).toBe(true)
    })

    test('should validate backup integrity', async () => {
      const backup = await privacyManager.createBackup()
      
      // Backup should have valid checksum
      expect(backup.metadata.checksum).toBeDefined()
      expect(backup.metadata.checksum.length).toBeGreaterThan(0)
      
      // Test that backup structure is correct
      expect(backup.timestamp).toBeInstanceOf(Date)
      expect(backup.version).toBe('1.0.0')
      expect(backup.metadata.totalSize).toBeGreaterThan(0)
      expect(backup.metadata.itemCount).toBeGreaterThan(0)
    })
  })

  describe('Data Export Integration', () => {
    test('should export comprehensive privacy data', async () => {
      // Generate some privacy events
      privacyManager.updateSettings({ hideAge: true })
      privacyManager.canShareData('profile', DataSharingScope.NEARBY_USERS)
      
      const exportOptions = {
        includeProfile: true,
        includeMessages: true,
        includeMatches: true,
        includeLikes: false,
        includePhotos: true,
        includeSettings: true,
        format: 'json' as const,
        encrypt: false
      }

      const exportedData = await privacyManager.exportData(exportOptions)
      const parsed = JSON.parse(exportedData)

      expect(parsed.settings).toBeDefined()
      expect(parsed.settings.hideAge).toBe(true)
      expect(parsed.timestamp).toBeDefined()
      expect(parsed.version).toBe('1.0.0')
    })

    test('should handle encrypted export', async () => {
      const exportOptions = {
        includeProfile: true,
        includeMessages: false,
        includeMatches: false,
        includeLikes: false,
        includePhotos: false,
        includeSettings: true,
        format: 'json' as const,
        encrypt: true,
        password: 'test123'
      }

      const exportedData = await privacyManager.exportData(exportOptions)
      
      // Should be encrypted (base64 in our simple implementation)
      expect(() => JSON.parse(exportedData)).toThrow()
      expect(exportedData).toMatch(/^[A-Za-z0-9+/=]+$/)
    })
  })

  describe('Privacy Level Presets', () => {
    test('should apply minimal privacy preset correctly', () => {
      privacyManager.updateSettings({ privacyLevel: PrivacyLevel.MINIMAL })
      const settings = privacyManager.getSettings()

      expect(settings.shareProfile).toBe(DataSharingScope.MATCHES_ONLY)
      expect(settings.sharePhotos).toBe(DataSharingScope.MATCHES_ONLY)
      expect(settings.shareActivity).toBe(DataSharingScope.NONE)
      expect(settings.geolocationPrecision).toBe(GeolocationPrecision.CITY)
      expect(settings.hideExactLocation).toBe(true)
      expect(settings.enableOnionRouting).toBe(true)
      expect(settings.enableTrafficObfuscation).toBe(true)
      expect(settings.enableMetadataProtection).toBe(true)
    })

    test('should apply balanced privacy preset correctly', () => {
      privacyManager.updateSettings({ privacyLevel: PrivacyLevel.BALANCED })
      const settings = privacyManager.getSettings()

      expect(settings.shareProfile).toBe(DataSharingScope.NEARBY_USERS)
      expect(settings.sharePhotos).toBe(DataSharingScope.NEARBY_USERS)
      expect(settings.shareActivity).toBe(DataSharingScope.MATCHES_ONLY)
      expect(settings.geolocationPrecision).toBe(GeolocationPrecision.NEIGHBORHOOD)
      expect(settings.hideExactLocation).toBe(false)
      expect(settings.enableOnionRouting).toBe(false)
      expect(settings.enableMetadataProtection).toBe(true)
    })

    test('should apply open privacy preset correctly', () => {
      privacyManager.updateSettings({ privacyLevel: PrivacyLevel.OPEN })
      const settings = privacyManager.getSettings()

      expect(settings.shareProfile).toBe(DataSharingScope.ALL_USERS)
      expect(settings.sharePhotos).toBe(DataSharingScope.ALL_USERS)
      expect(settings.shareActivity).toBe(DataSharingScope.NEARBY_USERS)
      expect(settings.geolocationPrecision).toBe(GeolocationPrecision.STREET)
      expect(settings.hideExactLocation).toBe(false)
      expect(settings.enableOnionRouting).toBe(false)
      expect(settings.enableMetadataProtection).toBe(false)
    })
  })

  describe('Data Retention and Cleanup', () => {
    test('should handle data cleanup based on retention settings', async () => {
      privacyManager.updateSettings({
        messageRetention: 7,
        locationHistoryRetention: 30,
        profileCacheRetention: 3
      })

      // Cleanup should not throw
      await expect(privacyManager.cleanupExpiredData()).resolves.not.toThrow()

      // Should log cleanup event
      const auditLog = privacyManager.getAuditLog()
      const cleanupEvent = auditLog.find(event => event.action === 'data_cleanup')
      expect(cleanupEvent).toBeDefined()
    })

    test('should respect auto-delete settings', () => {
      privacyManager.updateSettings({
        autoDeleteMatches: true,
        matchRetention: 90
      })

      const settings = privacyManager.getSettings()
      expect(settings.autoDeleteMatches).toBe(true)
      expect(settings.matchRetention).toBe(90)
    })
  })

  describe('Advanced Privacy Features', () => {
    test('should handle metadata protection settings', () => {
      privacyManager.updateSettings({
        enableMetadataProtection: true,
        hideExactLocation: false
      })

      expect(privacyManager.shouldHideLocationMetadata()).toBe(true)

      privacyManager.updateSettings({
        enableMetadataProtection: false,
        hideExactLocation: true
      })

      expect(privacyManager.shouldHideLocationMetadata()).toBe(true)
    })

    test('should handle onion routing and traffic obfuscation', () => {
      privacyManager.updateSettings({
        enableOnionRouting: true,
        enableTrafficObfuscation: true
      })

      const settings = privacyManager.getSettings()
      expect(settings.enableOnionRouting).toBe(true)
      expect(settings.enableTrafficObfuscation).toBe(true)
    })
  })

  describe('Error Scenarios', () => {
    test('should handle invalid privacy settings gracefully', () => {
      // Should not throw on invalid enum values
      expect(() => {
        privacyManager.updateSettings({
          privacyLevel: 'invalid' as PrivacyLevel
        })
      }).not.toThrow()
    })

    test('should handle backup corruption gracefully', async () => {
      const backup = await privacyManager.createBackup()
      
      // Corrupt the backup
      backup.metadata.checksum = 'corrupted'
      
      await expect(privacyManager.restoreBackup(backup))
        .rejects.toThrow('Backup integrity check failed')
    })

    test('should handle export errors gracefully', async () => {
      // Mock a scenario where export might fail
      const exportOptions = {
        includeProfile: true,
        includeMessages: true,
        includeMatches: true,
        includeLikes: true,
        includePhotos: true,
        includeSettings: true,
        format: 'json' as const,
        encrypt: false
      }

      // Should not throw even with all options enabled
      await expect(privacyManager.exportData(exportOptions)).resolves.toBeDefined()
    })
  })

  describe('Performance Considerations', () => {
    test('should handle large audit logs efficiently', () => {
      // Generate many events
      for (let i = 0; i < 1100; i++) {
        privacyManager.canShareData('profile', DataSharingScope.NEARBY_USERS)
      }

      const auditLog = privacyManager.getAuditLog()
      
      // Should limit log size to prevent memory issues
      expect(auditLog.length).toBeLessThanOrEqual(1000)
    })

    test('should cleanup resources properly', () => {
      const eventCount = privacyManager.listenerCount('settingsUpdated')
      
      privacyManager.destroy()
      
      // Should remove all listeners
      expect(privacyManager.listenerCount('settingsUpdated')).toBe(0)
    })
  })
})