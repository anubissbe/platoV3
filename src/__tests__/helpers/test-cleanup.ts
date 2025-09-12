/**
 * Test Cleanup Utilities
 * Provides standardized cleanup patterns to prevent memory leaks and global state pollution
 */

import { EventEmitter } from 'events';
import { resetPersistenceManager } from '../../context/session-persistence.js';

/**
 * Global state cleanup registry
 */
class TestCleanupRegistry {
  private timers = new Set<any>();
  private intervals = new Set<any>();
  private listeners = new Map<EventEmitter, Array<{ event: string; listener: any }>>();
  private cleanupFunctions = new Set<() => void | Promise<void>>();

  addTimer(timer: any): any {
    this.timers.add(timer);
    return timer;
  }

  addInterval(interval: any): any {
    this.intervals.add(interval);
    return interval;
  }

  addListener(emitter: EventEmitter, event: string, listener: any): void {
    if (!this.listeners.has(emitter)) {
      this.listeners.set(emitter, []);
    }
    this.listeners.get(emitter)!.push({ event, listener });
    emitter.on(event, listener);
  }

  addCleanupFunction(fn: () => void | Promise<void>): void {
    this.cleanupFunctions.add(fn);
  }

  async cleanup(): Promise<void> {
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();

    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();

    // Remove all event listeners
    this.listeners.forEach((listeners, emitter) => {
      listeners.forEach(({ event, listener }) => {
        try {
          emitter.removeListener(event, listener);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    });
    this.listeners.clear();

    // Run all cleanup functions
    const cleanupPromises = Array.from(this.cleanupFunctions).map(async fn => {
      try {
        await fn();
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    await Promise.all(cleanupPromises);
    this.cleanupFunctions.clear();

    // Reset global state
    resetPersistenceManager();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
}

const globalRegistry = new TestCleanupRegistry();

/**
 * Enhanced test utilities for reliable testing
 */
export const testCleanup = {
  // Resource management
  setTimeout: (fn: any, delay: number): any => {
    return globalRegistry.addTimer(setTimeout(fn, delay));
  },

  setInterval: (fn: any, delay: number): any => {
    return globalRegistry.addInterval(setInterval(fn, delay));
  },

  addEventListener: (emitter: EventEmitter, event: string, listener: any): void => {
    globalRegistry.addListener(emitter, event, listener);
  },

  addCleanup: (fn: () => void | Promise<void>): void => {
    globalRegistry.addCleanupFunction(fn);
  },

  // Full cleanup
  cleanup: async (): Promise<void> => {
    await globalRegistry.cleanup();
  },

  // Wait for condition with auto-cleanup
  waitFor: (condition: () => boolean, timeout = 1000): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timer = setInterval(() => {
        if (condition()) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - startTime > timeout) {
          clearInterval(timer);
          reject(new Error(`Timeout waiting for condition after ${timeout}ms`));
        }
      }, 10);
      globalRegistry.addInterval(timer);
    });
  },

  // Create isolated environment for tests
  createIsolatedEnv: async (): Promise<string> => {
    const globalTestUtils = (global as any).testUtils;
    const tmpDir = await (globalTestUtils?.createTempDir?.() || Promise.resolve('/tmp/test'));
    globalRegistry.addCleanupFunction(() => {
      // Cleanup will be handled by global testUtils
    });
    return tmpDir;
  },

  // Mock cleanup helpers
  mockConsole: (): { restore: () => void } => {
    const originalConsole = { ...console };
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    
    const restore = () => {
      Object.assign(console, originalConsole);
    };
    
    globalRegistry.addCleanupFunction(restore);
    return { restore };
  },

  // Event emitter cleanup
  createEventEmitter: (): EventEmitter => {
    const emitter = new EventEmitter();
    // Set a reasonable limit to prevent memory leak warnings
    emitter.setMaxListeners(20);
    
    globalRegistry.addCleanupFunction(() => {
      emitter.removeAllListeners();
    });
    
    return emitter;
  },

  // Jest mock cleanup
  clearAllMocks: (): void => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.restoreAllMocks();
  }
};

/**
 * Setup function to use in test files
 */
export function setupTestCleanup(): void {
  beforeEach(() => {
    testCleanup.clearAllMocks();
  });

  afterEach(async () => {
    await testCleanup.cleanup();
  });

  afterAll(async () => {
    await testCleanup.cleanup();
  });
}

/**
 * Enhanced test environment setup
 */
export function setupTestEnvironment(options: {
  disableConsole?: boolean;
  maxEventListeners?: number;
  tempDirPrefix?: string;
} = {}): void {
  setupTestCleanup();

  beforeAll(() => {
    // Set environment variables
    process.env.NODE_ENV = 'test';
    process.env.PLATO_TEST_MODE = 'true';

    // Set EventEmitter limits to prevent warnings
    if (options.maxEventListeners) {
      EventEmitter.defaultMaxListeners = options.maxEventListeners;
    }

    // Mock console if requested
    if (options.disableConsole) {
      testCleanup.mockConsole();
    }
  });

  beforeEach(() => {
    // Clear Jest timers
    jest.clearAllTimers();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
}

/**
 * Create isolated test with cleanup
 */
export function isolatedTest(name: string, testFn: () => void | Promise<void>): void {
  test(name, async () => {
    const cleanup = new TestCleanupRegistry();
    
    try {
      // Replace global testUtils temporarily
      const originalTestUtils = (global as any).testUtils;
      (global as any).testUtils = {
        ...originalTestUtils,
        cleanup: cleanup,
        setTimeout: cleanup.addTimer.bind(cleanup),
        setInterval: cleanup.addInterval.bind(cleanup),
        addEventListener: cleanup.addListener.bind(cleanup),
      };

      await testFn();
    } finally {
      await cleanup.cleanup();
    }
  });
}

/**
 * Memory leak detection helper
 */
export function withMemoryLeakDetection<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const initialListeners = process.listenerCount('exit');
    
    try {
      const result = await fn();
      
      // Check for listener leaks
      const finalListeners = process.listenerCount('exit');
      if (finalListeners > initialListeners + 2) { // Allow some tolerance
        console.warn(`Potential listener leak detected: ${finalListeners - initialListeners} new listeners`);
      }
      
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}