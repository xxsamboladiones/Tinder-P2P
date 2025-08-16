import { ProfileCRDT } from './ProfileCRDT'
import { P2PMessage, MessageType } from './types'

export interface OfflineChange {
  id: string
  type: 'profile_update' | 'message' | 'like' | 'match'
  timestamp: Date
  data: any
  synced: boolean
  retryCount: number
  lastRetry?: Date
}

export interface OfflineDataStore {
  profiles: Map<string, { crdt: ProfileCRDT; lastSync: Date }>
  pendingChanges: OfflineChange[]
  messageQueue: P2PMessage[]
  syncState: {
    lastFullSync: Date | null
    isOnline: boolean
    syncInProgress: boolean
  }
}

export interface StorageAdapter {
  save(key: string, data: any): Promise<void>
  load(key: string): Promise<any | null>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
  clear(): Promise<void>
}

// IndexedDB Storage Adapter for Electron
export class IndexedDBStorageAdapter implements StorageAdapter {
  private dbName = 'tinder-p2p-offline'
  private version = 1
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Create object stores
        if (!db.objectStoreNames.contains('data')) {
          db.createObjectStore('data', { keyPath: 'key' })
        }
      }
    })
  }

  async save(key: string, data: any): Promise<void> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readwrite')
      const store = transaction.objectStore('data')
      
      const serializedData = this.serialize(data)
      const request = store.put({ key, data: serializedData, timestamp: Date.now() })
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async load(key: string): Promise<any | null> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readonly')
      const store = transaction.objectStore('data')
      const request = store.get(key)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        if (request.result) {
          resolve(this.deserialize(request.result.data))
        } else {
          resolve(null)
        }
      }
    })
  }

  async delete(key: string): Promise<void> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readwrite')
      const store = transaction.objectStore('data')
      const request = store.delete(key)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async list(prefix: string): Promise<string[]> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readonly')
      const store = transaction.objectStore('data')
      const request = store.getAllKeys()
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const keys = request.result as string[]
        const filteredKeys = keys.filter(key => key.startsWith(prefix))
        resolve(filteredKeys)
      }
    })
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readwrite')
      const store = transaction.objectStore('data')
      const request = store.clear()
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  private serialize(data: any): string {
    if (data instanceof ProfileCRDT) {
      return JSON.stringify({
        type: 'ProfileCRDT',
        id: data.id,
        did: data.did,
        created: data.created.toISOString(),
        serializedData: Array.from(data.serialize())
      })
    }
    
    return JSON.stringify(data, (key, value) => {
      if (value instanceof Date) {
        return { type: 'Date', value: value.toISOString() }
      }
      if (value instanceof Map) {
        return { type: 'Map', value: Array.from(value.entries()) }
      }
      if (value instanceof Set) {
        return { type: 'Set', value: Array.from(value) }
      }
      if (value instanceof Uint8Array) {
        return { type: 'Uint8Array', value: Array.from(value) }
      }
      return value
    })
  }

  private deserialize(data: string): any {
    const parsed = JSON.parse(data, (key, value) => {
      if (value && typeof value === 'object' && value.type) {
        switch (value.type) {
          case 'Date':
            return new Date(value.value)
          case 'Map':
            return new Map(value.value)
          case 'Set':
            return new Set(value.value)
          case 'Uint8Array':
            return new Uint8Array(value.value)
        }
      }
      return value
    })

    if (parsed.type === 'ProfileCRDT') {
      const serializedData = new Uint8Array(parsed.serializedData)
      return ProfileCRDT.deserialize(serializedData, parsed.id, parsed.did)
    }

    return parsed
  }
}

export class OfflineDataManager {
  private storage: StorageAdapter
  private data: OfflineDataStore
  private syncCallbacks: Set<(isOnline: boolean) => void> = new Set()
  private changeCallbacks: Set<(change: OfflineChange) => void> = new Set()
  private maxRetries = 3
  private retryDelay = 5000 // 5 seconds
  private syncInterval: NodeJS.Timeout | null = null

  constructor(storage?: StorageAdapter) {
    this.storage = storage || new IndexedDBStorageAdapter()
    this.data = {
      profiles: new Map(),
      pendingChanges: [],
      messageQueue: [],
      syncState: {
        lastFullSync: null,
        isOnline: false,
        syncInProgress: false
      }
    }
  }

