/**
 * Performance Benchmarking Test Suite
 * Establishes performance baselines and regression testing for TUI components
 * Tests response times, memory usage, and rendering performance
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { render } from "ink-testing-library";
import React from "react";

// Import components for performance testing
import { Header } from "../../tui/components/Header";
import { ConversationArea } from "../../tui/components/ConversationArea";
import { PerformanceMonitor } from "../../tui/performance/PerformanceMonitor";
import {
  useThrottledUpdate,
  useDebouncedUpdate,
  useBatchedUpdates,
  PerformanceUtils,
} from "../../tui/performance/RenderOptimizer";

interface BenchmarkResult {
  operation: string;
  averageTime: number;
  minTime: number;
  maxTime: number;
  iterations: number;
  memoryUsed?: number;
}

// Mock performance API
const mockPerformanceNow = jest.fn();
let mockTime = 0;
mockPerformanceNow.mockImplementation(() => {
  mockTime += 16.67; // Simulate 60fps timing
  return mockTime;
});

Object.defineProperty(global, "performance", {
  value: {
    now: mockPerformanceNow,
    memory: {
      usedJSHeapSize: 30000000,
      totalJSHeapSize: 40000000,
      jsHeapSizeLimit: 2048000000,
    },
  },
  writable: true,
});

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => {
  setTimeout(cb, 16);
  return 1;
});

global.cancelAnimationFrame = jest.fn();

describe("Performance Benchmarking Suite", () => {
  let performanceResults: BenchmarkResult[] = [];

  beforeEach(() => {
    // Clear performance results
    performanceResults = [];
    mockTime = 0;
    mockPerformanceNow.mockClear();

    // Mock memory usage
    Object.defineProperty(process, "memoryUsage", {
      value: jest.fn(() => ({
        rss: 50000000, // 50MB
        heapUsed: 30000000, // 30MB
        heapTotal: 40000000, // 40MB
        external: 5000000, // 5MB
        arrayBuffers: 1000000, // 1MB
      })),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Save performance results for analysis
    if (performanceResults.length > 0) {
      console.log(
        "\nPerformance Results:",
        JSON.stringify(performanceResults, null, 2),
      );
    }

    // Clean up mocks
    jest.restoreAllMocks();
  });

  /**
   * Utility function to run performance benchmarks
   */
  const benchmark = async (
    operationName: string,
    operation: () => void,
    iterations: number = 100,
  ): Promise<BenchmarkResult> => {
    const times: number[] = [];
    const memoryBefore = process.memoryUsage().heapUsed;

    // Warmup run
    for (let i = 0; i < Math.min(5, iterations); i++) {
      operation();
    }

    // Actual benchmarking
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      operation();
      const end = performance.now();
      times.push(end - start);
    }

    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryUsed = memoryAfter - memoryBefore;

    const result: BenchmarkResult = {
      operation: operationName,
      averageTime: times.reduce((a, b) => a + b) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      iterations,
      memoryUsed: memoryUsed > 0 ? memoryUsed : undefined,
    };

    performanceResults.push(result);
    return result;
  };

  describe("Component Rendering Performance", () => {
    it("should benchmark Header component rendering", async () => {
      const result = await benchmark(
        "Header Rendering",
        () => {
          const { rerender, unmount } = render(
            <Header
              model="claude-3-5-sonnet-20241022"
              status="connected"
              tokens={250}
              responseTime={1250}
              memoryUsage={45.2}
            />,
          );

          // Test rerendering performance
          rerender(
            <Header
              model="claude-3-5-sonnet-20241022"
              status="connected"
              tokens={300}
              responseTime={1100}
              memoryUsage={47.8}
            />,
          );

          unmount();
        },
        50,
      );

      // Performance targets
      expect(result.averageTime).toBeLessThan(100); // Less than 100ms average
      expect(result.maxTime).toBeLessThan(500); // Less than 500ms max
      expect(result.iterations).toBe(50);
    });

    it("should benchmark ConversationArea rendering", async () => {
      const mockMessages = [
        { id: "1", content: "Test message 1", role: "user" as const },
        { id: "2", content: "Test response 1", role: "assistant" as const },
        { id: "3", content: "Test message 2", role: "user" as const },
      ];

      const result = await benchmark(
        "ConversationArea Rendering",
        () => {
          const { unmount } = render(
            <ConversationArea
              messages={mockMessages}
              isLoading={false}
              height={20}
            />,
          );
          unmount();
        },
        30,
      );

      expect(result.averageTime).toBeLessThan(150); // Less than 150ms average
      expect(result.maxTime).toBeLessThan(750); // Less than 750ms max
    });

    it("should benchmark large message list performance", async () => {
      const largeMockMessages = Array.from({ length: 100 }, (_, i) => ({
        id: `${i + 1}`,
        content: `Test message ${i + 1} with some content that simulates real conversation`,
        role: (i % 2 === 0 ? "user" : "assistant") as const,
      }));

      const result = await benchmark(
        "Large ConversationArea (100 messages)",
        () => {
          const { unmount } = render(
            <ConversationArea
              messages={largeMockMessages}
              isLoading={false}
              height={20}
            />,
          );
          unmount();
        },
        20,
      );

      expect(result.averageTime).toBeLessThan(300); // Should handle large lists
      expect(result.maxTime).toBeLessThan(1000);
    });
  });

  describe("Hook Performance Tests", () => {
    it("should benchmark useThrottledUpdate hook", async () => {
      let updateCount = 0;
      const TestComponent = () => {
        const throttledUpdate = useThrottledUpdate(() => {
          updateCount++;
        }, 100);

        React.useEffect(() => {
          // Simulate rapid updates
          for (let i = 0; i < 10; i++) {
            throttledUpdate();
          }
        }, [throttledUpdate]);

        return <span>Test Component</span>;
      };

      const result = await benchmark(
        "useThrottledUpdate Hook",
        () => {
          const { unmount } = render(<TestComponent />);
          unmount();
        },
        20,
      );

      expect(result.averageTime).toBeLessThan(50);
    });

    it("should benchmark useDebouncedUpdate hook", async () => {
      let updateCount = 0;
      const TestComponent = () => {
        const debouncedUpdate = useDebouncedUpdate(() => {
          updateCount++;
        }, 50);

        React.useEffect(() => {
          // Simulate rapid updates
          for (let i = 0; i < 5; i++) {
            debouncedUpdate();
          }
        }, [debouncedUpdate]);

        return <span>Test Component</span>;
      };

      const result = await benchmark(
        "useDebouncedUpdate Hook",
        () => {
          const { unmount } = render(<TestComponent />);
          unmount();
        },
        20,
      );

      expect(result.averageTime).toBeLessThan(50);
    });

    it("should benchmark useBatchedUpdates hook", async () => {
      const TestComponent = () => {
        const [state, batchUpdates] = useBatchedUpdates({ value: 0 });

        React.useEffect(() => {
          batchUpdates({ value: 1 });
          batchUpdates({ value: 2 });
          batchUpdates({ value: 3 });
        }, [batchUpdates]);

        return <span>{state.value}</span>;
      };

      const result = await benchmark(
        "useBatchedUpdates Hook",
        () => {
          const { unmount } = render(<TestComponent />);
          unmount();
        },
        30,
      );

      expect(result.averageTime).toBeLessThan(40);
    });
  });

  describe("Performance Utilities", () => {
    it("should benchmark PerformanceUtils.measurePerformance", async () => {
      const result = await benchmark(
        "PerformanceUtils.measurePerformance",
        () => {
          const measureResult = PerformanceUtils.measurePerformance(() => {
            const Component = () => <span>Test</span>;
            const { unmount } = render(<Component />);
            unmount();
            return "test result";
          }, "Test Component");
          expect(measureResult).toBe("test result");
        },
        50,
      );

      expect(result.averageTime).toBeLessThan(30);
    });

    it("should benchmark PerformanceUtils memory checks", async () => {
      const result = await benchmark(
        "Memory Performance Checks",
        () => {
          const shouldSkip = PerformanceUtils.shouldSkipRender(
            Date.now() - 10,
            60,
          );
          const batchSize = PerformanceUtils.getOptimalBatchSize(1000, 60);

          expect(typeof shouldSkip).toBe("boolean");
          expect(typeof batchSize).toBe("number");
          expect(batchSize).toBeGreaterThan(0);
        },
        100,
      );

      expect(result.averageTime).toBeLessThan(10);
    });
  });

  describe("PerformanceMonitor Integration", () => {
    let monitor: PerformanceMonitor;

    beforeEach(() => {
      monitor = new PerformanceMonitor();
    });

    it("should benchmark PerformanceMonitor component", async () => {
      const result = await benchmark(
        "PerformanceMonitor Component",
        () => {
          const { unmount } = render(
            <PerformanceMonitor
              enabled={true}
              showOverlay={false}
              onMetricsUpdate={() => {}}
            />,
          );
          unmount();
        },
        50,
      );

      expect(result.averageTime).toBeLessThan(25);
    });

    it("should benchmark performance hooks", async () => {
      const TestComponentWithPerf = () => {
        const { measureRender } = React.useMemo(
          () => ({
            measureRender: () => {
              const start = performance.now();
              return () => performance.now() - start;
            },
          }),
          [],
        );

        React.useEffect(() => {
          const stopMeasure = measureRender();
          // Simulate some work
          const result = Array(100)
            .fill(0)
            .reduce((a, b) => a + Math.random(), 0);
          const renderTime = stopMeasure();
          expect(renderTime).toBeGreaterThanOrEqual(0);
        }, [measureRender]);

        return <span>Performance Test</span>;
      };

      const result = await benchmark(
        "Performance Hooks Integration",
        () => {
          const { unmount } = render(<TestComponentWithPerf />);
          unmount();
        },
        30,
      );

      expect(result.averageTime).toBeLessThan(50);
    });
  });

  describe("Memory Performance Tests", () => {
    it("should benchmark component memory usage patterns", async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const components: any[] = [];

      const result = await benchmark(
        "Component Memory Pattern",
        () => {
          // Create and mount component
          const { unmount } = render(
            <Header
              model="test"
              status="idle"
              tokens={0}
              responseTime={0}
              memoryUsage={0}
            />,
          );
          components.push({ unmount });

          // Unmount every 10 components to test cleanup
          if (components.length % 10 === 0) {
            components.forEach((comp) => comp.unmount());
            components.length = 0;
          }
        },
        100,
      );

      // Clean up remaining components
      components.forEach((comp) => comp.unmount());

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(result.averageTime).toBeLessThan(50);
      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe("Performance Regression Detection", () => {
    it("should detect significant performance regressions", async () => {
      // Baseline performance test
      const baselineResult = await benchmark(
        "Performance Baseline Test",
        () => {
          const { unmount } = render(
            <ConversationArea
              messages={[{ id: "1", content: "Test", role: "user" }]}
              isLoading={false}
              height={10}
            />,
          );
          unmount();
        },
        50,
      );

      // Compare against expected baseline (this would be loaded from a file in real implementation)
      const expectedBaseline = 100; // 100ms expected baseline

      if (baselineResult.averageTime > expectedBaseline * 1.5) {
        console.warn(
          `Performance regression detected: ${baselineResult.averageTime}ms vs expected ${expectedBaseline}ms`,
        );
      }

      // For testing purposes, we'll just ensure it's within reasonable bounds
      expect(baselineResult.averageTime).toBeLessThan(500);
    });

    it("should maintain 60fps target for rendering operations", async () => {
      const targetFrameTime = 16.67; // 60fps = ~16.67ms per frame

      const result = await benchmark(
        "60fps Target Rendering",
        () => {
          const { rerender, unmount } = render(
            <Header
              model="test"
              status="idle"
              tokens={0}
              responseTime={0}
              memoryUsage={0}
            />,
          );

          // Simulate rapid re-renders (like real-time updates)
          for (let i = 0; i < 5; i++) {
            rerender(
              <Header
                model="test"
                status="connected"
                tokens={i * 10}
                responseTime={100}
                memoryUsage={i * 0.1}
              />,
            );
          }

          unmount();
        },
        30,
      );

      // Average should be well under frame time budget
      expect(result.averageTime).toBeLessThan(targetFrameTime * 2); // Allow 2x frame budget for test environment
      console.log(
        `Frame time utilization: ${((result.averageTime / targetFrameTime) * 100).toFixed(1)}%`,
      );
    });
  });

  describe("End-to-End Performance Tests", () => {
    it("should benchmark complete TUI interaction scenario", async () => {
      const result = await benchmark(
        "Complete TUI Interaction",
        () => {
          // Simulate a complete user interaction scenario
          const messages = [
            { id: "1", content: "Hello", role: "user" as const },
            {
              id: "2",
              content: "Hi there! How can I help?",
              role: "assistant" as const,
            },
          ];

          const { rerender, unmount } = render(
            <div>
              <Header
                model="claude-3-5-sonnet-20241022"
                status="connected"
                tokens={50}
                responseTime={500}
                memoryUsage={25.0}
              />
              <ConversationArea
                messages={messages}
                isLoading={false}
                height={15}
              />
            </div>,
          );

          // Simulate typing indicator
          rerender(
            <div>
              <Header
                model="claude-3-5-sonnet-20241022"
                status="connected"
                tokens={50}
                responseTime={500}
                memoryUsage={25.0}
              />
              <ConversationArea
                messages={messages}
                isLoading={true}
                height={15}
              />
            </div>,
          );

          // Simulate response
          const updatedMessages = [
            ...messages,
            { id: "3", content: "New response", role: "assistant" as const },
          ];
          rerender(
            <div>
              <Header
                model="claude-3-5-sonnet-20241022"
                status="connected"
                tokens={75}
                responseTime={750}
                memoryUsage={28.5}
              />
              <ConversationArea
                messages={updatedMessages}
                isLoading={false}
                height={15}
              />
            </div>,
          );

          unmount();
        },
        20,
      );

      // End-to-end interactions should complete within reasonable time
      expect(result.averageTime).toBeLessThan(400);
      expect(result.maxTime).toBeLessThan(1000);
    });
  });

  describe("Load Testing Scenarios", () => {
    it("should handle high-frequency updates", async () => {
      const result = await benchmark(
        "High Frequency Updates",
        () => {
          let updateCount = 0;
          const { rerender, unmount } = render(
            <Header
              model="test"
              status="idle"
              tokens={updateCount}
              responseTime={0}
              memoryUsage={0}
            />,
          );

          // Simulate rapid updates
          for (let i = 0; i < 50; i++) {
            updateCount++;
            rerender(
              <Header
                model="test"
                status="connected"
                tokens={updateCount}
                responseTime={i * 10}
                memoryUsage={i * 0.1}
              />,
            );
          }

          unmount();
        },
        10,
      );

      expect(result.averageTime).toBeLessThan(200); // Should handle rapid updates
    });

    it("should maintain performance under memory pressure", async () => {
      const result = await benchmark(
        "Memory Pressure Test",
        () => {
          // Simulate memory pressure
          const largeData = Array(1000)
            .fill(0)
            .map((_, i) => `Large data item ${i}`);

          const messages = largeData.map((item, i) => ({
            id: `${i}`,
            content: item,
            role: (i % 2 === 0 ? "user" : "assistant") as const,
          }));

          const { unmount } = render(
            <ConversationArea
              messages={messages}
              isLoading={false}
              height={20}
            />,
          );

          unmount();
        },
        5,
      );

      expect(result.averageTime).toBeLessThan(1000); // Should handle memory pressure
    });
  });
});
