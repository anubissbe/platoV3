/**
 * Test Reliability Helpers
 * Utilities to improve test stability and reduce flakiness
 */

export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier?: number;
}

export interface TimeoutOptions {
  timeoutMs: number;
  intervalMs?: number;
}

/**
 * Retry mechanism for flaky test operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = { maxRetries: 3, delayMs: 100 },
): Promise<T> {
  let lastError: Error;
  let delay = options.delayMs;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === options.maxRetries) {
        throw lastError;
      }

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * delay;
      await sleep(delay + jitter);

      if (options.backoffMultiplier) {
        delay *= options.backoffMultiplier;
      }
    }
  }

  throw lastError!;
}

/**
 * Wait for condition with timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: TimeoutOptions = { timeoutMs: 5000, intervalMs: 100 },
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < options.timeoutMs) {
    const result = await condition();
    if (result) {
      return;
    }

    await sleep(options.intervalMs || 100);
  }

  throw new Error(`Condition not met within ${options.timeoutMs}ms`);
}

/**
 * Deterministic sleep function for tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock timer utilities for deterministic time-based tests
 */
export class MockTimer {
  private timers = new Map<number, NodeJS.Timeout>();
  private nextId = 1;
  private mockTime = 0;

  constructor(initialTime = 0) {
    this.mockTime = initialTime;
  }

  now(): number {
    return this.mockTime;
  }

  advance(ms: number): void {
    this.mockTime += ms;
  }

  setTimeout(callback: () => void, delay: number): number {
    const id = this.nextId++;
    const timer = setTimeout(() => {
      this.timers.delete(id);
      callback();
    }, delay);
    this.timers.set(id, timer);
    return id;
  }

  clearTimeout(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

/**
 * Resource cleanup tracker for tests
 */
export class ResourceTracker {
  private resources = new Set<() => Promise<void> | void>();
  private timers = new Set<NodeJS.Timeout>();
  private intervals = new Set<NodeJS.Timeout>();

  track(cleanup: () => Promise<void> | void): void {
    this.resources.add(cleanup);
  }

  trackTimer(timer: NodeJS.Timeout): NodeJS.Timeout {
    this.timers.add(timer);
    return timer;
  }

  trackInterval(interval: NodeJS.Timeout): NodeJS.Timeout {
    this.intervals.add(interval);
    return interval;
  }

  async cleanup(): Promise<void> {
    // Clear timers and intervals
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    for (const interval of this.intervals) {
      clearInterval(interval);
    }

    // Clean up resources
    const cleanupPromises = Array.from(this.resources).map(async (cleanup) => {
      try {
        await cleanup();
      } catch (error) {
        console.warn("Resource cleanup failed:", error);
      }
    });

    await Promise.allSettled(cleanupPromises);

    // Clear collections
    this.resources.clear();
    this.timers.clear();
    this.intervals.clear();
  }
}

/**
 * Async operation timeout wrapper
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  errorMessage = `Operation timed out after ${timeoutMs}ms`,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

/**
 * Deterministic UUID generator for tests
 */
export class TestIdGenerator {
  private counter = 0;
  private prefix: string;

  constructor(prefix = "test") {
    this.prefix = prefix;
  }

  next(): string {
    return `${this.prefix}-${++this.counter}`;
  }

  reset(): void {
    this.counter = 0;
  }
}

/**
 * File system mock utilities for reliable testing
 */
export interface MockFile {
  content: Buffer;
  stats: {
    size: number;
    mtime: Date;
    isFile: boolean;
    isDirectory: boolean;
  };
}

export class MockFileSystem {
  private files = new Map<string, MockFile>();

  setFile(path: string, content: string | Buffer, mtime?: Date): void {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    this.files.set(path, {
      content: buffer,
      stats: {
        size: buffer.length,
        mtime: mtime || new Date(),
        isFile: true,
        isDirectory: false,
      },
    });
  }

  getFile(path: string): MockFile | undefined {
    return this.files.get(path);
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }

  clear(): void {
    this.files.clear();
  }

  getAllPaths(): string[] {
    return Array.from(this.files.keys());
  }
}

/**
 * Test environment setup helper
 */
export function setupReliableTestEnvironment(): {
  resourceTracker: ResourceTracker;
  mockTimer: MockTimer;
  idGenerator: TestIdGenerator;
  mockFs: MockFileSystem;
  cleanup: () => Promise<void>;
} {
  const resourceTracker = new ResourceTracker();
  const mockTimer = new MockTimer();
  const idGenerator = new TestIdGenerator();
  const mockFs = new MockFileSystem();

  const cleanup = async () => {
    await resourceTracker.cleanup();
    mockTimer.clearAll();
    idGenerator.reset();
    mockFs.clear();
  };

  return {
    resourceTracker,
    mockTimer,
    idGenerator,
    mockFs,
    cleanup,
  };
}
