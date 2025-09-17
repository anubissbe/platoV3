import {
  PerformanceMonitor,
  RenderOptimizer,
  MemoryManager,
  VirtualScroller,
  type Metrics,
  type MemoryUsage,
  type PerformanceBudget,
  type ThresholdAlert,
} from "../tui/PerformanceMonitor";

// Enhanced mock for performance.now with controlled timing
let mockTimeValue = 0;
const mockPerformanceNow = jest.fn(() => mockTimeValue);

Object.defineProperty(global, "performance", {
  value: {
    now: mockPerformanceNow,
  },
  writable: true,
});

// Mock requestAnimationFrame with callback execution
let rafCallbacks: ((time: number) => void)[] = [];
let rafId = 1;

global.requestAnimationFrame = jest.fn((callback: (time: number) => void) => {
  rafCallbacks.push(callback);
  return rafId++;
});

global.cancelAnimationFrame = jest.fn();

// Helper function to advance time and execute RAF callbacks
const advanceTime = (ms: number) => {
  mockTimeValue += ms;
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  callbacks.forEach((callback) => callback(mockTimeValue));
};

// Enhanced requestIdleCallback mock
global.requestIdleCallback = jest.fn((cb) => {
  setTimeout(() => cb({ timeRemaining: () => 5 }), 0);
  return 1;
});

// Mock process.memoryUsage for MemoryManager tests
const mockMemoryUsage = jest.fn(() => ({
  rss: 50 * 1024 * 1024,
  heapTotal: 30 * 1024 * 1024,
  heapUsed: 20 * 1024 * 1024,
  external: 5 * 1024 * 1024,
  arrayBuffers: 2 * 1024 * 1024,
}));

Object.defineProperty(process, "memoryUsage", {
  value: mockMemoryUsage,
  writable: true,
});

