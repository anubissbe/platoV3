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

export interface PersistenceOptions {
  sessionPath?: string;
  memoryPath?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
  maxHistoryEntries?: number;
}

export interface StatisticsSnapshot {
  totalEntriesStored: number;
  contextStateSize: number;
  lastPersistenceTime: string;
  autoSaveEnabled: boolean;
  hitRate?: number;
  avgSerializationTime: number;
  totalDiskUsage: number;
}

export interface CostAnalytics {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  interactionCount: number;
  sessionId: string;
  avgCostPerQuery: number;
  lastCostUpdate: string;
}

export interface ErrorContext {
  operation: string;
  error: string;
  timestamp: string;
  path?: string;
}

/**
 * Main persistence manager for context state
 */
export class ContextPersistenceManager {
  private memoryManager: MemoryManager;
  private sessionPath: string;
  private options: PersistenceOptions;
  private autoSaveTimer?: any;

  constructor(options: PersistenceOptions = {}) {
    // Disable autosave in test mode to prevent memory leaks
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.PLATO_TEST_MODE === 'true';
    
    this.options = {
      sessionPath: '.plato/session.json',
      memoryPath: '.plato/memory',
      autoSave: isTestMode ? false : true, // Disable autosave in tests
      autoSaveInterval: 30000, // 30 seconds
      maxHistoryEntries: 50,
      ...options
    };

    this.sessionPath = this.options.sessionPath!;
    this.memoryManager = new MemoryManager({
      memoryDir: this.options.memoryPath!
    });
    
    if (this.options.autoSave && !isTestMode) {
      this.startAutoSave();
    }
  }

  /**
   * Cleanup resources and stop timers - essential for tests
   */
  destroy(): void {
    this.stopAutoSave();
    // Additional cleanup if needed - remove MemoryManager destroy call since it doesn't exist
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
  async saveToSession(state: ContextState, retryCount = 3): Promise<boolean> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const serialized = await this.serializeContextState(state);
        
        // Ensure directory exists
        const sessionDir = path.dirname(this.sessionPath);
        await fs.mkdir(sessionDir, { recursive: true });
        
        // Write to file
        await fs.writeFile(this.sessionPath, JSON.stringify(serialized, null, 2));
        return true;
        
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
        
        // Wait before retry (except on last attempt)
        if (attempt < retryCount) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    // Memory fallback attempt - skip if MemoryManager doesn't have the method
    try {
      if (this.memoryManager && typeof (this.memoryManager as any).remember === 'function') {
        const memoryKey = `session_backup_${Date.now()}`;
        await (this.memoryManager as any).remember(memoryKey, {
          content: 'Session backup due to file write failure',
          metadata: { contextState: await this.serializeContextState(state) }
        });
        
        console.warn('Session saved to memory fallback due to file write failure');
        return true;
      }
      
    } catch (memoryError) {
      console.error('Both session.json and memory fallback failed:', {
        originalError: lastError?.message,
        memoryError: (memoryError as Error).message
      });
    }
    
    return false;
  }

