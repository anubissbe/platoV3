# Plato API Reference

## Overview

This document provides comprehensive API documentation for all major components and systems in the Plato project, covering the core runtime, TUI components, tool systems, and integration layers.

## Core Systems

### Runtime Orchestrator (`src/runtime/orchestrator.ts`)

The central coordination system that manages conversation flow, tool calls, and AI provider integrations.

#### Main Functions

**`respond(input: string): Promise<string>`**
- Processes user input and generates AI responses
- Handles streaming responses and tool calls
- Manages conversation memory and context
- **Parameters**: `input` - User input string to process
- **Returns**: Promise resolving to AI response text
- **Throws**: Error on provider failures or configuration issues

**`respondStream(input: string): AsyncGenerator<string>`**
- Provides streaming response generation for real-time UI updates
- Yields response chunks as they arrive from AI providers
- **Parameters**: `input` - User input string to process
- **Returns**: Async generator yielding response chunks

**`cancelStream(): void`**
- Cancels any active streaming response
- Safe to call multiple times
- **Side Effects**: Stops current streaming operation immediately

**`setTranscriptMode(enabled: boolean): Promise<void>`**
- Controls transcript mode for conversation logging
- **Parameters**: `enabled` - Whether to enable transcript mode
- **Side Effects**: Updates internal state and persistence

**`isTranscriptMode(): boolean`**
- **Returns**: Current transcript mode status

**`setBackgroundMode(enabled: boolean): void`**
- Controls background processing mode
- **Parameters**: `enabled` - Whether to enable background mode

**`isBackgroundMode(): boolean`**
- **Returns**: Current background mode status

**`getMessageHistory(): Promise<ConversationMessage[]>`**
- **Returns**: Array of conversation messages from memory

**`selectHistoryMessage(index: number): Promise<string | null>`**
- Retrieves a specific message from history
- **Parameters**: `index` - Zero-based index of message to retrieve
- **Returns**: Message content or null if not found

**`addConversationMessage(message: ConversationMessage): void`**
- Adds a message to conversation history
- **Parameters**: `message` - Message object to add

#### Types

```typescript
interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    duration?: number;
  };
}

interface OrchestratorMetrics {
  totalMessages: number;
  tokensUsed: number;
  averageResponseTime: number;
}
```

### Patch System (`src/tools/patch.ts`)

Git-based patch operations with security validation and rollback capabilities.

#### Core Functions

**`dryRunApply(diff: UnifiedDiff): Promise<{ok: boolean; conflicts: string[]}>`**
- Validates patch applicability without making changes
- **Parameters**: `diff` - Unified diff string to validate
- **Returns**: Validation result with conflict information
- **Security**: Uses sanitized diff input to prevent path traversal

**`apply(diff: UnifiedDiff): Promise<void>`**
- Applies a patch to the working directory with journaling
- **Parameters**: `diff` - Unified diff string to apply
- **Side Effects**: Modifies files, updates patch journal
- **Throws**: Error on Git failures or conflicts

**`revert(id: string): Promise<void>`**
- Reverts a specific patch by journal ID
- **Parameters**: `id` - Patch journal entry ID
- **Side Effects**: Reverts file changes, updates journal

**`revertLast(): Promise<void>`**
- Reverts the most recently applied patch
- **Side Effects**: Reverts file changes, updates journal
- **Throws**: Error if no patches to revert

**`getSimpleGit(): SimpleGit`**
- **Returns**: Configured SimpleGit instance for repository operations

#### Security Functions

**`sanitizeDiff(diff: string): string`** *(Internal)*
- Validates and sanitizes unified diff content
- **Security Features**:
  - Path traversal protection (`../` detection)
  - Null byte filtering
  - Binary content rejection
  - Malformed header detection
- **Parameters**: `diff` - Raw diff string
- **Returns**: Sanitized diff string
- **Throws**: Error on security violations

#### Types

```typescript
type UnifiedDiff = string;

interface PatchJournalEntry {
  id: string;
  timestamp: number;
  originalDiff: string;
  appliedFiles: string[];
  reverseDiff: string;
}
```

