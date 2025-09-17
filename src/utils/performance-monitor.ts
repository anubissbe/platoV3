/**
 * Enhanced Performance Monitoring System for Plato TUI Commands
 *
 * Integrates with existing PerformanceMonitor.ts in src/tui/ and extends it
 * for comprehensive command performance tracking and optimization.
 */

import { performance } from 'perf_hooks';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PerformanceMonitor as TUIPerformanceMonitor, Metrics } from '../tui/PerformanceMonitor.js';

export interface CommandMetrics extends Metrics {
  command: string;
  arguments: string[];
  memoryBefore: number;
  memoryAfter: number;
  memoryDelta: number;
  success: boolean;
  errorType?: string;
  bottlenecks: string[];
  cacheHits: number;
  cacheMisses: number;
  networkCalls: number;
  fileOperations: number;
}

export interface PerformanceThresholds {
  // Command execution thresholds (ms)
  fastCommand: number;        // Simple commands like help, status
  standardCommand: number;    // Medium complexity like mcp, config
  complexCommand: number;     // Heavy operations like memory, analytics

  // Memory thresholds (MB)
  memoryWarning: number;      // When to warn about memory usage
  memoryLimit: number;        // Hard limit for memory usage

  // Response time thresholds (ms)
  uiResponse: number;         // UI interaction response time
  apiResponse: number;        // External API call timeout
  fileOperation: number;      // File I/O operation timeout

  // Caching efficiency thresholds (%)
  cacheHitRate: number;       // Minimum acceptable cache hit rate
}

export interface PerformanceAlert {
  type: 'threshold' | 'memory' | 'performance' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  command: string;
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
  suggestions: string[];
}

export interface OptimizationSuggestion {
  command: string;
  category: 'caching' | 'memory' | 'async' | 'batching' | 'lazy-loading';
  description: string;
  impact: 'low' | 'medium' | 'high';
  implementation: string;
  estimatedImprovement: string;
}

export class CommandPerformanceMonitor extends TUIPerformanceMonitor {
  private commandMetrics: Map<string, CommandMetrics[]> = new Map();
  private performanceThresholds: PerformanceThresholds;
  private alerts: PerformanceAlert[] = [];
  private optimizationSuggestions: Map<string, OptimizationSuggestion[]> = new Map();
  private cacheStats: Map<string, { hits: number; misses: number }> = new Map();
  private networkCallTracker: Map<string, number> = new Map();
  private fileOperationTracker: Map<string, number> = new Map();
  private sessionStartTime: number = performance.now();
  private dataDirectory: string;

  constructor(thresholds?: Partial<PerformanceThresholds>) {
    super();

    this.performanceThresholds = {
      fastCommand: 50,           // 50ms for simple commands
      standardCommand: 200,      // 200ms for standard commands
      complexCommand: 1000,      // 1s for complex commands
      memoryWarning: 100,        // 100MB warning
      memoryLimit: 200,          // 200MB limit
      uiResponse: 16.67,         // 60fps = 16.67ms per frame
      apiResponse: 5000,         // 5s for API calls
      fileOperation: 100,        // 100ms for file operations
      cacheHitRate: 70,          // 70% minimum cache hit rate
      ...thresholds
    };

    this.dataDirectory = join(process.cwd(), '.plato', 'performance');
    this.ensureDataDirectory();
    this.loadHistoricalData();
  }

  private ensureDataDirectory(): void {
    if (!existsSync(this.dataDirectory)) {
      mkdirSync(this.dataDirectory, { recursive: true });
    }
  }

  private loadHistoricalData(): void {
    const historyFile = join(this.dataDirectory, 'command-metrics-history.json');
    if (existsSync(historyFile)) {
      try {
        const data = JSON.parse(readFileSync(historyFile, 'utf8'));
        // Convert array back to Map
        this.commandMetrics = new Map(Object.entries(data.commandMetrics || {}));
        this.cacheStats = new Map(Object.entries(data.cacheStats || {}));
      } catch (error) {
        console.warn('Failed to load performance history:', error);
      }
    }
  }

