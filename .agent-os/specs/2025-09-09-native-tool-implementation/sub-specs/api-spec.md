# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-09-native-tool-implementation/spec.md

## Tool Call Interface

### Base Tool Call Format

```typescript
interface ToolCall {
  id: string;                    // Unique execution ID
  name: string;                   // Tool name (e.g., 'Read', 'Bash')
  arguments: Record<string, any>; // Tool-specific arguments
  metadata?: {
    timestamp: number;
    sessionId: string;
    requestId: string;
  };
}

interface ToolResponse {
  id: string;                    // Matches request ID
  success: boolean;
  result?: any;                  // Tool-specific result
  error?: ToolError;
  metadata: {
    duration: number;            // Milliseconds
    timestamp: number;
    tool: string;
  };
}
```

## File System Tools API

### Read Tool

```typescript
// Request
{
  name: 'Read',
  arguments: {
    path: string;               // File path (required)
    encoding?: string;          // 'utf8' (default), 'base64', 'binary'
    start?: number;             // Start line (1-indexed)
    end?: number;               // End line (inclusive)
  }
}

// Response
{
  success: true,
  result: {
    content: string;            // File content
    encoding: string;           // Actual encoding used
    size: number;               // File size in bytes
    lines?: number;             // Total line count
    truncated: boolean;         // If content was truncated
  }
}
```

### Write Tool

```typescript
// Request
{
  name: 'Write',
  arguments: {
    path: string;               // File path (required)
    content: string;            // Content to write (required)
    encoding?: string;          // 'utf8' (default), 'base64'
    createDirectories?: boolean; // Create parent dirs (default: true)
    mode?: number;              // File permissions (default: 0644)
  }
}

// Response
{
  success: true,
  result: {
    bytesWritten: number;       // Bytes written
    created: boolean;           // New file vs overwrite
    backup?: string;            // Backup file path if created
  }
}
```

### Edit/Replace Tool

```typescript
// Request
{
  name: 'Edit',
  arguments: {
    path: string;               // File path (required)
    pattern: string;            // Search pattern (required)
    replacement: string;        // Replacement text (required)
    regex?: boolean;            // Use regex (default: false)
    multiline?: boolean;        // Multiline mode (default: false)
    all?: boolean;              // Replace all (default: false)
  }
}

// Response
{
  success: true,
  result: {
    changes: number;            // Number of replacements
    diff: string;               // Unified diff of changes
    backup: string;             // Backup file path
  }
}
```

### List/Glob Tool

```typescript
// Request
{
  name: 'List',
  arguments: {
    path: string;               // Directory or glob pattern (required)
    recursive?: boolean;        // Recursive listing (default: false)
    includeDotfiles?: boolean;  // Include hidden files (default: false)
    stats?: boolean;            // Include file stats (default: false)
    sort?: 'name' | 'size' | 'modified'; // Sort order
    limit?: number;             // Max results
  }
}

// Response
{
  success: true,
  result: {
    files: Array<{
      path: string;
      name: string;
      type: 'file' | 'directory' | 'symlink';
      size?: number;            // If stats requested
      modified?: number;        // Unix timestamp
      permissions?: string;     // e.g., 'rwxr-xr-x'
    }>;
    truncated: boolean;         // If limit exceeded
    totalCount: number;         // Total before limit
  }
}
```

## Process Execution Tools API

### Bash/Exec Tool

```typescript
// Request
{
  name: 'Bash',
  arguments: {
    command: string;            // Command to execute (required)
    cwd?: string;               // Working directory
    env?: Record<string, string>; // Environment variables
    timeout?: number;           // Timeout in milliseconds
    shell?: string;             // Shell to use (default: '/bin/bash')
    stream?: boolean;           // Stream output (default: true)
  }
}

// Streaming Response Events
{
  type: 'stdout' | 'stderr' | 'exit',
  data?: string;                // Output chunk
  exitCode?: number;            // On exit event
  signal?: string;              // If killed by signal
  timestamp: number;
  sequence: number;             // Event sequence number
}

// Final Response
{
  success: true,
  result: {
    stdout: string;             // Complete stdout
    stderr: string;             // Complete stderr
    exitCode: number;           // Process exit code
    signal?: string;            // Termination signal
    duration: number;           // Execution time
    timedOut: boolean;          // If timeout triggered
  }
}
```

## Search/Find Tool