### Memory System (`src/memory/manager.ts`)

Persistent conversation memory with intelligent compaction and cross-session continuity.

#### Core Functions

**`loadSession(): Promise<SessionData | null>`**
- Loads session data from persistent storage
- **Returns**: Session data or null if not found

**`saveSession(data: SessionData): Promise<void>`**
- Saves current session data to persistent storage
- **Parameters**: `data` - Session data to persist

**`compactMemory(focusArea?: string): Promise<void>`**
- Performs intelligent memory compaction
- **Parameters**: `focusArea` - Optional focus area for selective compaction

**`getMemoryUsage(): MemoryUsage`**
- **Returns**: Current memory usage statistics

#### Types

```typescript
interface SessionData {
  messages: ConversationMessage[];
  lastAccessed: number;
  metadata: SessionMetadata;
}

interface SessionMetadata {
  model: string;
  provider: string;
  startTime: number;
  messageCount: number;
}

interface MemoryUsage {
  totalMessages: number;
  memorySize: number;
  lastCompaction: number;
}
```

## TUI Components

### App Component (`src/tui/keyboard-handler.tsx`)

Main application component managing TUI state and user interactions.

#### State Management

**KeyboardState Interface**
```typescript
interface KeyboardState {
  input: string;                    // Current input text
  multiLineInput: string[];         // Multi-line input buffer
  isMultiLine: boolean;            // Multi-line mode flag
  escapeCount: number;             // Escape key press counter
  escapeTimeout: NodeJS.Timeout | null;  // Escape timeout handler
  transcriptMode: boolean;         // Transcript logging mode
  backgroundMode: boolean;         // Background processing mode
  historyMode: boolean;           // History navigation mode
  selectedHistoryIndex: number;    // Current history index
  messageHistory: Array<{role: string; content: string}>; // Message cache
  isCommandPaletteOpen: boolean;   // Command palette state
  mouseMode: boolean;             // Mouse interaction mode
  pasteBuffer: string;            // Paste detection buffer
  pasteTimeout: NodeJS.Timeout | null;  // Paste timeout handler
  pasteMode: boolean;             // Paste mode for copy/paste operations
}
```

#### Environment Configuration

**Environment Variables**
- `PLATO_PARITY_MODE`: Disables mouse mode for Claude parity (`"1"`)
- `PLATO_STATIC_TUI`: Enables static TUI for Windows Terminal (`"1"`)
- `PLATO_QUIET_TUI`: Reduces animations for performance (`"1"`)

### Header Component (`src/tui/components/Header.tsx`)

Displays application status, current model, and connection information.

#### Props

```typescript
interface HeaderProps {
  status: string;                  // Connection status
  model: string;                   // Active AI model
  branch?: string;                // Git branch name
  sessionTime: Date;              // Session start time
}
```

### ConversationArea Component (`src/tui/components/ConversationArea.tsx`)

Renders conversation messages with syntax highlighting and formatting.

#### Props

```typescript
interface ConversationAreaProps {
  messages: ConversationMessage[]; // Messages to display
  streamingMessage?: StreamingConversationMessage; // Active streaming message
  height: number;                 // Component height
  width: number;                  // Component width
}
```

### InputArea Component (`src/tui/components/InputArea.tsx`)

Handles user input with multi-line support and command detection.

#### Props

```typescript
interface InputAreaProps {
  value: string;                  // Current input value
  onChange: (value: string) => void; // Input change handler
  onSubmit: () => void;          // Form submission handler
  multiLine: boolean;            // Multi-line mode flag
  placeholder?: string;          // Placeholder text
}
```

## Provider Integration

### Copilot Provider (`src/providers/copilot.ts`)

GitHub Copilot API integration with OAuth device flow authentication.

#### Authentication Functions

**`getAuthInfo(): Promise<AuthInfo>`**
- **Returns**: Current authentication status and user information

**`initiateDeviceFlow(): Promise<DeviceFlowResponse>`**
- Initiates OAuth device flow for authentication
- **Returns**: Device code and verification URL

