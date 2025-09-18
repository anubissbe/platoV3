/**
 * Intelligent Cache Manager for Plato TUI Commands
 *
 * Provides smart caching with TTL, LRU eviction, and performance-aware strategies
 * for optimizing command execution and external service calls.
 */

import { performance } from 'perf_hooks';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { commandPerformanceMonitor } from './performance-monitor.js';

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Estimated size in bytes
  category: CacheCategory;
}

export type CacheCategory =
  | 'config'           // Configuration data
  | 'user-session'     // User session data
  | 'api-response'     // External API responses
  | 'file-content'     // File system content
  | 'computed-result'  // Expensive computation results
  | 'ui-state'         // UI state and preferences
  | 'memory-data';     // Memory/conversation data

export interface CacheConfig {
  maxSize: number;              // Maximum cache size in MB
  defaultTTL: number;           // Default TTL in milliseconds
  cleanupInterval: number;      // Cleanup interval in milliseconds
  persistToDisk: boolean;       // Whether to persist cache to disk
  categories: Record<CacheCategory, {
    ttl: number;                // Category-specific TTL
    maxEntries: number;         // Maximum entries for this category
    priority: number;           // Eviction priority (higher = keep longer)
  }>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  currentEntries: number;
  hitRate: number;
  categories: Record<CacheCategory, {
    entries: number;
    size: number;
    hits: number;
    misses: number;
  }>;
}

