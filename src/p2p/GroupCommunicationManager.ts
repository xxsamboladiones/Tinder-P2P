import { CryptoManager } from './CryptoManager'
import { P2PMessagingManager, DecryptedP2PMessage } from './P2PMessagingManager'
import { P2PManager } from './P2PManager'
import { MessageType } from './types'

export interface GroupMember {
  peerId: string
  did: string
  publicKey: CryptoKey
  joinedAt: Date
  role: 'admin' | 'member'
  status: 'active' | 'inactive' | 'left'
}

export interface GroupInfo {
  id: string
  name: string
  description?: string
  createdBy: string
  createdAt: Date
  members: Map<string, GroupMember>
  maxMembers: number
  isPrivate: boolean
  inviteCode?: string
}

export interface GroupMessage {
  id: string
  groupId: string
  senderId: string
  content: string
  timestamp: Date
  messageType: 'text' | 'system' | 'invitation'
  encrypted: boolean
  deliveredTo: Set<string>
  readBy: Set<string>
}

export interface GroupKeyBundle {
  groupId: string
  keyId: string
  encryptionKey: CryptoKey
  signingKey: CryptoKey
  version: number
  createdAt: Date
  expiresAt: Date
}

export interface GroupInvitation {
  id: string
  groupId: string
  groupName: string
  invitedBy: string
  invitedPeer: string
  inviteCode: string
  expiresAt: Date
  status: 'pending' | 'accepted' | 'declined' | 'expired'
}

export interface GroupCommunicationHandler {
  onGroupMessage: (message: GroupMessage) => void
  onMemberJoined: (groupId: string, member: GroupMember) => void
  onMemberLeft: (groupId: string, peerId: string) => void
  onGroupInvitation: (invitation: GroupInvitation) => void
  onGroupKeyUpdate: (groupId: string, keyBundle: GroupKeyBundle) => void
  onGroupUpdated: (group: GroupInfo) => void
}

/**
 * Group Communication Manager - Handles multi-peer messaging for group chats
 * Implements requirements 4.1, 4.2 for group communication support
 */
export class GroupCommunicationManager {
  private cryptoManager: CryptoManager
  private messagingManager: P2PMessagingManager
  private p2pManager: P2PManager
  
  // Group management
  private groups: Map<string, GroupInfo> = new Map()
  private groupKeys: Map<string, GroupKeyBundle> = new Map()
  private groupMessages: Map<string, GroupMessage[]> = new Map()
  
  // Invitations
  private pendingInvitations: Map<string, GroupInvitation> = new Map()
  private sentInvitations: Map<string, GroupInvitation> = new Map()
  
  // Event handlers
  private handlers: Set<GroupCommunicationHandler> = new Set()
  
  // Key rotation
  private keyRotationIntervals: Map<string, NodeJS.Timeout> = new Map()
  private readonly KEY_ROTATION_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours

  constructor(
    cryptoManager: CryptoManager,
    messagingManager: P2PMessagingManager,
    p2pManager: P2PManager
  ) {
    this.cryptoManager = cryptoManager
    this.messagingManager = messagingManager
    this.p2pManager = p2pManager
    
    this.setupMessageHandling()
  }

  /**
   * Initialize group communication system
   */
  async initialize(): Promise<void> {
    console.log('Initializing Group Communication Manager...')
    
    // Ensure dependencies are initialized
    if (!this.cryptoManager.hasIdentity()) {
      await this.cryptoManager.generateIdentity()
    }
    
    await this.messagingManager.initialize()
    
    // Load existing groups and keys
    await this.loadGroupData()
    
    console.log('Group Communication Manager initialized')
  }

