import { chatCompletions, chatStream } from '../providers/chat_fallback.js';
import { dryRunApply, apply as applyPatch } from '../tools/patch.js';
import { reviewPatch } from '../policies/security.js';
import { checkPermission } from '../tools/permissions.js';
import { PermissionManager } from '../permissions/PermissionManager.js';
import { ProfileManager } from '../permissions/ProfileManager.js';
import { AuditLogger } from '../permissions/AuditLogger.js';
import { PermissionQuery } from '../permissions/types.js';
import { runHooks } from '../tools/hooks.js';
import fs from 'fs/promises';
import path from 'path';
import { callTool } from '../integrations/mcp.js';
import { loadConfig } from '../config.js';
import { MemoryManager } from '../memory/manager.js';
import type { MemoryEntry } from '../memory/types.js';
import { SemanticAnalyzer } from '../context/semantic-analyzer.js';
import { ContextPersistenceManager } from '../context/session-persistence.js';
import { createDefaultAnalyticsService, AnalyticsService } from '../services/analytics.js';
import { getSelected } from '../context/context.js';
import { 
  emitTurnStart, 
  emitTurnEnd, 
  emitStreamStart, 
  emitStreamEnd,
  emitTokenUpdate,
  emitCostUpdate,
  emitToolStart,
  emitToolEnd,
  emitPatchExtract,
  emitPatchApplyStart,
  emitPatchApplyEnd,
  emitResponseTime,
  emitMemoryUpdate,
  emitError,
  StreamProgressTracker
} from './status-events.js';

export type Msg = { role: 'system'|'user'|'assistant'|'tool', content: string };

export interface OrchestratorEvent {
  type: string;
  data?: any;
}

interface TokenMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

/**
 * Main Orchestrator class that manages conversation flow, memory, and tool integration
 */
export class Orchestrator {
  private history: Msg[] = [];
  private memoryManager: MemoryManager | null = null;
  private permissionManager: PermissionManager | null = null;
  private profileManager: ProfileManager | null = null;
  private auditLogger: AuditLogger | null = null;
  private semanticAnalyzer: SemanticAnalyzer | null = null;
  private contextPersistenceManager: ContextPersistenceManager | null = null;
  private analyticsService: AnalyticsService | null = null;
  private progressTracker: StreamProgressTracker | null = null;
  private tokenMetrics: TokenMetrics = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
  private sessionId: string = `session_${Date.now()}`;

  constructor() {
    this.history = [
      { role: 'system', content: [
        'You are Plato, an expert coding assistant. Keep answers concise and propose safe diffs.',
        '',
        'Tool calls: When you want Plato to run an external MCP tool, emit exactly one fenced JSON code block with the following format and nothing else in the block:',
        '```json',
        '{"tool_call": {"server": "<server-id>", "name": "<tool-name>", "input": { /* arguments */ }}}',
        '```',
        'Rules:',
        '- Do not include prose in the code block, only valid JSON.',
        '- Use keys exactly: server, name, input. Do not add extra keys.',
        '- After Plato runs the tool, it will provide results and you will continue the answer.',
        '',
        'Patches: When you want to write files, emit exactly one fenced code block like this:',
        '*** Begin Patch',
        '```diff',
        '--- a/path/to/file.js',
        '+++ b/path/to/file.js',
        '@@ -1,3 +1,3 @@',
        ' existing content',
        '-old line',
        '+new line',
        ' more existing content',
        '```',
        '*** End Patch',
        '',
        'You can include multiple patches in separate *** Begin/End blocks.',
      ].join('\n') }
    ];
  }

  private async ensureMemoryManager(): Promise<MemoryManager> {
    if (!this.memoryManager) {
      this.memoryManager = new MemoryManager();
      await this.memoryManager.initialize();
    }
    return this.memoryManager;
  }

  private async ensurePermissionManager(): Promise<PermissionManager> {
    if (!this.permissionManager) {
      this.permissionManager = new PermissionManager();
    }
    return this.permissionManager;
  }

  private async ensureProfileManager(): Promise<ProfileManager> {
    if (!this.profileManager) {
      this.profileManager = new ProfileManager();
    }
    return this.profileManager;
  }

  private async ensureAuditLogger(): Promise<AuditLogger> {
    if (!this.auditLogger) {
      this.auditLogger = new AuditLogger();
    }
    return this.auditLogger;
  }

  private async ensureSemanticAnalyzer(): Promise<SemanticAnalyzer> {
    if (!this.semanticAnalyzer) {
      this.semanticAnalyzer = new SemanticAnalyzer();
    }
    return this.semanticAnalyzer;
  }

