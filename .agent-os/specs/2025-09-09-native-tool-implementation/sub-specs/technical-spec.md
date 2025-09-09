# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-09-native-tool-implementation/spec.md

## Technical Requirements

### Core Tool Implementations

- **File System Tools**
  - `Read`: Synchronous and async file reading with encoding detection, binary handling, line ranges
  - `Write`: Atomic writes with backup, encoding handling, directory creation, permission preservation
  - `Edit/Replace`: Line-based and pattern-based editing with diff generation, conflict detection
  - `List/Glob`: Directory listing with glob patterns, hidden files, sorting, stat information
  - `Mkdir/Rmdir`: Recursive directory operations with permission handling
  - `Delete`: Safe deletion with confirmation for non-empty directories
  - `Move/Rename`: Atomic moves with cross-device support, conflict handling
  - `Search/Find`: Ripgrep-based searching with regex, file type filters, context lines

- **Process Execution Tools**
  - `Bash/Exec`: Shell command execution with streaming stdout/stderr
  - Process lifecycle management with proper signal handling (SIGTERM, SIGKILL)
  - Working directory management and environment variable injection
  - Timeout enforcement with configurable limits per tool
  - Exit code preservation and error stream capture

### ToolExecutor Architecture

```typescript
interface ToolExecutor {
  execute(tool: ToolCall): Promise<ToolResponse>;
  stream(tool: ToolCall): AsyncGenerator<ToolEvent>;
  cancel(executionId: string): Promise<void>;
  getCapabilities(): ToolCapabilities[];
}

class NativeToolExecutor implements ToolExecutor {
  private readonly tools: Map<string, NativeTool>;
  private readonly fallback: MCPBridge;
  private readonly config: ToolConfig;
  
  // Execution with automatic fallback
  async execute(call: ToolCall): Promise<ToolResponse> {
    const tool = this.tools.get(call.name);
    if (tool && !this.config.forceMCP) {
      return tool.execute(call.arguments);
    }
    return this.fallback.execute(call);
  }
}
```

### Streaming Infrastructure

- **Event Types**: `stdout`, `stderr`, `progress`, `metadata`, `error`, `complete`
- **Chunk Size**: 4KB default with configurable override
- **Buffering**: Line-buffered for text, unbuffered for binary
- **Ordering**: Guaranteed event order with sequence numbers
- **Backpressure**: Consumer-controlled flow with pause/resume
- **Cancellation**: Immediate stream termination with cleanup

### Error Handling & Retry Logic

```typescript
enum ErrorClass {
  TRANSIENT = 'transient',    // Retryable
  PERMANENT = 'permanent',    // Non-retryable
  VALIDATION = 'validation',  // Input error
  PERMISSION = 'permission',  // Access denied
  TIMEOUT = 'timeout',        // Execution timeout
}

interface ToolError {
  class: ErrorClass;
  code: string;              // e.g., 'ENOENT', 'EAGAIN'
  message: string;           // Human-readable
  details?: any;             // Tool-specific
  retryable: boolean;
  retryAfter?: number;       // Milliseconds
}

// Retry policy matching Claude Code
const RETRY_POLICY = {
  maxAttempts: 3,
  backoff: 'exponential',
  initialDelay: 100,
  maxDelay: 5000,
  jitter: true,
  retryableErrors: ['EAGAIN', 'ETIMEDOUT', 'ECONNRESET'],
};
```

### Security & Sandboxing

- **Workspace Root**: Enforced boundary for all file operations
- **Path Normalization**: Resolve symlinks, prevent traversal attacks
- **Permission Model**: Read/write/execute checks before operations
- **Resource Limits**:
  - Max file size: 100MB for reads, 50MB for writes
  - Max directory depth: 50 levels
  - Max glob results: 10,000 files
  - Process memory: 512MB default
  - Process CPU time: 30 seconds default

### Telemetry & Monitoring

```typescript
interface ToolTelemetry {
  tool: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: ToolError;
  bytesRead?: number;
  bytesWritten?: number;
  exitCode?: number;
  cancelled?: boolean;
}
```

### Performance Requirements

- **Latency**: < 10ms overhead for tool invocation
- **Throughput**: > 100MB/s for file operations
- **Streaming**: < 50ms latency for first byte
- **Concurrency**: Up to 10 parallel tool executions
- **Memory**: < 50MB overhead per tool execution

### Compatibility Matrix

| Tool | Claude Code Version | Arguments | Response Fields | Streaming |
|------|-------------------|-----------|-----------------|-----------|
| Read | 1.0 | path, encoding, lines | content, encoding, size, truncated | No |
| Write | 1.0 | path, content, encoding | success, bytes_written | No |
| Edit | 1.0 | path, pattern, replacement | success, changes, diff | No |
| Bash | 1.0 | command, cwd, env, timeout | stdout, stderr, exit_code | Yes |
| List | 1.0 | path, recursive, glob | files, directories, stats | No |
| Search | 1.0 | pattern, path, regex, context | matches, files, lines | Yes |

### Testing Requirements

- **Unit Tests**: 100% coverage of tool implementations
- **Integration Tests**: End-to-end tool execution flows
- **Parity Tests**: Side-by-side comparison with Claude Code
- **Performance Tests**: Latency and throughput benchmarks
- **Security Tests**: Sandboxing and permission enforcement
- **Stress Tests**: High concurrency and resource limits