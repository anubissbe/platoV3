/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  
  // PERFORMANCE-OPTIMIZED CONFIGURATION
  // Target: <10 second total execution time
  
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^ink$': '<rootDir>/src/__tests__/__mocks__/ink.ts',
    '^react$': '<rootDir>/node_modules/react/index.js',
    '^react-dom$': '<rootDir>/node_modules/react-dom/index.js',
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
  
  // PERFORMANCE OPTIMIZATIONS
  maxWorkers: '75%', // Use 75% of available CPU cores
  testTimeout: 10000, // Reduced from 15s to 10s for faster failure detection
  verbose: false, // Reduce output verbosity for speed
  silent: false, // Keep error reporting
  
  // PARALLEL EXECUTION OPTIMIZATIONS
  bail: 0, // Run all tests in parallel, don't bail on first failure
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-performance',
  
  // FAST TEST SELECTION - Exclude slow tests by default
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.test.tsx', 
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
  ],
  
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    // EXCLUDE SLOW TESTS - Run these separately
    '<rootDir>/src/tools/native/__tests__/bash-tool.test.ts',               // 46.67s - very slow
    '<rootDir>/src/tools/native/__tests__/tool-executor.test.ts',           // 14.28s - slow  
    '<rootDir>/src/__tests__/cli.test.ts',                                  // 12.12s - slow
    '<rootDir>/src/__tests__/performance/',                                 // Performance tests
    '<rootDir>/src/__tests__/cross-platform/',                            // Platform-specific tests
    '<rootDir>/src/__tests__/integration/e2e-workflows.test.ts',           // E2E tests
    '<rootDir>/src/__tests__/integration/permissions-real-config*.test.ts', // Config integration tests
  ],
  
  // OPTIMIZED SETUP
  setupFilesAfterEnv: ['<rootDir>/jest.setup.performance.ts'],
  
  // RESOURCE MANAGEMENT
  detectOpenHandles: false, // Faster startup - disable for performance runs
  detectLeaks: false, // Disable memory leak detection for speed
  forceExit: true, // Force exit to prevent hanging processes
  
  // COVERAGE SETTINGS - Disabled for performance
  collectCoverage: false,
  
  // MOCK SETTINGS
  clearMocks: true,
  restoreMocks: true, 
  resetMocks: true,
  resetModules: false, // Keep module cache for performance
  
  // ERROR HANDLING
  errorOnDeprecated: false, // Disable for performance
  
  // TIMING CONFIGURATION
  slowTestThreshold: 1, // Mark tests slower than 1s as slow
  
  // REPORTERS - Minimal for performance (removed jest-junit)
  reporters: ['default'],
  
  // WATCH MODE OPTIMIZATIONS
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/',
    '<rootDir>/performance-results*.json',
  ],
  
  // GLOBAL TIMEOUT
  testTimeout: 8000, // Aggressive 8s timeout for performance tests
  
  // ENVIRONMENT VARIABLES FOR PERFORMANCE MODE
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    PLATO_PERFORMANCE_MODE: 'true',
    PLATO_SKIP_SLOW_TESTS: 'true',
    TZ: 'UTC',
  },
};