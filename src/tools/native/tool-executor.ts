/**
 * ToolExecutor - Central coordination service for native and MCP tools
 * Provides transparent routing between native tool implementations and MCP fallback
 */

import { EventEmitter } from "events";
import { existsSync } from "fs";
import {
  ToolExecutor,
  ToolCall,
  BaseToolResponse,
  ToolEvent,
  ToolCapability,
  ToolConfig,
  MCPBridge,
  ToolRegistry,
  NativeTool,
  ToolError,
  ErrorClass,
  ResourceLimits,
} from "./types.js";

/**
 * Tool Registry Implementation
 * Manages registration and discovery of native tools
 */
class NativeToolRegistry extends EventEmitter implements ToolRegistry {
  private readonly tools: Map<string, NativeTool> = new Map();
  private readonly toolMetadata: Map<string, ToolCapability> = new Map();

  registerTool(name: string, tool: NativeTool): void {
    if (this.tools.has(name)) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        "TOOL_ALREADY_REGISTERED",
        `Tool "${name}" is already registered`,
        { toolName: name },
      );
    }

    this.tools.set(name, tool);

    // Generate capability metadata
    const capability: ToolCapability = this.generateCapability(name, tool);
    this.toolMetadata.set(name, capability);

    this.emit("tool-registered", { name, capability });
  }

  unregisterTool(name: string): void {
    if (!this.tools.has(name)) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        "TOOL_NOT_FOUND",
        `Tool "${name}" is not registered`,
        { toolName: name },
      );
    }

    this.tools.delete(name);
    this.toolMetadata.delete(name);

    this.emit("tool-unregistered", { name });
  }

  getTool(name: string): NativeTool | undefined {
    return this.tools.get(name);
  }

  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  getCapabilities(): ToolCapability[] {
    return Array.from(this.toolMetadata.values());
  }

  private generateCapability(name: string, tool: NativeTool): ToolCapability {
    // Generate capability based on tool type and constructor
    const hasStreamMethod = typeof tool.stream === "function";

    // Tool-specific capability generation
    const baseCapability: ToolCapability = {
      name,
      version: "1.0",
      description: this.generateDescription(name),
      streaming: hasStreamMethod,
      arguments: this.generateArguments(name),
    };

    return baseCapability;
  }

  private generateDescription(toolName: string): string {
    const descriptions: Record<string, string> = {
      read: "Native file reading with encoding detection, line range support, and streaming capabilities",
      write:
        "Native file writing with atomic operations, directory creation, and permission handling",
      edit: "Native file editing with pattern matching, diff generation, and conflict detection",
      list: "Native directory listing with glob patterns, sorting, and file statistics",
      bash: "Native process execution with streaming stdout/stderr, timeout, and signal handling",
      search: "Native file search with ripgrep integration and context lines",
      mkdir:
        "Native directory creation with recursive support and permission handling",
      delete:
        "Native file/directory deletion with safety checks and confirmation",
      move: "Native file/directory moving with conflict resolution and metadata preservation",
    };

    return descriptions[toolName] || `Native ${toolName} tool implementation`;
  }

  private generateArguments(toolName: string): Record<string, any> {
    const argumentSchemas: Record<string, any> = {
      read: {
        path: {
          type: "string",
          required: true,
          description: "File path to read",
        },
        encoding: {
          type: "string",
          required: false,
          description: "Text encoding (utf8, utf16le, etc.)",
        },
        startLine: {
          type: "number",
          required: false,
          description: "Starting line number (1-based)",
        },
        endLine: {
          type: "number",
          required: false,
          description: "Ending line number (1-based)",
        },
        forceText: {
          type: "boolean",
          required: false,
          description: "Force text interpretation of binary files",
        },
      },
      write: {
        path: {
          type: "string",
          required: true,
          description: "File path to write",
        },
        content: {
          type: "string",
          required: true,
          description: "Content to write",
        },
        encoding: {
          type: "string",
          required: false,
          description: "Text encoding (utf8, utf16le, etc.)",
        },
        atomic: {
          type: "boolean",
          required: false,
          description: "Use atomic write operation",
        },
        backup: {
          type: "boolean",
          required: false,
          description: "Create backup before writing",
        },
        createDirs: {
          type: "boolean",
          required: false,
          description: "Create parent directories if needed",
        },
      },
      bash: {
        command: {
          type: "string",
          required: true,
          description: "Shell command to execute",
        },
        cwd: {
          type: "string",
          required: false,
          description: "Working directory",
        },
        env: {
          type: "object",
          required: false,
          description: "Environment variables",
        },
        timeout: {
          type: "number",
          required: false,
          description: "Timeout in milliseconds",
        },
        shell: {
          type: "string",
          required: false,
          description: "Shell to use (bash, sh, cmd, etc.)",
        },
        input: {
          type: "string",
          required: false,
          description: "Input to send to process stdin",
        },
        streaming: {
          type: "boolean",
          required: false,
          description: "Enable streaming output",
        },
        background: {
          type: "boolean",
          required: false,
          description: "Run process in background",
        },
      },
      list: {
        path: {
          type: "string",
          required: false,
          description: "Directory path to list (default: current)",
        },
        recursive: {
          type: "boolean",
          required: false,
          description: "Recursive directory traversal",
        },
        pattern: {
          type: "string",
          required: false,
          description: "Glob pattern to filter files",
        },
        includeHidden: {
          type: "boolean",
          required: false,
          description: "Include hidden files and directories",
        },
        sortBy: {
          type: "string",
          required: false,
          description: "Sort by: name, size, modified, type",
        },
        sortOrder: {
          type: "string",
          required: false,
          description: "Sort order: asc, desc",
        },
        stats: {
          type: "boolean",
          required: false,
          description: "Include file statistics",
        },
        maxDepth: {
          type: "number",
          required: false,
          description: "Maximum recursion depth",
        },
      },
    };

    return (
      argumentSchemas[toolName] || {
        args: {
          type: "object",
          required: false,
          description: "Tool-specific arguments",
        },
      }
    );
  }
}

