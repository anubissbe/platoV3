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

  // NATIVE TOOL TESTS ONLY - Focused test selection
  testMatch: [
    "<rootDir>/src/tools/native/__tests__/**/*.test.ts",
    "<rootDir>/src/tools/native/__tests__/**/*.test.tsx",
  ],

  // No path ignore patterns - run all native tool tests
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/dist/"],

  collectCoverageFrom: [
    "src/tools/native/**/*.{ts,tsx}",
    "!src/tools/native/**/*.d.ts",
    "!src/tools/native/**/__tests__/**",
    "!src/tools/native/**/*.test.ts",
    "!src/tools/native/**/*.test.tsx",
  ],

  coverageDirectory: "coverage/tools",
  coverageReporters: ["text", "lcov", "html"],

  // Lower coverage thresholds for complex native tools
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 65,
      statements: 65,
    },
  },

  // SPECIALIZED SETUP FOR NATIVE TOOL TESTS
  setupFilesAfterEnv: ["<rootDir>/jest.setup.tools.ts"],

  // Longer timeouts for filesystem operations
  testTimeout: 30000,

  // Serial execution to avoid filesystem conflicts
  maxWorkers: 1,

  verbose: true, // Detailed output for debugging tool issues

  // Resource management for file operations
  detectOpenHandles: true,
  detectLeaks: false,
  forceExit: false, // Allow proper cleanup

  // Don't bail - run all tool tests
  bail: false,

  // Cache settings
  cache: true,
  cacheDirectory: "<rootDir>/node_modules/.cache/jest-tools",

  // Mock settings for native tools
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  resetModules: false,

  // Test result processing
  passWithNoTests: false,

  // Environment for native tool tests
  testEnvironmentOptions: {
    NODE_ENV: "test",
    PLATO_TEST_MODE: "true",
    PLATO_TOOLS_MODE: "true",
    TZ: "UTC",
  },

  // Error handling
  errorOnDeprecated: false,

  // Timing
  slowTestThreshold: 10, // Native tools can be slower

  // Use only built-in reporters
  reporters: ["default"],

  // Watch mode settings
  watchPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/coverage/",
    "<rootDir>/dist/",
  ],
};
