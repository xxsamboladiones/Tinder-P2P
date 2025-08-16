const mockArray = {
  toArray: jest.fn(() => []),
  push: jest.fn(),
  delete: jest.fn(),
  insert: jest.fn(),
  length: 0
}

const mockMap = {
  has: jest.fn(() => false),
  get: jest.fn(() => mockArray),
  set: jest.fn()
}

const mockDoc = {
  getMap: jest.fn(() => mockMap),
  on: jest.fn(),
  off: jest.fn()
}

export const Doc = jest.fn(() => mockDoc)
export const Array = jest.fn(() => mockArray)
export const Map = jest.fn(() => mockMap)
export const encodeStateAsUpdate = jest.fn(() => new Uint8Array())
export const applyUpdate = jest.fn()