  private async ensureContextPersistenceManager(): Promise<ContextPersistenceManager> {
    if (!this.contextPersistenceManager) {
      this.contextPersistenceManager = new ContextPersistenceManager();
    }
    return this.contextPersistenceManager;
  }

  private async ensureAnalyticsService(): Promise<AnalyticsService> {
    if (!this.analyticsService) {
      this.analyticsService = createDefaultAnalyticsService();
    }
    return this.analyticsService;
  }

  /**
   * Main response method - handles a user input and returns assistant response
   */
  async respond(input: string, onEvent?: (e: OrchestratorEvent) => void): Promise<string> {
    try {
      emitTurnStart(input);
      onEvent?.({ type: 'turn_start', data: { input } });
      
      const startTime = Date.now();
      
      // Add user message to history
      this.history.push({ role: 'user', content: input });
      
      // Run pre-prompt hooks
      await runHooks('pre-prompt');
      onEvent?.({ type: 'pre_prompt_hooks' });

      // Add memory context if available
      const projectContext = await this.getProjectContext();
      if (projectContext) {
        const contextMessage = `Project Context:\n${projectContext.substring(0, 2000)}...`;
        this.history.push({ role: 'system', content: contextMessage });
      }

      // Get chat completion
      const response = await chatCompletions(this.history);
      const responseTime = Date.now() - startTime;
      
      // Add assistant response to history
      this.history.push({ role: 'assistant', content: response });
      
      // Run post-response hooks
      await runHooks('post-response');
      onEvent?.({ type: 'post_response_hooks' });
      
      // Emit events
      emitResponseTime(responseTime);
      emitTurnEnd(response);
      onEvent?.({ type: 'turn_end', data: { response, responseTime } });

      return response;
    } catch (error) {
      emitError(error as Error);
      onEvent?.({ type: 'error', data: { error } });
      throw error;
    }
  }

  /**
   * Streaming response method - handles a user input and streams assistant response
   */
  async respondStream(
    input: string, 
    onDelta: (text: string) => void,
    onEvent?: (e: OrchestratorEvent) => void
  ): Promise<string> {
    try {
      emitTurnStart(input);
      emitStreamStart();
      onEvent?.({ type: 'turn_start', data: { input } });
      onEvent?.({ type: 'stream_start' });

      const startTime = Date.now();
      
      // Add user message to history
      this.history.push({ role: 'user', content: input });
      
      // Run pre-prompt hooks
      await runHooks('pre-prompt');
      onEvent?.({ type: 'pre_prompt_hooks' });

      // Add memory context if available
      const projectContext = await this.getProjectContext();
      if (projectContext) {
        const contextMessage = `Project Context:\n${projectContext.substring(0, 2000)}...`;
        this.history.push({ role: 'system', content: contextMessage });
      }

      // Stream chat completion
      let fullResponse = '';
      
      for await (const chunk of chatStream(this.history)) {
        fullResponse += chunk;
        onDelta(chunk);
        onEvent?.({ type: 'stream_delta', data: { chunk, fullResponse } });
      }
      
      const responseTime = Date.now() - startTime;
      
      // Add assistant response to history
      this.history.push({ role: 'assistant', content: fullResponse });
      
      // Run post-response hooks
      await runHooks('post-response');
      onEvent?.({ type: 'post_response_hooks' });
      
      // Emit events
      emitResponseTime(responseTime);
      emitStreamEnd();
      emitTurnEnd(fullResponse);
      onEvent?.({ type: 'stream_end' });
      onEvent?.({ type: 'turn_end', data: { response: fullResponse, responseTime } });

      return fullResponse;
    } catch (error) {
      emitError(error as Error);
      onEvent?.({ type: 'error', data: { error } });
      throw error;
    }
  }

  /**
   * Stream chat - Generator for integration tests
   */
  async *streamChat(messages: Msg[]): AsyncGenerator<{ type: string; content?: string }, void, undefined> {
    try {
      yield { type: 'stream_start' };
      
      let fullResponse = '';
      for await (const chunk of chatStream(messages)) {
        fullResponse += chunk;
        yield { type: 'stream_delta', content: chunk };
      }
      
      yield { type: 'stream_end', content: fullResponse };
    } catch (error) {
      yield { type: 'error', content: (error as Error).message };
    }
  }