  async initialize(): Promise<void> {
    try {
      // Initialize storage
      if (this.storage instanceof IndexedDBStorageAdapter) {
        await (this.storage as IndexedDBStorageAdapter).init()
      }

      // Load existing data
      await this.loadFromStorage()

      // Set up periodic sync attempts
      this.startPeriodicSync()

      console.log('OfflineDataManager initialized')
    } catch (error) {
      console.error('Failed to initialize OfflineDataManager:', error)
      throw error
    }
  }

  // Profile Management
  async storeProfile(profile: ProfileCRDT): Promise<void> {
    try {
      const key = `profile:${profile.id}`
      const profileData = {
        crdt: profile,
        lastSync: new Date()
      }

      // Store in memory
      this.data.profiles.set(profile.id, profileData)

      // Persist to storage
      await this.storage.save(key, profileData)

      console.log('Profile stored offline:', profile.id)
    } catch (error) {
      console.error('Failed to store profile:', error)
      throw error
    }
  }

  async getProfile(profileId: string): Promise<ProfileCRDT | null> {
    try {
      // Check memory first
      const cached = this.data.profiles.get(profileId)
      if (cached) {
        return cached.crdt
      }

      // Load from storage
      const key = `profile:${profileId}`
      const stored = await this.storage.load(key)
      if (stored && stored.crdt) {
        this.data.profiles.set(profileId, stored)
        return stored.crdt
      }

      return null
    } catch (error) {
      console.error('Failed to get profile:', error)
      return null
    }
  }

  async getAllProfiles(): Promise<ProfileCRDT[]> {
    try {
      // Load all profiles from storage if not in memory
      const profileKeys = await this.storage.list('profile:')
      const profiles: ProfileCRDT[] = []

      for (const key of profileKeys) {
        const profileId = key.replace('profile:', '')
        const profile = await this.getProfile(profileId)
        if (profile) {
          profiles.push(profile)
        }
      }

      return profiles
    } catch (error) {
      console.error('Failed to get all profiles:', error)
      return []
    }
  }

  // Change Tracking
  async trackChange(type: OfflineChange['type'], data: any): Promise<string> {
    const change: OfflineChange = {
      id: crypto.randomUUID(),
      type,
      timestamp: new Date(),
      data,
      synced: false,
      retryCount: 0
    }

    // Add to pending changes
    this.data.pendingChanges.push(change)

    // Persist pending changes
    await this.savePendingChanges()

    // Notify callbacks
    this.changeCallbacks.forEach(callback => {
      try {
        callback(change)
      } catch (error) {
        console.error('Change callback failed:', error)
      }
    })

    console.log('Change tracked:', change.id, change.type)
    return change.id
  }

  async markChangeSynced(changeId: string): Promise<void> {
    const changeIndex = this.data.pendingChanges.findIndex(c => c.id === changeId)
    if (changeIndex !== -1) {
      this.data.pendingChanges[changeIndex].synced = true
      await this.savePendingChanges()
      console.log('Change marked as synced:', changeId)
    }
  }

  async removeChange(changeId: string): Promise<void> {
    const changeIndex = this.data.pendingChanges.findIndex(c => c.id === changeId)
    if (changeIndex !== -1) {
      this.data.pendingChanges.splice(changeIndex, 1)
      await this.savePendingChanges()
      console.log('Change removed:', changeId)
    }
  }

  getPendingChanges(): OfflineChange[] {
    return [...this.data.pendingChanges.filter(c => !c.synced)]
  }

  // Message Queue Management
  async queueMessage(message: P2PMessage): Promise<void> {
    this.data.messageQueue.push(message)
    await this.saveMessageQueue()
    console.log('Message queued for offline delivery:', message.type)
  }

  async dequeueMessage(): Promise<P2PMessage | null> {
    const message = this.data.messageQueue.shift()
    if (message) {
      await this.saveMessageQueue()
      return message
    }
    return null
  }

  getQueuedMessages(): P2PMessage[] {
    return [...this.data.messageQueue]
  }

  async clearMessageQueue(): Promise<void> {
    this.data.messageQueue = []
    await this.saveMessageQueue()
  }

  // Sync State Management
  setOnlineStatus(isOnline: boolean): void {
    if (this.data.syncState.isOnline !== isOnline) {
      this.data.syncState.isOnline = isOnline
      
      // Notify callbacks
      this.syncCallbacks.forEach(callback => {
        try {
          callback(isOnline)
        } catch (error) {
          console.error('Sync callback failed:', error)
        }
      })

      console.log('Online status changed:', isOnline)

      // Trigger sync if coming online
      if (isOnline && !this.data.syncState.syncInProgress) {
        this.triggerSync()
      }
    }
  }

