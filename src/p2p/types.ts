// P2P Type Definitions

export interface NetworkStatus {
  connected: boolean
  peerCount: number
  dhtConnected: boolean
  latency: number
  bandwidth: { up: number; down: number }
}

export interface DiscoveryCriteria {
  geohash: string
  ageRange: [number, number]
  interests: string[]
  maxDistance: number
}

export interface PeerInfo {
  id: string
  multiaddrs: string[]
  protocols: string[]
  metadata: {
    geohash: string
    ageRange: [number, number]
    interests: string[]
    lastSeen: Date
  }
}

export interface Identity {
  did: string // did:key format
  publicKey: CryptoKey
  privateKey: CryptoKey
  keyPair: CryptoKeyPair
}

export interface EncryptedMessage {
  ciphertext: ArrayBuffer
  header: RatchetHeader
  timestamp: Date
}

export interface RatchetHeader {
  publicKey: ArrayBuffer
  previousChainLength: number
  messageNumber: number
}

// Double Ratchet specific types
export interface RatchetState {
  // Diffie-Hellman ratchet
  dhSend: { publicKey: Uint8Array; privateKey: Uint8Array } | null
  dhReceive: Uint8Array | null
  
  // Root chain
  rootKey: Uint8Array
  
  // Sending chain
  chainKeySend: Uint8Array | null
  messageNumberSend: number
  
  // Receiving chain
  chainKeyReceive: Uint8Array | null
  messageNumberReceive: number
  previousChainLength: number
  
  // Skipped message keys for out-of-order messages
  skippedMessageKeys: Map<string, Uint8Array>
  
  // Maximum number of skipped message keys to store
  maxSkippedKeys: number
}

export interface DoubleRatchetMessage {
  header: {
    publicKey: Uint8Array
    previousChainLength: number
    messageNumber: number
  }
  ciphertext: Uint8Array
}

export interface KeyExchangeBundle {
  identityKey: Uint8Array
  signedPreKey: Uint8Array
  signedPreKeySignature: Uint8Array
  oneTimePreKey?: Uint8Array
  timestamp: number
}

export interface PhotoReference {
  id: string
  hash: string
  url?: string // CDN fallback
  torrentMagnet?: string // P2P option
  ipfsCid?: string // IPFS option
  thumbnail: string
  metadata: PhotoMetadata
}

export interface PhotoMetadata {
  id: string
  originalName: string
  size: number
  dimensions: { width: number; height: number }
  format: string
  hash: string
  uploadedAt: Date
  uploadedBy: string // DID of uploader
  signature: string // Digital signature for verification
  exifData?: Record<string, any>
  isVerified: boolean
  verificationScore: number // 0-100 based on various checks
}

export interface PhotoUploadOptions extends MediaUploadOptions {
  stripExif: boolean
  maxDimensions: { width: number; height: number }
  compressionQuality: number
  watermark?: string
  requireVerification: boolean
}

export interface PhotoVerificationResult {
  isValid: boolean
  score: number // 0-100
  checks: {
    hashIntegrity: boolean
    signatureValid: boolean
    formatValid: boolean
    dimensionsValid: boolean
    sizeValid: boolean
    contentSafe: boolean
  }
  warnings: string[]
  errors: string[]
}

export interface PhotoSharingStats {
  totalPhotos: number
  verifiedPhotos: number
  unverifiedPhotos: number
  totalSize: number
  averageVerificationScore: number
  distributionMethods: {
    p2p: number
    ipfs: number
    cdn: number
  }
}

export interface GeohashLocation {
  geohash: string // 5 digits for ~2.4km precision
  timestamp: Date
}

export interface BloomFilter {
  bits: Uint8Array
  hashFunctions: number
  size: number
}

export interface PrivateMatch {
  // Bloom Filter for PSI
  likeFilter: BloomFilter
  salt: string
  timestamp: Date
  
  // Match Result (only revealed on mutual like)
  matchId?: string
  revealed: boolean
}

export enum MessageType {
  CHAT = 'chat',
  PROFILE_UPDATE = 'profile_update',
  LIKE = 'like',
  MATCH = 'match',
  SYSTEM = 'system'
}

export interface P2PMessage {
  type: MessageType
  from: string
  to: string
  timestamp: Date
  payload: EncryptedPayload
}

export interface EncryptedPayload {
  ciphertext: ArrayBuffer
  header: RatchetHeader
  mac: ArrayBuffer
}

export interface CRDTConflict {
  field: string
  localValue: any
  remoteValue: any
  localTimestamp: Date
  remoteTimestamp: Date
}

