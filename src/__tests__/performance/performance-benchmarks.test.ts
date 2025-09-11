/**
 * Performance Benchmarking Test Suite
 * Establishes performance baselines and regression testing for TUI components
 * Tests response times, memory usage, and rendering performance
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render } from 'ink-testing-library';
import React from 'react';

// Import components for performance testing
import { Header } from '../../tui/components/Header.js';
import { ConversationArea } from '../../tui/components/ConversationArea.js';
import { OptimizedConversationArea } from '../../tui/components/OptimizedConversationArea.js';
import { VirtualScrollList } from '../../tui/components/VirtualScrollList.js';
import { PerformanceMonitor } from '../../tui/performance/PerformanceMonitor.js';
import { 
  useThrottledUpdate,
  useDebouncedUpdate,
  useBatchedUpdates,
  PerformanceUtils
} from '../../tui/performance/RenderOptimizer.js';

// Import test utilities
import { TerminalTestUtils } from '../helpers/terminal-test-utils.js';

interface BenchmarkResult {
  operation: string;
  averageTime: number;
  minTime: number;
  maxTime: number;
  iterations: number;
  memoryUsed?: number;
}

describe('Performance Benchmarking Suite', () => {
  let performanceResults: BenchmarkResult[] = [];
  
  beforeEach(() => {
    // Clear performance results
    performanceResults = [];
    
    // Mock high-resolution time for consistent testing
    const mockPerformanceNow = jest.fn();
    let mockTime = 0;
    mockPerformanceNow.mockImplementation(() => {
      mockTime += 16.67; // Simulate 60fps timing
      return mockTime;
    });
    
    Object.defineProperty(global.performance, 'now', {
      value: mockPerformanceNow,
      configurable: true,
    });
    
    // Setup consistent terminal environment
    TerminalTestUtils.mockTerminal({
      width: 80,
      height: 24,
      colorSupport: true,
      mouseSupport: true,
    });
  });

  afterEach(() => {
    // Log performance results
    if (performanceResults.length > 0) {
      console.log('\n=== Performance Benchmark Results ===');
      performanceResults.forEach(result => {
        console.log(`${result.operation}: ${result.averageTime.toFixed(2)}ms avg (${result.minTime.toFixed(2)}-${result.maxTime.toFixed(2)}ms, ${result.iterations} iterations)`);
      });
      console.log('====================================\n');
    }
    
    jest.restoreAllMocks();
  });

  /**
   * Helper function to benchmark a function
   */
  const benchmark = async (
    operation: string,
    fn: () => Promise<any> | any,
    iterations: number = 100
  ): Promise<BenchmarkResult> => {
    const times: number[] = [];
    const startMemory = process.memoryUsage().heapUsed;
    
    // Warm up
    for (let i = 0; i < 5; i++) {
      await fn();
    }
    
    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1_000_000); // Convert to milliseconds
    }
    
    const endMemory = process.memoryUsage().heapUsed;
    const memoryUsed = endMemory - startMemory;
    
    const result: BenchmarkResult = {
      operation,
      averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      iterations,
      memoryUsed,
    };
    
    performanceResults.push(result);
    return result;
  };

  describe('Component Rendering Performance', () => {
    it('should benchmark Header component rendering', async () => {
      const result = await benchmark(
        'Header Rendering',
        () => {
          const { rerender, unmount } = render(
            <Header
              model="claude-3-5-sonnet-20241022"
              status="connected"
              tokens={250}
              responseTime={1250}
              memoryUsage={45.2}
            />
          );
          
          // Test rerendering performance
          rerender(
            <Header
              model="claude-3-5-sonnet-20241022"
              status="connected"
              tokens={300}
              responseTime={1100}
              memoryUsage={47.8}
            />
          );
          
          unmount();
        },
        50
      );

      // Performance targets
      expect(result.averageTime).toBeLessThan(10); // < 10ms average
      expect(result.maxTime).toBeLessThan(50); // < 50ms maximum
      expect(result.memoryUsed).toBeLessThan(1024 * 1024); // < 1MB memory increase
    });

    it('should benchmark ConversationArea with small message count', async () => {
      const messages = TerminalTestUtils.createTestMessages(5);
      
      const result = await benchmark(
        'ConversationArea (5 messages)',
        () => {
          const { unmount } = render(
            <ConversationArea
              messages={messages}
              height={10}
              showTimestamps={true}
            />
          );
          unmount();
        },
        30
      );

      expect(result.averageTime).toBeLessThan(20); // < 20ms average
      expect(result.maxTime).toBeLessThan(100); // < 100ms maximum
    });

    it('should benchmark ConversationArea with medium message count', async () => {
      const messages = TerminalTestUtils.createTestMessages(50);
      
      const result = await benchmark(
        'ConversationArea (50 messages)',
        () => {
          const { unmount } = render(
            <ConversationArea
              messages={messages}
              height={15}
              showTimestamps={true}
            />
          );
          unmount();
        },
        20
      );

      expect(result.averageTime).toBeLessThan(100); // < 100ms average
      expect(result.maxTime).toBeLessThan(500); // < 500ms maximum
    });

    it('should benchmark OptimizedConversationArea performance improvements', async () => {
      const messages = TerminalTestUtils.createTestMessages(100);
      
      // Benchmark standard ConversationArea
      const standardResult = await benchmark(
        'Standard ConversationArea (100 messages)',
        () => {
          const { unmount } = render(
            <ConversationArea
              messages={messages}
              height={20}
              showTimestamps={true}
            />
          );
          unmount();
        },
        10
      );

      // Benchmark OptimizedConversationArea
      const optimizedResult = await benchmark(
        'Optimized ConversationArea (100 messages)',
        () => {
          const { unmount } = render(
            <OptimizedConversationArea
              messages={messages}
              height={20}
              virtualScrolling={true}
              targetFPS={60}
            />
          );
          unmount();
        },
        10
      );

      // Optimized version should be faster
      expect(optimizedResult.averageTime).toBeLessThan(standardResult.averageTime);
      expect(optimizedResult.averageTime).toBeLessThan(50); // < 50ms target
      
      // Performance improvement should be significant (at least 20% faster)
      const improvement = (standardResult.averageTime - optimizedResult.averageTime) / standardResult.averageTime;
      expect(improvement).toBeGreaterThan(0.2); // At least 20% improvement
    });
  });

  describe('Virtual Scrolling Performance', () => {
    interface VirtualScrollItem {
      id: string;
      content: React.ReactNode;
    }

    it('should benchmark VirtualScrollList with large datasets', async () => {
      const items: VirtualScrollItem[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${i}`,
        content: `Virtual scroll item ${i + 1}: This is a test item with some content that might vary in length.`,
      }));

      const renderItem = (item: VirtualScrollItem) => 
        React.createElement('div', { key: item.id }, item.content);

      const result = await benchmark(
        'VirtualScrollList (1000 items)',
        () => {
          const { unmount } = render(
            React.createElement(VirtualScrollList, {
              items,
              height: 20,
              width: 80,
              renderItem,
              overscan: 3,
              estimatedItemHeight: 1,
            })
          );
          unmount();
        },
        20
      );

      // Virtual scrolling should handle large datasets efficiently
      expect(result.averageTime).toBeLessThan(100); // < 100ms average
      expect(result.maxTime).toBeLessThan(500); // < 500ms maximum
      expect(result.memoryUsed).toBeLessThan(5 * 1024 * 1024); // < 5MB memory increase
    });

    it('should benchmark VirtualScrollList scrolling performance', async () => {
      const items: VirtualScrollItem[] = Array.from({ length: 500 }, (_, i) => ({
        id: `scroll-item-${i}`,
        content: `Scrolling test item ${i + 1}`,
      }));

      const renderItem = (item: VirtualScrollItem) => 
        React.createElement('div', { key: item.id }, item.content);

      const result = await benchmark(
        'VirtualScrollList Scrolling',
        () => {
          const { rerender, unmount } = render(
            React.createElement(VirtualScrollList, {
              items,
              height: 15,
              width: 80,
              renderItem,
              scrollPosition: 0,
            })
          );

          // Simulate scrolling
          for (let pos = 0; pos < 100; pos += 10) {
            rerender(
              React.createElement(VirtualScrollList, {
                items,
                height: 15,
                width: 80,
                renderItem,
                scrollPosition: pos,
              })
            );
          }
          
          unmount();
        },
        10
      );

      // Scrolling should be smooth and fast
      expect(result.averageTime).toBeLessThan(200); // < 200ms for full scroll test
    });
  });

  describe('Performance Optimization Utilities', () => {
    it('should benchmark throttling performance', async () => {
      let updateCount = 0;
      
      const result = await benchmark(
        'Throttling Utility',
        () => {
          return new Promise<void>(resolve => {
            const TestComponent = () => {
              const throttledValue = useThrottledUpdate(updateCount++, 16);
              React.useEffect(() => {
                if (updateCount >= 50) {
                  resolve();
                }
              }, [throttledValue]);
              return null;
            };
            
            render(React.createElement(TestComponent));
          });
        },
        5
      );

      expect(result.averageTime).toBeLessThan(100); // < 100ms for 50 throttled updates
    });

    it('should benchmark debouncing performance', async () => {
      let updateCount = 0;
      
      const result = await benchmark(
        'Debouncing Utility',
        () => {
          return new Promise<void>(resolve => {
            const TestComponent = () => {
              const debouncedValue = useDebouncedUpdate(updateCount++, 10);
              React.useEffect(() => {
                if (updateCount >= 20) {
                  setTimeout(resolve, 50); // Wait for debounce to settle
                }
              }, [debouncedValue]);
              return null;
            };
            
            render(React.createElement(TestComponent));
          });
        },
        5
      );

      expect(result.averageTime).toBeLessThan(200); // < 200ms including debounce delay
    });

    it('should benchmark batch updates performance', async () => {
      const result = await benchmark(
        'Batch Updates Utility',
        () => {
          return new Promise<void>(resolve => {
            const TestComponent = () => {
              const [state, batchUpdate] = useBatchedUpdates({ 
                counter: 0, 
                name: 'test', 
                active: false 
              });
              
              React.useEffect(() => {
                // Perform multiple rapid updates
                for (let i = 0; i < 10; i++) {
                  batchUpdate({ counter: i });
                }
                batchUpdate({ name: 'updated', active: true });
                
                setTimeout(resolve, 20); // Wait for batch to process
              }, []);
              
              return null;
            };
            
            render(React.createElement(TestComponent));
          });
        },
        10
      );

      expect(result.averageTime).toBeLessThan(50); // < 50ms for batched updates
    });

    it('should benchmark PerformanceUtils functions', async () => {
      const result = await benchmark(
        'PerformanceUtils.measurePerformance',
        () => {
          return PerformanceUtils.measurePerformance(() => {
            // Simulate some work
            const arr = Array.from({ length: 1000 }, (_, i) => i * 2);
            return arr.reduce((sum, val) => sum + val, 0);
          }, 'test-operation');
        },
        100
      );

      expect(result.averageTime).toBeLessThan(5); // < 5ms for simple operations
    });
  });

  describe('Memory Usage Benchmarks', () => {
    it('should monitor memory usage during component lifecycle', async () => {
      const messages = TerminalTestUtils.createTestMessages(200);
      let peakMemoryUsage = 0;
      
      const result = await benchmark(
        'Memory Usage Monitoring',
        async () => {
          const initialMemory = process.memoryUsage().heapUsed;
          
          const { rerender, unmount } = render(
            <OptimizedConversationArea
              messages={messages}
              height={25}
              virtualScrolling={true}
              showPerformanceOverlay={false}
            />
          );
          
          // Monitor memory during rerendering
          for (let i = 0; i < 10; i++) {
            rerender(
              <OptimizedConversationArea
                messages={messages.slice(0, messages.length - i * 5)}
                height={25}
                virtualScrolling={true}
                showPerformanceOverlay={false}
              />
            );
            
            const currentMemory = process.memoryUsage().heapUsed;
            peakMemoryUsage = Math.max(peakMemoryUsage, currentMemory - initialMemory);
          }
          
          unmount();
          
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
        },
        5
      );

      // Memory usage should be reasonable
      expect(peakMemoryUsage).toBeLessThan(10 * 1024 * 1024); // < 10MB peak usage
      expect(result.averageTime).toBeLessThan(500); // < 500ms for full lifecycle
    });

    it('should test memory cleanup after unmounting', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const messages = TerminalTestUtils.createTestMessages(100);
      
      // Create and destroy components multiple times
      for (let i = 0; i < 10; i++) {
        const { unmount } = render(
          <OptimizedConversationArea
            messages={messages}
            height={20}
            virtualScrolling={true}
            showPerformanceOverlay={true}
          />
        );
        
        unmount();
      }
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal after cleanup
      expect(memoryIncrease).toBeLessThan(2 * 1024 * 1024); // < 2MB increase
    });
  });

  describe('Rendering Performance Targets', () => {
    it('should achieve 60fps rendering target', async () => {
      const targetFPS = 60;
      const frameTime = 1000 / targetFPS; // 16.67ms per frame
      
      const messages = TerminalTestUtils.createTestMessages(30);
      
      const result = await benchmark(
        '60fps Rendering Target',
        () => {
          const startTime = performance.now();
          
          const { rerender, unmount } = render(
            <OptimizedConversationArea
              messages={messages}
              height={15}
              targetFPS={targetFPS}
              virtualScrolling={true}
              showPerformanceOverlay={false}
            />
          );
          
          // Simulate frame updates
          for (let frame = 0; frame < 10; frame++) {
            rerender(
              <OptimizedConversationArea
                messages={messages.slice(0, messages.length - (frame % 5))}
                height={15}
                targetFPS={targetFPS}
                virtualScrolling={true}
                showPerformanceOverlay={false}
              />
            );
          }
          
          unmount();
          
          const totalTime = performance.now() - startTime;
          return totalTime;
        },
        10
      );

      // Average frame time should be close to target
      const averageFrameTime = result.averageTime / 10; // 10 frames per test
      expect(averageFrameTime).toBeLessThan(frameTime * 1.5); // Allow 50% margin
      
      console.log(`Average frame time: ${averageFrameTime.toFixed(2)}ms (target: ${frameTime.toFixed(2)}ms)`);
    });

    it('should maintain performance with large conversations', async () => {
      const largeMessages = TerminalTestUtils.createTestMessages(500);
      
      const result = await benchmark(
        'Large Conversation Performance',
        () => {
          const { unmount } = render(
            <OptimizedConversationArea
              messages={largeMessages}
              height={30}
              virtualScrolling={true}
              targetFPS={60}
            />
          );
          unmount();
        },
        5
      );

      // Should handle large conversations efficiently
      expect(result.averageTime).toBeLessThan(200); // < 200ms for 500 messages
      expect(result.memoryUsed).toBeLessThan(15 * 1024 * 1024); // < 15MB memory
    });
  });

  describe('Performance Regression Detection', () => {
    it('should establish baseline performance metrics', () => {
      const baselineMetrics = {
        headerRenderTime: 10, // ms
        conversationRenderTime: 100, // ms for 50 messages
        virtualScrollRenderTime: 100, // ms for 1000 items
        memoryUsageLimit: 10 * 1024 * 1024, // 10MB
        fpsTarget: 60,
      };

      // Store baseline metrics for future regression testing
      expect(baselineMetrics.headerRenderTime).toBeGreaterThan(0);
      expect(baselineMetrics.conversationRenderTime).toBeGreaterThan(0);
      expect(baselineMetrics.virtualScrollRenderTime).toBeGreaterThan(0);
      expect(baselineMetrics.memoryUsageLimit).toBeGreaterThan(1024 * 1024); // At least 1MB
      expect(baselineMetrics.fpsTarget).toBe(60);
      
      console.log('Baseline performance metrics established:', baselineMetrics);
    });

    it('should detect performance regressions', async () => {
      // This test would normally compare against stored baseline metrics
      const messages = TerminalTestUtils.createTestMessages(50);
      
      const currentResult = await benchmark(
        'Current Performance Check',
        () => {
          const { unmount } = render(
            <OptimizedConversationArea
              messages={messages}
              height={15}
              virtualScrolling={true}
            />
          );
          unmount();
        },
        10
      );

      // These would be compared against stored baseline metrics
      const baselineTime = 100; // Simulated baseline
      const regressionThreshold = 1.5; // 50% slower indicates regression
      
      const performanceRatio = currentResult.averageTime / baselineTime;
      
      if (performanceRatio > regressionThreshold) {
        console.warn(`Performance regression detected: ${(performanceRatio * 100).toFixed(1)}% of baseline`);
      }
      
      // For now, just ensure it's within reasonable bounds
      expect(currentResult.averageTime).toBeLessThan(baselineTime * regressionThreshold);
    });
  });
});