  private saveHistoricalData(): void {
    const historyFile = join(this.dataDirectory, 'command-metrics-history.json');
    const data = {
      timestamp: new Date().toISOString(),
      commandMetrics: Object.fromEntries(this.commandMetrics),
      cacheStats: Object.fromEntries(this.cacheStats),
      alerts: this.alerts.slice(-100), // Keep last 100 alerts
    };

    try {
      writeFileSync(historyFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save performance history:', error);
    }
  }

  /**
   * Start monitoring a command execution
   */
  startCommandMeasurement(command: string, args: string[] = []): string {
    const measurementId = `cmd-${command}-${Date.now()}-${Math.random()}`;

    // Start base measurement
    this.startMeasure(measurementId);

    // Track memory before execution
    const memoryBefore = this.getMemoryUsage().heapUsed / (1024 * 1024); // Convert to MB

    // Initialize tracking data
    this.networkCallTracker.set(measurementId, 0);
    this.fileOperationTracker.set(measurementId, 0);

    // Initialize cache stats if not exists
    if (!this.cacheStats.has(command)) {
      this.cacheStats.set(command, { hits: 0, misses: 0 });
    }

    return measurementId;
  }

  /**
   * End command measurement and store comprehensive metrics
   */
  endCommandMeasurement(
    measurementId: string,
    command: string,
    args: string[] = [],
    success: boolean = true,
    errorType?: string
  ): CommandMetrics {
    // End base measurement
    this.endMeasure(measurementId);
    const baseMetrics = this.getMetrics(measurementId);

    // Calculate memory delta
    const memoryAfter = this.getMemoryUsage().heapUsed / (1024 * 1024); // Convert to MB
    const memoryBefore = memoryAfter - (baseMetrics.duration / 1000); // Estimate
    const memoryDelta = memoryAfter - memoryBefore;

    // Get tracking stats
    const networkCalls = this.networkCallTracker.get(measurementId) || 0;
    const fileOperations = this.fileOperationTracker.get(measurementId) || 0;
    const cacheStats = this.cacheStats.get(command) || { hits: 0, misses: 0 };

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks(baseMetrics.duration, memoryDelta, networkCalls, fileOperations);

    // Create comprehensive metrics
    const commandMetrics: CommandMetrics = {
      ...baseMetrics,
      command,
      arguments: args,
      memoryBefore,
      memoryAfter,
      memoryDelta,
      success,
      errorType,
      bottlenecks,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      networkCalls,
      fileOperations
    };

    // Store metrics
    if (!this.commandMetrics.has(command)) {
      this.commandMetrics.set(command, []);
    }
    this.commandMetrics.get(command)!.push(commandMetrics);

    // Check thresholds and generate alerts
    this.checkThresholds(commandMetrics);

    // Generate optimization suggestions
    this.generateOptimizationSuggestions(command, commandMetrics);

    // Cleanup
    this.networkCallTracker.delete(measurementId);
    this.fileOperationTracker.delete(measurementId);

    // Save to disk periodically
    if (Math.random() < 0.1) { // 10% chance to save
      this.saveHistoricalData();
    }

    return commandMetrics;
  }

  /**
   * Track cache hit/miss
   */
  trackCacheOperation(command: string, hit: boolean): void {
    const stats = this.cacheStats.get(command) || { hits: 0, misses: 0 };
    if (hit) {
      stats.hits++;
    } else {
      stats.misses++;
    }
    this.cacheStats.set(command, stats);
  }

  /**
   * Track network call
   */
  trackNetworkCall(measurementId: string): void {
    const current = this.networkCallTracker.get(measurementId) || 0;
    this.networkCallTracker.set(measurementId, current + 1);
  }

  /**
   * Track file operation
   */
  trackFileOperation(measurementId: string): void {
    const current = this.fileOperationTracker.get(measurementId) || 0;
    this.fileOperationTracker.set(measurementId, current + 1);
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(
    duration: number,
    memoryDelta: number,
    networkCalls: number,
    fileOperations: number
  ): string[] {
    const bottlenecks: string[] = [];

    if (duration > this.performanceThresholds.complexCommand) {
      bottlenecks.push('execution-time');
    }

    if (memoryDelta > this.performanceThresholds.memoryWarning) {
      bottlenecks.push('memory-usage');
    }

    if (networkCalls > 3) {
      bottlenecks.push('network-calls');
    }

    if (fileOperations > 5) {
      bottlenecks.push('file-operations');
    }

    return bottlenecks;
  }

  /**
   * Check performance thresholds and generate alerts
   */
  private checkThresholds(metrics: CommandMetrics): void {
    const alerts: PerformanceAlert[] = [];

    // Check execution time thresholds
    const timeThreshold = this.getCommandTimeThreshold(metrics.command);
    if (metrics.duration > timeThreshold) {
      alerts.push({
        type: 'threshold',
        severity: metrics.duration > timeThreshold * 2 ? 'high' : 'medium',
        command: metrics.command,
        message: `Command execution time exceeded threshold`,
        metric: 'duration',
        value: metrics.duration,
        threshold: timeThreshold,
        timestamp: Date.now(),
        suggestions: this.getPerformanceSuggestions('execution-time', metrics.command)
      });
    }

    // Check memory thresholds
    if (metrics.memoryDelta > this.performanceThresholds.memoryWarning) {
      alerts.push({
        type: 'memory',
        severity: metrics.memoryDelta > this.performanceThresholds.memoryLimit ? 'critical' : 'medium',
        command: metrics.command,
        message: `Memory usage exceeded threshold`,
        metric: 'memoryDelta',
        value: metrics.memoryDelta,
        threshold: this.performanceThresholds.memoryWarning,
        timestamp: Date.now(),
        suggestions: this.getPerformanceSuggestions('memory-usage', metrics.command)
      });
    }

    // Check cache hit rate
    const totalCacheOps = metrics.cacheHits + metrics.cacheMisses;
    if (totalCacheOps > 0) {
      const hitRate = (metrics.cacheHits / totalCacheOps) * 100;
      if (hitRate < this.performanceThresholds.cacheHitRate) {
        alerts.push({
          type: 'performance',
          severity: hitRate < 50 ? 'high' : 'medium',
          command: metrics.command,
          message: `Cache hit rate below threshold`,
          metric: 'cacheHitRate',
          value: hitRate,
          threshold: this.performanceThresholds.cacheHitRate,
          timestamp: Date.now(),
          suggestions: this.getPerformanceSuggestions('caching', metrics.command)
        });
      }
    }

    this.alerts.push(...alerts);

    // Emit alerts to console if severe
    alerts.forEach(alert => {
      if (alert.severity === 'high' || alert.severity === 'critical') {
        console.warn(`⚠️  Performance Alert [${alert.severity.toUpperCase()}]: ${alert.message} for /${alert.command}`);
      }
    });
  }

  /**
   * Get appropriate time threshold for command type
   */
  private getCommandTimeThreshold(command: string): number {
    // Fast commands - UI/status operations
    const fastCommands = ['help', 'status', 'mouse', 'paste', 'statusline'];
    if (fastCommands.includes(command)) {
      return this.performanceThresholds.fastCommand;
    }

    // Complex commands - heavy processing
    const complexCommands = ['memory', 'analytics', 'debug', 'security-review', 'export'];
    if (complexCommands.includes(command)) {
      return this.performanceThresholds.complexCommand;
    }

    // Standard commands - default
    return this.performanceThresholds.standardCommand;
  }

  /**
   * Generate performance improvement suggestions
   */
  private getPerformanceSuggestions(bottleneck: string, command: string): string[] {
    const suggestions: Record<string, string[]> = {
      'execution-time': [
        'Consider implementing command result caching',
        'Optimize algorithms and data structures',
        'Implement lazy loading for non-critical data',
        'Use async/await for non-blocking operations'
      ],
      'memory-usage': [
        'Implement object pooling for frequently created objects',
        'Clear unused data structures after command execution',
        'Use streaming for large data processing',
        'Implement memory compaction strategies'
      ],
      'network-calls': [
        'Implement request batching',
        'Add response caching with TTL',
        'Use connection pooling',
        'Implement circuit breaker pattern'
      ],
      'file-operations': [
        'Batch file operations',
        'Implement file content caching',
        'Use async file operations',
        'Optimize file access patterns'
      ],
      'caching': [
        'Implement intelligent cache warming',
        'Optimize cache key strategies',
        'Add cache invalidation logic',
        'Use distributed caching for shared data'
      ]
    };

    return suggestions[bottleneck] || ['Review command implementation for optimization opportunities'];
  }

  /**
   * Generate optimization suggestions for specific commands
   */
  private generateOptimizationSuggestions(command: string, metrics: CommandMetrics): void {
    const existing = this.optimizationSuggestions.get(command);
    if (existing && existing.length > 0) return; // Don't duplicate suggestions

    const suggestions: OptimizationSuggestion[] = [];

    // Analyze bottlenecks and generate specific suggestions
    metrics.bottlenecks.forEach(bottleneck => {
      switch (bottleneck) {
        case 'execution-time':
          suggestions.push({
            command,
            category: 'async',
            description: 'Command execution time is slow',
            impact: 'high',
            implementation: 'Refactor synchronous operations to async, implement result caching',
            estimatedImprovement: '40-60% faster execution'
          });
          break;

        case 'memory-usage':
          suggestions.push({
            command,
            category: 'memory',
            description: 'High memory consumption detected',
            impact: 'medium',
            implementation: 'Implement object pooling and memory cleanup',
            estimatedImprovement: '30-50% less memory usage'
          });
          break;

        case 'network-calls':
          suggestions.push({
            command,
            category: 'batching',
            description: 'Too many network requests',
            impact: 'high',
            implementation: 'Batch requests and implement response caching',
            estimatedImprovement: '50-70% fewer network calls'
          });
          break;

        case 'file-operations':
          suggestions.push({
            command,
            category: 'caching',
            description: 'Excessive file I/O operations',
            impact: 'medium',
            implementation: 'Cache file contents and batch operations',
            estimatedImprovement: '60-80% fewer file operations'
          });
          break;
      }
    });

    this.optimizationSuggestions.set(command, suggestions);
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport(): {
    summary: {
      totalCommands: number;
      uniqueCommands: number;
      averageExecutionTime: number;
      totalMemoryUsed: number;
      alertCount: number;
      sessionDuration: number;
    };
    commandStats: Array<{
      command: string;
      executions: number;
      averageTime: number;
      averageMemory: number;
      successRate: number;
      bottlenecks: string[];
    }>;
    alerts: PerformanceAlert[];
    suggestions: Array<{ command: string; suggestions: OptimizationSuggestion[] }>;
  } {
    const allMetrics = Array.from(this.commandMetrics.values()).flat();
    const sessionDuration = performance.now() - this.sessionStartTime;

    const summary = {
      totalCommands: allMetrics.length,
      uniqueCommands: this.commandMetrics.size,
      averageExecutionTime: allMetrics.reduce((sum, m) => sum + m.duration, 0) / allMetrics.length || 0,
      totalMemoryUsed: allMetrics.reduce((sum, m) => sum + m.memoryDelta, 0),
      alertCount: this.alerts.length,
      sessionDuration
    };

    const commandStats = Array.from(this.commandMetrics.entries()).map(([command, metrics]) => {
      const successCount = metrics.filter(m => m.success).length;
      const uniqueBottlenecks = [...new Set(metrics.flatMap(m => m.bottlenecks))];

      return {
        command,
        executions: metrics.length,
        averageTime: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
        averageMemory: metrics.reduce((sum, m) => sum + m.memoryDelta, 0) / metrics.length,
        successRate: (successCount / metrics.length) * 100,
        bottlenecks: uniqueBottlenecks
      };
    });

    const suggestions = Array.from(this.optimizationSuggestions.entries()).map(([command, suggestions]) => ({
      command,
      suggestions
    }));

    return {
      summary,
      commandStats,
      alerts: this.alerts,
      suggestions
    };
  }

  /**
   * Get top performance bottlenecks across all commands
   */
  getTopBottlenecks(limit: number = 10): Array<{ command: string; bottleneck: string; frequency: number }> {
    const bottleneckCounts = new Map<string, number>();

    for (const [command, metrics] of this.commandMetrics.entries()) {
      for (const metric of metrics) {
        for (const bottleneck of metric.bottlenecks) {
          const key = `${command}:${bottleneck}`;
          bottleneckCounts.set(key, (bottleneckCounts.get(key) || 0) + 1);
        }
      }
    }

    return Array.from(bottleneckCounts.entries())
      .map(([key, frequency]) => {
        const [command, bottleneck] = key.split(':');
        return { command, bottleneck, frequency };
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * Clear old performance data
   */
  clearOldData(maxAge: number = 7 * 24 * 60 * 60 * 1000): void { // 7 days default
    const cutoff = Date.now() - maxAge;

    // Clear old alerts
    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoff);

    // Clear old metrics (keep recent ones for each command)
    for (const [command, metrics] of this.commandMetrics.entries()) {
      const recentMetrics = metrics.slice(-20); // Keep last 20 executions
      this.commandMetrics.set(command, recentMetrics);
    }

    this.saveHistoricalData();
  }

  /**
   * Export performance data for analysis
   */
  exportPerformanceData(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      thresholds: this.performanceThresholds,
      metrics: Object.fromEntries(this.commandMetrics),
      alerts: this.alerts,
      suggestions: Object.fromEntries(this.optimizationSuggestions),
      cacheStats: Object.fromEntries(this.cacheStats)
    }, null, 2);
  }
}

// Singleton instance for global use
export const commandPerformanceMonitor = new CommandPerformanceMonitor();