# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm ci

# Development (starts the TUI with tsx)
npm run dev

# Build TypeScript to dist/
npm run build

# Run built application
npm run start

# Type checking
npm run typecheck

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
npm run perf:benchmark            # Run performance benchmarks
npm run mcp:serve                 # Start MCP server for testing
```

## CLI Direct Usage (Bypassing TUI)

The CLI supports both TUI mode (default) and direct command-line usage:

```bash
# Authentication
npx tsx src/cli.ts login                      # Login to Copilot via device flow
npx tsx src/cli.ts logout                     # Logout and clear credentials
npx tsx src/cli.ts status                     # Check authentication status

# Configuration
npx tsx src/cli.ts config get                 # Show configuration
npx tsx src/cli.ts config set <key> <value>   # Set config value
npx tsx src/cli.ts models                     # List available models

# Direct query (bypassing TUI)
npx tsx src/cli.ts --print "Your question"    # One-shot query mode
npx tsx src/cli.ts --cli                      # Force basic CLI mode
npx tsx src/cli.ts --model <model-id>         # Use specific model

# Environment flags
PLATO_FORCE_TUI=true npm run dev              # Force TUI mode
PLATO_STATIC_TUI=1 npm run dev                # Static TUI for Windows Terminal
PLATO_QUIET_TUI=1 npm run dev                 # Reduce TUI animations
```

## Core Architecture

### Provider System (`src/providers/`)

- **Copilot Integration** (`copilot.ts`): OAuth device flow authentication, token management, API calls with proper headers
- **Chat Fallback** (`chat_fallback.ts`): Switches between Copilot and local providers
- **Chat Provider** (`chat.ts`): Base chat completion interface

### Tool-Call Bridge System (`src/integrations/mcp.ts`)

The assistant emits tool requests via strict JSON blocks:

```json
{ "tool_call": { "server": "<server-id>", "name": "<tool-name>", "input": {} } }
```

- Permissions enforced via `src/tools/permissions.ts`
- Results appended to conversation for continued streaming
- MCP servers stored in `.plato/mcp-servers.json`

### Patch Engine (`src/tools/patch.ts`)

- Processes unified diffs between `*** Begin Patch` / `*** End Patch` markers
- Requires Git repository (`git apply` under the hood)
- Supports dry-run, apply, and revert operations
- Maintains journal in `.plato/patch-journal.json`

### Runtime Orchestrator (`src/runtime/orchestrator.ts`)

- Manages conversation history and metrics
- Bridges tool calls to MCP servers
- Handles patch extraction and auto-application
- Coordinates hooks and security reviews
- Manages memory persistence via MemoryManager

### TUI Application (`src/tui/keyboard-handler.tsx`)

- React + Ink terminal interface
- Raw mode input handling for cross-platform compatibility (WSL-friendly)
- Mouse mode enabled by default for copy/paste support
- Slash command processing and confirmation dialogs
- Session persistence to `.plato/session.json`

### Memory System (`src/memory/`)

- Persistent conversation memory in `.plato/memory/`
- PLATO.md file for codebase context
- Auto-save with configurable intervals
- Smart compaction for long conversations

### Custom Commands (`src/commands/`)

- User-defined command system
- JSON-based configuration in `.plato/commands/`
- Integration with slash command system

### Output Styles (`src/styles/`)

- Customizable output formatting
- Built-in styles: default, minimal, verbose, emoji, technical
- User-defined styles in `.plato/styles/`

## Key Slash Commands

- `/doctor` - Diagnose setup and connectivity (verify binaries and Copilot)
- `/login` - Copilot device flow authentication
- `/logout` - Clear credentials
- `/status` - Show current configuration and auth status
- `/model` - List and switch between available models
- `/mcp attach <name> <url>` - Attach MCP server for tool usage
- `/mcp detach <name>` - Remove MCP server
- `/mcp tools` - List available tools from attached servers
- `/apply` - Apply pending patches (requires Git repository)
- `/revert` - Revert last applied patch
- `/permissions default fs_patch allow` - Enable Claude-style immediate writes
- `/apply-mode auto` - Auto-apply patches for file write parity
- `/resume` - Restore last session from .plato/session.json
- `/memory` - View, edit, or reset conversation memory
- `/output-style` - Switch between output styles
- `/compact` - Compact conversation history with optional focus
- `/mouse [on|off|toggle]` - Control mouse mode (enabled by default)
- `/paste [seconds]` - Temporarily disable input for easy copy/paste
- `/proxy start --port 11434` - Start OpenAI-compatible HTTP proxy
- `/todos scan` - Scan codebase for TODO items
- `/todos list` - List found TODO items

## Testing & Verification

The project has 119 test files covering comprehensive scenarios. Use these commands for testing and verification:

```bash
# Development testing workflow
npm run test:watch                 # Watch mode for active development
npm run test:unit                  # Unit tests only (fastest)
npm run test:integration          # Integration tests
npm run test:comprehensive        # Full test suite with coverage

# Diagnostic and verification scripts
npx tsx scripts/mock-mcp.ts       # Run mock MCP server for testing
npx tsx scripts/test-bridge.ts    # Test tool-call bridge
npx tsx scripts/smoke.ts          # Run smoke tests
npx tsx scripts/self-check.ts     # Self-check diagnostics
npx tsx scripts/benchmark.ts      # Performance benchmarking

# Coverage and quality
npm run test:coverage              # Generate coverage reports
npm run perf:benchmark            # Performance baseline testing
```

For end-to-end testing workflow:

1. Start mock MCP server: `npx tsx scripts/mock-mcp.ts`
2. In TUI: `/mcp attach local http://localhost:8719`
3. Enable parity mode: `/permissions default fs_patch allow` then `/apply-mode auto`
4. Test tool calls and immediate file writes

The test suite includes specialized configurations:

- `jest.config.cjs` - Main test configuration
- `jest.config.reliable.cjs` - Stable test suite for CI
- `jest.config.integration.cjs` - Integration-focused tests
- `jest.config.fast.cjs` - Performance-optimized quick tests

## Key Dependencies

- **ink**: React-based terminal UI framework
- **yargs**: CLI argument parsing
- **prompts**: Interactive CLI prompts
- **eventsource-parser**: SSE parsing for streaming responses
- **picocolors**: Terminal color output
- **execa**: Process execution for git operations
- **keytar** (optional): OS keychain for credential storage

## File Structure Conventions

- `.plato/` - Local Plato data directory
  - `session.json` - Current session state
  - `mcp-servers.json` - Attached MCP servers
  - `patch-journal.json` - Applied patches history
  - `memory/` - Conversation memory storage
  - `commands/` - Custom command definitions
  - `styles/` - Custom output styles
- Configuration: `~/.config/plato/credentials.json` (fallback for credentials)
- Credentials: OS keychain when available, fallback to config file

## Important Implementation Notes

- Patch operations require a Git repository (run `git init` if needed)
- Tool-call preset is enabled by default (strict mode optional via `/tool-call-preset strict on`)
- Mouse mode is enabled by default for better copy/paste support
- Session auto-saves to `.plato/session.json` for `/resume` functionality
- Memory auto-saves with 30-second intervals by default
- The TUI falls back to compatible input handling in WSL/Docker environments
- Copilot headers are properly set for GitLab Duo and API compatibility

## Error Handling Patterns

- MCP tool calls retry with exponential backoff on 502/503/504/429 errors
- Credentials refresh automatically when expired
- Git operations provide clear error messages when repository is missing
- Raw mode warnings are informational only - functionality remains intact