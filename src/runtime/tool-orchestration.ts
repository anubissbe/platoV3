/**
 * Tool Orchestration Service
 * Enhanced tool execution system that integrates native tools with MCP fallback
 */

import { loadConfig } from '../config.js';
import { PermissionManager } from '../permissions/PermissionManager.js';
import { PermissionQuery } from '../permissions/types.js';
import { checkPermission } from '../tools/permissions.js';
import { NativeToolExecutor, ToolExecutor } from '../tools/native/tool-executor.js';
import { ToolCall, ToolConfig, MCPBridge, BaseToolResponse, ToolEvent } from '../tools/native/types.js';
import { ReadTool } from '../tools/native/read-tool.js';
import { WriteTool } from '../tools/native/write-tool.js';
import { ListTool } from '../tools/native/list-tool.js';
import { BashTool } from '../tools/native/bash-tool.js';
import { 
  emitToolStart, 
  emitToolEnd 
} from './status-events.js';

// Global tool executor instance
let globalToolExecutor: ToolExecutor | null = null;
let currentSessionId: string = 'default';

/**
 * Import existing orchestrator event type for compatibility
 */
type OrchestratorEvent = { type: 'tool-start'|'tool-end'|'info'; message: string };

/**
 * Initialize the global tool executor with native tools
 */
export async function initializeToolExecutor(workspaceRoot?: string): Promise<ToolExecutor> {
  if (globalToolExecutor) {
    return globalToolExecutor;
  }

  const config: ToolConfig = {
    forceMCP: false, // Native tools preferred by default
    timeout: 30000,
    maxConcurrency: 10,
    workspaceRoot: workspaceRoot || process.cwd()
  };

  // Create MCP bridge for fallback
  const mcpBridge: MCPBridge = {
    async execute(tool: ToolCall): Promise<BaseToolResponse> {
      // Use existing MCP integration
      const { callTool } = await import('../integrations/mcp.js');
      
      // For legacy compatibility, extract server from tool name or use default
      const server = extractServerFromToolName(tool.name) || 'default-server';
      
      try {
        const result = await callTool(server, tool.name, tool.arguments);
        return {
          success: true,
          ...result
        };
      } catch (error) {
        throw error; // Let the executor handle error classification
      }
    },

    async *stream(tool: ToolCall): AsyncGenerator<ToolEvent> {
      // Stream via regular execution for now
      // MCP streaming would be implemented here when available
      const result = await this.execute(tool);
      yield {
        type: 'complete',
        data: result,
        timestamp: Date.now(),
        sequence: 0,
        success: result.success
      };
    },

    async cancel(executionId: string): Promise<void> {
      // MCP cancellation not currently implemented
      console.warn(`MCP cancellation not implemented for ${executionId}`);
    },

    getCapabilities() {
      // Would be populated from MCP server discovery
      return [];
    }
  };

  // Initialize native tool executor
  globalToolExecutor = new NativeToolExecutor(config, mcpBridge);

  // Register native tools (cast to NativeToolExecutor for registration methods)
  const nativeExecutor = globalToolExecutor as NativeToolExecutor;
  nativeExecutor.registerTool('read', new ReadTool(config.workspaceRoot));
  nativeExecutor.registerTool('write', new WriteTool(config.workspaceRoot));
  nativeExecutor.registerTool('list', new ListTool(config.workspaceRoot));
  nativeExecutor.registerTool('bash', new BashTool(config.workspaceRoot));

  // Set up telemetry forwarding (cast for event emitter methods)
  nativeExecutor.on('telemetry', (event: any) => {
    console.log('Tool telemetry:', event);
  });

  nativeExecutor.on('execution-start', (event: any) => {
    emitToolStart(event.toolName, 'native', event.arguments);
  });

  nativeExecutor.on('execution-complete', (event: any) => {
    emitToolEnd(event.toolName, event.success);
  });

  nativeExecutor.on('execution-error', (event: any) => {
    emitToolEnd(event.toolName, false, event.error);
  });

  return globalToolExecutor;
}

