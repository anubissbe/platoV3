/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^ink$": "<rootDir>/src/__tests__/__mocks__/ink.ts",
    "^react$": "<rootDir>/node_modules/react/index.js",
    "^react-dom$": "<rootDir>/node_modules/react-dom/index.js",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(ink|ink-testing-library|@ink-ui|react|react-dom)/)",
  ],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: false,
        tsconfig: {
          module: "commonjs",
          target: "es2022",
          lib: ["es2022"],
          moduleResolution: "node",
          allowImportingTsExtensions: false,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          jsx: "react-jsx",
        },
      },
    ],
  },
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.test.ts",
    "<rootDir>/src/**/__tests__/**/*.test.tsx",
    "<rootDir>/src/**/*.test.ts",
    "<rootDir>/src/**/*.test.tsx",
  ],
  // PERFORMANCE OPTIMIZATIONS
  maxWorkers: "50%", // Use half available CPU cores
  testTimeout: 15000, // Reduce from default 30s to 15s
  verbose: false, // Reduce output verbosity
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true, // Additional cleanup

  // FASTER COVERAGE SETTINGS
  collectCoverage: false, // Disable coverage for fast runs

  // OPTIMIZED SETUP
  setupFilesAfterEnv: ["<rootDir>/jest.setup.fast.ts"],

  // TEST EXECUTION OPTIMIZATIONS
  bail: false, // Continue running tests even if some fail
  cache: true, // Enable Jest cache
  cacheDirectory: "<rootDir>/node_modules/.cache/jest",

  // EXCLUDE SLOW TESTS BY DEFAULT
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/src/tools/native/__tests__/bash-tool.test.ts", // Very slow - use separate run
    "<rootDir>/src/__tests__/performance/", // Performance tests - separate
    "<rootDir>/src/__tests__/cross-platform/", // Cross-platform tests - separate
  ],

  // DETECTION SETTINGS
  detectOpenHandles: false, // Faster startup
  detectLeaks: false, // Faster execution
  forceExit: true, // Force exit to prevent hanging
};