  isOnline(): boolean {
    return this.data.syncState.isOnline
  }

  isSyncInProgress(): boolean {
    return this.data.syncState.syncInProgress
  }

  getLastSyncTime(): Date | null {
    return this.data.syncState.lastFullSync
  }

  // Sync Operations
  async triggerSync(): Promise<void> {
    if (this.data.syncState.syncInProgress) {
      console.log('Sync already in progress, skipping')
      return
    }

    if (!this.data.syncState.isOnline) {
      console.log('Offline, cannot sync')
      return
    }

    this.data.syncState.syncInProgress = true

    try {
      console.log('Starting sync reconciliation...')

      // Process pending changes
      await this.processPendingChanges()

      // Process queued messages
      await this.processQueuedMessages()

      // Update last sync time
      this.data.syncState.lastFullSync = new Date()
      await this.saveSyncState()

      console.log('Sync reconciliation completed')
    } catch (error) {
      console.error('Sync reconciliation failed:', error)
    } finally {
      this.data.syncState.syncInProgress = false
    }
  }

  private async processPendingChanges(): Promise<void> {
    const pendingChanges = this.getPendingChanges()
    console.log('Processing', pendingChanges.length, 'pending changes')

    for (const change of pendingChanges) {
      try {
        // Attempt to sync the change
        const success = await this.syncChange(change)
        
        if (success) {
          await this.markChangeSynced(change.id)
        } else {
          // Increment retry count
          change.retryCount++
          change.lastRetry = new Date()

          // Remove if max retries exceeded
          if (change.retryCount >= this.maxRetries) {
            console.warn('Max retries exceeded for change:', change.id)
            await this.removeChange(change.id)
          }
        }
      } catch (error) {
        console.error('Failed to process change:', change.id, error)
        change.retryCount++
        change.lastRetry = new Date()
      }
    }

    await this.savePendingChanges()
  }

  private async processQueuedMessages(): Promise<void> {
    const queuedMessages = this.getQueuedMessages()
    console.log('Processing', queuedMessages.length, 'queued messages')

    const processedMessages: P2PMessage[] = []

    for (const message of queuedMessages) {
      try {
        // Attempt to send the message
        const success = await this.sendQueuedMessage(message)
        
        if (success) {
          processedMessages.push(message)
        }
      } catch (error) {
        console.error('Failed to process queued message:', error)
      }
    }

    // Remove successfully processed messages
    for (const message of processedMessages) {
      const index = this.data.messageQueue.indexOf(message)
      if (index !== -1) {
        this.data.messageQueue.splice(index, 1)
      }
    }

    await this.saveMessageQueue()
  }

  // Abstract methods to be implemented by the application
  private async syncChange(change: OfflineChange): Promise<boolean> {
    // This would be implemented by the application to actually sync the change
    // For now, we'll simulate success
    console.log('Syncing change:', change.id, change.type)
    
    // Simulate network delay (shorter for tests)
    await new Promise(resolve => setTimeout(resolve, 10))
    
    // Simulate 90% success rate
    return Math.random() > 0.1
  }

  private async sendQueuedMessage(message: P2PMessage): Promise<boolean> {
    // This would be implemented by the application to actually send the message
    // For now, we'll simulate success
    console.log('Sending queued message:', message.type)
    
    // Simulate network delay (shorter for tests)
    await new Promise(resolve => setTimeout(resolve, 10))
    
    // Simulate 90% success rate
    return Math.random() > 0.1
  }

  // Event Handling
  onSyncStateChange(callback: (isOnline: boolean) => void): () => void {
    this.syncCallbacks.add(callback)
    return () => this.syncCallbacks.delete(callback)
  }

  onChangeTracked(callback: (change: OfflineChange) => void): () => void {
    this.changeCallbacks.add(callback)
    return () => this.changeCallbacks.delete(callback)
  }

