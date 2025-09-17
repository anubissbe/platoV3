# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-17-enhanced-claude-parity/spec.md

> Created: 2025-09-17
> Version: 1.0.0

## Technical Requirements

### 1. Advanced Fuzzy Autocomplete System

**Target Performance**: <50ms response time for command/file suggestions with intelligent ranking

**Architecture Overview**:
- Integration with existing `src/slash/commands.ts` SLASH_COMMANDS array
- Fuse.js-powered fuzzy matching engine with configurable search parameters
- Real-time dropdown component using Ink React framework
- Keyboard navigation system with arrow keys and Enter/Escape handling
- Usage pattern learning through persistent storage in `.plato/autocomplete-history.json`

**Core Components**:

1. **AutocompleteEngine** (`src/autocomplete/engine.ts`)
   ```typescript
   interface AutocompleteEngine {
     search(query: string, type: 'command' | 'file' | 'mixed'): AutocompleteResult[];
     updateUsageStats(item: string, type: string): void;
     getHistory(): UsageHistory;
   }

   interface AutocompleteResult {
     item: string;
     score: number;
     type: 'command' | 'file';
     highlight: HighlightRange[];
     usageCount: number;
     lastUsed: Date;
   }
   ```

2. **AutocompleteProvider** (`src/autocomplete/provider.ts`)
   - Command source: SLASH_COMMANDS array with aliases
   - File source: fast-glob integration with workspace scanning
   - Caching layer with 5-minute TTL for file system scans
   - Pattern filtering for common file types (.ts, .tsx, .js, .jsx, .json, .md)

3. **AutocompleteDropdown** (`src/tui/components/autocomplete-dropdown.tsx`)
   - Ink-based React component with Box and Text elements
   - Maximum 10 visible items with scroll indicators
   - Highlight matching characters using picocolors
   - Keyboard event handling for navigation and selection

**Implementation Details**:

```typescript
// Fuse.js configuration for optimal performance
const fuseOptions = {
  keys: ['name', 'aliases', 'description'],
  threshold: 0.4, // Balance between fuzzy and strict matching
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 1,
  ignoreLocation: true,
  findAllMatches: false,
  maxPatternLength: 32
};

// Usage pattern weighting algorithm
const calculateScore = (fuseScore: number, usageCount: number, lastUsed: Date) => {
  const recencyWeight = Math.max(0, 1 - (Date.now() - lastUsed.getTime()) / (30 * 24 * 60 * 60 * 1000));
  const usageWeight = Math.min(1, Math.log10(usageCount + 1) / 2);
  return fuseScore * 0.6 + usageWeight * 0.25 + recencyWeight * 0.15;
};
```

**Integration Points**:
- Hook into existing TUI keyboard handler (`src/tui/keyboard-handler.tsx`)
- Extend input processing in `handleInput` method
- Trigger on '/' character and file path patterns
- Integrate with existing command execution pipeline

### 2. Enhanced File Watcher (chokidar integration)

**Migration Strategy**: Replace existing `src/tools/file-watcher.ts` fs.watch implementation with chokidar for cross-platform reliability

**Architecture Changes**:

1. **ChokidarFileWatcher** (`src/tools/enhanced-file-watcher.ts`)
   ```typescript
   import chokidar from 'chokidar';

   interface EnhancedWatcherOptions {
     ignored?: string | RegExp | (string | RegExp)[];
     persistent?: boolean;
     ignoreInitial?: boolean;
     followSymlinks?: boolean;
     cwd?: string;
     disableGlobbing?: boolean;
     usePolling?: boolean;
     interval?: number;
     binaryInterval?: number;
     alwaysStat?: boolean;
     depth?: number;
     awaitWriteFinish?: {
       stabilityThreshold: number;
       pollInterval: number;
     };
   }

   interface ExternalChangeEvent extends FileChangeEvent {
     conflictType: 'modification' | 'deletion' | 'creation';
     currentContent?: string;
     externalContent?: string;
     canMerge: boolean;
   }
   ```

2. **Conflict Detection System**
   - Track file modification times and checksums for open files
   - Compare external changes against pending edits
   - Generate conflict metadata for resolution UI

