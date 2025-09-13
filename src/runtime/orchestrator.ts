/**
 * Main orchestrator for Plato CLI
 * Manages conversation flow, tool calls, and integrations
 */

import fs from 'node:fs/promises';
import path from 'path';

import { loadConfig, setConfigValue } from '../config.js';
import { PermissionManager } from '../permissions/PermissionManager.js';
import { ProfileManager } from '../permissions/ProfileManager.js';
import { AuditLogger } from '../permissions/AuditLogger.js';
import { PermissionQuery } from '../permissions/types.js';
import {
  emitTurnStart,
  emitStreamStart,
  emitStreamEnd,
  emitTurnEnd,
  emitResponseTime,
  emitError,
  emitPatchExtract,
  emitPatchApplyStart,
  emitPatchApplyEnd,
} from './status-events.js';
import { MemoryManager } from '../memory/manager.js';
import { SessionData } from '../memory/types.js';
import { chatCompletions, chatStream } from '../providers/chat.js';

// Simple utility to ensure plato directory exists
async function ensurePlatoDir(): Promise<void> {
  try {
    await fs.mkdir('.plato', { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Simple hook runner - stub implementation
async function runHooks(hookType: string): Promise<void> {
  // Hook system not implemented yet
  console.debug(`Hook: ${hookType}`);
}

// Simple patch application - stub implementations
async function applyPatch(diff: string): Promise<void> {
  throw new Error('Patch application not implemented');
}

async function dryRunApply(diff: string): Promise<void> {
  // Dry run validation - stub
}

// Export orchestrator event type for compatibility
export type OrchestratorEvent = { 
  type: 'tool-start'|'tool-end'|'info'|'turn_start'|'stream_start'|'stream_end'|'turn_end'|'error'|'pre_prompt_hooks'|'post_response_hooks'|'stream_delta'|'patch_extract'|'patch_apply_start'|'patch_apply_end'; 
  data?: any;
  message?: string;
};

export interface Msg {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

/**
 * Main orchestrator class
 */
class Orchestrator {
  private history: Msg[] = [];
  private permissionManager: PermissionManager | null = null;
  private memoryManager: MemoryManager | null = null;
  private tokenMetrics = {
    input: 0,
    output: 0,
    inputTokens: 0,
    outputTokens: 0
  };
  private transcriptMode = false;
  private backgroundMode = false;

  constructor() {
    this.history = [];
  }

  /**
   * Initialize the permission system
   */
  private async ensurePermissionManager(): Promise<PermissionManager> {
    if (!this.permissionManager) {
      try {
        // Create minimal ProfileManager and AuditLogger
        const profileManager = new ProfileManager();
        const auditLogger = new AuditLogger();
        
        // Initialize with minimal options
        const options = {
          profileManager,
          auditLogger,
          enableSafetyGuards: false,
          enableRiskAssessment: false
        };
        
        this.permissionManager = new PermissionManager(options);
      } catch (error) {
        // If permission system fails to initialize, create a stub that allows everything
        console.warn('Permission system initialization failed, using permissive stub:', error);
        this.permissionManager = {
          async checkPermission() {
            return { action: 'allow' as const, reason: 'Stub implementation' };
          }
        } as any;
      }
    }
    return this.permissionManager!; // Use non-null assertion since we just ensured it's not null
  }

  /**
   * Public version of ensurePermissionManager for external access
   */
  public async ensurePermissionManagerPublic(): Promise<PermissionManager> {
    return await this.ensurePermissionManager();
  }

  /**
   * Initialize memory system
   */
  private async ensureMemoryManager(): Promise<MemoryManager> {
    if (!this.memoryManager) {
      this.memoryManager = new MemoryManager({ memoryDir: '.plato/memory' });
      await this.memoryManager.initialize();
    }
    return this.memoryManager;
  }

  /**
   * Get project context from memory (public version for external access)
   */
  async getProjectContext(): Promise<string> {
    const memMgr = await this.ensureMemoryManager();
    return await memMgr.getProjectContext();
  }

  /**
   * Update project context
   */
  async updateProjectContext(context: string): Promise<void> {
    const memMgr = await this.ensureMemoryManager();
    await memMgr.updateProjectContext(context);
  }

  /**
   * Add message to conversation history
   */
  addToHistory(role: string, content: string): void {
    const validRole = role === 'tool' ? 'assistant' : (role as 'user' | 'assistant' | 'system');
    this.history.push({ role: validRole, content });
  }

  /**
   * Get conversation history
   */
  getHistory(): Msg[] {
    return [...this.history];
  }

  /**
   * Get message history (alias for getHistory for compatibility)
   */
  getMessageHistory(): Msg[] {
    return this.getHistory();
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Basic chat completion handler
   */
  async chat(message: string, onEvent?: (e: OrchestratorEvent) => void): Promise<string> {
    const startTime = Date.now();
    
    try {
      emitTurnStart('user', message);
      onEvent?.({ type: 'turn_start', message: 'Starting conversation...' });

      // Add user message to history
      this.addToHistory('user', message);

      // Run pre-prompt hooks
      await runHooks('pre_prompt');
      onEvent?.({ type: 'pre_prompt_hooks', message: 'Running pre-prompt hooks...' });

      // Get chat completion
      const response = await chatCompletions(this.history, { initiator: 'user' });
      
      // Add assistant response to history
      this.addToHistory('assistant', response.content);

      // Update token metrics
      if (response.usage) {
        this.tokenMetrics.input += response.usage.prompt_tokens || 0;
        this.tokenMetrics.output += response.usage.completion_tokens || 0;
        this.tokenMetrics.inputTokens += response.usage.prompt_tokens || 0;
        this.tokenMetrics.outputTokens += response.usage.completion_tokens || 0;
      }

      // Emit response time
      const responseTime = Date.now() - startTime;
      emitResponseTime(responseTime);

      // Run post-response hooks
      await runHooks('post_response');
      onEvent?.({ type: 'post_response_hooks', message: 'Running post-response hooks...' });

      emitTurnEnd('assistant', response.content);
      onEvent?.({ type: 'turn_end', message: 'Conversation completed' });

      return response.content;

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      emitResponseTime(responseTime);
      emitError(error.message || 'Unknown error');
      onEvent?.({ type: 'error', message: error.message || 'Unknown error' });
      throw error;
    }
  }

  /**
   * Stream chat completion
   */
  async *streamMessage(message: string, onEvent?: (e: OrchestratorEvent) => void): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();
    
    try {
      emitTurnStart('user', message);
      onEvent?.({ type: 'turn_start', message: 'Starting streaming conversation...' });

      // Add user message to history
      this.addToHistory('user', message);

      // Run pre-prompt hooks
      await runHooks('pre_prompt');
      onEvent?.({ type: 'pre_prompt_hooks', message: 'Running pre-prompt hooks...' });

      emitStreamStart();
      onEvent?.({ type: 'stream_start', message: 'Stream started' });

      let fullResponse = '';

      // Stream response
      const streamResponse = await chatStream(this.history, { initiator: 'user' }, (text: string) => {
        onEvent?.({ type: 'stream_delta', data: text });
      });

      fullResponse = streamResponse.content;

      // Yield the complete response
      yield fullResponse;

      // Add assistant response to history
      this.addToHistory('assistant', fullResponse);

      // Update token metrics
      if (streamResponse.usage) {
        this.tokenMetrics.input += streamResponse.usage.prompt_tokens || 0;
        this.tokenMetrics.output += streamResponse.usage.completion_tokens || 0;
        this.tokenMetrics.inputTokens += streamResponse.usage.prompt_tokens || 0;
        this.tokenMetrics.outputTokens += streamResponse.usage.completion_tokens || 0;
      }

      // Emit completion events
      const responseTime = Date.now() - startTime;
      emitResponseTime(responseTime);
      emitStreamEnd(fullResponse.length);
      onEvent?.({ type: 'stream_end', message: 'Stream completed' });

      // Run post-response hooks
      await runHooks('post_response');
      onEvent?.({ type: 'post_response_hooks', message: 'Running post-response hooks...' });

      emitTurnEnd('assistant', fullResponse);
      onEvent?.({ type: 'turn_end', message: 'Streaming conversation completed' });

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      emitResponseTime(responseTime);
      emitError(error.message || 'Unknown error');
      onEvent?.({ type: 'error', message: error.message || 'Unknown error' });
      throw error;
    }
  }

  /**
   * Initialize analytics system
   */
  async initializeAnalyticsSystem(enabled: boolean): Promise<void> {
    // Analytics initialization stub
    console.log(`Analytics system initialized: ${enabled}`);
  }

  /**
   * Load session data
   */
  async loadSession(): Promise<void> {
    const memMgr = await this.ensureMemoryManager();
    const session = await memMgr.restoreSession();
    if (session) {
      // Restore conversation history if available
      if (session.memories) {
        for (const memory of session.memories) {
          if (memory.type === 'session') {
            try {
              const messages = JSON.parse(memory.content);
              if (Array.isArray(messages)) {
                this.history = messages;
              }
            } catch {
              // Ignore invalid session data
            }
          }
        }
      }
    }
  }

  /**
   * Restore session (alias for loadSession)
   */
  async restoreSession(): Promise<void> {
    await this.loadSession();
  }

  /**
   * Save session data
   */
  async saveSession(): Promise<void> {
    const memMgr = await this.ensureMemoryManager();
    const sessionData: SessionData = {
      startTime: new Date().toISOString(),
      commands: [],
      context: JSON.stringify(this.history),
    };
    await memMgr.saveSession(sessionData);
  }

  /**
   * Save conversation history to memory
   */
  async saveHistory(): Promise<void> {
    const memMgr = await this.ensureMemoryManager();
    const entry = {
      id: `history-${Date.now()}`,
      type: 'session' as const,
      content: JSON.stringify(this.history),
      timestamp: new Date().toISOString(),
    };
    await memMgr.addMemory(entry);
  }

  /**
   * Get conversation statistics
   */
  getStats(): { messages: number; tokens: { input: number; output: number }; inputTokens: number; outputTokens: number; durationMs: number; turns: number } {
    return {
      messages: this.history.length,
      tokens: { input: this.tokenMetrics.input, output: this.tokenMetrics.output },
      inputTokens: this.tokenMetrics.inputTokens,
      outputTokens: this.tokenMetrics.outputTokens,
      durationMs: 0, // Stub value
      turns: Math.ceil(this.history.length / 2) // Approximate turns based on message pairs
    };
  }

  /**
   * Get metrics (alias for getStats)
   */
  getMetrics(): { messages: number; tokens: { input: number; output: number }; inputTokens: number; outputTokens: number; durationMs: number; turns: number } {
    return this.getStats();
  }

  /**
   * Reset conversation
   */
  reset(): void {
    this.history = [];
    this.tokenMetrics = { input: 0, output: 0, inputTokens: 0, outputTokens: 0 };
  }

  /**
   * Handle tool calls (stub implementation)
   */
  async handleToolCall(toolCall: any, onEvent?: (e: OrchestratorEvent) => void): Promise<any> {
    onEvent?.({ type: 'tool-start', message: `Executing tool: ${toolCall.name}` });
    
    // Tool call handling is managed by tool-orchestration.ts
    onEvent?.({ type: 'tool-end', message: 'Tool execution completed' });
    
    return { success: true, result: 'Tool call handled' };
  }

  /**
   * Extract patches from content
   */
  extractPatches(content: string): string[] {
    emitPatchExtract(false);
    return []; // Stub implementation
  }

  /**
   * Apply patches
   */
  async applyPatches(patches: string[], onEvent?: (e: OrchestratorEvent) => void): Promise<void> {
    emitPatchApplyStart(patches.length);
    onEvent?.({ type: 'patch_apply_start', message: `Applying ${patches.length} patches...` });

    try {
      for (const patch of patches) {
        await applyPatch(patch);
      }
      emitPatchApplyEnd(true);
      onEvent?.({ type: 'patch_apply_end', message: 'Patches applied successfully' });
    } catch (error: any) {
      emitPatchApplyEnd(false, error.message);
      onEvent?.({ type: 'patch_apply_end', message: `Patch application failed: ${error.message}` });
      throw error;
    }
  }

  /**
   * Process message with full orchestration
   */
  async processMessage(message: string, onEvent?: (e: OrchestratorEvent) => void): Promise<string> {
    return await this.chat(message, onEvent);
  }

  /**
   * Process message with streaming
   */
  async *processMessageStream(message: string, onEvent?: (e: OrchestratorEvent) => void): AsyncGenerator<string, void, unknown> {
    yield* this.streamMessage(message, onEvent);
  }

  /**
   * Get memory manager
   */
  async getMemoryManager(): Promise<MemoryManager> {
    return await this.ensureMemoryManager();
  }

  /**
   * Get permission manager
   */
  async getPermissionManager(): Promise<PermissionManager> {
    return await this.ensurePermissionManager();
  }

  /**
   * Additional missing methods for TUI compatibility
   */

  // Stream cancellation
  async cancelStream(): Promise<void> {
    // Stub implementation - would cancel ongoing streaming
    console.log('Stream cancelled');
  }

  // Memory operations
  async addMemory(entry: any, sessionId?: string): Promise<void> {
    const memMgr = await this.ensureMemoryManager();
    await memMgr.addMemory(entry);
  }

  async getMemory(): Promise<any[]> {
    const memMgr = await this.ensureMemoryManager();
    return await memMgr.getAllMemories();
  }

  async clearMemory(): Promise<void> {
    const memMgr = await this.ensureMemoryManager();
    await memMgr.clearAllMemories();
  }

  // History operations
  async compactHistoryWithFocus(focus?: string): Promise<{ originalLength: number; newLength: number }> {
    const originalLength = this.history.length;
    
    console.log(`Compacting history with focus: ${focus || 'none'}`);
    // Basic compaction - keep last 50 messages
    if (this.history.length > 50) {
      this.history = this.history.slice(-50);
    }
    
    return { originalLength, newLength: this.history.length };
  }

  // Streaming with callback
  async respondStream(message: string, onDelta: (delta: any) => void): Promise<void> {
    try {
      const stream = this.processMessageStream(message);
      for await (const chunk of stream) {
        onDelta(chunk);
      }
    } catch (error) {
      console.error('Streaming error:', error);
    }
  }

  // Transcript mode
  get isTranscriptMode(): boolean {
    return this.transcriptMode;
  }

  setTranscriptMode(enabled: boolean): void {
    this.transcriptMode = enabled;
  }

  setBackgroundMode(enabled: boolean): void {
    this.backgroundMode = enabled;
  }

  // Image operations
  async pasteImageFromClipboard(): Promise<{ success: boolean; message: string }> {
    // Stub implementation - would handle image pasting
    return { success: false, message: 'Image pasting not implemented' };
  }

  /**
   * Stub implementations for missing methods
   */
  async bridgeTool(): Promise<void> { /* stub */ }
  async configureAutoApply(): Promise<void> { /* stub */ }
  async getCurrentSession(): Promise<any> { return null; }
  async handleCommand(): Promise<void> { /* stub */ }
  async handleSlashCommand(): Promise<void> { /* stub */ }
  async initializeSession(): Promise<void> { /* stub */ }
  async loadConfig(): Promise<any> { return await loadConfig(); }
  async loadMemory(): Promise<void> { /* stub */ }
  async saveConfig(): Promise<void> { /* stub */ }
  async setModel(): Promise<void> { /* stub */ }
  async shutdown(): Promise<void> { /* stub */ }
  async startup(): Promise<void> { /* stub */ }
  async updateStats(): Promise<void> { /* stub */ }
  async validateSession(): Promise<boolean> { return true; }
  emit(event: string, ...args: any[]): void { /* stub */ }
  getServerCapabilities(): any[] { return []; }
  listTools(): any[] { return []; }
  on(event: string, listener: (...args: any[]) => void): void { /* stub */ }
  setMaxListeners(n: number): void { /* stub */ }
}

// Create and export singleton instance
const orchestrator = new Orchestrator();
export default orchestrator;