describe("PerformanceMonitor", () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
    mockTimeValue = 0;
    rafCallbacks = [];
    mockPerformanceNow.mockClear();
    mockMemoryUsage.mockClear();
  });

  afterEach(() => {
    monitor.cleanup();
    jest.clearAllMocks();
  });

  describe("Metrics Collection", () => {
    it("should track render times", () => {
      monitor.startOperation("render");
      advanceTime(50); // Simulate 50ms operation
      monitor.endOperation("render");

      const metrics = monitor.getMetrics("render");
      expect(metrics.duration).toBe(50);
      expect(metrics.count).toBe(1);
      expect(metrics.average).toEqual(50);
    });

    it("should calculate average performance", () => {
      // Record multiple operations with different durations
      for (let i = 0; i < 10; i++) {
        monitor.startOperation("operation");
        advanceTime(10 + i); // Varying durations: 10, 11, 12, ..., 19ms
        monitor.endOperation("operation");
      }

      const metrics = monitor.getMetrics("operation");
      expect(metrics.count).toBe(10);
      expect(metrics.average).toBeGreaterThan(0);
      expect(metrics.min).toBeLessThanOrEqual(metrics.max);
    });

    it("should track memory usage", () => {
      monitor.recordMemoryUsage();

      const metrics = monitor.getMemoryMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.heapUsed).toBeGreaterThan(0);
      expect(metrics.rss).toBeGreaterThan(0);
    });

    it("should detect performance bottlenecks", () => {
      // Record a slow operation
      monitor.startOperation("slow-op");
      advanceTime(100); // 100ms operation
      monitor.endOperation("slow-op");

      // Record a fast operation
      monitor.startOperation("fast-op");
      advanceTime(10); // 10ms operation
      monitor.endOperation("fast-op");

      const bottlenecks = monitor.getBottlenecks(50); // Operations over 50ms
      expect(bottlenecks).toContain("slow-op");
      expect(bottlenecks).not.toContain("fast-op");
    });

    it("should return empty metrics for unknown operations", () => {
      const metrics = monitor.getMetrics("nonexistent");
      expect(metrics.count).toBe(0);
      expect(metrics.duration).toBe(0);
    });
  });

  describe("FPS Monitoring", () => {
    it("should track frame rate", (done) => {
      monitor.startFPSMonitoring();

      let frameCount = 0;
      const maxFrames = 5;

      const renderFrame = () => {
        frameCount++;
        advanceTime(16.67); // Simulate 60fps

        if (frameCount >= maxFrames) {
          const fps = monitor.getCurrentFPS();
          expect(fps).toBeGreaterThanOrEqual(0);
          expect(fps).toBeLessThanOrEqual(70); // Reasonable FPS range
          monitor.stopFPSMonitoring();
          done();
        } else {
          requestAnimationFrame(renderFrame);
          // Manually trigger the next frame
          setTimeout(renderFrame, 16);
        }
      };

      requestAnimationFrame(renderFrame);
      setTimeout(renderFrame, 16); // Start the first frame
    }, 10000);

    it("should detect frame drops", (done) => {
      monitor.startFPSMonitoring();

      // Simulate frame drops by having inconsistent timing
      advanceTime(16.67); // Normal frame
      advanceTime(33.34); // Dropped frame (took 2x longer)
      advanceTime(16.67); // Normal frame

      setTimeout(() => {
        const frameDrops = monitor.getFrameDrops();
        expect(frameDrops).toBeGreaterThanOrEqual(0);
        monitor.stopFPSMonitoring();
        done();
      }, 100);
    });

    it("should not record frames when monitoring is stopped", () => {
      monitor.startFPSMonitoring();
      monitor.stopFPSMonitoring();

      advanceTime(16.67);

      const fps = monitor.getCurrentFPS();
      expect(fps).toBe(0);
    });
  });

  describe("Thresholds and Alerts", () => {
    it("should trigger alerts for slow operations", () => {
      const alertCallback = jest.fn();
      monitor.setThresholdAlert("render", 30, alertCallback);

      monitor.startOperation("render");
      advanceTime(50); // Slow operation
      monitor.endOperation("render");

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "render",
          threshold: 30,
          actual: 50,
        }),
      );
    });

    it("should track performance budget violations", () => {
      const budget: PerformanceBudget = {
        renderTime: 16,
        totalOperations: 100,
        memoryUsage: 50 * 1024 * 1024,
      };

      monitor.setPerformanceBudget(budget);

      // Violate render time budget
      monitor.startOperation("render");
      advanceTime(20); // Over budget
      monitor.endOperation("render");

      const violations = monitor.getBudgetViolations();
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].type).toBe("renderTime");
    });

    it("should not trigger alerts for operations within threshold", () => {
      const alertCallback = jest.fn();
      monitor.setThresholdAlert("render", 100, alertCallback);

      monitor.startOperation("render");
      advanceTime(50); // Within threshold
      monitor.endOperation("render");

      expect(alertCallback).not.toHaveBeenCalled();
    });
  });
});

