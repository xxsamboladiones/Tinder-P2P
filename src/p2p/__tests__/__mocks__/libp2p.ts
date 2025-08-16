export const createLibp2p = jest.fn().mockResolvedValue({
  start: jest.fn(),
  stop: jest.fn(),
  peerId: { toString: () => 'mock-peer-id' },
  getConnections: () => []
})

export const Libp2p = jest.fn()