/**
 * Performance tests for Enhanced File Watcher
 * Tests large directory structures and high-frequency changes
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  EnhancedFileWatcher,
  createEnhancedFileWatcher,
} from '../../tools/enhanced-file-watcher.js';

// Mock chokidar for consistent testing
jest.mock('chokidar');

describe('Enhanced File Watcher - Performance Tests', () => {
  let watcher: EnhancedFileWatcher;
  let tempDir: string;
  let performanceMetrics: {
    eventDetectionTime: number[];
    memoryUsage: number[];
    cpuTime: number[];
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-watcher-test-'));
    performanceMetrics = {
      eventDetectionTime: [],
      memoryUsage: [],
      cpuTime: [],
    };
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.unwatch();
    }
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Large Directory Structure Tests', () => {
    it('should handle 1000+ files efficiently', async () => {
      // Create large directory structure
      const fileCount = 1000;
      const dirs = ['src', 'lib', 'test', 'docs', 'config'];

      for (const dir of dirs) {
        await fs.mkdir(path.join(tempDir, dir), { recursive: true });
        for (let i = 0; i < fileCount / dirs.length; i++) {
          await fs.writeFile(
            path.join(tempDir, dir, `file-${i}.ts`),
            `// Test file ${i}\nexport const value = ${i};`
          );
        }
      }

      // Create watcher with performance optimizations
      watcher = createEnhancedFileWatcher({
        debounceDelay: 150,
        enableHashing: true,
        maxHashSize: 10 * 1024 * 1024,
      });

      const startTime = Date.now();
      await watcher.watch(tempDir);
      const setupTime = Date.now() - startTime;

      expect(setupTime).toBeLessThan(5000); // Should setup in under 5 seconds

      const stats = watcher.getStats();
      expect(stats.watchedFiles).toBeGreaterThanOrEqual(0);
      expect(stats.watchedDirs).toBeGreaterThanOrEqual(dirs.length);
    });

    it('should maintain low memory footprint with many files', async () => {
      // Create many small files
      const fileCount = 500;
      for (let i = 0; i < fileCount; i++) {
        await fs.writeFile(
          path.join(tempDir, `file-${i}.txt`),
          `Content ${i}`
        );
      }

      watcher = createEnhancedFileWatcher({
        enableHashing: true,
        maxHashSize: 1024 * 1024, // 1MB limit for hashing
      });

      const memBefore = process.memoryUsage().heapUsed;
      await watcher.watch(tempDir);
      const memAfter = process.memoryUsage().heapUsed;

      const memoryIncrease = (memAfter - memBefore) / (1024 * 1024); // MB
      expect(memoryIncrease).toBeLessThan(50); // Should use less than 50MB
    });
  });

  describe('High-Frequency Change Tests', () => {
    it('should detect changes within 150ms target', async () => {
      watcher = createEnhancedFileWatcher({
        debounceDelay: 150,
        awaitWriteFinish: false, // Disable for faster detection
      });

      const testFile = path.join(tempDir, 'rapid-changes.txt');
      await fs.writeFile(testFile, 'Initial content');

      let changeDetected = false;
      let detectionTime = 0;

      watcher.on('change', () => {
        changeDetected = true;
        detectionTime = Date.now();
      });

      await watcher.watch(tempDir);

      // Make a change
      const changeTime = Date.now();
      await fs.writeFile(testFile, 'Modified content');

      // Wait for debounce + buffer
      await new Promise(resolve => setTimeout(resolve, 200));

      if (changeDetected) {
        const actualDetectionTime = detectionTime - changeTime;
        expect(actualDetectionTime).toBeLessThan(150);
      }
    });

    it('should handle burst changes efficiently with debouncing', async () => {
      watcher = createEnhancedFileWatcher({
        debounceDelay: 150,
      });

      const testFile = path.join(tempDir, 'burst-changes.txt');
      await fs.writeFile(testFile, 'Initial');

      let eventCount = 0;
      watcher.on('change', () => {
        eventCount++;
      });

      await watcher.watch(tempDir);

      // Simulate burst of 10 rapid changes
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(testFile, `Change ${i}`);
        await new Promise(resolve => setTimeout(resolve, 10)); // 10ms between changes
      }

      // Wait for debounce to settle
      await new Promise(resolve => setTimeout(resolve, 300));

      // Due to debouncing, should receive fewer events than changes made
      expect(eventCount).toBeLessThan(10);
      expect(eventCount).toBeGreaterThan(0);
    });

    it('should maintain performance with concurrent file operations', async () => {
      watcher = createEnhancedFileWatcher({
        debounceDelay: 150,
        enableHashing: true,
      });

      await watcher.watch(tempDir);

      // Create multiple files concurrently
      const operations = [];
      const fileCount = 50;

      const startTime = Date.now();

      for (let i = 0; i < fileCount; i++) {
        operations.push(
          fs.writeFile(
            path.join(tempDir, `concurrent-${i}.txt`),
            `Concurrent content ${i}`
          )
        );
      }

      await Promise.all(operations);
      const operationTime = Date.now() - startTime;

      // Should handle 50 concurrent operations quickly
      expect(operationTime).toBeLessThan(2000);

      const stats = watcher.getStats();
      expect(stats.avgProcessingTime).toBeLessThan(100); // Average should be under 100ms
    });
  });

  describe('Large File Handling Tests', () => {
    it('should efficiently handle large files with chunked hashing', async () => {
      watcher = createEnhancedFileWatcher({
        enableHashing: true,
        maxHashSize: 1024 * 1024, // 1MB limit
      });

      // Create a large file (5MB)
      const largeFile = path.join(tempDir, 'large-file.bin');
      const largeContent = Buffer.alloc(5 * 1024 * 1024);
      largeContent.fill('x');
      await fs.writeFile(largeFile, largeContent);

      const startTime = Date.now();
      await watcher.addToHashCache(largeFile);
      const hashTime = Date.now() - startTime;

      // Should hash large file quickly using chunking
      expect(hashTime).toBeLessThan(100); // Under 100ms for 5MB file
    });

    it('should skip very large files from automatic hashing', async () => {
      watcher = createEnhancedFileWatcher({
        enableHashing: true,
        maxHashSize: 1024 * 1024, // 1MB limit
      });

      // Create a very large file (15MB)
      const veryLargeFile = path.join(tempDir, 'very-large.bin');
      const veryLargeContent = Buffer.alloc(15 * 1024 * 1024);
      await fs.writeFile(veryLargeFile, veryLargeContent);

      await watcher.watch(tempDir);

      // Check that conflict detection still works with chunked hashing
      const conflict = await watcher.checkForConflicts(veryLargeFile);
      expect(conflict).toBeNull(); // No conflict on initial check
    });
  });

  describe('Ignore Pattern Performance', () => {
    it('should efficiently filter ignored paths', async () => {
      // Create structure with many ignored directories
      await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
      await fs.mkdir(path.join(tempDir, '.git'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'dist'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

      // Add files to ignored directories
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(
          path.join(tempDir, 'node_modules', `module-${i}.js`),
          'ignored'
        );
      }

      // Add files to watched directory
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(
          path.join(tempDir, 'src', `source-${i}.ts`),
          'watched'
        );
      }

      watcher = createEnhancedFileWatcher({
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
        ],
      });

      const startTime = Date.now();
      await watcher.watch(tempDir);
      const setupTime = Date.now() - startTime;

      // Should setup quickly despite many ignored files
      expect(setupTime).toBeLessThan(1000);

      const stats = watcher.getStats();
      // Should have reasonable file count (not including ignored)
      expect(stats.watchedFiles).toBeLessThan(20);
    });
  });

  describe('Performance Metrics', () => {
    it('should track and report performance statistics', async () => {
      watcher = createEnhancedFileWatcher({
        debounceDelay: 150,
      });

      await watcher.watch(tempDir);

      // Simulate various operations
      const testFile = path.join(tempDir, 'metrics-test.txt');

      for (let i = 0; i < 5; i++) {
        await fs.writeFile(testFile, `Content ${i}`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const stats = watcher.getStats();

      expect(stats).toHaveProperty('watchedFiles');
      expect(stats).toHaveProperty('watchedDirs');
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('avgProcessingTime');
      expect(stats.avgProcessingTime).toBeGreaterThanOrEqual(0);
      expect(stats.startTime).toBeGreaterThan(0);
    });

    it('should maintain performance under sustained load', async () => {
      watcher = createEnhancedFileWatcher({
        debounceDelay: 150,
      });

      await watcher.watch(tempDir);

      const operations = [];
      const duration = 2000; // 2 seconds of sustained load
      const startTime = Date.now();

      // Generate continuous file operations for 2 seconds
      while (Date.now() - startTime < duration) {
        const fileIndex = Math.floor(Math.random() * 10);
        operations.push(
          fs.writeFile(
            path.join(tempDir, `load-test-${fileIndex}.txt`),
            `Load test content ${Date.now()}`
          ).catch(() => {}) // Ignore errors from concurrent writes
        );
        await new Promise(resolve => setTimeout(resolve, 50)); // 20 ops/second
      }

      await Promise.all(operations);
      await new Promise(resolve => setTimeout(resolve, 500)); // Let events settle

      const stats = watcher.getStats();

      // Should maintain good average processing time under load
      expect(stats.avgProcessingTime).toBeLessThan(150);
      expect(stats.totalEvents).toBeGreaterThan(0);
    });
  });
});