# Plato Architecture Patterns and Guidelines

## Core Architecture Principles

### 1. TUI-First Design

- Built with React + Ink for terminal user interfaces
- Cross-platform compatibility (Linux, WSL, Docker, CI environments)
- Progressive enhancement from basic CLI to rich TUI
- Mouse mode enabled by default for better copy/paste support

### 2. AI Provider Integration

- OAuth device flow for GitHub Copilot authentication
- Streaming responses with eventsource-parser
- Fallback provider system for resilience
- Token management with OS keychain integration

### 3. MCP (Model Context Protocol) Integration

- Tool-call bridge system with JSON communication
- Permission-based tool execution
- Server attachment/detachment at runtime
- Results integration into conversation flow

### 4. Memory and Session Management

- Persistent conversation memory with auto-save
- Session restoration capabilities
- Smart compaction for long conversations
- Cross-session context preservation

## Key Design Patterns

### 1. Provider Pattern

```typescript
// Base provider interface
interface ChatProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<string>;
}

// Concrete implementations
class CopilotProvider implements ChatProvider
class ChatFallbackProvider implements ChatProvider
```

### 2. Orchestrator Pattern

- Central runtime orchestrator manages conversation flow
- Coordinates between TUI, AI providers, and tools
- Handles patch extraction and application
- Manages hooks and security reviews

### 3. Command Pattern

- Slash command system with pluggable handlers
- Custom command support with JSON configuration
- Permission-based command execution
- Command palette for discovery

### 4. State Management

- React hooks for TUI state management
- Session persistence to `.plato/session.json`
- Configuration management with environment support
- Keyboard state management for complex input handling

## File Organization Patterns

### 1. Feature-Based Organization

- `src/providers/` - AI integration
- `src/tui/` - Terminal UI components
- `src/tools/` - Tool implementations
- `src/memory/` - Persistence layer
- `src/integrations/` - External system integration

### 2. Layered Architecture

- **Presentation Layer**: TUI components and styling
- **Application Layer**: Orchestrator and command handlers
- **Domain Layer**: Core business logic and providers
- **Infrastructure Layer**: File system, network, Git operations

### 3. Plugin Architecture

- MCP servers as external tools
- Custom commands as configuration
- Output styles as pluggable formatting
- Hook system for extensibility

## Error Handling Patterns

### 1. Graceful Degradation

- TUI falls back to basic CLI on terminal limitations
- AI provider fallback chain for resilience
- Permission system with user prompts
- Cross-platform compatibility handling

### 2. Retry Logic

- Exponential backoff for MCP tool calls (502/503/504/429 errors)
- Automatic credential refresh when expired
- Git operation retry with clear error messages

### 3. User-Friendly Error Messages

- Terminal environment detection with guidance
- Clear error messages for missing dependencies
- Diagnostic scripts for troubleshooting

## Performance Patterns

### 1. Lazy Loading

- Progressive loading of TUI components
- On-demand tool loading
- Memory compaction for long conversations

### 2. Caching Strategies

- Configuration caching
- Session state persistence
- Memory auto-save with intervals

### 3. Resource Management

- <50ms input latency target
- 60fps scrolling performance
- <50MB memory usage when idle
- Efficient virtual scrolling for large conversations

## Security Patterns

### 1. Permission System

- Tool execution requires explicit permissions
- User confirmation for sensitive operations
- Audit logging for security review
- Profile-based permission management

### 2. Credential Management

- OS keychain integration when available
- Fallback to secure file storage
- Token refresh automation
- No credential logging or exposure

### 3. Patch Safety

- Git repository requirement for patch operations
- Dry-run validation before applying patches
- Patch journal for rollback capability
- Whitespace handling for clean application

## Integration Patterns

### 1. Git Integration

- Requires initialized Git repository
- Uses `git apply` for patch operations
- Maintains patch journal for history
- Supports dry-run and revert operations

### 2. External Tool Integration

- MCP server communication via HTTP
- JSON-based tool call protocol
- Server lifecycle management
- Result integration into conversation

### 3. Cross-Platform Support

- Terminal capability detection
- Environment-specific optimizations
- WSL and Docker compatibility
- CI/CD environment handling

## Testing Patterns

### 1. Comprehensive Test Strategy

- 119 test files covering all aspects
- Multiple Jest configurations for different scenarios
- Unit, integration, and e2e test separation
- Performance regression testing

### 2. Mock Strategy

- TUI component mocking with ink-testing-library
- Provider mocking for isolated testing
- File system operation mocking
- Network request mocking

### 3. Test Organization

- Feature-based test organization
- Shared test utilities and helpers
- Custom Jest matchers for domain-specific assertions
- Coverage reporting with thresholds
