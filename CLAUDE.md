# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm ci

# Development (starts TUI with tsx)
npm run dev

# Build TypeScript to dist/
npm run build

# Run built application
npm run start

# Type checking (no script defined - use tsc directly)
npx tsc --noEmit

# Linting
npm run lint

# Format code
npm run fmt

# Testing Commands
npm test                           # Run all tests
npm run test:watch                 # Watch mode for development
npm run test:coverage              # Run with coverage report
npm run test:unit                  # Run unit tests only
npm run test:integration           # Run integration tests only
npm run test:e2e                   # Run end-to-end tests
npm run test:reliable              # Run reliable test suite
npm run test:fast                  # Run fast performance tests
npm run test:comprehensive         # Full comprehensive test run

# Run a single test file
npx jest src/__tests__/keyboard.test.ts

# Performance and utilities
npm run claude:capabilities        # Print Claude capabilities documentation
npm run perf:benchmark             # Run performance benchmarks
npm run perf:commands              # Benchmark command performance
npm run mcp:serve                  # Start MCP server for testing
```

## Core Architecture

### MCP Integration System (`src/integrations/mcp.ts`)

The tool-call bridge enables AI assistant to execute external tools through MCP servers:

- **Tool Call Protocol**: Assistant emits tool requests via JSON blocks:
  ```json
  { "tool_call": { "server": "<server-id>", "name": "<tool-name>", "input": {} } }
  ```
- **Permission System**: All tool execution gated by `src/tools/permissions.ts`
- **Server Registry**: MCP servers stored in `.plato/mcp-servers.json`
- **Runtime Orchestration**: `src/runtime/orchestrator.ts` manages tool execution flow

### Provider Architecture (`src/providers/`)

- **Copilot Provider** (`copilot.ts`): OAuth device flow, token refresh, GitLab Duo headers
- **Chat Fallback** (`chat_fallback.ts`): Automatic provider switching on failures
- **Chat Base** (`chat.ts`): Abstract interface for chat completions

### Patch Engine (`src/tools/patch.ts`)

- Processes unified diffs between `*** Begin Patch` / `*** End Patch` markers
- Requires Git repository for `git apply` operations
- Maintains patch history in `.plato/patch-journal.json`
- Supports dry-run validation before applying changes

### Command Router (`src/commands/router.ts`)

Centralized slash command processing ensures commands are handled properly:

- **Command Parsing**: Handles quoted arguments and escaping
- **Command Execution**: Routes to appropriate handler
- **Error Handling**: Consistent error reporting
- **Confirmation Flow**: For destructive operations

### Memory Management (`src/memory/`)

- **Persistent Storage**: Conversations in `.plato/memory/`
- **Smart Compaction**: Intelligent reduction for long sessions
- **Auto-Save**: Default 30-second intervals
- **Session Continuity**: Cross-session memory restoration

### TUI Components (`src/tui/`)

- **Keyboard Handler** (`keyboard-handler.tsx`): Main React component with raw mode input
- **Mouse Integration** (`mouse-integration.ts`): Cross-platform mouse event handling
- **Panel System** (`panel.tsx`): Multi-panel layout management
- **Status Line** (`status-line.tsx`): Real-time metrics display
- **Accessibility** (`AccessibilityManager.ts`): Screen reader and keyboard navigation

### Performance Optimizations

- **Virtual Scrolling**: Efficient rendering for large conversations
- **Lazy Loading**: On-demand content loading
- **Smart Caching**: Response and context caching
- **Target Metrics**: <50ms input latency, 60fps scrolling, <50MB idle memory

## Slash Commands Implementation Status

### ✅ Fully Implemented (21 commands)
- `/help`, `/edit`, `/search`, `/run`, `/test`, `/git`, `/browse`, `/create`
- `/output-style`, `/security-review`, `/privacy-settings`, `/apply-mode`
- `/debug`, `/terminal-setup`, `/bug`, `/clear`, `/save`, `/load`
- `/permissions`, `/export`, `/feedback`

### ⚠️ Placeholder/Partial (20 commands)
- `/doctor` - Has basic implementation but needs full system checks
- `/login`, `/logout`, `/status` - Authentication flow placeholders
- `/model` - Model switching placeholder
- `/mcp` - MCP server management placeholder
- `/memory`, `/compact`, `/resume` - Memory management placeholders
- `/context` - Token usage visualization placeholder
- Others: `/init`, `/install`, `/undo`, `/redo`, `/theme`, `/config`, `/update`, `/license`, `/tutorial`, `/workspace`

## Testing Workflow

### Development Testing
```bash
# Quick feedback during development
npm run test:watch

