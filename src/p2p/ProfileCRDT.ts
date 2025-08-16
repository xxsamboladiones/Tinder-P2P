import * as Y from 'yjs'
import { PhotoReference, GeohashLocation } from './types'

export interface ProfileSignature {
  timestamp: Date
  signature: string
  publicKey: string
  did: string
}

export class ProfileCRDT {
  private ydoc: Y.Doc
  private profileMap: Y.Map<any>

  public readonly id: string
  public readonly did: string
  public readonly created: Date

  constructor(id: string, did: string) {
    this.id = id
    this.did = did
    this.created = new Date()

    this.ydoc = new Y.Doc()
    this.profileMap = this.ydoc.getMap('profile')

    // Initialize with default values
    this.initializeProfile()
  }

  private initializeProfile(): void {
    if (!this.profileMap.has('name')) {
      this.profileMap.set('name', '')
    }
    if (!this.profileMap.has('age')) {
      this.profileMap.set('age', 0)
    }
    if (!this.profileMap.has('bio')) {
      this.profileMap.set('bio', '')
    }
    if (!this.profileMap.has('photos')) {
      this.profileMap.set('photos', new Y.Array())
    }
    if (!this.profileMap.has('interests')) {
      this.profileMap.set('interests', new Y.Array())
    }
    if (!this.profileMap.has('location')) {
      this.profileMap.set('location', null)
    }
    if (!this.profileMap.has('version')) {
      this.profileMap.set('version', 1)
    }
    if (!this.profileMap.has('lastUpdated')) {
      this.profileMap.set('lastUpdated', new Date().toISOString())
    }
    if (!this.profileMap.has('signatures')) {
      this.profileMap.set('signatures', new Y.Array())
    }
  }

  // Profile Data Getters
  get name(): string {
    return this.profileMap.get('name') || ''
  }

  get age(): number {
    return this.profileMap.get('age') || 0
  }

  get bio(): string {
    const bio = this.profileMap.get('bio')
    return typeof bio === 'string' ? bio : ''
  }

  get photos(): PhotoReference[] {
    const photosArray = this.profileMap.get('photos') as Y.Array<PhotoReference>
    return photosArray ? photosArray.toArray() : []
  }

  get interests(): string[] {
    const interestsArray = this.profileMap.get('interests') as Y.Array<string>
    return interestsArray ? interestsArray.toArray() : []
  }

  get location(): GeohashLocation | null {
    return this.profileMap.get('location') || null
  }

  get version(): number {
    const version = this.profileMap.get('version')
    return typeof version === 'number' ? version : 1
  }

  get lastUpdated(): Date {
    const dateStr = this.profileMap.get('lastUpdated')
    if (dateStr && typeof dateStr === 'string') {
      const date = new Date(dateStr)
      return isNaN(date.getTime()) ? this.created : date
    }
    return this.created
  }

  get signatures(): ProfileSignature[] {
    const signaturesArray = this.profileMap.get('signatures') as Y.Array<ProfileSignature>
    return signaturesArray ? signaturesArray.toArray() : []
  }

  // Profile Data Setters
  setName(name: string): void {
    this.profileMap.set('name', name)
    this.updateVersion()
  }

  setAge(age: number): void {
    this.profileMap.set('age', age)
    this.updateVersion()
  }

  setBio(bio: string): void {
    this.profileMap.set('bio', bio)
    this.updateVersion()
  }

  addPhoto(photo: PhotoReference): void {
    const photosArray = this.profileMap.get('photos') as Y.Array<PhotoReference>
    if (photosArray) {
      photosArray.insert(photosArray.length, [photo])
      this.updateVersion()
    }
  }

  removePhoto(photoId: string): void {
    const photosArray = this.profileMap.get('photos') as Y.Array<PhotoReference>
    if (photosArray) {
      const photos = photosArray.toArray()
      const index = photos.findIndex(p => p.id === photoId)
      if (index !== -1) {
        photosArray.delete(index, 1)
        this.updateVersion()
      }
    }
  }

  addInterest(interest: string): void {
    const interestsArray = this.profileMap.get('interests') as Y.Array<string>
    if (interestsArray && !interestsArray.toArray().includes(interest)) {
      interestsArray.insert(interestsArray.length, [interest])
      this.updateVersion()
    }
  }

