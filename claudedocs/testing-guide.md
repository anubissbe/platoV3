# Plato Testing Guide

## Overview

This comprehensive guide covers all testing patterns, strategies, and methodologies implemented across the Plato project. It serves as both documentation of existing test implementations and a reference for future test development.

## Table of Contents

1. [Testing Architecture](#testing-architecture)
2. [Test Categories](#test-categories)
3. [Jest Configuration Strategy](#jest-configuration-strategy)
4. [Mock Patterns](#mock-patterns)
5. [Test Implementation Patterns](#test-implementation-patterns)
6. [TUI Component Testing](#tui-component-testing)
7. [Integration Testing](#integration-testing)
8. [Performance Testing](#performance-testing)
9. [Quality Assurance](#quality-assurance)
10. [Best Practices](#best-practices)

## Testing Architecture

### Directory Structure

The Plato project uses a structured approach to test organization:

```
src/
├── __tests__/                           # Root level system tests
│   ├── helpers/                         # Test utilities and setup
│   │   └── test-cleanup.js              # Environment cleanup utilities
│   ├── keyboard.test.ts                 # Core keyboard functionality
│   ├── memory.test.ts                   # Memory system tests
│   ├── setup.test.ts                    # Configuration and setup tests
│   ├── slash-commands.test.ts           # Slash command system tests
│   ├── output-styles.test.ts            # Output formatting tests
│   ├── configuration-management.test.ts # Configuration system tests
│   ├── custom-commands.test.ts          # User-defined commands tests
│   └── mouse-*.test.ts                  # Mouse interaction tests (4 files)
├── tui/
│   ├── __tests__/                       # TUI-specific component tests
│   │   └── keyboard-handler.test.ts     # Keyboard handler logic tests (29 tests)
│   └── components/
│       └── __tests__/                   # Individual component tests
├── tools/
│   └── __tests__/                       # Tool-specific tests
│       └── patch.test.ts                # Patch system tests
├── providers/
│   └── __tests__/                       # Provider integration tests
├── [module]/
│   └── __tests__/                       # Module-specific tests
└── __tests__/
    ├── unit/                            # Isolated unit tests
    ├── integration/                     # Cross-system integration tests
    ├── performance/                     # Performance and benchmark tests
    └── visual-regression/               # UI consistency tests
```

### Test File Naming Conventions

- **Unit Tests**: `*.test.ts` or `*.test.tsx`
- **Integration Tests**: `*.integration.test.ts`
- **Performance Tests**: `*.perf.test.ts` or `*.benchmark.test.ts`
- **Visual Tests**: `*.visual.test.tsx`
- **End-to-End Tests**: `*.e2e.test.ts`

## Test Categories

### 1. Unit Tests (Fast, Isolated)

**Purpose**: Test individual functions and components in isolation
**Execution Time**: <10 seconds total
**Coverage Target**: >90% for new code

**Characteristics**:
- Mock all external dependencies
- Test single responsibility functions
- Fast execution with minimal I/O
- Deterministic results

**Example**: Testing a utility function
```typescript
describe("Utility Function", () => {
  test("should format timestamp correctly", () => {
    const input = 1640995200000;
    const expected = "2022-01-01T00:00:00.000Z";
    expect(formatTimestamp(input)).toBe(expected);
  });
});
```

### 2. Integration Tests (Cross-System)

**Purpose**: Test interactions between multiple components
**Execution Time**: <30 seconds total
**Coverage Target**: Critical paths and data flows

**Characteristics**:
- Test component interactions
- Validate data flow between systems
- Mock external services only
- Test error propagation

**Example**: Testing orchestrator with providers
```typescript
describe("Orchestrator Integration", () => {
  test("should coordinate provider and memory systems", async () => {
    const response = await orchestrator.respond("test input");
    expect(response).toBeDefined();
    expect(memoryManager.getLastMessage()).toMatchObject({
      role: "user",
      content: "test input",
    });
  });
});
```

### 3. Component Tests (React/Ink UI)

**Purpose**: Test TUI components and user interactions
**Execution Time**: <20 seconds total
**Coverage Target**: User interaction paths

**Characteristics**:
- Test component rendering and state
- Simulate user interactions
- Test keyboard navigation
- Validate accessibility features

**Example**: Testing input component
```typescript
describe("InputArea Component", () => {
  test("should handle user input and submission", () => {
    const mockOnSubmit = jest.fn();
    const { stdin } = render(<InputArea onSubmit={mockOnSubmit} />);

    stdin.write("test input");
    stdin.write("\r"); // Enter key

    expect(mockOnSubmit).toHaveBeenCalledWith("test input");
  });
});
```

### 4. Performance Tests (Benchmarks)

**Purpose**: Validate performance characteristics and prevent regressions
**Execution Time**: Variable based on benchmarks
**Coverage Target**: Critical performance paths

**Characteristics**:
- Measure latency and throughput
- Test memory usage patterns
- Validate resource cleanup
- Compare against performance budgets

**Example**: Testing input latency
```typescript
describe("Performance Tests", () => {
  test("should process input within latency budget", async () => {
    const start = performance.now();
    await orchestrator.respond("test input");
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50); // 50ms budget
  });
});
```

## Jest Configuration Strategy

The project uses multiple Jest configurations for different testing scenarios:

### 1. Main Configuration (`jest.config.cjs`)

**Purpose**: Primary test execution for development and CI
**Test Count**: 44 test patterns matched
**Features**:
- Comprehensive test matching patterns
- Coverage collection and thresholds
- Organized test discovery with clear categories
- Excludes problematic tests for stability

**Key Settings**:
```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: [
    // Unit tests - well-isolated, fast tests
    "<rootDir>/src/**/__tests__/unit/**/*.test.ts",
    "<rootDir>/src/**/__tests__/unit/**/*.test.tsx",

    // Component tests - React/Ink UI tests
    "<rootDir>/src/tui/components/__tests__/**/*.test.tsx",

    // Service layer tests - business logic
    "<rootDir>/src/services/__tests__/**/*.test.ts",
    "<rootDir>/src/commands/__tests__/**/*.test.ts",

    // TUI tests (non-component)
    "<rootDir>/src/tui/__tests__/**/*.test.ts",

    // Stable root-level tests
    "<rootDir>/src/__tests__/keyboard.test.ts",
    "<rootDir>/src/__tests__/memory.test.ts",
    // ... additional stable tests
  ],

  coverageThreshold: {
    global: {
      branches: 65,
      functions: 70,
      lines: 75,
      statements: 75,
    },
  },

  testTimeout: 15000,
  maxWorkers: "50%",
  verbose: false,
};
```

### 2. Reliable Configuration (`jest.config.reliable.cjs`)

**Purpose**: Stable test suite for CI/CD pipelines
**Features**:
- Only includes stable, well-tested components
- Serial execution for reliability
- Enhanced error detection
- Bail on first failure for debugging

**Key Differences**:
- `maxWorkers: 1` for serial execution
- `bail: 1` to stop on first failure
- `detectOpenHandles: true` for resource leak detection
- Smaller test set focused on stability

### 3. Fast Configuration (`jest.config.fast.cjs`)

**Purpose**: Quick feedback during development
**Features**:
- Performance optimizations enabled
- Coverage disabled for speed
- Reduced test timeout
- Excludes slow tests

**Optimizations**:
- `collectCoverage: false`
- `testTimeout: 15000`
- `forceExit: true` for faster completion
- `detectOpenHandles: false` for startup speed

### 4. Integration Configuration (`jest.config.integration.cjs`)

**Purpose**: Cross-system integration testing
**Features**:
- Longer timeouts for complex operations
- Real integration scenarios
- Cross-component test validation

### 5. Master Configuration (`jest.config.master.cjs`)

**Purpose**: Comprehensive test orchestration
**Features**:
- Multi-project test execution
- Aggregated coverage reporting
- Comprehensive test result processing

**Project Structure**:
```javascript
projects: [
  { displayName: "unit", /* unit test config */ },
  { displayName: "components", /* component config */ },
  { displayName: "tools", /* tool-specific config */ },
  { displayName: "integration", /* integration config */ },
]
```

## Mock Patterns

### 1. External Dependency Mocking

**Pattern**: Mock all external dependencies at module level

```typescript
// Mock providers
jest.mock("../../providers/chat_fallback", () => ({
  chatCompletions: jest.fn().mockResolvedValue({
    content: "mock response",
    usage: null
  }),
  chatStream: jest.fn().mockResolvedValue({
    content: "mock response",
    usage: null
  }),
}));

// Mock file system operations
jest.mock("fs/promises", () => ({
  readFile: jest.fn().mockResolvedValue("{}"),
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

// Mock Git operations
jest.mock("simple-git", () => ({
  default: () => ({
    checkIsRepo: jest.fn().mockResolvedValue(true),
    status: jest.fn().mockResolvedValue({ current: "main" }),
  }),
}));
```

### 2. Configuration Mocking

**Pattern**: Provide consistent configuration across tests

```typescript
jest.mock("../../config", () => ({
  loadConfig: jest.fn().mockResolvedValue({
    provider: {
      active: "copilot",
      copilot: {
        base_url: "http://localhost:8080",
        chat_path: "/chat/completions",
      },
    },
    model: { active: "gpt-4" },
    ui: {
      mouse_mode: true,
      paste_threshold: 150,
    },
  }),
  setConfigValue: jest.fn().mockResolvedValue(undefined),
}));
```

### 3. Component Mocking for TUI Tests

**Pattern**: Mock complex UI components for focused testing

```typescript
jest.mock("../components/Header", () => ({
  Header: () => React.createElement("div", { "data-testid": "header" }, "Header"),
}));

jest.mock("../components/ConversationArea", () => ({
  ConversationArea: () => React.createElement("div", {
    "data-testid": "conversation-area"
  }, "Conversation"),
}));
```

### 4. Orchestrator Integration Pattern

**Pattern**: Let orchestrator import naturally with mocked dependencies

```typescript
// Mock all orchestrator dependencies BEFORE importing
jest.mock("../../providers/chat", () => ({ /* mocks */ }));
jest.mock("../../tools/patch", () => ({ /* mocks */ }));
jest.mock("../../integrations/mcp", () => ({ /* mocks */ }));

// Import orchestrator AFTER all mocks are setup
import orchestrator from "../../runtime/orchestrator";

describe("Tests", () => {
  test("should work with real orchestrator", async () => {
    const response = await orchestrator.respond("test");
    expect(typeof response).toBe("string");
  });
});
```

### 5. Environment Simulation

**Pattern**: Mock process environment for different test scenarios

```typescript
describe("Environment Tests", () => {
  beforeEach(() => {
    delete process.env.PLATO_PARITY_MODE;
    delete process.env.PLATO_STATIC_TUI;
  });

  test("should handle parity mode", () => {
    process.env.PLATO_PARITY_MODE = "1";
    // Test parity mode behavior
  });
});
```

## Test Implementation Patterns

### 1. State Management Testing

**Pattern**: Test state transitions and management

```typescript
describe("State Management", () => {
  let mockState: KeyboardState;

  beforeEach(() => {
    mockState = createInitialState();
  });

  test("should handle state transitions", () => {
    expect(mockState.isMultiLine).toBe(false);

    mockState.isMultiLine = true;
    mockState.multiLineInput = ["line 1", "line 2"];

    expect(mockState.isMultiLine).toBe(true);
    expect(mockState.multiLineInput).toHaveLength(2);
  });
});
```

### 2. Async Operation Testing

**Pattern**: Test asynchronous operations with proper error handling

```typescript
describe("Async Operations", () => {
  test("should handle async operations", async () => {
    const result = await orchestrator.respond("test input");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("should handle errors gracefully", async () => {
    mockProvider.mockRejectedValue(new Error("Network error"));

    const result = await orchestrator.respond("test");
    expect(result).toBeDefined(); // Should not throw
  });
});
```

### 3. Event Handling Testing

**Pattern**: Test keyboard and user interaction events

```typescript
describe("Event Handling", () => {
  test("should handle keyboard events", () => {
    const mockHandler = jest.fn();
    const component = render(<Component onKeyPress={mockHandler} />);

    component.stdin.write("a"); // Simulate keypress
    expect(mockHandler).toHaveBeenCalledWith("a");
  });
});
```

### 4. Resource Cleanup Testing

**Pattern**: Test proper resource management and cleanup

```typescript
describe("Resource Management", () => {
  test("should cleanup timeouts", () => {
    const timeout = setTimeout(() => {}, 1000);
    mockState.escapeTimeout = timeout;

    expect(mockState.escapeTimeout).not.toBe(null);

    if (mockState.escapeTimeout) {
      clearTimeout(mockState.escapeTimeout);
      mockState.escapeTimeout = null;
    }

    expect(mockState.escapeTimeout).toBe(null);
  });
});
```

### 5. Error Boundary Testing

**Pattern**: Test error handling and recovery

```typescript
describe("Error Handling", () => {
  test("should handle errors gracefully", async () => {
    const mockError = new Error("Test error");
    mockFunction.mockRejectedValue(mockError);

    expect(async () => {
      await performOperation();
    }).not.toThrow();
  });

  test("should recover from errors", async () => {
    // Simulate error condition
    mockFunction.mockRejectedValueOnce(new Error("Temporary error"));

    // Should recover on retry
    const result = await performOperationWithRetry();
    expect(result).toBeDefined();
  });
});
```

## TUI Component Testing

### 1. Component Rendering Tests

**Pattern**: Test component output and structure

```typescript
describe("Component Rendering", () => {
  test("should render without crashing", () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId("header")).toBeTruthy();
    expect(getByTestId("conversation-area")).toBeTruthy();
    expect(getByTestId("input-area")).toBeTruthy();
  });
});
```

### 2. Input Simulation Tests

**Pattern**: Simulate user input and interactions

```typescript
describe("Input Simulation", () => {
  test("should handle text input", () => {
    const { stdin, lastFrame } = render(<InputComponent />);

    stdin.write("Hello world");

    const output = lastFrame();
    expect(output).toContain("Hello world");
  });

  test("should handle special keys", () => {
    const { stdin } = render(<InputComponent />);

    stdin.write("\x1b"); // Escape key
    stdin.write("\r");   // Enter key
    stdin.write("\x03"); // Ctrl+C

    // Verify appropriate handling
  });
});
```

### 3. State Management in Components

**Pattern**: Test component state changes

```typescript
describe("Component State", () => {
  test("should manage internal state", () => {
    const component = render(<StatefulComponent />);

    // Initial state
    expect(component.lastFrame()).toContain("initial");

    // State change
    component.stdin.write("change");
    expect(component.lastFrame()).toContain("changed");
  });
});
```

### 4. Accessibility Testing

**Pattern**: Test keyboard navigation and screen reader compatibility

```typescript
describe("Accessibility", () => {
  test("should support keyboard navigation", () => {
    const { stdin } = render(<NavigableComponent />);

    stdin.write("\t");    // Tab navigation
    stdin.write(" ");     // Space selection
    stdin.write("\r");    // Enter activation

    // Verify navigation worked
  });
});
```

### 5. Environment-Specific Testing

**Pattern**: Test different terminal environments

```typescript
describe("Environment Compatibility", () => {
  test("should work in parity mode", () => {
    process.env.PLATO_PARITY_MODE = "1";
    const component = render(<App />);
    expect(component.lastFrame()).toBeDefined();
  });

  test("should work in static TUI mode", () => {
    process.env.PLATO_STATIC_TUI = "1";
    const component = render(<App />);
    expect(component.lastFrame()).toBeDefined();
  });
});
```

## Integration Testing

### 1. System Integration Tests

**Pattern**: Test interactions between major systems

```typescript
describe("System Integration", () => {
  test("should coordinate orchestrator and memory", async () => {
    await orchestrator.respond("test message");
    const history = await orchestrator.getMessageHistory();

    expect(history).toContain(
      expect.objectContaining({
        role: "user",
        content: "test message",
      })
    );
  });
});
```

### 2. Provider Integration Tests

**Pattern**: Test AI provider integrations

```typescript
describe("Provider Integration", () => {
  test("should handle provider failures gracefully", async () => {
    mockProvider.mockRejectedValue(new Error("Provider unavailable"));

    const response = await orchestrator.respond("test");
    expect(response).toContain("error"); // Fallback response
  });
});
```

### 3. Tool Integration Tests

**Pattern**: Test MCP tool integration

```typescript
describe("Tool Integration", () => {
  test("should execute tools successfully", async () => {
    mockTool.mockResolvedValue({ result: "success" });

    const result = await callTool("test-server", "test-tool", {});
    expect(result.result).toBe("success");
  });
});
```

## Performance Testing

### 1. Latency Testing

**Pattern**: Measure and validate response times

```typescript
describe("Performance", () => {
  test("should meet latency requirements", async () => {
    const measurements = [];

    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await orchestrator.respond("test");
      const duration = performance.now() - start;
      measurements.push(duration);
    }

    const average = measurements.reduce((a, b) => a + b) / measurements.length;
    expect(average).toBeLessThan(50); // 50ms budget
  });
});
```

### 2. Memory Usage Testing

**Pattern**: Monitor memory consumption

```typescript
describe("Memory Performance", () => {
  test("should not leak memory", () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Perform many operations
    for (let i = 0; i < 1000; i++) {
      performOperation();
    }

    global.gc?.(); // Force garbage collection if available
    const finalMemory = process.memoryUsage().heapUsed;

    expect(finalMemory - initialMemory).toBeLessThan(10 * 1024 * 1024); // 10MB
  });
});
```

### 3. Throughput Testing

**Pattern**: Test system capacity

```typescript
describe("Throughput", () => {
  test("should handle concurrent operations", async () => {
    const operations = Array.from({ length: 10 }, () =>
      orchestrator.respond("test")
    );

    const results = await Promise.all(operations);

    expect(results).toHaveLength(10);
    expect(results.every(r => typeof r === "string")).toBe(true);
  });
});
```

## Quality Assurance

### 1. Test Coverage Requirements

**Minimum Coverage Targets**:
- **Statements**: 75%
- **Branches**: 65%
- **Functions**: 70%
- **Lines**: 75%

**New Code Requirements**:
- **Unit Test Coverage**: >90%
- **Critical Path Coverage**: 100%
- **Error Handling Coverage**: >80%

### 2. Test Quality Metrics

**Test Reliability**:
- Tests must pass consistently (>99% pass rate)
- No flaky tests in CI pipeline
- Deterministic results across environments

**Test Performance**:
- Unit tests: <10s total execution
- Integration tests: <30s total execution
- Full test suite: <120s total execution

### 3. Test Maintenance

**Regular Maintenance Tasks**:
- Review and update mock implementations
- Remove obsolete tests
- Update tests for API changes
- Optimize test performance
- Fix flaky tests immediately

### 4. Coverage Analysis

**Coverage Collection**:
```bash
npm run test:coverage
```

**Coverage Reporting**:
- HTML reports for detailed analysis
- LCOV format for CI integration
- JSON summary for automated checks

**Coverage Exclusions**:
- Test files themselves
- Type definition files
- Build configuration
- Development scripts

## Best Practices

### 1. Test Organization

**✅ DO**:
- Group related tests with `describe` blocks
- Use descriptive test names that explain behavior
- Follow the AAA pattern (Arrange, Act, Assert)
- Keep tests focused on single behaviors
- Use consistent naming conventions

**❌ DON'T**:
- Write tests that depend on other tests
- Use shared mutable state between tests
- Skip tests without good reason
- Write overly complex test logic
- Test implementation details instead of behavior

### 2. Mock Management

**✅ DO**:
- Mock external dependencies consistently
- Clear mocks between tests
- Use factory functions for mock data
- Mock at the module boundary
- Document complex mock setups

**❌ DON'T**:
- Mock everything indiscriminately
- Create brittle mocks tied to implementation
- Share mocks across unrelated tests
- Mock the system under test
- Create overly complex mock hierarchies

### 3. Test Data Management

**✅ DO**:
- Use factory functions for test data
- Create minimal test data sets
- Use realistic but safe test data
- Clean up test data after tests
- Use deterministic test data

**❌ DON'T**:
- Use production data in tests
- Create massive test data sets
- Share mutable test data between tests
- Use random data without seeding
- Leave test artifacts after execution

### 4. Error Testing

**✅ DO**:
- Test both happy path and error conditions
- Test edge cases and boundary conditions
- Verify error messages and types
- Test error recovery mechanisms
- Use specific error assertions

**❌ DON'T**:
- Only test the happy path
- Ignore error conditions
- Use generic error assertions
- Test unrealistic error scenarios
- Skip error boundary testing

### 5. Performance Testing

**✅ DO**:
- Set realistic performance budgets
- Test with representative data sizes
- Measure multiple iterations for stability
- Test memory usage patterns
- Compare against baselines

**❌ DON'T**:
- Set unrealistic performance expectations
- Test with trivial data sets
- Rely on single measurements
- Ignore memory leaks
- Test without proper setup

### 6. Integration Testing

**✅ DO**:
- Test critical integration paths
- Use realistic integration scenarios
- Test error propagation between systems
- Verify data consistency across boundaries
- Test configuration changes

**❌ DON'T**:
- Test every possible integration
- Use unrealistic integration scenarios
- Test internal implementation details
- Ignore system boundaries
- Skip configuration testing

### 7. TUI Testing

**✅ DO**:
- Test keyboard interactions thoroughly
- Verify terminal output formatting
- Test accessibility features
- Test different environment conditions
- Use appropriate test utilities

**❌ DON'T**:
- Test only visual aspects
- Ignore keyboard navigation
- Skip accessibility testing
- Test only in ideal conditions
- Mock the terminal interface

## Running Tests

### Development Workflow

```bash
# Quick feedback during development
npm run test:watch

# Run specific test file
npm test -- --testPathPatterns="keyboard-handler"

# Run tests with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run reliable test suite
npm run test:reliable

# Run comprehensive test suite
npm run test:comprehensive
```

### CI/CD Pipeline

```bash
# Fast verification
npm run test:fast

# Comprehensive verification
npm run test:master

# Performance verification
npm run perf:benchmark
```

### Debugging Tests

```bash
# Run with verbose output
npm test -- --verbose

# Run in debug mode
npm test -- --runInBand --detectOpenHandles

# Run with specific timeout
npm test -- --testTimeout=30000
```

This testing guide provides comprehensive coverage of all testing patterns, strategies, and implementations in the Plato project, serving as both documentation and a reference for maintaining and extending the test suite.