3. **Performance Optimizations**
   - Intelligent ignore patterns (node_modules, .git, dist, build)
   - Debouncing with 150ms default (configurable)
   - File content hashing for change validation
   - Memory-efficient large file handling

**Implementation Strategy**:

```typescript
// Replace existing FileWatcher class
export class EnhancedFileWatcher extends EventEmitter {
  private chokidarWatcher: chokidar.FSWatcher;
  private fileHashes: Map<string, string> = new Map();
  private openFiles: Set<string> = new Set();

  async detectConflicts(filePath: string, pendingContent: string): Promise<ExternalChangeEvent | null> {
    const currentHash = this.fileHashes.get(filePath);
    const currentContent = await fs.readFile(filePath, 'utf8');
    const newHash = this.calculateHash(currentContent);

    if (currentHash && currentHash !== newHash) {
      return {
        type: 'change',
        filename: path.basename(filePath),
        fullPath: filePath,
        timestamp: Date.now(),
        conflictType: 'modification',
        currentContent: pendingContent,
        externalContent: currentContent,
        canMerge: this.canAutoMerge(pendingContent, currentContent)
      };
    }
    return null;
  }
}
```

**Migration Plan**:
1. Create new enhanced-file-watcher.ts alongside existing file-watcher.ts
2. Update imports in edit-tool.ts and slash commands
3. Add backward compatibility layer
4. Remove old implementation after testing

### 3. Dedicated Filesystem Permissions Module

**Security Model**: Fine-grained permission system with user consent prompts

**Core Architecture**:

1. **PermissionManager** (`src/permissions/manager.ts`)
   ```typescript
   interface PermissionRequest {
     operation: FileOperation;
     path: string;
     requester: string;
     timestamp: Date;
     metadata?: Record<string, any>;
   }

   interface PermissionGrant {
     operation: FileOperation;
     scope: 'file' | 'directory' | 'workspace';
     pattern: string;
     expires?: Date;
     conditions?: PermissionCondition[];
   }

   enum FileOperation {
     READ = 'read',
     WRITE = 'write',
     CREATE = 'create',
     DELETE = 'delete',
     EXECUTE = 'execute',
     WATCH = 'watch'
   }
   ```

2. **Permission Storage** (`.plato/permissions.json`)
   - Persistent grants with expiration
   - Pattern-based rules (glob patterns)
   - Operation-specific granularity
   - Audit trail for security reviews

3. **User Consent UI** (`src/tui/components/permission-dialog.tsx`)
   - Interactive Ink-based permission prompts
   - Clear operation description and scope
   - Remember choice option with expiration
   - Always/Never/Just Once buttons

**Integration with Existing Tools**:

```typescript
// Enhanced edit-tool.ts integration
async execute(args: EditToolArgs): Promise<EditToolResponse> {
  // Check permissions before file operations
  const hasPermission = await this.permissionManager.checkPermission({
    operation: FileOperation.WRITE,
    path: normalizedPath,
    requester: 'edit-tool'
  });

  if (!hasPermission) {
    const granted = await this.permissionManager.requestPermission({
      operation: FileOperation.WRITE,
      path: normalizedPath,
      requester: 'edit-tool',
      timestamp: new Date()
    });

    if (!granted) {
      throw new ToolError(ErrorClass.PERMISSION, 'WRITE_DENIED', `Permission denied: ${normalizedPath}`);
    }
  }

  // Continue with existing edit logic...
}
```

**Configuration Options**:
- Workspace-level permission policies
- Developer mode (auto-grant for development)
- Paranoid mode (prompt for all operations)
- Path-based trust patterns

### 4. Multi-File Edit Interface

**Architecture Goal**: Unified editing session with diff preview and undo/redo support

**Core Components**:

1. **MultiFileEditor** (`src/tools/multi-file-editor.ts`)
   ```typescript
   interface EditSession {
     id: string;
     files: Map<string, FileEdit>;
     history: EditHistory[];
     currentIndex: number;
     startTime: Date;
   }

   interface FileEdit {
     originalContent: string;
     currentContent: string;
     changes: EditOperation[];
     isDirty: boolean;
     conflictState?: ConflictState;
   }

   interface EditOperation {
     type: 'insert' | 'delete' | 'replace';
     range: { start: number; end: number };
     content: string;
     timestamp: Date;
   }
   ```