  /**
   * Process patch - Extract and apply patches from text
   */
  async processPatch(text: string, options: { dryRun?: boolean; autoApply?: boolean } = {}): Promise<{
    patches: Array<{ filePath: string; diff: string; applied: boolean; error?: string }>;
    summary: string;
  }> {
    const patches: Array<{ filePath: string; diff: string; applied: boolean; error?: string }> = [];
    
    try {
      // Extract patches from text
      const patchRegex = /\*\*\* Begin Patch([\s\S]*?)\*\*\* End Patch/g;
      let match;
      
      while ((match = patchRegex.exec(text)) !== null) {
        const patchContent = match[1].trim();
        const diffMatch = patchContent.match(/```diff\n([\s\S]*?)\n```/);
        
        if (diffMatch) {
          const diff = diffMatch[1];
          const filePathMatch = diff.match(/---\s+a\/(.+)/);
          const filePath = filePathMatch ? filePathMatch[1] : 'unknown';
          
          emitPatchExtract(filePath, diff);
          
          if (options.dryRun) {
            // Just validate the patch
            try {
              await dryRunApply(diff);
              patches.push({ filePath, diff, applied: false });
            } catch (error) {
              patches.push({ filePath, diff, applied: false, error: (error as Error).message });
            }
          } else if (options.autoApply) {
            // Apply the patch
            try {
              emitPatchApplyStart(filePath);
              await applyPatch(diff);
              patches.push({ filePath, diff, applied: true });
              await this.addToPatchJournal(filePath, diff, 'applied');
              emitPatchApplyEnd(filePath, true);
            } catch (error) {
              patches.push({ filePath, diff, applied: false, error: (error as Error).message });
              emitPatchApplyEnd(filePath, false);
            }
          } else {
            patches.push({ filePath, diff, applied: false });
          }
        }
      }
      
      const summary = `Found ${patches.length} patches. Applied: ${patches.filter(p => p.applied).length}`;
      return { patches, summary };
    } catch (error) {
      return { patches, summary: `Error processing patches: ${(error as Error).message}` };
    }
  }

