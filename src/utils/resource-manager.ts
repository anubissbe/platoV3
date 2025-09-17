/**
 * Resource Manager - Advanced Resource Management Patterns
 *
 * Provides resource acquisition/cleanup patterns, automatic cleanup on failure,
 * resource leak prevention, and concurrent access management.
 */

export interface ManagedResource {
  /** Unique resource identifier */
  id: string;
  /** Resource type */
  type: string;
  /** Cleanup function */
  cleanup: () => Promise<void> | void;
  /** Resource metadata */
  metadata?: Record<string, any>;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccessedAt: number;
  /** Resource priority (higher = more important) */
  priority: number;
}

export interface ResourceLease {
  /** Resource identifier */
  resourceId: string;
  /** Lease expiration timestamp */
  expiresAt: number;
  /** Whether to auto-renew the lease */
  autoRenew: boolean;
  /** Renewal callback */
  onRenewal?: (lease: ResourceLease) => Promise<boolean>;
}

export interface ResourceManagerOptions {
  /** Maximum number of resources to manage */
  maxResources: number;
  /** Default resource timeout (ms) */
  resourceTimeout: number;
  /** Cleanup check interval (ms) */
  cleanupInterval: number;
  /** Enable automatic cleanup */
  autoCleanup: boolean;
  /** Enable debug logging */
  enableDebug?: boolean;
  /** Resource priority threshold for eviction */
  evictionPriority: number;
}

export interface ResourceUsageStats {
  totalResources: number;
  activeResources: number;
  expiredResources: number;
  resourcesByType: Record<string, number>;
  averageAge: number;
  oldestResource?: {
    id: string;
    type: string;
    age: number;
  };
}

export class ResourceLeakError extends Error {
  constructor(message: string, public leakedResources: ManagedResource[]) {
    super(message);
    this.name = 'ResourceLeakError';
  }
}

export class ResourceManager {
  private resources = new Map<string, ManagedResource>();
  private leases = new Map<string, ResourceLease>();
  private cleanupTimer?: NodeJS.Timeout;
  private leakDetectionTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(private options: ResourceManagerOptions) {
    if (options.autoCleanup) {
      this.startCleanupTimer();
      this.startLeakDetection();
    }

    this.setupExitHandlers();

    if (options.enableDebug) {
      console.log('[ResourceManager] Initialized with options:', options);
    }
  }

