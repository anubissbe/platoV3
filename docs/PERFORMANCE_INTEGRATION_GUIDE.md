# Performance Optimization Integration Guide

This guide provides developers with practical instructions for integrating the performance optimization systems into Plato TUI commands.

## Quick Start

### 1. Basic Performance Monitoring

Add performance monitoring to any command function:

```typescript
import { withPerformanceMonitoring } from '../utils/performance-decorator.js';

// Wrap your existing command function
const originalCommand = async (args: string[], session: any, provider?: any) => {
  // Your command logic here
  return { output: "Command executed" };
};

// Enhanced with performance monitoring
const monitoredCommand = withPerformanceMonitoring('command-name', originalCommand, {
  enableCaching: true,
  cacheCategory: 'computed-result',
  cacheTTL: 5 * 60 * 1000 // 5 minutes
});
```

### 2. Manual Performance Tracking

For fine-grained control within existing commands:

```typescript
import { PerformanceTracker } from '../utils/performance-decorator.js';

async function myCommand(args: string[], session: any) {
  const trackingId = PerformanceTracker.startTracking('my-command', args);

  try {
    // Track network calls
    PerformanceTracker.trackNetworkCall(trackingId);
    const apiData = await fetchFromAPI();

    // Track file operations
    PerformanceTracker.trackFileOperation(trackingId);
    const fileData = await readConfigFile();

    // Command logic here
    const result = processData(apiData, fileData);

    PerformanceTracker.endTracking(trackingId, true);
    return { output: result };

  } catch (error) {
    PerformanceTracker.endTracking(trackingId, false, error.constructor.name);
    throw error;
  }
}
```

### 3. Intelligent Caching Integration

```typescript
import { intelligentCacheManager } from '../utils/cache-manager.js';

async function cachedCommand(args: string[], session: any) {
  // Simple cache usage
  const cacheKey = `command-result-${args.join('-')}`;
  const cached = intelligentCacheManager.get(cacheKey, 'computed-result');

  if (cached) {
    return { output: cached };
  }

  // Expensive operation
  const result = await expensiveOperation(args);

  // Cache the result for 10 minutes
  intelligentCacheManager.set(cacheKey, result, 'computed-result', 10 * 60 * 1000);

  return { output: result };
}

// Or use the convenience method
async function smartCachedCommand(args: string[], session: any) {
  const result = await intelligentCacheManager.getOrSet(
    `command-${args.join('-')}`,
    () => expensiveOperation(args),
    'computed-result',
    10 * 60 * 1000
  );

  return { output: result };
}
```

## Integration Patterns

### Pattern 1: Decorator-Based Integration (Recommended)

Best for new commands or complete refactoring:

```typescript
import { PerformanceMonitored, Cached } from '../utils/performance-decorator.js';

class CommandHandler {
  @PerformanceMonitored('my-command', {
    enableCaching: true,
    cacheCategory: 'computed-result',
    cacheTTL: 5 * 60 * 1000
  })
  async handleCommand(args: string[], session: any) {
    // Command implementation
    return await this.processCommand(args);
  }

  @Cached('api-response', 2 * 60 * 1000) // 2 minutes
  private async fetchExternalData(endpoint: string) {
    // Expensive API call - automatically cached
    return await fetch(endpoint).then(r => r.json());
  }
}
```

### Pattern 2: Wrapper Integration

Best for existing commands with minimal changes:

```typescript
// Original command
async function originalMemoryCommand(args: string[], session: any) {
  // Existing implementation
}

// Enhanced version
const memoryCommand = withPerformanceMonitoring('memory', originalMemoryCommand, {
  enableCaching: true,
  cacheCategory: 'memory-data',
  cacheTTL: 2 * 60 * 1000,
  trackNetworkCalls: true,
  trackFileOperations: true
});
```

### Pattern 3: Manual Integration

Best for complex commands requiring fine-grained control:

```typescript
async function complexCommand(args: string[], session: any) {
  const trackingId = PerformanceTracker.startTracking('complex-command', args);

  try {
    // Phase 1: Load configuration (with caching)
    const config = await intelligentCacheManager.getOrSet(
      'app-config',
      () => loadConfiguration(),
      'config',
      30 * 60 * 1000
    );

    // Phase 2: Process data (track operations)
    if (needsNetworkCall(args)) {
      PerformanceTracker.trackNetworkCall(trackingId);
      await fetchExternalData();
    }

    if (needsFileAccess(args)) {
      PerformanceTracker.trackFileOperation(trackingId);
      await readFiles();
    }

    // Phase 3: Generate result
    const result = await generateResult(config, args);

    PerformanceTracker.endTracking(trackingId, true);
    return { output: result };

  } catch (error) {
    PerformanceTracker.endTracking(trackingId, false, error.constructor.name);
    throw error;
  }
}
```

