import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { AuditEntry, AuditSearchCriteria } from './types.js';

/**
 * Advanced indexing system for audit entries
 * Provides fast search capabilities through various index structures
 */

export interface IndexEntry {
  entryId: string;
  fileName: string;
  position: number; // Position in file for direct access
  indexed_at: Date;
}

export interface IndexStats {
  total_entries: number;
  index_files: number;
  last_rebuild: Date;
  index_size_bytes: number;
  search_performance: {
    average_query_time_ms: number;
    cache_hit_ratio: number;
    total_queries: number;
  };
}

export interface IndexOptions {
  indexDirectory?: string;
  rebuildThreshold?: number; // Number of new entries before rebuild
  enableInMemoryCache?: boolean;
  cacheSize?: number;
  enablePerformanceTracking?: boolean;
}

/**
 * Multi-dimensional index system for fast audit entry retrieval
 */
export class AuditIndexer extends EventEmitter {
  private options: Required<IndexOptions>;
  private indexes: Map<string, Map<string, IndexEntry[]>> = new Map();
  private entryCache: Map<string, AuditEntry> = new Map();
  private performanceMetrics: {
    query_times: number[];
    cache_hits: number;
    cache_misses: number;
  } = { query_times: [], cache_hits: 0, cache_misses: 0 };
  private lastRebuild: Date = new Date(0);
  private newEntriesCount = 0;

  constructor(options: IndexOptions = {}) {
    super();
    
    this.options = {
      indexDirectory: options.indexDirectory || path.join(process.cwd(), '.plato', 'audit-indexes'),
      rebuildThreshold: options.rebuildThreshold || 1000,
      enableInMemoryCache: options.enableInMemoryCache !== false,
      cacheSize: options.cacheSize || 10000,
      enablePerformanceTracking: options.enablePerformanceTracking !== false
    };
  }

  /**
   * Initialize the indexer and load existing indexes
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.options.indexDirectory, { recursive: true });
      await this.loadIndexes();
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Add entry to indexes
   */
  async addEntry(entry: AuditEntry, fileName: string, position: number): Promise<void> {
    const indexEntry: IndexEntry = {
      entryId: entry.id,
      fileName,
      position,
      indexed_at: new Date()
    };

    // Index by various fields for fast lookup
    this.addToIndex('tool', entry.query.tool, indexEntry);
    this.addToIndex('action', entry.result.action, indexEntry);
    this.addToIndex('level', entry.metadata?.level || 'info', indexEntry);
    this.addToIndex('category', entry.metadata?.category || 'permission', indexEntry);
    this.addToIndex('source', entry.context?.source || 'unknown', indexEntry);
    
    if (entry.profile) {
      this.addToIndex('profile', entry.profile, indexEntry);
    }
    
    if (entry.session_id) {
      this.addToIndex('session_id', entry.session_id, indexEntry);
    }

    if (entry.context?.git_context?.branch) {
      this.addToIndex('git_branch', entry.context.git_context.branch, indexEntry);
    }

    if (entry.metadata?.tags) {
      for (const tag of entry.metadata.tags) {
        this.addToIndex('tag', tag, indexEntry);
      }
    }

    // Risk score range indexing
    if (entry.metadata?.risk_score !== undefined) {
      const riskRange = this.getRiskScoreRange(entry.metadata.risk_score);
      this.addToIndex('risk_range', riskRange, indexEntry);
    }

    // Time-based indexing (by hour for efficient range queries)
    const timeKey = this.getTimeKey(entry.timestamp);
    this.addToIndex('time_hour', timeKey, indexEntry);

    // Cache the entry if caching is enabled
    if (this.options.enableInMemoryCache) {
      this.addToCache(entry);
    }

    this.newEntriesCount++;

    // Check if rebuild is needed
    if (this.newEntriesCount >= this.options.rebuildThreshold) {
      await this.rebuildIndexes();
    }

    this.emit('entryIndexed', { entryId: entry.id, indexEntry });
  }