  /**
   * Create a new group (requirement 4.1)
   */
  async createGroup(
    name: string, 
    description?: string, 
    maxMembers: number = 50,
    isPrivate: boolean = false
  ): Promise<string> {
    const groupId = crypto.randomUUID()
    const myPeerId = this.p2pManager.getPeerId()
    const myIdentity = this.cryptoManager.getCurrentIdentity()
    
    if (!myIdentity) {
      throw new Error('Identity not initialized - cannot create group')
    }

    try {
      // Create group info
      const group: GroupInfo = {
        id: groupId,
        name,
        description,
        createdBy: myPeerId,
        createdAt: new Date(),
        members: new Map(),
        maxMembers,
        isPrivate,
        inviteCode: isPrivate ? this.generateInviteCode() : undefined
      }

      // Add creator as admin
      const creatorMember: GroupMember = {
        peerId: myPeerId,
        did: myIdentity.did,
        publicKey: myIdentity.publicKey,
        joinedAt: new Date(),
        role: 'admin',
        status: 'active'
      }
      
      group.members.set(myPeerId, creatorMember)

      // Generate group encryption keys (requirement 4.2)
      const keyBundle = await this.generateGroupKeys(groupId)
      
      // Store group and keys
      this.groups.set(groupId, group)
      this.groupKeys.set(groupId, keyBundle)
      this.groupMessages.set(groupId, [])
      
      // Setup key rotation
      this.setupKeyRotation(groupId)
      
      // Save to storage
      await this.saveGroupData()
      
      // Notify handlers
      this.notifyHandlers('onGroupUpdated', group)
      
      console.log('Group created:', groupId, 'by:', myPeerId)
      return groupId
    } catch (error) {
      console.error('Failed to create group:', error)
      throw new Error(`Group creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Invite peer to group
   */
  async invitePeerToGroup(groupId: string, peerId: string): Promise<string> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error('Group not found')
    }

    const myPeerId = this.p2pManager.getPeerId()
    const myMember = group.members.get(myPeerId)
    
    if (!myMember || myMember.role !== 'admin') {
      throw new Error('Only group admins can invite members')
    }

    if (group.members.has(peerId)) {
      throw new Error('Peer is already a member of this group')
    }

    if (group.members.size >= group.maxMembers) {
      throw new Error('Group has reached maximum member limit')
    }

    try {
      const invitationId = crypto.randomUUID()
      const invitation: GroupInvitation = {
        id: invitationId,
        groupId,
        groupName: group.name,
        invitedBy: myPeerId,
        invitedPeer: peerId,
        inviteCode: group.inviteCode || this.generateInviteCode(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'pending'
      }

      // Store invitation
      this.sentInvitations.set(invitationId, invitation)

      // Send invitation message
      const invitationData = {
        type: 'group_invitation',
        invitation: {
          id: invitation.id,
          groupId: invitation.groupId,
          groupName: invitation.groupName,
          invitedBy: invitation.invitedBy,
          inviteCode: invitation.inviteCode,
          expiresAt: invitation.expiresAt.toISOString()
        }
      }

      await this.messagingManager.sendMessage(
        peerId,
        JSON.stringify(invitationData),
        MessageType.SYSTEM
      )

      console.log('Group invitation sent:', invitationId, 'to peer:', peerId)
      return invitationId
    } catch (error) {
      console.error('Failed to invite peer to group:', error)
      throw error
    }
  }

  /**
   * Accept group invitation
   */
  async acceptGroupInvitation(invitationId: string): Promise<void> {
    const invitation = this.pendingInvitations.get(invitationId)
    if (!invitation) {
      throw new Error('Invitation not found')
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer valid')
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = 'expired'
      throw new Error('Invitation has expired')
    }

    try {
      const myPeerId = this.p2pManager.getPeerId()
      const myIdentity = this.cryptoManager.getCurrentIdentity()
      
      if (!myIdentity) {
        throw new Error('Identity not initialized')
      }

      // Send acceptance message
      const acceptanceData = {
        type: 'group_invitation_response',
        invitationId,
        accepted: true,
        memberInfo: {
          peerId: myPeerId,
          did: myIdentity.did,
          publicKey: Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', myIdentity.publicKey)))
        }
      }

      await this.messagingManager.sendMessage(
        invitation.invitedBy,
        JSON.stringify(acceptanceData),
        MessageType.SYSTEM
      )

      // Update invitation status
      invitation.status = 'accepted'
      
      console.log('Group invitation accepted:', invitationId)
    } catch (error) {
      console.error('Failed to accept group invitation:', error)
      throw error
    }
  }

  /**
   * Send message to group (requirement 4.1)
   */
  async sendGroupMessage(groupId: string, content: string): Promise<string> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error('Group not found')
    }

    const myPeerId = this.p2pManager.getPeerId()
    const myMember = group.members.get(myPeerId)
    
    if (!myMember || myMember.status !== 'active') {
      throw new Error('You are not an active member of this group')
    }

    const keyBundle = this.groupKeys.get(groupId)
    if (!keyBundle) {
      throw new Error('Group encryption keys not found')
    }

    try {
      const messageId = crypto.randomUUID()
      
      // Encrypt message for group (requirement 4.2)
      const encryptedContent = await this.encryptGroupMessage(content, keyBundle)
      
      // Create group message
      const groupMessage: GroupMessage = {
        id: messageId,
        groupId,
        senderId: myPeerId,
        content,
        timestamp: new Date(),
        messageType: 'text',
        encrypted: true,
        deliveredTo: new Set([myPeerId]), // Self-delivery
        readBy: new Set([myPeerId]) // Self-read
      }

      // Add to message history
      this.addToGroupMessageHistory(groupId, groupMessage)

      // Send to all active group members
      const activeMembers = Array.from(group.members.values())
        .filter(member => member.status === 'active' && member.peerId !== myPeerId)

      const messageData = {
        type: 'group_message',
        groupId,
        messageId,
        senderId: myPeerId,
        encryptedContent,
        timestamp: groupMessage.timestamp.toISOString(),
        keyId: keyBundle.keyId
      }

      const messageJson = JSON.stringify(messageData)

      // Send to each member
      const deliveryPromises = activeMembers.map(async (member) => {
        try {
          await this.messagingManager.sendMessage(member.peerId, messageJson, MessageType.SYSTEM)
          groupMessage.deliveredTo.add(member.peerId)
          console.log('Group message sent to member:', member.peerId)
        } catch (error) {
          console.warn('Failed to send group message to member:', member.peerId, error)
        }
      })

      // Wait for all deliveries (don't fail if some fail)
      await Promise.allSettled(deliveryPromises)

      // Notify handlers
      this.notifyHandlers('onGroupMessage', groupMessage)

      console.log('Group message sent:', messageId, 'to group:', groupId)
      return messageId
    } catch (error) {
      console.error('Failed to send group message:', error)
      throw error
    }
  }

  /**
   * Leave group
   */
  async leaveGroup(groupId: string): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error('Group not found')
    }

    const myPeerId = this.p2pManager.getPeerId()
    const myMember = group.members.get(myPeerId)
    
    if (!myMember) {
      throw new Error('You are not a member of this group')
    }

    try {
      // Send leave notification to other members
      const leaveData = {
        type: 'group_member_left',
        groupId,
        peerId: myPeerId,
        timestamp: new Date().toISOString()
      }

      const activeMembers = Array.from(group.members.values())
        .filter(member => member.status === 'active' && member.peerId !== myPeerId)

      const leaveJson = JSON.stringify(leaveData)

      // Notify all members
      const notificationPromises = activeMembers.map(async (member) => {
        try {
          await this.messagingManager.sendMessage(member.peerId, leaveJson, MessageType.SYSTEM)
        } catch (error) {
          console.warn('Failed to notify member of group leave:', member.peerId, error)
        }
      })

      await Promise.allSettled(notificationPromises)

      // Remove from group locally
      group.members.delete(myPeerId)

      // If this was the last admin, promote another member
      if (myMember.role === 'admin') {
        const remainingMembers = Array.from(group.members.values())
          .filter(member => member.status === 'active')
        
        if (remainingMembers.length > 0) {
          remainingMembers[0].role = 'admin'
        }
      }

      // Clean up local data
      this.cleanupGroupData(groupId)

      // Save changes
      await this.saveGroupData()

      console.log('Left group:', groupId)
    } catch (error) {
      console.error('Failed to leave group:', error)
      throw error
    }
  }

  /**
   * Get group information
   */
  getGroup(groupId: string): GroupInfo | null {
    return this.groups.get(groupId) || null
  }

  /**
   * Get all groups
   */
  getAllGroups(): GroupInfo[] {
    return Array.from(this.groups.values())
  }

  /**
   * Get group messages
   */
  getGroupMessages(groupId: string): GroupMessage[] {
    return this.groupMessages.get(groupId) || []
  }

  /**
   * Get pending invitations
   */
  getPendingInvitations(): GroupInvitation[] {
    return Array.from(this.pendingInvitations.values())
      .filter(inv => inv.status === 'pending' && new Date() <= inv.expiresAt)
  }

  /**
   * Register event handler
   */
  addHandler(handler: GroupCommunicationHandler): void {
    this.handlers.add(handler)
  }

  /**
   * Remove event handler
   */
  removeHandler(handler: GroupCommunicationHandler): void {
    this.handlers.delete(handler)
  }

  /**
   * Destroy group communication manager
   */
  destroy(): void {
    console.log('Destroying Group Communication Manager...')
    
    // Clear key rotation intervals
    this.keyRotationIntervals.forEach(interval => clearInterval(interval))
    this.keyRotationIntervals.clear()
    
    // Clear all data
    this.groups.clear()
    this.groupKeys.clear()
    this.groupMessages.clear()
    this.pendingInvitations.clear()
    this.sentInvitations.clear()
    this.handlers.clear()
    
    console.log('Group Communication Manager destroyed')
  }

  // Private Methods

  /**
   * Setup message handling from P2P messaging manager
   */
  private setupMessageHandling(): void {
    this.messagingManager.onMessage((peerId, p2pMessage) => {
      this.handleIncomingMessage(peerId, p2pMessage)
    })
  }

  /**
   * Handle incoming P2P message for group communication
   */
  private async handleIncomingMessage(peerId: string, message: DecryptedP2PMessage): Promise<void> {
    if (message.type !== MessageType.SYSTEM) {
      return
    }

    try {
      const systemData = JSON.parse(message.content)
      
      switch (systemData.type) {
        case 'group_invitation':
          await this.handleGroupInvitation(peerId, systemData.invitation)
          break
        case 'group_invitation_response':
          await this.handleInvitationResponse(peerId, systemData)
          break
        case 'group_message':
          await this.handleGroupMessage(peerId, systemData)
          break
        case 'group_member_joined':
          await this.handleMemberJoined(systemData)
          break
        case 'group_member_left':
          await this.handleMemberLeft(systemData)
          break
        case 'group_key_update':
          await this.handleGroupKeyUpdate(systemData)
          break
      }
    } catch (error) {
      console.warn('Failed to handle group communication message:', error)
    }
  }

  /**
   * Handle group invitation
   */
  private async handleGroupInvitation(peerId: string, invitationData: any): Promise<void> {
    const invitation: GroupInvitation = {
      id: invitationData.id,
      groupId: invitationData.groupId,
      groupName: invitationData.groupName,
      invitedBy: peerId,
      invitedPeer: this.p2pManager.getPeerId(),
      inviteCode: invitationData.inviteCode,
      expiresAt: new Date(invitationData.expiresAt),
      status: 'pending'
    }

    // Check if invitation is still valid
    if (new Date() > invitation.expiresAt) {
      invitation.status = 'expired'
      return
    }

    // Store invitation
    this.pendingInvitations.set(invitation.id, invitation)

    // Notify handlers
    this.notifyHandlers('onGroupInvitation', invitation)

    console.log('Received group invitation:', invitation.id, 'from:', peerId)
  }

  /**
   * Handle invitation response
   */
  private async handleInvitationResponse(peerId: string, responseData: any): Promise<void> {
    const invitationId = responseData.invitationId
    const accepted = responseData.accepted
    const invitation = this.sentInvitations.get(invitationId)

    if (!invitation) {
      console.warn('Received response for unknown invitation:', invitationId)
      return
    }

    if (accepted) {
      // Add member to group
      const group = this.groups.get(invitation.groupId)
      if (group) {
        const memberInfo = responseData.memberInfo
        const publicKeyBytes = new Uint8Array(memberInfo.publicKey)
        const publicKey = await crypto.subtle.importKey(
          'raw',
          publicKeyBytes,
          { name: 'Ed25519', namedCurve: 'Ed25519' },
          false,
          ['verify']
        )

        const newMember: GroupMember = {
          peerId: memberInfo.peerId,
          did: memberInfo.did,
          publicKey,
          joinedAt: new Date(),
          role: 'member',
          status: 'active'
        }

        group.members.set(memberInfo.peerId, newMember)

        // Send group keys to new member
        await this.sendGroupKeysToMember(invitation.groupId, memberInfo.peerId)

        // Notify other members
        await this.notifyGroupMemberJoined(invitation.groupId, newMember)

        // Save changes
        await this.saveGroupData()

        // Notify handlers
        this.notifyHandlers('onMemberJoined', invitation.groupId, newMember)
        this.notifyHandlers('onGroupUpdated', group)

        console.log('Member joined group:', invitation.groupId, 'member:', memberInfo.peerId)
      }
    }

    // Update invitation status
    invitation.status = accepted ? 'accepted' : 'declined'
  }

  /**
   * Handle group message
   */
  private async handleGroupMessage(peerId: string, messageData: any): Promise<void> {
    const groupId = messageData.groupId
    const group = this.groups.get(groupId)
    
    if (!group) {
      console.warn('Received message for unknown group:', groupId)
      return
    }

    const member = group.members.get(peerId)
    if (!member || member.status !== 'active') {
      console.warn('Received message from non-member:', peerId)
      return
    }

    try {
      // Get group keys
      const keyBundle = this.groupKeys.get(groupId)
      if (!keyBundle || keyBundle.keyId !== messageData.keyId) {
        console.warn('Group keys not found or outdated for message')
        return
      }

      // Decrypt message
      const decryptedContent = await this.decryptGroupMessage(messageData.encryptedContent, keyBundle)

      // Create group message
      const groupMessage: GroupMessage = {
        id: messageData.messageId,
        groupId,
        senderId: peerId,
        content: decryptedContent,
        timestamp: new Date(messageData.timestamp),
        messageType: 'text',
        encrypted: true,
        deliveredTo: new Set([this.p2pManager.getPeerId()]),
        readBy: new Set()
      }

      // Add to message history
      this.addToGroupMessageHistory(groupId, groupMessage)

      // Notify handlers
      this.notifyHandlers('onGroupMessage', groupMessage)

      console.log('Received group message:', groupMessage.id, 'from:', peerId)
    } catch (error) {
      console.error('Failed to handle group message:', error)
    }
  }

  /**
   * Handle member joined notification
   */
  private async handleMemberJoined(data: any): Promise<void> {
    const groupId = data.groupId
    const memberData = data.member
    const group = this.groups.get(groupId)

    if (!group) {
      return
    }

    // Reconstruct member object
    const publicKeyBytes = new Uint8Array(memberData.publicKey)
    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    )

    const member: GroupMember = {
      peerId: memberData.peerId,
      did: memberData.did,
      publicKey,
      joinedAt: new Date(memberData.joinedAt),
      role: memberData.role,
      status: memberData.status
    }

    // Add to group
    group.members.set(member.peerId, member)

    // Save changes
    await this.saveGroupData()

    // Notify handlers
    this.notifyHandlers('onMemberJoined', groupId, member)
    this.notifyHandlers('onGroupUpdated', group)
  }

  /**
   * Handle member left notification
   */
  private async handleMemberLeft(data: any): Promise<void> {
    const groupId = data.groupId
    const peerId = data.peerId
    const group = this.groups.get(groupId)

    if (!group) {
      return
    }

    // Remove member
    group.members.delete(peerId)

    // Save changes
    await this.saveGroupData()

    // Notify handlers
    this.notifyHandlers('onMemberLeft', groupId, peerId)
    this.notifyHandlers('onGroupUpdated', group)

    console.log('Member left group:', groupId, 'member:', peerId)
  }

  /**
   * Handle group key update
   */
  private async handleGroupKeyUpdate(data: any): Promise<void> {
    const groupId = data.groupId
    const keyData = data.keyBundle

    try {
      // Reconstruct key bundle
      const encryptionKeyBytes = new Uint8Array(keyData.encryptionKey)
      const signingKeyBytes = new Uint8Array(keyData.signingKey)

      const encryptionKey = await crypto.subtle.importKey(
        'raw',
        encryptionKeyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      )

      const signingKey = await crypto.subtle.importKey(
        'raw',
        signingKeyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
      )

      const keyBundle: GroupKeyBundle = {
        groupId,
        keyId: keyData.keyId,
        encryptionKey,
        signingKey,
        version: keyData.version,
        createdAt: new Date(keyData.createdAt),
        expiresAt: new Date(keyData.expiresAt)
      }

      // Update keys
      this.groupKeys.set(groupId, keyBundle)

      // Notify handlers
      this.notifyHandlers('onGroupKeyUpdate', groupId, keyBundle)

      console.log('Group keys updated:', groupId, 'version:', keyBundle.version)
    } catch (error) {
      console.error('Failed to handle group key update:', error)
    }
  }

  /**
   * Generate group encryption keys (requirement 4.2)
   */
  private async generateGroupKeys(groupId: string): Promise<GroupKeyBundle> {
    try {
      // Generate AES-GCM key for message encryption
      const encryptionKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      )

      // Generate HMAC key for message authentication
      const signingKey = await crypto.subtle.generateKey(
        { name: 'HMAC', hash: 'SHA-256' },
        true,
        ['sign', 'verify']
      )

      const keyBundle: GroupKeyBundle = {
        groupId,
        keyId: crypto.randomUUID(),
        encryptionKey,
        signingKey,
        version: 1,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }

      return keyBundle
    } catch (error) {
      console.error('Failed to generate group keys:', error)
      throw new Error(`Group key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Encrypt message for group
   */
  private async encryptGroupMessage(content: string, keyBundle: GroupKeyBundle): Promise<string> {
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(content)
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12))
      
      // Encrypt with AES-GCM
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        keyBundle.encryptionKey,
        data
      )

      // Create MAC with HMAC
      const mac = await crypto.subtle.sign(
        'HMAC',
        keyBundle.signingKey,
        new Uint8Array(encrypted)
      )

      // Combine IV, encrypted data, and MAC
      const result = {
        iv: Array.from(iv),
        encrypted: Array.from(new Uint8Array(encrypted)),
        mac: Array.from(new Uint8Array(mac)),
        keyId: keyBundle.keyId
      }

      return JSON.stringify(result)
    } catch (error) {
      console.error('Failed to encrypt group message:', error)
      throw new Error(`Group message encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Decrypt group message
   */
  private async decryptGroupMessage(encryptedData: string, keyBundle: GroupKeyBundle): Promise<string> {
    try {
      const data = JSON.parse(encryptedData)
      
      // Verify MAC
      const encrypted = new Uint8Array(data.encrypted)
      const mac = new Uint8Array(data.mac)
      
      const isValidMac = await crypto.subtle.verify(
        'HMAC',
        keyBundle.signingKey,
        mac,
        encrypted
      )

      if (!isValidMac) {
        throw new Error('Message authentication failed')
      }

      // Decrypt with AES-GCM
      const iv = new Uint8Array(data.iv)
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        keyBundle.encryptionKey,
        encrypted
      )

      const decoder = new TextDecoder()
      return decoder.decode(decrypted)
    } catch (error) {
      console.error('Failed to decrypt group message:', error)
      throw new Error(`Group message decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Send group keys to new member
   */
  private async sendGroupKeysToMember(groupId: string, peerId: string): Promise<void> {
    const keyBundle = this.groupKeys.get(groupId)
    if (!keyBundle) {
      throw new Error('Group keys not found')
    }

    try {
      // Export keys for transmission
      const encryptionKeyBytes = await crypto.subtle.exportKey('raw', keyBundle.encryptionKey)
      const signingKeyBytes = await crypto.subtle.exportKey('raw', keyBundle.signingKey)

      const keyData = {
        type: 'group_key_update',
        groupId,
        keyBundle: {
          keyId: keyBundle.keyId,
          encryptionKey: Array.from(new Uint8Array(encryptionKeyBytes)),
          signingKey: Array.from(new Uint8Array(signingKeyBytes)),
          version: keyBundle.version,
          createdAt: keyBundle.createdAt.toISOString(),
          expiresAt: keyBundle.expiresAt.toISOString()
        }
      }

      await this.messagingManager.sendMessage(
        peerId,
        JSON.stringify(keyData),
        MessageType.SYSTEM
      )

      console.log('Group keys sent to member:', peerId)
    } catch (error) {
      console.error('Failed to send group keys to member:', error)
      throw error
    }
  }

  /**
   * Notify group members about new member
   */
  private async notifyGroupMemberJoined(groupId: string, newMember: GroupMember): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) {
      return
    }

    const publicKeyBytes = await crypto.subtle.exportKey('raw', newMember.publicKey)
    
    const memberData = {
      type: 'group_member_joined',
      groupId,
      member: {
        peerId: newMember.peerId,
        did: newMember.did,
        publicKey: Array.from(new Uint8Array(publicKeyBytes)),
        joinedAt: newMember.joinedAt.toISOString(),
        role: newMember.role,
        status: newMember.status
      }
    }

    const memberJson = JSON.stringify(memberData)
    const myPeerId = this.p2pManager.getPeerId()

    // Notify all other active members
    const activeMembers = Array.from(group.members.values())
      .filter(member => member.status === 'active' && member.peerId !== myPeerId && member.peerId !== newMember.peerId)

    const notificationPromises = activeMembers.map(async (member) => {
      try {
        await this.messagingManager.sendMessage(member.peerId, memberJson, MessageType.SYSTEM)
      } catch (error) {
        console.warn('Failed to notify member of new join:', member.peerId, error)
      }
    })

    await Promise.allSettled(notificationPromises)
  }

