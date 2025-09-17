/**
 * Performance Decorator System for Plato TUI Commands
 *
 * Provides easy-to-use decorators and wrappers for adding performance monitoring
 * to existing command implementations without major refactoring.
 */

import { commandPerformanceMonitor, CommandMetrics } from './performance-monitor.js';
import { intelligentCacheManager, CacheCategory } from './cache-manager.js';

export interface PerformanceOptions {
  enableCaching?: boolean;
  cacheCategory?: CacheCategory;
  cacheTTL?: number;
  trackNetworkCalls?: boolean;
  trackFileOperations?: boolean;
  memoryAlert?: boolean;
  customThreshold?: number;
}

export interface CommandExecutionContext {
  command: string;
  args: string[];
  measurementId: string;
  startTime: number;
}

/**
 * Performance monitoring wrapper for command functions
 */
export function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  commandName: string,
  fn: T,
  options: PerformanceOptions = {}
): T {
  return (async (...args: any[]) => {
    const measurementId = commandPerformanceMonitor.startCommandMeasurement(
      commandName,
      args.map(arg => String(arg))
    );

    let success = true;
    let errorType: string | undefined;
    let result: any;

    try {
      // Check cache first if caching is enabled
      if (options.enableCaching) {
        const cacheKey = `${commandName}:${JSON.stringify(args)}`;
        const cached = intelligentCacheManager.get(
          cacheKey,
          options.cacheCategory || 'computed-result'
        );

        if (cached !== null) {
          // Cache hit - still record performance but mark as cached
          commandPerformanceMonitor.endCommandMeasurement(
            measurementId,
            commandName,
            args.map(arg => String(arg)),
            true
          );
          return cached;
        }

        // Cache miss - execute function and cache result
        result = await fn(...args);

        intelligentCacheManager.set(
          cacheKey,
          result,
          options.cacheCategory || 'computed-result',
          options.cacheTTL
        );
      } else {
        result = await fn(...args);
      }

      return result;
    } catch (error) {
      success = false;
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      throw error;
    } finally {
      commandPerformanceMonitor.endCommandMeasurement(
        measurementId,
        commandName,
        args.map(arg => String(arg)),
        success,
        errorType
      );
    }
  }) as T;
}

/**
 * Network call tracker wrapper
 */
export function withNetworkTracking<T extends (...args: any[]) => Promise<any>>(
  measurementId: string,
  fn: T
): T {
  return (async (...args: any[]) => {
    commandPerformanceMonitor.trackNetworkCall(measurementId);
    return await fn(...args);
  }) as T;
}

/**
 * File operation tracker wrapper
 */
export function withFileTracking<T extends (...args: any[]) => any>(
  measurementId: string,
  fn: T
): T {
  return ((...args: any[]) => {
    commandPerformanceMonitor.trackFileOperation(measurementId);
    return fn(...args);
  }) as T;
}

/**
 * Performance decorator for class methods
 */
export function PerformanceMonitored(
  commandName?: string,
  options: PerformanceOptions = {}
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const effectiveCommandName = commandName || propertyKey;

    descriptor.value = withPerformanceMonitoring(
      effectiveCommandName,
      originalMethod,
      options
    );

    return descriptor;
  };
}

/**
 * Cache-enabled decorator for expensive operations
 */
export function Cached(
  category: CacheCategory = 'computed-result',
  ttl?: number
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const cacheKey = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;

      return intelligentCacheManager.getOrSet(
        cacheKey,
        () => originalMethod.apply(this, args),
        category,
        ttl
      );
    };

    return descriptor;
  };
}

/**
 * Utility class for manual performance tracking in existing code
 */
export class PerformanceTracker {
  private static contexts: Map<string, CommandExecutionContext> = new Map();

  /**
   * Start tracking performance for a command
   */
  static startTracking(command: string, args: string[] = []): string {
    const measurementId = commandPerformanceMonitor.startCommandMeasurement(command, args);

    const context: CommandExecutionContext = {
      command,
      args,
      measurementId,
      startTime: Date.now()
    };

    this.contexts.set(measurementId, context);
    return measurementId;
  }

  /**
   * End tracking and return metrics
   */
  static endTracking(measurementId: string, success: boolean = true, errorType?: string): CommandMetrics | null {
    const context = this.contexts.get(measurementId);
    if (!context) return null;

    const metrics = commandPerformanceMonitor.endCommandMeasurement(
      measurementId,
      context.command,
      context.args,
      success,
      errorType
    );

    this.contexts.delete(measurementId);
    return metrics;
  }

  /**
   * Track network call within a measurement
   */
  static trackNetworkCall(measurementId: string): void {
    commandPerformanceMonitor.trackNetworkCall(measurementId);
  }

  /**
   * Track file operation within a measurement
   */
  static trackFileOperation(measurementId: string): void {
    commandPerformanceMonitor.trackFileOperation(measurementId);
  }

  /**
   * Track cache operation within a measurement
   */
  static trackCacheHit(command: string): void {
    commandPerformanceMonitor.trackCacheOperation(command, true);
  }

  static trackCacheMiss(command: string): void {
    commandPerformanceMonitor.trackCacheOperation(command, false);
  }
}

/**
 * Async wrapper that provides automatic performance tracking
 */
export async function executeWithTracking<T>(
  command: string,
  operation: (tracker: typeof PerformanceTracker) => Promise<T>,
  args: string[] = []
): Promise<T> {
  const measurementId = PerformanceTracker.startTracking(command, args);

  try {
    const result = await operation(PerformanceTracker);
    PerformanceTracker.endTracking(measurementId, true);
    return result;
  } catch (error) {
    const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
    PerformanceTracker.endTracking(measurementId, false, errorType);
    throw error;
  }
}

