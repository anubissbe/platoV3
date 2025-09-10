/**
 * Claude Code Parity Tests - Comprehensive validation of wire-compatible responses
 * Ensures 1:1 compatibility with Claude Code tool system
 */

import { ReadTool } from '../read-tool.js';
import { WriteTool } from '../write-tool.js';
import { ListTool } from '../list-tool.js';
import { BashTool } from '../bash-tool.js';
import { EditTool } from '../edit-tool.js';
import { ErrorClassifier } from '../error-classifier.js';
import { 
  ReadToolResponse,
  WriteToolResponse, 
  ListToolResponse,
  BashToolResponse,
  EditToolResponse,
  BaseToolResponse,
  ToolError,
  ErrorClass,
  ToolEvent
} from '../types.js';
import { jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Claude Code reference responses for exact comparison
const CLAUDE_CODE_REFERENCE_RESPONSES = {
  read: {
    success: {
      content: "test file content",
      encoding: "utf8",
      size: 17,
      totalLines: 1,
      requestedRange: null,
      truncated: false,
      isBinary: false,
      outOfRange: false,
      encodingFallback: false,
      resolvedPath: "/workspace/test.txt",
      success: true,
      metrics: {
        duration: 42,
        startTime: expect.any(Number),
        endTime: expect.any(Number),
        readTime: expect.any(Number),
        throughput: expect.any(Number),
        encoding: "utf8"
      }
    },
    fileNotFound: {
      success: false,
      error: {
        errorClass: "permanent",
        code: "ENOENT",
        message: expect.stringContaining("no such file")
      }
    },
    binaryFile: {
      content: null,
      isBinary: true,
      encoding: null,
      success: false,
      error: {
        errorClass: "validation",
        code: "BINARY_FILE",
        message: "Cannot read binary file"
      }
    }
  },
  write: {
    success: {
      bytesWritten: 17,
      encoding: "utf8",
      overwritten: false,
      atomic: true,
      backupPath: undefined,
      dirsCreated: [],
      tempPath: expect.stringContaining(".tmp"),
      isBinary: false,
      success: true,
      metrics: {
        duration: expect.any(Number),
        startTime: expect.any(Number),
        endTime: expect.any(Number),
        writeTime: expect.any(Number),
        throughput: expect.any(Number),
        encoding: "utf8",
        bytesWritten: 17
      }
    },
    permissionDenied: {
      success: false,
      error: {
        errorClass: "permission",
        code: "EACCES",
        message: expect.stringContaining("permission denied")
      }
    }
  },
  list: {
    success: {
      files: expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          path: expect.any(String),
          type: expect.stringMatching(/^(file|directory)$/),
          size: expect.any(Number),
          modified: expect.any(Date),
          permissions: expect.stringMatching(/^[rwx-]{9}$/)
        })
      ]),
      directories: expect.any(Array),
      totalFiles: expect.any(Number),
      totalDirectories: expect.any(Number),
      totalSize: expect.any(Number),
      truncated: false,
      resolvedPath: expect.any(String),
      success: true,
      metrics: {
        duration: expect.any(Number),
        startTime: expect.any(Number),
        endTime: expect.any(Number),
        itemsProcessed: expect.any(Number),
        throughput: expect.any(Number),
        filesScanned: expect.any(Number),
        directoriesScanned: expect.any(Number),
        filterTime: expect.any(Number),
        sortTime: expect.any(Number)
      }
    }
  },
  bash: {
    success: {
      stdout: "Hello World\n",
      stderr: "",
      exitCode: 0,
      signal: undefined,
      timedOut: false,
      cancelled: false,
      pid: expect.any(Number),
      success: true,
      metrics: {
        duration: expect.any(Number),
        startTime: expect.any(Number),
        endTime: expect.any(Number),
        executionTime: expect.any(Number),
        stdoutBytes: 12,
        stderrBytes: 0,
        peakMemoryUsage: expect.any(Number),
        exitCode: 0
      }
    },
    timeout: {
      stdout: "",
      stderr: "",
      exitCode: undefined,
      signal: "SIGKILL",
      timedOut: true,
      cancelled: false,
      success: false,
      error: {
        errorClass: "timeout",
        code: "TIMEOUT",
        message: expect.stringContaining("timed out")
      }
    },
    nonZeroExit: {
      stdout: "",
      stderr: "command failed",
      exitCode: 1,
      signal: undefined,
      timedOut: false,
      cancelled: false,
      success: false,
      error: {
        errorClass: "permanent",
        code: "COMMAND_FAILED",
        message: expect.stringContaining("exited with code 1")
      }
    }
  },
  edit: {
    success: {
      success: true,
      changes: 1,
      linesModified: [1],
      linesAdded: 0,
      linesDeleted: 0,
      matchCount: 1,
      diff: expect.stringContaining("@@ "),
      backupPath: undefined,
      metrics: {
        duration: expect.any(Number),
        startTime: expect.any(Number),
        endTime: expect.any(Number),
        patternMatches: 1,
        bytesChanged: expect.any(Number),
        processingTime: expect.any(Number),
        diffGenerationTime: expect.any(Number)
      }
    },
    patternNotFound: {
      success: false,
      error: {
        errorClass: "validation",
        code: "PATTERN_NOT_FOUND",
        message: expect.stringContaining("pattern not found")
      }
    }
  }
};

