# Plato Development Commands

## Essential Development Commands

```bash
# Install dependencies
npm ci

# Start development mode (launches TUI)
npm run dev

# Build TypeScript to dist/
npm run build

# Run built application
npm run start

# Direct CLI usage (bypass TUI)
npx tsx src/cli.ts --cli
npx tsx src/cli.ts --print "Your question"
```

## Code Quality Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run fmt
```

## Testing Commands

```bash
# Basic testing
npm test                           # Run all tests
npm run test:watch                 # Watch mode for development
npm run test:coverage              # Run with coverage report

# Specific test suites
npm run test:unit                  # Unit tests only (fastest)
npm run test:integration           # Integration tests
npm run test:e2e                   # End-to-end tests
npm run test:reliable              # Reliable test suite for CI
npm run test:fast                  # Fast performance tests
npm run test:comprehensive         # Full comprehensive test run

# Run single test file
npx jest src/__tests__/keyboard.test.ts

# Coverage analysis
npm run test:coverage:comprehensive
npm run test:coverage:detailed
```

## Performance & Utilities

```bash
# Performance benchmarking
npm run perf:benchmark
npm run perf:baseline
npm run perf:monitor

# Development utilities
npm run claude:capabilities        # Print Claude capabilities documentation
npm run mcp:serve                  # Start MCP server for testing
```

## Docker Commands

```bash
# Build and run with Docker
npm run docker:build
npm run docker:run
```

## Diagnostic Scripts

```bash
# Development diagnostics
npx tsx scripts/mock-mcp.ts       # Run mock MCP server
npx tsx scripts/test-bridge.ts    # Test tool-call bridge
npx tsx scripts/smoke.ts          # Run smoke tests
npx tsx scripts/self-check.ts     # Self-check diagnostics
npx tsx scripts/benchmark.ts      # Performance benchmarking
```

## Environment Variables

```bash
# TUI control
PLATO_FORCE_TUI=true npm run dev              # Force TUI mode
PLATO_STATIC_TUI=1 npm run dev                # Static TUI for Windows Terminal
PLATO_QUIET_TUI=1 npm run dev                 # Reduce TUI animations
```

## System Commands (Linux)

```bash
# Standard Linux utilities
git status                         # Check git status
ls -la                            # List files with details
find . -name "*.ts" -type f       # Find TypeScript files
grep -r "pattern" src/            # Search in source code
cd /path/to/directory             # Change directory
```
