import { GroupCommunicationManager, GroupCommunicationHandler, GroupInfo, GroupMessage, GroupInvitation } from '../GroupCommunicationManager'
import { CryptoManager } from '../CryptoManager'
import { P2PMessagingManager } from '../P2PMessagingManager'
import { P2PManager } from '../P2PManager'
import { WebRTCManager } from '../WebRTCManager'

/**
 * Example demonstrating Group Communication functionality
 * Shows how to create groups, invite members, send messages, and handle group events
 */
export class GroupCommunicationExample {
  private groupManager: GroupCommunicationManager
  private cryptoManager: CryptoManager
  private messagingManager: P2PMessagingManager
  private p2pManager: P2PManager

  constructor() {
    // Initialize P2P components
    this.cryptoManager = new CryptoManager()
    
    const webrtcManager = new WebRTCManager({
      stunServers: ['stun:stun.l.google.com:19302'],
      turnServers: []
    })
    
    this.p2pManager = new P2PManager({
      bootstrapNodes: [],
      stunServers: ['stun:stun.l.google.com:19302'],
      turnServers: [],
      geohashPrecision: 5,
      maxPeers: 50,
      discoveryInterval: 30000,
      enableEncryption: true,
      keyRotationInterval: 3600000,
      messageTimeout: 30000,
      reconnectInterval: 5000,
      maxRetries: 3
    })
    
    this.messagingManager = new P2PMessagingManager(
      this.cryptoManager,
      webrtcManager,
      this.p2pManager
    )
    
    this.groupManager = new GroupCommunicationManager(
      this.cryptoManager,
      this.messagingManager,
      this.p2pManager
    )
  }

  /**
   * Initialize the group communication system
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Group Communication Example...')
    
    try {
      // Initialize all components
      await this.p2pManager.initialize()
      await this.groupManager.initialize()
      
      // Setup event handlers
      this.setupEventHandlers()
      
      console.log('✅ Group Communication Example initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize Group Communication Example:', error)
      throw error
    }
  }

  /**
   * Example 1: Create a new group
   */
  async createGroupExample(): Promise<string> {
    console.log('\n📝 Example 1: Creating a new group...')
    
    try {
      const groupId = await this.groupManager.createGroup(
        'Tech Enthusiasts',
        'A group for discussing the latest in technology',
        25, // max 25 members
        false // public group
      )
      
      console.log('✅ Group created successfully!')
      console.log(`   Group ID: ${groupId}`)
      
      const group = this.groupManager.getGroup(groupId)
      if (group) {
        console.log(`   Group Name: ${group.name}`)
        console.log(`   Description: ${group.description}`)
        console.log(`   Members: ${group.members.size}`)
        console.log(`   Created by: ${group.createdBy}`)
      }
      
      return groupId
    } catch (error) {
      console.error('❌ Failed to create group:', error)
      throw error
    }
  }

  /**
   * Example 2: Create a private group with invite code
   */
  async createPrivateGroupExample(): Promise<string> {
    console.log('\n🔒 Example 2: Creating a private group...')
    
    try {
      const groupId = await this.groupManager.createGroup(
        'Secret Project Team',
        'Private group for project discussions',
        10, // max 10 members
        true // private group
      )
      
      const group = this.groupManager.getGroup(groupId)
      if (group) {
        console.log('✅ Private group created successfully!')
        console.log(`   Group ID: ${groupId}`)
        console.log(`   Group Name: ${group.name}`)
        console.log(`   Invite Code: ${group.inviteCode}`)
        console.log(`   Private: ${group.isPrivate}`)
      }
      
      return groupId
    } catch (error) {
      console.error('❌ Failed to create private group:', error)
      throw error
    }
  }

  /**
   * Example 3: Invite a peer to a group
   */
  async invitePeerExample(groupId: string, peerId: string): Promise<void> {
    console.log('\n📧 Example 3: Inviting a peer to the group...')
    
    try {
      const invitationId = await this.groupManager.invitePeerToGroup(groupId, peerId)
      
      console.log('✅ Invitation sent successfully!')
      console.log(`   Invitation ID: ${invitationId}`)
      console.log(`   Invited Peer: ${peerId}`)
      console.log(`   Group ID: ${groupId}`)
      
    } catch (error) {
      console.error('❌ Failed to send invitation:', error)
      throw error
    }
  }