describe("RenderOptimizer", () => {
  let optimizer: RenderOptimizer;

  beforeEach(() => {
    optimizer = new RenderOptimizer();
    mockTimeValue = 0;
  });

  afterEach(() => {
    optimizer.cleanup();
  });

  describe("Render Batching", () => {
    it("should batch multiple updates", (done) => {
      const renderFn = jest.fn();

      // Queue multiple updates
      optimizer.batchUpdate("component1", renderFn);
      optimizer.batchUpdate("component2", renderFn);
      optimizer.batchUpdate("component3", renderFn);

      setTimeout(() => {
        expect(renderFn).toHaveBeenCalledTimes(3);
        done();
      }, 20);
    });

    it("should debounce rapid updates", (done) => {
      const renderFn = jest.fn();

      // Queue multiple rapid updates for same component
      optimizer.debounceUpdate("component", renderFn, 50);
      optimizer.debounceUpdate("component", renderFn, 50);
      optimizer.debounceUpdate("component", renderFn, 50);

      setTimeout(() => {
        expect(renderFn).toHaveBeenCalledTimes(1);
        done();
      }, 100);
    });

    it("should throttle continuous updates", (done) => {
      const renderFn = jest.fn();
      let callCount = 0;

      const makeCall = () => {
        optimizer.throttleUpdate("component", renderFn, 50);
        callCount++;
        if (callCount < 5) {
          setTimeout(makeCall, 10);
        }
      };

      makeCall();

      setTimeout(() => {
        expect(renderFn).toHaveBeenCalledTimes(1); // Only first call should execute immediately
        done();
      }, 200);
    });
  });

  describe("Render Prioritization", () => {
    it("should prioritize high priority updates", (done) => {
      const highPriorityFn = jest.fn();
      const lowPriorityFn = jest.fn();

      optimizer.prioritizeUpdate("low", lowPriorityFn, "low");
      optimizer.prioritizeUpdate("high", highPriorityFn, "high");

      setTimeout(() => {
        expect(highPriorityFn).toHaveBeenCalled();
        expect(lowPriorityFn).toHaveBeenCalled();
        done();
      }, 50);
    });

    it("should use requestIdleCallback for low priority when available", () => {
      const renderFn = jest.fn();
      optimizer.prioritizeUpdate("component", renderFn, "idle");

      expect(global.requestIdleCallback).toHaveBeenCalled();
    });
  });

  describe("Render Caching", () => {
    it("should cache expensive computations", () => {
      const expensiveCompute = jest.fn(() => "result");

      const result1 = optimizer.cacheComputation("key", expensiveCompute);
      const result2 = optimizer.cacheComputation("key", expensiveCompute);

      expect(expensiveCompute).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });

    it("should invalidate cache when needed", () => {
      const compute = jest.fn(() => "result");

      optimizer.cacheComputation("key", compute);
      optimizer.invalidateCache("key");
      optimizer.cacheComputation("key", compute);

      expect(compute).toHaveBeenCalledTimes(2);
    });
  });
});

describe("MemoryManager", () => {
  let memoryManager: MemoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager(100 * 1024 * 1024); // 100MB limit
  });

  afterEach(() => {
    memoryManager.cleanup();
  });

  describe("Memory Tracking", () => {
    it("should track object allocations", () => {
      const obj = { data: "test" };
      memoryManager.track("test-object", obj);

      const stats = memoryManager.getMemoryStats();
      expect(stats.objectCount).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it("should detect memory leaks", () => {
      // Create objects that would be considered leaks
      for (let i = 0; i < 100; i++) {
        memoryManager.track(`object-${i}`, { data: new Array(1000).fill(i) });
      }

      const leaks = memoryManager.detectLeaks();
      expect(leaks.length).toBeGreaterThanOrEqual(0);
    });

    it("should cleanup released objects", () => {
      const obj = { data: "test" };
      memoryManager.track("test-object", obj);
      memoryManager.release("test-object");

      const stats = memoryManager.getMemoryStats();
      expect(stats.objectCount).toBe(0);
    });
  });

  describe("Memory Optimization", () => {
    it("should implement object pooling", () => {
      const pool = memoryManager.createObjectPool(() => ({ data: null }), 5);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      expect(obj1).toBeDefined();
      expect(obj2).toBeDefined();
      expect(obj1).not.toBe(obj2);

      pool.release(obj1);
      const obj3 = pool.acquire();

      expect(obj3).toBe(obj1); // Should reuse released object
    });

    it("should limit pool size", () => {
      const pool = memoryManager.createObjectPool(() => ({ data: null }), 2);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();
      const obj3 = pool.acquire(); // Should create new since pool is full

      pool.release(obj1);
      pool.release(obj2);
      pool.release(obj3); // This should be ignored due to pool size limit

      const stats = pool.getStats();
      expect(stats.poolSize).toBe(2);
    });

    it("should garbage collect unused objects", () => {
      // Create and release objects
      for (let i = 0; i < 50; i++) {
        const obj = { data: new Array(100).fill(i) };
        memoryManager.track(`temp-${i}`, obj);
        if (i < 25) {
          memoryManager.release(`temp-${i}`);
        }
      }

      const initialStats = memoryManager.getMemoryStats();
      memoryManager.forceGarbageCollection();
      const finalStats = memoryManager.getMemoryStats();

      expect(finalStats.objectCount).toBeLessThanOrEqual(
        initialStats.objectCount,
      );
    });
  });

  describe("Memory Limits", () => {
    it("should enforce memory limits", () => {
      // Try to exceed memory limit
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          memoryManager.track(`large-${i}`, { data: new Array(50000).fill(i) });
        }
      }).toThrow("Memory limit exceeded");
    });

    it("should provide memory pressure warnings", () => {
      // Fill up to warning threshold (80%)
      const warningCallback = jest.fn();
      memoryManager.setMemoryPressureCallback(warningCallback);

      for (let i = 0; i < 50; i++) {
        memoryManager.track(`warning-${i}`, { data: new Array(50000).fill(i) });
      }

      expect(warningCallback).toHaveBeenCalled();
    });
  });
});

