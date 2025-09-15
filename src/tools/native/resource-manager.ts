/**
 * Resource Manager - Handles concurrency limits, rate limiting, and resource monitoring
 * Provides comprehensive resource management for native tools
 */

import { EventEmitter } from "events";
import * as os from "os";
import * as fs from "fs/promises";
import {
  ResourceLimits,
  ResourceAcquisitionResult,
  RateLimitResult,
  ResourceMonitoringData,
  CPUUsageData,
  FileHandleData,
  OperationMetrics,
  TelemetryEvent,
  ToolError,
  ErrorClass,
} from "./types.js";

interface ResourceSlot {
  id: string;
  acquiredAt: number;
  timeoutHandle?: NodeJS.Timeout;
}

interface QueuedRequest {
  id: string;
  resolve: (result: ResourceAcquisitionResult) => void;
  queuedAt: number;
  timeoutHandle?: NodeJS.Timeout;
}

interface RateLimitState {
  requests: number;
  windowStart: number;
  blocked: boolean;
  unblockTime?: number;
}

interface OperationMonitoring {
  startTime: number;
  startMemory: NodeJS.MemoryUsage;
  startCPU?: NodeJS.CpuUsage;
}

export class ResourceManager extends EventEmitter {
  private readonly limits: Required<ResourceLimits>;
  private readonly activeSlots = new Map<string, ResourceSlot>();
  private readonly requestQueue: QueuedRequest[] = [];
  private readonly rateLimitStates = new Map<string, RateLimitState>();
  private readonly operationMonitoring = new Map<string, OperationMonitoring>();
  private monitoringInterval?: NodeJS.Timeout; // Track the interval for cleanup

  // Rate limiting configuration
  private readonly rateLimits = {
    read: { requests: 100, window: 60000 }, // 100 per minute
    write: { requests: 50, window: 60000 }, // 50 per minute
    list: { requests: 200, window: 60000 }, // 200 per minute
    search: { requests: 30, window: 60000 }, // 30 per minute
    bash: { requests: 20, window: 60000 }, // 20 per minute
  };

  private cpuBaseline?: NodeJS.CpuUsage;
  private memoryPressureThreshold = 0.8; // 80% memory usage triggers warnings

  constructor(limits: ResourceLimits) {
    super();

    this.limits = this.validateAndNormalizeLimits(limits);
    this.initializeCPUBaseline();
    this.startResourceMonitoring();
  }

  /**
   * Cleanup method to clear timers and resources - CRITICAL for test cleanup
   */
  cleanup(): void {
    // Clear the monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // Clear all active slot timeouts
    for (const slot of this.activeSlots.values()) {
      if (slot.timeoutHandle) {
        clearTimeout(slot.timeoutHandle);
      }
    }
    this.activeSlots.clear();

    // Clear all queued request timeouts
    for (const request of this.requestQueue) {
      if (request.timeoutHandle) {
        clearTimeout(request.timeoutHandle);
      }
    }
    this.requestQueue.length = 0;

    // Clear operation monitoring
    this.operationMonitoring.clear();

    // Clear rate limit states
    this.rateLimitStates.clear();

    // Remove all listeners
    this.removeAllListeners();
  }