**`pollForToken(deviceCode: string): Promise<TokenResponse>`**
- Polls for authentication token completion
- **Parameters**: `deviceCode` - Device code from flow initiation

**`refreshToken(): Promise<TokenResponse>`**
- Refreshes expired authentication token
- **Side Effects**: Updates stored credentials

#### API Functions

**`getAvailableModels(): Promise<Model[]>`**
- **Returns**: List of available AI models

**`providerFetch(endpoint: string, options?: RequestInit): Promise<Response>`**
- Makes authenticated requests to Copilot API
- **Parameters**: `endpoint` - API endpoint, `options` - Request options
- **Returns**: HTTP response with authentication headers

#### Types

```typescript
interface AuthInfo {
  loggedIn: boolean;
  user?: string;
  expiresAt?: number;
}

interface Model {
  id: string;
  name: string;
  maxTokens?: number;
  features?: string[];
}
```

### Chat Provider (`src/providers/chat.ts`)

Unified chat completion interface supporting multiple AI providers.

#### Functions

**`chatCompletions(messages: Message[], options?: ChatOptions): Promise<ChatResponse>`**
- **Parameters**: `messages` - Conversation messages, `options` - Request options
- **Returns**: Complete chat response

**`chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>`**
- **Parameters**: `messages` - Conversation messages, `options` - Request options
- **Returns**: Streaming response chunks

#### Types

```typescript
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface ChatResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}
```

## Tool Integration

### MCP Bridge (`src/integrations/mcp.ts`)

Model Context Protocol server integration for extended tool capabilities.

#### Functions

**`callTool(server: string, name: string, input: any): Promise<any>`**
- Calls a tool on an MCP server
- **Parameters**: `server` - Server identifier, `name` - Tool name, `input` - Tool input
- **Returns**: Tool execution result

**`listTools(server?: string): Promise<Tool[]>`**
- Lists available tools from MCP servers
- **Parameters**: `server` - Optional server filter
- **Returns**: Array of available tools

**`attachServer(name: string, url: string): Promise<void>`**
- Attaches an MCP server for tool usage
- **Parameters**: `name` - Server name, `url` - Server URL
- **Side Effects**: Updates server registry

**`detachServer(name: string): Promise<void>`**
- Removes an MCP server from registry
- **Parameters**: `name` - Server name to remove

#### Types

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  server: string;
}

interface ToolCall {
  server: string;
  name: string;
  input: any;
}
```

### Permission System (`src/tools/permissions.ts`)

Fine-grained permission control for tool access and file operations.

#### Functions

**`checkPermission(query: PermissionQuery): Promise<PermissionResult>`**
- **Parameters**: `query` - Permission check query
- **Returns**: Permission decision with context

**`grantPermission(query: PermissionQuery): Promise<void>`**
- Grants permission for specific operation
- **Side Effects**: Updates permission registry

**`revokePermission(query: PermissionQuery): Promise<void>`**
- Revokes previously granted permission
- **Side Effects**: Updates permission registry

#### Types

```typescript
interface PermissionQuery {
  type: "fs_read" | "fs_write" | "fs_patch" | "tool_call";
  target: string;
  context?: any;
}

