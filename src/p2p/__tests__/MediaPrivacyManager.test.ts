import { MediaPrivacyManager, MediaAccessLevel, MatchStatus } from '../MediaPrivacyManager'

describe('MediaPrivacyManager', () => {
    let manager: MediaPrivacyManager

    beforeEach(async () => {
        // Clear localStorage mock before each test
        jest.clearAllMocks()
        
        manager = new MediaPrivacyManager()
        await manager.initialize()
    })

    afterEach(async () => {
        if (manager) {
            await manager.destroy()
        }
        jest.clearAllMocks()
    })

    describe('Access Control', () => {
        test('should set and get media access rules', async () => {
            const mediaId = 'test-media-1'
            const allowedUsers = ['user1', 'user2']

            await manager.setMediaAccess(mediaId, MediaAccessLevel.SELECTIVE, {
                allowedUsers,
                matchStatusRequired: MatchStatus.MATCHED
            })

            const rule = manager.getMediaAccessRule(mediaId)
            expect(rule).toBeDefined()
            expect(rule!.accessLevel).toBe(MediaAccessLevel.SELECTIVE)
            expect(rule!.allowedUsers).toEqual(allowedUsers)
            expect(rule!.matchStatusRequired).toBe(MatchStatus.MATCHED)
        })

        test('should grant access for public media', async () => {
            const mediaId = 'public-media'
            await manager.setMediaAccess(mediaId, MediaAccessLevel.PUBLIC)

            const response = await manager.checkMediaAccess(mediaId, 'any-user', MatchStatus.NO_INTERACTION)
            expect(response.granted).toBe(true)
            expect(response.accessToken).toBeDefined()
        })

        test('should deny access for private media', async () => {
            const mediaId = 'private-media'
            await manager.setMediaAccess(mediaId, MediaAccessLevel.PRIVATE)

            const response = await manager.checkMediaAccess(mediaId, 'any-user', MatchStatus.MATCHED)
            expect(response.granted).toBe(false)
            expect(response.reason).toBe('Media is private')
        })

        test('should grant access for matches only when matched', async () => {
            const mediaId = 'match-media'
            await manager.setMediaAccess(mediaId, MediaAccessLevel.MATCHES_ONLY)

            // Should deny for non-matched users
            const deniedResponse = await manager.checkMediaAccess(mediaId, 'user1', MatchStatus.LIKED)
            expect(deniedResponse.granted).toBe(false)
            expect(deniedResponse.reason).toBe('Access requires mutual match')

            // Should grant for matched users
            const grantedResponse = await manager.checkMediaAccess(mediaId, 'user1', MatchStatus.MATCHED)
            expect(grantedResponse.granted).toBe(true)
            expect(grantedResponse.accessToken).toBeDefined()
        })

        test('should handle selective access with allowed users', async () => {
            const mediaId = 'selective-media'
            const allowedUsers = ['user1', 'user2']

            await manager.setMediaAccess(mediaId, MediaAccessLevel.SELECTIVE, {
                allowedUsers,
                matchStatusRequired: MatchStatus.MATCHED
            })

            // Should deny for users not in allowed list
            const deniedResponse = await manager.checkMediaAccess(mediaId, 'user3', MatchStatus.MATCHED)
            expect(deniedResponse.granted).toBe(false)
            expect(deniedResponse.reason).toBe('User not in allowed list')

            // Should deny for allowed users without required match status
            const deniedMatchResponse = await manager.checkMediaAccess(mediaId, 'user1', MatchStatus.LIKED)
            expect(deniedMatchResponse.granted).toBe(false)
            expect(deniedMatchResponse.reason).toBe('Access requires match status: matched')

            // Should grant for allowed users with required match status
            const grantedResponse = await manager.checkMediaAccess(mediaId, 'user1', MatchStatus.MATCHED)
            expect(grantedResponse.granted).toBe(true)
            expect(grantedResponse.accessToken).toBeDefined()
        })
    })

    describe('Access Tokens', () => {
        test('should validate access tokens correctly', async () => {
            const mediaId = 'token-test-media'
            const userId = 'test-user'

            await manager.setMediaAccess(mediaId, MediaAccessLevel.PUBLIC)
            const response = await manager.checkMediaAccess(mediaId, userId, MatchStatus.NO_INTERACTION)

            expect(response.granted).toBe(true)
            expect(response.accessToken).toBeDefined()

            // Should validate correct token
            const isValid = await manager.validateAccessToken(response.accessToken!, mediaId, userId)
            expect(isValid).toBe(true)

            // Should reject invalid token
            const isInvalid = await manager.validateAccessToken('invalid-token', mediaId, userId)
            expect(isInvalid).toBe(false)

            // Should reject token for wrong user
            const wrongUser = await manager.validateAccessToken(response.accessToken!, mediaId, 'wrong-user')
            expect(wrongUser).toBe(false)

            // Should reject token for wrong media
            const wrongMedia = await manager.validateAccessToken(response.accessToken!, 'wrong-media', userId)
            expect(wrongMedia).toBe(false)
        })
    })

    describe('Media Expiration', () => {
        test('should set and check media expiration', async () => {
            const mediaId = 'expiring-media'
            const expiresAt = new Date(Date.now() + 1000) // Expires in 1 second

            await manager.setMediaAccess(mediaId, MediaAccessLevel.PUBLIC)
            await manager.setMediaExpiration(mediaId, expiresAt)

            const rule = manager.getMediaExpirationRule(mediaId)
            expect(rule).toBeDefined()
            expect(rule!.expiresAt).toEqual(expiresAt)
            expect(rule!.autoDelete).toBe(true)

            // Should grant access before expiration
            const beforeExpiry = await manager.checkMediaAccess(mediaId, 'user1', MatchStatus.NO_INTERACTION)
            expect(beforeExpiry.granted).toBe(true)

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 1100))

            // Should deny access after expiration
            const afterExpiry = await manager.checkMediaAccess(mediaId, 'user1', MatchStatus.NO_INTERACTION)
            expect(afterExpiry.granted).toBe(false)
            expect(afterExpiry.reason).toBe('Media has expired')
        })

        test('should cleanup expired media', async () => {
            const mediaId = 'cleanup-media'
            const expiresAt = new Date(Date.now() - 1000) // Already expired

            await manager.setMediaAccess(mediaId, MediaAccessLevel.PUBLIC)
            await manager.setMediaExpiration(mediaId, expiresAt, { autoDelete: true })

            const expiredIds = await manager.cleanupExpiredMedia()
            expect(expiredIds).toContain(mediaId)

            // Rule should be removed
            const rule = manager.getMediaAccessRule(mediaId)
            expect(rule).toBeUndefined()
        })
    })

    describe('Access Management', () => {
        test('should revoke access for specific users', async () => {
            const mediaId = 'revoke-test-media'
            const allowedUsers = ['user1', 'user2', 'user3']

            await manager.setMediaAccess(mediaId, MediaAccessLevel.SELECTIVE, { allowedUsers })

            // Initially user1 should have access
            const initialResponse = await manager.checkMediaAccess(mediaId, 'user1', MatchStatus.NO_INTERACTION)
            expect(initialResponse.granted).toBe(true)

            // Revoke access for user1
            await manager.revokeMediaAccess(mediaId, 'user1')

            // user1 should no longer have access
            const revokedResponse = await manager.checkMediaAccess(mediaId, 'user1', MatchStatus.NO_INTERACTION)
            expect(revokedResponse.granted).toBe(false)

            // user2 should still have access
            const stillAccessResponse = await manager.checkMediaAccess(mediaId, 'user2', MatchStatus.NO_INTERACTION)
            expect(stillAccessResponse.granted).toBe(true)
        })

        test('should get accessible media for user', async () => {
            // Set up various media with different access levels
            await manager.setMediaAccess('public-1', MediaAccessLevel.PUBLIC)
            await manager.setMediaAccess('match-1', MediaAccessLevel.MATCHES_ONLY)
            await manager.setMediaAccess('private-1', MediaAccessLevel.PRIVATE)
            await manager.setMediaAccess('selective-1', MediaAccessLevel.SELECTIVE, {
                allowedUsers: ['user1']
            })

            // Test for matched user
            const matchedMedia = manager.getAccessibleMedia('user1', MatchStatus.MATCHED)
            expect(matchedMedia).toContain('public-1')
            expect(matchedMedia).toContain('match-1')
            expect(matchedMedia).toContain('selective-1')
            expect(matchedMedia).not.toContain('private-1')

            // Test for non-matched user
            const nonMatchedMedia = manager.getAccessibleMedia('user2', MatchStatus.LIKED)
            expect(nonMatchedMedia).toContain('public-1')
            expect(nonMatchedMedia).not.toContain('match-1')
            expect(nonMatchedMedia).not.toContain('selective-1')
            expect(nonMatchedMedia).not.toContain('private-1')
        })
    })

    describe('Privacy Statistics', () => {
        test('should generate privacy statistics', async () => {
            // Set up test data
            await manager.setMediaAccess('stats-public-1', MediaAccessLevel.PUBLIC)
            await manager.setMediaAccess('stats-public-2', MediaAccessLevel.PUBLIC)
            await manager.setMediaAccess('stats-match-1', MediaAccessLevel.MATCHES_ONLY)
            await manager.setMediaAccess('stats-private-1', MediaAccessLevel.PRIVATE)
            await manager.setMediaAccess('stats-selective-1', MediaAccessLevel.SELECTIVE, {
                allowedUsers: ['user1']
            })

            // Generate some access requests
            await manager.checkMediaAccess('stats-public-1', 'user1', MatchStatus.NO_INTERACTION)
            await manager.checkMediaAccess('stats-match-1', 'user2', MatchStatus.MATCHED)

            const stats = manager.getPrivacyStats()
            expect(stats.totalMediaFiles).toBe(5)
            expect(stats.publicMedia).toBe(2)
            expect(stats.matchOnlyMedia).toBe(1)
            expect(stats.privateMedia).toBe(1)
            expect(stats.selectiveMedia).toBe(1)
            expect(stats.accessRequests).toBeGreaterThan(0)
        })
    })

    describe('Advanced Features', () => {
        test('should handle match-based access levels', async () => {
            const mediaId = 'match-based-media'
            
            await manager.setMatchBasedAccess(mediaId, {
                [MatchStatus.NO_INTERACTION]: MediaAccessLevel.PRIVATE,
                [MatchStatus.LIKED]: MediaAccessLevel.PUBLIC,
                [MatchStatus.MATCHED]: MediaAccessLevel.PUBLIC,
                [MatchStatus.BLOCKED]: MediaAccessLevel.PRIVATE
            })

            // Test different match statuses
            const noInteractionLevel = manager.getEffectiveAccessLevel(mediaId, MatchStatus.NO_INTERACTION)
            expect(noInteractionLevel).toBe(MediaAccessLevel.PRIVATE)

            const likedLevel = manager.getEffectiveAccessLevel(mediaId, MatchStatus.LIKED)
            expect(likedLevel).toBe(MediaAccessLevel.PUBLIC)

            const matchedLevel = manager.getEffectiveAccessLevel(mediaId, MatchStatus.MATCHED)
            expect(matchedLevel).toBe(MediaAccessLevel.PUBLIC)

            const blockedLevel = manager.getEffectiveAccessLevel(mediaId, MatchStatus.BLOCKED)
            expect(blockedLevel).toBe(MediaAccessLevel.PRIVATE)
        })

        test('should create and use temporary access tokens', async () => {
            const mediaId = 'temp-access-media'
            const userId = 'temp-user'

            await manager.setMediaAccess(mediaId, MediaAccessLevel.PRIVATE)

            // Create temporary access
            const tempAccess = await manager.createTemporaryAccess(mediaId, userId, 1, 2)
            expect(tempAccess.accessToken).toBeDefined()
            expect(tempAccess.usesRemaining).toBe(2)

            // Use temporary access
            const firstUse = await manager.useTemporaryAccess(tempAccess.accessToken)
            expect(firstUse).toBe(true)

            const secondUse = await manager.useTemporaryAccess(tempAccess.accessToken)
            expect(secondUse).toBe(true)

            // Third use should fail (exceeded max uses)
            const thirdUse = await manager.useTemporaryAccess(tempAccess.accessToken)
            expect(thirdUse).toBe(false)
        })

        test('should handle batch operations', async () => {
            const mediaIds = ['batch1', 'batch2', 'batch3']
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

            // Batch update access
            await manager.bulkUpdateAccess(mediaIds, MediaAccessLevel.MATCHES_ONLY, {
                matchStatusRequired: MatchStatus.MATCHED
            })

            // Verify all media have the same access level
            for (const mediaId of mediaIds) {
                const rule = manager.getMediaAccessRule(mediaId)
                expect(rule?.accessLevel).toBe(MediaAccessLevel.MATCHES_ONLY)
                expect(rule?.matchStatusRequired).toBe(MatchStatus.MATCHED)
            }

            // Batch set expiration
            await manager.batchSetExpiration(mediaIds, expiresAt, {
                autoDelete: true,
                notifyBeforeExpiry: true,
                notifyHours: 12
            })

            // Verify all media have expiration set
            for (const mediaId of mediaIds) {
                const rule = manager.getMediaExpirationRule(mediaId)
                expect(rule?.expiresAt).toEqual(expiresAt)
                expect(rule?.autoDelete).toBe(true)
                expect(rule?.notifyHours).toBe(12)
            }
        })

        test('should get media by owner', async () => {
            const ownerId = 'owner123'
            
            // Set up some media with different access patterns
            await manager.setMediaAccess('private1', MediaAccessLevel.PRIVATE)
            await manager.setMediaAccess('selective1', MediaAccessLevel.SELECTIVE, {
                allowedUsers: [ownerId]
            })
            await manager.setMediaAccess('public1', MediaAccessLevel.PUBLIC)

            const ownerMedia = manager.getMediaByOwner(ownerId)
            expect(ownerMedia).toContain('private1')
            expect(ownerMedia).toContain('selective1')
            expect(ownerMedia).not.toContain('public1')
        })

        test('should get expiring media within timeframe', async () => {
            const now = new Date()
            const soon = new Date(now.getTime() + 12 * 60 * 60 * 1000) // 12 hours
            const later = new Date(now.getTime() + 48 * 60 * 60 * 1000) // 48 hours

            await manager.setMediaExpiration('expiring-soon', soon)
            await manager.setMediaExpiration('expiring-later', later)

            const expiringIn24h = manager.getExpiringMedia(24)
            expect(expiringIn24h).toContain('expiring-soon')
            expect(expiringIn24h).not.toContain('expiring-later')

            const expiringIn72h = manager.getExpiringMedia(72)
            expect(expiringIn72h).toContain('expiring-soon')
            expect(expiringIn72h).toContain('expiring-later')
        })
    })

    describe('Event Handling', () => {
        test('should emit events for access rule updates', async () => {
            const eventSpy = jest.fn()
            manager.on('accessRuleUpdated', eventSpy)

            const mediaId = 'event-test-media'
            await manager.setMediaAccess(mediaId, MediaAccessLevel.PUBLIC)

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    mediaId,
                    accessLevel: MediaAccessLevel.PUBLIC
                })
            )
        })

        test('should emit events for access revocation', async () => {
            const eventSpy = jest.fn()
            manager.on('accessRevoked', eventSpy)

            const mediaId = 'revoke-event-media'
            const userId = 'test-user'

            await manager.setMediaAccess(mediaId, MediaAccessLevel.SELECTIVE, {
                allowedUsers: [userId]
            })

            await manager.revokeMediaAccess(mediaId, userId)

            expect(eventSpy).toHaveBeenCalledWith({ mediaId, userId })
        })

        test('should emit events for temporary access creation', async () => {
            const eventSpy = jest.fn()
            manager.on('temporaryAccessCreated', eventSpy)

            const mediaId = 'temp-event-media'
            const userId = 'temp-user'

            await manager.createTemporaryAccess(mediaId, userId, 1, 1)

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    mediaId,
                    requesterId: userId,
                    maxUses: 1
                })
            )
        })

        test('should emit events for batch operations', async () => {
            const bulkEventSpy = jest.fn()
            const batchEventSpy = jest.fn()
            
            manager.on('bulkAccessUpdate', bulkEventSpy)
            manager.on('batchExpirationSet', batchEventSpy)

            const mediaIds = ['bulk1', 'bulk2']
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

            await manager.bulkUpdateAccess(mediaIds, MediaAccessLevel.PUBLIC)
            await manager.batchSetExpiration(mediaIds, expiresAt)

            expect(bulkEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    mediaIds,
                    accessLevel: MediaAccessLevel.PUBLIC
                })
            )

            expect(batchEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    mediaIds,
                    expiresAt
                })
            )
        })
    })
})