/**
 * MCP Bridge Implementation
 * Provides fallback to MCP servers for tools not available natively
 */
class DefaultMCPBridge implements MCPBridge {
  constructor(private mcpClient?: any) {}

  async execute(tool: ToolCall): Promise<BaseToolResponse> {
    if (!this.mcpClient) {
      // Use existing MCP integration from integrations/mcp.ts
      const { callTool } = await import("../../integrations/mcp.js");

      // For fallback, we need to determine the server ID
      // This is a simplified implementation - in practice, we'd have server routing logic
      const serverId = this.determineServerForTool(tool.name);

      try {
        const result = await callTool(serverId, tool.name, tool.arguments);
        return {
          success: true,
          ...result,
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof ToolError
              ? error
              : new ToolError(
                  ErrorClass.PERMANENT,
                  "MCP_EXECUTION_ERROR",
                  (error as Error).message,
                  { toolName: tool.name, serverId },
                ),
        };
      }
    }

    // Custom MCP client implementation
    return this.mcpClient.execute(tool);
  }

  async *stream(tool: ToolCall): AsyncGenerator<ToolEvent> {
    if (!this.mcpClient) {
      // MCP streaming not implemented in current integration
      // Fallback to regular execution and emit as single event
      const result = await this.execute(tool);
      yield {
        type: "complete",
        data: result,
        timestamp: Date.now(),
        sequence: 0,
        success: result.success,
      };
      return;
    }

    // Custom MCP client streaming
    yield* this.mcpClient.stream(tool);
  }

  async cancel(executionId: string): Promise<void> {
    if (this.mcpClient?.cancel) {
      await this.mcpClient.cancel(executionId);
    }
    // Current MCP integration doesn't support cancellation
    // This would be enhanced when MCP supports it
  }

  getCapabilities(): ToolCapability[] {
    if (this.mcpClient?.getCapabilities) {
      return this.mcpClient.getCapabilities();
    }

    // Return empty capabilities for now
    // This would be populated from MCP server discovery
    return [];
  }

  private determineServerForTool(toolName: string): string {
    // Simple heuristic for server routing
    // In practice, this would consult a configuration or discovery service
    const serverMapping: Record<string, string> = {
      filesystem: "filesystem-server",
      database: "database-server",
      web: "web-server",
    };

    // Default server fallback
    return serverMapping[toolName] || "default-server";
  }
}

/**
 * Native Tool Executor Implementation
 * Coordinates between native tools and MCP fallback with intelligent routing
 */
export class NativeToolExecutor extends EventEmitter implements ToolExecutor {
  private readonly registry: NativeToolRegistry;
  private readonly mcpBridge: MCPBridge;
  private readonly config: Required<ToolConfig>;
  private readonly activeExecutions: Map<string, Promise<any>> = new Map();
  private readonly concurrencyQueue: Array<() => Promise<any>> = [];
  private currentConcurrency = 0;

