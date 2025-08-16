/**
 * Simple Media Privacy Controls Demo
 * 
 * This demonstrates the core functionality implemented for Task 19:
 * - Access control for shared media
 * - Media expiration and deletion
 * - Selective media sharing based on match status
 */

import { MediaPrivacyManager, MediaAccessLevel, MatchStatus } from '../MediaPrivacyManager'

async function runMediaPrivacyDemo() {
  console.log('🔐 Media Privacy Controls Demo')
  console.log('==============================\n')

  const manager = new MediaPrivacyManager()
  await manager.initialize()

  try {
    // 1. Access Control Demo
    console.log('📋 1. Access Control for Shared Media')
    console.log('-------------------------------------')
    
    // Set up different access levels
    await manager.setMediaAccess('photo1', MediaAccessLevel.PUBLIC)
    await manager.setMediaAccess('photo2', MediaAccessLevel.MATCHES_ONLY)
    await manager.setMediaAccess('photo3', MediaAccessLevel.PRIVATE)
    await manager.setMediaAccess('photo4', MediaAccessLevel.SELECTIVE, {
      allowedUsers: ['user123', 'user456'],
      matchStatusRequired: MatchStatus.MATCHED
    })

    console.log('✅ Set up 4 photos with different access levels')

    // Test access for different scenarios
    const scenarios = [
      { photo: 'photo1', user: 'anyone', status: MatchStatus.NO_INTERACTION, expected: true },
      { photo: 'photo2', user: 'user123', status: MatchStatus.LIKED, expected: false },
      { photo: 'photo2', user: 'user123', status: MatchStatus.MATCHED, expected: true },
      { photo: 'photo3', user: 'user123', status: MatchStatus.MATCHED, expected: false },
      { photo: 'photo4', user: 'user123', status: MatchStatus.MATCHED, expected: true },
      { photo: 'photo4', user: 'user789', status: MatchStatus.MATCHED, expected: false }
    ]

    for (const scenario of scenarios) {
      const response = await manager.checkMediaAccess(scenario.photo, scenario.user, scenario.status)
      const result = response.granted === scenario.expected ? '✅' : '❌'
      console.log(`  ${result} ${scenario.photo} for ${scenario.user} (${scenario.status}): ${response.granted ? 'GRANTED' : 'DENIED'}`)
    }

    // 2. Media Expiration Demo
    console.log('\n⏰ 2. Media Expiration and Deletion')
    console.log('----------------------------------')
    
    // Set expiration for a photo
    const shortExpiry = new Date(Date.now() + 1000) // 1 second
    await manager.setMediaExpiration('photo5', shortExpiry, {
      autoDelete: true,
      notifyBeforeExpiry: true,
      notifyHours: 1
    })
    
    await manager.setMediaAccess('photo5', MediaAccessLevel.PUBLIC)
    console.log('✅ Set photo5 to expire in 1 second')

    // Check access before expiration
    const beforeExpiry = await manager.checkMediaAccess('photo5', 'user123', MatchStatus.NO_INTERACTION)
    console.log(`  Before expiry: ${beforeExpiry.granted ? 'GRANTED' : 'DENIED'}`)

    // Wait for expiration
    console.log('  ⏳ Waiting for expiration...')
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Check access after expiration
    const afterExpiry = await manager.checkMediaAccess('photo5', 'user123', MatchStatus.NO_INTERACTION)
    console.log(`  After expiry: ${afterExpiry.granted ? 'GRANTED' : 'DENIED'} - ${afterExpiry.reason}`)

    // Cleanup expired media
    const expiredIds = await manager.cleanupExpiredMedia()
    console.log(`  🗑️ Cleaned up ${expiredIds.length} expired photos: ${expiredIds.join(', ')}`)

    // 3. Selective Sharing Demo
    console.log('\n🎯 3. Selective Media Sharing Based on Match Status')
    console.log('--------------------------------------------------')
    
    // Set up match-based access
    await manager.setMatchBasedAccess('photo6', {
      [MatchStatus.NO_INTERACTION]: MediaAccessLevel.PRIVATE,
      [MatchStatus.LIKED]: MediaAccessLevel.SELECTIVE,
      [MatchStatus.MATCHED]: MediaAccessLevel.PUBLIC,
      [MatchStatus.BLOCKED]: MediaAccessLevel.PRIVATE
    })

    await manager.setMediaAccess('photo6', MediaAccessLevel.SELECTIVE, {
      allowedUsers: ['user123']
    })

    console.log('✅ Set up match-based access for photo6')

    // Test effective access levels
    const matchStatuses = [
      MatchStatus.NO_INTERACTION,
      MatchStatus.LIKED,
      MatchStatus.MATCHED,
      MatchStatus.BLOCKED
    ]

    for (const status of matchStatuses) {
      const effectiveLevel = manager.getEffectiveAccessLevel('photo6', status)
      console.log(`  ${status}: ${effectiveLevel}`)
    }

    // 4. Temporary Access Demo
    console.log('\n🎫 4. Temporary Access Tokens')
    console.log('-----------------------------')
    
    await manager.setMediaAccess('photo7', MediaAccessLevel.PRIVATE)
    
    // Create temporary access
    const tempAccess = await manager.createTemporaryAccess('photo7', 'user123', 1, 2)
    console.log(`✅ Created temporary access token: ${tempAccess.accessToken}`)
    console.log(`  Expires: ${tempAccess.expiresAt.toISOString()}`)
    console.log(`  Uses remaining: ${tempAccess.usesRemaining}`)

    // Use temporary access
    for (let i = 1; i <= 3; i++) {
      const used = await manager.useTemporaryAccess(tempAccess.accessToken)
      console.log(`  Use ${i}: ${used ? '✅ SUCCESS' : '❌ FAILED'}`)
    }

    // 5. Batch Operations Demo
    console.log('\n📦 5. Batch Operations')
    console.log('---------------------')
    
    const mediaIds = ['batch1', 'batch2', 'batch3']
    
    // Batch update access
    await manager.bulkUpdateAccess(mediaIds, MediaAccessLevel.MATCHES_ONLY, {
      matchStatusRequired: MatchStatus.MATCHED
    })
    console.log('✅ Batch updated access levels')

    // Batch set expiration
    const batchExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    await manager.batchSetExpiration(mediaIds, batchExpiry, {
      autoDelete: true,
      notifyBeforeExpiry: true,
      notifyHours: 12
    })
    console.log('✅ Batch set expiration times')

    // 6. Privacy Statistics
    console.log('\n📊 6. Privacy Statistics')
    console.log('-----------------------')
    
    const stats = manager.getPrivacyStats()
    console.log(`Total Media Files: ${stats.totalMediaFiles}`)
    console.log(`Public Media: ${stats.publicMedia}`)
    console.log(`Match-Only Media: ${stats.matchOnlyMedia}`)
    console.log(`Private Media: ${stats.privateMedia}`)
    console.log(`Selective Media: ${stats.selectiveMedia}`)
    console.log(`Access Requests: ${stats.accessRequests}`)
    console.log(`Granted Requests: ${stats.grantedRequests}`)
    console.log(`Denied Requests: ${stats.deniedRequests}`)

    console.log('\n🎉 Media Privacy Controls Demo Completed Successfully!')
    
  } catch (error) {
    console.error('❌ Demo failed:', error)
  } finally {
    await manager.destroy()
  }
}

// Run the demo
if (require.main === module) {
  runMediaPrivacyDemo().catch(console.error)
}

export { runMediaPrivacyDemo }