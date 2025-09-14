# Plato TUI Testing Infrastructure

This directory contains comprehensive testing infrastructure for the Plato TUI application, including unit tests, component tests, and end-to-end PTY-based tests.

## Overview

The testing setup includes:

1. **Component Tests** - Using `ink-testing-library` for testing React/Ink components
2. **E2E PTY Tests** - Using `node-pty` for real terminal interaction testing
3. **MCP Integration** - Docker-based MCP server for Claude Code integration
4. **CI/CD Support** - Automated testing in containerized environments

## Quick Start

### Run All Tests
```bash
npm run test:all
```

### Run Component Tests
```bash
npm run test:components
```

### Run E2E PTY Tests
```bash
npm run test:e2e
```

### Build Docker Test Environment
```bash
npm run docker:build
```

## Testing Architecture

### 1. Component Testing (`ink-testing-library`)

Location: `src/__tests__/components/`

These tests render Ink components in a virtual terminal and verify their output:

```typescript
import { render } from 'ink-testing-library';
import { LoadingSpinner } from '../../tui/LoadingAnimations';

test('renders loading spinner', () => {
  const { lastFrame } = render(<LoadingSpinner text="Loading" />);
  expect(lastFrame()).toContain('Loading');
});
```

### 2. E2E PTY Testing

Location: `test/e2e/plato-pty-test.js`

These tests launch Plato in a real PTY and interact with it:

```javascript
const tester = new PlatoTUITester();
await tester.start();
await tester.sendInput('Hello, Plato!');
await tester.sendKey('enter');
await tester.waitForText('assistant');
```

Key features:
- Real terminal emulation
- Keyboard input simulation
- Screen capture and verification
- Timeout handling

### 3. MCP Server Integration

The MCP (Model Context Protocol) server allows Claude Code to interact with Plato:

#### Available Tools:

1. **shell_exec** - Execute whitelisted shell commands
2. **run_plato_pty** - Run Plato in a PTY with interaction
3. **test_components** - Run component tests
4. **run_e2e_test** - Execute full E2E test suite

#### Setup for Claude Code:

1. Build the Docker container:
```bash
docker build -f Dockerfile.mcp -t plato-mcp:latest .
```

2. Add to Claude Code:
```bash
claude mcp add plato-testing -- docker run --rm -v "$PWD:/workspace" plato-mcp:latest
```

3. Use in Claude Code:
```
/mcp__plato-testing__shell_exec {"command": "npm test"}
/mcp__plato-testing__run_plato_pty {"input": "Hello!"}
```

## Docker Test Environment

The `Dockerfile.mcp` creates a containerized testing environment with:

- Node.js 20
- PTY support via `node-pty`
- Python with `pexpect` for advanced PTY testing
- Whitelisted command execution
- MCP server integration

### Building the Container

```bash
npm run docker:build
```

### Running Interactive Tests

```bash
npm run docker:run
```

## Test Coverage Areas

### Component Tests Cover:
- Loading animations (spinners, progress bars)
- Streaming indicators
- Activity indicators
- Countdown timers
- Visual feedback components

### E2E Tests Cover:
- Application startup
- Message sending/receiving
- Navigation (arrow keys, escape)
- Slash commands
- Multi-line input
- Screen state verification

## Writing New Tests

### Component Test Template

```typescript
import { render } from 'ink-testing-library';
import { YourComponent } from '../../tui/YourComponent';

describe('YourComponent', () => {
  it('should render correctly', () => {
    const { lastFrame } = render(
      <YourComponent prop="value" />
    );
    
    expect(lastFrame()).toContain('expected output');
  });
});
```

### E2E Test Template

```javascript
const tester = new PlatoTUITester();

// Start the app
await tester.start();

// Interact with it
await tester.sendInput('test input');
await tester.sendKey('enter');

// Verify output
await tester.waitForText('expected response');
const screen = tester.getScreen();
expect(screen).toContain('expected content');

// Clean up
await tester.stop();
```

## CI/CD Integration

The testing infrastructure is designed to work in CI/CD pipelines:

1. **GitHub Actions** - Use the Docker container for consistent test environment
2. **Local Development** - Run tests directly with npm scripts
3. **MCP Integration** - Allow Claude Code to run and verify tests

Example GitHub Actions workflow:

```yaml
name: Test Plato
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm run test:all
```

## Debugging Tests

### Enable Debug Output

For E2E tests:
```bash
DEBUG=true npm run test:e2e
```

### Capture Screenshots

The PTY tester can take snapshots:
```javascript
const screen = tester.snapshot('Debug Point');
console.log(screen);
```

### Interactive Debugging

Run Plato in the Docker container interactively:
```bash
docker run --rm -it -v "$PWD:/workspace" plato-mcp:latest bash
```

## Troubleshooting

### Common Issues

1. **PTY tests fail on CI** - Ensure the CI environment has PTY support
2. **Component tests timeout** - Check for infinite loops in animations
3. **Docker build fails** - Ensure Docker daemon is running
4. **MCP connection issues** - Verify Docker container can access the workspace

### Tips

- Use `--debug` flag for verbose output
- Check `test/e2e/plato-pty-test.js` for interaction examples
- Review component snapshots for unexpected changes
- Monitor resource usage during E2E tests

## Contributing

When adding new features to Plato:

1. Write component tests for new UI components
2. Add E2E tests for new user interactions
3. Update MCP tools for new testing capabilities
4. Document test coverage in this README

## Resources

- [Ink Testing Library](https://github.com/vadimdemedes/ink-testing-library)
- [Node PTY](https://github.com/microsoft/node-pty)
- [MCP Documentation](https://docs.anthropic.com/mcp)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)