## Cache Strategy Guidelines

### Cache Category Selection

Choose the appropriate cache category based on data characteristics:

```typescript
// Configuration data (long-lived, high priority)
intelligentCacheManager.set(key, value, 'config', 30 * 60 * 1000);

// User session data (medium-lived, high priority)
intelligentCacheManager.set(key, value, 'user-session', 60 * 60 * 1000);

// API responses (short-lived, medium priority)
intelligentCacheManager.set(key, value, 'api-response', 5 * 60 * 1000);

// Computed results (medium-lived, medium priority)
intelligentCacheManager.set(key, value, 'computed-result', 10 * 60 * 1000);

// File contents (short-lived, low priority)
intelligentCacheManager.set(key, value, 'file-content', 2 * 60 * 1000);

// UI state (long-lived, medium priority)
intelligentCacheManager.set(key, value, 'ui-state', 60 * 60 * 1000);

// Memory/conversation data (medium-lived, low priority)
intelligentCacheManager.set(key, value, 'memory-data', 15 * 60 * 1000);
```

### Cache Key Best Practices

```typescript
// Good cache keys (specific, hierarchical)
const configKey = `config:${section}:${version}`;
const apiKey = `api:${endpoint}:${hash(params)}`;
const resultKey = `result:${command}:${hash(args)}`;

// Bad cache keys (too generic, collision-prone)
const badKey1 = 'config'; // Too generic
const badKey2 = args.join('-'); // May have collisions
const badKey3 = `result-${Math.random()}`; // Non-deterministic
```

### Cache TTL Guidelines

| Data Type | TTL | Reasoning |
|-----------|-----|-----------|
| System config | 30 minutes | Changes infrequently, high read volume |
| User preferences | 1 hour | User-specific, moderate change frequency |
| API responses | 5 minutes | External data, moderate staleness acceptable |
| Computed results | 10 minutes | Expensive to compute, moderate staleness acceptable |
| File contents | 2 minutes | May change frequently, short staleness window |
| Search results | 5 minutes | User expects recent results |
| Authentication | 1 hour | Security vs. performance balance |

## Performance Optimization Strategies

### 1. Lazy Loading with Caching

```typescript
import { LazyLoader } from '../utils/performance-decorator.js';

// Expensive resource loaded only when needed
const expensiveResourceLoader = new LazyLoader(
  async () => {
    // Expensive initialization
    return await loadExpensiveResource();
  },
  'expensive-resource-cache-key'
);

async function commandUsingResource(args: string[]) {
  // Resource loaded only on first access, then cached
  const resource = await expensiveResourceLoader.get();
  return processWithResource(resource, args);
}
```

### 2. Batch Operations

```typescript
import { BatchOperationManager } from '../utils/performance-decorator.js';

async function batchProcessing(items: string[]) {
  // Queue operations with different priorities
  const operations = items.map(item =>
    BatchOperationManager.addOperation(
      () => processItem(item),
      getItemPriority(item) // 'high', 'normal', 'low'
    )
  );

  // Execute all operations with intelligent concurrency control
  const results = await Promise.all(operations);
  return results;
}
```

### 3. Connection Pooling

```typescript
import { ConnectionPool } from '../utils/performance-decorator.js';

// Create a connection pool for MCP servers
const mcpPool = ConnectionPool.getPool('mcp-servers',
  () => createMcpConnection(),
  5 // Max connections
);

async function mcpOperation(serverUrl: string) {
  const connection = await mcpPool.acquire();
  try {
    return await performMcpOperation(connection, serverUrl);
  } finally {
    mcpPool.release(connection);
  }
}
```

### 4. Retry with Backoff

```typescript
import { withRetry } from '../utils/performance-decorator.js';

const robustApiCall = withRetry(
  () => callExternalAPI(),
  {
    maxAttempts: 3,
    baseDelay: 100,
    backoffFactor: 2,
    shouldRetry: (error) => error.status >= 500 // Only retry server errors
  }
);
```

## Performance Monitoring Integration

### Command-Level Monitoring

```typescript
// In your command implementation in slash/commands.ts
{
  name: "my-command",
  description: "My optimized command",
  execute: withPerformanceMonitoring('my-command', async (args, session, provider) => {
    // Command logic here
    return { output: "Result" };
  }, {
    enableCaching: true,
    cacheCategory: 'computed-result',
    trackNetworkCalls: true,
    trackFileOperations: true
  })
}
```