2. **DiffPreview** (`src/tui/components/diff-preview.tsx`)
   - Side-by-side diff visualization using Ink components
   - Unified diff format with + / - indicators
   - Color coding for additions, deletions, and modifications
   - File-by-file navigation with Tab/Shift+Tab

3. **EditHistory** (`src/tools/edit-history.ts`)
   - Command pattern implementation for undo/redo
   - Cross-file operation grouping
   - Memory-efficient delta storage
   - Session persistence for crash recovery

**Enhanced Edit Command**:

```typescript
// Updated slash command: /edit [file1] [file2] [fileN]
{
  name: "edit",
  description: "Edit one or multiple files with diff preview and undo support",
  usage: "<file-path> [additional-files...]",
  execute: async (args: string[]) => {
    const session = await MultiFileEditor.createSession(args);

    // Show initial diff preview
    const diffPreview = new DiffPreview(session);
    await diffPreview.render();

    // Confirmation prompt
    const confirmed = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Apply these changes?',
      initial: false
    });

    if (confirmed.proceed) {
      await session.commit();
      return { output: `Successfully edited ${args.length} files` };
    } else {
      await session.rollback();
      return { output: "Edit cancelled" };
    }
  }
}
```

**Undo/Redo Implementation**:
- Command stack with 50-operation limit
- File-specific and session-wide undo support
- Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y (redo)
- Visual indicators for operation history

### 5. Conflict Resolution System

**Conflict Detection Strategy**: Real-time monitoring with smart merge capabilities

**Core Components**:

1. **ConflictResolver** (`src/tools/conflict-resolver.ts`)
   ```typescript
   interface ConflictResolution {
     strategy: 'merge' | 'overwrite' | 'cancel' | 'custom';
     mergedContent?: string;
     conflictMarkers?: ConflictMarker[];
     userChoice?: boolean;
   }

   interface ConflictMarker {
     type: 'conflict-start' | 'conflict-middle' | 'conflict-end';
     line: number;
     content: string;
   }

   enum ConflictType {
     CONTENT_MODIFIED = 'content-modified',
     FILE_DELETED = 'file-deleted',
     FILE_MOVED = 'file-moved',
     PERMISSIONS_CHANGED = 'permissions-changed'
   }
   ```

2. **ConflictUI** (`src/tui/components/conflict-dialog.tsx`)
   - Interactive conflict resolution interface
   - Side-by-side comparison view
   - Merge preview with conflict markers
   - Action buttons: Merge, Keep Mine, Keep Theirs, Cancel

3. **Auto-merge Engine**
   ```typescript
   class AutoMergeEngine {
     canAutoMerge(localContent: string, remoteContent: string): boolean {
       // Detect non-overlapping changes
       const localDiff = this.generateDiff(this.baseContent, localContent);
       const remoteDiff = this.generateDiff(this.baseContent, remoteContent);

       return !this.hasConflictingChanges(localDiff, remoteDiff);
     }

     performAutoMerge(localContent: string, remoteContent: string): string {
       // Git-style three-way merge algorithm
       return this.threeWayMerge(this.baseContent, localContent, remoteContent);
     }
   }
   ```

**Integration with File Watcher**:

```typescript
// Enhanced file watcher with conflict detection
private async handleExternalChange(event: FileChangeEvent): Promise<void> {
  const openFile = this.editSession.getFile(event.fullPath);
  if (!openFile || !openFile.isDirty) return;

  const conflict = await this.conflictResolver.detectConflict(
    event.fullPath,
    openFile.currentContent
  );

  if (conflict) {
    const resolution = await this.conflictUI.promptResolution(conflict);
    await this.applyResolution(event.fullPath, resolution);
  }
}
```

**Conflict Resolution Workflow**:
1. External change detected on open file
2. Compare against pending changes
3. Attempt auto-merge if possible
4. Present conflict UI if manual resolution needed
5. Apply chosen resolution strategy
6. Update edit session state

## External Dependencies

### New Dependencies

```json
{
  "dependencies": {
    "chokidar": "^3.6.0",    // Enhanced file watching (already present)
    "fuse.js": "^7.1.0"      // Fuzzy search for autocomplete (already present)
  }
}
```

### Existing Dependencies Leverage

