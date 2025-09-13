/**
 * Memory Leak Detection and Prevention Test Suite
 * Advanced memory leak detection, monitoring, and prevention testing
 * Tests memory patterns, garbage collection, and leak prevention mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MemoryManager } from '../../tui/PerformanceMonitor';

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  trackedObjects: number;
  generation: number;
}

class MemoryLeakDetector {
  private snapshots: MemorySnapshot[] = [];
  private memoryManager: MemoryManager;
  private generation = 0;

  constructor() {
    this.memoryManager = new MemoryManager();
  }

  takeSnapshot(): MemorySnapshot {
    const memoryUsage = process.memoryUsage();
    const stats = this.memoryManager.getStats();
    
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      trackedObjects: stats.trackedObjects,
      generation: this.generation++
    };
    
    this.snapshots.push(snapshot);
    return snapshot;
  }

  analyzeMemoryTrend(): {
    isLeaking: boolean;
    growthRate: number;
    confidence: number;
    recommendation: string;
  } {
    if (this.snapshots.length < 3) {
      return {
        isLeaking: false,
        growthRate: 0,
        confidence: 0,
        recommendation: 'Need more snapshots for analysis'
      };
    }

    // Calculate memory growth trend
    const recentSnapshots = this.snapshots.slice(-5);
    const memoryGrowth = recentSnapshots.map((snapshot, i) => {
      if (i === 0) return 0;
      return snapshot.heapUsed - recentSnapshots[i - 1].heapUsed;
    }).slice(1);

    const averageGrowth = memoryGrowth.reduce((a, b) => a + b, 0) / memoryGrowth.length;
    const growthRate = averageGrowth / (1024 * 1024); // MB per snapshot

    // Simple leak detection heuristic
    const positiveGrowthCount = memoryGrowth.filter(g => g > 0).length;
    const confidence = positiveGrowthCount / memoryGrowth.length;
    
    const isLeaking = growthRate > 0.5 && confidence > 0.7; // Growing >0.5MB per snapshot with high confidence

    let recommendation = 'Memory usage appears stable';
    if (isLeaking) {
      recommendation = 'Potential memory leak detected. Review object lifecycle and cleanup.';
    } else if (growthRate > 0.1) {
      recommendation = 'Minor memory growth observed. Monitor for continued growth.';
    }

    return {
      isLeaking,
      growthRate,
      confidence,
      recommendation
    };
  }

  detectPotentialLeaks(): Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    evidence: any;
  }> {
    const leaks = [];
    const stats = this.memoryManager.getStats();
    const detectionResult = this.memoryManager.detectLeaks();

    // Check for object accumulation
    if (detectionResult.potentialLeaks.length > 0) {
      leaks.push({
        type: 'object_accumulation',
        severity: 'medium' as const,
        description: `${detectionResult.potentialLeaks.length} large objects detected`,
        evidence: detectionResult.potentialLeaks
      });
    }

    // Check for memory growth pattern
    const trendAnalysis = this.analyzeMemoryTrend();
    if (trendAnalysis.isLeaking) {
      leaks.push({
        type: 'memory_growth',
        severity: 'high' as const,
        description: `Consistent memory growth detected (${trendAnalysis.growthRate.toFixed(2)} MB/snapshot)`,
        evidence: { growthRate: trendAnalysis.growthRate, confidence: trendAnalysis.confidence }
      });
    }

    // Check for excessive object tracking
    if (stats.trackedObjects > 1000) {
      leaks.push({
        type: 'excessive_tracking',
        severity: 'medium' as const,
        description: `High number of tracked objects: ${stats.trackedObjects}`,
        evidence: { trackedObjects: stats.trackedObjects }
      });
    }

    return leaks;
  }

  cleanup(): void {
    this.snapshots = [];
    this.generation = 0;
  }

  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }
}

// Leak simulation utilities
class LeakyClass {
  private static instances: LeakyClass[] = [];
  private data: string[];
  private listeners: Array<() => void> = [];

  constructor(size: number = 1000) {
    this.data = new Array(size).fill('x'.repeat(100));
    LeakyClass.instances.push(this); // Intentional leak - not cleaned up
  }

  addListener(callback: () => void): void {
    this.listeners.push(callback);
  }

  // Missing cleanup method - intentional leak
  static getInstanceCount(): number {
    return LeakyClass.instances.length;
  }

  static cleanup(): void {
    LeakyClass.instances.length = 0;
  }
}

class ProperClass {
  private data: string[];
  private listeners: Array<() => void> = [];
  private static instances: WeakSet<ProperClass> = new WeakSet();

  constructor(size: number = 1000) {
    this.data = new Array(size).fill('x'.repeat(100));
    ProperClass.instances.add(this);
  }

  addListener(callback: () => void): void {
    this.listeners.push(callback);
  }

  cleanup(): void {
    this.listeners.length = 0;
    this.data.length = 0;
  }

  dispose(): void {
    this.cleanup();
  }
}

describe('Memory Leak Detection and Prevention', () => {
  let detector: MemoryLeakDetector;
  let originalMemoryUsage: () => NodeJS.MemoryUsage;

  beforeEach(() => {
    detector = new MemoryLeakDetector();
    
    // Mock process.memoryUsage for consistent testing
    originalMemoryUsage = process.memoryUsage;
    let mockHeapUsed = 30000000; // 30MB baseline
    
    (process as any).memoryUsage = jest.fn(() => ({
      rss: mockHeapUsed + 10000000,
      heapUsed: mockHeapUsed,
      heapTotal: mockHeapUsed + 5000000,
      external: 2000000,
      arrayBuffers: 1000000
    }));

    // Allow controlled memory growth simulation
    (process as any).memoryUsage.mockMemoryGrowth = (growth: number) => {
      mockHeapUsed += growth;
    };
  });

  afterEach(() => {
    detector.cleanup();
    LeakyClass.cleanup();
    process.memoryUsage = originalMemoryUsage;
    jest.restoreAllMocks();
  });

  describe('Basic Memory Leak Detection', () => {
    it('should detect growing heap usage patterns', async () => {
      const memoryUsage = process.memoryUsage as jest.MockedFunction<typeof process.memoryUsage> & {
        mockMemoryGrowth: (growth: number) => void;
      };

      // Create baseline snapshots
      detector.takeSnapshot();
      memoryUsage.mockMemoryGrowth(1024 * 1024); // 1MB growth
      
      detector.takeSnapshot();
      memoryUsage.mockMemoryGrowth(1024 * 1024); // Another 1MB growth
      
      detector.takeSnapshot();
      memoryUsage.mockMemoryGrowth(1024 * 1024); // Another 1MB growth
      
      detector.takeSnapshot();

      const analysis = detector.analyzeMemoryTrend();
      
      expect(analysis.isLeaking).toBe(true);
      expect(analysis.growthRate).toBeGreaterThan(0.5); // Growing >0.5MB per snapshot
      expect(analysis.confidence).toBeGreaterThan(0.7);
      expect(analysis.recommendation).toContain('leak detected');
    });

    it('should not flag stable memory usage as leaks', async () => {
      // Create snapshots with stable memory
      for (let i = 0; i < 5; i++) {
        detector.takeSnapshot();
        // Small random fluctuations, but no growth trend
        const fluctuation = (Math.random() - 0.5) * 100000; // ±50KB
        (process.memoryUsage as any).mockMemoryGrowth(fluctuation);
      }

      const analysis = detector.analyzeMemoryTrend();
      
      expect(analysis.isLeaking).toBe(false);
      expect(Math.abs(analysis.growthRate)).toBeLessThan(0.1);
      expect(analysis.recommendation).toContain('stable');
    });

    it('should detect potential leaks through object tracking', async () => {
      const memoryManager = new MemoryManager();
      
      // Create many large objects without cleanup
      for (let i = 0; i < 15; i++) {
        const largeObject = new Array(1000).fill(`data_${i}`);
        memoryManager.track(`leak_${i}`, largeObject);
      }

      const leaks = memoryManager.detectLeaks();
      expect(leaks.potentialLeaks).toHaveLength(15);
    });
  });

  describe('Memory Leak Scenarios', () => {
    it('should detect closure-based memory leaks', async () => {
      const memoryManager = new MemoryManager();
      const closures: Array<() => void> = [];

      // Create closures that retain references to large data
      for (let i = 0; i < 10; i++) {
        const largeData = new Array(1000).fill(`closure_data_${i}`);
        
        const closure = () => {
          return largeData.length; // Closure retains reference to largeData
        };
        
        closures.push(closure);
        memoryManager.track(`closure_${i}`, largeData);
      }

      // Simulate usage of closures
      closures.forEach(closure => closure());

      const initialSnapshot = detector.takeSnapshot();
      
      // Add more closures without cleanup
      for (let i = 10; i < 20; i++) {
        const largeData = new Array(1000).fill(`closure_data_${i}`);
        
        const closure = () => {
          return largeData.length;
        };
        
        closures.push(closure);
        memoryManager.track(`closure_${i}`, largeData);
      }

      const finalSnapshot = detector.takeSnapshot();
      
      expect(finalSnapshot.trackedObjects).toBeGreaterThan(initialSnapshot.trackedObjects);
      
      const potentialLeaks = detector.detectPotentialLeaks();
      expect(potentialLeaks.some(leak => leak.type === 'object_accumulation')).toBe(true);
    });

    it('should detect event listener memory leaks', async () => {
      const memoryManager = new MemoryManager();
      const objects: Array<{ listeners: Array<() => void> }> = [];

      // Simulate event listener accumulation
      for (let i = 0; i < 20; i++) {
        const obj = { listeners: [] as Array<() => void> };
        
        // Add multiple listeners without cleanup
        for (let j = 0; j < 5; j++) {
          const largeData = new Array(200).fill(`listener_data_${i}_${j}`);
          
          obj.listeners.push(() => {
            console.log(largeData[0]); // Retains reference to largeData
          });
          
          memoryManager.track(`listener_${i}_${j}`, largeData);
        }
        
        objects.push(obj);
      }

      const leaks = memoryManager.detectLeaks();
      expect(leaks.potentialLeaks.length).toBeGreaterThan(50); // 20 objects * 5 listeners
    });

    it('should detect DOM-like reference leaks', async () => {
      interface MockElement {
        parent?: MockElement;
        children: MockElement[];
        data: string[];
      }

      const memoryManager = new MemoryManager();
      const elements: MockElement[] = [];

      // Create circular references similar to DOM structures
      for (let i = 0; i < 10; i++) {
        const parent: MockElement = {
          children: [],
          data: new Array(500).fill(`parent_data_${i}`)
        };
        
        for (let j = 0; j < 5; j++) {
          const child: MockElement = {
            parent, // Circular reference
            children: [],
            data: new Array(300).fill(`child_data_${i}_${j}`)
          };
          
          parent.children.push(child);
          memoryManager.track(`element_${i}_${j}`, child);
        }
        
        elements.push(parent);
        memoryManager.track(`parent_${i}`, parent);
      }

      const leaks = memoryManager.detectLeaks();
      expect(leaks.potentialLeaks.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Cleanup and Prevention', () => {
    it('should properly cleanup with dispose pattern', async () => {
      const memoryManager = new MemoryManager();
      const instances: ProperClass[] = [];

      // Create instances with proper cleanup
      for (let i = 0; i < 10; i++) {
        const instance = new ProperClass(500);
        instances.push(instance);
        memoryManager.track(`proper_${i}`, instance);
      }

      const beforeCleanup = memoryManager.getStats();
      expect(beforeCleanup.trackedObjects).toBe(10);

      // Proper cleanup
      instances.forEach(instance => {
        instance.dispose();
      });

      // Remove from tracking
      for (let i = 0; i < 10; i++) {
        memoryManager.release(`proper_${i}`);
      }

      const afterCleanup = memoryManager.getStats();
      expect(afterCleanup.trackedObjects).toBe(0);
    });

    it('should detect improper cleanup patterns', async () => {
      const memoryManager = new MemoryManager();
      
      // Create leaky instances
      for (let i = 0; i < 10; i++) {
        const leakyInstance = new LeakyClass(500);
        memoryManager.track(`leaky_${i}`, leakyInstance);
      }

      const beforeCleanupAttempt = LeakyClass.getInstanceCount();
      expect(beforeCleanupAttempt).toBe(10);

      // Attempt cleanup by removing from tracking, but instances still referenced
      for (let i = 0; i < 10; i++) {
        memoryManager.release(`leaky_${i}`);
      }

      const afterCleanupAttempt = LeakyClass.getInstanceCount();
      expect(afterCleanupAttempt).toBe(10); // Still referenced in static array!

      // Proper cleanup
      LeakyClass.cleanup();
      const afterProperCleanup = LeakyClass.getInstanceCount();
      expect(afterProperCleanup).toBe(0);
    });

    it('should use object pooling to prevent allocations', async () => {
      const memoryManager = new MemoryManager();
      const pool = memoryManager.createPool('test_pool', () => new Array(100).fill('x'), { maxSize: 5 });

      const acquired: any[] = [];
      
      // Acquire more objects than pool size
      for (let i = 0; i < 10; i++) {
        acquired.push(pool.acquire());
      }

      expect(acquired).toHaveLength(10);
      expect(pool.size()).toBe(0); // Pool should be empty

      // Release objects
      acquired.forEach(obj => pool.release(obj));

      expect(pool.size()).toBe(5); // Should only keep maxSize objects
    });

    it('should enforce memory limits to prevent runaway allocation', async () => {
      const memoryManager = new MemoryManager();
      memoryManager.setMemoryLimit(5000); // 5KB limit

      const allocateLargeObjects = () => {
        for (let i = 0; i < 100; i++) {
          const largeObject = new Array(100).fill('x');
          memoryManager.track(`limit_test_${i}`, largeObject);
        }
      };

      expect(allocateLargeObjects).toThrow('Memory limit exceeded');
    });
  });

  describe('Garbage Collection Testing', () => {
    it('should trigger garbage collection when thresholds are met', async () => {
      const memoryManager = new MemoryManager();
      memoryManager.setGCThreshold(1000); // 1KB threshold

      // Allocate objects
      for (let i = 0; i < 20; i++) {
        const obj = new Array(100).fill('x');
        memoryManager.track(`gc_test_${i}`, obj);
      }

      // Mark half as unused
      for (let i = 0; i < 10; i++) {
        memoryManager.markUnused(`gc_test_${i}`);
      }

      const beforeGC = memoryManager.getStats();
      memoryManager.runGC();
      const afterGC = memoryManager.getStats();

      expect(afterGC.trackedObjects).toBe(beforeGC.trackedObjects - 10);
    });

    it('should handle memory pressure gracefully', async () => {
      const memoryManager = new MemoryManager();
      const pressureEvents: any[] = [];

      memoryManager.onMemoryPressure((event) => {
        pressureEvents.push(event);
      });

      memoryManager.setMemoryLimit(2000); // 2KB limit

      // Allocate to trigger pressure warnings
      for (let i = 0; i < 15; i++) {
        const obj = new Array(100).fill('x');
        memoryManager.track(`pressure_test_${i}`, obj);
      }

      expect(pressureEvents.length).toBeGreaterThan(0);
      expect(pressureEvents[0]).toMatchObject({
        usage: expect.any(Number),
        limit: 2000,
        percentage: expect.any(Number)
      });
      expect(pressureEvents[0].percentage).toBeGreaterThan(80);
    });
  });

  describe('Real-world Leak Scenarios', () => {
    it('should detect setTimeout/setInterval leaks', async () => {
      const memoryManager = new MemoryManager();
      const timers: NodeJS.Timeout[] = [];

      // Create timers that hold references to large objects
      for (let i = 0; i < 10; i++) {
        const largeData = new Array(1000).fill(`timer_data_${i}`);
        
        const timer = setInterval(() => {
          largeData[0]; // Access to prevent optimization
        }, 1000);
        
        timers.push(timer);
        memoryManager.track(`timer_data_${i}`, largeData);
      }

      // Simulate forgetting to clear timers
      const leaks = memoryManager.detectLeaks();
      expect(leaks.potentialLeaks.length).toBe(10);

      // Proper cleanup
      timers.forEach(timer => clearInterval(timer));
    });

    it('should handle WeakMap/WeakSet patterns correctly', async () => {
      const memoryManager = new MemoryManager();
      const weakMap = new WeakMap();
      const strongMap = new Map();

      const objects = [];

      // Create objects with both strong and weak references
      for (let i = 0; i < 10; i++) {
        const obj = { data: new Array(100).fill(`weak_test_${i}`) };
        objects.push(obj);
        
        // Weak reference - should allow GC
        weakMap.set(obj, `weak_value_${i}`);
        
        // Strong reference - prevents GC
        strongMap.set(`key_${i}`, obj);
        
        memoryManager.track(`weak_object_${i}`, obj);
      }

      const beforeCleanup = memoryManager.getStats();
      expect(beforeCleanup.trackedObjects).toBe(10);

      // Clear strong references
      strongMap.clear();
      objects.length = 0;

      // WeakMap should still have entries, but objects can be GC'd
      // In real scenario, GC would clean up objects
      for (let i = 0; i < 10; i++) {
        memoryManager.release(`weak_object_${i}`);
      }

      const afterCleanup = memoryManager.getStats();
      expect(afterCleanup.trackedObjects).toBe(0);
    });

    it('should detect module-level variable leaks', async () => {
      const memoryManager = new MemoryManager();
      
      // Simulate module-level variables that accumulate
      const moduleCache: { [key: string]: any } = {};
      
      for (let i = 0; i < 50; i++) {
        const cacheKey = `module_item_${i}`;
        const largeValue = new Array(200).fill(`cached_data_${i}`);
        
        moduleCache[cacheKey] = largeValue;
        memoryManager.track(cacheKey, largeValue);
      }

      const leaks = memoryManager.detectLeaks();
      expect(leaks.potentialLeaks.length).toBeGreaterThan(25); // Should detect large cached items
    });
  });

  describe('Memory Monitoring and Alerting', () => {
    it('should monitor memory trends over time', async () => {
      const memoryUsage = process.memoryUsage as jest.MockedFunction<typeof process.memoryUsage> & {
        mockMemoryGrowth: (growth: number) => void;
      };

      // Simulate gradual memory growth over time
      const snapshots = [];
      for (let i = 0; i < 10; i++) {
        snapshots.push(detector.takeSnapshot());
        memoryUsage.mockMemoryGrowth(512 * 1024); // 512KB growth each time
      }

      const allSnapshots = detector.getSnapshots();
      expect(allSnapshots).toHaveLength(10);

      // Check that memory is consistently growing
      for (let i = 1; i < allSnapshots.length; i++) {
        expect(allSnapshots[i].heapUsed).toBeGreaterThan(allSnapshots[i - 1].heapUsed);
      }

      const trend = detector.analyzeMemoryTrend();
      expect(trend.isLeaking).toBe(true);
      expect(trend.growthRate).toBeGreaterThan(0.4); // Should be ~0.5MB per snapshot
    });

    it('should provide actionable leak detection reports', async () => {
      const memoryManager = new MemoryManager();
      
      // Create various types of potential leaks
      
      // 1. Large object accumulation
      for (let i = 0; i < 20; i++) {
        memoryManager.track(`large_${i}`, new Array(1000).fill('x'));
      }
      
      // 2. Excessive small objects
      for (let i = 0; i < 100; i++) {
        memoryManager.track(`small_${i}`, { data: `small_${i}` });
      }

      const leaks = detector.detectPotentialLeaks();
      
      expect(leaks.length).toBeGreaterThan(0);
      
      const objectAccumulationLeak = leaks.find(leak => leak.type === 'object_accumulation');
      expect(objectAccumulationLeak).toBeDefined();
      expect(objectAccumulationLeak?.severity).toBe('medium');
      expect(objectAccumulationLeak?.description).toContain('large objects');

      const excessiveTrackingLeak = leaks.find(leak => leak.type === 'excessive_tracking');
      expect(excessiveTrackingLeak).toBeDefined();
      expect(excessiveTrackingLeak?.evidence.trackedObjects).toBeGreaterThan(100);
    });
  });
});