/**
 * Load and Stress Testing Suite
 * Tests system behavior under various load conditions
 * Validates reliability, stability, and performance under stress
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  PerformanceMonitor, 
  RenderOptimizer, 
  MemoryManager, 
  VirtualScroller 
} from '../../tui/PerformanceMonitor';

interface LoadTestResult {
  testName: string;
  duration: number;
  operationsPerSecond: number;
  memoryPeak: number;
  errorRate: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

class LoadTester {
  private results: LoadTestResult[] = [];
  private monitor: PerformanceMonitor;
  private memoryManager: MemoryManager;
  
  constructor() {
    this.monitor = new PerformanceMonitor();
    this.memoryManager = new MemoryManager();
  }

  async runLoadTest(
    testName: string,
    operation: () => Promise<void> | void,
    config: {
      duration: number; // milliseconds
      concurrency: number;
      rampUpTime?: number;
      memoryLimit?: number;
    }
  ): Promise<LoadTestResult> {
    const { duration, concurrency, rampUpTime = 0, memoryLimit } = config;
    
    if (memoryLimit) {
      this.memoryManager.setMemoryLimit(memoryLimit);
    }

    const startTime = Date.now();
    const endTime = startTime + duration;
    const responseTimes: number[] = [];
    const errors: Error[] = [];
    let operationCount = 0;
    let memoryPeak = 0;

    // Ramp up
    const rampUpInterval = rampUpTime / concurrency;
    const workers: Promise<void>[] = [];

    for (let i = 0; i < concurrency; i++) {
      if (rampUpTime > 0) {
        await new Promise(resolve => setTimeout(resolve, i * rampUpInterval));
      }

      const worker = this.createWorker(
        operation,
        endTime,
        responseTimes,
        errors,
        () => operationCount++,
        (memory) => { memoryPeak = Math.max(memoryPeak, memory); }
      );
      workers.push(worker);
    }

    // Wait for all workers to complete
    await Promise.allSettled(workers);

    const totalDuration = Date.now() - startTime;
    const errorRate = errors.length / operationCount;
    
    responseTimes.sort((a, b) => a - b);
    const p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    const p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;
    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0;

    const result: LoadTestResult = {
      testName,
      duration: totalDuration,
      operationsPerSecond: operationCount / (totalDuration / 1000),
      memoryPeak,
      errorRate,
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime
    };

    this.results.push(result);
    return result;
  }

  private async createWorker(
    operation: () => Promise<void> | void,
    endTime: number,
    responseTimes: number[],
    errors: Error[],
    incrementOps: () => void,
    trackMemory: (memory: number) => void
  ): Promise<void> {
    while (Date.now() < endTime) {
      const opStart = Date.now();
      
      try {
        await operation();
        const responseTime = Date.now() - opStart;
        responseTimes.push(responseTime);
        incrementOps();
        
        // Track memory usage
        const memory = this.memoryManager.getStats().totalSize;
        trackMemory(memory);
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1));
      } catch (error) {
        errors.push(error as Error);
        incrementOps();
      }
    }
  }

  getResults(): LoadTestResult[] {
    return [...this.results];
  }

  cleanup(): void {
    this.results = [];
    this.monitor.clearMeasurements();
  }
}

// Mock heavy operations for testing
const createLargeDataOperation = (size: number) => {
  return () => {
    const data = new Array(size).fill(0).map((_, i) => ({
      id: i,
      content: `Item ${i} with data content`,
      timestamp: Date.now(),
      metadata: { index: i, processed: true }
    }));
    
    // Simulate processing
    return data.filter(item => item.id % 2 === 0).length;
  };
};

const createMemoryIntensiveOperation = (memoryManager: MemoryManager) => {
  let counter = 0;
  return () => {
    const id = `mem_${counter++}`;
    const data = new Array(1000).fill(`data_${counter}`);
    memoryManager.track(id, data);
    
    // Cleanup old data to prevent unlimited growth
    if (counter > 100) {
      memoryManager.release(`mem_${counter - 100}`);
    }
  };
};

describe('Load and Stress Testing Suite', () => {
  let loadTester: LoadTester;
  
  beforeEach(() => {
    loadTester = new LoadTester();
    
    // Mock performance.now for consistent timing
    let mockTime = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => {
      mockTime += Math.random() * 10; // Simulate variable execution time
      return mockTime;
    });
  });

  afterEach(() => {
    loadTester.cleanup();
    jest.restoreAllMocks();
  });

  describe('CPU Load Testing', () => {
    it('should handle sustained CPU load', async () => {
      const operation = createLargeDataOperation(1000);
      
      const result = await loadTester.runLoadTest(
        'Sustained CPU Load',
        operation,
        {
          duration: 5000, // 5 seconds
          concurrency: 4,
          rampUpTime: 1000
        }
      );

      expect(result.operationsPerSecond).toBeGreaterThan(10);
      expect(result.errorRate).toBeLessThan(0.01); // Less than 1% error rate
      expect(result.averageResponseTime).toBeLessThan(100);
      expect(result.p95ResponseTime).toBeLessThan(200);
      
      console.log(`CPU Load Test Results:`, result);
    }, 10000);

    it('should detect performance degradation under high load', async () => {
      const operation = createLargeDataOperation(2000);
      
      // Run low load test first
      const lowLoadResult = await loadTester.runLoadTest(
        'Low Load Baseline',
        operation,
        {
          duration: 2000,
          concurrency: 1
        }
      );

      // Run high load test
      const highLoadResult = await loadTester.runLoadTest(
        'High Load Test',
        operation,
        {
          duration: 2000,
          concurrency: 8
        }
      );

      // Performance should not degrade too much
      const degradationFactor = highLoadResult.averageResponseTime / lowLoadResult.averageResponseTime;
      expect(degradationFactor).toBeLessThan(5); // Should not be more than 5x slower
      
      console.log(`Load degradation factor: ${degradationFactor.toFixed(2)}x`);
    }, 15000);
  });

  describe('Memory Pressure Testing', () => {
    it('should handle memory pressure gracefully', async () => {
      const memoryManager = new MemoryManager();
      memoryManager.setMemoryLimit(10 * 1024 * 1024); // 10MB limit
      
      const operation = createMemoryIntensiveOperation(memoryManager);
      
      const result = await loadTester.runLoadTest(
        'Memory Pressure Test',
        operation,
        {
          duration: 3000,
          concurrency: 2,
          memoryLimit: 10 * 1024 * 1024
        }
      );

      expect(result.operationsPerSecond).toBeGreaterThan(5);
      expect(result.errorRate).toBeLessThan(0.1); // Allow higher error rate under memory pressure
      expect(result.memoryPeak).toBeLessThan(15 * 1024 * 1024); // Should not exceed limit by too much
      
      console.log(`Memory Pressure Test Results:`, result);
    }, 10000);

    it('should trigger memory pressure callbacks', async () => {
      const memoryManager = new MemoryManager();
      const pressureCallbacks: any[] = [];
      
      memoryManager.onMemoryPressure((info) => {
        pressureCallbacks.push(info);
      });
      
      memoryManager.setMemoryLimit(1000); // Very low limit
      
      // Allocate memory to trigger pressure
      for (let i = 0; i < 10; i++) {
        memoryManager.track(`test_${i}`, new Array(100).fill('x'));
      }
      
      expect(pressureCallbacks.length).toBeGreaterThan(0);
      expect(pressureCallbacks[0]).toMatchObject({
        usage: expect.any(Number),
        limit: 1000,
        percentage: expect.any(Number)
      });
    });

    it('should enforce memory limits', async () => {
      const memoryManager = new MemoryManager();
      memoryManager.setMemoryLimit(100); // Very low limit for testing
      
      const operation = () => {
        // This should trigger memory limit
        for (let i = 0; i < 100; i++) {
          memoryManager.track(`large_${i}`, new Array(50).fill('data'));
        }
      };

      await expect(
        loadTester.runLoadTest('Memory Limit Test', operation, {
          duration: 1000,
          concurrency: 1
        })
      ).resolves.toBeDefined();
      
      // Check that memory limit was hit (should show in error rate)
      const results = loadTester.getResults();
      const memoryResult = results.find(r => r.testName === 'Memory Limit Test');
      expect(memoryResult?.errorRate).toBeGreaterThan(0);
    });
  });

  describe('Concurrency and Race Condition Testing', () => {
    it('should handle concurrent operations without race conditions', async () => {
      const sharedState = { counter: 0, operations: [] as string[] };
      
      const operation = () => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            const operationId = `op_${Date.now()}_${Math.random()}`;
            sharedState.counter++;
            sharedState.operations.push(operationId);
            resolve();
          }, Math.random() * 10);
        });
      };
      
      const result = await loadTester.runLoadTest(
        'Concurrency Test',
        operation,
        {
          duration: 3000,
          concurrency: 5
        }
      );

      expect(result.operationsPerSecond).toBeGreaterThan(10);
      expect(result.errorRate).toBe(0); // No errors expected
      expect(sharedState.counter).toBe(sharedState.operations.length);
      expect(new Set(sharedState.operations).size).toBe(sharedState.operations.length); // All unique
      
      console.log(`Concurrency Test: ${sharedState.counter} operations completed`);
    }, 10000);

    it('should handle resource contention', async () => {
      const resourcePool = Array.from({ length: 3 }, (_, i) => ({ id: i, inUse: false }));
      
      const operation = () => {
        return new Promise<void>((resolve, reject) => {
          // Try to acquire a resource
          const resource = resourcePool.find(r => !r.inUse);
          
          if (!resource) {
            reject(new Error('No resources available'));
            return;
          }
          
          resource.inUse = true;
          
          // Simulate work
          setTimeout(() => {
            resource.inUse = false;
            resolve();
          }, Math.random() * 20);
        });
      };
      
      const result = await loadTester.runLoadTest(
        'Resource Contention Test',
        operation,
        {
          duration: 2000,
          concurrency: 6 // More workers than resources
        }
      );

      expect(result.operationsPerSecond).toBeGreaterThan(5);
      expect(result.errorRate).toBeGreaterThan(0); // Some operations should fail due to contention
      expect(result.errorRate).toBeLessThan(0.8); // But not too many
      
      console.log(`Resource Contention: ${result.errorRate * 100}% error rate`);
    }, 10000);
  });

  describe('Throughput and Response Time Testing', () => {
    it('should maintain consistent throughput under load', async () => {
      const results: LoadTestResult[] = [];
      const operation = createLargeDataOperation(500);
      
      // Run multiple load tests with increasing concurrency
      for (let concurrency = 1; concurrency <= 4; concurrency++) {
        const result = await loadTester.runLoadTest(
          `Throughput Test (${concurrency} workers)`,
          operation,
          {
            duration: 2000,
            concurrency
          }
        );
        results.push(result);
      }
      
      // Throughput should generally increase with concurrency (up to a point)
      expect(results[1].operationsPerSecond).toBeGreaterThan(results[0].operationsPerSecond * 0.8);
      expect(results[2].operationsPerSecond).toBeGreaterThan(results[1].operationsPerSecond * 0.8);
      
      // Response times should remain reasonable
      results.forEach(result => {
        expect(result.p95ResponseTime).toBeLessThan(500);
        expect(result.p99ResponseTime).toBeLessThan(1000);
      });
      
      console.log('Throughput scaling:', results.map(r => ({
        concurrency: parseInt(r.testName.match(/\d+/)?.[0] || '0'),
        ops: Math.round(r.operationsPerSecond),
        p95: Math.round(r.p95ResponseTime)
      })));
    }, 20000);

    it('should handle burst traffic patterns', async () => {
      const operation = createLargeDataOperation(200);
      
      // Simulate burst pattern: high concurrency for short period
      const burstResult = await loadTester.runLoadTest(
        'Burst Traffic Test',
        operation,
        {
          duration: 1000, // Short duration
          concurrency: 10, // High concurrency
          rampUpTime: 100 // Quick ramp up
        }
      );

      expect(burstResult.operationsPerSecond).toBeGreaterThan(20);
      expect(burstResult.errorRate).toBeLessThan(0.05); // Should handle bursts well
      expect(burstResult.p95ResponseTime).toBeLessThan(200);
      
      console.log(`Burst Traffic Results:`, burstResult);
    }, 10000);
  });

  describe('Stability and Reliability Testing', () => {
    it('should maintain stability over extended periods', async () => {
      const operation = createLargeDataOperation(100);
      
      const result = await loadTester.runLoadTest(
        'Stability Test',
        operation,
        {
          duration: 8000, // Extended duration
          concurrency: 2
        }
      );

      expect(result.operationsPerSecond).toBeGreaterThan(15);
      expect(result.errorRate).toBeLessThan(0.01); // Very low error rate
      expect(result.averageResponseTime).toBeLessThan(50);
      
      // Check that performance remained consistent (no significant degradation)
      const results = loadTester.getResults();
      const stabilityResult = results.find(r => r.testName === 'Stability Test');
      expect(stabilityResult?.p99ResponseTime).toBeLessThan(stabilityResult.p95ResponseTime * 2);
      
      console.log(`Stability Test Results:`, result);
    }, 15000);

    it('should recover from error conditions', async () => {
      let errorPhase = true;
      let operationCount = 0;
      
      const operation = () => {
        operationCount++;
        
        // Simulate errors for first 25% of operations
        if (errorPhase && operationCount < 50) {
          if (Math.random() < 0.5) {
            throw new Error('Simulated error');
          }
        } else {
          errorPhase = false;
        }
        
        return createLargeDataOperation(100)();
      };
      
      const result = await loadTester.runLoadTest(
        'Error Recovery Test',
        operation,
        {
          duration: 4000,
          concurrency: 2
        }
      );

      expect(result.operationsPerSecond).toBeGreaterThan(10);
      expect(result.errorRate).toBeGreaterThan(0); // Should have some errors initially
      expect(result.errorRate).toBeLessThan(0.3); // But should recover
      
      console.log(`Error Recovery: ${result.errorRate * 100}% error rate`);
    }, 10000);

    it('should handle resource cleanup under stress', async () => {
      const memoryManager = new MemoryManager();
      let allocationCount = 0;
      
      const operation = () => {
        const id = `cleanup_${allocationCount++}`;
        const data = new Array(500).fill(`data_${allocationCount}`);
        
        memoryManager.track(id, data);
        
        // Trigger cleanup periodically
        if (allocationCount % 20 === 0) {
          // Mark old objects as unused
          for (let i = Math.max(0, allocationCount - 40); i < allocationCount - 20; i++) {
            memoryManager.markUnused(`cleanup_${i}`);
          }
          memoryManager.runGC();
        }
      };
      
      const result = await loadTester.runLoadTest(
        'Resource Cleanup Test',
        operation,
        {
          duration: 3000,
          concurrency: 3
        }
      );

      expect(result.operationsPerSecond).toBeGreaterThan(10);
      expect(result.errorRate).toBeLessThan(0.05);
      
      // Verify cleanup worked
      const finalStats = memoryManager.getStats();
      expect(finalStats.trackedObjects).toBeLessThan(allocationCount); // Some should be cleaned up
      
      console.log(`Resource Cleanup: ${finalStats.trackedObjects}/${allocationCount} objects remaining`);
    }, 10000);
  });

  describe('Performance Boundary Testing', () => {
    it('should identify performance breaking points', async () => {
      const operation = createLargeDataOperation(1000);
      const results: LoadTestResult[] = [];
      
      // Test increasing loads to find breaking point
      const concurrencyLevels = [1, 2, 4, 8, 16];
      
      for (const concurrency of concurrencyLevels) {
        const result = await loadTester.runLoadTest(
          `Breaking Point Test (${concurrency})`,
          operation,
          {
            duration: 2000,
            concurrency
          }
        );
        results.push(result);
        
        // Stop if performance degrades significantly
        if (result.p95ResponseTime > 1000 || result.errorRate > 0.1) {
          console.log(`Breaking point reached at concurrency ${concurrency}`);
          break;
        }
      }
      
      expect(results.length).toBeGreaterThan(0);
      
      // Find the optimal concurrency level
      const optimalResult = results.reduce((best, current) => 
        current.operationsPerSecond > best.operationsPerSecond && current.errorRate < 0.05 ? current : best
      );
      
      console.log(`Optimal configuration:`, {
        concurrency: parseInt(optimalResult.testName.match(/\d+/)?.[0] || '0'),
        opsPerSecond: Math.round(optimalResult.operationsPerSecond),
        avgResponseTime: Math.round(optimalResult.averageResponseTime)
      });
    }, 25000);
  });
});