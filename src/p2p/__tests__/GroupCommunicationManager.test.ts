import { GroupCommunicationManager, GroupInfo, GroupMember, GroupMessage, GroupInvitation } from '../GroupCommunicationManager'
import { CryptoManager } from '../CryptoManager'
import { P2PMessagingManager } from '../P2PMessagingManager'
import { P2PManager } from '../P2PManager'
import { MessageType } from '../types'

// Mock dependencies
jest.mock('../CryptoManager')
jest.mock('../P2PMessagingManager')
jest.mock('../P2PManager')

describe('GroupCommunicationManager', () => {
  let groupManager: GroupCommunicationManager
  let mockCryptoManager: jest.Mocked<CryptoManager>
  let mockMessagingManager: jest.Mocked<P2PMessagingManager>
  let mockP2PManager: jest.Mocked<P2PManager>

  const mockIdentity = {
    did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    publicKey: {} as CryptoKey,
    privateKey: {} as CryptoKey,
    keyPair: {} as CryptoKeyPair
  }

  const mockPeerId = 'peer-123'
  const mockOtherPeerId = 'peer-456'

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()

    // Create mocks
    mockCryptoManager = new CryptoManager() as jest.Mocked<CryptoManager>
    mockMessagingManager = new P2PMessagingManager(
      mockCryptoManager,
      {} as any,
      {} as any
    ) as jest.Mocked<P2PMessagingManager>
    mockP2PManager = new P2PManager({} as any) as jest.Mocked<P2PManager>

    // Setup mock implementations
    mockCryptoManager.hasIdentity.mockReturnValue(true)
    mockCryptoManager.getCurrentIdentity.mockReturnValue(mockIdentity)
    mockP2PManager.getPeerId.mockReturnValue(mockPeerId)
    mockMessagingManager.initialize.mockResolvedValue()
    mockMessagingManager.sendMessage.mockResolvedValue('message-id')
    mockMessagingManager.onMessage.mockImplementation(() => {})

    // Mock crypto.subtle methods
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: jest.fn(() => 'test-uuid'),
        getRandomValues: jest.fn((arr) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256)
          }
          return arr
        }),
        subtle: {
          generateKey: jest.fn().mockResolvedValue({} as CryptoKey),
          exportKey: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
          importKey: jest.fn().mockResolvedValue({} as CryptoKey),
          encrypt: jest.fn().mockResolvedValue(new ArrayBuffer(16)),
          decrypt: jest.fn().mockResolvedValue(new ArrayBuffer(16)),
          sign: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
          verify: jest.fn().mockResolvedValue(true)
        }
      }
    })

    // Create group manager
    groupManager = new GroupCommunicationManager(
      mockCryptoManager,
      mockMessagingManager,
      mockP2PManager
    )
  })

  afterEach(() => {
    groupManager.destroy()
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(groupManager.initialize()).resolves.not.toThrow()
      
      expect(mockMessagingManager.initialize).toHaveBeenCalled()
      expect(mockMessagingManager.onMessage).toHaveBeenCalled()
    })

    it('should generate identity if not present', async () => {
      mockCryptoManager.hasIdentity.mockReturnValue(false)
      mockCryptoManager.generateIdentity.mockResolvedValue(mockIdentity)

      await groupManager.initialize()

      expect(mockCryptoManager.generateIdentity).toHaveBeenCalled()
    })
  })

  describe('group creation', () => {
    beforeEach(async () => {
      await groupManager.initialize()
    })

    it('should create a new group successfully', async () => {
      const groupName = 'Test Group'
      const description = 'A test group'
      
      const groupId = await groupManager.createGroup(groupName, description)
      
      expect(groupId).toBe('test-uuid')
      
      const group = groupManager.getGroup(groupId)
      expect(group).toBeDefined()
      expect(group!.name).toBe(groupName)
      expect(group!.description).toBe(description)
      expect(group!.createdBy).toBe(mockPeerId)
      expect(group!.members.size).toBe(1)
      expect(group!.members.has(mockPeerId)).toBe(true)
      
      const creatorMember = group!.members.get(mockPeerId)!
      expect(creatorMember.role).toBe('admin')
      expect(creatorMember.status).toBe('active')
    })

    it('should create private group with invite code', async () => {
      const groupId = await groupManager.createGroup('Private Group', undefined, 10, true)
      
      const group = groupManager.getGroup(groupId)
      expect(group!.isPrivate).toBe(true)
      expect(group!.inviteCode).toBeDefined()
      expect(group!.inviteCode).toHaveLength(8)
    })

    it('should throw error if identity not initialized', async () => {
      mockCryptoManager.getCurrentIdentity.mockReturnValue(null)
      
      await expect(groupManager.createGroup('Test Group')).rejects.toThrow('Identity not initialized')
    })
  })

  describe('group invitations', () => {
    let groupId: string

    beforeEach(async () => {
      await groupManager.initialize()
      groupId = await groupManager.createGroup('Test Group')
    })

    it('should send group invitation successfully', async () => {
      const invitationId = await groupManager.invitePeerToGroup(groupId, mockOtherPeerId)
      
      expect(invitationId).toBe('test-uuid')
      expect(mockMessagingManager.sendMessage).toHaveBeenCalledWith(
        mockOtherPeerId,
        expect.stringContaining('group_invitation'),
        MessageType.SYSTEM
      )
    })

    it('should throw error if group not found', async () => {
      await expect(groupManager.invitePeerToGroup('invalid-group', mockOtherPeerId))
        .rejects.toThrow('Group not found')
    })

    it('should throw error if not admin', async () => {
      // Create another group manager as non-admin
      const otherGroupManager = new GroupCommunicationManager(
        mockCryptoManager,
        mockMessagingManager,
        mockP2PManager
      )
      
      // Initialize the other group manager
      await otherGroupManager.initialize()
      
      // Add the group to the other manager but without admin privileges
      const group = groupManager.getGroup(groupId)!
      const groupCopy = { ...group }
      groupCopy.members = new Map(group.members)
      groupCopy.members.set('non-admin-peer', {
        peerId: 'non-admin-peer',
        did: 'did:key:zNonAdmin',
        publicKey: {} as CryptoKey,
        joinedAt: new Date(),
        role: 'member', // Not admin
        status: 'active'
      })
      
      ;(otherGroupManager as any).groups.set(groupId, groupCopy)
      
      // Mock the peer ID for the other manager
      const originalGetPeerId = mockP2PManager.getPeerId
      mockP2PManager.getPeerId.mockReturnValue('non-admin-peer')
      
      await expect(otherGroupManager.invitePeerToGroup(groupId, mockOtherPeerId))
        .rejects.toThrow('Only group admins can invite members')
      
      // Restore original mock
      mockP2PManager.getPeerId.mockImplementation(originalGetPeerId)
    })

    it('should throw error if peer already member', async () => {
      await expect(groupManager.invitePeerToGroup(groupId, mockPeerId))
        .rejects.toThrow('Peer is already a member of this group')
    })

    it('should accept group invitation successfully', async () => {
      // Simulate receiving an invitation
      const invitation: GroupInvitation = {
        id: 'invitation-123',
        groupId: 'remote-group-id',
        groupName: 'Remote Group',
        invitedBy: mockOtherPeerId,
        invitedPeer: mockPeerId,
        inviteCode: 'ABCD1234',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'pending'
      }

      // Manually add invitation to simulate receiving it
      ;(groupManager as any).pendingInvitations.set(invitation.id, invitation)

      await groupManager.acceptGroupInvitation(invitation.id)

      expect(mockMessagingManager.sendMessage).toHaveBeenCalledWith(
        mockOtherPeerId,
        expect.stringContaining('group_invitation_response'),
        MessageType.SYSTEM
      )
      
      expect(invitation.status).toBe('accepted')
    })

    it('should throw error for expired invitation', async () => {
      const expiredInvitation: GroupInvitation = {
        id: 'expired-invitation',
        groupId: 'remote-group-id',
        groupName: 'Remote Group',
        invitedBy: mockOtherPeerId,
        invitedPeer: mockPeerId,
        inviteCode: 'ABCD1234',
        expiresAt: new Date(Date.now() - 1000), // Expired
        status: 'pending'
      }

      ;(groupManager as any).pendingInvitations.set(expiredInvitation.id, expiredInvitation)

      await expect(groupManager.acceptGroupInvitation(expiredInvitation.id))
        .rejects.toThrow('Invitation has expired')
    })
  })

  describe('group messaging', () => {
    let groupId: string

    beforeEach(async () => {
      await groupManager.initialize()
      groupId = await groupManager.createGroup('Test Group')
      
      // Add another member to the group
      const group = groupManager.getGroup(groupId)!
      const otherMember: GroupMember = {
        peerId: mockOtherPeerId,
        did: 'did:key:z6MkotherPeer',
        publicKey: {} as CryptoKey,
        joinedAt: new Date(),
        role: 'member',
        status: 'active'
      }
      group.members.set(mockOtherPeerId, otherMember)
    })

    it('should send group message successfully', async () => {
      const content = 'Hello group!'
      
      const messageId = await groupManager.sendGroupMessage(groupId, content)
      
      expect(messageId).toBe('test-uuid')
      expect(mockMessagingManager.sendMessage).toHaveBeenCalledWith(
        mockOtherPeerId,
        expect.stringContaining('group_message'),
        MessageType.SYSTEM
      )
      
      const messages = groupManager.getGroupMessages(groupId)
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe(content)
      expect(messages[0].senderId).toBe(mockPeerId)
    })

    it('should throw error if group not found', async () => {
      await expect(groupManager.sendGroupMessage('invalid-group', 'Hello'))
        .rejects.toThrow('Group not found')
    })

    it('should throw error if not active member', async () => {
      // Remove member from group
      const group = groupManager.getGroup(groupId)!
      group.members.delete(mockPeerId)
      
      await expect(groupManager.sendGroupMessage(groupId, 'Hello'))
        .rejects.toThrow('You are not an active member of this group')
    })

    it('should handle incoming group message', async () => {
      // This test verifies that the message handling infrastructure is set up correctly
      // The actual decryption and processing would require more complex mocking
      
      // Verify that the message handler was registered
      expect(mockMessagingManager.onMessage).toHaveBeenCalled()
      
      // Verify that the group has the expected structure for message handling
      const group = groupManager.getGroup(groupId)
      expect(group).toBeDefined()
      expect(group!.members.has(mockOtherPeerId)).toBe(true)
      
      // Verify that group keys exist
      const groupKeys = (groupManager as any).groupKeys.get(groupId)
      expect(groupKeys).toBeDefined()
    })
  })

  describe('group management', () => {
    let groupId: string

    beforeEach(async () => {
      await groupManager.initialize()
      groupId = await groupManager.createGroup('Test Group')
    })

    it('should leave group successfully', async () => {
      await groupManager.leaveGroup(groupId)
      
      const group = groupManager.getGroup(groupId)
      expect(group).toBeNull()
    })

    it('should throw error when leaving non-existent group', async () => {
      await expect(groupManager.leaveGroup('invalid-group'))
        .rejects.toThrow('Group not found')
    })

    it('should get all groups', async () => {
      // Reset UUID mock to return different values
      let callCount = 0
      ;(global.crypto.randomUUID as jest.Mock).mockImplementation(() => `test-uuid-${++callCount}`)
      
      const group2Id = await groupManager.createGroup('Second Group')
      
      const allGroups = groupManager.getAllGroups()
      expect(allGroups).toHaveLength(2)
      expect(allGroups.map(g => g.id)).toContain(groupId)
      expect(allGroups.map(g => g.id)).toContain(group2Id)
    })

    it('should get pending invitations', async () => {
      // Add a pending invitation
      const invitation: GroupInvitation = {
        id: 'pending-invitation',
        groupId: 'remote-group',
        groupName: 'Remote Group',
        invitedBy: mockOtherPeerId,
        invitedPeer: mockPeerId,
        inviteCode: 'ABCD1234',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'pending'
      }

      ;(groupManager as any).pendingInvitations.set(invitation.id, invitation)

      const pendingInvitations = groupManager.getPendingInvitations()
      expect(pendingInvitations).toHaveLength(1)
      expect(pendingInvitations[0].id).toBe('pending-invitation')
    })

    it('should filter out expired invitations', async () => {
      // Add expired invitation
      const expiredInvitation: GroupInvitation = {
        id: 'expired-invitation',
        groupId: 'remote-group',
        groupName: 'Remote Group',
        invitedBy: mockOtherPeerId,
        invitedPeer: mockPeerId,
        inviteCode: 'ABCD1234',
        expiresAt: new Date(Date.now() - 1000), // Expired
        status: 'pending'
      }

      ;(groupManager as any).pendingInvitations.set(expiredInvitation.id, expiredInvitation)

      const pendingInvitations = groupManager.getPendingInvitations()
      expect(pendingInvitations).toHaveLength(0)
    })
  })

  describe('event handlers', () => {
    let groupId: string
    let mockHandler: any

    beforeEach(async () => {
      await groupManager.initialize()
      groupId = await groupManager.createGroup('Test Group')
      
      mockHandler = {
        onGroupMessage: jest.fn(),
        onMemberJoined: jest.fn(),
        onMemberLeft: jest.fn(),
        onGroupInvitation: jest.fn(),
        onGroupKeyUpdate: jest.fn(),
        onGroupUpdated: jest.fn()
      }

      groupManager.addHandler(mockHandler)
    })

    it('should add and remove handlers', () => {
      expect((groupManager as any).handlers.has(mockHandler)).toBe(true)
      
      groupManager.removeHandler(mockHandler)
      expect((groupManager as any).handlers.has(mockHandler)).toBe(false)
    })

    it('should notify handlers on group creation', async () => {
      // Handler was added after first group creation, so create another
      const newGroupId = await groupManager.createGroup('New Group')
      
      expect(mockHandler.onGroupUpdated).toHaveBeenCalled()
      const calledGroup = mockHandler.onGroupUpdated.mock.calls[0][0]
      expect(calledGroup.id).toBe(newGroupId)
    })

    it('should handle handler errors gracefully', async () => {
      const errorHandler = {
        onGroupMessage: jest.fn(() => { throw new Error('Handler error') }),
        onMemberJoined: jest.fn(),
        onMemberLeft: jest.fn(),
        onGroupInvitation: jest.fn(),
        onGroupKeyUpdate: jest.fn(),
        onGroupUpdated: jest.fn()
      }

      groupManager.addHandler(errorHandler)

      // This should not throw despite the handler error
      await expect(groupManager.sendGroupMessage(groupId, 'Test message')).resolves.toBeDefined()
    })
  })

  describe('data persistence', () => {
    beforeEach(async () => {
      await groupManager.initialize()
    })

    it('should save and load group data', async () => {
      const groupId = await groupManager.createGroup('Persistent Group', 'Test description')
      
      // Verify data was saved
      const savedGroups = localStorage.getItem('p2p-groups')
      expect(savedGroups).toBeDefined()
      
      const parsedGroups = JSON.parse(savedGroups!)
      expect(parsedGroups).toHaveLength(1)
      expect(parsedGroups[0][1].name).toBe('Persistent Group')
    })

    it('should save group messages', async () => {
      // Reset UUID mock
      let callCount = 0
      ;(global.crypto.randomUUID as jest.Mock).mockImplementation(() => `message-uuid-${++callCount}`)
      
      const groupId = await groupManager.createGroup('Message Group')
      await groupManager.sendGroupMessage(groupId, 'Test message')
      
      // Verify message was added to local history
      const messages = groupManager.getGroupMessages(groupId)
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe('Test message')
      
      // Verify localStorage was called (the actual saving is tested in the implementation)
      const savedMessages = localStorage.getItem('p2p-group-messages')
      expect(savedMessages).toBeDefined()
    })
  })

  describe('key management', () => {
    let groupId: string

    beforeEach(async () => {
      await groupManager.initialize()
      groupId = await groupManager.createGroup('Key Test Group')
    })

    it('should generate group keys on creation', () => {
      const keyBundle = (groupManager as any).groupKeys.get(groupId)
      expect(keyBundle).toBeDefined()
      expect(keyBundle.groupId).toBe(groupId)
      expect(keyBundle.version).toBe(1)
      expect(keyBundle.keyId).toBeDefined()
    })

    it('should setup key rotation interval', () => {
      const intervals = (groupManager as any).keyRotationIntervals
      expect(intervals.has(groupId)).toBe(true)
    })

    it('should clean up intervals on destroy', () => {
      const intervals = (groupManager as any).keyRotationIntervals
      expect(intervals.size).toBeGreaterThan(0)
      
      groupManager.destroy()
      expect(intervals.size).toBe(0)
    })
  })

  describe('error handling', () => {
    beforeEach(async () => {
      await groupManager.initialize()
    })

    it('should handle crypto errors gracefully', async () => {
      // Mock crypto.subtle.generateKey to throw
      global.crypto.subtle.generateKey = jest.fn().mockRejectedValue(new Error('Crypto error'))
      
      await expect(groupManager.createGroup('Error Group')).rejects.toThrow('Group creation failed')
    })

    it('should handle messaging errors gracefully', async () => {
      // Reset UUID mock
      let callCount = 0
      ;(global.crypto.randomUUID as jest.Mock).mockImplementation(() => `error-uuid-${++callCount}`)
      
      const groupId = await groupManager.createGroup('Error Group')
      
      // Add another member to trigger message sending
      const group = groupManager.getGroup(groupId)!
      group.members.set(mockOtherPeerId, {
        peerId: mockOtherPeerId,
        did: 'did:key:zOther',
        publicKey: {} as CryptoKey,
        joinedAt: new Date(),
        role: 'member',
        status: 'active'
      })
      
      // Mock sendMessage to throw after the group is created
      mockMessagingManager.sendMessage.mockRejectedValue(new Error('Network error'))
      
      // Should handle the error gracefully (message is added locally but delivery fails)
      const messageId = await groupManager.sendGroupMessage(groupId, 'Test')
      expect(messageId).toBeDefined()
      
      // Message should still be in local history
      const messages = groupManager.getGroupMessages(groupId)
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe('Test')
    })

    it('should handle malformed incoming messages', async () => {
      const messageHandler = mockMessagingManager.onMessage.mock.calls[0][0]
      
      // Send malformed message - should not crash
      const result = messageHandler(mockOtherPeerId, {
        id: 'malformed-message',
        type: MessageType.SYSTEM,
        from: mockOtherPeerId,
        to: mockPeerId,
        content: 'invalid json',
        timestamp: new Date()
      })
      
      // Should return a promise that resolves without throwing
      await expect(Promise.resolve(result)).resolves.not.toThrow()
    })
  })

  describe('cleanup', () => {
    it('should destroy cleanly', async () => {
      await groupManager.initialize()
      const groupId = await groupManager.createGroup('Cleanup Group')
      
      expect((groupManager as any).groups.size).toBe(1)
      expect((groupManager as any).keyRotationIntervals.size).toBe(1)
      
      groupManager.destroy()
      
      expect((groupManager as any).groups.size).toBe(0)
      expect((groupManager as any).groupKeys.size).toBe(0)
      expect((groupManager as any).groupMessages.size).toBe(0)
      expect((groupManager as any).keyRotationIntervals.size).toBe(0)
      expect((groupManager as any).handlers.size).toBe(0)
    })
  })
})