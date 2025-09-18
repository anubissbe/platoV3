# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-08-advanced-permissions-system/spec.md

## Technical Requirements

### Core Architecture

- **Profile-Based Permission System**: Implement a ProfileManager class that manages multiple permission profiles with automatic context detection based on git branch, current directory, and environment variables
- **Enhanced Rule Engine**: Extend the existing Rule type to support priority levels, expiration times, conditional logic, and advanced pattern matching with regex and glob combinations
- **Audit Logger Service**: Create AuditLogger class with rotating file-based storage, configurable retention, and efficient indexing for quick searches
- **Permission Cache**: Implement an LRU cache for permission decisions to improve performance while maintaining cache invalidation on rule changes
- **Interactive Prompt System**: Build rich confirmation dialogs using Ink components with syntax highlighting for operations, risk indicators, and inline help

### Rule Processing Pipeline

- **Multi-Stage Evaluation**: Process rules through priority sorting, pattern matching, condition evaluation, and conflict resolution stages
- **Rule Inheritance**: Support cascading rules from global → project → profile → temporary overrides with proper precedence
- **Dynamic Rule Loading**: Hot-reload permission configurations without restart using file watchers and event emitters
- **Pattern Compilation**: Pre-compile regex and glob patterns at startup for improved runtime performance

### Safety Mechanisms

- **Protected Path Registry**: Maintain a hardcoded list of critical system paths that cannot be modified regardless of permissions
- **Operation Validation**: Implement pre-flight checks for destructive operations with simulation mode
- **Rate Limiting**: Add configurable rate limits per tool/operation type to prevent automated abuse
- **Rollback System**: Create operation snapshots before execution for potential rollback on permission violations

### UI/UX Enhancements

- **Status Line Integration**: Add permission profile indicator to the existing StatusLine component with color coding for restriction levels
- **Keyboard Shortcuts**: Implement Ctrl+P for profile switching, Ctrl+Shift+P for temporary elevation, and Ctrl+Alt+P for audit view
- **Permission Dashboard**: Create a dedicated `/permissions` view with tabbed interface for rules, profiles, audit logs, and statistics
- **Visual Feedback**: Add permission-denied animations and success confirmations with clear explanations

### Performance Optimization

- **Lazy Loading**: Load permission rules on-demand based on active tools and current working directory
- **Batch Processing**: Group multiple permission checks in the same operation to reduce overhead
- **Async Operations**: Make all permission checks non-blocking with Promise-based API
- **Memory Management**: Implement automatic cleanup of expired temporary permissions and old audit entries

### Integration Points

- **Orchestrator Integration**: Modify RuntimeOrchestrator to check permissions before tool execution with proper error propagation
- **MCP Server Permissions**: Extend MCP bridge to support per-server and per-tool permission controls
- **Git Integration**: Read .gitignore patterns to automatically suggest protected paths
- **Config System**: Enhance the existing config system to support profile definitions and switching

## External Dependencies

While the implementation will primarily use existing dependencies, we'll add one optional enhancement:

- **minimatch** (^9.0.0) - Advanced glob pattern matching beyond the basic glob support
  - **Justification:** Provides more sophisticated pattern matching including negative patterns, brace expansion, and extended globbing needed for enterprise-grade path rules. This is already used in many places in the Node.js ecosystem and adds minimal overhead.

## File Structure

```
src/permissions/
├── index.ts                 # Main permissions API
├── ProfileManager.ts        # Profile management and switching
├── RuleEngine.ts           # Advanced rule processing
├── AuditLogger.ts          # Audit logging service
├── PermissionCache.ts      # LRU cache implementation
├── SafetyGuard.ts          # Protected paths and validations
├── types.ts                # TypeScript interfaces
└── __tests__/              # Comprehensive test suite

src/tui/components/
├── PermissionPrompt.tsx    # Interactive confirmation dialog
├── PermissionDashboard.tsx # Permission management UI
└── ProfileIndicator.tsx    # Status line profile indicator
```

## Configuration Schema

```yaml
permissions:
  version: 2 # New schema version

  profiles:
    development:
      description: "Relaxed permissions for local development"
      activation:
        branch_pattern: "feature/*|develop"
        env: NODE_ENV=development
      defaults:
        fs_write: allow
        exec: confirm
      rules: [...]

    production:
      description: "Strict permissions for production"
      activation:
        branch_pattern: "main|master|release/*"
        env: NODE_ENV=production
      defaults:
        fs_write: deny
        exec: deny
      rules: [...]

  global_rules:
    - match:
        tool: fs_*
        path: "**/.env*"
      action: deny
      priority: 100
      reason: "Environment files are always protected"

  protected_paths:
    - "~/.ssh/**"
    - "**/node_modules/**"
    - "**/.git/**"

  audit:
    enabled: true
    retention_days: 90
    log_level: info

  rate_limits:
    fs_write: 10/minute
    exec: 5/minute
```
