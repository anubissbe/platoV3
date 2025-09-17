# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-15-claude-code-parity/spec.md

## Command API Endpoints

### Slash Command Router API

#### POST /commands/execute
**Purpose:** Central command execution endpoint for all slash commands
**Parameters:**
- `command`: string - The slash command (e.g., "/help", "/edit")
- `args`: string[] - Command arguments
- `context`: object - Current session context
**Response:**
```json
{
  "handled": true,
  "output": "Command output or result",
  "error": null,
  "requiresConfirmation": false
}
```
**Errors:**
- `COMMAND_NOT_FOUND`: Unknown command
- `INVALID_ARGS`: Missing or invalid arguments
- `PERMISSION_DENIED`: Insufficient permissions

### File Operations API

#### GET /files/read
**Purpose:** Read file contents for editing or viewing
**Parameters:**
- `path`: string - Absolute or relative file path
- `encoding`: string - File encoding (default: utf-8)
**Response:** File content as string or base64
**Errors:** `FILE_NOT_FOUND`, `PERMISSION_DENIED`

#### POST /files/write
**Purpose:** Write or update file contents directly
**Parameters:**
- `path`: string - File path
- `content`: string - New file content
- `createIfNotExists`: boolean
**Response:** Success status with file metadata
**Errors:** `WRITE_FAILED`, `PERMISSION_DENIED`

#### POST /files/search
**Purpose:** Search for patterns in codebase
**Parameters:**
- `pattern`: string - Search pattern (regex or literal)
- `glob`: string - File glob pattern (optional)
- `maxResults`: number - Limit results
**Response:** Array of matches with file, line, and context
**Errors:** `INVALID_PATTERN`, `SEARCH_TIMEOUT`

### Command Execution API

#### POST /execute/run
**Purpose:** Execute shell commands
**Parameters:**
- `command`: string - Shell command to execute
- `cwd`: string - Working directory
- `env`: object - Environment variables
**Response:** Command output, exit code, and execution time
**Errors:** `COMMAND_FAILED`, `TIMEOUT`, `PERMISSION_DENIED`

#### POST /execute/test
**Purpose:** Run test suites
**Parameters:**
- `framework`: string - Test framework (auto-detect if null)
- `pattern`: string - Test file pattern
- `coverage`: boolean - Include coverage report
**Response:** Test results, failures, and coverage data
**Errors:** `NO_TESTS_FOUND`, `TEST_RUNNER_ERROR`

### Git Operations API

#### GET /git/status
**Purpose:** Get repository status
**Response:** Modified files, staged changes, branch info
**Errors:** `NOT_A_REPOSITORY`

#### POST /git/commit
**Purpose:** Create a commit
**Parameters:**
- `message`: string - Commit message
- `files`: string[] - Files to stage (optional, all if empty)
**Response:** Commit hash and summary
**Errors:** `NO_CHANGES`, `COMMIT_FAILED`

## Integration Points

### MCP Server Integration
- Commands can invoke MCP tools through existing bridge
- Results are formatted consistently across native and MCP commands
- Permissions apply to both native commands and MCP tools

### Session Context
- All commands have access to current session state
- Command history is maintained for autocomplete
- User preferences are respected (e.g., auto-apply mode)

### Error Handling
- Consistent error format across all endpoints
- User-friendly error messages with suggested fixes
- Automatic retry logic for transient failures