export class IntelligentCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;
  private stats: CacheStats;
  private cleanupTimer?: NodeJS.Timeout;
  private persistenceTimer?: NodeJS.Timeout;
  private cacheDirectory: string;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxSize: 50, // 50MB default
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      cleanupInterval: 60 * 1000, // 1 minute
      persistToDisk: true,
      categories: {
        config: { ttl: 30 * 60 * 1000, maxEntries: 100, priority: 9 },        // 30 min
        'user-session': { ttl: 60 * 60 * 1000, maxEntries: 50, priority: 8 }, // 1 hour
        'api-response': { ttl: 5 * 60 * 1000, maxEntries: 200, priority: 6 }, // 5 min
        'file-content': { ttl: 2 * 60 * 1000, maxEntries: 500, priority: 4 }, // 2 min
        'computed-result': { ttl: 10 * 60 * 1000, maxEntries: 100, priority: 7 }, // 10 min
        'ui-state': { ttl: 60 * 60 * 1000, maxEntries: 100, priority: 5 },    // 1 hour
        'memory-data': { ttl: 15 * 60 * 1000, maxEntries: 50, priority: 3 }   // 15 min
      },
      ...config
    };

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      currentSize: 0,
      currentEntries: 0,
      hitRate: 0,
      categories: {} as any
    };

    // Initialize category stats
    Object.keys(this.config.categories).forEach(category => {
      this.stats.categories[category as CacheCategory] = {
        entries: 0,
        size: 0,
        hits: 0,
        misses: 0
      };
    });

    this.cacheDirectory = join(process.cwd(), '.plato', 'cache');
    this.init();
  }

  private async init(): Promise<void> {
    // Ensure cache directory exists
    if (!existsSync(this.cacheDirectory)) {
      mkdirSync(this.cacheDirectory, { recursive: true });
    }

    // Load persisted cache
    if (this.config.persistToDisk) {
      await this.loadFromDisk();
    }

    // Start cleanup timer
    this.startCleanupTimer();

    // Start persistence timer
    if (this.config.persistToDisk) {
      this.startPersistenceTimer();
    }
  }

  /**
   * Get item from cache
   */
  get<T>(key: string, category: CacheCategory = 'computed-result'): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.stats.categories[category].misses++;
      commandPerformanceMonitor.trackCacheOperation('cache-manager', false);
      this.updateHitRate();
      return null;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      this.stats.categories[category].misses++;
      commandPerformanceMonitor.trackCacheOperation('cache-manager', false);
      this.updateHitRate();
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = performance.now();

    this.stats.hits++;
    this.stats.categories[category].hits++;
    commandPerformanceMonitor.trackCacheOperation('cache-manager', true);
    this.updateHitRate();

    return entry.value as T;
  }

  /**
   * Set item in cache with intelligent eviction
   */
  set<T>(
    key: string,
    value: T,
    category: CacheCategory = 'computed-result',
    customTTL?: number
  ): boolean {
    const now = performance.now();
    const categoryConfig = this.config.categories[category];
    const ttl = customTTL || categoryConfig.ttl;
    const size = this.estimateSize(value);

    // Check if we need to make room
    if (this.needsEviction(size, category)) {
      this.performIntelligentEviction(size, category);
    }

    // Create cache entry
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: now,
      ttl,
      accessCount: 1,
      lastAccessed: now,
      size,
      category
    };

    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Add new entry
    this.cache.set(key, entry);

    // Update stats
    this.stats.currentEntries++;
    this.stats.currentSize += size / (1024 * 1024); // Convert to MB
    this.stats.categories[category].entries++;
    this.stats.categories[category].size += size / (1024 * 1024);

    return true;
  }

  /**
   * Delete item from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);

    // Update stats
    this.stats.currentEntries--;
    this.stats.currentSize -= entry.size / (1024 * 1024);
    this.stats.categories[entry.category].entries--;
    this.stats.categories[entry.category].size -= entry.size / (1024 * 1024);

    return true;
  }

  /**
   * Check if cache has key and it's not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.currentEntries = 0;
    this.stats.currentSize = 0;
    Object.keys(this.stats.categories).forEach(category => {
      this.stats.categories[category as CacheCategory] = {
        entries: 0,
        size: 0,
        hits: 0,
        misses: 0
      };
    });
  }

  /**
   * Clear entries for specific category
   */
  clearCategory(category: CacheCategory): void {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.category === category) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.delete(key));
  }

  /**
   * Get or set with fallback function
   */
  async getOrSet<T>(
    key: string,
    fallback: () => Promise<T> | T,
    category: CacheCategory = 'computed-result',
    customTTL?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get<T>(key, category);
    if (cached !== null) {
      return cached;
    }

    // Execute fallback function
    const value = await fallback();

    // Cache the result
    this.set(key, value, category, customTTL);

    return value;
  }

  /**
   * Warm cache with frequently accessed data
   */
  async warmCache(warmupItems: Array<{
    key: string;
    factory: () => Promise<any> | any;
    category: CacheCategory;
    ttl?: number;
  }>): Promise<void> {
    console.log(`🔄 Warming cache with ${warmupItems.length} items...`);

    const promises = warmupItems.map(async item => {
      try {
        if (!this.has(item.key)) {
          const value = await item.factory();
          this.set(item.key, value, item.category, item.ttl);
        }
      } catch (error) {
        console.warn(`Failed to warm cache for ${item.key}:`, error);
      }
    });

    await Promise.all(promises);
    console.log(`✅ Cache warmed successfully`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & {
    topKeys: Array<{ key: string; accessCount: number; category: CacheCategory }>;
    oldestEntries: Array<{ key: string; age: number; category: CacheCategory }>;
    largestEntries: Array<{ key: string; size: number; category: CacheCategory }>;
  } {
    // Get top accessed keys
    const topKeys = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        accessCount: entry.accessCount,
        category: entry.category
      }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10);

    // Get oldest entries
    const now = performance.now();
    const oldestEntries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        age: now - entry.timestamp,
        category: entry.category
      }))
      .sort((a, b) => b.age - a.age)
      .slice(0, 10);

    // Get largest entries
    const largestEntries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        size: entry.size,
        category: entry.category
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    return {
      ...this.stats,
      topKeys,
      oldestEntries,
      largestEntries
    };
  }

  /**
   * Optimize cache performance
   */
  optimize(): {
    evicted: number;
    compacted: number;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    let evicted = 0;
    let compacted = 0;

    // Remove expired entries
    const expiredKeys: string[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.delete(key);
      evicted++;
    });

    // Analyze hit rates by category
    Object.entries(this.stats.categories).forEach(([category, stats]) => {
      const totalOps = stats.hits + stats.misses;
      if (totalOps > 0) {
        const hitRate = (stats.hits / totalOps) * 100;
        if (hitRate < 50) {
          recommendations.push(`Consider optimizing caching strategy for ${category} (${hitRate.toFixed(1)}% hit rate)`);
        }
      }
    });

    // Memory usage recommendations
    if (this.stats.currentSize > this.config.maxSize * 0.8) {
      recommendations.push('Cache size is nearing limit - consider increasing maxSize or reducing TTL');
    }

    // Access pattern recommendations
    const accessStats = this.getStats();
    const lowAccessEntries = accessStats.topKeys.filter(entry => entry.accessCount < 2).length;
    if (lowAccessEntries > this.stats.currentEntries * 0.3) {
      recommendations.push('Many cache entries have low access counts - consider adjusting caching criteria');
      compacted = lowAccessEntries;
    }

    return {
      evicted,
      compacted,
      recommendations
    };
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return performance.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Estimate size of a value in bytes
   */
  private estimateSize(value: any): number {
    if (typeof value === 'string') {
      return value.length * 2; // 2 bytes per character for UTF-16
    }
    if (typeof value === 'number') {
      return 8; // 64-bit number
    }
    if (typeof value === 'boolean') {
      return 4;
    }
    if (value instanceof ArrayBuffer) {
      return value.byteLength;
    }
    if (value instanceof Array) {
      return value.length * 8 + value.reduce((sum, item) => sum + this.estimateSize(item), 0);
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value).length * 2; // Rough estimate
    }
    return 0;
  }

  /**
   * Check if eviction is needed
   */
  private needsEviction(newEntrySize: number, category: CacheCategory): boolean {
    const categoryConfig = this.config.categories[category];
    const categoryStats = this.stats.categories[category];

    // Check category-specific limits
    if (categoryStats.entries >= categoryConfig.maxEntries) {
      return true;
    }

    // Check global size limit
    const newTotalSize = this.stats.currentSize + (newEntrySize / (1024 * 1024));
    return newTotalSize > this.config.maxSize;
  }

  /**
   * Perform intelligent eviction based on LRU, priority, and size
   */
  private performIntelligentEviction(requiredSize: number, category: CacheCategory): void {
    const entries = Array.from(this.cache.entries());

    // Sort by eviction score (lower = evict first)
    entries.sort(([keyA, entryA], [keyB, entryB]) => {
      const scoreA = this.calculateEvictionScore(entryA);
      const scoreB = this.calculateEvictionScore(entryB);
      return scoreA - scoreB;
    });

    let freedSize = 0;
    const requiredMB = requiredSize / (1024 * 1024);

    for (const [key, entry] of entries) {
      if (freedSize >= requiredMB && this.stats.categories[category].entries < this.config.categories[category].maxEntries) {
        break;
      }

      this.delete(key);
      freedSize += entry.size / (1024 * 1024);
      this.stats.evictions++;
    }
  }

  /**
   * Calculate eviction score for an entry (lower = more likely to evict)
   */
  private calculateEvictionScore(entry: CacheEntry): number {
    const now = performance.now();
    const categoryConfig = this.config.categories[entry.category];

    // Factors:
    // 1. Time since last access (higher = more likely to evict)
    const timeFactor = (now - entry.lastAccessed) / entry.ttl;

    // 2. Access frequency (lower = more likely to evict)
    const accessFactor = 1 / (entry.accessCount + 1);

    // 3. Category priority (lower priority = more likely to evict)
    const priorityFactor = 1 / categoryConfig.priority;

    // 4. Size factor (larger = more likely to evict if memory is tight)
    const sizeFactor = this.stats.currentSize > this.config.maxSize * 0.8
      ? entry.size / (1024 * 1024)
      : 0;

    return timeFactor + accessFactor + priorityFactor + sizeFactor;
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const totalOps = this.stats.hits + this.stats.misses;
    this.stats.hitRate = totalOps > 0 ? (this.stats.hits / totalOps) * 100 : 0;
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Start persistence timer
   */
  private startPersistenceTimer(): void {
    this.persistenceTimer = setInterval(() => {
      this.saveToDisk();
    }, 5 * 60 * 1000); // Save every 5 minutes
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.delete(key));

    if (expiredKeys.length > 0) {
      console.debug(`🧹 Cache cleanup: removed ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Save cache to disk
   */
  private async saveToDisk(): Promise<void> {
    if (!this.config.persistToDisk) return;

    const cacheFile = join(this.cacheDirectory, 'cache-data.json');
    const data = {
      timestamp: new Date().toISOString(),
      entries: Array.from(this.cache.entries()),
      stats: this.stats,
      config: this.config
    };

    try {
      writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save cache to disk:', error);
    }
  }

  /**
   * Load cache from disk
   */
  private async loadFromDisk(): Promise<void> {
    const cacheFile = join(this.cacheDirectory, 'cache-data.json');

    if (!existsSync(cacheFile)) return;

    try {
      const data = JSON.parse(readFileSync(cacheFile, 'utf8'));

      // Only load entries that are not expired
      const now = performance.now();
      for (const [key, entry] of data.entries) {
        if (now - entry.timestamp <= entry.ttl) {
          this.cache.set(key, entry);
        }
      }

      // Update stats (excluding expired entries)
      this.updateStatsFromCache();

      console.debug(`📂 Cache loaded: ${this.cache.size} entries from disk`);
    } catch (error) {
      console.warn('Failed to load cache from disk:', error);
    }
  }

  /**
   * Update stats based on current cache state
   */
  private updateStatsFromCache(): void {
    this.stats.currentEntries = this.cache.size;
    this.stats.currentSize = 0;

    // Reset category stats
    Object.keys(this.stats.categories).forEach(category => {
      this.stats.categories[category as CacheCategory] = {
        entries: 0,
        size: 0,
        hits: this.stats.categories[category as CacheCategory]?.hits || 0,
        misses: this.stats.categories[category as CacheCategory]?.misses || 0
      };
    });

    // Recalculate from cache entries
    for (const entry of this.cache.values()) {
      const sizeInMB = entry.size / (1024 * 1024);
      this.stats.currentSize += sizeInMB;
      this.stats.categories[entry.category].entries++;
      this.stats.categories[entry.category].size += sizeInMB;
    }
  }

  /**
   * Cleanup and save before shutdown
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
    }
    if (this.config.persistToDisk) {
      this.saveToDisk();
    }
  }
}

// Singleton instance for global use
export const intelligentCacheManager = new IntelligentCacheManager();