- **ink**: React-based TUI components for dropdowns and dialogs
- **diff**: Diff generation for preview and conflict resolution
- **fast-glob**: File system scanning for autocomplete
- **picocolors**: Terminal color output for syntax highlighting
- **prompts**: User interaction for permission and conflict prompts

## Implementation Architecture

### Directory Structure

```
src/
├── autocomplete/
│   ├── engine.ts              # Fuse.js-powered search engine
│   ├── provider.ts            # Command and file data providers
│   └── types.ts               # Autocomplete interfaces
├── permissions/
│   ├── manager.ts             # Permission management core
│   ├── storage.ts             # Persistent permission storage
│   └── policies.ts            # Permission policy definitions
├── tools/
│   ├── enhanced-file-watcher.ts    # Chokidar-based file watching
│   ├── multi-file-editor.ts       # Multi-file editing sessions
│   ├── conflict-resolver.ts       # Conflict detection and resolution
│   └── edit-history.ts            # Undo/redo implementation
└── tui/components/
    ├── autocomplete-dropdown.tsx   # Autocomplete UI component
    ├── permission-dialog.tsx       # Permission consent UI
    ├── conflict-dialog.tsx         # Conflict resolution UI
    └── diff-preview.tsx            # Diff visualization component
```

### Integration Points

1. **TUI Keyboard Handler** (`src/tui/keyboard-handler.tsx`)
   - Integrate autocomplete trigger detection
   - Add keyboard shortcuts for undo/redo
   - Handle permission dialog interactions

2. **Slash Commands** (`src/slash/commands.ts`)
   - Enhance /edit command with multi-file support
   - Add /permissions command for permission management
   - Integrate conflict resolution into existing commands

3. **Native Tools** (`src/tools/native/`)
   - Update edit-tool.ts with permission checks
   - Integrate enhanced file watcher
   - Add conflict detection to write operations

### Performance Targets

- **Autocomplete Response**: <50ms for suggestions
- **File Watching**: <150ms debounced change detection
- **Diff Generation**: <100ms for files up to 10,000 lines
- **Permission Checks**: <10ms for cached permissions
- **Memory Usage**: <50MB additional overhead for multi-file sessions

### Error Handling Strategy

1. **Graceful Degradation**
   - Fall back to basic completion if fuzzy search fails
   - Revert to fs.watch if chokidar initialization fails
   - Disable advanced features on permission errors

2. **User Feedback**
   - Clear error messages for permission denials
   - Progress indicators for long-running operations
   - Confirmation dialogs for destructive actions

3. **Recovery Mechanisms**
   - Auto-save edit sessions for crash recovery
   - Permission cache invalidation on errors
   - Conflict resolution state persistence

### Testing Requirements

1. **Unit Tests**
   - Autocomplete engine with various search patterns
   - Permission manager with different grant scenarios
   - Conflict resolver with merge algorithm validation

2. **Integration Tests**
   - Multi-file editing workflows
   - External change detection and resolution
   - Permission dialog user interactions

3. **Performance Tests**
   - Autocomplete response time benchmarks
   - File watcher event handling under load
   - Large file diff generation performance

4. **Cross-Platform Tests**
   - Windows, macOS, Linux file watching reliability
   - Permission system behavior across platforms
   - TUI component rendering in different terminals

## Migration Strategy

### Phase 1: Foundation (Week 1)
1. Implement enhanced file watcher with chokidar
2. Create permission manager core functionality
3. Add basic autocomplete engine structure

### Phase 2: UI Components (Week 2)
1. Build autocomplete dropdown component
2. Create permission dialog UI
3. Implement basic conflict resolution UI

### Phase 3: Integration (Week 3)
1. Integrate autocomplete with TUI keyboard handler
2. Connect permission system to file operations
3. Add multi-file editing support to /edit command

### Phase 4: Advanced Features (Week 4)
1. Implement conflict detection and auto-merge
2. Add undo/redo functionality
3. Create diff preview component

### Phase 5: Testing & Polish (Week 5)
1. Comprehensive testing suite
2. Performance optimization
3. Documentation and examples

### Backward Compatibility

- Maintain existing API surface for current functionality
- Provide configuration flags to disable new features
- Gradual migration path with feature flags
- Support for existing .plato configuration structure