type PermissionResult = "allow" | "deny" | "prompt";
```

## Configuration System

### Configuration (`src/config.ts`)

Centralized configuration management with validation and type safety.

#### Functions

**`loadConfig(): Promise<Config>`**
- Loads configuration from files and environment
- **Returns**: Validated configuration object

**`setConfigValue(key: string, value: any): Promise<void>`**
- Updates configuration value with persistence
- **Parameters**: `key` - Configuration key, `value` - New value
- **Side Effects**: Updates config file

**`getConfigPath(): string`**
- **Returns**: Path to active configuration file

#### Configuration Schema

```typescript
interface Config {
  provider: {
    active: string;
    copilot: {
      base_url: string;
      chat_path: string;
    };
    gitlab: {
      base_url?: string;
      token?: string;
    };
  };
  model: {
    active: string;
    options: {
      temperature: number;
      max_tokens: number;
    };
  };
  ui: {
    theme: string;
    mouse_mode: boolean;
    paste_threshold: number;
  };
  memory: {
    auto_save: boolean;
    compaction_interval: number;
    max_messages: number;
  };
}
```

## Slash Commands

### Command System (`src/slash/commands.ts`)

Built-in slash commands for TUI interaction and system control.

#### Core Commands

**`/help`**
- Displays help information and available commands

**`/login`**
- Initiates authentication flow for AI providers

**`/logout`**
- Clears authentication and logs out

**`/status`**
- Shows current authentication and configuration status

**`/model [model-id]`**
- Lists available models or switches to specified model

**`/apply`**
- Applies pending patches to working directory

**`/revert`**
- Reverts last applied patch

**`/memory [action]`**
- Memory management operations (view, compact, reset)

**`/resume`**
- Restores last session from memory

#### MCP Commands

**`/mcp attach <name> <url>`**
- Attaches MCP server for tool usage

**`/mcp detach <name>`**
- Removes MCP server from registry

**`/mcp tools`**
- Lists available tools from attached servers

#### Advanced Commands

**`/permissions [action]`**
- Permission management and configuration

**`/compact [focus]`**
- Memory compaction with optional focus area

**`/mouse [on|off|toggle]`**
- Controls mouse mode for terminal interaction

## Error Handling

### Error Types

**`PlatoError`** - Base error class for all Plato-specific errors
**`ConfigError`** - Configuration loading and validation errors
**`ProviderError`** - AI provider communication errors
**`PatchError`** - Git patch operation errors
**`MemoryError`** - Memory system operation errors
**`PermissionError`** - Permission system violations

### Error Recovery

All major systems implement graceful error recovery:

- **Provider Failures**: Automatic retry with exponential backoff
- **Network Issues**: Offline mode with cached responses
- **Memory Errors**: Automatic compaction and cleanup
- **Git Failures**: Rollback to previous state
- **Permission Denials**: User prompt for approval

## Performance Characteristics

### Latency Targets

- **Input Processing**: <50ms from keystroke to response start
- **UI Updates**: 60fps smooth animation and scrolling
- **Memory Operations**: <100ms for save/load operations
- **Tool Calls**: <200ms for local tool execution

### Resource Usage

- **Memory**: <50MB idle, efficient growth with usage
- **CPU**: <30% during normal operation
- **Disk I/O**: Minimal with intelligent caching
- **Network**: Efficient with request batching and compression

### Scalability

- **Conversation Length**: Supports 10,000+ messages with compaction
- **File Operations**: Handles repositories with 100,000+ files
- **Tool Integration**: Supports dozens of concurrent MCP servers
- **Session Persistence**: Multi-gigabyte session data support

## Security Model

### Input Validation

All user inputs undergo comprehensive validation:
- Path traversal prevention
- Null byte filtering
- Command injection protection
- SQL injection prevention
- XSS protection in terminal output

### Authentication Security

- OAuth device flow for secure authentication
- Token encryption using OS keychain
- Automatic token refresh and rotation
- Secure credential storage with access control

### File System Security

- Sandboxed file operations within project directory
- Permission system for sensitive operations
- Git integration with signed commits
- Backup and rollback capabilities

## Integration Guidelines

### Adding New Providers

1. Implement `Provider` interface in `src/providers/`
2. Add authentication flow if required
3. Register in configuration system
4. Add comprehensive test coverage
5. Update documentation and examples

### Creating MCP Tools

1. Follow MCP specification for tool definition
2. Implement proper input validation
3. Add permission checks for sensitive operations
4. Provide comprehensive error handling
5. Include usage examples and documentation

### Extending TUI Components

1. Follow React hooks patterns
2. Use Ink components for terminal compatibility
3. Implement proper keyboard navigation
4. Add accessibility features (screen reader support)
5. Test across different terminal environments

This API reference provides comprehensive coverage of all major systems and interfaces in the Plato project, enabling developers to understand, extend, and integrate with the codebase effectively.