/**
 * Batch operation wrapper with intelligent concurrency control
 */
export class BatchOperationManager {
  private static readonly MAX_CONCURRENT = 5;
  private static queue: Array<() => Promise<any>> = [];
  private static running = 0;

  /**
   * Add operation to batch queue
   */
  static async addOperation<T>(
    operation: () => Promise<T>,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const prioritizedOperation = async () => {
        try {
          this.running++;
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processQueue();
        }
      };

      // Insert based on priority
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const targetPriority = priorityOrder[priority];

      let insertIndex = this.queue.length;
      for (let i = 0; i < this.queue.length; i++) {
        const opPriority = (this.queue[i] as any).__priority || 1;
        if (targetPriority < opPriority) {
          insertIndex = i;
          break;
        }
      }

      (prioritizedOperation as any).__priority = targetPriority;
      this.queue.splice(insertIndex, 0, prioritizedOperation);

      this.processQueue();
    });
  }

  /**
   * Process queued operations with concurrency control
   */
  private static processQueue(): void {
    while (this.running < this.MAX_CONCURRENT && this.queue.length > 0) {
      const operation = this.queue.shift();
      if (operation) {
        operation();
      }
    }
  }

  /**
   * Clear pending operations
   */
  static clearQueue(): void {
    this.queue = [];
  }

  /**
   * Get queue status
   */
  static getStatus(): { pending: number; running: number; maxConcurrent: number } {
    return {
      pending: this.queue.length,
      running: this.running,
      maxConcurrent: this.MAX_CONCURRENT
    };
  }
}

/**
 * Lazy loading wrapper for expensive resources
 */
export class LazyLoader<T> {
  private _value: T | undefined;
  private _loading = false;
  private _factory: () => Promise<T> | T;
  private _cacheKey?: string;

  constructor(factory: () => Promise<T> | T, cacheKey?: string) {
    this._factory = factory;
    this._cacheKey = cacheKey;
  }

  async get(): Promise<T> {
    if (this._value !== undefined) {
      return this._value;
    }

    if (this._loading) {
      // Wait for current loading operation
      while (this._loading) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return this._value!;
    }

    this._loading = true;

    try {
      // Try cache first if cacheKey provided
      if (this._cacheKey) {
        const cached = intelligentCacheManager.get<T>(this._cacheKey);
        if (cached !== null) {
          this._value = cached;
          return cached;
        }
      }

      // Load the value
      const value = await this._factory();
      this._value = value;

      // Cache if key provided
      if (this._cacheKey) {
        intelligentCacheManager.set(this._cacheKey, value, 'computed-result');
      }

      return value;
    } finally {
      this._loading = false;
    }
  }

  /**
   * Check if value is loaded
   */
  isLoaded(): boolean {
    return this._value !== undefined;
  }

  /**
   * Clear loaded value (force reload on next get)
   */
  clear(): void {
    this._value = undefined;
    if (this._cacheKey) {
      intelligentCacheManager.delete(this._cacheKey);
    }
  }
}

/**
 * Connection pool for external services
 */
export class ConnectionPool {
  private static pools: Map<string, ConnectionPool> = new Map();
  private connections: Array<{ id: string; inUse: boolean; lastUsed: number }> = [];
  private factory: () => Promise<any>;
  private maxConnections: number;

  constructor(factory: () => Promise<any>, maxConnections = 5) {
    this.factory = factory;
    this.maxConnections = maxConnections;
  }

  static getPool(name: string, factory?: () => Promise<any>, maxConnections = 5): ConnectionPool {
    if (!this.pools.has(name)) {
      if (!factory) {
        throw new Error(`Connection pool '${name}' not found and no factory provided`);
      }
      this.pools.set(name, new ConnectionPool(factory, maxConnections));
    }
    return this.pools.get(name)!;
  }

  async acquire(): Promise<any> {
    // Find available connection
    let connection = this.connections.find(conn => !conn.inUse);

    if (!connection) {
      if (this.connections.length < this.maxConnections) {
        // Create new connection
        const newConn = await this.factory();
        connection = {
          id: Math.random().toString(36),
          inUse: true,
          lastUsed: Date.now()
        };
        (newConn as any).__poolId = connection.id;
        this.connections.push(connection);
        return newConn;
      } else {
        // Wait for available connection
        while (!connection) {
          await new Promise(resolve => setTimeout(resolve, 10));
          connection = this.connections.find(conn => !conn.inUse);
        }
      }
    }

    connection.inUse = true;
    connection.lastUsed = Date.now();

    // Return the connection object (would need to be implemented based on actual connection type)
    return { __poolId: connection.id };
  }

  release(connection: any): void {
    const poolId = connection.__poolId;
    const pooledConnection = this.connections.find(conn => conn.id === poolId);

    if (pooledConnection) {
      pooledConnection.inUse = false;
      pooledConnection.lastUsed = Date.now();
    }
  }

  cleanup(): void {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    this.connections = this.connections.filter(conn => {
      if (!conn.inUse && now - conn.lastUsed > timeout) {
        return false; // Remove old unused connections
      }
      return true;
    });
  }
}

/**
 * Performance-aware retry mechanism
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 100,
    maxDelay = 5000,
    backoffFactor = 2,
    shouldRetry = () => true
  } = options;

  let attempt = 1;
  let lastError: any;

  while (attempt <= maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }

  throw lastError;
}