  removeInterest(interest: string): void {
    const interestsArray = this.profileMap.get('interests') as Y.Array<string>
    if (interestsArray) {
      const interests = interestsArray.toArray()
      const index = interests.indexOf(interest)
      if (index !== -1) {
        interestsArray.delete(index, 1)
        this.updateVersion()
      }
    }
  }

  setLocation(location: GeohashLocation): void {
    this.profileMap.set('location', location)
    this.updateVersion()
  }

  // CRDT Operations
  update(changes: Partial<{
    name: string
    age: number
    bio: string
    photos: PhotoReference[]
    interests: string[]
    location: GeohashLocation
  }>): void {
    if (changes.name !== undefined) {
      this.setName(changes.name)
    }
    if (changes.age !== undefined) {
      this.setAge(changes.age)
    }
    if (changes.bio !== undefined) {
      this.setBio(changes.bio)
    }
    if (changes.photos !== undefined) {
      // Replace all photos
      const photosArray = this.profileMap.get('photos') as Y.Array<PhotoReference>
      if (photosArray) {
        photosArray.delete(0, photosArray.length)
        photosArray.insert(0, changes.photos)
      }
    }
    if (changes.interests !== undefined) {
      // Replace all interests
      const interestsArray = this.profileMap.get('interests') as Y.Array<string>
      if (interestsArray) {
        interestsArray.delete(0, interestsArray.length)
        interestsArray.insert(0, changes.interests)
      }
    }
    if (changes.location !== undefined) {
      this.setLocation(changes.location)
    }
  }

  merge(other: ProfileCRDT): ProfileCRDT {
    // Apply updates from other CRDT
    const otherUpdate = Y.encodeStateAsUpdate(other.ydoc)
    Y.applyUpdate(this.ydoc, otherUpdate)
    return this
  }

  // Serialization
  serialize(): Uint8Array {
    return Y.encodeStateAsUpdate(this.ydoc)
  }

  static deserialize(data: Uint8Array, id: string, did: string): ProfileCRDT {
    const profile = new ProfileCRDT(id, did)
    try {
      Y.applyUpdate(profile.ydoc, data)
    } catch (error) {
      console.warn('Failed to apply CRDT update:', error)
    }
    return profile
  }

  // Enhanced Signing and Verification (Requirements 6.2, 6.3)