export interface P2PConfig {
  // Network Configuration
  bootstrapNodes: string[]
  stunServers: string[]
  turnServers: Array<{
    urls: string
    username?: string
    credential?: string
  }>
  
  // Discovery Configuration
  geohashPrecision: number
  maxPeers: number
  discoveryInterval: number
  
  // Security Configuration
  enableEncryption: boolean
  keyRotationInterval: number
  
  // Performance Configuration
  messageTimeout: number
  reconnectInterval: number
  maxRetries: number
}

// DHT Discovery interfaces
export interface DHTDiscoveryInterface {
  // DHT Operations
  join(topics: string[]): Promise<void>
  leave(topics: string[]): Promise<void>
  
  // Peer Discovery
  findPeers(topic: string): Promise<PeerInfo[]>
  announcePresence(topics: string[]): Promise<void>
  
  // Topic Management
  generateTopics(criteria: DiscoveryCriteria): string[]
  subscribeToTopic(topic: string, callback: (peer: PeerInfo) => void): void
  unsubscribeFromTopic(topic: string, callback: (peer: PeerInfo) => void): void
  
  // Utility
  getCachedPeers(topic: string): PeerInfo[]
  clearCache(): void
  getStats(): {
    announcedTopics: number
    cachedPeers: number
    activeSubscriptions: number
  }
  destroy(): void
}

// Media Storage Types
export interface MediaFile {
  id: string
  name: string
  size: number
  type: string
  hash: string
  url?: string // CDN fallback URL
  torrentMagnet?: string // WebTorrent magnet link
  ipfsCid?: string // IPFS Content ID
  thumbnail?: string // Base64 encoded thumbnail
  uploadedAt: Date
  expiresAt?: Date
}

export interface MediaUploadOptions {
  enableP2P: boolean
  enableIPFS: boolean
  enableCDN: boolean
  generateThumbnail: boolean
  compressionQuality?: number
  maxSize?: number
}

export interface MediaDownloadOptions {
  preferP2P: boolean
  timeout: number
  fallbackToCDN: boolean
}

export interface MediaStorageStats {
  totalFiles: number
  totalSize: number
  p2pFiles: number
  ipfsFiles: number
  cdnFiles: number
  activeDownloads: number
  activeUploads: number
}

// Media Privacy Types
export enum MediaAccessLevel {
  PUBLIC = 'public',           // Anyone can access
  MATCHES_ONLY = 'matches_only', // Only matched users
  PRIVATE = 'private',         // Only the owner
  SELECTIVE = 'selective'      // Custom access list
}

export enum MatchStatus {
  NO_INTERACTION = 'no_interaction',
  LIKED = 'liked',
  MATCHED = 'matched',
  BLOCKED = 'blocked'
}

export interface MediaAccessRule {
  mediaId: string
  accessLevel: MediaAccessLevel
  allowedUsers: string[] // DIDs of users with access
  expiresAt?: Date
  matchStatusRequired?: MatchStatus
  createdAt: Date
  updatedAt: Date
}

export interface MediaAccessRequest {
  mediaId: string
  requesterId: string // DID of requester
  timestamp: Date
  matchStatus: MatchStatus
}

export interface MediaAccessResponse {
  granted: boolean
  reason: string
  expiresAt?: Date
  accessToken?: string // Temporary access token
}

export interface MediaExpirationRule {
  mediaId: string
  expiresAt: Date
  autoDelete: boolean
  notifyBeforeExpiry: boolean
  notifyHours: number // Hours before expiry to notify
}

export interface MediaPrivacyStats {
  totalMediaFiles: number
  publicMedia: number
  matchOnlyMedia: number
  privateMedia: number
  selectiveMedia: number
  expiredMedia: number
  accessRequests: number
  grantedRequests: number
  deniedRequests: number
}

export interface MediaExpirationNotification {
  mediaId: string
  expiresAt: Date
  hoursRemaining: number
}

// Privacy Control Types
export enum PrivacyLevel {
  MINIMAL = 'minimal',
  BALANCED = 'balanced',
  OPEN = 'open',
  CUSTOM = 'custom'
}

export enum DataSharingScope {
  NONE = 'none',
  MATCHES_ONLY = 'matches_only',
  NEARBY_USERS = 'nearby_users',
  ALL_USERS = 'all_users'
}

export enum GeolocationPrecision {
  CITY = 3,
  DISTRICT = 4,
  NEIGHBORHOOD = 5,
  STREET = 6,
  BUILDING = 7
}