/**
 * Enhanced tool execution function that replaces maybeBridgeTool
 * Supports both native tools and MCP fallback with transparent routing
 */
export async function executeToolCall(
  content: string, 
  onEvent?: (e: OrchestratorEvent) => void
): Promise<void> {
  const cfg = await loadConfig();
  if (cfg.toolCallPreset?.enabled === false) return;

  // Parse tool call from content
  const toolCall = parseToolCall(content);
  if (!toolCall) return;

  // Initialize tool executor if needed
  const toolExecutor = await initializeToolExecutor();

  // Check permissions
  const permissionGranted = await checkToolPermission(toolCall, onEvent);
  if (!permissionGranted) return;

  // Execute tool with proper event handling
  onEvent?.({ type: 'tool-start', message: `Running ${toolCall.name}...` });
  
  try {
    const result = await toolExecutor.execute(toolCall);
    
    // Add result to conversation history (maintain compatibility)
    const orchestrator = await import("./orchestrator.js"); const addToHistory = orchestrator.default.addToHistory.bind(orchestrator.default);
    addToHistory("tool", JSON.stringify(result));
    
    onEvent?.({ type: 'tool-end', message: 'Tool completed successfully' });
    
  } catch (error: any) {
    const errorMessage = `Tool failed: ${error?.message || error}`;
    
    // Add error to conversation history
    const orchestrator = await import("./orchestrator.js"); const addToHistory = orchestrator.default.addToHistory.bind(orchestrator.default);
    addToHistory("tool", errorMessage);
    
    onEvent?.({ type: 'tool-end', message: errorMessage });
  }
}

/**
 * Enhanced streaming tool execution
 */
export async function* streamToolCall(
  content: string,
  onEvent?: (e: OrchestratorEvent) => void
): AsyncGenerator<ToolEvent> {
  const toolCall = parseToolCall(content);
  if (!toolCall) return;

  // Initialize tool executor if needed
  const toolExecutor = await initializeToolExecutor();

  // Check permissions
  const permissionGranted = await checkToolPermission(toolCall, onEvent);
  if (!permissionGranted) return;

  onEvent?.({ type: 'tool-start', message: `Streaming ${toolCall.name}...` });

  try {
    // Stream tool execution (check if streaming is supported)
    if (!toolExecutor.stream) {
      // Fallback to regular execution for non-streaming tools
      const result = await toolExecutor.execute(toolCall);
      yield {
        type: 'complete',
        data: result,
        timestamp: Date.now(),
        sequence: 0,
        success: result.success
      };
      return;
    }
    
    const stream = toolExecutor.stream(toolCall);
    
    for await (const event of stream) {
      // Forward streaming events as info messages
      onEvent?.({ 
        type: 'info', 
        message: `Streaming data: ${event.type}` 
      });
      
      yield event;
      
      // Handle completion
      if (event.type === 'complete') {
        // Add to history
        const orchestrator = await import("./orchestrator.js"); const addToHistory = orchestrator.default.addToHistory.bind(orchestrator.default);
        addToHistory("tool", JSON.stringify(event.data));
        
        onEvent?.({ type: 'tool-end', message: 'Streaming completed' });
      }
    }
    
  } catch (error: any) {
    const errorMessage = `Streaming tool failed: ${error?.message || error}`;
    
    onEvent?.({ type: 'info', message: errorMessage });
    
    yield {
      type: 'error',
      data: { error: errorMessage },
      timestamp: Date.now(),
      sequence: 0
    };
  }
}

/**
 * Parse tool call from assistant content
 */