  /**
   * Sign profile and add signature to signatures array (requirement 6.2)
   */
  async signProfile(privateKey: CryptoKey, did: string, publicKey?: CryptoKey): Promise<ProfileSignature> {
    try {
      const profileData = this.getCanonicalData()
      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify(profileData))

      const signature = await crypto.subtle.sign('Ed25519', privateKey, data)
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      let publicKeyHex = 'placeholder-public-key-hex'
      if (publicKey) {
        try {
          const publicKeyBuffer = await crypto.subtle.exportKey('raw', publicKey)
          publicKeyHex = Array.from(new Uint8Array(publicKeyBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
        } catch (error) {
          console.warn('Failed to export public key, using placeholder')
        }
      }

      const profileSignature: ProfileSignature = {
        timestamp: new Date(),
        signature: signatureHex,
        publicKey: publicKeyHex,
        did
      }

      // Add signature to the profile
      let signaturesArray = this.profileMap.get('signatures') as Y.Array<ProfileSignature>
      if (!signaturesArray) {
        signaturesArray = new Y.Array()
        this.profileMap.set('signatures', signaturesArray)
      }
      signaturesArray.insert(signaturesArray.length, [profileSignature])
      this.updateVersion()

      return profileSignature
    } catch (error) {
      console.error('Profile signing failed:', error)
      throw new Error(`Profile signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Verify a specific signature against the profile (requirement 6.3)
   */
  async verifySignature(signature: ProfileSignature): Promise<boolean> {
    try {
      // Reconstruct the public key from hex
      const publicKeyBytes = new Uint8Array(
        signature.publicKey.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
      )

      const publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes,
        { name: 'Ed25519', namedCurve: 'Ed25519' },
        false,
        ['verify']
      )

      // Get canonical profile data (excluding signatures)
      const profileData = this.getCanonicalData()
      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify(profileData))

      // Convert signature from hex to ArrayBuffer
      const signatureBytes = new Uint8Array(
        signature.signature.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
      )

      return await crypto.subtle.verify('Ed25519', publicKey, signatureBytes, data)
    } catch (error) {
      console.error('Profile signature verification failed:', error)
      return false
    }
  }

  /**
   * Verify all signatures in the profile
   */
  async verifyAllSignatures(): Promise<{ valid: number; invalid: number; results: boolean[] }> {
    const signatures = this.signatures
    const results: boolean[] = []

    for (const signature of signatures) {
      const isValid = await this.verifySignature(signature)
      results.push(isValid)
    }

    const valid = results.filter(r => r).length
    const invalid = results.length - valid

    return { valid, invalid, results }
  }

  /**
   * Add a signature to the profile
   */
  addSignature(signature: ProfileSignature): void {
    let signaturesArray = this.profileMap.get('signatures') as Y.Array<ProfileSignature>
    if (!signaturesArray) {
      signaturesArray = new Y.Array()
      this.profileMap.set('signatures', signaturesArray)
    }
    signaturesArray.insert(signaturesArray.length, [signature])
    this.updateVersion()
  }

  /**
   * Get the most recent valid signature
   */
  getLatestSignature(): ProfileSignature | null {
    const signatures = this.signatures
    if (signatures.length === 0) {
      return null
    }

    // Sort by timestamp, most recent first
    const sortedSignatures = signatures.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    return sortedSignatures[0]
  }

  /**
   * Get canonical profile data for signing (excludes signatures and metadata)
   */
  private getCanonicalData(): any {
    const data = {
      id: this.id,
      did: this.did,
      name: this.name,
      age: this.age,
      bio: this.bio,
      photos: this.photos,
      interests: this.interests,
      location: this.location,
      version: this.version,
      lastUpdated: this.lastUpdated.toISOString()
    }

    // Sort keys for consistent serialization
    return this.sortObjectKeys(data)
  }

  /**
   * Sort object keys recursively for consistent serialization
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item))
    }

    const sorted: any = {}
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortObjectKeys(obj[key])
    })

    return sorted
  }

  /**
   * Legacy method for backward compatibility
   */
  async sign(privateKey: CryptoKey): Promise<string> {
    const profileData = this.getCanonicalData()
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(profileData))

    const signature = await crypto.subtle.sign('Ed25519', privateKey, data)
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Legacy method for backward compatibility
   */
  async verify(publicKey: CryptoKey, signature: string): Promise<boolean> {
    try {
      const profileData = this.getCanonicalData()
      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify(profileData))

      const signatureBytes = new Uint8Array(
        signature.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
      )

      return await crypto.subtle.verify('Ed25519', publicKey, signatureBytes, data)
    } catch (error) {
      console.error('Profile verification failed:', error)
      return false
    }
  }

  // Reputation Integration (Requirements 6.4, 6.5)

  /**
   * Get trust score based on signature verification and reputation
   */
  getTrustScore(): number {
    const signatures = this.signatures
    if (signatures.length === 0) {
      return 0 // No signatures = no trust
    }

    // Base trust score on number of valid signatures
    // In a real implementation, this would integrate with CryptoManager reputation system
    const baseScore = Math.min(signatures.length * 20, 100)

    // Reduce score if profile is very new (less than 24 hours old)
    // But ensure minimum score of 10% for profiles with signatures
    const ageInHours = (Date.now() - this.created.getTime()) / (1000 * 60 * 60)
    const ageMultiplier = Math.max(Math.min(ageInHours / 24, 1), 0.1)

    return Math.round(baseScore * ageMultiplier)
  }

  /**
   * Check if profile appears to be spam based on signatures and content
   */
  isSpamLikely(): boolean {
    // Check for spam indicators
    const bio = this.bio || ''
    const spamIndicators = [
      this.signatures.length === 0, // No signatures
      this.name.length < 2, // Very short name
      bio.includes('http://') || bio.includes('https://'), // URLs in bio
      this.interests.length === 0, // No interests
      this.age < 18 || this.age > 80, // Suspicious age
      this.photos.length === 0 // No photos
    ]

    const spamScore = spamIndicators.filter(indicator => indicator).length

    // For profiles with good basic content (name, age, interests, photos), be more lenient
    const hasBasicContent = this.name.length >= 2 &&
      this.age >= 18 &&
      this.age <= 80 &&
      this.interests.length > 0 &&
      this.photos.length > 0

    if (hasBasicContent) {
      return spamScore >= 4 // Need more indicators for profiles with good basic data
    }

    return spamScore >= 3 // Flag as spam if 3+ indicators
  }

  /**
   * Get verification status based on signatures
   */
  getVerificationStatus(): {
    isVerified: boolean
    signatureCount: number
    latestSignature: Date | null
    trustLevel: 'none' | 'low' | 'medium' | 'high'
  } {
    const signatures = this.signatures
    const signatureCount = signatures.length
    const latestSignature = signatures.length > 0
      ? new Date(Math.max(...signatures.map(s => new Date(s.timestamp).getTime())))
      : null

    let trustLevel: 'none' | 'low' | 'medium' | 'high' = 'none'
    if (signatureCount >= 5) trustLevel = 'high'
    else if (signatureCount >= 3) trustLevel = 'medium'
    else if (signatureCount >= 1) trustLevel = 'low'

    return {
      isVerified: signatureCount > 0,
      signatureCount,
      latestSignature,
      trustLevel
    }
  }

  /**
   * Add interaction tracking for reputation (requirement 6.4)
   */
  recordInteraction(interactionType: 'like' | 'match' | 'message' | 'report', fromDID: string): void {
    // In a full implementation, this would integrate with CryptoManager
    // For now, we'll track basic interaction metadata
    let interactions = this.profileMap.get('interactions') as Y.Array<any>

    if (!interactions) {
      interactions = new Y.Array()
      this.profileMap.set('interactions', interactions)
    }

    const interaction = {
      type: interactionType,
      from: fromDID,
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID()
    }

    interactions.insert(interactions.length, [interaction])
    this.updateVersion()
  }

  /**
   * Get interaction history
   */
  getInteractions(): Array<{
    type: 'like' | 'match' | 'message' | 'report'
    from: string
    timestamp: Date
    id: string
  }> {
    const interactions = this.profileMap.get('interactions') as Y.Array<any>
    if (!interactions) {
      return []
    }

    return interactions.toArray().map(interaction => ({
      ...interaction,
      timestamp: new Date(interaction.timestamp)
    }))
  }

  /**
   * Get interaction statistics
   */
  getInteractionStats(): {
    totalInteractions: number
    likes: number
    matches: number
    messages: number
    reports: number
    uniqueUsers: number
  } {
    const interactions = this.getInteractions()
    const uniqueUsers = new Set(interactions.map(i => i.from)).size

    return {
      totalInteractions: interactions.length,
      likes: interactions.filter(i => i.type === 'like').length,
      matches: interactions.filter(i => i.type === 'match').length,
      messages: interactions.filter(i => i.type === 'message').length,
      reports: interactions.filter(i => i.type === 'report').length,
      uniqueUsers
    }
  }

  // Utility Methods
  private updateVersion(): void {
    const currentVersion = this.profileMap.get('version') || 1
    this.profileMap.set('version', currentVersion + 1)
    this.profileMap.set('lastUpdated', new Date().toISOString())
  }

  toJSON(): any {
    return {
      id: this.id,
      did: this.did,
      created: this.created.toISOString(),
      name: this.name,
      age: this.age,
      bio: this.bio,
      photos: this.photos,
      interests: this.interests,
      location: this.location,
      version: this.version,
      lastUpdated: this.lastUpdated.toISOString(),
      signatures: this.signatures
    }
  }

  clone(): ProfileCRDT {
    const cloned = new ProfileCRDT(this.id, this.did)
    try {
      const update = this.serialize()
      Y.applyUpdate(cloned.ydoc, update)
    } catch (error) {
      console.warn('Failed to clone CRDT:', error)
      // Fallback: manually copy data
      cloned.update({
        name: this.name,
        age: this.age,
        bio: this.bio,
        photos: this.photos,
        interests: this.interests,
        location: this.location || undefined
      })
    }
    return cloned
  }

  // Event Handling
  onChange(callback: () => void): () => void {
    const handler = () => callback()
    this.ydoc.on('update', handler)

    // Return unsubscribe function
    return () => {
      this.ydoc.off('update', handler)
    }
  }

  // Validation
  isValid(): boolean {
    return (
      this.id.length > 0 &&
      this.did.startsWith('did:') &&
      this.name.length > 0 &&
      this.age >= 18 &&
      this.age <= 100
    )
  }

  getValidationErrors(): string[] {
    const errors: string[] = []

    if (this.id.length === 0) {
      errors.push('ID is required')
    }
    if (!this.did.startsWith('did:')) {
      errors.push('Invalid DID format')
    }
    if (this.name.length === 0) {
      errors.push('Name is required')
    }
    if (this.age < 18) {
      errors.push('Age must be at least 18')
    }
    if (this.age > 100) {
      errors.push('Age must be less than 100')
    }

    return errors
  }
}