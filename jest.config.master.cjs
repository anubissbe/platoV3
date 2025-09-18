/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts", ".tsx"],

  // MASTER CONFIGURATION - Organized test execution
  projects: [
    // Fast unit tests - run these first
    {
      displayName: "unit",
      ...require("./jest.config.reliable.cjs"),
      testMatch: [
        "<rootDir>/src/**/__tests__/unit/**/*.test.ts",
        "<rootDir>/src/**/__tests__/unit/**/*.test.tsx",
        "<rootDir>/src/services/__tests__/**/*.test.ts",
        "<rootDir>/src/commands/__tests__/**/*.test.ts",
        "<rootDir>/src/context/__tests__/**/*.test.ts",
        "<rootDir>/src/runtime/__tests__/**/*.test.ts",
      ],
      coverageDirectory: "coverage/unit",
    },

    // UI component tests
    {
      displayName: "components",
      ...require("./jest.config.reliable.cjs"),
      testMatch: [
        "<rootDir>/src/tui/components/__tests__/**/*.test.tsx",
        "<rootDir>/src/permissions/__tests__/**/*.test.tsx",
        "<rootDir>/src/tui/__tests__/**/*.test.tsx",
      ],
      coverageDirectory: "coverage/components",
    },

    // Native tool tests - run separately with specialized setup
    {
      displayName: "tools",
      ...require("./jest.config.tools.cjs"),
    },

    // Integration tests - run after unit tests pass
    {
      displayName: "integration",
      ...require("./jest.config.integration.cjs"),
    },
  ],

  // Global coverage collection
  collectCoverage: true,
  coverageDirectory: "coverage/master",
  coverageReporters: ["text-summary", "html", "lcov", "json-summary"],

  // Overall coverage thresholds (aggregated)
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 70,
      lines: 75,
      statements: 75,
    },
  },

  // Master test settings
  maxWorkers: "50%",
  bail: false, // Don't bail - we want to see all project results
  verbose: false, // Reduce noise in master run

  // Results processing
  reporters: [
    "default",
    [
      "jest-html-reporter",
      {
        outputPath: "./coverage/master/test-report.html",
        pageTitle: "PlatoV3 Test Results",
        includeFailureMsg: true,
        includeSuiteFailure: true,
      },
    ],
    [
      "jest-json-reporter",
      {
        outputFile: "./coverage/master/test-results.json",
      },
    ],
  ],
};
