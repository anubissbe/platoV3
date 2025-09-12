/** @type {import('jest').Config} */
module.exports = {
  ...require('./jest.config.cjs'),
  
  // INTEGRATION TEST SPECIFIC SETTINGS
  displayName: 'Integration Tests',
  testTimeout: 30000, // Longer timeout for integration tests
  maxWorkers: 1, // Serial execution for integration tests
  
  // ONLY RUN INTEGRATION TESTS
  testMatch: [
    '<rootDir>/src/tools/native/__tests__/bash-tool.test.ts',
    '<rootDir>/src/__tests__/performance/**/*.test.ts',
    '<rootDir>/src/__tests__/cross-platform/**/*.test.ts',
    '<rootDir>/src/integrations/__tests__/**/*.test.ts',
  ],
  
  // REMOVE FAST OPTIMIZATIONS
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
  ],
  
  // FULL COVERAGE FOR INTEGRATION
  collectCoverage: true,
  coverageDirectory: 'coverage/integration',
  
  // USE FULL SETUP
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};