### Custom Performance Metrics

```typescript
import { commandPerformanceMonitor } from '../utils/performance-monitor.js';

async function commandWithCustomMetrics(args: string[]) {
  const measurementId = commandPerformanceMonitor.startCommandMeasurement('custom-command', args);

  // Custom tracking
  commandPerformanceMonitor.trackNetworkCall(measurementId);
  commandPerformanceMonitor.trackFileOperation(measurementId);
  commandPerformanceMonitor.trackCacheOperation('custom-command', true); // cache hit

  // Execute command logic
  const result = await executeLogic();

  const metrics = commandPerformanceMonitor.endCommandMeasurement(
    measurementId, 'custom-command', args, true
  );

  console.log(`Command executed in ${metrics.duration}ms`);
  return { output: result };
}
```

## Testing Performance Optimizations

### Running Benchmarks

```bash
# Run comprehensive command benchmarks
npx tsx scripts/benchmark-commands.ts

# Run specific performance tests
npm run test:performance

# Run existing benchmark suite
npm run perf:benchmark
```

### Performance Testing in Development

```typescript
// Add to your test files
import { commandPerformanceMonitor } from '../src/utils/performance-monitor.js';

describe('Command Performance', () => {
  test('should execute within performance threshold', async () => {
    const measurementId = commandPerformanceMonitor.startCommandMeasurement('test-command');

    await myCommand(['arg1', 'arg2']);

    const metrics = commandPerformanceMonitor.endCommandMeasurement(
      measurementId, 'test-command', ['arg1', 'arg2'], true
    );

    expect(metrics.duration).toBeLessThan(200); // 200ms threshold
    expect(metrics.success).toBe(true);
  });
});
```

## Troubleshooting Performance Issues

### Common Issues and Solutions

#### 1. Cache Not Working
```typescript
// Check cache configuration
const stats = intelligentCacheManager.getStats();
console.log('Cache stats:', stats);

// Verify cache key consistency
const key = `command:${JSON.stringify(args.sort())}`; // Sort for consistency
```

#### 2. Memory Leaks
```typescript
// Use memory manager to track objects
import { commandPerformanceMonitor } from '../utils/performance-monitor.js';

const memoryBefore = process.memoryUsage().heapUsed;
await executeCommand();
const memoryAfter = process.memoryUsage().heapUsed;

if (memoryAfter - memoryBefore > 10 * 1024 * 1024) { // 10MB threshold
  console.warn('Potential memory leak detected');
}
```

#### 3. Performance Degradation
```typescript
// Enable detailed performance logging
const report = commandPerformanceMonitor.getPerformanceReport();
console.log('Performance report:', JSON.stringify(report, null, 2));

// Check for bottlenecks
const bottlenecks = commandPerformanceMonitor.getTopBottlenecks(5);
console.log('Top bottlenecks:', bottlenecks);
```

### Performance Debugging Tools

```typescript
// Enable performance debugging
process.env.PLATO_PERFORMANCE_DEBUG = '1';

// Get real-time performance alerts
commandPerformanceMonitor.setThreshold('my-command', 100, (alert) => {
  console.warn(`Performance alert: ${alert.message}`);
  console.warn(`Duration: ${alert.duration}ms (threshold: ${alert.threshold}ms)`);
});
```

## Best Practices Summary

### Do ✅
- Use performance decorators for new commands
- Choose appropriate cache categories and TTLs
- Monitor performance metrics in production
- Implement graceful degradation for cache misses
- Use batch operations for multiple related tasks
- Test performance optimizations with benchmarks

### Don't ❌
- Add caching to every operation without analysis
- Use overly long cache TTLs for frequently changing data
- Ignore cache invalidation strategies
- Skip error handling in performance-critical code
- Optimize prematurely without measuring first
- Cache user-specific data in shared cache entries

### Performance Checklist
- [ ] Command wrapped with performance monitoring
- [ ] Appropriate caching strategy implemented
- [ ] Network calls and file operations tracked
- [ ] Error handling includes performance cleanup
- [ ] Cache keys are consistent and collision-free
- [ ] Performance thresholds defined and tested
- [ ] Graceful degradation implemented
- [ ] Performance impact measured and documented

---

For more detailed information, refer to the source files:
- `src/utils/performance-monitor.ts` - Core performance monitoring
- `src/utils/cache-manager.ts` - Intelligent caching system
- `src/utils/performance-decorator.ts` - Performance optimization decorators
- `scripts/benchmark-commands.ts` - Comprehensive benchmarking suite