  /**
   * Setup automatic key rotation for group
   */
  private setupKeyRotation(groupId: string): void {
    const interval = setInterval(async () => {
      try {
        await this.rotateGroupKeys(groupId)
      } catch (error) {
        console.error('Failed to rotate group keys:', error)
      }
    }, this.KEY_ROTATION_INTERVAL)

    this.keyRotationIntervals.set(groupId, interval)
  }

  /**
   * Rotate group keys
   */
  private async rotateGroupKeys(groupId: string): Promise<void> {
    const group = this.groups.get(groupId)
    const currentKeys = this.groupKeys.get(groupId)
    
    if (!group || !currentKeys) {
      return
    }

    const myPeerId = this.p2pManager.getPeerId()
    const myMember = group.members.get(myPeerId)
    
    if (!myMember || myMember.role !== 'admin') {
      return // Only admins can rotate keys
    }

    try {
      console.log('Rotating keys for group:', groupId)
      
      // Generate new keys
      const newKeyBundle = await this.generateGroupKeys(groupId)
      newKeyBundle.version = currentKeys.version + 1
      
      // Update local keys
      this.groupKeys.set(groupId, newKeyBundle)
      
      // Send new keys to all active members
      const activeMembers = Array.from(group.members.values())
        .filter(member => member.status === 'active' && member.peerId !== myPeerId)

      const keyUpdatePromises = activeMembers.map(async (member) => {
        try {
          await this.sendGroupKeysToMember(groupId, member.peerId)
        } catch (error) {
          console.warn('Failed to send rotated keys to member:', member.peerId, error)
        }
      })

      await Promise.allSettled(keyUpdatePromises)
      
      // Save changes
      await this.saveGroupData()
      
      console.log('Group keys rotated successfully:', groupId, 'version:', newKeyBundle.version)
    } catch (error) {
      console.error('Failed to rotate group keys:', error)
    }
  }

