/**
 * Reliable Jest setup file - Enhanced for test stability
 * Addresses flaky tests, timing dependencies, and mock cleanup
 */

import { setupReliableTestEnvironment } from './src/__tests__/helpers/test-reliability';
import type { ResourceTracker } from './src/__tests__/helpers/test-reliability';
import * as realFs from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

// Global test environment
let globalTestEnv: ReturnType<typeof setupReliableTestEnvironment>;
let globalResourceTracker: ResourceTracker;

// Setup global test environment
beforeAll(() => {
  globalTestEnv = setupReliableTestEnvironment();
  globalResourceTracker = globalTestEnv.resourceTracker;
});

// Enhanced console management
const originalConsole = { ...console };
beforeAll(() => {
  // Suppress non-error console output but track call counts
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = originalConsole.error; // Keep errors for debugging
});

afterAll(async () => {
  // Restore console
  Object.assign(console, originalConsole);
  // Global cleanup
  await globalTestEnv.cleanup();
});

// Test environment setup
process.env.NODE_ENV = 'test';
process.env.PLATO_TEST_MODE = 'true';
process.env.TZ = 'UTC'; // Consistent timezone for tests

// Enhanced timeout configuration
jest.setTimeout(15000); // 15 second timeout (reduced from 30s)

// Mock file system with reliability improvements
const mockFiles = new Map<string, Buffer>();
const tempDirs = new Set<string>();
const openHandles = new Set<any>();

jest.mock('fs/promises', () => {
  const original = jest.requireActual('fs/promises');
  
  return {
    ...original,
    
    readFile: jest.fn().mockImplementation(async (filePath: string, options?: any) => {
      const resolved = path.resolve(filePath);
      
      // Handle temp directories with real fs
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          try {
            return await original.readFile(filePath, options);
          } catch (error: any) {
            // Enhance error with context
            const enhancedError = new Error(`readFile failed for ${filePath}: ${error.message}`) as NodeJS.ErrnoException;
            enhancedError.code = (error as NodeJS.ErrnoException).code || 'ENOENT';
            throw enhancedError;
          }
        }
      }
      
      // Mock file handling
      if (mockFiles.has(resolved)) {
        const buffer = mockFiles.get(resolved)!;
        if (options?.encoding) {
          return buffer.toString(options.encoding as BufferEncoding);
        }
        return options && typeof options === 'string' ? buffer.toString(options as BufferEncoding) : buffer;
      }
      
      // Enhanced ENOENT error
      const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      error.errno = -2;
      error.syscall = 'open';
      error.path = filePath;
      throw error;
    }),
    
    writeFile: jest.fn().mockImplementation(async (filePath: string, data: any, options?: any) => {
      const resolved = path.resolve(filePath);
      
      // Handle temp directories with real fs
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          return original.writeFile(filePath, data, options);
        }
      }
      
      // Mock file storage
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), options?.encoding || 'utf8');
      mockFiles.set(resolved, buffer);
    }),
    
    mkdtemp: jest.fn().mockImplementation(async (prefix: string) => {
      // Create real temp directory for reliable cleanup
      const tempPath = path.join(tmpdir(), `${prefix}${Math.random().toString(36).substr(2, 8)}`);
      await original.mkdir(tempPath, { recursive: true });
      tempDirs.add(tempPath);
      
      // Track for cleanup
      globalResourceTracker.track(async () => {
        try {
          if (tempDirs.has(tempPath)) {
            await original.rm(tempPath, { recursive: true, force: true });
            tempDirs.delete(tempPath);
          }
        } catch (error) {
          console.warn(`Failed to cleanup temp directory ${tempPath}:`, error);
        }
      });
      
      return tempPath;
    }),
    
    stat: jest.fn().mockImplementation(async (filePath: string) => {
      const resolved = path.resolve(filePath);
      
      // Handle temp directories
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          return original.stat(filePath);
        }
      }
      
      // Mock file stats
      if (mockFiles.has(resolved)) {
        const buffer = mockFiles.get(resolved)!;
        return {
          isFile: () => true,
          isDirectory: () => false,
          size: buffer.length,
          mtime: new Date('2023-01-01T00:00:00.000Z'), // Deterministic time
          ctime: new Date('2023-01-01T00:00:00.000Z'),
          atime: new Date('2023-01-01T00:00:00.000Z'),
          mode: 0o644,
        };
      }
      
      const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
    
    realpath: jest.fn().mockImplementation(async (filePath: string) => {
      const resolved = path.resolve(filePath);
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          return original.realpath(filePath);
        }
      }
      return resolved;
    }),
    
    access: jest.fn().mockImplementation(async (filePath: string, mode?: number) => {
      const resolved = path.resolve(filePath);
      
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          return original.access(filePath, mode);
        }
      }
      
      if (mockFiles.has(resolved)) {
        return; // Access granted
      }
      
      const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
    
    rm: jest.fn().mockImplementation(async (filePath: string, options?: any) => {
      const resolved = path.resolve(filePath);
      
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir) || resolved === tempDir) {
          tempDirs.delete(tempDir);
          return original.rm ? original.rm(filePath, options) : original.rmdir(filePath, options);
        }
      }
      
      // Remove from mocks
      for (const key of mockFiles.keys()) {
        if (key.startsWith(resolved)) {
          mockFiles.delete(key);
        }
      }
    }),
  };
});