  /**
   * Add entry to patch journal
   */
  async addToPatchJournal(filePath: string, diff: string, action: 'applied' | 'reverted'): Promise<void> {
    try {
      const journalPath = '.plato/patch-journal.json';
      let journal: Array<{ timestamp: string; filePath: string; diff: string; action: string }> = [];
      
      try {
        const existingContent = await fs.readFile(journalPath, 'utf8');
        journal = JSON.parse(existingContent);
      } catch {
        // Journal doesn't exist yet
      }
      
      journal.push({
        timestamp: new Date().toISOString(),
        filePath,
        diff,
        action
      });
      
      await fs.mkdir('.plato', { recursive: true });
      await fs.writeFile(journalPath, JSON.stringify(journal, null, 2), 'utf8');
    } catch (error) {
      console.debug('Failed to update patch journal:', error);
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.history = [this.history[0]]; // Keep system message
  }

  /**
   * Get conversation history
   */
  getHistory(): Msg[] {
    return [...this.history];
  }

  /**
   * Set conversation history
   */
  setHistory(messages: Msg[]): void {
    this.history = [...messages];
  }

  /**
   * Add message to history
   */
  addMessage(message: Msg): void {
    this.history.push(message);
  }

  /**
   * Get project context from memory manager
   */
  async getProjectContext(): Promise<string> {
    try {
      const manager = await this.ensureMemoryManager();
      return await manager.getProjectContext();
    } catch {
      return '';
    }
  }

  /**
   * Update project context in memory manager
   */
  async updateProjectContext(content: string): Promise<void> {
    try {
      const manager = await this.ensureMemoryManager();
      await manager.updateProjectContext(content);
    } catch {
      // Silent failure for optional feature
    }
  }

  /**
   * Add memory entry
   */
  async addMemory(
    type: MemoryEntry['type'], 
    content: string, 
    costMetadata?: MemoryEntry['costMetadata']
  ): Promise<string> {
    try {
      const manager = await this.ensureMemoryManager();
      const timestamp = new Date().toISOString();
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      await manager.addMemory({
        id,
        type,
        content,
        timestamp,
        tags: [],
        costMetadata
      });
      
      emitMemoryUpdate(id, type, content);
      return id;
    } catch (error) {
      console.debug('Failed to add memory:', error);
      return '';
    }
  }

  /**
   * Save current session
   */
  async saveSession(): Promise<void> {
    try {
      const manager = await this.ensureMemoryManager();
      await manager.saveSession({
        startTime: new Date().toISOString(),
        commands: this.history.filter(m => m.role === 'user').map(m => m.content).slice(-100),
        context: this.history.slice(-10).map(m => `${m.role}: ${m.content.substring(0, 200)}...`).join('\n')
      });
    } catch (error) {
      console.debug('Failed to save session:', error);
    }
  }

  /**
   * Restore session from memory
   */
  async restoreSession(): Promise<boolean> {
    try {
      const manager = await this.ensureMemoryManager();
      const session = await manager.restoreSession();
      if (session) {
        // Restore some context without overriding system prompt
        const contextMessage = { role: 'system' as const, content: `Restored session context: ${session.context}` };
        this.history.push(contextMessage);
        return true;
      }
      return false;
    } catch (error) {
      console.debug('Failed to restore session:', error);
      return false;
    }
  }

  /**
   * Update token metrics
   */
  updateTokenMetrics(metrics: number | TokenMetrics): void {
    if (typeof metrics === 'number') {
      this.tokenMetrics.totalTokens += metrics;
    } else {
      this.tokenMetrics = {
        inputTokens: this.tokenMetrics.inputTokens + metrics.inputTokens,
        outputTokens: this.tokenMetrics.outputTokens + metrics.outputTokens,
        totalTokens: this.tokenMetrics.totalTokens + metrics.totalTokens,
        cost: this.tokenMetrics.cost + metrics.cost
      };
    }
    
    emitTokenUpdate(this.tokenMetrics.totalTokens);
    emitCostUpdate(this.tokenMetrics.cost);
  }

  /**
   * Get current token metrics
   */
  getTokenMetrics(): TokenMetrics {
    return { ...this.tokenMetrics };
  }

  /**
   * Reset token metrics
   */
  resetTokenMetrics(): void {
    this.tokenMetrics = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
  }

  /**
   * Execute a hook with context
   */
  async executeHook(hookName: string, context: any): Promise<void> {
    try {
      await runHooks(hookName as 'pre-prompt'|'post-response'|'on-apply', context);
    } catch (error) {
      console.debug(`Hook ${hookName} failed:`, error);
    }
  }

  /**
   * Call MCP tool
   */
  async callMcpTool(serverId: string, toolName: string, input: any): Promise<any> {
    try {
      emitToolStart(serverId, toolName, input);
      const result = await callTool(serverId, toolName, input);
      emitToolEnd(serverId, toolName, result);
      return result;
    } catch (error) {
      emitToolEnd(serverId, toolName, { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Check permission
   */
  async checkPermission(query: PermissionQuery): Promise<'allow' | 'deny' | 'confirm'> {
    return await checkPermission(query);
  }

  /**
   * Get selected context
   */
  async getSelectedContext(): Promise<string> {
    try {
      return await getSelected();
    } catch {
      return '';
    }
  }

  /**
   * Initialize permission system
   */
  async initializePermissionSystem(): Promise<void> {
    try {
      await this.ensurePermissionManager();
      await this.ensureProfileManager();
      await this.ensureAuditLogger();
    } catch (error) {
      console.debug('Failed to initialize permission system:', error);
    }
  }

  /**
   * Initialize memory system
   */
  async initializeMemorySystem(): Promise<void> {
    try {
      await this.ensureMemoryManager();
      await this.ensureSemanticAnalyzer();
      await this.ensureContextPersistenceManager();
    } catch (error) {
      console.debug('Failed to initialize memory system:', error);
    }
  }

  /**
   * Initialize analytics system
   */
  async initializeAnalyticsSystem(): Promise<void> {
    try {
      await this.ensureAnalyticsService();
    } catch (error) {
      console.debug('Failed to initialize analytics system:', error);
    }
  }

  /**
   * Cleanup permission system
   */
  async cleanupPermissionSystem(): Promise<void> {
    this.permissionManager = null;
    this.profileManager = null;
    this.auditLogger = null;
  }

  /**
   * Cleanup memory system
   */
  async cleanupMemorySystem(): Promise<void> {
    if (this.memoryManager) {
      this.memoryManager.stopAutoSave();
      this.memoryManager = null;
    }
    this.semanticAnalyzer = null;
    this.contextPersistenceManager = null;
  }

  /**
   * Cleanup analytics system
   */
  async cleanupAnalyticsSystem(): Promise<void> {
    this.analyticsService = null;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Set session ID
   */
  setSessionId(id: string): void {
    this.sessionId = id;
  }
}

// Export default instance for backward compatibility
const orchestrator = new Orchestrator();
export default orchestrator;