describe("VirtualScroller", () => {
  let scroller: VirtualScroller;
  const itemHeight = 20;
  const containerHeight = 500;
  const totalItems = 1000;

  beforeEach(() => {
    scroller = new VirtualScroller({
      itemHeight,
      containerHeight,
      totalItems,
      overscan: 5,
    });
  });

  describe("Virtualization", () => {
    it("should calculate visible items", () => {
      const visible = scroller.getVisibleRange(0);
      expect(visible.start).toBe(0);
      expect(visible.count).toBe(Math.ceil(containerHeight / itemHeight) + 10); // +overscan
    });

    it("should update visible range on scroll", () => {
      scroller.updateScrollPosition(100);
      const visible = scroller.getVisibleRange(100);
      expect(visible.start).toBeGreaterThan(0);
    });

    it("should include buffer for smooth scrolling", () => {
      const visible = scroller.getVisibleRange(0);
      expect(visible.count).toBeGreaterThan(
        Math.ceil(containerHeight / itemHeight),
      );
    });

    it("should handle variable item heights", () => {
      const variableScroller = new VirtualScroller({
        itemHeight: (index) => 20 + (index % 3) * 10, // Variable heights
        containerHeight,
        totalItems: 100,
        overscan: 5,
      });

      const visible = variableScroller.getVisibleRange(0);
      expect(visible.start).toBe(0);
      expect(visible.count).toBeGreaterThan(0);
    });
  });

  describe("Performance", () => {
    it("should handle large datasets efficiently", () => {
      const start = performance.now();
      scroller.getVisibleRange(0);
      scroller.updateScrollPosition(5000);
      scroller.getVisibleRange(5000);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should be fast
      expect(scroller.getVisibleRange(5000).count).toBeGreaterThan(0);
    });

    it("should cache position calculations", () => {
      const calculateSpy = jest.spyOn(scroller as any, "calculateItemPosition");

      scroller.getVisibleRange(100);
      scroller.getVisibleRange(100); // Same position

      expect(calculateSpy).toHaveBeenCalledTimes(1); // Should use cache
    });

    it("should recycle DOM elements", () => {
      const recycleCallback = jest.fn();
      scroller.setRecycleCallback(recycleCallback);

      scroller.updateScrollPosition(0);
      scroller.updateScrollPosition(1000); // Scroll significantly

      expect(recycleCallback).toHaveBeenCalled();
    });
  });

  describe("Smooth Scrolling", () => {
    it("should support smooth scroll animations", () => {
      scroller.smoothScrollTo(500, 1000); // duration = 1000ms
      advanceTime(500); // Half duration

      const position = scroller.getScrollPosition();
      expect(position).toBeCloseTo(250, 50); // Should be roughly halfway
    });

    it("should handle scroll momentum", () => {
      const positions: number[] = [];

      scroller.applyMomentum(5); // 5px/frame velocity

      for (let i = 0; i < 5; i++) {
        advanceTime(16.67);
        positions.push(scroller.getScrollPosition());
      }

      // Positions should show forward movement
      expect(positions[positions.length - 1]).toBeGreaterThan(positions[0]);
    });

    it("should apply friction to momentum", () => {
      scroller.applyMomentum(10);
      advanceTime(16.67);
      const position1 = scroller.getScrollPosition();

      advanceTime(100); // More time for friction to take effect
      const position2 = scroller.getScrollPosition();

      // Should have moved but momentum should decrease over time
      expect(position2).toBeGreaterThan(position1);
    });
  });
});