// Enhanced execa mocking with timeout protection
jest.mock('execa', () => ({
  execaCommand: jest.fn().mockImplementation(async (command: string, options?: any) => {
    // Add timeout protection to prevent hanging
    const timeout = options?.timeout || 30000;
    
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          stdout: '',
          stderr: '',
          exitCode: 0,
          command,
          escapedCommand: command,
          failed: false,
          timedOut: false,
          killed: false,
        });
      }, Math.min(10, timeout)); // Fast mock response
      
      globalResourceTracker.trackTimer(timer);
    });
  }),
  
  execa: jest.fn().mockImplementation(async (file: string, args?: string[], options?: any) => {
    const timeout = options?.timeout || 30000;
    
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          stdout: '',
          stderr: '',
          exitCode: 0,
          command: `${file} ${args?.join(' ') || ''}`,
          failed: false,
          timedOut: false,
          killed: false,
        });
      }, Math.min(10, timeout));
      
      globalResourceTracker.trackTimer(timer);
    });
  }),
}));

// Enhanced Ink mocking for stability
jest.mock('ink', () => {
  const React = require('react');
  return {
    render: jest.fn().mockImplementation((element) => {
      const instance = {
        lastFrame: () => '',
        rerender: jest.fn(),
        unmount: jest.fn(),
        waitUntilExit: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn(),
        stderr: { lastFrame: () => '' },
      };
      
      // Track for cleanup
      globalResourceTracker.track(() => {
        instance.unmount();
      });
      
      return instance;
    }),
    
    Box: React.forwardRef((props: any, ref: any) => 
      React.createElement('div', { ...props, ref })
    ),
    Text: React.forwardRef((props: any, ref: any) => 
      React.createElement('span', { ...props, ref })
    ),
    useApp: () => ({ exit: jest.fn() }),
    useInput: jest.fn(),
    useStdin: () => ({
      stdin: {
        ...process.stdin,
        setRawMode: jest.fn(),
        isRaw: false,
      },
      setRawMode: jest.fn(),
      isRawModeSupported: false,
    }),
  };
});

// Enhanced cleanup between tests
beforeEach(() => {
  // Clear all mocks with detailed tracking
  jest.clearAllMocks();
  
  // Reset mock implementations to ensure fresh state
  mockFiles.clear();
  
  // Clear any tracked open handles
  openHandles.clear();
});

afterEach(async () => {
  // Force garbage collection if available (for memory leak detection)
  if (global.gc) {
    global.gc();
  }
  
  // Clear any remaining handles
  for (const handle of openHandles) {
    try {
      if (typeof handle.close === 'function') {
        handle.close();
      }
    } catch (error) {
      // Silently handle cleanup failures
    }
  }
  openHandles.clear();
});

// Global error handlers for better debugging
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Extend Jest matchers for better async testing
expect.extend({
  async toResolveWithin(received: Promise<any>, timeoutMs: number) {
    try {
      const result = await Promise.race([
        received,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Promise did not resolve within ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      return { pass: true, message: () => 'Promise resolved within timeout' };
    } catch (error: any) {
      return { 
        pass: false, 
        message: () => `Promise failed to resolve within ${timeoutMs}ms: ${error.message}` 
      };
    }
  },
  
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
    };
  },
});

// Type declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toResolveWithin(timeoutMs: number): Promise<R>;
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

export {};