  /**
   * Search entries using indexes
   */
  async search(criteria: AuditSearchCriteria): Promise<IndexEntry[]> {
    const startTime = Date.now();
    let results: IndexEntry[] = [];

    try {
      // Build search query from criteria
      const searchQueries = this.buildSearchQueries(criteria);
      
      if (searchQueries.length === 0) {
        // No specific criteria, return all entries with time range
        results = this.searchByTimeRange(criteria.startDate, criteria.endDate);
      } else {
        // Intersect results from all queries
        results = this.intersectSearchResults(searchQueries);
      }

      // Apply additional filtering that can't be indexed
      results = this.applyPostIndexFiltering(results, criteria);

      // Apply sorting and pagination
      results = this.sortAndPaginate(results, criteria);

      this.trackQueryPerformance(startTime);
      return results;

    } catch (error) {
      this.emit('searchError', { criteria, error });
      throw error;
    }
  }

  /**
   * Get entry from cache or file
   */
  async getEntry(indexEntry: IndexEntry): Promise<AuditEntry | null> {
    // Try cache first
    if (this.options.enableInMemoryCache && this.entryCache.has(indexEntry.entryId)) {
      this.performanceMetrics.cache_hits++;
      return this.entryCache.get(indexEntry.entryId)!;
    }

    this.performanceMetrics.cache_misses++;

    try {
      // Read from file at specific position
      const filePath = path.join(path.dirname(this.options.indexDirectory), 'audit-logs', indexEntry.fileName);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Find the entry by position (approximate)
      for (let i = Math.max(0, indexEntry.position - 10); i < Math.min(lines.length, indexEntry.position + 10); i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const entry = JSON.parse(line) as AuditEntry;
          if (entry.id === indexEntry.entryId) {
            // Convert timestamp strings back to Date objects if needed
            if (typeof entry.timestamp === 'string') {
              entry.timestamp = new Date(entry.timestamp);
            }
            if (typeof entry.result.timestamp === 'string') {
              entry.result.timestamp = new Date(entry.result.timestamp);
            }

            // Add to cache
            if (this.options.enableInMemoryCache) {
              this.addToCache(entry);
            }

            return entry;
          }
        } catch (parseError) {
          continue; // Skip malformed lines
        }
      }

      return null;
    } catch (error) {
      this.emit('retrievalError', { indexEntry, error });
      return null;
    }
  }

  /**
   * Get indexing statistics
   */
  getStats(): IndexStats {
    const totalEntries = Array.from(this.indexes.values())
      .reduce((sum, index) => sum + Array.from(index.values()).reduce((s, entries) => s + entries.length, 0), 0);

    const avgQueryTime = this.performanceMetrics.query_times.length > 0
      ? this.performanceMetrics.query_times.reduce((sum, time) => sum + time, 0) / this.performanceMetrics.query_times.length
      : 0;

    const cacheHitRatio = (this.performanceMetrics.cache_hits + this.performanceMetrics.cache_misses) > 0
      ? this.performanceMetrics.cache_hits / (this.performanceMetrics.cache_hits + this.performanceMetrics.cache_misses)
      : 0;

    return {
      total_entries: totalEntries,
      index_files: this.indexes.size,
      last_rebuild: this.lastRebuild,
      index_size_bytes: this.calculateIndexSize(),
      search_performance: {
        average_query_time_ms: avgQueryTime,
        cache_hit_ratio: cacheHitRatio,
        total_queries: this.performanceMetrics.query_times.length
      }
    };
  }

  /**
   * Rebuild all indexes from scratch
   */
  async rebuildIndexes(): Promise<void> {
    try {
      this.emit('rebuildStarted');
      
      // Clear existing indexes
      this.indexes.clear();
      this.entryCache.clear();
      
      // Save empty indexes to disk
      await this.saveIndexes();
      
      this.lastRebuild = new Date();
      this.newEntriesCount = 0;
      
      this.emit('rebuildCompleted', { timestamp: this.lastRebuild });
    } catch (error) {
      this.emit('rebuildError', error);
      throw error;
    }
  }

  /**
   * Optimize indexes by removing duplicates and compacting
   */
  async optimize(): Promise<void> {
    try {
      this.emit('optimizationStarted');

      for (const [indexName, index] of this.indexes) {
        for (const [key, entries] of index) {
          // Remove duplicates
          const uniqueEntries = entries.filter((entry, index, self) =>
            index === self.findIndex(e => e.entryId === entry.entryId)
          );
          
          // Sort by indexed_at for better cache locality
          uniqueEntries.sort((a, b) => a.indexed_at.getTime() - b.indexed_at.getTime());
          
          index.set(key, uniqueEntries);
        }
      }

      await this.saveIndexes();
      this.emit('optimizationCompleted');
    } catch (error) {
      this.emit('optimizationError', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.saveIndexes();
    this.indexes.clear();
    this.entryCache.clear();
    this.removeAllListeners();
  }

  // Private helper methods

  private addToIndex(indexName: string, key: string, entry: IndexEntry): void {
    if (!this.indexes.has(indexName)) {
      this.indexes.set(indexName, new Map());
    }
    
    const index = this.indexes.get(indexName)!;
    if (!index.has(key)) {
      index.set(key, []);
    }
    
    index.get(key)!.push(entry);
  }

  private addToCache(entry: AuditEntry): void {
    if (this.entryCache.size >= this.options.cacheSize) {
      // Remove oldest entries (simple LRU approximation)
      const keysToRemove = Array.from(this.entryCache.keys()).slice(0, Math.floor(this.options.cacheSize * 0.1));
      keysToRemove.forEach(key => this.entryCache.delete(key));
    }
    
    this.entryCache.set(entry.id, entry);
  }

  private getRiskScoreRange(score: number): string {
    if (score < 33) return 'low';
    if (score < 67) return 'medium';
    return 'high';
  }

  private getTimeKey(timestamp: Date): string {
    return timestamp.toISOString().substring(0, 13); // YYYY-MM-DDTHH
  }

  private buildSearchQueries(criteria: AuditSearchCriteria): Array<{ index: string; key: string }> {
    const queries: Array<{ index: string; key: string }> = [];

    if (criteria.tool) queries.push({ index: 'tool', key: criteria.tool });
    if (criteria.action) queries.push({ index: 'action', key: criteria.action });
    if (criteria.level) queries.push({ index: 'level', key: criteria.level });
    if (criteria.category) queries.push({ index: 'category', key: criteria.category });
    if (criteria.source) queries.push({ index: 'source', key: criteria.source });
    if (criteria.profile) queries.push({ index: 'profile', key: criteria.profile });
    if (criteria.sessionId) queries.push({ index: 'session_id', key: criteria.sessionId });
    if (criteria.git_branch) queries.push({ index: 'git_branch', key: criteria.git_branch });

    if (criteria.tags && criteria.tags.length > 0) {
      criteria.tags.forEach(tag => queries.push({ index: 'tag', key: tag }));
    }

    return queries;
  }

  private intersectSearchResults(queries: Array<{ index: string; key: string }>): IndexEntry[] {
    if (queries.length === 0) return [];

    // Start with first query results
    let results = this.getIndexEntries(queries[0].index, queries[0].key);

    // Intersect with each subsequent query
    for (let i = 1; i < queries.length; i++) {
      const queryResults = this.getIndexEntries(queries[i].index, queries[i].key);
      const resultIds = new Set(queryResults.map(r => r.entryId));
      results = results.filter(r => resultIds.has(r.entryId));
    }

    return results;
  }

  private getIndexEntries(indexName: string, key: string): IndexEntry[] {
    const index = this.indexes.get(indexName);
    if (!index) return [];
    
    return index.get(key) || [];
  }

  private searchByTimeRange(startDate?: Date, endDate?: Date): IndexEntry[] {
    if (!startDate && !endDate) {
      // Return all entries
      const allEntries: IndexEntry[] = [];
      for (const index of this.indexes.values()) {
        for (const entries of index.values()) {
          allEntries.push(...entries);
        }
      }
      return allEntries;
    }

    const timeIndex = this.indexes.get('time_hour');
    if (!timeIndex) return [];

    const results: IndexEntry[] = [];
    const startKey = startDate ? this.getTimeKey(startDate) : '';
    const endKey = endDate ? this.getTimeKey(endDate) : 'Z'; // Z is after all valid ISO dates

    for (const [timeKey, entries] of timeIndex) {
      if (timeKey >= startKey && timeKey <= endKey) {
        results.push(...entries);
      }
    }

    return results;
  }

  private applyPostIndexFiltering(results: IndexEntry[], criteria: AuditSearchCriteria): IndexEntry[] {
    // Apply filters that couldn't be handled by indexes
    if (criteria.risk_score_min !== undefined || criteria.risk_score_max !== undefined ||
        criteria.has_user_decision !== undefined || criteria.cache_hit !== undefined) {
      
      // These filters require loading the actual entries
      // For now, return all results and let the caller filter
      // In a production system, we might want to implement secondary indexes
    }

    return results;
  }

  private sortAndPaginate(results: IndexEntry[], criteria: AuditSearchCriteria): IndexEntry[] {
    // Sort by indexed_at (which correlates with timestamp for most cases)
    const sortOrder = criteria.sort_order || 'desc';
    results.sort((a, b) => {
      const aTime = a.indexed_at.getTime();
      const bTime = b.indexed_at.getTime();
      return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
    });

    // Apply pagination
    if (criteria.offset) {
      results = results.slice(criteria.offset);
    }
    
    if (criteria.limit) {
      results = results.slice(0, criteria.limit);
    }

    return results;
  }

  private trackQueryPerformance(startTime: number): void {
    if (!this.options.enablePerformanceTracking) return;

    const queryTime = Date.now() - startTime;
    this.performanceMetrics.query_times.push(queryTime);

    // Keep only last 1000 query times to prevent memory bloat
    if (this.performanceMetrics.query_times.length > 1000) {
      this.performanceMetrics.query_times = this.performanceMetrics.query_times.slice(-1000);
    }
  }

  private calculateIndexSize(): number {
    // Rough estimation of index size in memory
    let size = 0;
    for (const index of this.indexes.values()) {
      for (const [key, entries] of index) {
        size += key.length * 2; // String size approximation
        size += entries.length * 100; // IndexEntry size approximation
      }
    }
    return size;
  }

  private async loadIndexes(): Promise<void> {
    try {
      const indexFiles = await fs.readdir(this.options.indexDirectory);
      
      for (const fileName of indexFiles) {
        if (fileName.endsWith('.index.json')) {
          const filePath = path.join(this.options.indexDirectory, fileName);
          const content = await fs.readFile(filePath, 'utf8');
          const indexData = JSON.parse(content);
          
          const indexName = fileName.replace('.index.json', '');
          const index = new Map<string, IndexEntry[]>();
          
          for (const [key, entries] of Object.entries(indexData)) {
            index.set(key, entries as IndexEntry[]);
          }
          
          this.indexes.set(indexName, index);
        }
      }

      this.emit('indexesLoaded', { count: this.indexes.size });
    } catch (error) {
      // Indexes don't exist yet, which is fine
      this.emit('indexesInitialized');
    }
  }

  private async saveIndexes(): Promise<void> {
    for (const [indexName, index] of this.indexes) {
      const fileName = `${indexName}.index.json`;
      const filePath = path.join(this.options.indexDirectory, fileName);
      
      // Convert Map to object for JSON serialization
      const indexData: Record<string, IndexEntry[]> = {};
      for (const [key, entries] of index) {
        indexData[key] = entries;
      }
      
      await fs.writeFile(filePath, JSON.stringify(indexData, null, 2), 'utf8');
    }
  }
}