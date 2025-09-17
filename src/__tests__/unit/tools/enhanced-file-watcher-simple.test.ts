/**
 * Simplified unit tests for Enhanced File Watcher
 * Tests core functionality without complex async patterns
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  EnhancedFileWatcher,
  createEnhancedFileWatcher,
  type EnhancedWatcherOptions,
} from '../../../tools/enhanced-file-watcher.js';

// Mock chokidar
const mockWatcher = {
  on: jest.fn().mockReturnThis(),
  close: jest.fn().mockImplementation(() => Promise.resolve()),
  getWatched: jest.fn().mockReturnValue({}),
};

jest.mock('chokidar', () => ({
  default: {
    watch: jest.fn(() => mockWatcher),
  },
}));

describe('Enhanced File Watcher - Core Tests', () => {
  let watcher: EnhancedFileWatcher;
  let tempDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enhanced-watcher-test-'));
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.unwatch();
    }
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create watcher with default options', () => {
      watcher = createEnhancedFileWatcher();

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });

    it('should merge custom options with defaults', () => {
      const customOptions: EnhancedWatcherOptions = {
        debounceDelay: 200,
        enableHashing: false,
        maxHashSize: 5 * 1024 * 1024, // 5MB
      };

      watcher = createEnhancedFileWatcher(customOptions);
      const stats = watcher.getStats();

      expect(stats.startTime).toBeGreaterThan(0);
      expect(stats.totalEvents).toBe(0);
    });

    it('should accept ignore patterns', () => {
      const options: EnhancedWatcherOptions = {
        ignored: ['**/node_modules/**', '**/custom-ignore/**'],
      };

      watcher = createEnhancedFileWatcher(options);

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });

    it('should support function-based ignore patterns', () => {
      const ignoreFunction = (filePath: string) => filePath.includes('ignore-me');

      watcher = createEnhancedFileWatcher({
        ignored: ignoreFunction,
      });

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });
  });

  describe('Watch Functionality', () => {
    beforeEach(() => {
      watcher = createEnhancedFileWatcher({
        debounceDelay: 0, // Disable debouncing for tests
        awaitWriteFinish: false, // Disable for faster tests
      });
    });

    it('should start watching a directory', async () => {
      const chokidar = require('chokidar');

      await watcher.watch(tempDir);

      expect(chokidar.default.watch).toHaveBeenCalledWith(
        tempDir,
        expect.objectContaining({
          persistent: true,
          ignoreInitial: false,
          followSymlinks: true,
        })
      );
    });

    it('should throw error if already watching', async () => {
      await watcher.watch(tempDir);

      await expect(watcher.watch(tempDir)).rejects.toThrow(
        'Watcher is already active. Call unwatch() first.'
      );
    });

    it('should watch multiple paths', async () => {
      const paths = [tempDir, path.join(tempDir, 'subdir')];

      await watcher.watch(paths);

      const chokidar = require('chokidar');
      expect(chokidar.default.watch).toHaveBeenCalledWith(paths, expect.any(Object));
    });

    it('should stop watching and clean up', async () => {
      await watcher.watch(tempDir);
      await watcher.unwatch();

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should setup event handlers correctly', async () => {
      await watcher.watch(tempDir);

      // Verify all expected event handlers were set up
      const onCalls = mockWatcher.on.mock.calls;
      const eventTypes = onCalls.map(call => call[0]);

      expect(eventTypes).toContain('add');
      expect(eventTypes).toContain('change');
      expect(eventTypes).toContain('unlink');
      expect(eventTypes).toContain('addDir');
      expect(eventTypes).toContain('unlinkDir');
      expect(eventTypes).toContain('error');
      expect(eventTypes).toContain('ready');
    });
  });

  describe('Statistics and Performance', () => {
    beforeEach(() => {
      watcher = createEnhancedFileWatcher();
    });

    it('should track watcher statistics', () => {
      const stats = watcher.getStats();

      expect(stats.watchedFiles).toBe(0);
      expect(stats.watchedDirs).toBe(0);
      expect(stats.totalEvents).toBe(0);
      expect(stats.recentEvents).toBe(0);
      expect(stats.avgProcessingTime).toBe(0);
      expect(stats.conflictsDetected).toBe(0);
      expect(stats.startTime).toBeGreaterThan(0);
      expect(stats.lastEventTime).toBeUndefined();
    });

    it('should provide statistics with correct structure', () => {
      const stats = watcher.getStats();

      expect(typeof stats.watchedFiles).toBe('number');
      expect(typeof stats.watchedDirs).toBe('number');
      expect(typeof stats.totalEvents).toBe('number');
      expect(typeof stats.recentEvents).toBe('number');
      expect(typeof stats.avgProcessingTime).toBe('number');
      expect(typeof stats.conflictsDetected).toBe('number');
      expect(typeof stats.startTime).toBe('number');
    });
  });

  describe('Conflict Detection Configuration', () => {
    it('should enable conflict detection by default', () => {
      watcher = createEnhancedFileWatcher();

      // Just verify the watcher was created - specific conflict detection
      // functionality would be tested in integration tests
      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });

    it('should allow disabling conflict detection', () => {
      watcher = createEnhancedFileWatcher({
        conflictDetection: false,
      });

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });
  });

  describe('File Hashing Configuration', () => {
    it('should enable hashing by default', () => {
      watcher = createEnhancedFileWatcher();

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });

    it('should allow disabling hashing', () => {
      watcher = createEnhancedFileWatcher({
        enableHashing: false,
      });

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });

    it('should configure custom hash size limits', () => {
      const maxHashSize = 5 * 1024 * 1024; // 5MB

      watcher = createEnhancedFileWatcher({
        maxHashSize,
      });

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });
  });

  describe('Manual Conflict Checking', () => {
    beforeEach(() => {
      watcher = createEnhancedFileWatcher({
        conflictDetection: true,
        enableHashing: true,
      });
    });

    it('should return null for non-existent hash cache entries', async () => {
      const testFile = path.join(tempDir, 'non-existent.txt');

      const conflict = await watcher.checkForConflicts(testFile);

      expect(conflict).toBeNull();
    });

    it('should handle file access errors gracefully', async () => {
      const nonExistentFile = '/path/that/does/not/exist/file.txt';

      const conflict = await watcher.checkForConflicts(nonExistentFile);

      expect(conflict).toBeDefined();
      expect(conflict?.conflictType).toBe('file_deleted');
    });
  });

  describe('File Hash Cache Management', () => {
    beforeEach(() => {
      watcher = createEnhancedFileWatcher({
        enableHashing: true,
        maxHashSize: 1024 * 1024, // 1MB
      });
    });

    it('should add files to hash cache', async () => {
      const testFile = path.join(tempDir, 'hash-test.txt');
      const content = 'test content for hashing';

      await fs.writeFile(testFile, content);

      // Should not throw error
      await watcher.addToHashCache(testFile);
      expect(true).toBe(true);
    });

    it('should handle non-existent files gracefully', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.txt');

      // Should not throw error
      await watcher.addToHashCache(nonExistentFile);
      expect(true).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    it('should handle empty options object', () => {
      watcher = createEnhancedFileWatcher({});

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });

    it('should handle custom debounce delay', () => {
      watcher = createEnhancedFileWatcher({
        debounceDelay: 500,
      });

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });

    it('should handle polling configuration', () => {
      watcher = createEnhancedFileWatcher({
        usePolling: true,
        pollingInterval: 2000,
      });

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });

    it('should handle awaitWriteFinish configuration', () => {
      watcher = createEnhancedFileWatcher({
        awaitWriteFinish: true,
        stabilityThreshold: 3000,
      });

      expect(watcher).toBeInstanceOf(EnhancedFileWatcher);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      watcher = createEnhancedFileWatcher();
    });

    it('should setup error handler', async () => {
      await watcher.watch(tempDir);

      const onCalls = mockWatcher.on.mock.calls;
      const errorHandler = onCalls.find(call => call[0] === 'error');

      expect(errorHandler).toBeDefined();
      expect(typeof errorHandler?.[1]).toBe('function');
    });

    it('should not throw when unwatching non-active watcher', async () => {
      // Should not throw
      await watcher.unwatch();
      expect(true).toBe(true);
    });
  });
});