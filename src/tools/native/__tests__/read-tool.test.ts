/**
 * Tests for Read Tool - Native implementation
 * Comprehensive test coverage for file reading with encoding detection and line ranges
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ReadTool } from '../read-tool.js';
import { ToolError, ErrorClass } from '../types.js';

describe('ReadTool', () => {
  let readTool: ReadTool;
  let tempDir: string;
  let testFiles: Map<string, string>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), 'test-temp-'));
    readTool = new ReadTool(tempDir);
    testFiles = new Map();

    // Create test files with different encodings and content types
    const utf8Content = 'Hello, World!\nThis is line 2\nLine 3 with unicode: 🚀\nLine 4';
    const binaryContent = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header
    const largeContent = 'A'.repeat(1000000); // 1MB file
    const emptyContent = '';

    testFiles.set('utf8.txt', utf8Content);
    testFiles.set('empty.txt', emptyContent);
    testFiles.set('large.txt', largeContent);

    // Write test files
    for (const [filename, content] of testFiles.entries()) {
      if (filename === 'binary.png') {
        await fs.writeFile(path.join(tempDir, filename), binaryContent);
      } else {
        await fs.writeFile(path.join(tempDir, filename), content, 'utf8');
      }
    }

    // Create binary file separately
    await fs.writeFile(path.join(tempDir, 'binary.png'), binaryContent);
  });

  afterEach(async () => {
    if (tempDir) {
      await (typeof (fs as any).rm === "function" ? (fs as any).rm : fs.rmdir)(tempDir, { recursive: true });
    }
  });

  describe('Basic File Reading', () => {
    it('should read UTF-8 text file correctly', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'utf8.txt')
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe(testFiles.get('utf8.txt'));
      expect(result.encoding).toBe('utf8');
      expect(result.size).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    });

    it('should read empty file correctly', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'empty.txt')
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
      expect(result.size).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('should detect binary files and handle appropriately', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'binary.png')
      });

      expect(result.success).toBe(true);
      expect(result.encoding).toBe('binary');
      expect(result.isBinary).toBe(true);
      expect(result.size).toBeGreaterThan(0);
    });

    it('should handle non-existent files with proper error', async () => {
      await expect(readTool.execute({
        path: path.join(tempDir, 'nonexistent.txt')
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMANENT,
        code: 'ENOENT',
        retryable: false
      });
    });

    it('should enforce file size limits', async () => {
      // Test with file exceeding limit (if configured)
      const hugePath = path.join(tempDir, 'huge.txt');
      const hugeContent = 'X'.repeat(101 * 1024 * 1024); // 101MB
      await fs.writeFile(hugePath, hugeContent);

      await expect(readTool.execute({
        path: hugePath
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'FILE_TOO_LARGE',
        retryable: false
      });
    });
  });

  describe('Line Range Reading', () => {
    it('should read specific line range', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'utf8.txt'),
        startLine: 2,
        endLine: 3
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('This is line 2\nLine 3 with unicode: 🚀');
      expect(result.totalLines).toBe(4);
      expect(result.requestedRange).toEqual({ start: 2, end: 3 });
    });

    it('should handle single line reading', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'utf8.txt'),
        startLine: 1,
        endLine: 1
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello, World!');
      expect(result.totalLines).toBe(4);
    });

    it('should handle out-of-range line numbers gracefully', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'utf8.txt'),
        startLine: 10,
        endLine: 20
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
      expect(result.totalLines).toBe(4);
      expect(result.outOfRange).toBe(true);
    });

    it('should validate line range parameters', async () => {
      await expect(readTool.execute({
        path: path.join(tempDir, 'utf8.txt'),
        startLine: 0,
        endLine: 1
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'INVALID_LINE_RANGE'
      });

      await expect(readTool.execute({
        path: path.join(tempDir, 'utf8.txt'),
        startLine: 3,
        endLine: 2
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'INVALID_LINE_RANGE'
      });
    });
  });

  describe('Encoding Detection', () => {
    beforeEach(async () => {
      // Create files with different encodings
      const latinContent = Buffer.from('Café with açaí', 'latin1');
      const utf16Content = Buffer.from('UTF-16 content 🌟', 'utf16le');
      
      await fs.writeFile(path.join(tempDir, 'latin1.txt'), latinContent);
      await fs.writeFile(path.join(tempDir, 'utf16.txt'), utf16Content);
    });

    it('should detect UTF-8 encoding correctly', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'utf8.txt')
      });

      expect(result.encoding).toBe('utf8');
      expect(result.detectedEncoding).toBe('utf8');
    });

    it('should handle explicit encoding parameter', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'latin1.txt'),
        encoding: 'latin1'
      });

      expect(result.success).toBe(true);
      expect(result.encoding).toBe('latin1');
      expect(result.content).toContain('Café');
    });

    it('should fallback to UTF-8 when encoding detection fails', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'binary.png'),
        forceText: true
      });

      expect(result.success).toBe(true);
      expect(result.encoding).toBe('utf8');
      expect(result.encodingFallback).toBe(true);
    });
  });

  describe('Performance and Streaming', () => {
    it('should handle large files efficiently', async () => {
      const start = Date.now();
      const result = await readTool.execute({
        path: path.join(tempDir, 'large.txt')
      });
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.size).toBe(1000000);
      expect(duration).toBeLessThan(1000); // Should read 1MB in < 1 second
    });

    it('should provide streaming support for large files', async () => {
      const events: any[] = [];
      const stream = readTool.stream({
        path: path.join(tempDir, 'large.txt')
      });

      for await (const event of stream) {
        events.push(event);
        if (events.length > 10) break; // Don't collect all events
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({
        type: 'metadata',
        data: expect.objectContaining({
          tool: 'read',
          path: expect.any(String)
        })
      });
      expect(events[1]).toMatchObject({
        type: 'progress',
        bytesRead: expect.any(Number)
      });
    });
  });

  describe('Security and Path Validation', () => {
    it('should reject path traversal attempts', async () => {
      await expect(readTool.execute({
        path: '../../../etc/passwd'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMISSION,
        code: 'PATH_TRAVERSAL'
      });
    });

    it('should reject absolute paths outside workspace', async () => {
      await expect(readTool.execute({
        path: '/etc/passwd'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMISSION,
        code: 'PATH_TRAVERSAL'
      });
    });

    it('should handle symlink resolution properly', async () => {
      const targetFile = path.join(tempDir, 'target.txt');
      const symlinkFile = path.join(tempDir, 'symlink.txt');
      
      await fs.writeFile(targetFile, 'symlink target content');
      await fs.symlink(targetFile, symlinkFile);

      const result = await readTool.execute({
        path: symlinkFile
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('symlink target content');
      expect(result.resolvedPath).toBe(targetFile);
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should handle permission errors correctly', async () => {
      // Create file with no read permissions (skip on Windows)
      if (process.platform !== 'win32') {
        const noPermFile = path.join(tempDir, 'noperm.txt');
        await fs.writeFile(noPermFile, 'no permission');
        await fs.chmod(noPermFile, 0o000);

        await expect(readTool.execute({
          path: noPermFile
        })).rejects.toMatchObject({
          errorClass: ErrorClass.PERMISSION,
          code: 'EACCES',
          retryable: false
        });
      }
    });

    it('should classify errors correctly for retry logic', async () => {
      // Test transient vs permanent errors
      const error = await readTool.execute({
        path: path.join(tempDir, 'nonexistent.txt')
      }).catch(e => e);

      expect(error).toMatchObject({
        errorClass: ErrorClass.PERMANENT,
        retryable: false
      });
    });

    it('should include retry timing for transient errors', async () => {
      // Mock a transient error scenario
      const mockError = new ToolError(
        ErrorClass.TRANSIENT,
        'EAGAIN',
        'Resource temporarily unavailable',
        undefined, 100
      );

      expect(mockError.retryable).toBe(true);
      expect(mockError.retryAfter).toBe(100);
    });
  });

  describe('Telemetry and Monitoring', () => {
    it('should emit telemetry events', async () => {
      const telemetryEvents: any[] = [];
      readTool.on('telemetry', (event) => telemetryEvents.push(event));

      await readTool.execute({
        path: path.join(tempDir, 'utf8.txt')
      });

      expect(telemetryEvents).toHaveLength(1);
      expect(telemetryEvents[0]).toMatchObject({
        tool: 'read',
        success: true,
        duration: expect.any(Number),
        bytesRead: expect.any(Number)
      });
    });

    it('should track performance metrics', async () => {
      const result = await readTool.execute({
        path: path.join(tempDir, 'large.txt')
      });

      expect(result.metrics).toMatchObject({
        readTime: expect.any(Number),
        throughput: expect.any(Number),
        encoding: 'utf8'
      });
    });
  });
});
