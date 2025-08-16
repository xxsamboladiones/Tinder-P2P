// Test setup file

// Polyfill for Node.js environment
// @ts-ignore
global.TextEncoder = require('util').TextEncoder
// @ts-ignore
global.TextDecoder = require('util').TextDecoder

// Mock crypto.subtle for testing
const mockCrypto = {
  subtle: {
    generateKey: jest.fn(),
    exportKey: jest.fn(),
    importKey: jest.fn(),
    sign: jest.fn(),
    verify: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn()
  },
  getRandomValues: jest.fn((arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
    return arr
  }),
  randomUUID: jest.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9))
}

// @ts-ignore
global.crypto = mockCrypto

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
}

// @ts-ignore
global.localStorage = localStorageMock

// Mock RTCPeerConnection
// @ts-ignore
global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
  createDataChannel: jest.fn(),
  addIceCandidate: jest.fn(),
  close: jest.fn(),
  connectionState: 'new',
  onicecandidate: null,
  onconnectionstatechange: null,
  ondatachannel: null
}))

// @ts-ignore
global.RTCPeerConnection.generateCertificate = jest.fn()

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}

// Mocks are now in separate files and configured in jest.config.js

// Ensure Y.js is not mocked
jest.unmock('yjs')