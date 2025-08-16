module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverageFrom: [
    'src/p2p/**/*.ts',
    'src/components/**/*.tsx',
    '!src/p2p/**/*.test.ts',
    '!src/components/**/*.test.tsx',
    '!src/p2p/index.ts',
    '!src/p2p/__tests__/**',
    '!src/components/__tests__/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/p2p/__tests__/setup.ts', '<rootDir>/src/components/__tests__/setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
}