  /**
   * Acquire a managed resource with automatic cleanup
   */
  async acquire<T>(
    id: string,
    type: string,
    factory: () => Promise<T> | T,
    cleanup: (resource: T) => Promise<void> | void,
    options: {
      priority?: number;
      timeout?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<T> {
    if (this.isShuttingDown) {
      throw new Error('ResourceManager is shutting down');
    }

    // Check resource limits
    if (this.resources.size >= this.options.maxResources) {
      await this.evictLowPriorityResources();

      if (this.resources.size >= this.options.maxResources) {
        throw new Error(`Resource limit exceeded: ${this.options.maxResources}`);
      }
    }

    // Check if resource already exists
    const existing = this.resources.get(id);
    if (existing) {
      existing.lastAccessedAt = Date.now();

      if (this.options.enableDebug) {
        console.log(`[ResourceManager] Reusing existing resource: ${id}`);
      }

      // Cast should be safe since we control the factory type
      return existing.metadata?.instance as T;
    }

    // Create new resource
    const resource = await this.createResourceWithTimeout(factory, options.timeout);

    const managedResource: ManagedResource = {
      id,
      type,
      cleanup: () => cleanup(resource),
      metadata: { ...options.metadata, instance: resource },
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      priority: options.priority || 1
    };

    this.resources.set(id, managedResource);

    if (this.options.enableDebug) {
      console.log(`[ResourceManager] Acquired resource: ${id} (type: ${type})`);
    }

    return resource;
  }

  /**
   * Create resource with optional timeout
   */
  private async createResourceWithTimeout<T>(
    factory: () => Promise<T> | T,
    timeout?: number
  ): Promise<T> {
    if (!timeout) {
      return await factory();
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Resource creation timed out after ${timeout}ms`));
      }, timeout);

      Promise.resolve(factory())
        .then(resource => {
          clearTimeout(timer);
          resolve(resource);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Get a managed resource without using it
   */
  get(resourceId: string): ManagedResource | undefined {
    const resource = this.resources.get(resourceId);
    if (resource) {
      resource.lastAccessedAt = Date.now();
    }
    return resource;
  }

  /**
   * Release a managed resource
   */
  async release(id: string): Promise<boolean> {
    const resource = this.resources.get(id);
    if (!resource) {
      return false;
    }

    try {
      await resource.cleanup();

      if (this.options.enableDebug) {
        console.log(`[ResourceManager] Released resource: ${id}`);
      }

      this.resources.delete(id);
      this.leases.delete(id);
      return true;
    } catch (error) {
      console.error(`[ResourceManager] Error releasing resource ${id}:`, error);
      // Remove from tracking even if cleanup failed to prevent leaks
      this.resources.delete(id);
      this.leases.delete(id);
      return false;
    }
  }

  /**
   * Release all resources of a specific type
   */
  async releaseByType(type: string): Promise<number> {
    const toRelease = Array.from(this.resources.values())
      .filter(resource => resource.type === type);

    let releasedCount = 0;
    for (const resource of toRelease) {
      const wasReleased = await this.release(resource.id);
      if (wasReleased) {
        releasedCount++;
      }
    }

    return releasedCount;
  }

  /**
   * Execute function with automatic resource cleanup
   */
  async withResource<T, R>(
    id: string,
    type: string,
    factory: () => Promise<T> | T,
    cleanup: (resource: T) => Promise<void> | void,
    fn: (resource: T) => Promise<R> | R,
    options: {
      priority?: number;
      timeout?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<R> {
    let resource: T;

    try {
      resource = await this.acquire(id, type, factory, cleanup, options);
      return await fn(resource);
    } finally {
      await this.release(id);
    }
  }

  /**
   * Batch resource operations with automatic cleanup
   */
  async batchOperation<T>(operations: Array<{
    id: string;
    type: string;
    factory: () => Promise<any> | any;
    cleanup: (resource: any) => Promise<void> | void;
    options?: any;
  }>): Promise<T[]> {
    const results: T[] = [];
    const acquiredResources: string[] = [];

    try {
      // Acquire all resources
      for (const op of operations) {
        const resource = await this.acquire(
          op.id,
          op.type,
          op.factory,
          op.cleanup,
          op.options || {}
        );
        results.push(resource);
        acquiredResources.push(op.id);
      }

      return results;
    } catch (error) {
      // Cleanup acquired resources on failure
      for (const resourceId of acquiredResources) {
        await this.release(resourceId);
      }
      throw error;
    }
  }

  getStats(): ResourceUsageStats {
    const now = Date.now();
    const resourcesByType: Record<string, number> = {};
    let totalAge = 0;
    let oldestResource: { id: string; type: string; age: number } | undefined;
    let expiredCount = 0;

    for (const resource of this.resources.values()) {
      // Count by type
      resourcesByType[resource.type] = (resourcesByType[resource.type] || 0) + 1;

      // Calculate age
      const age = now - resource.createdAt;
      totalAge += age;

      // Track oldest
      if (!oldestResource || age > oldestResource.age) {
        oldestResource = { id: resource.id, type: resource.type, age };
      }

      // Check if expired
      const lease = this.leases.get(resource.id);
      if (lease && now > lease.expiresAt) {
        expiredCount++;
      }
    }

    return {
      totalResources: this.resources.size,
      activeResources: this.resources.size - expiredCount,
      expiredResources: expiredCount,
      resourcesByType,
      averageAge: this.resources.size > 0 ? totalAge / this.resources.size : 0,
      oldestResource
    };
  }

  /**
   * Get comprehensive resource metrics including memory usage
   */
  getResourceMetrics(): {
    memory: NodeJS.MemoryUsage;
    uptime: number;
    resourceCount: number;
    stats: ResourceUsageStats;
  } {
    return {
      memory: process.memoryUsage(),
      uptime: process.uptime() * 1000, // Convert to milliseconds
      resourceCount: this.resources.size,
      stats: this.getStats()
    };
  }

  /**
   * Force cleanup of expired resources
   */
  async forceCleanup(): Promise<number> {
    const now = Date.now();
    const expiredResources: ManagedResource[] = [];

    for (const [id, lease] of this.leases) {
      if (now > lease.expiresAt && !lease.autoRenew) {
        const resource = this.resources.get(id);
        if (resource) {
          expiredResources.push(resource);
        }
      }
    }

    let cleaned = 0;
    for (const resource of expiredResources) {
      const released = await this.release(resource.id);
      if (released) {
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Evict low priority resources to make room
   */
  private async evictLowPriorityResources(): Promise<void> {
    const candidates = Array.from(this.resources.values())
      .filter(resource => resource.priority <= this.options.evictionPriority)
      .sort((a, b) => {
        // Sort by priority (ascending) then by last accessed (ascending)
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.lastAccessedAt - b.lastAccessedAt;
      });

    // Evict up to 25% of capacity
    const maxToEvict = Math.max(1, Math.floor(this.options.maxResources * 0.25));
    const toEvict = candidates.slice(0, maxToEvict);

    if (this.options.enableDebug) {
      console.log(`[ResourceManager] Evicting ${toEvict.length} low-priority resources`);
    }

    await Promise.all(
      toEvict.map(resource => this.release(resource.id))
    );
  }

  /**
   * Create a resource lease for time-based management
   */
  createLease(
    resourceId: string,
    duration: number,
    autoRenew: boolean = false,
    onRenewal?: (lease: ResourceLease) => Promise<boolean>
  ): ResourceLease {
    const lease: ResourceLease = {
      resourceId,
      expiresAt: Date.now() + duration,
      autoRenew,
      onRenewal
    };

    this.leases.set(resourceId, lease);
    return lease;
  }

  /**
   * Renew an existing lease
   */
  async renewLease(resourceId: string, duration: number): Promise<boolean> {
    const lease = this.leases.get(resourceId);
    if (!lease) {
      return false;
    }

    if (lease.onRenewal) {
      const shouldRenew = await lease.onRenewal(lease);
      if (!shouldRenew) {
        return false;
      }
    }

    lease.expiresAt = Date.now() + duration;
    return true;
  }

  /**
   * List all managed resources
   */
  listResources(): Array<{
    id: string;
    type: string;
    createdAt: number;
    lastAccessedAt: number;
    priority: number;
    age: number;
  }> {
    const now = Date.now();
    return Array.from(this.resources.values()).map(resource => ({
      id: resource.id,
      type: resource.type,
      createdAt: resource.createdAt,
      lastAccessedAt: resource.lastAccessedAt,
      priority: resource.priority,
      age: now - resource.createdAt
    }));
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.performPeriodicCleanup();
      } catch (error) {
        console.error('[ResourceManager] Cleanup error:', error);
      }
    }, this.options.cleanupInterval);
  }

  /**
   * Start resource leak detection
   */
  private startLeakDetection(): void {
    this.leakDetectionTimer = setInterval(() => {
      this.detectResourceLeaks();
    }, this.options.cleanupInterval * 2); // Check less frequently
  }

  /**
   * Perform periodic cleanup of expired resources
   */
  private async performPeriodicCleanup(): Promise<void> {
    const now = Date.now();
    const expiredLeases: string[] = [];

    // Find expired leases
    for (const [resourceId, lease] of this.leases) {
      if (now > lease.expiresAt) {
        if (lease.autoRenew && lease.onRenewal) {
          try {
            const shouldRenew = await lease.onRenewal(lease);
            if (shouldRenew) {
              lease.expiresAt = now + this.options.resourceTimeout;
              continue;
            }
          } catch (error) {
            if (this.options.enableDebug) {
              console.warn(`[ResourceManager] Auto-renewal failed for ${resourceId}:`, error);
            }
          }
        }
        expiredLeases.push(resourceId);
      }
    }

    // Release expired resources
    for (const resourceId of expiredLeases) {
      await this.release(resourceId);
    }

    // Check for stale resources (not accessed recently)
    const staleThreshold = now - (this.options.resourceTimeout * 2);
    const staleResources = Array.from(this.resources.values())
      .filter(resource => resource.lastAccessedAt < staleThreshold)
      .filter(resource => resource.priority <= this.options.evictionPriority);

    for (const resource of staleResources) {
      if (this.options.enableDebug) {
        console.log(`[ResourceManager] Releasing stale resource: ${resource.id}`);
      }
      await this.release(resource.id);
    }
  }

  /**
   * Detect potential resource leaks
   */
  private detectResourceLeaks(): void {
    const now = Date.now();
    const leakThreshold = now - (this.options.resourceTimeout * 10); // 10x timeout

    const potentialLeaks = Array.from(this.resources.values())
      .filter(resource => resource.createdAt < leakThreshold);

    if (potentialLeaks.length > 0) {
      const warning = new ResourceLeakError(
        `Detected ${potentialLeaks.length} potential resource leaks`,
        potentialLeaks
      );

      console.warn('[ResourceManager] Resource leak detected:', warning);

      if (this.options.enableDebug) {
        potentialLeaks.forEach(resource => {
          console.log(`  - ${resource.id} (type: ${resource.type}, age: ${now - resource.createdAt}ms)`);
        });
      }
    }
  }

  /**
   * Graceful shutdown with resource cleanup
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    if (this.leakDetectionTimer) {
      clearInterval(this.leakDetectionTimer);
    }

    if (this.options.enableDebug) {
      console.log(`[ResourceManager] Shutting down, cleaning up ${this.resources.size} resources...`);
    }

    // Release all resources
    const resourceIds = Array.from(this.resources.keys());
    await Promise.all(
      resourceIds.map(id => this.release(id))
    );

    if (this.options.enableDebug) {
      console.log('[ResourceManager] Shutdown complete');
    }
  }

  /**
   * Setup process exit handlers for cleanup
   */
  private setupExitHandlers(): void {
    const cleanup = async () => {
      await this.shutdown();
    };

    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('SIGQUIT', cleanup);
  }
}

/**
 * Global resource manager instance
 */
export const globalResourceManager = new ResourceManager({
  maxResources: 100,
  resourceTimeout: 30000,
  cleanupInterval: 60000,
  autoCleanup: true,
  evictionPriority: 5,
  enableDebug: false
});