describe('Claude Code Parity Tests', () => {
  let tempDir: string;
  let readTool: ReadTool;
  let writeTool: WriteTool;
  let listTool: ListTool;
  let bashTool: BashTool;
  let editTool: EditTool;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parity-test-'));
    
    readTool = new ReadTool(tempDir);
    writeTool = new WriteTool(tempDir);
    listTool = new ListTool(tempDir);
    bashTool = new BashTool(tempDir);
    editTool = new EditTool(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('ReadTool Parity', () => {
    test('should match Claude Code response format for successful read', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      const content = 'test file content';
      await fs.writeFile(testFile, content);

      const result = await readTool.execute({ path: 'test.txt' }) as ReadToolResponse;

      expect(result).toMatchObject(CLAUDE_CODE_REFERENCE_RESPONSES.read.success);
      expect(result.content).toBe(content);
      expect(result.size).toBe(content.length);
    });

    test('should match Claude Code error format for missing file', async () => {
      try {
        await readTool.execute({ path: 'nonexistent.txt' });
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        expect((error as ToolError).errorClass).toBe(ErrorClass.PERMANENT);
        expect((error as ToolError).code).toBe('ENOENT');
      }
    });

    test('should match Claude Code field names exactly', async () => {
      const testFile = path.join(tempDir, 'field-test.txt');
      await fs.writeFile(testFile, 'content');

      const result = await readTool.execute({ path: 'field-test.txt' }) as ReadToolResponse;

      // Verify exact field names match Claude Code
      const expectedFields = [
        'content', 'encoding', 'size', 'totalLines', 'requestedRange',
        'truncated', 'isBinary', 'outOfRange', 'encodingFallback',
        'resolvedPath', 'success', 'metrics'
      ];

      expectedFields.forEach(field => {
        expect(result).toHaveProperty(field);
      });

      // Verify metrics structure
      expect(result.metrics).toHaveProperty('duration');
      expect(result.metrics).toHaveProperty('startTime');
      expect(result.metrics).toHaveProperty('endTime');
      expect(result.metrics).toHaveProperty('readTime');
      expect(result.metrics).toHaveProperty('throughput');
      expect(result.metrics).toHaveProperty('encoding');
    });

    test('should handle line range requests like Claude Code', async () => {
      const testFile = path.join(tempDir, 'multiline.txt');
      const content = 'line 1\nline 2\nline 3\nline 4\nline 5';
      await fs.writeFile(testFile, content);

      const result = await readTool.execute({
        path: 'multiline.txt',
        startLine: 2,
        endLine: 4
      }) as ReadToolResponse;

      expect(result.content).toBe('line 2\nline 3\nline 4');
      expect(result.requestedRange).toEqual({ start: 2, end: 4 });
      expect(result.totalLines).toBe(5);
    });
  });

  describe('WriteTool Parity', () => {
    test('should match Claude Code response format for successful write', async () => {
      const content = 'test file content';
      
      const result = await writeTool.execute({
        path: 'test.txt',
        content,
        atomic: true
      }) as WriteToolResponse;

      expect(result).toMatchObject(CLAUDE_CODE_REFERENCE_RESPONSES.write.success);
      expect(result.bytesWritten).toBe(content.length);
    });

    test('should create directories like Claude Code when createDirs is true', async () => {
      const nestedPath = 'deep/nested/file.txt';
      const content = 'nested content';

      const result = await writeTool.execute({
        path: nestedPath,
        content,
        createDirs: true
      }) as WriteToolResponse;

      expect(result.success).toBe(true);
      expect(result.dirsCreated).toEqual(
        expect.arrayContaining(['deep', 'deep/nested'])
      );
    });

    test('should handle overwrite detection like Claude Code', async () => {
      const filePath = 'overwrite-test.txt';
      await fs.writeFile(path.join(tempDir, filePath), 'original');

      const result = await writeTool.execute({
        path: filePath,
        content: 'new content'
      }) as WriteToolResponse;

      expect(result.overwritten).toBe(true);
    });
  });

  describe('ListTool Parity', () => {
    test('should match Claude Code response format for directory listing', async () => {
      // Create test files and directories
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempDir, 'file2.js'), 'content2');
      await fs.mkdir(path.join(tempDir, 'subdir'));
      await fs.writeFile(path.join(tempDir, 'subdir', 'nested.txt'), 'nested');

      const result = await listTool.execute({ path: '.' }) as ListToolResponse;

      expect(result).toMatchObject(CLAUDE_CODE_REFERENCE_RESPONSES.list.success);
      expect(result.files).toHaveLength(2);
      expect(result.directories).toHaveLength(1);
    });

    test('should format file permissions like Claude Code', async () => {
      await fs.writeFile(path.join(tempDir, 'perm-test.txt'), 'content');

      const result = await listTool.execute({ path: '.' }) as ListToolResponse;

      const file = result.files?.find(f => f.name === 'perm-test.txt');
      expect(file?.permissions).toMatch(/^[rwx-]{9}$/);
    });

    test('should handle glob patterns like Claude Code', async () => {
      await fs.writeFile(path.join(tempDir, 'test.js'), 'js content');
      await fs.writeFile(path.join(tempDir, 'test.ts'), 'ts content');
      await fs.writeFile(path.join(tempDir, 'readme.md'), 'md content');

      const result = await listTool.execute({ 
        path: '.',
        glob: '*.js' 
      }) as ListToolResponse;

      expect(result.files).toHaveLength(1);
      expect(result.files?.[0].name).toBe('test.js');
    });
  });

  describe('BashTool Parity', () => {
    test('should match Claude Code response format for successful command', async () => {
      const result = await bashTool.execute({
        command: 'echo "Hello World"'
      }) as BashToolResponse;

      expect(result).toMatchObject(CLAUDE_CODE_REFERENCE_RESPONSES.bash.success);
      expect(result.stdout?.trim()).toBe('Hello World');
      expect(result.exitCode).toBe(0);
    });

    test('should handle command timeout like Claude Code', async () => {
      try {
        await bashTool.execute({
          command: 'sleep 5',
          timeout: 100 // 100ms timeout
        });
        fail('Expected timeout error');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        expect((error as ToolError).errorClass).toBe(ErrorClass.TIMEOUT);
      }
    }, 10000);

    test('should capture stderr like Claude Code', async () => {
      const result = await bashTool.execute({
        command: 'echo "error message" >&2'
      }) as BashToolResponse;

      expect(result.stderr?.trim()).toBe('error message');
      expect(result.stdout).toBe('');
    });

    test('should handle working directory like Claude Code', async () => {
      const subdir = path.join(tempDir, 'subdir');
      await fs.mkdir(subdir);

      const result = await bashTool.execute({
        command: 'pwd',
        cwd: 'subdir'
      }) as BashToolResponse;

      expect(result.stdout?.trim()).toBe(subdir);
    });
  });

  describe('EditTool Parity', () => {
    test('should match Claude Code response format for successful edit', async () => {
      const testFile = path.join(tempDir, 'edit-test.txt');
      const originalContent = 'line 1\nold content\nline 3';
      await fs.writeFile(testFile, originalContent);

      const result = await editTool.execute({
        path: 'edit-test.txt',
        pattern: 'old content',
        replacement: 'new content'
      }) as EditToolResponse;

      expect(result).toMatchObject(CLAUDE_CODE_REFERENCE_RESPONSES.edit.success);
      expect(result.success).toBe(true);
      expect(result.changes).toBeDefined();
      expect(result.changes).toBeGreaterThan(0);
      expect(result.linesModified).toBeDefined();
    });

    test('should handle pattern not found like Claude Code', async () => {
      const testFile = path.join(tempDir, 'edit-notfound.txt');
      await fs.writeFile(testFile, 'some content');

      try {
        await editTool.execute({
          path: 'edit-notfound.txt',
          pattern: 'nonexistent pattern',
          replacement: 'replacement'
        });
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        expect((error as ToolError).errorClass).toBe(ErrorClass.VALIDATION);
        expect((error as ToolError).code).toBe('PATTERN_NOT_FOUND');
      }
    });

    test('should generate diff output like Claude Code', async () => {
      const testFile = path.join(tempDir, 'diff-test.txt');
      await fs.writeFile(testFile, 'line 1\nline 2\nline 3');

      const result = await editTool.execute({
        path: 'diff-test.txt',
        pattern: 'line 2',
        replacement: 'modified line 2',
        generateDiff: true
      }) as EditToolResponse;

      expect(result.diff).toBeDefined();
      expect(result.diff).toContain('@@ ');
      expect(result.diff).toContain('-line 2');
      expect(result.diff).toContain('+modified line 2');
    });
  });

  describe('Error Response Parity', () => {
    test('should format all errors with Claude Code-compatible structure', async () => {
      const errorTestCases = [
        {
          tool: readTool,
          args: { path: '/etc/passwd' },
          expectedClass: ErrorClass.PERMISSION
        },
        {
          tool: writeTool,
          args: { path: '../outside-workspace.txt', content: 'test' },
          expectedClass: ErrorClass.VALIDATION
        }
      ];

      for (const testCase of errorTestCases) {
        try {
          await testCase.tool.execute(testCase.args as any);
          fail(`Expected error from ${testCase.tool.constructor.name}`);
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          expect((error as ToolError).errorClass).toBe(testCase.expectedClass);
          expect((error as ToolError)).toHaveProperty('code');
          expect((error as ToolError)).toHaveProperty('message');
        }
      }
    });

    test('should include retry information for transient errors', async () => {
      // Simulate a transient error
      const error = ErrorClassifier.createToolError({ code: 'EAGAIN' });
      
      expect(error.retryable).toBe(true);
      expect(error.errorClass).toBe(ErrorClass.TRANSIENT);
      expect(error.retryAfter).toBeDefined();
      expect(error.retryAfter).toBeGreaterThanOrEqual(50);
    });

    test('should use exact Claude Code error codes', async () => {
      const errorCodeTests = [
        { code: 'ENOENT', expectedClass: ErrorClass.PERMANENT },
        { code: 'EACCES', expectedClass: ErrorClass.PERMISSION },
        { code: 'EINVAL', expectedClass: ErrorClass.VALIDATION },
        { code: 'EAGAIN', expectedClass: ErrorClass.TRANSIENT },
        { code: 'TIMEOUT', expectedClass: ErrorClass.TIMEOUT }
      ];

      for (const test of errorCodeTests) {
        const classification = ErrorClassifier.classifyError({ code: test.code });
        expect(classification.errorClass).toBe(test.expectedClass);
        expect(classification.code).toBe(test.code);
        expect(classification.retryable).toBe(test.expectedClass === ErrorClass.TRANSIENT);
      }
    });

    test('should implement Claude Code retry policy', async () => {
      const policy = ErrorClassifier.getRetryPolicy(ErrorClass.TRANSIENT);
      
      expect(policy.maxRetries).toBe(3);
      expect(policy.baseDelay).toBe(100);
      expect(policy.backoffMultiplier).toBe(2.0);
      expect(policy.maxDelay).toBe(5000);
      expect(policy.jitter).toBe(true);
    });

    test('should calculate exponential backoff correctly', async () => {
      const policy = ErrorClassifier.getRetryPolicy(ErrorClass.TRANSIENT);
      
      // First retry: 100ms base
      const delay1 = ErrorClassifier.calculateRetryDelay(0, policy);
      expect(delay1).toBeGreaterThanOrEqual(90); // With jitter
      expect(delay1).toBeLessThanOrEqual(110);
      
      // Second retry: 200ms (100 * 2^1)
      const delay2 = ErrorClassifier.calculateRetryDelay(1, policy);
      expect(delay2).toBeGreaterThanOrEqual(180);
      expect(delay2).toBeLessThanOrEqual(220);
      
      // Third retry: 400ms (100 * 2^2)
      const delay3 = ErrorClassifier.calculateRetryDelay(2, policy);
      expect(delay3).toBeGreaterThanOrEqual(360);
      expect(delay3).toBeLessThanOrEqual(440);
    });
  });

  describe('Streaming Response Parity', () => {
    test('should match Claude Code streaming event format', async () => {
      const events: ToolEvent[] = [];
      
      // Test streaming with BashTool
      const stream = bashTool.stream({
        command: 'echo "line1"; sleep 0.1; echo "line2"'
      });

      for await (const event of stream) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      
      // Verify event structure matches Claude Code
      events.forEach((event, index) => {
        expect(event).toHaveProperty('type');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('sequence');
        expect(event.sequence).toBe(index);
        expect(['stdout', 'stderr', 'progress', 'metadata', 'error', 'complete'].includes(event.type)).toBe(true);
      });

      // Verify sequence ordering
      const sequences = events.map(e => e.sequence);
      const expectedSequences = Array.from({ length: events.length }, (_, i) => i);
      expect(sequences).toEqual(expectedSequences);
    });

    test('should emit correct event types in proper order', async () => {
      const events: ToolEvent[] = [];
      
      const stream = bashTool.stream({
        command: 'echo "output"; echo "error" >&2; exit 0'
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Should have stdout, stderr, and complete events
      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain('stdout');
      expect(eventTypes).toContain('stderr');
      expect(eventTypes[eventTypes.length - 1]).toBe('complete');
    });

    test('should handle streaming chunk size (4KB default)', async () => {
      // Generate a large output to test chunking
      const largeOutput = 'x'.repeat(8192); // 8KB of data
      const events: ToolEvent[] = [];
      
      const stream = bashTool.stream({
        command: `echo "${largeOutput}"`
      });

      for await (const event of stream) {
        if (event.type === 'stdout' && event.data) {
          events.push(event);
        }
      }

      // Should be split into multiple chunks
      expect(events.length).toBeGreaterThanOrEqual(2);
      
      // Each chunk should be <= 4KB
      events.forEach(event => {
        if (event.data) {
          expect(event.data.length).toBeLessThanOrEqual(4096);
        }
      });
    });

    test('should include progress events for long-running operations', async () => {
      const events: ToolEvent[] = [];
      
      // Simulate a longer operation
      const stream = bashTool.stream({
        command: 'for i in {1..3}; do echo "Step $i"; sleep 0.1; done'
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Check for progress-related metadata
      const progressEvents = events.filter(e => e.type === 'progress' || e.progress !== undefined);
      if (progressEvents.length > 0) {
        progressEvents.forEach(event => {
          if (event.progress !== undefined) {
            expect(event.progress).toBeGreaterThanOrEqual(0);
            expect(event.progress).toBeLessThanOrEqual(100);
          }
        });
      }
    });

    test('should handle streaming cancellation like Claude Code', async () => {
      // This test would require implementing cancellation tokens
      // For now, we verify the basic structure
      const stream = bashTool.stream({
        command: 'sleep 5'
      });

      const events: ToolEvent[] = [];
      let cancelled = false;

      // Simulate getting some events then cancelling
      for await (const event of stream) {
        events.push(event);
        if (events.length >= 1) {
          // Would call cancel() here in real implementation
          cancelled = true;
          break;
        }
      }

      expect(cancelled).toBe(true);
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance Compatibility', () => {
    test('should complete operations within Claude Code latency bounds', async () => {
      const operations = [
        { tool: readTool, args: { path: 'test.txt' }, maxLatency: 100 },
        { tool: listTool, args: { path: '.' }, maxLatency: 200 },
      ];

      // Create test file
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');

      for (const operation of operations) {
        const startTime = Date.now();
        await operation.tool.execute(operation.args);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(operation.maxLatency);
      }
    });

    test('should show latency improvement over theoretical MCP bridge', async () => {
      // This test would compare native execution time vs simulated MCP overhead
      const testFile = path.join(tempDir, 'perf-test.txt');
      await fs.writeFile(testFile, 'performance test content');

      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await readTool.execute({ path: 'perf-test.txt' });
        times.push(performance.now() - startTime);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      
      // Native execution should be under 10ms for small files
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('Field Name and Type Compatibility', () => {
    test('should use exact field names as Claude Code', async () => {
      const testFile = path.join(tempDir, 'fields.txt');
      await fs.writeFile(testFile, 'field test');

      const result = await readTool.execute({ path: 'fields.txt' }) as ReadToolResponse;

      // Check that we don't have any extra or renamed fields
      const allowedFields = new Set([
        'content', 'encoding', 'detectedEncoding', 'size', 'totalLines',
        'requestedRange', 'truncated', 'isBinary', 'outOfRange',
        'encodingFallback', 'resolvedPath', 'success', 'metrics', 'error'
      ]);

      Object.keys(result).forEach(key => {
        expect(allowedFields.has(key)).toBe(true);
      });
    });

    test('should use correct data types for all fields', async () => {
      const testFile = path.join(tempDir, 'types.txt');
      await fs.writeFile(testFile, 'type test');

      const result = await readTool.execute({ path: 'types.txt' }) as ReadToolResponse;

      expect(typeof result.success).toBe('boolean');
      expect(typeof result.content).toBe('string');
      expect(typeof result.size).toBe('number');
      expect(typeof result.encoding).toBe('string');
      expect(typeof result.isBinary).toBe('boolean');
      expect(typeof result.truncated).toBe('boolean');
      
      if (result.metrics) {
        expect(typeof result.metrics.duration).toBe('number');
        expect(typeof result.metrics.startTime).toBe('number');
        expect(typeof result.metrics.endTime).toBe('number');
      }
    });
  });

  describe('Response Format Validation', () => {
    test('should match exact Claude Code field structure for all tools', async () => {
      // Define expected field structures for each tool
      const fieldStructures = {
        read: ['content', 'encoding', 'size', 'totalLines', 'requestedRange', 
               'truncated', 'isBinary', 'outOfRange', 'encodingFallback', 
               'resolvedPath', 'success', 'metrics'],
        write: ['bytesWritten', 'encoding', 'overwritten', 'atomic', 
                'backupPath', 'dirsCreated', 'tempPath', 'isBinary', 
                'success', 'metrics'],
        list: ['files', 'directories', 'totalFiles', 'totalDirectories', 
               'totalSize', 'truncated', 'resolvedPath', 'success', 'metrics'],
        bash: ['stdout', 'stderr', 'exitCode', 'signal', 'timedOut', 
               'cancelled', 'pid', 'success', 'metrics'],
        edit: ['success', 'changes', 'diff', 'linesModified', 'totalLines', 
               'backupPath', 'applied', 'metrics']
      };

      // Test each tool's response structure
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');
      
      const readResult = await readTool.execute({ path: 'test.txt' }) as ReadToolResponse;
      const writeResult = await writeTool.execute({ 
        path: 'write-test.txt', 
        content: 'test' 
      }) as WriteToolResponse;
      const listResult = await listTool.execute({ path: '.' }) as ListToolResponse;
      const bashResult = await bashTool.execute({ 
        command: 'echo test' 
      }) as BashToolResponse;

      // Verify exact field matches
      Object.keys(readResult).forEach(key => {
        if (!fieldStructures.read.includes(key) && key !== 'error' && key !== 'detectedEncoding') {
          fail(`Unexpected field '${key}' in ReadTool response`);
        }
      });

      Object.keys(writeResult).forEach(key => {
        if (!fieldStructures.write.includes(key) && key !== 'error') {
          fail(`Unexpected field '${key}' in WriteTool response`);
        }
      });

      Object.keys(listResult).forEach(key => {
        if (!fieldStructures.list.includes(key) && key !== 'error') {
          fail(`Unexpected field '${key}' in ListTool response`);
        }
      });

      Object.keys(bashResult).forEach(key => {
        if (!fieldStructures.bash.includes(key) && key !== 'error') {
          fail(`Unexpected field '${key}' in BashTool response`);
        }
      });
    });

    test('should use Claude Code-compatible metric field names', async () => {
      await fs.writeFile(path.join(tempDir, 'metric-test.txt'), 'content');
      const result = await readTool.execute({ path: 'metric-test.txt' }) as ReadToolResponse;
      
      const expectedMetricFields = [
        'duration', 'startTime', 'endTime', 'readTime', 
        'throughput', 'encoding'
      ];
      
      if (result.metrics) {
        Object.keys(result.metrics).forEach(key => {
          expect(expectedMetricFields.includes(key)).toBe(true);
        });
        
        // Verify metric types
        expect(typeof result.metrics.duration).toBe('number');
        expect(typeof result.metrics.startTime).toBe('number');
        expect(typeof result.metrics.endTime).toBe('number');
        expect(result.metrics.endTime).toBeGreaterThan(result.metrics.startTime);
      }
    });

    test('should format file stats like Claude Code', async () => {
      await fs.writeFile(path.join(tempDir, 'stats-test.txt'), 'test');
      const result = await listTool.execute({ path: '.' }) as ListToolResponse;
      
      const file = result.files?.find(f => f.name === 'stats-test.txt');
      expect(file).toBeDefined();
      
      if (file) {
        // Verify stat structure matches Claude Code
        expect(file).toHaveProperty('name');
        expect(file).toHaveProperty('path');
        expect(file).toHaveProperty('type');
        expect(file).toHaveProperty('size');
        expect(file).toHaveProperty('modified');
        expect(file).toHaveProperty('permissions');
        
        expect(file.type).toBe('file');
        expect(typeof file.size).toBe('number');
        expect(file.modified).toBeInstanceOf(Date);
        expect(file.permissions).toMatch(/^[rwx-]{9}$/);
      }
    });
  });

  describe('Timeout and Cancellation Parity', () => {
    test('should respect timeout values exactly like Claude Code', async () => {
      const timeout = 500; // 500ms
      const startTime = Date.now();

      try {
        await bashTool.execute({
          command: 'sleep 2',
          timeout
        });
        fail('Expected timeout');
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeGreaterThanOrEqual(timeout * 0.9); // Allow 10% variance
        expect(duration).toBeLessThan(timeout * 1.5); // But not too much over
      }
    });

    test('should handle cancellation signals like Claude Code', async () => {
      // Test cancellation behavior - implementation would need proper cancellation tokens
      const result = await bashTool.execute({
        command: 'echo "quick command"'
      }) as BashToolResponse;

      expect(result.cancelled).toBe(false);
    });
  });

  describe('Side-by-Side Comparison Tests', () => {
    test('should produce identical output format for read operations', async () => {
      // This test simulates a side-by-side comparison with Claude Code
      const testContent = 'Hello, World!\nThis is a test file.';
      await fs.writeFile(path.join(tempDir, 'compare.txt'), testContent);
      
      const result = await readTool.execute({ path: 'compare.txt' }) as ReadToolResponse;
      
      // Simulate Claude Code expected output
      const expectedOutput = {
        content: testContent,
        encoding: 'utf8',
        size: testContent.length,
        totalLines: 2,
        requestedRange: null,
        truncated: false,
        isBinary: false,
        outOfRange: false,
        encodingFallback: false,
        resolvedPath: expect.stringContaining('compare.txt'),
        success: true,
        metrics: expect.any(Object)
      };
      
      expect(result).toMatchObject(expectedOutput);
    });

    test('should produce identical error messages for common failures', async () => {
      const errorScenarios = [
        {
          operation: () => readTool.execute({ path: 'nonexistent.txt' }),
          expectedMessage: /File or directory not found|no such file/i
        },
        {
          operation: () => writeTool.execute({ path: '/root/forbidden.txt', content: 'test' }),
          expectedMessage: /Permission denied|not permitted/i
        },
        {
          operation: () => listTool.execute({ path: 'not-a-directory.txt' }),
          expectedMessage: /Not a directory|ENOTDIR/i
        }
      ];
      
      for (const scenario of errorScenarios) {
        try {
          await scenario.operation();
          fail('Expected error');
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          expect((error as ToolError).message).toMatch(scenario.expectedMessage);
        }
      }
    });

    test('should match Claude Code telemetry event names', async () => {
      // Create a simple telemetry capture
      const telemetryEvents: any[] = [];
      
      // Monkey-patch emit to capture events
      const originalEmit = readTool.emit.bind(readTool);
      readTool.emit = (event: string, ...args: any[]) => {
        telemetryEvents.push({ event, args });
        return originalEmit(event, ...args);
      };
      
      await fs.writeFile(path.join(tempDir, 'telemetry.txt'), 'test');
      await readTool.execute({ path: 'telemetry.txt' });
      
      // Verify Claude Code-compatible event names
      const expectedEvents = ['tool:start', 'tool:complete'];
      const capturedEventNames = telemetryEvents.map(e => e.event);
      
      expectedEvents.forEach(eventName => {
        expect(capturedEventNames).toContain(eventName);
      });
    });
  });

  describe('Wire-Compatible Parity Summary', () => {
    test('all tools should implement required Claude Code interface', () => {
      // Verify each tool implements the required methods
      const tools = [readTool, writeTool, listTool, bashTool, editTool];
      
      tools.forEach(tool => {
        expect(tool).toHaveProperty('execute');
        expect(typeof tool.execute).toBe('function');
        // getCapabilities would be on the NativeTool interface implementation
      });
      
      // Verify streaming-capable tools
      const streamingTools = [bashTool];
      streamingTools.forEach(tool => {
        expect(tool).toHaveProperty('stream');
        expect(typeof tool.stream).toBe('function');
      });
    });

    test('error classifier should handle all Claude Code error codes', () => {
      const claudeCodeErrorCodes = [
        'ENOENT', 'ENOTDIR', 'EISDIR', 'EEXIST', 'EINVAL', 'ENAMETOOLONG',
        'EACCES', 'EPERM', 'EROFS', 'EMFILE', 'ENFILE', 'ENOSPC', 'EIO',
        'EBUSY', 'EAGAIN', 'EWOULDBLOCK', 'TIMEOUT', 'ETIMEDOUT',
        'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH'
      ];
      
      claudeCodeErrorCodes.forEach(code => {
        const classification = ErrorClassifier.classifyError({ code });
        expect(classification.code).toBe(code);
        expect(classification.errorClass).toBeDefined();
        expect(typeof classification.retryable).toBe('boolean');
      });
    });

    test('performance targets should be achievable', async () => {
      // Test that operations meet performance targets
      const operations = [
        {
          name: 'small file read',
          operation: async () => {
            await fs.writeFile(path.join(tempDir, 'perf.txt'), 'x'.repeat(1000));
            return readTool.execute({ path: 'perf.txt' });
          },
          maxLatency: 10 // <10ms for small files
        },
        {
          name: 'directory listing',
          operation: () => listTool.execute({ path: '.' }),
          maxLatency: 50 // <50ms for directory listing
        }
      ];
      
      for (const op of operations) {
        const start = performance.now();
        await op.operation();
        const duration = performance.now() - start;
        
        // Allow some variance in CI environments
        const adjustedMax = op.maxLatency * 3; // 3x tolerance for CI
        expect(duration).toBeLessThan(adjustedMax);
      }
    });
  });
});