/**
 * Jest setup file optimized for performance testing
 * Minimal mocking and maximum execution speed
 */

// Suppress all console output for performance
const silentConsole = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

beforeAll(() => {
  Object.assign(console, silentConsole);
});

// Performance-optimized environment variables
process.env.NODE_ENV = 'test';
process.env.PLATO_TEST_MODE = 'true';
process.env.PLATO_PERFORMANCE_MODE = 'true';
process.env.PLATO_SKIP_SLOW_TESTS = 'true';

// MINIMAL FILE SYSTEM MOCKING - High performance
const mockFiles = new Map<string, string>();
const fastFsMock = {
  readFile: jest.fn().mockImplementation(async (path: string) => {
    return mockFiles.get(path) || 'mock file content';
  }),
  
  writeFile: jest.fn().mockImplementation(async (path: string, data: any) => {
    mockFiles.set(path, data.toString());
  }),
  
  stat: jest.fn().mockResolvedValue({
    isFile: () => true,
    isDirectory: () => false,
    size: 100,
    mtime: new Date('2025-01-01'),
    ctime: new Date('2025-01-01'),
    atime: new Date('2025-01-01'),
  }),
  
  access: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  unlink: jest.fn().mockResolvedValue(undefined),
  rmdir: jest.fn().mockResolvedValue(undefined),
  realpath: jest.fn().mockImplementation(async (path: string) => path),
  
  // Minimal temp directory support
  mkdtemp: jest.fn().mockImplementation(async (prefix: string) => {
    return `/tmp/${prefix}${Math.random().toString(36).substr(2, 9)}`;
  }),
};

jest.mock('fs/promises', () => fastFsMock);

// ULTRA-FAST PROCESS EXECUTION MOCKS
const fastProcessMock = {
  execaCommand: jest.fn().mockImplementation(async (command: string) => {
    // Instant responses for all commands - no real execution
    const responses: Record<string, any> = {
      'echo "Hello World"': { stdout: 'Hello World', stderr: '', exitCode: 0 },
      'echo "test"': { stdout: 'test', stderr: '', exitCode: 0 },
      'pwd': { stdout: '/mock/directory', stderr: '', exitCode: 0 },
      'ls': { stdout: 'file1.txt\nfile2.txt', stderr: '', exitCode: 0 },
      'git status': { stdout: 'On branch main', stderr: '', exitCode: 0 },
      'node --version': { stdout: 'v20.0.0', stderr: '', exitCode: 0 },
      'npm --version': { stdout: '10.0.0', stderr: '', exitCode: 0 },
    };
    
    // Handle sleep commands instantly
    if (command.includes('sleep')) {
      return { stdout: 'sleep completed', stderr: '', exitCode: 0 };
    }
    
    // Handle script executions instantly  
    if (command.includes('.sh')) {
      return { stdout: 'script completed', stderr: '', exitCode: 0 };
    }
    
    return responses[command] || { stdout: 'mock output', stderr: '', exitCode: 0 };
  }),
  
  execa: jest.fn().mockImplementation(async () => ({
    stdout: 'mock output',
    stderr: '',
    exitCode: 0,
  })),
};

jest.mock('execa', () => fastProcessMock);

// MINIMAL INK MOCKING - Performance optimized
jest.mock('ink', () => {
  const React = require('react');
  return {
    render: jest.fn().mockImplementation(() => ({
      lastFrame: () => 'mocked output',
      rerender: jest.fn(),
      waitUntilExit: jest.fn().mockResolvedValue(undefined),
    })),
    Box: jest.fn().mockImplementation((props) => React.createElement('div', props)),
    Text: jest.fn().mockImplementation((props) => React.createElement('span', props)),
    useApp: jest.fn(() => ({ exit: jest.fn() })),
    useInput: jest.fn(),
    useStdin: jest.fn(() => ({
      stdin: { setRawMode: jest.fn(), isRaw: false },
      setRawMode: jest.fn(),
      isRawModeSupported: false,
    })),
  };
});

// PERFORMANCE TRACKING UTILITIES
const performanceTracker = {
  startTime: Date.now(),
  testTimes: new Map<string, number>(),
  
  startTest(testName: string) {
    this.testTimes.set(testName, Date.now());
  },
  
  endTest(testName: string) {
    const startTime = this.testTimes.get(testName);
    if (startTime) {
      const duration = Date.now() - startTime;
      if (duration > 1000) { // Log tests slower than 1s
        console.warn(`SLOW TEST: ${testName} took ${duration}ms`);
      }
    }
  },
  
  getTotalTime() {
    return Date.now() - this.startTime;
  }
};

// Hook into test lifecycle for performance tracking
beforeEach(() => {
  const testName = (expect.getState() as any).currentTestName;
  if (testName) {
    performanceTracker.startTest(testName);
  }
});

afterEach(() => {
  const testName = (expect.getState() as any).currentTestName;
  if (testName) {
    performanceTracker.endTest(testName);
  }
});

afterAll(() => {
  const totalTime = performanceTracker.getTotalTime();
  if (totalTime > 10000) { // Warn if total time > 10s
    console.warn(`PERFORMANCE WARNING: Tests took ${totalTime}ms (target: <10s)`);
  }
});

// MINIMAL GLOBAL UTILITIES - Fixed TypeScript issues
interface TestUtils {
  waitFor: (condition: () => boolean, timeout?: number) => Promise<void>;
  mockFs: typeof fastFsMock;
  performance: typeof performanceTracker;
}

const testUtils: TestUtils = {
  waitFor: (condition: () => boolean, timeout = 1000): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (condition()) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for condition after ${timeout}ms`));
        }
      }, 10); // Faster polling for performance tests
    });
  },
  
  mockFs: fastFsMock,
  
  // Performance utilities
  performance: performanceTracker,
};

// Safely assign to global
(global as any).testUtils = testUtils;

// Clear mocks between tests for clean state
afterEach(() => {
  mockFiles.clear();
  jest.clearAllMocks();
});

// Memory cleanup to prevent leaks
afterAll(() => {
  mockFiles.clear();
  if (global.gc) {
    global.gc();
  }
});

// Disable mouse mode escape sequences
if (process.env.NODE_ENV === 'test') {
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: any, ...args: any[]) => {
    if (typeof chunk === 'string') {
      const filtered = chunk.replace(/\x1b\[\?1000[hl]|\x1b\[\?1002[hl]|\x1b\[\?1006[hl]/g, '');
      if (filtered !== chunk) {
        return true;
      }
    }
    return originalWrite(chunk, ...args);
  }) as any;
}

// TypeScript declarations for global test utilities
declare global {
  var testUtils: TestUtils;
}

export {};