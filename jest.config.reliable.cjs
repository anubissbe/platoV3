/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  
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
  
  // CATEGORIZED TEST SELECTION - Only stable, well-isolated tests
  testMatch: [
    // Unit tests - fast and isolated
    '<rootDir>/src/**/__tests__/unit/**/*.test.ts',
    '<rootDir>/src/**/__tests__/unit/**/*.test.tsx',
    
    // Component tests - UI focused
    '<rootDir>/src/tui/components/__tests__/**/*.test.tsx',
    '<rootDir>/src/permissions/__tests__/**/*.test.tsx',
    
    // Service tests - business logic
    '<rootDir>/src/services/__tests__/**/*.test.ts',
    '<rootDir>/src/commands/__tests__/**/*.test.ts',
    '<rootDir>/src/context/__tests__/**/*.test.ts',
    '<rootDir>/src/runtime/__tests__/**/*.test.ts',
  ],
  
  // EXCLUDE PROBLEMATIC TESTS that need special handling
  testPathIgnorePatterns: [
    'node_modules',
    'dist',
    'src/tools/native/__tests__',
    'src/__tests__/integration',
    'src/__tests__/performance',
    'src/__tests__/cross-platform',
    'src/__tests__/visual-regression',
    'src/__tests__/ci',
    'src/__tests__/cli.test.ts',
    'src/__tests__/mouse-event-handler.test.ts',
  ],
  
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
    '!src/cli.ts',
    
    // Exclude problematic modules from coverage
    '!src/tools/native/**',
    '!src/__tests__/**',
  ],
  
  coverageDirectory: 'coverage/reliable',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // RELAXED COVERAGE THRESHOLDS for reliability
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 65, 
      lines: 70,
      statements: 70,
    },
  },
  
  // RELIABILITY IMPROVEMENTS - Use existing setup file
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  
  // Test execution settings for reliability
  testTimeout: 15000, // Increased timeout for reliability
  maxWorkers: 1, // Serial execution for reliability tests
  verbose: false, // Reduce noise
  
  // Enhanced error detection
  detectOpenHandles: true, // Detect resource leaks
  detectLeaks: false, // Disabled for performance
  forceExit: false, // Allow proper cleanup
  
  // Retry configuration for flaky tests
  bail: 1, // Stop on first failure for debugging
  
  // Cache settings
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-reliable',
  
  // Mock settings for reliability
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  resetModules: false, // Keep module cache for performance
  
  // Test result processing
  passWithNoTests: false, // Fail if no tests found
  
  // Advanced options for reliability
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    PLATO_TEST_MODE: 'true',
    PLATO_RELIABILITY_MODE: 'true',
    TZ: 'UTC', // Consistent timezone
  },
  
  // Global setup/teardown
  globalSetup: undefined, // Use setupFilesAfterEnv instead
  globalTeardown: undefined,
  
  // Error handling
  errorOnDeprecated: false, // Don't fail on deprecation warnings
  
  // Timing and performance
  slowTestThreshold: 5, // Mark tests slower than 5s as slow
  
  // Test result configuration
  testResultsProcessor: undefined,
  
  // Use only built-in reporters
  reporters: ['default'],
  
  // Watch mode settings
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/',
  ],
};