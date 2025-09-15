/** @type {import('jest').Config} */
module.exports = {
  // Extend base Jest configuration
  preset: "ts-jest",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts", ".tsx"],

  // Module mapping for proper imports
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^ink$": "<rootDir>/src/__tests__/__mocks__/ink.ts",
    "^react$": "<rootDir>/node_modules/react/index.js",
    "^react-dom$": "<rootDir>/node_modules/react-dom/index.js",
  },

  // Transform patterns for TypeScript/React
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

  // Test patterns
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.test.ts",
    "<rootDir>/src/**/__tests__/**/*.test.tsx",
    "<rootDir>/src/**/*.test.ts",
    "<rootDir>/src/**/*.test.tsx",
  ],

  // Enhanced comprehensive coverage collection
  collectCoverage: true,
  collectCoverageFrom: [
    // Include all source TypeScript files
    "src/**/*.{ts,tsx}",

    // Include specific directories that should be measured
    "src/providers/**/*.{ts,tsx}",
    "src/tools/**/*.{ts,tsx}",
    "src/runtime/**/*.{ts,tsx}",
    "src/tui/**/*.{ts,tsx}",
    "src/commands/**/*.{ts,tsx}",
    "src/integrations/**/*.{ts,tsx}",
    "src/slash/**/*.{ts,tsx}",
    "src/memory/**/*.{ts,tsx}",
    "src/context/**/*.{ts,tsx}",
    "src/permissions/**/*.{ts,tsx}",
    "src/config/**/*.{ts,tsx}",
    "src/services/**/*.{ts,tsx}",

    // Exclude patterns - refined for comprehensive coverage

    // Test files and mocks
    "!src/**/*.d.ts", // Type definition files
    "!src/**/__tests__/**", // Test directories
    "!src/**/__mocks__/**", // Mock directories
    "!src/**/*.test.ts", // Individual test files
    "!src/**/*.test.tsx", // React test files
    "!src/**/*.spec.ts", // Spec files
    "!src/**/*.spec.tsx", // React spec files

    // Configuration and constants
    "!src/**/types.ts", // Pure type definition files
    "!src/**/interfaces.ts", // Interface definition files
    "!src/**/*.types.ts", // Type definition files
    "!src/**/*.interface.ts", // Interface files
    "!src/**/constants.ts", // Constant definition files
    "!src/**/*.constants.ts", // Constant files
    "!src/**/config.ts", // Configuration files
    "!src/**/*.config.ts", // Configuration files

    // Entry points and index files
    "!src/cli.ts", // CLI entry point (not easily testable)
    "!src/main.ts", // Main entry point
    "!src/app.ts", // App entry point
    "!src/**/index.ts", // Simple re-export index files
    "!src/**/index.tsx", // Simple re-export index files

    // Generated and vendor code
    "!src/**/generated/**", // Generated code directories
    "!src/**/*.generated.ts", // Generated files
    "!src/**/*.generated.tsx", // Generated React files
    "!src/**/vendor/**", // Vendor code
    "!src/**/third-party/**", // Third-party code
    "!src/**/external/**", // External dependencies

    // Documentation and examples
    "!src/**/docs/**", // Documentation directories
    "!src/**/examples/**", // Example directories
    "!src/**/*.example.ts", // Example files
    "!src/**/*.example.tsx", // React example files
    "!src/**/*.stories.ts", // Storybook stories
    "!src/**/*.stories.tsx", // React Storybook stories
  ],

  // Coverage output configuration
  coverageDirectory: "coverage",
  coverageReporters: [
    "text", // Console output
    "text-summary", // Brief console summary
    "lcov", // For CI/CD and external tools
    "html", // Detailed HTML report
    "json", // Machine-readable JSON
    "json-summary", // Summary JSON for badges
    "cobertura", // XML format for some CI systems
    "clover", // Alternative XML format
  ],

  // Enhanced coverage thresholds with per-directory granularity
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // Higher standards for critical components
    "src/providers/": {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    "src/tools/": {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    "src/runtime/": {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    // Relaxed standards for UI components (harder to test comprehensively)
    "src/tui/": {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    // Moderate standards for configuration and services
    "src/config/": {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
    "src/services/": {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Test environment setup
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts", "jest-extended/all"],

  // Performance and reliability settings
  testTimeout: 15000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  // Enhanced coverage-specific settings
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/__tests__/",
    "/__mocks__/",
    "/coverage/",
    "/dist/",
    ".d.ts$",
  ],

  // Ensure coverage for all files, even those not directly tested
  forceCoverageMatch: [
    "**/src/tools/*.ts",
    "**/src/providers/*.ts",
    "**/src/runtime/*.ts",
  ],

  // Additional Jest settings for comprehensive testing
  bail: false, // Run all tests even if some fail
  collectCoverageOnlyFrom: undefined, // Collect from all matched files
  maxWorkers: "50%", // Optimize for coverage collection
  passWithNoTests: false, // Fail if no tests found
};