  // Storage Operations
  private async loadFromStorage(): Promise<void> {
    try {
      // Load sync state
      const syncState = await this.storage.load('syncState')
      if (syncState) {
        this.data.syncState = { ...this.data.syncState, ...syncState }
      }

      // Load pending changes
      const pendingChanges = await this.storage.load('pendingChanges')
      if (pendingChanges && Array.isArray(pendingChanges)) {
        this.data.pendingChanges = pendingChanges
      }

      // Load message queue
      const messageQueue = await this.storage.load('messageQueue')
      if (messageQueue && Array.isArray(messageQueue)) {
        this.data.messageQueue = messageQueue
      }

      // Load profiles into memory cache (limited to recent ones)
      const profileKeys = await this.storage.list('profile:')
      const recentProfileKeys = profileKeys.slice(0, 100) // Limit to 100 most recent

      for (const key of recentProfileKeys) {
        const profileData = await this.storage.load(key)
        if (profileData && profileData.crdt) {
          const profileId = key.replace('profile:', '')
          this.data.profiles.set(profileId, profileData)
        }
      }

      console.log('Loaded offline data from storage')
    } catch (error) {
      console.error('Failed to load from storage:', error)
      // Re-throw the error so it can be caught by the test
      throw error
    }
  }

  private async saveSyncState(): Promise<void> {
    await this.storage.save('syncState', this.data.syncState)
  }

  private async savePendingChanges(): Promise<void> {
    await this.storage.save('pendingChanges', this.data.pendingChanges)
  }

  private async saveMessageQueue(): Promise<void> {
    await this.storage.save('messageQueue', this.data.messageQueue)
  }

  private startPeriodicSync(): void {
    // Attempt sync every 30 seconds when online (or 1 second in test environment)
    const interval = process.env.NODE_ENV === 'test' ? 1000 : 30000
    this.syncInterval = setInterval(() => {
      if (this.data.syncState.isOnline && !this.data.syncState.syncInProgress) {
        this.triggerSync().catch(error => {
          console.error('Periodic sync failed:', error)
        })
      }
    }, interval)
  }

  // Cleanup
  async destroy(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }

    this.syncCallbacks.clear()
    this.changeCallbacks.clear()

    console.log('OfflineDataManager destroyed')
  }

  // Utility Methods
  getStats(): {
    profilesStored: number
    pendingChanges: number
    queuedMessages: number
    isOnline: boolean
    lastSync: Date | null
  } {
    return {
      profilesStored: this.data.profiles.size,
      pendingChanges: this.data.pendingChanges.filter(c => !c.synced).length,
      queuedMessages: this.data.messageQueue.length,
      isOnline: this.data.syncState.isOnline,
      lastSync: this.data.syncState.lastFullSync
    }
  }

  async exportData(): Promise<any> {
    return {
      profiles: Array.from(this.data.profiles.entries()).map(([id, data]) => ({
        id,
        profile: data.crdt.toJSON(),
        lastSync: data.lastSync.toISOString()
      })),
      pendingChanges: this.data.pendingChanges,
      messageQueue: this.data.messageQueue,
      syncState: {
        ...this.data.syncState,
        lastFullSync: this.data.syncState.lastFullSync?.toISOString() || null
      }
    }
  }

  async importData(data: any): Promise<void> {
    try {
      // Import profiles
      if (data.profiles && Array.isArray(data.profiles)) {
        for (const profileData of data.profiles) {
          const profile = new ProfileCRDT(profileData.profile.id, profileData.profile.did)
          // Restore profile data
          profile.update(profileData.profile)
          
          await this.storeProfile(profile)
        }
      }

      // Import pending changes
      if (data.pendingChanges && Array.isArray(data.pendingChanges)) {
        this.data.pendingChanges = data.pendingChanges.map((change: any) => ({
          ...change,
          timestamp: new Date(change.timestamp),
          lastRetry: change.lastRetry ? new Date(change.lastRetry) : undefined
        }))
        await this.savePendingChanges()
      }

      // Import message queue
      if (data.messageQueue && Array.isArray(data.messageQueue)) {
        this.data.messageQueue = data.messageQueue.map((message: any) => ({
          ...message,
          timestamp: new Date(message.timestamp)
        }))
        await this.saveMessageQueue()
      }

      // Import sync state
      if (data.syncState) {
        this.data.syncState = {
          ...data.syncState,
          lastFullSync: data.syncState.lastFullSync ? new Date(data.syncState.lastFullSync) : null
        }
        await this.saveSyncState()
      }

      console.log('Data imported successfully')
    } catch (error) {
      console.error('Failed to import data:', error)
      throw error
    }
  }
}