  constructor(config: ToolConfig, mcpBridge?: MCPBridge) {
    super();

    // Validate and normalize configuration
    this.config = this.validateAndNormalizeConfig(config);

    // Initialize registry and bridge
    this.registry = new NativeToolRegistry();
    this.mcpBridge = mcpBridge || new DefaultMCPBridge();

    // Forward registry events
    this.registry.on("tool-registered", (event) =>
      this.emit("tool-registered", event),
    );
    this.registry.on("tool-unregistered", (event) =>
      this.emit("tool-unregistered", event),
    );

    // Set up telemetry
    this.setupTelemetry();
  }

  /**
   * Register a native tool for execution
   */
  registerTool(name: string, tool: NativeTool): void {
    this.registry.registerTool(name, tool);
  }

  /**
   * Unregister a native tool
   */
  unregisterTool(name: string): void {
    this.registry.unregisterTool(name);
  }

  /**
   * Execute a tool call with automatic native/MCP routing
   */
  async execute(tool: ToolCall): Promise<BaseToolResponse> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Validate tool call
      this.validateToolCall(tool);

      // Apply concurrency limits
      return await this.withConcurrencyLimit(async () => {
        return await this.executeInternal(tool, executionId);
      });
    } catch (error) {
      this.emitExecutionError(tool.name, error, executionId);
      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Stream tool execution with automatic native/MCP routing
   */
  async *stream(tool: ToolCall): AsyncGenerator<ToolEvent> {
    const executionId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Validate tool call
      this.validateToolCall(tool);

      // Check if we should use native or MCP
      const nativeTool = this.shouldUseNative(tool.name)
        ? this.registry.getTool(tool.name)
        : undefined;

      if (nativeTool && nativeTool.stream) {
        // Use native tool streaming
        yield* nativeTool.stream(tool.arguments);
      } else {
        // Fall back to MCP streaming
        if (this.mcpBridge.stream) {
          yield* this.mcpBridge.stream(tool);
        } else {
          throw new ToolError(
            ErrorClass.VALIDATION,
            "STREAMING_NOT_SUPPORTED",
            "Streaming not supported for this tool",
          );
        }
      }
    } catch (error) {
      yield {
        type: "error",
        data: { error: (error as Error).message },
        timestamp: Date.now(),
        sequence: 0,
      };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Cancel a tool execution
   */
  async cancel(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      // Try to cancel native tool execution
      // This would require tracking execution IDs per tool
      // For now, we'll just mark it for cancellation
      this.activeExecutions.delete(executionId);
    }

    // Also try MCP cancellation
    if (this.mcpBridge.cancel) {
      await this.mcpBridge.cancel(executionId);
    }

    this.emit("execution-cancelled", { executionId, timestamp: Date.now() });
  }

  /**
   * Get capabilities from both native tools and MCP bridge
   */
  getCapabilities(): ToolCapability[] {
    const nativeCapabilities = this.registry.getCapabilities();
    const mcpCapabilities = this.mcpBridge.getCapabilities() || [];

    return [
      ...nativeCapabilities,
      ...(Array.isArray(mcpCapabilities) ? mcpCapabilities : []),
    ];
  }

  private async executeInternal(
    tool: ToolCall,
    executionId: string,
  ): Promise<BaseToolResponse> {
    const startTime = Date.now();

    // Emit execution start
    this.emit("execution-start", {
      toolName: tool.name,
      executionId,
      timestamp: startTime,
      arguments: tool.arguments,
    });

    try {
      let result: BaseToolResponse;

      // Check if we should use native or MCP
      if (this.shouldUseNative(tool.name)) {
        const nativeTool = this.registry.getTool(tool.name);
        if (nativeTool) {
          result = await nativeTool.execute(tool.arguments);
        } else {
          throw new ToolError(
            ErrorClass.PERMANENT,
            "NATIVE_TOOL_NOT_FOUND",
            `Native tool "${tool.name}" not found`,
            { toolName: tool.name },
          );
        }
      } else {
        // Fall back to MCP
        result = await this.mcpBridge.execute(tool);
      }

      const endTime = Date.now();

      // Emit execution success
      this.emit("execution-complete", {
        toolName: tool.name,
        executionId,
        success: result.success,
        duration: endTime - startTime,
        timestamp: endTime,
      });

      return result;
    } catch (error) {
      const endTime = Date.now();

      // Emit execution error
      this.emit("execution-error", {
        toolName: tool.name,
        executionId,
        error: (error as Error).message,
        duration: endTime - startTime,
        timestamp: endTime,
      });

      throw error;
    }
  }

  private shouldUseNative(toolName: string): boolean {
    if (this.config.forceMCP) {
      return false;
    }

    // Check if native tool is available
    return this.registry.getTool(toolName) !== undefined;
  }

  private validateToolCall(tool: ToolCall): void {
    if (!tool || typeof tool !== "object") {
      throw new ToolError(
        ErrorClass.VALIDATION,
        "INVALID_TOOL_CALL_FORMAT",
        "Invalid tool call format",
        { toolCall: tool },
      );
    }

    if (
      !tool.name ||
      typeof tool.name !== "string" ||
      tool.name.trim() === ""
    ) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        "INVALID_TOOL_NAME",
        "Tool name cannot be empty",
        { toolCall: tool },
      );
    }

    if (!tool.arguments || typeof tool.arguments !== "object") {
      throw new ToolError(
        ErrorClass.VALIDATION,
        "INVALID_TOOL_ARGUMENTS",
        "Tool arguments must be an object",
        { toolCall: tool },
      );
    }
  }

  private async withConcurrencyLimit<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.currentConcurrency >= this.config.maxConcurrency) {
      // Queue the operation
      return new Promise((resolve, reject) => {
        this.concurrencyQueue.push(async () => {
          try {
            const result = await operation();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    // Execute immediately
    this.currentConcurrency++;
    try {
      const result = await operation();
      return result;
    } finally {
      this.currentConcurrency--;

      // Process queue
      if (
        this.concurrencyQueue.length > 0 &&
        this.currentConcurrency < this.config.maxConcurrency
      ) {
        const nextOperation = this.concurrencyQueue.shift();
        if (nextOperation) {
          setImmediate(() => nextOperation());
        }
      }
    }
  }

  private validateAndNormalizeConfig(config: ToolConfig): Required<ToolConfig> {
    const normalized: Required<ToolConfig> = {
      forceMCP: config.forceMCP ?? false,
      timeout: config.timeout ?? 30000,
      maxConcurrency: config.maxConcurrency ?? 10,
      workspaceRoot: config.workspaceRoot ?? process.cwd(),
      resourceLimits: {
        maxFileSize: config.resourceLimits?.maxFileSize ?? 100 * 1024 * 1024, // 100MB
        maxMemoryUsage:
          config.resourceLimits?.maxMemoryUsage ?? 512 * 1024 * 1024, // 512MB
        maxCpuTime: config.resourceLimits?.maxCpuTime ?? 30000, // 30 seconds
        maxOpenFiles: config.resourceLimits?.maxOpenFiles ?? 1000,
      },
    };

    // Validate workspace root
    if (!existsSync(normalized.workspaceRoot)) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        "INVALID_WORKSPACE_ROOT",
        "Invalid workspace root: directory does not exist",
        { workspaceRoot: normalized.workspaceRoot },
      );
    }

    // Validate numeric constraints
    if (normalized.timeout <= 0) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        "INVALID_TIMEOUT",
        "Timeout must be a positive number",
        { timeout: normalized.timeout },
      );
    }

    if (normalized.maxConcurrency <= 0) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        "INVALID_MAX_CONCURRENCY",
        "Max concurrency must be a positive number",
        { maxConcurrency: normalized.maxConcurrency },
      );
    }

    return normalized;
  }

  private setupTelemetry(): void {
    // Forward telemetry from native tools
    this.registry.on("tool-registered", (event) => {
      const tool = this.registry.getTool(event.name);
      if (tool) {
        tool.on("telemetry", (telemetryEvent) => {
          this.emit("telemetry", {
            ...telemetryEvent,
            toolExecutor: "native",
            toolName: event.name,
          });
        });
      }
    });
  }

  private emitExecutionError(
    toolName: string,
    error: any,
    executionId: string,
  ): void {
    this.emit("execution-error", {
      toolName,
      executionId,
      error: error instanceof Error ? error.message : String(error),
      errorClass:
        error instanceof ToolError ? error.errorClass : ErrorClass.PERMANENT,
      timestamp: Date.now(),
    });
  }
}

// Export base interface for compatibility
export { ToolExecutor };