# Fast unit tests only
npm run test:unit

# Integration tests for feature verification
npm run test:integration
```

### E2E Testing with MCP
```bash
# 1. Start mock MCP server
npx tsx scripts/mock-mcp.ts

# 2. In TUI, attach the server
/mcp attach local http://localhost:8719

# 3. Configure permissions
/permissions default fs_patch allow
/apply-mode auto

# 4. Test tool calls and file operations
```

### Performance Testing
```bash
# Run performance benchmarks
npm run perf:benchmark

# Benchmark specific commands
npm run perf:commands

# Quick performance check
npm run perf:benchmark:quick

# Detailed analysis
npm run perf:benchmark:detailed
```

### Test Configurations

The project uses multiple Jest configurations for different scenarios:
- `jest.config.cjs` - Main test configuration
- `jest.config.reliable.cjs` - Stable subset for CI
- `jest.config.fast.cjs` - Quick tests for rapid feedback
- `jest.config.integration.cjs` - Integration test suite
- `jest.config.performance.cjs` - Performance-optimized testing

## CLI Direct Usage

For non-interactive usage or CI/CD:

```bash
# Authentication
npx tsx src/cli.ts login          # OAuth device flow
npx tsx src/cli.ts logout         # Clear credentials
npx tsx src/cli.ts status         # Check auth status

# One-shot queries
npx tsx src/cli.ts --print "Your question"
npx tsx src/cli.ts --cli          # Force basic CLI mode
npx tsx src/cli.ts --model <id>   # Use specific model

# Environment flags
PLATO_FORCE_TUI=true npm run dev  # Force TUI mode
PLATO_STATIC_TUI=1 npm run dev    # Windows Terminal compatibility
PLATO_QUIET_TUI=1 npm run dev     # Reduce animations
```

## File Structure

```
.plato/                       # Local data directory
├── session.json             # Current session state
├── mcp-servers.json         # Attached MCP servers
├── patch-journal.json       # Applied patches history
├── memory/                  # Conversation memory
├── commands/                # Custom command definitions
└── styles/                  # Custom output styles

~/.config/plato/             # User configuration
└── credentials.json         # Fallback credential storage
```

## Key Implementation Notes

- **Git Requirement**: Patch operations require Git repository
- **Mouse Mode**: Enabled by default for copy/paste support
- **Auto-Save**: Session and memory auto-save every 30 seconds
- **Cross-Platform**: Works in WSL, Docker, and CI environments
- **Authentication**: Uses OS keychain when available, falls back to file storage
- **Tool Calls**: Default preset enabled, strict mode via `/tool-call-preset strict on`

## Troubleshooting Common Issues

### Terminal Compatibility
- Raw mode warnings are informational - functionality remains intact
- Use `PLATO_STATIC_TUI=1` for Windows Terminal
- Falls back to basic CLI if TUI features unavailable

### Authentication Issues
- Credentials auto-refresh on expiration
- Use `/login` for new authentication
- Check `/status` for current auth state

### MCP Tool Calls
- Exponential backoff on 502/503/504/429 errors
- Verify MCP server is running with `npx tsx scripts/mock-mcp.ts`
- Check permissions with `/permissions list`

### Performance Issues
- Enable virtual scrolling for large conversations
- Use `/compact` for memory optimization (when implemented)
- Monitor with `/debug performance` (when implemented)