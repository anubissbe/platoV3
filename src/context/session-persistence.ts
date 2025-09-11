/**
 * Session Persistence Manager for Advanced Context Management
 * Integrates with Plato's existing session and memory systems for robust state management
 */

import { SemanticIndex } from './semantic-index.js';
import { FileRelevanceScorer } from './relevance-scorer.js';
import { ContentSampler } from './content-sampler.js';
import { MemoryManager } from '../memory/manager.js';
import { MemoryEntry } from '../memory/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ContextState {
  index: SemanticIndex;
  scorer: FileRelevanceScorer;
  sampler: ContentSampler;
  currentFiles: string[];
  userPreferences: Record<string, any>;
  sessionMetadata: {
    startTime: string;
    lastActivity: string;
    totalQueries: number;
    costAnalytics?: {
      totalCost: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      interactionCount: number;
      sessionId: string;
      avgCostPerQuery: number;
      lastCostUpdate: string;
    };
    [key: string]: any;
  };
}

export interface SerializedContextState {
  version: string;
  timestamp: string;
  index: string;
  currentFiles: string[];
  userPreferences: Record<string, any>;
  sessionMetadata: Record<string, any>;
}

export interface ContextConfiguration {
  userPreferences: Record<string, any>;
  currentFiles: string[];
  sessionSettings?: Record<string, any>;
}

export interface ExportData {
  version: string;
  exportedAt: string;
  configuration: ContextConfiguration;
}

export interface HistoryEntry {
  id: string;
  timestamp: Date;
  reason: string;
  description?: string;
}

export interface PersistenceOptions {
  sessionPath?: string;
  memoryPath?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
  maxHistoryEntries?: number;
}

export interface ResumeOptions {
  preferSaved?: boolean;
  mergeFiles?: boolean;
  validateState?: boolean;
}

/**
 * Main persistence manager for context state
 */
export class ContextPersistenceManager {
  private memoryManager: MemoryManager;
  private sessionPath: string;
  private options: PersistenceOptions;
  private autoSaveTimer?: NodeJS.Timeout;

  constructor(options: PersistenceOptions = {}) {
    this.options = {
      sessionPath: '.plato/session.json',
      memoryPath: '.plato/memory',
      autoSave: true,
      autoSaveInterval: 30000, // 30 seconds
      maxHistoryEntries: 50,
      ...options
    };

    this.sessionPath = this.options.sessionPath!;
    this.memoryManager = new MemoryManager({
      memoryDir: this.options.memoryPath!
    });
    
    if (this.options.autoSave) {
      this.startAutoSave();
    }
  }

