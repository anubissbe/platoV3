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
  
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.test.tsx',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
  ],
  
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
    '!src/cli.ts',
  ],
  
  coverageDirectory: 'coverage/reliable',
  coverageReporters: ['text', 'lcov', 'html'],
  
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // RELIABILITY IMPROVEMENTS
  setupFilesAfterEnv: ['<rootDir>/jest.setup.reliable.ts'],
  
  // Test execution settings for reliability
  testTimeout: 15000, // Reduced from 30s, but higher than fast config
  maxWorkers: 1, // Serial execution for reliability tests
  verbose: false, // Reduce noise
  
  // Enhanced error detection
  detectOpenHandles: true, // Detect resource leaks
  detectLeaks: false, // Disabled for performance (enable for debugging)
  forceExit: false, // Allow proper cleanup
  
  // Retry configuration for flaky tests
  bail: false, // Continue running tests even if some fail
  
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
    TZ: 'UTC', // Consistent timezone
  },
  
  // Global setup/teardown
  globalSetup: undefined, // Use setupFilesAfterEnv instead
  globalTeardown: undefined,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Test selection - exclude known problematic patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    // Include slow tests but with enhanced reliability
  ],
  
  // Watch mode settings
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/',
  ],
  
  // Timing and performance
  slowTestThreshold: 5, // Mark tests slower than 5s as slow
  
  // Test result configuration
  testResultsProcessor: undefined, // Could add custom processor for retry logic
  
  // Custom reporter for reliability metrics (jest-junit not installed)
  reporters: ['default'],
};