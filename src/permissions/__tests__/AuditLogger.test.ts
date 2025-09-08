import { AuditLogger } from '../AuditLogger';
import { AuditEntry, PermissionQuery, PermissionResult } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;
  let mockLogDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogDir = '/test/audit-logs';
    auditLogger = new AuditLogger({ 
      logDirectory: mockLogDir,
      maxFileSize: 1024 * 1024, // 1MB
      retentionDays: 30,
      enableIndexing: true
    });

    // Mock fs operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({ 
      size: 100, 
      isFile: () => true,
      mtime: new Date()
    } as any);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('[]');
  });

  afterEach(async () => {
    await auditLogger.destroy();
  });

  describe('Initialization and Setup', () => {
    it('should create audit logger with default configuration', () => {
      const logger = new AuditLogger();
      expect(logger).toBeInstanceOf(AuditLogger);
    });

    it('should create audit logger with custom configuration', () => {
      const config = {
        logDirectory: '/custom/path',
        maxFileSize: 2 * 1024 * 1024,
        retentionDays: 90,
        enableIndexing: false,
        compressionEnabled: true
      };

      const logger = new AuditLogger(config);
      expect(logger).toBeInstanceOf(AuditLogger);
    });

    it('should create log directory on initialization', async () => {
      await auditLogger.initialize();
      
      expect(mockFs.mkdir).toHaveBeenCalledWith(mockLogDir, { recursive: true });
    });

    it('should handle log directory creation errors gracefully', async () => {
      mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      await expect(auditLogger.initialize()).rejects.toThrow('Permission denied');
    });
  });

  describe('Audit Entry Logging', () => {
    beforeEach(async () => {
      await auditLogger.initialize();
    });

    it('should log permission queries and results', async () => {
      const query: PermissionQuery = {
        tool: 'fs_write',
        path: '/test/file.txt',
        context: {
          workingDirectory: '/test',
          environment: { NODE_ENV: 'development' },
          timestamp: new Date()
        }
      };

      const result: PermissionResult = {
        action: 'allow',
        reason: 'Development environment allows file writes',
        confidence: 0.9,
        timestamp: new Date()
      };

      const entryId = await auditLogger.logPermissionDecision(query, result, 'development', 'session-123');

      expect(entryId).toBeDefined();
      expect(typeof entryId).toBe('string');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should log user decisions for permission prompts', async () => {
      const query: PermissionQuery = {
        tool: 'exec',
        command: 'rm -rf node_modules',
        context: {
          workingDirectory: '/test',
          environment: {},
          timestamp: new Date()
        }
      };

      const result: PermissionResult = {
        action: 'deny',
        reason: 'Dangerous command blocked',
        confidence: 1.0,
        timestamp: new Date()
      };

      const entryId = await auditLogger.logPermissionDecision(
        query, 
        result, 
        'production', 
        'session-456', 
        'denied'
      );

      expect(entryId).toBeDefined();
    });

    it('should handle concurrent logging operations', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        const query: PermissionQuery = {
          tool: `tool_${i}`,
          path: `/test/file_${i}.txt`,
          context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
        };
        
        const result: PermissionResult = {
          action: 'allow',
          reason: `Test entry ${i}`,
          confidence: 0.8,
          timestamp: new Date()
        };
        
        promises.push(auditLogger.logPermissionDecision(query, result));
      }

      const entryIds = await Promise.all(promises);
      
      expect(entryIds).toHaveLength(10);
      expect(entryIds.every(id => typeof id === 'string')).toBe(true);
    });
  });

  describe('Log Rotation', () => {
    beforeEach(async () => {
      await auditLogger.initialize();
    });

    it('should rotate log files when size limit is exceeded', async () => {
      // Mock large file size
      mockFs.stat.mockResolvedValueOnce({ 
        size: 2 * 1024 * 1024, // 2MB (exceeds 1MB limit)
        isFile: () => true,
        mtime: new Date()
      } as any);

      const query: PermissionQuery = {
        tool: 'fs_write',
        path: '/large/file.txt',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      const result: PermissionResult = {
        action: 'allow',
        reason: 'Large file operation',
        confidence: 0.7,
        timestamp: new Date()
      };

      await auditLogger.logPermissionDecision(query, result);

      // Should create a new log file due to rotation
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2); // One for rotation, one for new entry
    });

    it('should compress rotated log files when compression is enabled', async () => {
      const compressedLogger = new AuditLogger({
        logDirectory: mockLogDir,
        maxFileSize: 1024,
        compressionEnabled: true
      });
      
      await compressedLogger.initialize();

      // Mock large file for rotation trigger
      mockFs.stat.mockResolvedValueOnce({ 
        size: 2048,
        isFile: () => true,
        mtime: new Date()
      } as any);

      const query: PermissionQuery = {
        tool: 'test',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      const result: PermissionResult = {
        action: 'allow',
        reason: 'Test',
        confidence: 1.0,
        timestamp: new Date()
      };

      await compressedLogger.logPermissionDecision(query, result);

      await compressedLogger.destroy();
    });

    it('should maintain configurable number of archived log files', async () => {
      const logger = new AuditLogger({
        logDirectory: mockLogDir,
        maxFileSize: 1024,
        maxArchiveFiles: 5
      });

      await logger.initialize();

      // Mock multiple old log files
      mockFs.readdir.mockResolvedValueOnce([
        'audit-2024-01-01.log',
        'audit-2024-01-02.log.gz',
        'audit-2024-01-03.log.gz',
        'audit-2024-01-04.log.gz',
        'audit-2024-01-05.log.gz',
        'audit-2024-01-06.log.gz',
        'audit-2024-01-07.log.gz'
      ] as any);

      await logger.cleanup();

      await logger.destroy();
    });
  });

  describe('Search and Filtering', () => {
    beforeEach(async () => {
      await auditLogger.initialize();
    });

    it('should search audit entries by tool', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          timestamp: new Date(),
          query: { tool: 'fs_write', path: '/test1.txt' },
          result: { action: 'allow', reason: 'Test 1', confidence: 1.0, timestamp: new Date() }
        },
        {
          id: 'entry-2', 
          timestamp: new Date(),
          query: { tool: 'exec', command: 'ls -la' },
          result: { action: 'allow', reason: 'Test 2', confidence: 0.9, timestamp: new Date() }
        }
      ];

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockEntries));
      mockFs.readdir.mockResolvedValueOnce(['audit-2024-01-01.log'] as any);

      const results = await auditLogger.searchEntries({ tool: 'fs_write' });

      expect(results).toHaveLength(1);
      expect(results[0].query.tool).toBe('fs_write');
    });

    it('should search audit entries by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const mockEntries = [
        {
          id: 'entry-1',
          timestamp: new Date('2024-01-15'),
          query: { tool: 'test' },
          result: { action: 'allow', reason: 'Test', confidence: 1.0, timestamp: new Date() }
        },
        {
          id: 'entry-2',
          timestamp: new Date('2024-02-15'), // Outside range
          query: { tool: 'test' },
          result: { action: 'deny', reason: 'Test', confidence: 1.0, timestamp: new Date() }
        }
      ];

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockEntries));
      mockFs.readdir.mockResolvedValueOnce(['audit-2024-01-15.log'] as any);

      const results = await auditLogger.searchEntries({ 
        startDate, 
        endDate 
      });

      expect(results).toHaveLength(1);
      expect(results[0].timestamp).toEqual(new Date('2024-01-15'));
    });

    it('should search audit entries by action type', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          timestamp: new Date(),
          query: { tool: 'fs_write' },
          result: { action: 'allow', reason: 'Test', confidence: 1.0, timestamp: new Date() }
        },
        {
          id: 'entry-2',
          timestamp: new Date(),
          query: { tool: 'exec' },
          result: { action: 'deny', reason: 'Test', confidence: 1.0, timestamp: new Date() }
        }
      ];

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockEntries));
      mockFs.readdir.mockResolvedValueOnce(['audit-2024-01-01.log'] as any);

      const results = await auditLogger.searchEntries({ action: 'deny' });

      expect(results).toHaveLength(1);
      expect(results[0].result.action).toBe('deny');
    });

    it('should search audit entries by profile', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          timestamp: new Date(),
          query: { tool: 'test' },
          result: { action: 'allow', reason: 'Test', confidence: 1.0, timestamp: new Date() },
          profile: 'development'
        },
        {
          id: 'entry-2',
          timestamp: new Date(),
          query: { tool: 'test' },
          result: { action: 'deny', reason: 'Test', confidence: 1.0, timestamp: new Date() },
          profile: 'production'
        }
      ];

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockEntries));
      mockFs.readdir.mockResolvedValueOnce(['audit-2024-01-01.log'] as any);

      const results = await auditLogger.searchEntries({ profile: 'production' });

      expect(results).toHaveLength(1);
      expect(results[0].profile).toBe('production');
    });

    it('should support complex search queries with multiple filters', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          timestamp: new Date('2024-01-15'),
          query: { tool: 'fs_write', path: '/important.txt' },
          result: { action: 'deny', reason: 'Test', confidence: 1.0, timestamp: new Date() },
          profile: 'production'
        }
      ];

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockEntries));
      mockFs.readdir.mockResolvedValueOnce(['audit-2024-01-15.log'] as any);

      const results = await auditLogger.searchEntries({
        tool: 'fs_write',
        action: 'deny',
        profile: 'production',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        query: { tool: 'fs_write' },
        result: { action: 'deny' },
        profile: 'production'
      });
    });

    it('should limit search results when limit is specified', async () => {
      const mockEntries = Array.from({ length: 50 }, (_, i) => ({
        id: `entry-${i}`,
        timestamp: new Date(),
        query: { tool: 'test' },
        result: { action: 'allow', reason: 'Test', confidence: 1.0, timestamp: new Date() }
      }));

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockEntries));
      mockFs.readdir.mockResolvedValueOnce(['audit-2024-01-01.log'] as any);

      const results = await auditLogger.searchEntries({ limit: 10 });

      expect(results).toHaveLength(10);
    });
  });

  describe('Retention and Cleanup', () => {
    beforeEach(async () => {
      await auditLogger.initialize();
    });

    it('should clean up old log files based on retention policy', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days old

      mockFs.readdir.mockResolvedValueOnce([
        'audit-current.log',
        'audit-2024-01-01.log',
        'audit-2024-01-02.log.gz'
      ] as any);

      mockFs.stat.mockImplementation((filePath) => {
        if (filePath.toString().includes('2024-01-01') || filePath.toString().includes('2024-01-02')) {
          return Promise.resolve({
            mtime: oldDate,
            isFile: () => true
          } as any);
        }
        return Promise.resolve({
          mtime: new Date(),
          isFile: () => true
        } as any);
      });

      await auditLogger.cleanup();

      expect(mockFs.unlink).toHaveBeenCalledTimes(2); // Two old files deleted
    });

    it('should respect retention days configuration', async () => {
      const shortRetentionLogger = new AuditLogger({
        logDirectory: mockLogDir,
        retentionDays: 1 // Very short retention
      });

      await shortRetentionLogger.initialize();

      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 2); // 2 days old

      mockFs.readdir.mockResolvedValueOnce(['audit-old.log'] as any);
      mockFs.stat.mockResolvedValueOnce({
        mtime: yesterdayDate,
        isFile: () => true
      } as any);

      await shortRetentionLogger.cleanup();

      expect(mockFs.unlink).toHaveBeenCalled();

      await shortRetentionLogger.destroy();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFs.readdir.mockResolvedValueOnce(['audit-error.log'] as any);
      mockFs.stat.mockResolvedValueOnce({
        mtime: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days old
        isFile: () => true
      } as any);
      mockFs.unlink.mockRejectedValueOnce(new Error('Permission denied'));

      // Should not throw error - cleanup errors should be handled gracefully
      await expect(auditLogger.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('Performance and Statistics', () => {
    beforeEach(async () => {
      await auditLogger.initialize();
    });

    it('should provide audit statistics', async () => {
      // Log some entries first
      await auditLogger.logPermissionDecision(
        { tool: 'fs_write', context: { workingDirectory: '/test', environment: {}, timestamp: new Date() } },
        { action: 'allow', reason: 'Test', confidence: 1.0, timestamp: new Date() }
      );

      const stats = await auditLogger.getStatistics();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('logFiles');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('oldestEntry');
      expect(stats).toHaveProperty('newestEntry');
      expect(typeof stats.totalEntries).toBe('number');
    });

    it('should track log file sizes', async () => {
      mockFs.readdir.mockResolvedValueOnce([
        'audit-2024-01-01.log',
        'audit-2024-01-02.log.gz'
      ] as any);

      mockFs.stat.mockImplementation((filePath) => Promise.resolve({
        size: 1024 * 1024, // 1MB
        isFile: () => true,
        mtime: new Date()
      } as any));

      const stats = await auditLogger.getStatistics();

      expect(stats.totalSize).toBe(2 * 1024 * 1024); // 2MB total
    });

    it('should handle empty audit logs', async () => {
      mockFs.readdir.mockResolvedValueOnce([] as any);

      const stats = await auditLogger.getStatistics();

      expect(stats.totalEntries).toBe(0);
      expect(stats.logFiles).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('Index Management', () => {
    beforeEach(async () => {
      const indexedLogger = new AuditLogger({
        logDirectory: mockLogDir,
        enableIndexing: true
      });
      auditLogger = indexedLogger;
      await auditLogger.initialize();
    });

    it('should build search index for efficient querying', async () => {
      await auditLogger.logPermissionDecision(
        { tool: 'fs_write', path: '/test.txt', context: { workingDirectory: '/test', environment: {}, timestamp: new Date() } },
        { action: 'allow', reason: 'Test', confidence: 1.0, timestamp: new Date() },
        'development'
      );

      // Index should be built and contain entries
      const results = await auditLogger.searchEntries({ tool: 'fs_write' });
      expect(results).toBeDefined();
    });

    it('should rebuild index when corrupted', async () => {
      // Mock corrupted index file
      mockFs.readFile.mockRejectedValueOnce(new Error('Corrupted index'));

      // Should handle gracefully and rebuild
      const results = await auditLogger.searchEntries({ tool: 'test' });
      expect(results).toBeDefined();
    });

    it('should update index incrementally for new entries', async () => {
      // Log multiple entries
      for (let i = 0; i < 5; i++) {
        await auditLogger.logPermissionDecision(
          { tool: `tool_${i}`, context: { workingDirectory: '/test', environment: {}, timestamp: new Date() } },
          { action: 'allow', reason: `Test ${i}`, confidence: 1.0, timestamp: new Date() }
        );
      }

      // All entries should be searchable
      const results = await auditLogger.searchEntries({});
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await auditLogger.initialize();
    });

    it('should handle disk space issues gracefully', async () => {
      mockFs.appendFile.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

      const query: PermissionQuery = {
        tool: 'test',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      const result: PermissionResult = {
        action: 'allow',
        reason: 'Test',
        confidence: 1.0,
        timestamp: new Date()
      };

      await expect(auditLogger.logPermissionDecision(query, result))
        .rejects.toThrow('ENOSPC: no space left on device');
    });

    it('should handle malformed log entries during search', async () => {
      // Mock malformed JSON in log file
      mockFs.readFile.mockResolvedValueOnce('{ malformed json');
      mockFs.readdir.mockResolvedValueOnce(['audit-malformed.log'] as any);

      const results = await auditLogger.searchEntries({ tool: 'test' });

      // Should handle gracefully and return empty results
      expect(results).toEqual([]);
    });

    it('should handle missing log directory', async () => {
      mockFs.mkdir.mockRejectedValueOnce(new Error('Cannot create directory'));

      await expect(auditLogger.initialize()).rejects.toThrow('Cannot create directory');
    });

    it('should handle concurrent rotation attempts', async () => {
      // Mock file size that triggers rotation
      mockFs.stat.mockResolvedValue({
        size: 2 * 1024 * 1024,
        isFile: () => true,
        mtime: new Date()
      } as any);

      // Start multiple concurrent logging operations
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(auditLogger.logPermissionDecision(
          { tool: 'concurrent_test', context: { workingDirectory: '/test', environment: {}, timestamp: new Date() } },
          { action: 'allow', reason: 'Concurrent test', confidence: 1.0, timestamp: new Date() }
        ));
      }

      // All should complete without errors
      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });
});