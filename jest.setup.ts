/**
 * Jest setup file for global test configuration
 * This runs before all test suites
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

// Setup fs mocks with ACTUAL implementations for tool tests
import { tmpdir } from 'os';
import path from 'path';
import * as realFs from 'fs/promises';
import fs from 'fs';

// Create a virtual file system for tests
const mockFiles = new Map<string, Buffer>();
const mockStats = new Map<string, any>();
let mockTempDirs = new Set<string>();

// Mock fs/promises with selective real implementations
jest.mock('fs/promises', () => {
  const originalFs = jest.requireActual('fs/promises');
  
  return {
    readFile: jest.fn().mockImplementation(async (filePath: string, options?: any) => {
      const normalizedPath = path.resolve(filePath);
      
      // Check if it's a mock file first
      if (mockFiles.has(normalizedPath)) {
        const buffer = mockFiles.get(normalizedPath)!;
        if (options && typeof options === 'string') {
          return buffer.toString(options as BufferEncoding);
        }
        if (options && options.encoding) {
          return buffer.toString(options.encoding);
        }
        return buffer;
      }
      
      // For temp directories created by tests, use real fs
      for (const tempDir of mockTempDirs) {
        if (normalizedPath.startsWith(tempDir)) {
          return originalFs.readFile(filePath, options);
        }
      }
      
      // Default: throw ENOENT
      const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      error.errno = -2;
      error.syscall = 'open';
      error.path = filePath;
      throw error;
    }),
    
    writeFile: jest.fn().mockImplementation(async (filePath: string, data: any, options?: any) => {
      const normalizedPath = path.resolve(filePath);
      
      // For temp directories, use real fs
      for (const tempDir of mockTempDirs) {
        if (normalizedPath.startsWith(tempDir)) {
          return originalFs.writeFile(filePath, data, options);
        }
      }
      
      // Store in mock files
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.toString(), options?.encoding || 'utf8');
      mockFiles.set(normalizedPath, buffer);
      
      // Mock the stats
      mockStats.set(normalizedPath, {
        isFile: () => true,
        isDirectory: () => false,
        size: buffer.length,
        mtime: new Date(),
        ctime: new Date(),
        atime: new Date(),
      });
    }),
    
    stat: jest.fn().mockImplementation(async (filePath: string) => {
      const normalizedPath = path.resolve(filePath);
      
      // Check mock files first
      if (mockStats.has(normalizedPath)) {
        return mockStats.get(normalizedPath);
      }
      
      // For temp directories, use real fs
      for (const tempDir of mockTempDirs) {
        if (normalizedPath.startsWith(tempDir)) {
          return originalFs.stat(filePath);
        }
      }
      
      // Default: throw ENOENT
      const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      error.errno = -2;
      error.syscall = 'stat';
      error.path = filePath;
      throw error;
    }),
    
    realpath: jest.fn().mockImplementation(async (filePath: string) => {
      const normalizedPath = path.resolve(filePath);
      
      // Check if file exists in mocks
      if (mockFiles.has(normalizedPath)) {
        return normalizedPath;
      }
      
      // For temp directories, use real fs
      for (const tempDir of mockTempDirs) {
        if (normalizedPath.startsWith(tempDir)) {
          return originalFs.realpath(filePath);
        }
      }
      
      // Default: throw ENOENT
      const error = new Error(`ENOENT: no such file or directory, realpath '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      error.errno = -2;
      error.syscall = 'realpath';
      error.path = filePath;
      throw error;
    }),
    
    mkdtemp: jest.fn().mockImplementation(async (prefix: string) => {
      const tempPath = path.join(tmpdir(), `${prefix}${Math.random().toString(36).substr(2, 9)}`);
      
      // Actually create the directory
      await originalFs.mkdir(tempPath, { recursive: true });
      mockTempDirs.add(tempPath);
      
      return tempPath;
    }),
    
    mkdir: jest.fn().mockImplementation(async (dirPath: string, options?: any) => {
      const normalizedPath = path.resolve(dirPath);
      
      // For temp directories, use real fs
      for (const tempDir of mockTempDirs) {
        if (normalizedPath.startsWith(tempDir)) {
          return originalFs.mkdir(dirPath, options);
        }
      }
      
      // Mock the directory
      mockStats.set(normalizedPath, {
        isFile: () => false,
        isDirectory: () => true,
        size: 0,
        mtime: new Date(),
        ctime: new Date(),
        atime: new Date(),
      });
    }),
    
    rmdir: jest.fn().mockImplementation(async (dirPath: string, options?: any) => {
      const normalizedPath = path.resolve(dirPath);
      
      // For temp directories, use real fs
      for (const tempDir of mockTempDirs) {
        if (normalizedPath.startsWith(tempDir) || normalizedPath === tempDir) {
          mockTempDirs.delete(tempDir);
          return originalFs.rmdir ? originalFs.rmdir(dirPath, options) : originalFs.rm(dirPath, { recursive: true, force: true });
        }
      }
      
      // Remove from mocks
      mockStats.delete(normalizedPath);
      for (const key of mockFiles.keys()) {
        if (key.startsWith(normalizedPath)) {
          mockFiles.delete(key);
          mockStats.delete(key);
        }
      }
    }),
    
    access: jest.fn().mockImplementation(async (filePath: string) => {
      const normalizedPath = path.resolve(filePath);
      
      // Check mock files
      if (mockFiles.has(normalizedPath) || mockStats.has(normalizedPath)) {
        return; // Access OK
      }
      
      // For temp directories, use real fs
      for (const tempDir of mockTempDirs) {
        if (normalizedPath.startsWith(tempDir)) {
          return originalFs.access(filePath);
        }
      }
      
      // Default: throw ENOENT
      const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      error.errno = -2;
      error.syscall = 'access';
      error.path = filePath;
      throw error;
    }),
    
    readdir: jest.fn().mockImplementation(async (dirPath: string) => {
      const normalizedPath = path.resolve(dirPath);
      
      // For temp directories, use real fs
      for (const tempDir of mockTempDirs) {
        if (normalizedPath.startsWith(tempDir)) {
          return originalFs.readdir(dirPath);
        }
      }
      
      // Default: return empty array
      return [];
    }),
    unlink: jest.fn().mockImplementation(async (filePath: string) => {
      const normalizedPath = path.resolve(filePath);
      
      // For temp directories, use real fs
      for (const tempDir of mockTempDirs) {
        if (normalizedPath.startsWith(tempDir)) {
          return originalFs.unlink(filePath);
        }
      }
      
      // Default: successful deletion
      return;
    }),
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

// Mock terminal-specific functionality that doesn't work in tests
// We check if the module exists before mocking
try {
  jest.mock('ink', () => {
    const React = require('react');
    return {
      render: jest.fn().mockImplementation((element) => ({
        lastFrame: () => 'mocked output',
        rerender: jest.fn(),
        waitUntilExit: jest.fn().mockResolvedValue(undefined),
      })),
      Box: jest.fn().mockImplementation((props) => React.createElement('div', props)),
      Text: jest.fn().mockImplementation((props) => React.createElement('span', props)),
      useApp: jest.fn(() => ({ exit: jest.fn() })),
      useInput: jest.fn(),
      useStdin: jest.fn(() => ({
        stdin: {
          ...process.stdin,
          setRawMode: jest.fn(),
          isRaw: false,
          write: jest.fn(),
          on: jest.fn(),
          off: jest.fn(),
        },
        setRawMode: jest.fn(),
        isRawModeSupported: false,
      })),
      useEffect: React.useEffect,
      useState: React.useState,
      useRef: React.useRef,
      useMemo: React.useMemo,
    };
  });
} catch {
  // Ink module not used in this test
}

// Prevent mouse mode terminal escape sequences in tests
if (process.env.NODE_ENV === 'test') {
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: any, ...args: any[]) => {
    // Filter out mouse mode escape sequences
    if (typeof chunk === 'string') {
      const filtered = chunk.replace(/\x1b\[\?1000[hl]|\x1b\[\?1002[hl]|\x1b\[\?1006[hl]|\x1b\[\?1005[hl]|\x1b\[\?1015[hl]|\x1b\[\?1004[hl]/g, '');
      if (filtered !== chunk) {
        return true; // Silently ignore mouse escape sequences
      }
    }
    return originalWrite(chunk, ...args);
  }) as any;
}

// Global test utilities
global.testUtils = {
  // Helper to wait for async operations
  waitFor: (condition: () => boolean, timeout = 5000): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (condition()) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(new Error('Timeout waiting for condition'));
        }
      }, 100);
    });
  },
  
  // Mock file system helpers
  mockFs: {
    setup: () => {
      jest.mock('fs/promises');
    },
    restore: () => {
      jest.unmock('fs/promises');
    },
  },
};

// Extend Jest matchers with jest-extended
import 'jest-extended/all';

// TypeScript declarations for global test utilities
declare global {
  var testUtils: {
    waitFor: (condition: () => boolean, timeout?: number) => Promise<void>;
    mockFs: {
      setup: () => void;
      restore: () => void;
    };
  };
}

export {};
