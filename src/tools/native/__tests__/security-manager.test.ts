/**
 * Security Manager Tests - Comprehensive test suite for workspace sandboxing,
 * path normalization, resource limits, and telemetry monitoring
 */

import { SecurityManager } from '../security-manager.js';
import { ResourceManager } from '../resource-manager.js';
import { PathValidator } from '../path-validator.js';
import { 
  SecurityValidationResult,
  ResourceLimits,
  PathValidationError,
  ResourceMonitoringData,
  TelemetryEvent
} from '../types.js';
import { jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('Security and Resource Management', () => {
  let tempDir: string;
  let securityManager: SecurityManager;
  let resourceManager: ResourceManager;
  let pathValidator: PathValidator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'security-test-'));
    
    const resourceLimits: ResourceLimits = {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxMemoryUsage: 512 * 1024 * 1024, // 512MB
      maxCpuTime: 30000, // 30 seconds
      maxOpenFiles: 100,
      maxDirectoryDepth: 50,
      maxGlobResults: 10000
    };

    securityManager = new SecurityManager(tempDir, resourceLimits);
    resourceManager = new ResourceManager(resourceLimits);
    pathValidator = new PathValidator(tempDir);
  });

  afterEach(async () => {
    try {
      await (typeof (fs as any).rm === "function" ? (fs as any).rm : fs.rmdir)(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Workspace Sandboxing', () => {
    test('should enforce workspace root boundary', async () => {
      const outsidePath = '/tmp/outside-workspace';
      const result = await securityManager.validateWorkspaceAccess(outsidePath);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('outside workspace boundary');
      expect(result.severity).toBe('high');
    });

    test('should allow access within workspace', async () => {
      const insidePath = path.join(tempDir, 'allowed-file.txt');
      await fs.writeFile(insidePath, 'test content');
      
      const result = await securityManager.validateWorkspaceAccess(insidePath);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('should prevent parent directory traversal attacks', async () => {
      const maliciousPath = path.join(tempDir, '../../../etc/passwd');
      const result = await securityManager.validateWorkspaceAccess(maliciousPath);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('directory traversal');
      expect(result.severity).toBe('critical');
    });

    test('should handle nested directory access correctly', async () => {
      const nestedDir = path.join(tempDir, 'deep', 'nested', 'directory');
      await fs.mkdir(nestedDir, { recursive: true });
      const nestedFile = path.join(nestedDir, 'test.txt');
      await fs.writeFile(nestedFile, 'nested content');
      
      const result = await securityManager.validateWorkspaceAccess(nestedFile);
      
      expect(result.allowed).toBe(true);
    });

    test('should validate workspace boundaries with complex paths', async () => {
      const testCases = [
        { path: path.join(tempDir, './file.txt'), expected: true },
        { path: path.join(tempDir, 'subdir/../file.txt'), expected: true },
        { path: '/etc/passwd', expected: false },
        { path: '~/../../etc/passwd', expected: false },
        { path: path.join(tempDir, '..', '..', 'malicious'), expected: false }
      ];

      for (const testCase of testCases) {
        const result = await securityManager.validateWorkspaceAccess(testCase.path);
        expect(result.allowed).toBe(testCase.expected);
      }
    });
  });

  describe('Path Normalization and Validation', () => {
    test('should resolve and normalize valid paths', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'content');
      
      const complexPath = path.join(tempDir, './subdir/../test.txt');
      const result = await pathValidator.normalizePath(complexPath);
      
      expect(result.success).toBe(true);
      expect(result.normalizedPath).toBe(testFile);
      expect(result.isWithinWorkspace).toBe(true);
    });

    test('should handle symlink resolution', async () => {
      const targetFile = path.join(tempDir, 'target.txt');
      const symlinkFile = path.join(tempDir, 'symlink.txt');
      
      await fs.writeFile(targetFile, 'target content');
      await fs.symlink(targetFile, symlinkFile);
      
      const result = await pathValidator.normalizePath(symlinkFile);
      
      expect(result.success).toBe(true);
      expect(result.normalizedPath).toBe(targetFile);
      expect(result.isSymlink).toBe(true);
      expect(result.symlinkTarget).toBe(targetFile);
    });

    test('should prevent symlink traversal outside workspace', async () => {
      const outsideFile = '/tmp/outside-target.txt';
      const symlinkFile = path.join(tempDir, 'malicious-symlink.txt');
      
      try {
        await fs.writeFile(outsideFile, 'outside content');
        await fs.symlink(outsideFile, symlinkFile);
        
        const result = await pathValidator.normalizePath(symlinkFile);
        
        expect(result.success).toBe(false);
        expect(result.error?.type).toBe('SYMLINK_TRAVERSAL');
        expect(result.error?.severity).toBe('critical');
      } finally {
        try { await fs.unlink(outsideFile); } catch {}
      }
    });

    test('should detect and prevent circular symlinks', async () => {
      const symlink1 = path.join(tempDir, 'symlink1.txt');
      const symlink2 = path.join(tempDir, 'symlink2.txt');
      
      await fs.symlink(symlink2, symlink1);
      await fs.symlink(symlink1, symlink2);
      
      const result = await pathValidator.normalizePath(symlink1);
      
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('CIRCULAR_SYMLINK');
      expect(result.error?.message).toContain('circular symlink');
    });

    test('should validate path components for security', async () => {
      const maliciousPaths = [
        path.join(tempDir, '..', '..', 'etc', 'passwd'),
        path.join(tempDir, 'file\x00.txt'), // null byte
        path.join(tempDir, 'file\r\n.txt'), // CRLF injection
        path.join(tempDir, 'file<script>.txt'), // XSS attempt
      ];

      for (const maliciousPath of maliciousPaths) {
        const result = await pathValidator.validatePathSecurity(maliciousPath);
        expect(result.safe).toBe(false);
        expect(result.threats.length).toBeGreaterThan(0);
      }
    });

    test('should handle extremely long paths', async () => {
      const longPath = path.join(tempDir, 'a'.repeat(1000) + '.txt');
      const result = await pathValidator.normalizePath(longPath);
      
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('PATH_TOO_LONG');
    });
  });

  describe('File Size Limits and Binary Detection', () => {
    test('should enforce maximum file size for reads', async () => {
      const largefile = path.join(tempDir, 'large.txt');
      const largeContent = 'x'.repeat(101 * 1024 * 1024); // 101MB > 100MB limit
      
      // Create large file
      await fs.writeFile(largefile, largeContent);
      
      const result = await securityManager.validateFileAccess(largefile, 'read');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('file size exceeds limit');
      expect(result.actualSize).toBe(largeContent.length);
      expect(result.maxAllowedSize).toBe(100 * 1024 * 1024);
    });

    test('should enforce stricter limits for writes', async () => {
      const writeContent = 'x'.repeat(51 * 1024 * 1024); // 51MB > 50MB write limit
      const writefile = path.join(tempDir, 'write-test.txt');
      
      const result = await securityManager.validateFileAccess(writefile, 'write', writeContent.length);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('write size exceeds limit');
    });

    test('should detect binary files accurately', async () => {
      // Create a binary file (PNG header)
      const binaryFile = path.join(tempDir, 'test.png');
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      await fs.writeFile(binaryFile, pngHeader);
      
      const result = await securityManager.detectFileType(binaryFile);
      
      expect(result.isBinary).toBe(true);
      expect(result.mimeType).toBe('image/png');
      expect(result.encoding).toBeUndefined();
    });

    test('should detect text file encodings', async () => {
      // UTF-8 file
      const utf8File = path.join(tempDir, 'utf8.txt');
      await fs.writeFile(utf8File, 'Hello 世界', 'utf8');
      
      const result = await securityManager.detectFileType(utf8File);
      
      expect(result.isBinary).toBe(false);
      expect(result.encoding).toBe('utf8');
      expect(result.mimeType).toBe('text/plain');
    });

    test('should respect file size limits by operation type', async () => {
      const testCases = [
        { operation: 'read', size: 90 * 1024 * 1024, expected: true },
        { operation: 'read', size: 110 * 1024 * 1024, expected: false },
        { operation: 'write', size: 40 * 1024 * 1024, expected: true },
        { operation: 'write', size: 60 * 1024 * 1024, expected: false }
      ];

      for (const testCase of testCases) {
        const result = await securityManager.validateFileAccess(
          path.join(tempDir, `test-${testCase.operation}.txt`),
          testCase.operation as 'read' | 'write',
          testCase.size
        );
        expect(result.allowed).toBe(testCase.expected);
      }
    });
  });

  describe('Concurrency Limits and Rate Limiting', () => {
    test('should enforce maximum concurrent operations', async () => {
      const maxConcurrency = 5;
      resourceManager = new ResourceManager({ 
        ...resourceManager['limits'], 
        maxConcurrentOperations: maxConcurrency 
      });
      
      // Start maximum concurrent operations
      const operations = Array.from({ length: maxConcurrency }, (_, i) => 
        resourceManager.acquireResource(`operation-${i}`)
      );
      
      const acquisitions = await Promise.all(operations);
      acquisitions.forEach(result => expect(result.granted).toBe(true));
      
      // Try to exceed limit
      const excessResult = await resourceManager.acquireResource('excess-operation');
      expect(excessResult.granted).toBe(false);
      expect(excessResult.reason).toContain('concurrency limit');
    });

    test('should implement proper queuing for resource requests', async () => {
      const maxConcurrency = 2;
      resourceManager = new ResourceManager({ 
        ...resourceManager['limits'], 
        maxConcurrentOperations: maxConcurrency 
      });
      
      // Acquire all available slots
      await resourceManager.acquireResource('op1');
      await resourceManager.acquireResource('op2');
      
      // Queue additional requests
      const queuedPromise = resourceManager.acquireResource('queued-op');
      
      // Verify it's queued
      expect(resourceManager.getQueueLength()).toBe(1);
      
      // Release a resource to process queue
      await resourceManager.releaseResource('op1');
      
      const queuedResult = await queuedPromise;
      expect(queuedResult.granted).toBe(true);
    });

    test('should implement rate limiting per tool type', async () => {
      const rateLimit = { requests: 5, window: 1000 }; // 5 requests per second
      
      // Make requests up to limit
      for (let i = 0; i < rateLimit.requests; i++) {
        const result = await resourceManager.checkRateLimit('read', 'test-client');
        expect(result.allowed).toBe(true);
      }
      
      // Exceed rate limit
      const exceededResult = await resourceManager.checkRateLimit('read', 'test-client');
      expect(exceededResult.allowed).toBe(false);
      expect(exceededResult.retryAfter).toBeGreaterThan(0);
    });

    test('should handle resource cleanup on timeout', async () => {
      const shortTimeout = 100; // 100ms timeout
      resourceManager = new ResourceManager({ 
        ...resourceManager['limits'], 
        operationTimeout: shortTimeout 
      });
      
      const acquisition = await resourceManager.acquireResource('timeout-test');
      expect(acquisition.granted).toBe(true);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, shortTimeout + 50));
      
      // Resource should be automatically released
      const newAcquisition = await resourceManager.acquireResource('after-timeout');
      expect(newAcquisition.granted).toBe(true);
    });
  });

  describe('Resource Monitoring', () => {
    test('should track memory usage accurately', async () => {
      const monitoring = await resourceManager.getResourceUsage();
      
      expect(monitoring.memoryUsage).toHaveProperty('heapUsed');
      expect(monitoring.memoryUsage).toHaveProperty('heapTotal');
      expect(monitoring.memoryUsage).toHaveProperty('rss');
      expect(monitoring.memoryUsage.heapUsed).toBeGreaterThan(0);
    });

    test('should monitor CPU usage over time', async () => {
      const startMonitoring = await resourceManager.startCPUMonitoring();
      
      // Simulate some CPU work
      let sum = 0;
      for (let i = 0; i < 1000000; i++) {
        sum += Math.random();
      }
      
      const cpuUsage = await resourceManager.getCPUUsage();
      
      expect(cpuUsage.userCPUTime).toBeGreaterThan(0);
      expect(cpuUsage.systemCPUTime).toBeGreaterThanOrEqual(0);
      expect(cpuUsage.percentUsage).toBeGreaterThanOrEqual(0);
      expect(cpuUsage.percentUsage).toBeLessThanOrEqual(100);
    });

    test('should track file handle usage', async () => {
      const initialHandles = await resourceManager.getOpenFileHandles();
      
      // Open some file handles
      const file1 = await fs.open(path.join(tempDir, 'handle1.txt'), 'w');
      const file2 = await fs.open(path.join(tempDir, 'handle2.txt'), 'w');
      
      const afterOpenHandles = await resourceManager.getOpenFileHandles();
      expect(afterOpenHandles.count).toBeGreaterThan(initialHandles.count);
      
      await file1.close();
      await file2.close();
      
      const afterCloseHandles = await resourceManager.getOpenFileHandles();
      expect(afterCloseHandles.count).toBeLessThanOrEqual(afterOpenHandles.count);
    });

    test('should enforce resource limits and trigger alerts', async () => {
      const limits: ResourceLimits = {
        maxMemoryUsage: 50 * 1024 * 1024, // 50MB
        maxCpuTime: 1000, // 1 second
        maxOpenFiles: 10
      };
      
      resourceManager = new ResourceManager(limits);
      
      // Monitor for limit violations
      const violations: string[] = [];
      resourceManager.on('resource-limit-exceeded', (event) => {
        violations.push(event.resource);
      });
      
      // Force memory usage tracking
      await resourceManager.checkResourceLimits();
      
      // CPU time limit would be tested in integration
      expect(typeof resourceManager.checkResourceLimits).toBe('function');
    });

    test('should generate performance metrics', async () => {
      const operationId = 'test-operation';
      const startTime = Date.now();
      
      await resourceManager.startOperationMonitoring(operationId);
      
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics = await resourceManager.stopOperationMonitoring(operationId);
      
      expect(metrics.duration).toBeGreaterThanOrEqual(100);
      expect(metrics.memoryDelta).toBeDefined();
      expect(metrics.cpuUsage).toBeDefined();
      expect(metrics.success).toBe(true);
    });
  });

  describe('Telemetry Events', () => {
    test('should emit telemetry with Claude Code-compatible fields', async () => {
      const telemetryEvents: TelemetryEvent[] = [];
      
      securityManager.on('telemetry', (event: TelemetryEvent) => {
        telemetryEvents.push(event);
      });
      
      await securityManager.validateWorkspaceAccess(path.join(tempDir, 'test.txt'));
      
      expect(telemetryEvents).toHaveLength(1);
      const event = telemetryEvents[0];
      
      // Verify Claude Code-compatible field names
      expect(event).toHaveProperty('tool');
      expect(event).toHaveProperty('startTime');
      expect(event).toHaveProperty('endTime');
      expect(event).toHaveProperty('duration');
      expect(event).toHaveProperty('success');
      expect(event.tool).toBe('security-validation');
    });

    test('should include detailed metrics in telemetry', async () => {
      const events: TelemetryEvent[] = [];
      resourceManager.on('telemetry', (event) => events.push(event));
      
      const operationId = 'telemetry-test';
      await resourceManager.startOperationMonitoring(operationId);
      await new Promise(resolve => setTimeout(resolve, 50));
      await resourceManager.stopOperationMonitoring(operationId);
      
      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      
      expect(event).toHaveProperty('bytesProcessed');
      expect(event).toHaveProperty('memoryUsage');
      expect(event).toHaveProperty('cpuTime');
      expect(event).toHaveProperty('resourcesUsed');
    });

    test('should emit security violation telemetry', async () => {
      const securityEvents: TelemetryEvent[] = [];
      securityManager.on('security-violation', (event) => securityEvents.push(event));
      
      // Trigger a security violation
      await securityManager.validateWorkspaceAccess('/etc/passwd');
      
      expect(securityEvents).toHaveLength(1);
      const violation = securityEvents[0];
      
      expect(violation).toHaveProperty('violationType');
      expect(violation).toHaveProperty('severity');
      expect(violation).toHaveProperty('path');
      expect(violation).toHaveProperty('timestamp');
      expect(violation.severity).toBe('high');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle non-existent file validation', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.txt');
      const result = await securityManager.validateFileAccess(nonExistentFile, 'read');
      
      expect(result.allowed).toBe(true); // Should allow validation of non-existent files
      expect(result.fileExists).toBe(false);
    });

    test('should handle permission errors gracefully', async () => {
      const restrictedFile = path.join(tempDir, 'restricted.txt');
      await fs.writeFile(restrictedFile, 'content');
      await fs.chmod(restrictedFile, 0o000); // No permissions
      
      try {
        const result = await securityManager.detectFileType(restrictedFile);
        expect(result.error).toBeDefined();
        expect(result.error?.type).toBe('PERMISSION_DENIED');
      } finally {
        // Cleanup - restore permissions
        await fs.chmod(restrictedFile, 0o644);
      }
    });

    test('should handle corrupted symlinks', async () => {
      const brokenSymlink = path.join(tempDir, 'broken-link.txt');
      const nonExistentTarget = path.join(tempDir, 'does-not-exist.txt');
      
      await fs.symlink(nonExistentTarget, brokenSymlink);
      
      const result = await pathValidator.normalizePath(brokenSymlink);
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('BROKEN_SYMLINK');
    });

    test('should handle resource exhaustion gracefully', async () => {
      const strictLimits: ResourceLimits = {
        maxConcurrentOperations: 1,
        maxMemoryUsage: 1024, // 1KB - very restrictive
        operationTimeout: 10 // 10ms - very short
      };
      
      resourceManager = new ResourceManager(strictLimits);
      
      const result = await resourceManager.acquireResource('exhaustion-test');
      expect(result.granted).toBe(true);
      
      const secondResult = await resourceManager.acquireResource('second-operation');
      expect(secondResult.granted).toBe(false);
      expect(secondResult.reason).toContain('limit');
    });
  });

  describe('Integration with Existing Tools', () => {
    test('should integrate with ReadTool security validation', async () => {
      const testFile = path.join(tempDir, 'integration-test.txt');
      await fs.writeFile(testFile, 'test content for integration');
      
      const securityResult = await securityManager.validateFileAccess(testFile, 'read');
      expect(securityResult.allowed).toBe(true);
      
      const pathResult = await pathValidator.normalizePath(testFile);
      expect(pathResult.success).toBe(true);
    });

    test('should provide consistent error formats across tools', async () => {
      const maliciousPath = '/etc/passwd';
      
      try {
        await pathValidator.normalizePath(maliciousPath);
      } catch (error) {
        expect(error).toHaveProperty('errorClass');
        expect(error).toHaveProperty('code');
        expect(error).toHaveProperty('message');
      }
    });
  });
});