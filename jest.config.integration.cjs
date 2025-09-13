/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  transformIgnorePatterns: [
    'node_modules/(?!(ink|ink-testing-library|@ink-ui|react|react-dom)/)',
  ],
  
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          module: 'commonjs',
          target: 'es2022',
          lib: ['es2022'],
          moduleResolution: 'node',
          allowImportingTsExtensions: false,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  
  // Only run integration tests
  testMatch: [
    '<rootDir>/src/__tests__/integration/**/*.test.ts',
    '<rootDir>/src/__tests__/integration/**/*.test.tsx',
  ],
  
  // Don't ignore anything for integration tests
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
  ],
  
  // TEST SETUP
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  
  // EXECUTION SETTINGS
  testTimeout: 30000, // Integration tests need more time
  maxWorkers: 1, // Run integration tests sequentially
  verbose: true,
  
  // RELIABILITY SETTINGS
  detectOpenHandles: true,
  detectLeaks: false,
  forceExit: true, // Force exit for integration tests
  
  bail: false,
  
  // CACHE SETTINGS
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-integration',
  
  // MOCK SETTINGS
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  resetModules: true,
  
  // TEST RESULT PROCESSING
  passWithNoTests: false,
  
  // ENVIRONMENT
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    PLATO_TEST_MODE: 'integration',
    TZ: 'UTC',
  },
  
  // ERROR HANDLING
  errorOnDeprecated: false,
  
  // TIMING
  slowTestThreshold: 10,
  
  // REPORTING
  reporters: ['default'],
  
  // Coverage for integration tests
  collectCoverage: false, // Disable coverage for integration tests
};