  /**
   * Generate invite code
   */
  private generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * Add message to group history
   */
  private addToGroupMessageHistory(groupId: string, message: GroupMessage): void {
    if (!this.groupMessages.has(groupId)) {
      this.groupMessages.set(groupId, [])
    }
    
    const messages = this.groupMessages.get(groupId)!
    
    // Check if message already exists
    if (!messages.some(msg => msg.id === message.id)) {
      messages.push(message)
      
      // Sort messages by timestamp
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      
      // Limit message history (keep last 1000 messages)
      if (messages.length > 1000) {
        messages.splice(0, messages.length - 1000)
      }
    }
  }

  /**
   * Clean up group data when leaving
   */
  private cleanupGroupData(groupId: string): void {
    // Clear key rotation interval
    const interval = this.keyRotationIntervals.get(groupId)
    if (interval) {
      clearInterval(interval)
      this.keyRotationIntervals.delete(groupId)
    }

    // Remove group data
    this.groups.delete(groupId)
    this.groupKeys.delete(groupId)
    this.groupMessages.delete(groupId)
  }

  /**
   * Save group data to storage
   */
  private async saveGroupData(): Promise<void> {
    try {
      // Save groups (without CryptoKey objects)
      const groupsData = Array.from(this.groups.entries()).map(([id, group]) => [
        id,
        {
          ...group,
          members: Array.from(group.members.entries()).map(([peerId, member]) => [
            peerId,
            {
              ...member,
              publicKey: null, // Will be reconstructed from DID
              joinedAt: member.joinedAt.toISOString()
            }
          ])
        }
      ])

      localStorage.setItem('p2p-groups', JSON.stringify(groupsData))

      // Save group messages
      const messagesData = Array.from(this.groupMessages.entries()).map(([id, messages]) => [
        id,
        messages.map(msg => ({
          ...msg,
          timestamp: msg.timestamp.toISOString(),
          deliveredTo: Array.from(msg.deliveredTo),
          readBy: Array.from(msg.readBy)
        }))
      ])

      localStorage.setItem('p2p-group-messages', JSON.stringify(messagesData))

      console.log('Group data saved to storage')
    } catch (error) {
      console.error('Failed to save group data:', error)
    }
  }