```typescript
// Request
{
  name: 'Search',
  arguments: {
    pattern: string;            // Search pattern (required)
    path?: string;              // Search path (default: cwd)
    regex?: boolean;            // Use regex (default: false)
    caseSensitive?: boolean;    // Case sensitive (default: false)
    filePattern?: string;       // File glob filter
    contextLines?: number;      // Context lines (default: 0)
    maxResults?: number;        // Result limit
  }
}

// Response
{
  success: true,
  result: {
    matches: Array<{
      file: string;             // File path
      line: number;             // Line number
      column: number;           // Column number
      match: string;            // Matched text
      context?: {               // If context requested
        before: string[];
        after: string[];
      };
    }>;
    filesSearched: number;
    filesMatched: number;
    totalMatches: number;
    truncated: boolean;
  }
}
```

## Directory Operation Tools API

### Mkdir Tool

```typescript
// Request
{
  name: 'Mkdir',
  arguments: {
    path: string;               // Directory path (required)
    recursive?: boolean;        // Create parents (default: true)
    mode?: number;              // Permissions (default: 0755)
  }
}

// Response
{
  success: true,
  result: {
    created: string[];          // Directories created
    existed: string[];          // Already existed
  }
}
```

### Delete Tool

```typescript
// Request
{
  name: 'Delete',
  arguments: {
    path: string;               // Path to delete (required)
    recursive?: boolean;        // Delete contents (default: false)
    force?: boolean;            // Skip confirmation (default: false)
  }
}

// Response
{
  success: true,
  result: {
    deleted: string[];          // Paths deleted
    type: 'file' | 'directory';
    size: number;               // Total bytes freed
  }
}
```

### Move/Rename Tool

```typescript
// Request
{
  name: 'Move',
  arguments: {
    source: string;             // Source path (required)
    destination: string;        // Destination path (required)
    overwrite?: boolean;        // Overwrite existing (default: false)
  }
}

// Response
{
  success: true,
  result: {
    moved: boolean;
    type: 'file' | 'directory';
    oldPath: string;
    newPath: string;
    overwritten: boolean;
  }
}
```

## Error Response Format

```typescript
interface ToolError {
  class: 'transient' | 'permanent' | 'validation' | 'permission' | 'timeout';
  code: string;                 // Standard error code (e.g., 'ENOENT')
  message: string;              // Human-readable message
  details?: {
    path?: string;              // Affected path
    operation?: string;         // Failed operation
    errno?: number;             // System error number
    syscall?: string;           // System call
  };
  retryable: boolean;
  retryAfter?: number;          // Milliseconds to wait
}

// Example Error Response
{
  success: false,
  error: {
    class: 'permission',
    code: 'EACCES',
    message: 'Permission denied: cannot write to /etc/passwd',
    details: {
      path: '/etc/passwd',
      operation: 'write',
      errno: 13,
      syscall: 'open'
    },
    retryable: false
  },
  metadata: {
    duration: 5,
    timestamp: 1699564234567,
    tool: 'Write'
  }
}
```

## WebSocket Streaming Protocol

For tools that support streaming (Bash, Search), a WebSocket connection can be established:

```typescript
// WebSocket URL
ws://localhost:<port>/tools/stream/<execution-id>

// Message Types
interface StreamMessage {
  type: 'start' | 'data' | 'error' | 'complete';
  execution_id: string;
  sequence: number;
  timestamp: number;
  data?: {
    stream?: 'stdout' | 'stderr';
    content?: string;
    progress?: number;          // 0-100
    metadata?: any;
  };
  error?: ToolError;
}

// Client Control Messages
interface ControlMessage {
  type: 'pause' | 'resume' | 'cancel';
  execution_id: string;
}
```

## HTTP REST Endpoints (For Testing/Debug)

### POST /tools/execute
Execute a tool synchronously

**Request:**
```json
{
  "tool": "Read",
  "arguments": {
    "path": "/etc/hosts"
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "content": "127.0.0.1 localhost",
    "encoding": "utf8",
    "size": 19,
    "truncated": false
  },
  "metadata": {
    "duration": 12,
    "timestamp": 1699564234567,
    "tool": "Read"
  }
}
```

### GET /tools/capabilities
List available tools and their schemas

**Response:**
```json
{
  "tools": [
    {
      "name": "Read",
      "description": "Read file contents",
      "streaming": false,
      "schema": { /* JSON Schema */ }
    },
    {
      "name": "Bash",
      "description": "Execute shell commands",
      "streaming": true,
      "schema": { /* JSON Schema */ }
    }
  ]
}
```

### DELETE /tools/cancel/:execution_id
Cancel a running tool execution

**Response:**
```json
{
  "cancelled": true,
  "execution_id": "exec_123456"
}
```