function parseToolCall(content: string): ToolCall | null {
  // Use strict JSON block detection matching Claude Code
  const toolCallRegex = /```json\s*\n\s*\{\s*"tool_call"\s*:\s*\{[\s\S]*?\}\s*\}\s*\n\s*```/;
  const match = content.match(toolCallRegex);
  if (!match) return null;

  const jsonBlock = match[0];
  const jsonStr = jsonBlock.replace(/```json\s*\n/, '').replace(/\n\s*```/, '');
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    if (!parsed?.tool_call?.name) {
      console.error('Invalid tool call format: missing name');
      return null;
    }

    // Convert from legacy format to new format
    return {
      name: parsed.tool_call.name,
      arguments: parsed.tool_call.input || {}
    };
    
  } catch (error) {
    console.error('Failed to parse tool call:', error);
    return null;
  }
}

/**
 * Check permissions for tool execution
 */
async function checkToolPermission(
  toolCall: ToolCall, 
  onEvent?: (e: OrchestratorEvent) => void
): Promise<boolean> {
  try {
    // Try enhanced permission system first
    const permissionMgr = await getPermissionManager();
    const query: PermissionQuery = {
      tool: 'native_tool', // New permission category for native tools
      server: 'native',
      action: toolCall.name,
      arguments: toolCall.arguments,
      context: {
        source: 'system' as const,
        workspace_path: process.cwd(),
        environment: {
          node_env: process.env.NODE_ENV,
          platform: process.platform,
          node_version: process.version,
        },
        correlation_id: currentSessionId,
      },
    };

    const result = await permissionMgr.checkPermission(query);
    
    if (result.action === 'deny') {
      const message = `Tool call denied: ${toolCall.name} - ${result.reason || 'Policy violation'}`;
      onEvent?.({ type: 'info', message });
      return false;
    } else if (result.action === 'confirm') {
      const message = `Tool call requires confirmation: ${toolCall.name} - ${result.reason || 'Manual approval required'}`;
      onEvent?.({ type: 'info', message });
      return false; // For now, treat prompts as denials in non-interactive mode
    }
    
    onEvent?.({ type: 'info', message: `Permission granted for ${toolCall.name}` });
    return true;
    
  } catch (error) {
    // Fallback to legacy permission system
    console.warn('Advanced permission system failed, falling back to legacy:', error);
    const decision = await checkPermission({ 
      tool: 'native_tool', 
      command: toolCall.name 
    });
    
    if (decision !== 'allow') {
      onEvent?.({ type: 'info', message: `Tool call requires permission: ${toolCall.name} => ${decision}` });
      return false;
    }
    
    return true;
  }
}

/**
 * Extract server ID from tool name for backward compatibility
 */
function extractServerFromToolName(toolName: string): string | null {
  // Some tools might be namespaced like "server:tool"
  if (toolName.includes(':')) {
    return toolName.split(':')[0];
  }
  return null;
}

/**
 * Get permission manager instance
 */
async function getPermissionManager(): Promise<PermissionManager> {
  // Import the permission manager initialization from orchestrator
  const orchestrator = await import("./orchestrator.js"); return orchestrator.default.ensurePermissionManagerPublic();
}

/**
 * Get the global tool executor instance
 */
export function getToolExecutor(): ToolExecutor | null {
  return globalToolExecutor;
}

/**
 * Reset the global tool executor (for testing)
 */
export function resetToolExecutor(): void {
  globalToolExecutor = null;
}

/**
 * Configure tool executor settings
 */
export async function configureToolExecutor(config: Partial<ToolConfig>): Promise<void> {
  if (globalToolExecutor) {
    // Would need to recreate with new config
    globalToolExecutor = null;
  }
  
  // Next call to initializeToolExecutor will use new config
  await initializeToolExecutor(config.workspaceRoot);
}

/**
 * Register additional native tools
 */
export async function registerNativeTool(name: string, toolInstance: any): Promise<void> {
  const executor = await initializeToolExecutor();
  const nativeExecutor = executor as NativeToolExecutor;
  nativeExecutor.registerTool(name, toolInstance);
}

/**
 * Get tool capabilities for discovery
 */
export async function getToolCapabilities(): Promise<any[]> {
  const executor = await initializeToolExecutor();
  return executor.getCapabilities();
}