  /**
   * Serialize context state for storage
   */
  async serializeContextState(state: ContextState): Promise<SerializedContextState> {
    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      index: state.index.serialize(),
      currentFiles: [...state.currentFiles],
      userPreferences: { ...state.userPreferences },
      sessionMetadata: { ...state.sessionMetadata }
    };
  }

  /**
   * Deserialize context state from storage
   */
  async deserializeContextState(serialized: Partial<SerializedContextState>): Promise<ContextState> {
    let index: SemanticIndex;
    
    try {
      if (serialized.index && typeof serialized.index === 'string') {
        index = SemanticIndex.deserialize(serialized.index);
      } else {
        index = new SemanticIndex();
      }
    } catch (error) {
      console.warn('Failed to deserialize semantic index, creating new one:', error);
      index = new SemanticIndex();
    }

    const scorer = new FileRelevanceScorer(index);
    const sampler = new ContentSampler(index);

    return {
      index,
      scorer,
      sampler,
      currentFiles: Array.isArray(serialized.currentFiles) ? serialized.currentFiles : [],
      userPreferences: serialized.userPreferences || {},
      sessionMetadata: {
        startTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        totalQueries: 0,
        ...serialized.sessionMetadata
      }
    };
  }

  /**
   * Save context state to session.json with retry mechanism
   */
  async saveToSession(state: ContextState, retryCount: number = 3): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const serialized = await this.serializeContextState(state);
        
        // Ensure directory exists
        const sessionDir = path.dirname(this.sessionPath);
        await fs.mkdir(sessionDir, { recursive: true });
        
        // Write to session.json
        await fs.writeFile(this.sessionPath, JSON.stringify(serialized, null, 2), 'utf-8');
        
        // Success - exit retry loop
        return;
        
      } catch (error: any) {
        lastError = error;
        
        // Log error with context
        const errorType = this.classifyError(error);
        console.error(`Failed to save to session.json (attempt ${attempt}/${retryCount}):`, {
          error: error.message,
          type: errorType,
          code: error.code,
          path: this.sessionPath
        });
        
        // Handle different error types
        if (errorType === 'DISK_FULL' || errorType === 'PERMISSION_DENIED') {
          // These errors are unlikely to resolve with retry, break early
          console.warn(`Critical error detected (${errorType}), attempting fallback immediately`);
          break;
        }
        
        // Wait before retry for transient errors
        if (attempt < retryCount && errorType === 'TRANSIENT') {
          await this.delay(Math.pow(2, attempt - 1) * 100); // Exponential backoff
        }
      }
    }
    
    // All retries failed, attempt fallback
    try {
      console.warn('All session.json save attempts failed, using memory fallback');
      await this.saveToMemory(state, 'fallback-context-state', true); // throwOnError=true for fallback
      
      // Don't throw original error if fallback succeeds - graceful degradation
      console.info('Context state saved to memory system as fallback');
      
    } catch (memoryError) {
      console.error('Both session.json and memory fallback failed:', {
        originalError: lastError?.message,
        memoryError: (memoryError as Error).message
      });
      throw lastError || memoryError;
    }
  }

  /**
   * Load context state from session.json
   */
  async loadFromSession(): Promise<ContextState | null> {
    try {
      const data = await fs.readFile(this.sessionPath, 'utf-8');
      const parsed = JSON.parse(data);
      return await this.deserializeContextState(parsed);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      console.warn('Failed to load from session.json:', error);
      return null;
    }
  }

  /**
   * Load context state from session.json with retry mechanism
   */
  async loadFromSessionWithRetry(retryCount: number = 2): Promise<ContextState | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const data = await fs.readFile(this.sessionPath, 'utf-8');
        const parsed = JSON.parse(data);
        return await this.deserializeContextState(parsed);
      } catch (error: any) {
        lastError = error;
        
        if (error.code === 'ENOENT') {
          return null; // File doesn't exist - no point retrying
        }

        // For JSON parse errors, don't retry
        if (error instanceof SyntaxError) {
          console.warn('Session file contains invalid JSON, cannot recover:', error.message);
          return null;
        }

        // Log retry attempt
        console.warn(`Failed to load session.json (attempt ${attempt}/${retryCount}):`, error.message);
        
        // Wait before retry
        if (attempt < retryCount) {
          await this.delay(100 * attempt); // Linear backoff for read operations
        }
      }
    }
    
    console.error('All attempts to load session.json failed:', lastError?.message);
    return null;
  }

  /**
   * Update cost analytics data in session metadata
   */
  async updateSessionCostAnalytics(
    sessionId: string,
    costData: {
      totalCost: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      interactionCount: number;
    }
  ): Promise<void> {
    try {
      // Validate input data
      if (!sessionId) {
        console.warn('Cannot update cost analytics: sessionId is required');
        return;
      }

      if (typeof costData !== 'object' || costData === null) {
        console.warn('Cannot update cost analytics: invalid costData');
        return;
      }

      // Load current session state with retry
      const currentState = await this.loadFromSessionWithRetry();
      
      if (currentState) {
        // Calculate average cost per query with safety check
        const avgCostPerQuery = costData.interactionCount > 0 
          ? Math.round((costData.totalCost / costData.interactionCount) * 10000) / 10000 // Round to 4 decimal places
          : 0;
        
        // Update cost analytics in session metadata
        currentState.sessionMetadata.costAnalytics = {
          totalCost: Math.max(0, costData.totalCost || 0),
          totalInputTokens: Math.max(0, costData.totalInputTokens || 0),
          totalOutputTokens: Math.max(0, costData.totalOutputTokens || 0),
          interactionCount: Math.max(0, costData.interactionCount || 0),
          sessionId,
          avgCostPerQuery,
          lastCostUpdate: new Date().toISOString()
        };
        
        // Update last activity
        currentState.sessionMetadata.lastActivity = new Date().toISOString();
        
        // Save updated state (with retries built in)
        await this.saveToSession(currentState);
        
      } else {
        console.warn('Cannot update cost analytics: no session state available');
      }
    } catch (error: any) {
      console.error('Failed to update session cost analytics:', {
        error: error.message,
        sessionId,
        costData
      });
    }
  }

  /**
   * Get cost analytics data from session with enhanced error handling
   */
  async getSessionCostAnalytics(): Promise<{
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    interactionCount: number;
    sessionId: string;
    avgCostPerQuery: number;
    lastCostUpdate: string;
  } | null> {
    try {
      const sessionState = await this.loadFromSessionWithRetry();
      
      if (!sessionState) {
        return null;
      }
      
      const costAnalytics = sessionState.sessionMetadata?.costAnalytics;
      
      if (!costAnalytics) {
        return null;
      }
      
      // Validate and sanitize the cost analytics data
      return {
        totalCost: Math.max(0, costAnalytics.totalCost || 0),
        totalInputTokens: Math.max(0, costAnalytics.totalInputTokens || 0),
        totalOutputTokens: Math.max(0, costAnalytics.totalOutputTokens || 0),
        interactionCount: Math.max(0, costAnalytics.interactionCount || 0),
        sessionId: costAnalytics.sessionId || 'unknown',
        avgCostPerQuery: Math.max(0, costAnalytics.avgCostPerQuery || 0),
        lastCostUpdate: costAnalytics.lastCostUpdate || new Date().toISOString()
      };
    } catch (error: any) {
      console.error('Failed to get session cost analytics:', error.message);
      return null;
    }
  }

  /**
   * Initialize cost analytics for a new session with enhanced error handling
   */
  async initializeSessionCostAnalytics(sessionId: string): Promise<void> {
    try {
      // Validate session ID
      if (!sessionId || typeof sessionId !== 'string') {
        console.warn('Cannot initialize cost analytics: invalid sessionId');
        return;
      }

      const currentState = await this.loadFromSessionWithRetry();
      
      if (currentState) {
        // Only initialize if not already present
        if (!currentState.sessionMetadata.costAnalytics) {
          currentState.sessionMetadata.costAnalytics = {
            totalCost: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            interactionCount: 0,
            sessionId,
            avgCostPerQuery: 0,
            lastCostUpdate: new Date().toISOString()
          };
          
          // Update session metadata
          currentState.sessionMetadata.lastActivity = new Date().toISOString();
          
          // Save with built-in retry mechanism
          await this.saveToSession(currentState);
        }
      } else {
        console.warn('Cannot initialize cost analytics: no session state available');
      }
    } catch (error: any) {
      console.error('Failed to initialize session cost analytics:', {
        error: error.message,
        sessionId
      });
    }
  }

  /**
   * Save context state to memory system
   */
  async saveToMemory(state: ContextState, memoryId: string, throwOnError: boolean = false): Promise<void> {
    try {
      const serialized = await this.serializeContextState(state);
      
      await this.memoryManager.addMemory({
        id: memoryId,
        type: 'context',
        content: JSON.stringify(serialized),
        timestamp: new Date().toISOString(),
        tags: ['context', 'session', 'persistent'],
        metadata: {
          priority: 'high'
        }
      });
    } catch (error) {
      console.warn('Failed to save context to memory system:', error);
      if (throwOnError) {
        throw error; // Re-throw when used as a fallback that needs to fail
      }
      // Otherwise, silently fail for "best effort" operations
    }
  }

  /**
   * Load context state from memory system
   */
  async loadFromMemory(memoryId: string): Promise<ContextState | null> {
    try {
      const memories = await this.memoryManager.getAllMemories();
      const entry = memories.find(m => m.id === memoryId && m.type === 'context');
      
      if (!entry) {
        return null;
      }
      
      const parsed = JSON.parse(entry.content);
      return await this.deserializeContextState(parsed);
    } catch (error) {
      console.warn('Failed to load context from memory system:', error);
      return null;
    }
  }

  /**
   * Create a context history snapshot
   */
  async createHistorySnapshot(
    state: ContextState, 
    reason: string, 
    description?: string
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const historyId = `context-history-${timestamp}`;
      const serialized = await this.serializeContextState(state);
      
      await this.memoryManager.addMemory({
        id: historyId,
        type: 'session',
        content: JSON.stringify({
          snapshot: serialized,
          reason,
          description,
          timestamp: new Date().toISOString()
        }),
        timestamp: new Date().toISOString(),
        tags: ['context', 'history', 'snapshot'],
        metadata: {
          priority: 'medium'
        }
      });
      
      // Cleanup old history entries
      await this.cleanupHistory();
    } catch (error) {
      console.warn('Failed to create context history snapshot:', error);
    }
  }

  /**
   * Get context history entries
   */
  async getContextHistory(): Promise<HistoryEntry[]> {
    try {
      const memories = await this.memoryManager.getAllMemories();
      const historyEntries = memories.filter(m => 
        m.type === 'session' && 
        m.tags?.includes('context') && 
        m.tags?.includes('history')
      );
      
      return historyEntries
        .map(entry => {
          try {
            const parsed = JSON.parse(entry.content);
            return {
              id: entry.id,
              timestamp: new Date(entry.timestamp),
              reason: parsed.reason || 'unknown',
              description: parsed.description
            };
          } catch {
            return {
              id: entry.id,
              timestamp: new Date(entry.timestamp),
              reason: 'unknown',
              description: undefined
            };
          }
        })
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.warn('Failed to get context history:', error);
      return [];
    }
  }

  /**
   * Smart context resumption with intelligent merging
   */
  async smartResume(
    savedState: Partial<ContextState>, 
    currentState: Partial<ContextState>,
    options: ResumeOptions = {}
  ): Promise<ContextState> {
    const opts = {
      preferSaved: true,
      mergeFiles: true,
      validateState: true,
      ...options
    };

    // Merge current files
    const mergedFiles = opts.mergeFiles 
      ? await this.resolveFileConflicts(
          savedState.currentFiles || [],
          currentState.currentFiles || [],
          { preferSaved: opts.preferSaved }
        )
      : opts.preferSaved 
        ? savedState.currentFiles || []
        : currentState.currentFiles || [];

    // Merge user preferences (saved takes precedence for existing keys)
    const mergedPreferences = {
      ...(currentState.userPreferences || {}),
      ...(savedState.userPreferences || {})
    };

    // Merge session metadata
    const totalQueries = (savedState.sessionMetadata?.totalQueries || 0) + (currentState.sessionMetadata?.totalQueries || 0);
    const mergedMetadata = {
      startTime: savedState.sessionMetadata?.startTime || new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ...(currentState.sessionMetadata || {}),
      ...(savedState.sessionMetadata || {}),
      totalQueries // Override with the calculated sum
    };

    // Create merged state
    const merged: ContextState = {
      index: savedState.index || currentState.index || new SemanticIndex(),
      scorer: savedState.scorer || currentState.scorer || new FileRelevanceScorer(new SemanticIndex()),
      sampler: savedState.sampler || currentState.sampler || new ContentSampler(new SemanticIndex()),
      currentFiles: mergedFiles,
      userPreferences: mergedPreferences,
      sessionMetadata: mergedMetadata
    };

    // Validate if requested
    if (opts.validateState && !(await this.validateContextState(merged))) {
      throw new Error('Merged context state failed validation');
    }

    return merged;
  }

  /**
   * Resolve file conflicts during context merge
   */
  async resolveFileConflicts(
    savedFiles: string[],
    currentFiles: string[],
    options: { preferSaved?: boolean } = {}
  ): Promise<string[]> {
    const allFiles = new Set<string>();
    
    if (options.preferSaved) {
      // Add saved files first, then current files
      savedFiles.forEach(file => allFiles.add(file));
      currentFiles.forEach(file => allFiles.add(file));
    } else {
      // Add current files first, then saved files  
      currentFiles.forEach(file => allFiles.add(file));
      savedFiles.forEach(file => allFiles.add(file));
    }
    
    return Array.from(allFiles);
  }

  /**
   * Validate context state integrity
   */
  async validateContextState(state: any): Promise<boolean> {
    try {
      // Check required properties
      if (!state || typeof state !== 'object') {
        return false;
      }

      // Validate currentFiles
      if (!Array.isArray(state.currentFiles)) {
        return false;
      }

      // Validate userPreferences
      if (state.userPreferences && typeof state.userPreferences !== 'object') {
        return false;
      }

      // Validate sessionMetadata
      if (state.sessionMetadata && typeof state.sessionMetadata !== 'object') {
        return false;
      }

      // Validate components exist
      if (!state.index || !state.scorer || !state.sampler) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Export context configuration
   */
  async exportConfiguration(state: ContextState): Promise<ExportData> {
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      configuration: {
        userPreferences: { ...state.userPreferences },
        currentFiles: [...state.currentFiles],
        sessionSettings: {
          totalQueries: state.sessionMetadata.totalQueries,
          startTime: state.sessionMetadata.startTime
        }
      }
    };
  }

  /**
   * Import context configuration
   */
  async importConfiguration(data: ExportData): Promise<ContextState> {
    // Validate import data
    if (!data || !data.version || !data.configuration) {
      throw new Error('Invalid import data format');
    }

    // Check version compatibility
    if (data.version !== '1.0.0') {
      console.warn(`Importing from version ${data.version}, compatibility not guaranteed`);
    }

    const config = data.configuration;
    const index = new SemanticIndex();
    
    return {
      index,
      scorer: new FileRelevanceScorer(index),
      sampler: new ContentSampler(index),
      currentFiles: Array.isArray(config.currentFiles) ? config.currentFiles : [],
      userPreferences: config.userPreferences || {},
      sessionMetadata: {
        startTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        totalQueries: config.sessionSettings?.totalQueries || 0,
        importedAt: new Date().toISOString(),
        importedFrom: data.exportedAt
      }
    };
  }

  /**
   * Merge context state with existing orchestrator session data
   */
  async mergeWithExistingSession(
    contextState: ContextState,
    existingSessionData: any
  ): Promise<any> {
    return {
      ...existingSessionData,
      contextManager: {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        currentFiles: contextState.currentFiles,
        userPreferences: contextState.userPreferences,
        sessionMetadata: contextState.sessionMetadata
      }
    };
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(() => {
      // Auto-save would be triggered by the context manager
      // This is just the timer setup
    }, this.options.autoSaveInterval);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  /**
   * Cleanup old history entries
   * Note: Currently disabled as MemoryManager doesn't provide delete functionality
   */
  private async cleanupHistory(): Promise<void> {
    try {
      // TODO: Implement cleanup when MemoryManager supports deletion
      // const entries = await this.getContextHistory();
      // const maxEntries = this.options.maxHistoryEntries || 50;
      // if (entries.length > maxEntries) {
      //   // Delete oldest entries
      // }
    } catch (error) {
      console.warn('Failed to cleanup context history:', error);
    }
  }

  /**
   * Classify error types for appropriate handling
   */
  private classifyError(error: any): 'DISK_FULL' | 'PERMISSION_DENIED' | 'TRANSIENT' | 'UNKNOWN' {
    if (!error.code) return 'UNKNOWN';
    
    switch (error.code) {
      case 'ENOSPC':
        return 'DISK_FULL';
      case 'EACCES':
      case 'EPERM':
        return 'PERMISSION_DENIED';
      case 'EMFILE':
      case 'ENFILE':
      case 'EAGAIN':
      case 'EBUSY':
      case 'ETIMEDOUT':
        return 'TRANSIENT';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Delay helper for retry mechanism
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown persistence manager
   */
  async shutdown(): Promise<void> {
    this.stopAutoSave();
  }
}