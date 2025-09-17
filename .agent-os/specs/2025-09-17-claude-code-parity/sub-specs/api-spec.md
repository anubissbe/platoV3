# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-17-claude-code-parity/spec.md

> Created: 2025-09-17
> Version: 1.0.0

## Endpoints

### Command Router API

**Core Router Interface**
```typescript
class CommandRouter {
  // Register a new slash command
  register(command: SlashCommand): void;

  // Execute a command with arguments
  execute(commandLine: string, context: CommandContext): Promise<CommandResult>;

  // Get available commands for help system
  getCommands(category?: CommandCategory): SlashCommand[];

  // Validate command syntax without execution
  validate(commandLine: string): ValidationResult;
}
```

**Command Context Interface**
```typescript
interface CommandContext {
  workingDirectory: string;
  session: SessionManager;
  memory: MemoryManager;
  mcp: MCPManager;
  provider: ProviderManager;
  output: OutputManager;
  permissions: PermissionManager;
}
```

**Command Result Interface**
```typescript
interface CommandResult {
  success: boolean;
  output?: string;
  error?: CommandError;
  metadata?: {
    executionTime: number;
    resourceUsage: ResourceMetrics;
    modifications: FileModification[];
  };
}
```

### MCP Integration Endpoints

**Enhanced Tool Bridge**
```typescript
interface MCPBridge {
  // Execute tool with enhanced error handling
  executeTool(
    serverId: string,
    toolName: string,
    input: ToolInput
  ): Promise<ToolResult>;

  // Batch tool execution for performance
  executeToolBatch(
    operations: ToolOperation[]
  ): Promise<ToolResult[]>;

  // Server health monitoring
  checkServerHealth(serverId: string): Promise<ServerHealth>;

  // Dynamic server attachment
  attachServer(config: MCPServerConfig): Promise<void>;
}
```

**Tool Permission System**
```typescript
interface PermissionManager {
  // Check if command has required permissions
  hasPermission(command: string, operation: string): boolean;

  // Request permission elevation
  requestPermission(
    permission: Permission,
    context: PermissionContext
  ): Promise<boolean>;

  // Set default permissions for command categories
  setDefaultPermissions(category: CommandCategory, permissions: Permission[]): void;
}
```

### File System Integration

**Enhanced File Operations**
```typescript
interface FileManager {
  // Pattern-based file editing
  editFile(
    path: string,
    patterns: EditPattern[]
  ): Promise<FileEditResult>;

  // Safe file creation with validation
  createFile(
    path: string,
    content: string,
    options: CreateOptions
  ): Promise<CreateResult>;

  // Advanced search with multiple patterns
  searchFiles(
    patterns: SearchPattern[],
    options: SearchOptions
  ): Promise<SearchResult[]>;

  // Directory browsing with filtering
  browseDirectory(
    path: string,
    filter: BrowseFilter
  ): Promise<DirectoryListing>;
}
```

**Git Workflow Integration**
```typescript
interface GitManager {
  // Execute git commands with validation
  executeGitCommand(
    command: string,
    args: string[]
  ): Promise<GitResult>;

  // Enhanced status with conflict detection
  getStatus(): Promise<GitStatus>;

  // Intelligent commit creation
  createCommit(
    message: string,
    options: CommitOptions
  ): Promise<CommitResult>;

  // Merge conflict resolution assistance
  resolveConflicts(
    strategy: ConflictStrategy
  ): Promise<ConflictResolution>;
}
```

## Controllers

### SlashCommandController

**Primary Command Handler**
```typescript
class SlashCommandController {
  private router: CommandRouter;
  private context: CommandContext;

  // Process slash command input
  async handleSlashCommand(input: string): Promise<CommandResponse> {
    const parsed = this.parseCommand(input);
    const validated = await this.validateCommand(parsed);

    if (!validated.valid) {
      return this.createErrorResponse(validated.errors);
    }

    const result = await this.router.execute(input, this.context);
    return this.formatResponse(result);
  }

  // Handle command auto-completion
  async getCompletions(partial: string): Promise<Completion[]> {
    const commands = this.router.getCommands();
    return this.filterCompletions(commands, partial);
  }

  // Execute command with permission checks
  private async executeWithPermissions(
    command: SlashCommand,
    args: CommandArgs
  ): Promise<CommandResult> {
    const permissions = await this.checkPermissions(command, args);
    if (!permissions.granted) {
      throw new PermissionError(permissions.missing);
    }

    return command.handler(args, this.context);
  }
}
```

### MCPIntegrationController

**MCP Server Management**
```typescript
class MCPIntegrationController {
  private servers: Map<string, MCPServer>;
  private bridge: MCPBridge;

  // Manage server lifecycle
  async attachServer(config: MCPServerConfig): Promise<void> {
    const server = await this.createServer(config);
    await this.validateServer(server);
    this.servers.set(config.id, server);

    await this.updateToolRegistry(server);
  }

  // Execute tools with fallback handling
  async executeTool(
    serverId: string,
    toolName: string,
    input: ToolInput
  ): Promise<ToolResult> {
    const server = this.servers.get(serverId);
    if (!server?.isHealthy()) {
      throw new ServerUnavailableError(serverId);
    }

    try {
      return await server.executeTool(toolName, input);
    } catch (error) {
      return this.handleToolError(error, serverId, toolName);
    }
  }

  // Server health monitoring
  async monitorServerHealth(): Promise<void> {
    for (const [id, server] of this.servers) {
      const health = await server.checkHealth();
      if (!health.healthy) {
        await this.handleUnhealthyServer(id, health);
      }
    }
  }
}
```

### FileOperationController

**File System Operations**
```typescript
class FileOperationController {
  private fileManager: FileManager;
  private gitManager: GitManager;

  // Enhanced file editing with validation
  async editFile(
    path: string,
    patterns: EditPattern[]
  ): Promise<EditResult> {
    const file = await this.validateFile(path);
    const backup = await this.createBackup(file);

    try {
      const result = await this.fileManager.editFile(path, patterns);
      await this.validateChanges(result);
      return result;
    } catch (error) {
      await this.restoreBackup(backup);
      throw new EditError(error.message, path);
    }
  }

  // Safe file creation with conflict detection
  async createFile(
    path: string,
    content: string
  ): Promise<CreateResult> {
    const exists = await this.fileManager.exists(path);
    if (exists) {
      const overwrite = await this.confirmOverwrite(path);
      if (!overwrite) {
        throw new FileExistsError(path);
      }
    }

    return this.fileManager.createFile(path, content, {
      createDirectories: true,
      validate: true,
      backup: exists
    });
  }

  // Advanced search with performance optimization
  async searchFiles(
    patterns: SearchPattern[]
  ): Promise<SearchResult[]> {
    const optimized = await this.optimizeSearchPatterns(patterns);
    const results = await this.fileManager.searchFiles(optimized, {
      maxResults: 1000,
      timeout: 30000,
      includeContext: true
    });

    return this.rankSearchResults(results);
  }
}