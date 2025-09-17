# Plato Codebase Structure

## Root Level Files

- `src/cli.ts` - Main CLI entry point with yargs configuration
- `src/config.ts` - Configuration management
- `package.json` - Project dependencies and scripts
- `tsconfig.json` - TypeScript configuration (ES2022, strict mode)
- `CLAUDE.md` - Claude Code integration documentation
- `README.md` - Project documentation
- `CONTRIBUTING.md` - Contribution guidelines

## Source Directory Structure (`src/`)

### Core Components

- `src/cli.ts` - Main CLI entry point and terminal capability detection
- `src/config/` - Configuration management system
- `src/core/` - Core session and provider management

### AI Integration

- `src/providers/` - AI provider integrations
  - `copilot.ts` - GitHub Copilot OAuth integration
  - `chat.ts` - Base chat completion interface
  - `chat-stream.ts` - Streaming chat responses
  - `chat_fallback.ts` - Provider fallback system

### Terminal User Interface

- `src/tui/` - Terminal UI components (React + Ink)
  - `keyboard-handler.tsx` - Main TUI app with keyboard handling
  - `app.tsx` - TUI application wrapper
  - `components/` - Reusable TUI components

### Tool Integration

- `src/tools/` - Tool implementations
  - `patch.ts` - Git patch operations
  - `permissions.ts` - Permission management
  - `git.ts` - Git operations
  - `hooks.ts` - Hook system
  - `native/` - Native tool implementations

### MCP Integration

- `src/integrations/` - External integrations
  - `mcp.ts` - Model Context Protocol integration
  - `proxy.ts` - OpenAI-compatible proxy

### Memory & Persistence

- `src/memory/` - Conversation memory system
- `src/persistence/` - Data persistence layer

### Commands & Styles

- `src/commands/` - Custom command system
- `src/slash/` - Slash command processing
- `src/styles/` - Output style management

### Infrastructure

- `src/runtime/` - Runtime orchestration
- `src/permissions/` - Permission system
- `src/policies/` - Security policies
- `src/platform/` - Platform detection and compatibility

### Testing

- `src/__tests__/` - Test suite (119 test files)
  - Unit tests, integration tests, component tests
  - Test helpers and utilities
  - Mock implementations

## Configuration Files

- Multiple Jest configurations for different test scenarios
- TypeScript configurations for main code and tests
- Docker configurations for containerized deployment

## Data Directories

- `.plato/` - Local Plato data directory
  - `session.json` - Session state
  - `mcp-servers.json` - MCP server configuration
  - `patch-journal.json` - Patch history
  - `memory/` - Conversation memory storage
  - `commands/` - Custom commands
  - `styles/` - Custom output styles

## Build Output

- `dist/` - Compiled TypeScript output
- Binary entry point: `dist/cli.js`