  /**
   * Load group data from storage
   */
  private async loadGroupData(): Promise<void> {
    try {
      // Load groups
      const groupsData = localStorage.getItem('p2p-groups')
      if (groupsData) {
        const parsedGroups = JSON.parse(groupsData)
        
        for (const [id, groupData] of parsedGroups) {
          const group: GroupInfo = {
            ...groupData,
            createdAt: new Date(groupData.createdAt),
            members: new Map()
          }

          // Reconstruct members
          for (const [peerId, memberData] of groupData.members) {
            // Skip members without valid DID (will be reconstructed when they rejoin)
            if (!memberData.did) continue

            try {
              // For now, skip DID reconstruction in loading (will be handled when members rejoin)
              // In a full implementation, you would extract the public key from the DID
              const publicKey = {} as CryptoKey // Placeholder

              const member: GroupMember = {
                ...memberData,
                publicKey,
                joinedAt: new Date(memberData.joinedAt)
              }

              group.members.set(peerId, member)
            } catch (error) {
              console.warn('Failed to reconstruct member:', peerId, error)
            }
          }

          this.groups.set(id, group)
        }
      }

      // Load group messages
      const messagesData = localStorage.getItem('p2p-group-messages')
      if (messagesData) {
        const parsedMessages = JSON.parse(messagesData)
        
        for (const [id, messages] of parsedMessages) {
          const groupMessages = messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
            deliveredTo: new Set(msg.deliveredTo),
            readBy: new Set(msg.readBy)
          }))

          this.groupMessages.set(id, groupMessages)
        }
      }

      console.log('Group data loaded from storage')
    } catch (error) {
      console.error('Failed to load group data:', error)
    }
  }

  /**
   * Notify all handlers
   */
  private notifyHandlers(method: keyof GroupCommunicationHandler, ...args: any[]): void {
    this.handlers.forEach(handler => {
      try {
        const handlerMethod = handler[method] as Function
        if (typeof handlerMethod === 'function') {
          handlerMethod.apply(handler, args)
        }
      } catch (error) {
        console.error('Group communication handler callback failed:', error)
      }
    })
  }
}