/**
 * Specialized Jest setup file for native tool tests
 * Handles filesystem mocking, process execution, and resource cleanup
 */

// Suppress console output during tests unless explicitly needed
const originalConsole = { ...console };

beforeAll(() => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  // Keep error for debugging
  console.error = originalConsole.error;
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PLATO_TEST_MODE = 'true';
process.env.PLATO_TOOLS_MODE = 'true';

// Import required modules
import { tmpdir } from 'os';
import path from 'path';
import * as realFs from 'fs/promises';
import * as realFsSync from 'fs';

// Enhanced filesystem mock for native tools
const mockFiles = new Map<string, Buffer>();
const mockStats = new Map<string, any>();
const mockDirectories = new Set<string>();

// Helper to determine if path should use real fs (more permissive for tools)
const isRealPath = (filePath: string): boolean => {
  const normalized = path.resolve(filePath);
  const projectRoot = process.cwd();
  
  // Use real fs for tool test temp directories
  return normalized.startsWith(tmpdir()) || 
         normalized.includes('node_modules') ||
         normalized.startsWith('/tmp/') ||
         normalized.startsWith('/var/tmp/') ||
         normalized.includes('plato-tools-test-') ||  // Specific pattern from createTempDir
         normalized.includes('test-temp-') ||  // Include test temp directories
         normalized.includes('plato-dir-test-') ||  // Include other test temp patterns
         normalized.includes('plato-edit-test-') ||
         normalized.startsWith(projectRoot) && (
           normalized.includes('/package.json') ||
           normalized.includes('/tsconfig') ||
           normalized.includes('/jest.config') ||
           normalized.includes('/.git') ||
           normalized.includes('/.github') ||
           normalized.includes('/README') ||
           normalized.includes('/src/')  // Allow real filesystem access for src files in tool tests
         );
};

// Create mock directory helper
const createMockDirectory = (dirPath: string) => {
  const normalizedPath = path.resolve(dirPath);
  mockDirectories.add(normalizedPath);
  mockStats.set(normalizedPath, {
    isFile: () => false,
    isDirectory: () => true,
    size: 0,
    mtime: new Date(),
    mode: 0o755,
  });
};

// Enhanced fs mock for native tools
jest.mock('fs/promises', () => {
  const originalFs = jest.requireActual('fs/promises');
  
  return {
    ...originalFs, // Include all original methods by default
    
    readFile: jest.fn().mockImplementation(async (filePath: string, options?: any) => {
      if (isRealPath(filePath)) {
        try {
          return await originalFs.readFile(filePath, options);
        } catch (error) {
          // If real file fails, check mock
          const normalizedPath = path.resolve(filePath);
          if (mockFiles.has(normalizedPath)) {
            const buffer = mockFiles.get(normalizedPath)!;
            return options?.encoding ? buffer.toString(options.encoding) : buffer;
          }
          throw error;
        }
      }
      
      const normalizedPath = path.resolve(filePath);
      if (mockFiles.has(normalizedPath)) {
        const buffer = mockFiles.get(normalizedPath)!;
        return options?.encoding ? buffer.toString(options.encoding) : buffer;
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
        mode: 0o644,
      });
      return Promise.resolve();
    }),
    
    stat: jest.fn().mockImplementation(async (filePath: string) => {
      if (isRealPath(filePath)) {
        try {
          return await originalFs.stat(filePath);
        } catch (error) {
          // If real file fails, check mock
          const normalizedPath = path.resolve(filePath);
          if (mockStats.has(normalizedPath)) {
            return mockStats.get(normalizedPath);
          }
          throw error;
        }
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
        try {
          return await originalFs.access(filePath, mode);
        } catch (error) {
          // If real file fails, check mock
          const normalizedPath = path.resolve(filePath);
          if (mockFiles.has(normalizedPath) || mockStats.has(normalizedPath)) {
            return;
          }
          throw error;
        }
      }
      
      const normalizedPath = path.resolve(filePath);
      if (mockFiles.has(normalizedPath) || mockStats.has(normalizedPath)) {
        return;
      }
      
      const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
    
    mkdir: jest.fn().mockImplementation(async (dirPath: string, options?: any) => {
      if (isRealPath(dirPath)) {
        return originalFs.mkdir(dirPath, options);
      }
      
      createMockDirectory(dirPath);
    }),
    
    readdir: jest.fn().mockImplementation(async (dirPath: string, options?: any) => {
      if (isRealPath(dirPath)) {
        return originalFs.readdir(dirPath, options);
      }
      
      const normalizedPath = path.resolve(dirPath);
      if (!mockDirectories.has(normalizedPath)) {
        const error = new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      
      // Return files in this mock directory
      const files = Array.from(mockFiles.keys())
        .filter(filePath => path.dirname(filePath) === normalizedPath)
        .map(filePath => path.basename(filePath));
      
      return files;
    }),
    
    // Additional fs methods that native tools need
    realpath: jest.fn().mockImplementation(async (filePath: string) => {
      if (isRealPath(filePath)) {
        return originalFs.realpath(filePath);
      }
      return path.resolve(filePath);
    }),

    chmod: jest.fn().mockImplementation(async (filePath: string, mode: number) => {
      if (isRealPath(filePath)) {
        return originalFs.chmod(filePath, mode);
      }
      
      const normalizedPath = path.resolve(filePath);
      if (mockStats.has(normalizedPath)) {
        const stats = mockStats.get(normalizedPath);
        stats.mode = mode;
        return;
      }
      
      const error = new Error(`ENOENT: no such file or directory, chmod '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),

    copyFile: jest.fn().mockImplementation(async (src: string, dest: string) => {
      if (isRealPath(src) || isRealPath(dest)) {
        return originalFs.copyFile(src, dest);
      }
      
      const normalizedSrc = path.resolve(src);
      const normalizedDest = path.resolve(dest);
      
      if (!mockFiles.has(normalizedSrc)) {
        const error = new Error(`ENOENT: no such file or directory, copyfile '${src}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      
      const buffer = mockFiles.get(normalizedSrc)!;
      mockFiles.set(normalizedDest, Buffer.from(buffer));
      mockStats.set(normalizedDest, {
        isFile: () => true,
        isDirectory: () => false,
        size: buffer.length,
        mtime: new Date(),
        mode: 0o644,
      });
    }),

    rename: jest.fn().mockImplementation(async (oldPath: string, newPath: string) => {
      if (isRealPath(oldPath) || isRealPath(newPath)) {
        return originalFs.rename(oldPath, newPath);
      }
      
      const normalizedOld = path.resolve(oldPath);
      const normalizedNew = path.resolve(newPath);
      
      if (!mockFiles.has(normalizedOld)) {
        const error = new Error(`ENOENT: no such file or directory, rename '${oldPath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      
      const buffer = mockFiles.get(normalizedOld)!;
      const stats = mockStats.get(normalizedOld)!;
      
      mockFiles.set(normalizedNew, buffer);
      mockStats.set(normalizedNew, stats);
      mockFiles.delete(normalizedOld);
      mockStats.delete(normalizedOld);
    }),

    unlink: jest.fn().mockImplementation(async (filePath: string) => {
      if (isRealPath(filePath)) {
        return originalFs.unlink(filePath);
      }
      
      const normalizedPath = path.resolve(filePath);
      if (mockFiles.has(normalizedPath)) {
        mockFiles.delete(normalizedPath);
        mockStats.delete(normalizedPath);
        return;
      }
      
      const error = new Error(`ENOENT: no such file or directory, unlink '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),

    open: jest.fn().mockImplementation(async (filePath: string, flags: string) => {
      if (isRealPath(filePath)) {
        return originalFs.open(filePath, flags);
      }
      
      // Mock file handle for write operations
      const normalizedPath = path.resolve(filePath);
      let buffer = Buffer.alloc(0);
      
      return {
        write: jest.fn().mockImplementation(async (data: Buffer) => {
          buffer = Buffer.concat([buffer, data]);
          mockFiles.set(normalizedPath, buffer);
          mockStats.set(normalizedPath, {
            isFile: () => true,
            isDirectory: () => false,
            size: buffer.length,
            mtime: new Date(),
            mode: 0o644,
          });
          return { bytesWritten: data.length };
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),

    utimes: jest.fn().mockImplementation(async (filePath: string, atime: Date, mtime: Date) => {
      if (isRealPath(filePath)) {
        return originalFs.utimes(filePath, atime, mtime);
      }
      
      const normalizedPath = path.resolve(filePath);
      if (mockStats.has(normalizedPath)) {
        const stats = mockStats.get(normalizedPath);
        stats.mtime = mtime;
        return;
      }
      
      const error = new Error(`ENOENT: no such file or directory, utimes '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
  };
});

// Mock fs sync methods used by native tools
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  
  return {
    ...originalFs, // Include all original methods
    
    realpathSync: jest.fn().mockImplementation((filePath: string) => {
      if (isRealPath(filePath)) {
        return originalFs.realpathSync(filePath);
      }
      return path.resolve(filePath);
    }),
    
    existsSync: jest.fn().mockImplementation((filePath: string) => {
      if (isRealPath(filePath)) {
        return originalFs.existsSync(filePath);
      }
      
      const normalizedPath = path.resolve(filePath);
      return mockFiles.has(normalizedPath) || mockDirectories.has(normalizedPath);
    }),
    
    statSync: jest.fn().mockImplementation((filePath: string) => {
      if (isRealPath(filePath)) {
        return originalFs.statSync(filePath);
      }
      
      const normalizedPath = path.resolve(filePath);
      if (mockStats.has(normalizedPath)) {
        return mockStats.get(normalizedPath);
      }
      
      const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }),
  };
});

// Enhanced execa mock for native tools
jest.mock('execa', () => {
  const mockExeca = jest.fn().mockImplementation((command: string, args?: string[], options?: any) => {
    // Mock successful command execution by default
    return Promise.resolve({
      stdout: '',
      stderr: '',
      exitCode: 0,
      command: `${command} ${(args || []).join(' ')}`.trim(),
      failed: false,
      timedOut: false,
      killed: false,
    });
  });
  
  const mockExecaCommand = jest.fn().mockImplementation((command: string, options?: any) => {
    return Promise.resolve({
      stdout: '',
      stderr: '',
      exitCode: 0,
      command,
      failed: false,
      timedOut: false,
      killed: false,
    });
  });
  
  return {
    execa: mockExeca,
    execaCommand: mockExecaCommand,
  };
});

// Mock Ink for TUI components
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

// Enhanced test cleanup for native tools
const toolsCleanup = {
  timers: new Set<any>(),
  intervals: new Set<any>(),
  processes: new Set<any>(),
  listeners: new Map<any, Array<{event: string, listener: Function}>>(),
  
  cleanup: () => {
    // Clear all timers
    toolsCleanup.timers.forEach(timer => clearTimeout(timer));
    toolsCleanup.timers.clear();
    
    // Clear all intervals  
    toolsCleanup.intervals.forEach(interval => clearInterval(interval));
    toolsCleanup.intervals.clear();
    
    // Clean up any mock processes
    toolsCleanup.processes.clear();
    
    // Remove all event listeners
    toolsCleanup.listeners.forEach((listeners, emitter) => {
      listeners.forEach(({event, listener}) => {
        try {
          if (emitter && typeof emitter.removeListener === 'function') {
            emitter.removeListener(event, listener);
          }
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
    });
    toolsCleanup.listeners.clear();
    
    // Clear mock file system
    mockFiles.clear();
    mockStats.clear();
    mockDirectories.clear();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
};

// Global cleanup after each test
afterEach(() => {
  toolsCleanup.cleanup();
  jest.clearAllMocks();
});

// Global test utilities for native tools
global.toolsTestUtils = {
  cleanup: toolsCleanup,
  
  // File system helpers
  createMockFile: (filePath: string, content: string) => {
    const normalizedPath = path.resolve(filePath);
    const buffer = Buffer.from(content);
    mockFiles.set(normalizedPath, buffer);
    mockStats.set(normalizedPath, {
      isFile: () => true,
      isDirectory: () => false,
      size: buffer.length,
      mtime: new Date(),
      mode: 0o644,
    });
  },
  
  createMockDirectory: (dirPath: string) => {
    createMockDirectory(dirPath);
  },
  
  // Command execution helpers
  mockCommand: (command: string, result: any) => {
    const { execa, execaCommand } = require('execa');
    if (command.includes(' ')) {
      execaCommand.mockResolvedValueOnce(result);
    } else {
      execa.mockResolvedValueOnce(result);
    }
  },
  
  // Wait helper
  waitFor: (condition: () => boolean, timeout = 5000): Promise<void> => {
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
      toolsCleanup.intervals.add(timer);
    });
  },
  
  // Create temp directory that uses real fs
  createTempDir: async (): Promise<string> => {
    return await realFs.mkdtemp(path.join(tmpdir(), 'plato-tools-test-'));
  },
};

// Extended Jest matchers
import 'jest-extended/all';

// TypeScript declarations
declare global {
  var toolsTestUtils: {
    cleanup: typeof toolsCleanup;
    createMockFile: (filePath: string, content: string) => void;
    createMockDirectory: (dirPath: string) => void;
    mockCommand: (command: string, result: any) => void;
    waitFor: (condition: () => boolean, timeout?: number) => Promise<void>;
    createTempDir: () => Promise<string>;
  };
}

export {};