  /**
   * Example 4: Handle incoming invitations
   */
  async handleInvitationsExample(): Promise<void> {
    console.log('\n📨 Example 4: Handling incoming invitations...')
    
    const pendingInvitations = this.groupManager.getPendingInvitations()
    
    if (pendingInvitations.length === 0) {
      console.log('📭 No pending invitations')
      return
    }
    
    console.log(`📬 Found ${pendingInvitations.length} pending invitation(s):`)
    
    for (const invitation of pendingInvitations) {
      console.log(`\n   Invitation ID: ${invitation.id}`)
      console.log(`   Group: ${invitation.groupName}`)
      console.log(`   Invited by: ${invitation.invitedBy}`)
      console.log(`   Expires: ${invitation.expiresAt.toLocaleString()}`)
      
      // Example: Accept the first invitation
      if (invitation === pendingInvitations[0]) {
        try {
          await this.groupManager.acceptGroupInvitation(invitation.id)
          console.log('✅ Invitation accepted!')
        } catch (error) {
          console.error('❌ Failed to accept invitation:', error)
        }
      }
    }
  }

  /**
   * Example 5: Send messages to a group
   */
  async sendGroupMessagesExample(groupId: string): Promise<void> {
    console.log('\n💬 Example 5: Sending messages to the group...')
    
    const messages = [
      'Hello everyone! 👋',
      'Welcome to our group chat!',
      'Feel free to share your thoughts and ideas here.',
      'Looking forward to great discussions! 🚀'
    ]
    
    try {
      for (const message of messages) {
        const messageId = await this.groupManager.sendGroupMessage(groupId, message)
        console.log(`✅ Message sent: "${message}" (ID: ${messageId})`)
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      // Display message history
      const messageHistory = this.groupManager.getGroupMessages(groupId)
      console.log(`\n📜 Group message history (${messageHistory.length} messages):`)
      
      messageHistory.forEach((msg, index) => {
        console.log(`   ${index + 1}. [${msg.timestamp.toLocaleTimeString()}] ${msg.senderId}: ${msg.content}`)
      })
      
    } catch (error) {
      console.error('❌ Failed to send group message:', error)
      throw error
    }
  }

  /**
   * Example 6: Manage group members
   */
  async manageGroupMembersExample(groupId: string): Promise<void> {
    console.log('\n👥 Example 6: Managing group members...')
    
    const group = this.groupManager.getGroup(groupId)
    if (!group) {
      console.log('❌ Group not found')
      return
    }
    
    console.log(`📊 Group: ${group.name}`)
    console.log(`   Total members: ${group.members.size}`)
    console.log(`   Max members: ${group.maxMembers}`)
    console.log(`   Created: ${group.createdAt.toLocaleString()}`)
    
    console.log('\n👤 Member list:')
    Array.from(group.members.values()).forEach((member, index) => {
      console.log(`   ${index + 1}. ${member.peerId}`)
      console.log(`      Role: ${member.role}`)
      console.log(`      Status: ${member.status}`)
      console.log(`      Joined: ${member.joinedAt.toLocaleString()}`)
      console.log(`      DID: ${member.did}`)
    })
  }

  /**
   * Example 7: Leave a group
   */
  async leaveGroupExample(groupId: string): Promise<void> {
    console.log('\n🚪 Example 7: Leaving the group...')
    
    try {
      const group = this.groupManager.getGroup(groupId)
      if (!group) {
        console.log('❌ Group not found')
        return
      }
      
      console.log(`Leaving group: ${group.name}`)
      await this.groupManager.leaveGroup(groupId)
      
      console.log('✅ Successfully left the group')
      
      // Verify group is no longer accessible
      const leftGroup = this.groupManager.getGroup(groupId)
      console.log(`Group accessible after leaving: ${leftGroup !== null}`)
      
    } catch (error) {
      console.error('❌ Failed to leave group:', error)
      throw error
    }
  }

  /**
   * Example 8: Monitor all groups
   */
  async monitorAllGroupsExample(): Promise<void> {
    console.log('\n📊 Example 8: Monitoring all groups...')
    
    const allGroups = this.groupManager.getAllGroups()
    
    if (allGroups.length === 0) {
      console.log('📭 No groups found')
      return
    }
    
    console.log(`📈 Total groups: ${allGroups.length}`)
    
    allGroups.forEach((group, index) => {
      console.log(`\n   ${index + 1}. ${group.name}`)
      console.log(`      ID: ${group.id}`)
      console.log(`      Members: ${group.members.size}/${group.maxMembers}`)
      console.log(`      Private: ${group.isPrivate}`)
      console.log(`      Created: ${group.createdAt.toLocaleString()}`)
      
      // Show recent messages
      const messages = this.groupManager.getGroupMessages(group.id)
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1]
        console.log(`      Last message: "${lastMessage.content}" (${lastMessage.timestamp.toLocaleTimeString()})`)
      } else {
        console.log(`      Last message: None`)
      }
    })
  }

  /**
   * Setup event handlers for group communication
   */
  private setupEventHandlers(): void {
    console.log('🔧 Setting up group communication event handlers...')
    
    const handler: GroupCommunicationHandler = {
      onGroupMessage: (message: GroupMessage) => {
        console.log(`\n💬 New group message received:`)
        console.log(`   Group: ${message.groupId}`)
        console.log(`   From: ${message.senderId}`)
        console.log(`   Content: "${message.content}"`)
        console.log(`   Time: ${message.timestamp.toLocaleString()}`)
        console.log(`   Encrypted: ${message.encrypted}`)
      },

      onMemberJoined: (groupId: string, member) => {
        console.log(`\n👋 New member joined group:`)
        console.log(`   Group: ${groupId}`)
        console.log(`   Member: ${member.peerId}`)
        console.log(`   Role: ${member.role}`)
        console.log(`   DID: ${member.did}`)
      },

      onMemberLeft: (groupId: string, peerId: string) => {
        console.log(`\n👋 Member left group:`)
        console.log(`   Group: ${groupId}`)
        console.log(`   Member: ${peerId}`)
      },

      onGroupInvitation: (invitation: GroupInvitation) => {
        console.log(`\n📧 New group invitation received:`)
        console.log(`   Group: ${invitation.groupName}`)
        console.log(`   From: ${invitation.invitedBy}`)
        console.log(`   Invite Code: ${invitation.inviteCode}`)
        console.log(`   Expires: ${invitation.expiresAt.toLocaleString()}`)
      },

      onGroupKeyUpdate: (groupId: string, keyBundle) => {
        console.log(`\n🔑 Group keys updated:`)
        console.log(`   Group: ${groupId}`)
        console.log(`   Key Version: ${keyBundle.version}`)
        console.log(`   Key ID: ${keyBundle.keyId}`)
      },

      onGroupUpdated: (group: GroupInfo) => {
        console.log(`\n📝 Group updated:`)
        console.log(`   Group: ${group.name} (${group.id})`)
        console.log(`   Members: ${group.members.size}`)
      }
    }
    
    this.groupManager.addHandler(handler)
    console.log('✅ Event handlers registered')
  }

  /**
   * Run all examples in sequence
   */
  async runAllExamples(): Promise<void> {
    console.log('🎯 Running all Group Communication examples...\n')
    
    try {
      // Initialize the system
      await this.initialize()
      
      // Example 1: Create a public group
      const publicGroupId = await this.createGroupExample()
      
      // Example 2: Create a private group
      const privateGroupId = await this.createPrivateGroupExample()
      
      // Example 3: Invite a peer (simulated)
      const mockPeerId = 'example-peer-123'
      await this.invitePeerExample(publicGroupId, mockPeerId)
      
      // Example 4: Handle invitations
      await this.handleInvitationsExample()
      
      // Example 5: Send messages to the public group
      await this.sendGroupMessagesExample(publicGroupId)
      
      // Example 6: Manage group members
      await this.manageGroupMembersExample(publicGroupId)
      
      // Example 8: Monitor all groups
      await this.monitorAllGroupsExample()
      
      // Example 7: Leave a group (do this last)
      await this.leaveGroupExample(privateGroupId)
      
      console.log('\n🎉 All examples completed successfully!')
      
    } catch (error) {
      console.error('\n❌ Example execution failed:', error)
      throw error
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    console.log('🧹 Cleaning up Group Communication Example...')
    this.groupManager.destroy()
    console.log('✅ Cleanup completed')
  }
}

/**
 * Example usage
 */
export async function runGroupCommunicationExample(): Promise<void> {
  const example = new GroupCommunicationExample()
  
  try {
    await example.runAllExamples()
  } catch (error) {
    console.error('Example failed:', error)
  } finally {
    example.destroy()
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runGroupCommunicationExample().catch(console.error)
}