  /**
   * Acquire a resource slot with concurrency limiting
   */
  async acquireResource(
    operationId: string,
  ): Promise<ResourceAcquisitionResult> {
    return new Promise((resolve) => {
      // Check if we're at capacity
      if (this.activeSlots.size >= this.limits.maxConcurrentOperations!) {
        // Queue the request
        const queuedRequest: QueuedRequest = {
          id: operationId,
          resolve,
          queuedAt: Date.now(),
        };

        // Set timeout for queued request
        if (this.limits.operationTimeout) {
          queuedRequest.timeoutHandle = setTimeout(() => {
            this.removeFromQueue(queuedRequest);
            resolve({
              granted: false,
              reason: "Request timeout in queue",
              queuePosition: -1,
            });
          }, this.limits.operationTimeout);
        }

        this.requestQueue.push(queuedRequest);

        resolve({
          granted: false,
          reason: "concurrency limit reached",
          queuePosition: this.requestQueue.length,
          estimatedWaitTime: this.estimateWaitTime(),
        });
        return;
      }

      // Grant immediate access
      const slot: ResourceSlot = {
        id: operationId,
        acquiredAt: Date.now(),
      };

      // Set timeout for the slot
      if (this.limits.operationTimeout) {
        slot.timeoutHandle = setTimeout(() => {
          this.releaseResource(operationId);
        }, this.limits.operationTimeout);
      }

      this.activeSlots.set(operationId, slot);

      resolve({
        granted: true,
      });

      // Emit resource allocation telemetry
      this.emitTelemetry({
        tool: "resource-acquisition",
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 0,
        success: true,
        resourcesUsed: { activeSlots: this.activeSlots.size },
      });
    });
  }

  /**
   * Release a resource slot and process queue
   */
  async releaseResource(operationId: string): Promise<void> {
    const slot = this.activeSlots.get(operationId);
    if (!slot) {
      return; // Already released or never acquired
    }

    // Clear timeout if set
    if (slot.timeoutHandle) {
      clearTimeout(slot.timeoutHandle);
    }

    this.activeSlots.delete(operationId);

    // Process queue
    await this.processQueue();

    // Emit resource release telemetry
    this.emitTelemetry({
      tool: "resource-release",
      startTime: slot.acquiredAt,
      endTime: Date.now(),
      duration: Date.now() - slot.acquiredAt,
      success: true,
      resourcesUsed: { activeSlots: this.activeSlots.size },
    });
  }

  /**
   * Check rate limits for a tool and client
   */
  async checkRateLimit(
    tool: string,
    clientId: string,
  ): Promise<RateLimitResult> {
    const rateLimit = this.rateLimits[tool as keyof typeof this.rateLimits];
    if (!rateLimit) {
      return { allowed: true }; // No rate limit configured
    }

    const key = `${tool}:${clientId}`;
    const now = Date.now();
    let state = this.rateLimitStates.get(key);

    if (!state) {
      state = {
        requests: 0,
        windowStart: now,
        blocked: false,
      };
      this.rateLimitStates.set(key, state);
    }

    // Check if we're past the current window
    if (now - state.windowStart >= rateLimit.window) {
      state.requests = 0;
      state.windowStart = now;
      state.blocked = false;
      state.unblockTime = undefined;
    }

    // Check if currently blocked
    if (state.blocked && state.unblockTime && now < state.unblockTime) {
      return {
        allowed: false,
        retryAfter: state.unblockTime - now,
        requestsRemaining: 0,
        windowResetTime: state.windowStart + rateLimit.window,
      };
    }

    // Check if exceeding rate limit
    if (state.requests >= rateLimit.requests) {
      state.blocked = true;
      state.unblockTime = state.windowStart + rateLimit.window;

      return {
        allowed: false,
        retryAfter: state.unblockTime - now,
        requestsRemaining: 0,
        windowResetTime: state.windowStart + rateLimit.window,
      };
    }

    // Allow request and increment counter
    state.requests++;

    return {
      allowed: true,
      requestsRemaining: rateLimit.requests - state.requests,
      windowResetTime: state.windowStart + rateLimit.window,
    };
  }

  /**
   * Get current resource usage statistics
   */
  async getResourceUsage(): Promise<ResourceMonitoringData> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = await this.getCPUUsage();
    const fileHandles = await this.getOpenFileHandles();

