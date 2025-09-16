# Developer Documentation

Comprehensive developer guide for contributing to and extending Plato TUI.

## 🏗️ Architecture Overview

Plato is built as a modern, modular TypeScript application with a focus on extensibility, performance, and maintainability.

### Core Architecture

```
src/
├── tui/                    # Terminal UI components and rendering
│   ├── keyboard-handler.tsx   # Main TUI entry point and input handling
│   ├── panels/                # Multi-panel layout system
│   ├── visual/                # Visual components and styling
│   └── accessibility/         # Accessibility features
├── providers/              # AI provider integrations
│   ├── copilot.ts             # GitHub Copilot integration
│   ├── chat_fallback.ts      # Provider switching logic
│   └── chat.ts               # Base chat interface
├── runtime/               # Core runtime orchestration
│   ├── orchestrator.ts       # Main runtime coordinator
│   ├── session.ts           # Session management
│   └── metrics.ts           # Performance metrics
├── tools/                 # Native tool implementations
│   ├── edit.ts              # File editing capabilities
│   ├── search.ts            # Code search functionality
│   ├── patch.ts             # Git patch operations
│   └── permissions.ts       # Security permissions
├── memory/                # Conversation memory system
│   ├── manager.ts           # Memory management
│   ├── compaction.ts        # History compression
│   └── persistence.ts       # Data persistence
├── commands/              # Command system
│   ├── router.ts            # Command routing and parsing
│   └── registry.ts          # Command registration
├── slash/                 # Slash command implementations
│   └── commands.ts          # All slash commands
├── integrations/          # External integrations
│   ├── mcp.ts              # MCP server bridge
│   └── gitlab.ts           # GitLab integration
└── cli.ts                 # CLI entry point
```

### Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.0+
- **UI Framework**: React + Ink (terminal rendering)
- **Testing**: Jest with comprehensive coverage
- **Build System**: TypeScript compiler with tsx
- **Package Manager**: npm
- **Code Quality**: ESLint + Prettier

### Design Principles

1. **Modularity**: Each component has a single responsibility
2. **Extensibility**: Plugin-based architecture for easy extension
3. **Performance**: Sub-50ms input latency, efficient memory usage
4. **Accessibility**: WCAG 2.1 AA compliance
5. **Security**: Secure by default, permission-based tool access
6. **Testing**: High test coverage (95%+) with multiple test types

## 🚀 Development Setup

### Prerequisites

```bash
# Required tools
node --version    # v18.0.0+
npm --version     # v8.0.0+
git --version     # v2.30.0+

# Development tools (recommended)
code --version    # VS Code
jest --version    # Testing framework
```

### Local Development

```bash
# Clone and setup
git clone https://your-repo/plato.git
cd plato

# Install dependencies
npm ci

# Start development server
npm run dev

# Run in separate terminal for testing
npm run test:watch
```

### Development Commands

```bash
# Development
npm run dev                    # Start TUI in development mode
npm run build                  # Build TypeScript to dist/
npm run start                  # Run built application
npm run typecheck              # TypeScript type checking
npm run lint                   # ESLint analysis
npm run fmt                    # Format code with Prettier

# Testing
npm test                       # Run all tests
npm run test:watch             # Watch mode for development
npm run test:coverage          # Generate coverage report
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests
npm run test:e2e               # End-to-end tests

# Performance
npm run perf:benchmark         # Performance benchmarking
npm run claude:capabilities    # Print system capabilities

# Utilities
npm run mcp:serve              # Start mock MCP server
```

## 🧩 Component Development

### Command Implementation Pattern

All slash commands follow a consistent structure:

```typescript
// src/slash/commands.ts
{
  name: "my-command",
  description: "Command description for help text",
  category: "System|Authentication|Tool Management|etc",
  aliases: ["alias1", "alias2"],           // Optional
  usage: "/my-command [options]",          // Optional
  requiresArgs: false,                     // Optional
  execute: async (args: string[], session: any, provider?: any) => {
    try {
      // Command implementation
      const result = await performOperation(args, session, provider);

      return {
        output: formatOutput(result),
        requiresConfirmation: false    // Optional
      };
    } catch (error) {
      return {
        error: `Command failed: ${error.message}`
      };
    }
  }
}
```

### Integration Points

Commands have access to several key integration points:

```typescript
// Session object provides conversation state
interface Session {
  id: string;
  history: Message[];
  context: ContextInfo;
  memory: MemoryManager;
  settings: UserSettings;
}

// Provider object gives access to AI models
interface Provider {
  generateResponse(prompt: string): Promise<string>;
  model: string;
  authenticated: boolean;
}

// Configuration system
import { loadConfig, setConfigValue } from '../config/manager.js';
const config = await loadConfig();
await setConfigValue('key', 'value');
```

### Tool Development

Native tools extend Plato's capabilities:

```typescript
// src/tools/my-tool.ts
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export async function myTool(
  args: string[],
  context?: ToolContext
): Promise<ToolResult> {
  try {
    // Tool implementation
    const result = await performToolOperation(args, context);

    return {
      success: true,
      output: result,
      metadata: { timestamp: Date.now() }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### MCP Server Integration

MCP servers extend functionality through the bridge system:

```typescript
// Tool call format in AI responses
{
  "tool_call": {
    "server": "server-id",
    "name": "tool-name",
    "input": { "param": "value" }
  }
}

// MCP server configuration
interface MCPServer {
  id: string;
  url: string;
  name: string;
  tools: MCPTool[];
  permissions: PermissionSet;
}
```

## 🧪 Testing Guidelines

### Test Structure

We maintain multiple test types for comprehensive coverage:

```typescript
// Unit tests (src/__tests__/)
describe('CommandRouter', () => {
  it('should parse basic commands correctly', () => {
    const result = parseCommand('/help');
    expect(result).toEqual({
      command: 'help',
      args: []
    });
  });
});

// Integration tests (src/__tests__/integration/)
describe('MCP Integration', () => {
  it('should connect to MCP server', async () => {
    const server = await attachMCPServer('test', 'http://localhost:8719');
    expect(server.connected).toBe(true);
  });
});

// End-to-end tests (src/__tests__/e2e/)
describe('Full Workflow', () => {
  it('should complete authentication flow', async () => {
    await runCommand('/login');
    const status = await runCommand('/status');
    expect(status).toContain('Authenticated');
  });
});
```

### Test Configuration

```javascript
// jest.config.cjs - Main configuration
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/cli.ts'  // Exclude entry points
  ]
};

// jest.config.integration.cjs - Integration tests
module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  testTimeout: 30000
};
```

### Testing Best Practices

1. **Unit Tests**: Test individual functions and components
2. **Integration Tests**: Test component interactions
3. **E2E Tests**: Test complete user workflows
4. **Performance Tests**: Verify latency and memory usage
5. **Security Tests**: Validate permission systems

## 📊 Performance Guidelines

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Input Latency | <50ms | Keystroke to screen update |
| Panel Updates | <100ms | Panel refresh time |
| Scroll FPS | 60fps | Smooth scrolling |
| Memory (Idle) | <50MB | Baseline memory usage |
| CPU (Idle) | <5% | Background CPU usage |
| Test Coverage | >95% | Code coverage |

### Performance Monitoring

```typescript
// src/runtime/metrics.ts
export class PerformanceMonitor {
  static measureCommand(commandName: string) {
    return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
      const method = descriptor.value;
      descriptor.value = async function (...args: any[]) {
        const start = performance.now();
        try {
          const result = await method.apply(this, args);
          const duration = performance.now() - start;
          console.log(`Command ${commandName} took ${duration}ms`);
          return result;
        } catch (error) {
          const duration = performance.now() - start;
          console.error(`Command ${commandName} failed after ${duration}ms`);
          throw error;
        }
      };
    };
  }
}
```

### Memory Management

```typescript
// Efficient memory patterns
export class MemoryEfficientComponent {
  private cache = new Map<string, any>();

  // Use WeakMap for object references
  private weakCache = new WeakMap<object, any>();

  // Clean up resources
  dispose() {
    this.cache.clear();
    // WeakMap cleans itself automatically
  }

  // Batch operations to reduce allocations
  processBatch(items: any[]) {
    const results = [];
    for (const item of items) {
      results.push(this.processItem(item));
    }
    return results;
  }
}
```

## 🔒 Security Guidelines

### Permission System

All tool access must go through the permission system:

```typescript
// src/tools/permissions.ts
export enum PermissionLevel {
  ALLOW = 'allow',
  DENY = 'deny',
  ASK = 'ask'
}

export interface Permission {
  tool: string;
  action: string;
  level: PermissionLevel;
  context?: Record<string, any>;
}

