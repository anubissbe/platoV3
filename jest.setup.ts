/**
 * Simplified Jest setup file for global test configuration
 * Focuses on reliability and proper resource cleanup
 */

// Suppress console output during tests unless explicitly needed
const originalConsole = { ...console };

beforeAll(() => {
  // Silence console methods during tests
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  // Keep error for debugging failed tests
  console.error = originalConsole.error;
});

afterAll(() => {
  // Restore original console
  Object.assign(console, originalConsole);
});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PLATO_TEST_MODE = 'true';

// Simple fs mock with clear boundaries
import { tmpdir } from 'os';
import path from 'path';
import * as realFs from 'fs/promises';

// In-memory mock file system
const mockFiles = new Map<string, Buffer>();
const mockStats = new Map<string, any>();

// Helper to determine if path should use real fs
const isRealPath = (filePath: string): boolean => {
  const normalized = path.resolve(filePath);
  const projectRoot = process.cwd();
  
  // Use real fs for:
  // - temp directories and node_modules
  // - project root files (package.json, README.md, .gitignore, etc.)
  // - .github directory and subdirectories
  // - jest config files
  return normalized.startsWith(tmpdir()) || 
         normalized.includes('node_modules') ||
         normalized.startsWith('/tmp/') ||
         normalized === path.join(projectRoot, 'package.json') ||
         normalized === path.join(projectRoot, 'README.md') ||
         normalized === path.join(projectRoot, '.gitignore') ||
         normalized.startsWith(path.join(projectRoot, '.github')) ||
         normalized.includes('jest.config') ||
         normalized === path.join(projectRoot, 'tsconfig.json') ||
         normalized === path.join(projectRoot, 'tsconfig.test.json');
};