    return {
      memoryUsage,
      cpuUsage,
      openFileHandles: fileHandles,
      timestamp: Date.now(),
    };
  }

  /**
   * Get CPU usage data
   */
  async getCPUUsage(): Promise<CPUUsageData> {
    if (!this.cpuBaseline) {
      this.cpuBaseline = process.cpuUsage();
      // Return minimal data for first call
      return {
        userCPUTime: 0,
        systemCPUTime: 0,
        percentUsage: 0,
        elapsedTime: 0,
      };
    }

    const current = process.cpuUsage(this.cpuBaseline);
    const totalCPUTime = current.user + current.system;
    const elapsedTime = Date.now();

    // Calculate percentage (rough estimate)
    const percentUsage = Math.min(
      100,
      (totalCPUTime / 1000 / elapsedTime) * 100,
    );

    return {
      userCPUTime: current.user / 1000, // Convert to milliseconds
      systemCPUTime: current.system / 1000,
      percentUsage,
      elapsedTime,
    };
  }

  /**
   * Get open file handle information
   */
  async getOpenFileHandles(): Promise<FileHandleData> {
    try {
      // On Unix systems, count files in /proc/self/fd
      if (process.platform !== "win32") {
        const fdDir = "/proc/self/fd";
        try {
          const files = await fs.readdir(fdDir);
          return {
            count: files.length,
            types: { fd: files.length },
            limit: this.limits.maxOpenFiles!,
          };
        } catch {
          // Fallback for systems without /proc
        }
      }

      // Fallback: estimate based on known handles
      return {
        count: this.activeSlots.size * 2, // Rough estimate
        types: { estimated: this.activeSlots.size * 2 },
        limit: this.limits.maxOpenFiles!,
      };
    } catch (error) {
      return {
        count: 0,
        types: {},
        limit: this.limits.maxOpenFiles!,
      };
    }
  }

  /**
   * Start monitoring an operation
   */
  async startOperationMonitoring(operationId: string): Promise<void> {
    const monitoring: OperationMonitoring = {
      startTime: Date.now(),
      startMemory: process.memoryUsage(),
      startCPU: process.cpuUsage(),
    };

    this.operationMonitoring.set(operationId, monitoring);
  }

  /**
   * Stop monitoring and get operation metrics
   */
  async stopOperationMonitoring(
    operationId: string,
  ): Promise<OperationMetrics> {
    const monitoring = this.operationMonitoring.get(operationId);
    if (!monitoring) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        "MONITORING_NOT_FOUND",
        `Operation monitoring not found: ${operationId}`,
      );
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    const endCPU = process.cpuUsage(monitoring.startCPU);

    const metrics: OperationMetrics = {
      duration: endTime - monitoring.startTime,
      memoryDelta: endMemory.heapUsed - monitoring.startMemory.heapUsed,
      cpuUsage: {
        userCPUTime: endCPU.user / 1000,
        systemCPUTime: endCPU.system / 1000,
        percentUsage: Math.min(
          100,
          ((endCPU.user + endCPU.system) /
            1000 /
            (endTime - monitoring.startTime)) *
            100,
        ),
        elapsedTime: endTime - monitoring.startTime,
      },
      success: true,
    };

    this.operationMonitoring.delete(operationId);

    // Emit operation metrics telemetry
    this.emitTelemetry({
      tool: "operation-monitoring",
      startTime: monitoring.startTime,
      endTime,
      duration: metrics.duration,
      success: true,
      memoryUsage: metrics.memoryDelta,
      cpuTime: metrics.cpuUsage.userCPUTime + metrics.cpuUsage.systemCPUTime,
    });

    return metrics;
  }

  /**
   * Start CPU monitoring
   */
  async startCPUMonitoring(): Promise<void> {
    this.cpuBaseline = process.cpuUsage();
  }

  /**
   * Check resource limits and trigger alerts
   */
  async checkResourceLimits(): Promise<void> {
    const usage = await this.getResourceUsage();

    // Check memory usage
    if (this.limits.maxMemoryUsage) {
      const memoryUsageRatio =
        usage.memoryUsage.rss / this.limits.maxMemoryUsage;
      if (memoryUsageRatio > this.memoryPressureThreshold) {
        this.emit("resource-limit-exceeded", {
          resource: "memory",
          current: usage.memoryUsage.rss,
          limit: this.limits.maxMemoryUsage,
          ratio: memoryUsageRatio,
        });
      }
    }

    // Check open files
    if (usage.openFileHandles && this.limits.maxOpenFiles) {
      const fileHandleRatio =
        usage.openFileHandles.count / this.limits.maxOpenFiles;
      if (fileHandleRatio > this.memoryPressureThreshold) {
        this.emit("resource-limit-exceeded", {
          resource: "file-handles",
          current: usage.openFileHandles.count,
          limit: this.limits.maxOpenFiles,
          ratio: fileHandleRatio,
        });
      }
    }
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.requestQueue.length;
  }

  /**
   * Get resource limits
   */
  getResourceLimits(): Required<ResourceLimits> {
    return { ...this.limits };
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    while (
      this.requestQueue.length > 0 &&
      this.activeSlots.size < this.limits.maxConcurrentOperations!
    ) {
      const request = this.requestQueue.shift()!;

      // Clear timeout
      if (request.timeoutHandle) {
        clearTimeout(request.timeoutHandle);
      }

      // Grant the resource
      const slot: ResourceSlot = {
        id: request.id,
        acquiredAt: Date.now(),
      };

      if (this.limits.operationTimeout) {
        slot.timeoutHandle = setTimeout(() => {
          this.releaseResource(request.id);
        }, this.limits.operationTimeout);
      }

      this.activeSlots.set(request.id, slot);

      // Resolve the request
      request.resolve({
        granted: true,
      });
    }
  }

  /**
   * Remove request from queue
   */
  private removeFromQueue(targetRequest: QueuedRequest): void {
    const index = this.requestQueue.indexOf(targetRequest);
    if (index !== -1) {
      this.requestQueue.splice(index, 1);
    }
  }

  /**
   * Estimate wait time for queued requests
   */
  private estimateWaitTime(): number {
    if (this.activeSlots.size === 0) {
      return 0;
    }

    // Calculate average operation duration
    const now = Date.now();
    const ages = Array.from(this.activeSlots.values()).map(
      (slot) => now - slot.acquiredAt,
    );
    const averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;

    // Estimate based on queue position and average operation time
    return Math.max(
      1000,
      (averageAge * this.requestQueue.length) /
        this.limits.maxConcurrentOperations!,
    );
  }

  /**
   * Validate and normalize resource limits
   */
  private validateAndNormalizeLimits(
    limits: ResourceLimits,
  ): Required<ResourceLimits> {
    const defaults: Required<ResourceLimits> = {
      maxFileSize: 100 * 1024 * 1024,
      maxMemoryUsage: 512 * 1024 * 1024,
      maxCpuTime: 30000,
      maxOpenFiles: 100,
      maxDirectoryDepth: 50,
      maxGlobResults: 10000,
      maxConcurrentOperations: 10,
      operationTimeout: 30000,
    };

    return { ...defaults, ...limits };
  }

  /**
   * Initialize CPU baseline for measurements
   */
  private initializeCPUBaseline(): void {
    this.cpuBaseline = process.cpuUsage();
  }

  /**
   * Start periodic resource monitoring
   */
  private startResourceMonitoring(): void {
    // Check resource usage every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkResourceLimits();
      } catch (error) {
        // Don't let monitoring errors crash the manager
        this.emit("error", error);
      }
    }, 30000);

    // Clean up on process exit
    process.once("exit", () => {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }
    });
  }

  /**
   * Emit telemetry event
   */
  private emitTelemetry(event: Partial<TelemetryEvent>): void {
    const telemetryEvent: TelemetryEvent = {
      tool: event.tool || "resource-manager",
      startTime: event.startTime || Date.now(),
      endTime: event.endTime || Date.now(),
      duration: event.duration || 0,
      success: event.success || false,
      ...event,
    };

    this.emit("telemetry", telemetryEvent);
  }
}
