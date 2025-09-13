/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  
  // PERFORMANCE AND RELIABILITY TESTING CONFIGURATION
  displayName: 'Performance & Reliability Tests',
  
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
  
  // PERFORMANCE-SPECIFIC OPTIMIZATIONS
  maxWorkers: '50%', // Conservative for performance testing
  testTimeout: 30000, // Extended timeout for load tests
  verbose: true, // Show detailed test results
  silent: false,
  
  // PARALLEL EXECUTION SETTINGS
  bail: 0, // Run all tests for comprehensive results
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-performance-complete',
  
  // PERFORMANCE AND RELIABILITY TEST PATTERNS
  testMatch: [
    '<rootDir>/src/__tests__/performance.test.ts',
    '<rootDir>/src/__tests__/performance/**/*.test.ts',
    '<rootDir>/src/__tests__/performance/**/*.test.tsx',
    '<rootDir>/src/context/__tests__/performance.test.ts',
    '<rootDir>/src/tui/components/__tests__/*.performance.test.tsx',
  ],
  
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    // Only run performance tests - exclude other slow tests
    '<rootDir>/src/tools/native/__tests__/',
    '<rootDir>/src/__tests__/integration/',
    '<rootDir>/src/__tests__/cross-platform/',
    '<rootDir>/src/__tests__/cli.test.ts',
  ],
  
  // ENHANCED SETUP FOR PERFORMANCE TESTING
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.performance.ts'
  ],
  
  // RESOURCE MANAGEMENT
  detectOpenHandles: true, // Enable for reliability testing
  detectLeaks: true, // Enable memory leak detection
  forceExit: false, // Allow proper cleanup
  
  // COVERAGE SETTINGS - DISABLED FOR PERFORMANCE
  collectCoverage: false,
  
  // MOCK SETTINGS
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  resetModules: false,
  
  // ERROR HANDLING
  errorOnDeprecated: false,
  
  // PERFORMANCE TEST TIMING
  slowTestThreshold: 5, // Mark tests slower than 5s as slow
  
  // REPORTERS
  reporters: [
    'default',
    [
      '<rootDir>/jest-performance-reporter.cjs',
      {
        outputFile: 'performance-test-results.json',
        includeConsoleOutput: true
      }
    ]
  ],
  
  // WATCH MODE SETTINGS
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/',
    '<rootDir>/performance-results*.json',
    '<rootDir>/performance-baselines/',
    '<rootDir>/performance-reports/',
  ],
  
  // ENVIRONMENT VARIABLES
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    PLATO_PERFORMANCE_MODE: 'true',
    PLATO_RELIABILITY_TESTING: 'true',
    PLATO_MEMORY_LEAK_DETECTION: 'true',
    TZ: 'UTC',
  },
  
  // GLOBAL SETUP AND TEARDOWN
  globalSetup: '<rootDir>/jest.global-setup.performance.js',
  globalTeardown: '<rootDir>/jest.global-teardown.performance.js',
  
  // SNAPSHOT SETTINGS
  updateSnapshot: false,
  
  // MODULE DIRECTORIES
  moduleDirectories: ['node_modules', 'src'],
  
  // FILE EXTENSIONS
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // PERFORMANCE TEST SPECIFIC SETTINGS
  maxConcurrency: 3, // Limit concurrency for reliable performance measurements
  
  // CUSTOM RESOLVER FOR PERFORMANCE TESTS
  resolver: '<rootDir>/jest.resolver.performance.cjs',
};