// Simplified fs mock
jest.mock('fs/promises', () => {
  const originalFs = jest.requireActual('fs/promises');
  
  return {
    readFile: jest.fn().mockImplementation(async (filePath: string, options?: any) => {
      if (isRealPath(filePath)) {
        return originalFs.readFile(filePath, options);
      }
      
      const normalizedPath = path.resolve(filePath);
      if (mockFiles.has(normalizedPath)) {
        const buffer = mockFiles.get(normalizedPath)!;
        if (options?.encoding) {
          return buffer.toString(options.encoding);
        }
        return buffer;
      }
      
      const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
    
    writeFile: jest.fn().mockImplementation(async (filePath: string, data: any, options?: any) => {
      if (isRealPath(filePath)) {
        return originalFs.writeFile(filePath, data, options);
      }
      
      const normalizedPath = path.resolve(filePath);
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.toString());
      mockFiles.set(normalizedPath, buffer);
      mockStats.set(normalizedPath, {
        isFile: () => true,
        isDirectory: () => false,
        size: buffer.length,
        mtime: new Date(),
      });
    }),
    
    stat: jest.fn().mockImplementation(async (filePath: string) => {
      if (isRealPath(filePath)) {
        return originalFs.stat(filePath);
      }
      
      const normalizedPath = path.resolve(filePath);
      if (mockStats.has(normalizedPath)) {
        return mockStats.get(normalizedPath);
      }
      
      const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
    
    access: jest.fn().mockImplementation(async (filePath: string, mode?: number) => {
      if (isRealPath(filePath)) {
        return originalFs.access(filePath, mode);
      }
      
      const normalizedPath = path.resolve(filePath);
      if (mockFiles.has(normalizedPath) || mockStats.has(normalizedPath)) {
        return; // File exists in mock
      }
      
      const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
    
    mkdtemp: originalFs.mkdtemp,
    mkdir: originalFs.mkdir,
    rmdir: originalFs.rm || originalFs.rmdir,
    readdir: originalFs.readdir,
    unlink: originalFs.unlink,
    rename: originalFs.rename,
    copyFile: originalFs.copyFile,
    appendFile: originalFs.appendFile,
    symlink: originalFs.symlink,
    chmod: originalFs.chmod,
    open: originalFs.open,
  };
});

// Mock execa for command execution
jest.mock('execa', () => ({
  execaCommand: jest.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  }),
  execa: jest.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  }),
}));

// Mock Ink for TUI tests
jest.mock('ink', () => {
  const React = require('react');
  return {
    render: jest.fn().mockImplementation(() => ({
      lastFrame: () => 'mocked output',
      rerender: jest.fn(),
      waitUntilExit: jest.fn().mockResolvedValue(undefined),
      unmount: jest.fn(),
    })),
    Box: jest.fn().mockImplementation((props) => React.createElement('div', props)),
    Text: jest.fn().mockImplementation((props) => React.createElement('span', props)),
    useApp: jest.fn(() => ({ exit: jest.fn() })),
    useInput: jest.fn(),
    useStdin: jest.fn(() => ({
      stdin: process.stdin,
      setRawMode: jest.fn(),
      isRawModeSupported: false,
    })),
    useEffect: React.useEffect,
    useState: React.useState,
    useRef: React.useRef,
    useMemo: React.useMemo,
  };
});

// Test cleanup utilities with flexible timer types
const testCleanup = {
  timers: new Set<any>(),
  intervals: new Set<any>(),
  listeners: new Map<any, Array<{event: string, listener: Function}>>(),
  
  addTimer: (timer: any) => {
    testCleanup.timers.add(timer);
    return timer;
  },
  
  addInterval: (interval: any) => {
    testCleanup.intervals.add(interval);
    return interval;
  },
  
  addListener: (emitter: any, event: string, listener: Function) => {
    if (!testCleanup.listeners.has(emitter)) {
      testCleanup.listeners.set(emitter, []);
    }
    testCleanup.listeners.get(emitter)!.push({event, listener});
    emitter.on(event, listener);
  },
  
  cleanup: () => {
    // Clear all timers
    testCleanup.timers.forEach(timer => clearTimeout(timer));
    testCleanup.timers.clear();
    
    // Clear all intervals
    testCleanup.intervals.forEach(interval => clearInterval(interval));
    testCleanup.intervals.clear();
    
    // Remove all event listeners
    testCleanup.listeners.forEach((listeners, emitter) => {
      listeners.forEach(({event, listener}) => {
        try {
          emitter.removeListener(event, listener);
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
    });
    testCleanup.listeners.clear();
    
    // Clear mock file system
    mockFiles.clear();
    mockStats.clear();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
};

// Global cleanup after each test
afterEach(() => {
  testCleanup.cleanup();
});

// Global test utilities
global.testUtils = {
  // Resource management helpers
  cleanup: testCleanup,
  
  // Timer helpers that auto-cleanup
  setTimeout: (fn: Function, delay: number): any => {
    const timer = setTimeout(fn, delay);
    testCleanup.addTimer(timer);
    return timer;
  },
  
  setInterval: (fn: Function, delay: number): any => {
    const interval = setInterval(fn, delay);
    testCleanup.addInterval(interval);
    return interval;
  },
  
  // Event listener helper that auto-cleans
  addEventListener: (emitter: any, event: string, listener: Function) => {
    testCleanup.addListener(emitter, event, listener);
  },
  
  // Helper to wait for async operations
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
      testCleanup.addInterval(timer);
    });
  },
  
  // Create isolated test directory
  createTempDir: async (): Promise<string> => {
    const tempDir = await realFs.mkdtemp(path.join(tmpdir(), 'plato-test-'));
    // Register for cleanup
    process.on('exit', () => {
      try {
        realFs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors on exit
      }
    });
    return tempDir;
  },
};

// Prevent mouse mode terminal escape sequences in tests
if (process.env.NODE_ENV === 'test') {
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: any, ...args: any[]) => {
    if (typeof chunk === 'string') {
      const filtered = chunk.replace(/\x1b\[\?1000[hl]|\x1b\[\?1002[hl]|\x1b\[\?1006[hl]/g, '');
      if (filtered !== chunk) {
        return true; // Silently ignore mouse escape sequences
      }
    }
    return originalWrite(chunk, ...args);
  }) as any;
}

// Extended Jest matchers
import 'jest-extended/all';

// TypeScript declarations for global test utilities
declare global {
  var testUtils: {
    cleanup: typeof testCleanup;
    setTimeout: (fn: Function, delay: number) => any;
    setInterval: (fn: Function, delay: number) => any;
    addEventListener: (emitter: any, event: string, listener: Function) => void;
    waitFor: (condition: () => boolean, timeout?: number) => Promise<void>;
    createTempDir: () => Promise<string>;
  };
}

export {};