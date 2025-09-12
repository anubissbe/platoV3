/**
 * Fast Jest setup file for optimized test performance
 * Minimal mocking and setup for speed
 */

// PERFORMANCE: Minimal console suppression
const originalError = console.error;
beforeAll(() => {
  // Only suppress non-error output
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  // Keep errors for debugging
  console.error = originalError;
});

// PERFORMANCE: Essential environment only
process.env.NODE_ENV = 'test';
process.env.PLATO_TEST_MODE = 'true';

// PERFORMANCE: Lightweight fs mocking
import * as realFs from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

// Simple mock registry
const mockFiles = new Map<string, Buffer>();
const tempDirs = new Set<string>();

// PERFORMANCE: Optimized fs/promises mock
jest.mock('fs/promises', () => {
  const original = jest.requireActual('fs/promises');
  
  return {
    readFile: jest.fn().mockImplementation(async (filePath: string, options?: any) => {
      const resolved = path.resolve(filePath);
      
      // Fast temp dir check
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          return original.readFile(filePath, options);
        }
      }
      
      // Mock file check
      if (mockFiles.has(resolved)) {
        const buffer = mockFiles.get(resolved)!;
        return options?.encoding ? buffer.toString(options.encoding) : buffer;
      }
      
      // Fast error
      const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
    
    writeFile: jest.fn().mockImplementation(async (filePath: string, data: any) => {
      const resolved = path.resolve(filePath);
      
      // Fast temp dir check
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          return original.writeFile(filePath, data);
        }
      }
      
      // Simple mock storage
      mockFiles.set(resolved, Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
    }),
    
    mkdtemp: jest.fn().mockImplementation(async (prefix: string) => {
      const tempPath = path.join(tmpdir(), `${prefix}${Math.random().toString(36).substr(2, 6)}`);
      await original.mkdir(tempPath, { recursive: true });
      tempDirs.add(tempPath);
      return tempPath;
    }),
    
    // Fast pass-through for common operations
    mkdir: original.mkdir,
    stat: jest.fn().mockImplementation(async (filePath: string) => {
      const resolved = path.resolve(filePath);
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          return original.stat(filePath);
        }
      }
      if (mockFiles.has(resolved)) {
        return {
          isFile: () => true,
          isDirectory: () => false,
          size: mockFiles.get(resolved)!.length,
          mtime: new Date(),
        };
      }
      const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
    chmod: original.chmod,
    unlink: original.unlink,
    rmdir: original.rmdir,
    rm: original.rm,
    realpath: jest.fn().mockImplementation(async (filePath: string) => {
      const resolved = path.resolve(filePath);
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          return original.realpath(filePath);
        }
      }
      return resolved;
    }),
    access: jest.fn().mockImplementation(async (filePath: string) => {
      const resolved = path.resolve(filePath);
      for (const tempDir of tempDirs) {
        if (resolved.startsWith(tempDir)) {
          return original.access(filePath);
        }
      }
      if (mockFiles.has(resolved)) {
        return;
      }
      const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
    readdir: original.readdir,
  };
});

// PERFORMANCE: Lightweight execa mock
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

// PERFORMANCE: Minimal terminal mocking
jest.mock('ink', () => {
  const React = require('react');
  return {
    render: jest.fn(() => ({
      lastFrame: () => '',
      waitUntilExit: () => Promise.resolve(),
    })),
    Box: React.forwardRef((props: any, ref: any) => React.createElement('div', { ...props, ref })),
    Text: React.forwardRef((props: any, ref: any) => React.createElement('span', { ...props, ref })),
    useApp: () => ({ exit: jest.fn() }),
    useInput: jest.fn(),
    useStdin: () => ({ stdin: process.stdin, setRawMode: jest.fn() }),
  };
});

// PERFORMANCE: Cleanup optimization
afterEach(() => {
  // Fast cleanup - only clear essential mocks
  mockFiles.clear();
  jest.clearAllMocks();
});

afterAll(() => {
  // Cleanup temp directories
  for (const tempDir of tempDirs) {
    try {
      realFs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    } catch {}
  }
  tempDirs.clear();
});

export {};