// Check permissions before tool execution
const hasPermission = await checkPermission('fs_patch', 'write', {
  file: '/path/to/file.js'
});
```

### Secure Coding Practices

1. **Input Validation**: Always validate user inputs
2. **Path Traversal**: Prevent directory traversal attacks
3. **Command Injection**: Sanitize shell commands
4. **Credential Storage**: Use secure credential storage
5. **Network Security**: Validate SSL certificates

```typescript
// Example: Secure file operations
import { resolve, relative } from 'path';

function validatePath(userPath: string, basePath: string): boolean {
  const resolvedPath = resolve(userPath);
  const relativePath = relative(basePath, resolvedPath);

  // Prevent path traversal
  return !relativePath.startsWith('..');
}
```

## 🔧 Configuration System

### Configuration Structure

```typescript
// src/config/types.ts
export interface PlatoConfig {
  version: string;
  user: {
    preferences: UserPreferences;
    auth: AuthConfig;
    privacy: PrivacySettings;
  };
  system: {
    performance: PerformanceConfig;
    security: SecurityConfig;
    logging: LoggingConfig;
  };
  integrations: {
    mcp: MCPConfig;
    providers: ProviderConfig[];
  };
}
```

### Environment Variables

```bash
# Core settings
PLATO_CONFIG_DIR=~/.plato        # Configuration directory
PLATO_LOG_LEVEL=info             # Logging level (debug|info|warn|error)
PLATO_DATA_DIR=.plato/data      # Data storage directory

# Development settings
NODE_ENV=development             # Environment (development|production|test)
PLATO_DEBUG=true                 # Enable debug features
PLATO_PERFORMANCE_MONITORING=true # Enable performance tracking

# Security settings
PLATO_ENABLE_TELEMETRY=false     # Telemetry collection
PLATO_MAX_MEMORY=500mb           # Memory limit
PLATO_SESSION_TIMEOUT=3600       # Session timeout (seconds)
```

## 🚀 Contribution Guidelines

### Code Style

We use Prettier and ESLint for consistent code formatting:

```javascript
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    '@typescript-eslint/recommended',
    'plugin:react/recommended',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'prefer-const': 'error',
    'no-var': 'error'
  }
};
```

### Git Workflow

```bash
# Feature development workflow
git checkout -b feature/new-command
git add .
git commit -m "feat: implement /analyze command"
git push origin feature/new-command

# Create merge request
# Ensure CI passes
# Request code review
```

### Commit Message Format

```bash
feat: add new MCP server integration
fix: resolve memory leak in chat history
docs: update API documentation
test: add integration tests for auth flow
refactor: improve command parsing performance
chore: update dependencies
```

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or properly documented)
```

## 📋 Release Process

### Version Management

We follow Semantic Versioning (semver):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

```bash
# 1. Update version
npm version patch|minor|major

# 2. Update changelog
echo "## v1.1.0\n- New features\n- Bug fixes" >> CHANGELOG.md

# 3. Build and test
npm run build
npm run test:comprehensive
npm run perf:benchmark

# 4. Tag and push
git add .
git commit -m "chore: prepare v1.1.0 release"
git tag v1.1.0
git push origin main --tags

# 5. Create release
gh release create v1.1.0 --generate-notes
```

## 🆘 Debugging

### Debug Mode

```bash
# Enable debug logging
DEBUG=plato:* npm run dev

# Specific debug categories
DEBUG=plato:commands npm run dev
DEBUG=plato:memory npm run dev
DEBUG=plato:mcp npm run dev
```

### Common Debug Tasks

```bash
# Check configuration
npx tsx -e "console.log(require('./src/config/manager').loadConfig())"

# Test MCP connection
npx tsx scripts/test-mcp.ts http://localhost:8719

# Analyze performance
npm run perf:profile
```

### Troubleshooting

1. **Command not working**: Check command registration in `src/slash/commands.ts`
2. **TUI rendering issues**: Verify terminal capabilities with `/terminal-setup`
3. **Memory issues**: Run `/context` to check usage
4. **MCP integration problems**: Use `/mcp test <server>` for diagnostics

## 📚 Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React + Ink Documentation](https://github.com/vadimdemedes/ink)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)
- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)

---

**Ready to contribute? Start with a small feature or bug fix, and gradually work your way up to more complex components. The codebase is designed to be approachable and well-documented!**