  /**
   * Load context state from session.json
   */
  async loadFromSession(): Promise<ContextState | null> {
    try {
      const content = await fs.readFile(this.sessionPath, 'utf-8');
      const serialized = JSON.parse(content) as SerializedContextState;
      
      // Validate the loaded data
      if (!serialized.version || !serialized.timestamp) {
        console.warn('Invalid session data structure, creating new context');
        return null;
      }
      
      return await this.deserializeContextState(serialized);
      
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return null to create new context
        return null;
      }
      
      console.error('Error loading session:', {
        error: error.message,
        code: error.code,
        path: this.sessionPath
      });
      
      // Try memory fallback - skip if MemoryManager doesn't have the method
      try {
        if (this.memoryManager && typeof (this.memoryManager as any).recall === 'function') {
          const memories = await (this.memoryManager as any).recall('session_backup');
          if (memories.length > 0) {
            const latestBackup = memories[0];
            if (latestBackup.metadata?.contextState) {
              console.info('Restored session from memory fallback');
              return await this.deserializeContextState(latestBackup.metadata.contextState);
            }
          }
        }
      } catch (memoryError) {
        console.warn('Memory fallback also failed:', (memoryError as Error).message);
      }
      
      return null;
    }
  }

  /**
   * Store context entry in memory
   */
  async storeContextEntry(key: string, entry: MemoryEntry): Promise<void> {
    try {
      if (this.memoryManager && typeof (this.memoryManager as any).remember === 'function') {
        await (this.memoryManager as any).remember(key, entry);
      }
    } catch (error) {
      console.error(`Failed to store context entry '${key}':`, error);
      throw error;
    }
  }

  /**
   * Retrieve context entries from memory
   */
  async getContextHistory(query?: string): Promise<MemoryEntry[]> {
    try {
      if (this.memoryManager && typeof (this.memoryManager as any).recall === 'function') {
        return await (this.memoryManager as any).recall(query || '');
      }
      return [];
    } catch (error) {
      console.error('Failed to retrieve context history:', error);
      return [];
    }
  }

  /**
   * Apply context configuration
   */
  async applyConfiguration(config: ContextConfiguration): Promise<ContextState> {
    // Load existing state or create new
    let state = await this.loadFromSession();
    
    if (!state) {
      state = await this.deserializeContextState({});
    }
    
    // Apply configuration updates
    state.userPreferences = { ...state.userPreferences, ...config.userPreferences };
    state.currentFiles = [...config.currentFiles];
    
    if (config.sessionSettings) {
      state.sessionMetadata = { ...state.sessionMetadata, ...config.sessionSettings };
    }
    
    // Save updated state
    await this.saveToSession(state);
    
    return state;
  }

  /**
   * Get persistence statistics
   */
  async getStatistics(): Promise<StatisticsSnapshot> {
    const stats: StatisticsSnapshot = {
      totalEntriesStored: 0,
      contextStateSize: 0,
      lastPersistenceTime: 'never',
      autoSaveEnabled: this.options.autoSave || false,
      avgSerializationTime: 0,
      totalDiskUsage: 0
    };

    try {
      // Check if session file exists and get its size
      const sessionStat = await fs.stat(this.sessionPath);
      stats.contextStateSize = sessionStat.size;
      stats.lastPersistenceTime = sessionStat.mtime.toISOString();
      stats.totalDiskUsage += sessionStat.size;
    } catch (error) {
      // Session file doesn't exist
    }

    try {
      // Get memory entries count
      const memories = await this.getContextHistory();
      stats.totalEntriesStored = memories.length;
    } catch (error) {
      console.warn('Failed to get memory statistics:', error);
    }

    return stats;
  }

  /**
   * Initialize session cost analytics
   */
  async initializeSessionCostAnalytics(sessionId: string): Promise<void> {
    try {
      const state = await this.loadFromSession();
      
      if (state) {
        if (!state.sessionMetadata.costAnalytics) {
          state.sessionMetadata.costAnalytics = {
            totalCost: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            interactionCount: 0,
            sessionId,
            avgCostPerQuery: 0,
            lastCostUpdate: new Date().toISOString()
          };
          
          await this.saveToSession(state);
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
   * Update session cost analytics
   */
  async updateSessionCostAnalytics(costDelta: Partial<CostAnalytics>): Promise<void> {
    try {
      const state = await this.loadFromSession();
      
      if (state && state.sessionMetadata.costAnalytics) {
        const analytics = state.sessionMetadata.costAnalytics;
        
        analytics.totalCost += costDelta.totalCost || 0;
        analytics.totalInputTokens += costDelta.totalInputTokens || 0;
        analytics.totalOutputTokens += costDelta.totalOutputTokens || 0;
        analytics.interactionCount += costDelta.interactionCount || 0;
        analytics.lastCostUpdate = new Date().toISOString();
        
        if (analytics.interactionCount > 0) {
          analytics.avgCostPerQuery = analytics.totalCost / analytics.interactionCount;
        }
        
        await this.saveToSession(state);
      } else {
        console.warn('Cannot update cost analytics: no session state available');
      }
    } catch (error: any) {
      console.error('Failed to update session cost analytics:', {
        error: error.message,
        costDelta
      });
    }
  }

  /**
   * Get current session cost analytics
   */
  async getSessionCostAnalytics(): Promise<CostAnalytics | null> {
    try {
      const state = await this.loadFromSession();
      return state?.sessionMetadata.costAnalytics || null;
    } catch (error) {
      console.error('Failed to get session cost analytics:', error);
      return null;
    }
  }

  /**
   * Reset session cost analytics
   */
  async resetSessionCostAnalytics(sessionId: string): Promise<void> {
    try {
      const state = await this.loadFromSession();
      
      if (state) {
        state.sessionMetadata.costAnalytics = {
          totalCost: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          interactionCount: 0,
          sessionId,
          avgCostPerQuery: 0,
          lastCostUpdate: new Date().toISOString()
        };
        
        await this.saveToSession(state);
      }
    } catch (error: any) {
      console.error('Failed to reset session cost analytics:', {
        error: error.message,
        sessionId
      });
    }
  }

  /**
   * Classify error types for better handling
   */
  private classifyError(error: any): string {
    if (error.code === 'ENOSPC') return 'DISK_FULL';
    if (error.code === 'EACCES') return 'PERMISSION_DENIED';
    if (error.code === 'ENOENT') return 'PATH_NOT_FOUND';
    if (error.code === 'EMFILE') return 'TOO_MANY_FILES';
    if (error.name === 'SyntaxError') return 'JSON_PARSE_ERROR';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    // Use testUtils.setInterval in test mode for proper cleanup
    const globalTestUtils = (global as any).testUtils;
    if (process.env.NODE_ENV === 'test' && globalTestUtils) {
      this.autoSaveTimer = globalTestUtils.setInterval(() => {
        // Auto-save would be triggered by the context manager
        // This is just the timer setup
      }, this.options.autoSaveInterval!);
    } else {
      this.autoSaveTimer = setInterval(() => {
        // Auto-save would be triggered by the context manager
        // This is just the timer setup
      }, this.options.autoSaveInterval!);
    }
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
}

/**
 * Global instance for session persistence
 * Gets initialized when first needed to avoid early timer creation
 */
let globalPersistenceManager: ContextPersistenceManager | null = null;

export function getPersistenceManager(options?: PersistenceOptions): ContextPersistenceManager {
  if (!globalPersistenceManager) {
    globalPersistenceManager = new ContextPersistenceManager(options);
    
    // Clean up on process exit
    process.on('exit', () => {
      if (globalPersistenceManager) {
        globalPersistenceManager.destroy();
      }
    });
    
    process.on('SIGINT', () => {
      if (globalPersistenceManager) {
        globalPersistenceManager.destroy();
      }
      process.exit(0);
    });
  }
  return globalPersistenceManager;
}

/**
 * Reset global persistence manager - used for tests
 */
export function resetPersistenceManager(): void {
  if (globalPersistenceManager) {
    globalPersistenceManager.destroy();
    globalPersistenceManager = null;
  }
}