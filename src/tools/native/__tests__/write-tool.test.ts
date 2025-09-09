/**
 * Tests for Write Tool - Native implementation
 * Comprehensive test coverage for file writing with atomic operations and directory creation
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { WriteTool } from '../write-tool.js';
import { ToolError, ErrorClass } from '../types.js';

describe('WriteTool', () => {
  let writeTool: WriteTool;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), 'test-temp-write-'));
    writeTool = new WriteTool(tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rmdir(tempDir, { recursive: true });
    }
  });

  describe('Basic File Writing', () => {
    it('should write UTF-8 text file correctly', async () => {
      const content = 'Hello, World!\nThis is a test file\nWith multiple lines';
      const filePath = 'test.txt';

      const result = await writeTool.execute({
        path: filePath,
        content: content
      });

      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBe(Buffer.byteLength(content, 'utf8'));
      expect(result.encoding).toBe('utf8');

      // Verify file was written correctly
      const writtenContent = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(writtenContent).toBe(content);
    });

    it('should write empty file correctly', async () => {
      const filePath = 'empty.txt';

      const result = await writeTool.execute({
        path: filePath,
        content: ''
      });

      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBe(0);

      const stats = await fs.stat(path.join(tempDir, filePath));
      expect(stats.size).toBe(0);
    });

    it('should handle unicode content correctly', async () => {
      const content = 'Unicode test: 🚀 📁 🔧 ✅ 中文 العربية';
      const filePath = 'unicode.txt';

      const result = await writeTool.execute({
        path: filePath,
        content: content
      });

      expect(result.success).toBe(true);
      
      const writtenContent = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(writtenContent).toBe(content);
    });

    it('should overwrite existing files by default', async () => {
      const filePath = 'overwrite.txt';
      const originalContent = 'Original content';
      const newContent = 'New content';

      // Write original content
      await fs.writeFile(path.join(tempDir, filePath), originalContent);

      // Overwrite with new content
      const result = await writeTool.execute({
        path: filePath,
        content: newContent
      });

      expect(result.success).toBe(true);
      expect(result.overwritten).toBe(true);

      const writtenContent = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(writtenContent).toBe(newContent);
    });
  });

  describe('Atomic Write Operations', () => {
    it('should perform atomic writes with backup', async () => {
      const filePath = 'atomic.txt';
      const originalContent = 'Original atomic content';
      const newContent = 'New atomic content';

      // Create original file
      await fs.writeFile(path.join(tempDir, filePath), originalContent);

      const result = await writeTool.execute({
        path: filePath,
        content: newContent,
        atomic: true,
        backup: true
      });

      expect(result.success).toBe(true);
      expect(result.atomic).toBe(true);
      expect(result.backupPath).toBeDefined();

      // Verify new content
      const writtenContent = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(writtenContent).toBe(newContent);

      // Verify backup exists
      if (result.backupPath) {
        const backupContent = await fs.readFile(result.backupPath, 'utf8');
        expect(backupContent).toBe(originalContent);
      }
    });

    it('should handle atomic write failures gracefully', async () => {
      const filePath = 'atomic-fail.txt';
      const originalContent = 'Original content';

      // Create original file
      await fs.writeFile(path.join(tempDir, filePath), originalContent);

      // Mock a failure scenario by making the directory read-only (skip on Windows)
      if (process.platform !== 'win32') {
        await fs.chmod(tempDir, 0o555); // Read and execute only

        await expect(writeTool.execute({
          path: filePath,
          content: 'New content',
          atomic: true
        })).rejects.toMatchObject({
          errorClass: ErrorClass.PERMISSION
        });

        // Verify original file is unchanged
        const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
        expect(content).toBe(originalContent);

        // Restore permissions for cleanup
        await fs.chmod(tempDir, 0o755);
      }
    });

    it('should clean up temporary files on successful atomic write', async () => {
      const filePath = 'atomic-cleanup.txt';
      const content = 'Atomic write with cleanup';

      const result = await writeTool.execute({
        path: filePath,
        content: content,
        atomic: true
      });

      expect(result.success).toBe(true);
      expect(result.tempPath).toBeDefined();

      // Verify temp file was cleaned up
      if (result.tempPath) {
        await expect(fs.access(result.tempPath)).rejects.toThrow();
      }
    });
  });

  describe('Directory Creation', () => {
    it('should create parent directories automatically', async () => {
      const filePath = path.join('nested', 'deep', 'directory', 'file.txt');
      const content = 'File in nested directory';

      const result = await writeTool.execute({
        path: filePath,
        content: content,
        createDirs: true
      });

      expect(result.success).toBe(true);
      expect(result.dirsCreated).toEqual([
        path.join(tempDir, 'nested'),
        path.join(tempDir, 'nested', 'deep'),
        path.join(tempDir, 'nested', 'deep', 'directory')
      ]);

      // Verify file exists
      const writtenContent = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(writtenContent).toBe(content);
    });

    it('should handle existing directories correctly', async () => {
      const nestedDir = path.join(tempDir, 'existing', 'nested');
      const filePath = path.join('existing', 'nested', 'file.txt');
      
      // Pre-create some directories
      await fs.mkdir(path.join(tempDir, 'existing'), { recursive: true });

      const result = await writeTool.execute({
        path: filePath,
        content: 'Content in existing dir structure',
        createDirs: true
      });

      expect(result.success).toBe(true);
      expect(result.dirsCreated).toEqual([nestedDir]);
    });

    it('should fail when directories cannot be created', async () => {
      const filePath = path.join('readonly', 'file.txt');
      
      // Create readonly directory (skip on Windows)
      if (process.platform !== 'win32') {
        await fs.mkdir(path.join(tempDir, 'readonly'));
        await fs.chmod(path.join(tempDir, 'readonly'), 0o555);

        await expect(writeTool.execute({
          path: path.join(filePath, 'nested', 'file.txt'),
          content: 'Should fail',
          createDirs: true
        })).rejects.toMatchObject({
          errorClass: ErrorClass.PERMISSION
        });
      }
    });
  });

  describe('Encoding Support', () => {
    it('should write with specified encoding', async () => {
      const content = 'Café with açaí';
      const filePath = 'latin1.txt';

      const result = await writeTool.execute({
        path: filePath,
        content: content,
        encoding: 'latin1'
      });

      expect(result.success).toBe(true);
      expect(result.encoding).toBe('latin1');

      // Verify encoding by reading with Node.js
      const buffer = await fs.readFile(filePath);
      const decodedContent = buffer.toString('latin1');
      expect(decodedContent).toBe(content);
    });

    it('should handle binary data correctly', async () => {
      const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const filePath = 'binary.png';

      const result = await writeTool.execute({
        path: filePath,
        content: binaryData.toString('base64'),
        encoding: 'base64'
      });

      expect(result.success).toBe(true);
      expect(result.encoding).toBe('base64');
      expect(result.isBinary).toBe(true);

      const writtenData = await fs.readFile(filePath);
      expect(writtenData).toEqual(binaryData);
    });
  });

  describe('Permission Preservation', () => {
    it('should preserve existing file permissions', async () => {
      const filePath = path.join(tempDir, 'perms.txt');
      
      // Create file with specific permissions (skip on Windows)
      if (process.platform !== 'win32') {
        await fs.writeFile(path.join(tempDir, filePath), 'original');
        await fs.chmod(path.join(tempDir, filePath), 0o644);

        const originalStats = await fs.stat(path.join(tempDir, filePath));
        
        const result = await writeTool.execute({
          path: filePath,
          content: 'updated content',
          preservePermissions: true
        });

        expect(result.success).toBe(true);

        const newStats = await fs.stat(path.join(tempDir, filePath));
        expect(newStats.mode).toBe(originalStats.mode);
      }
    });

    it('should apply specified permissions to new files', async () => {
      const filePath = path.join(tempDir, 'new-perms.txt');

      const result = await writeTool.execute({
        path: filePath,
        content: 'content with perms',
        permissions: 0o755
      });

      expect(result.success).toBe(true);

      if (process.platform !== 'win32') {
        const stats = await fs.stat(path.join(tempDir, filePath));
        expect(stats.mode & 0o777).toBe(0o755);
      }
    });
  });

  describe('Size Limits and Validation', () => {
    it('should enforce file size limits', async () => {
      const largeContent = 'X'.repeat(51 * 1024 * 1024); // 51MB
      const filePath = path.join(tempDir, 'too-large.txt');

      await expect(writeTool.execute({
        path: filePath,
        content: largeContent
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'FILE_TOO_LARGE',
        retryable: false
      });
    });

    it('should validate path parameters', async () => {
      await expect(writeTool.execute({
        path: '',
        content: 'content'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'INVALID_PATH'
      });

      await expect(writeTool.execute({
        path: '../../../etc/shadow',
        content: 'malicious'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMISSION,
        code: 'PATH_TRAVERSAL'
      });
    });
  });

  describe('Streaming and Performance', () => {
    it('should provide streaming support for large writes', async () => {
      const largeContent = 'A'.repeat(1024 * 1024); // 1MB
      const filePath = path.join(tempDir, 'large-stream.txt');
      const events: any[] = [];

      const stream = writeTool.stream({
        path: filePath,
        content: largeContent
      });

      for await (const event of stream) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'progress')).toBe(true);
      expect(events[events.length - 1]).toMatchObject({
        type: 'complete',
        success: true
      });
    });

    it('should handle concurrent writes to different files', async () => {
      const writes = Array.from({ length: 5 }, (_, i) => 
        writeTool.execute({
          path: path.join(tempDir, `concurrent-${i}.txt`),
          content: `Content for file ${i}`
        })
      );

      const results = await Promise.all(writes);
      
      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.bytesWritten).toBe(Buffer.byteLength(`Content for file ${i}`));
      });
    });

    it('should handle write conflicts appropriately', async () => {
      const filePath = path.join(tempDir, 'conflict.txt');
      
      // Start two concurrent writes to the same file
      const writes = [
        writeTool.execute({
          path: filePath,
          content: 'Content A',
          atomic: true
        }),
        writeTool.execute({
          path: filePath,
          content: 'Content B',
          atomic: true
        })
      ];

      const results = await Promise.all(writes);
      
      // Both should succeed due to atomic writes
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);

      // Final content should be one of them
      const finalContent = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(['Content A', 'Content B']).toContain(finalContent);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle disk full scenarios gracefully', async () => {
      // This is difficult to test without root access, so we mock it
      const originalWriteFile = fs.writeFile;
      const mockError = Object.assign(new Error('No space left on device'), {
        code: 'ENOSPC'
      });

      jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(mockError);

      await expect(writeTool.execute({
        path: 'disk-full.txt',
        content: 'This should fail'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.TRANSIENT,
        code: 'ENOSPC',
        retryable: true
      });

      // Restore original
      (fs.writeFile as jest.Mock).mockRestore();
    });

    it('should provide detailed error information', async () => {
      const error = await writeTool.execute({
        path: path.join('/nonexistent/path', 'file.txt'),
        content: 'content',
        createDirs: false
      }).catch(e => e);

      expect(error).toBeInstanceOf(ToolError);
      expect(error).toMatchObject({
        errorClass: ErrorClass.PERMANENT,
        code: 'ENOENT',
        message: expect.stringContaining('No such file or directory'),
        retryable: false,
        details: expect.objectContaining({
          path: expect.any(String)
        })
      });
    });
  });

  describe('Telemetry and Monitoring', () => {
    it('should emit telemetry events', async () => {
      const telemetryEvents: any[] = [];
      writeTool.on('telemetry', (event) => telemetryEvents.push(event));

      const content = 'Telemetry test content';
      await writeTool.execute({
        path: path.join(tempDir, 'telemetry.txt'),
        content: content
      });

      expect(telemetryEvents).toHaveLength(1);
      expect(telemetryEvents[0]).toMatchObject({
        tool: 'write',
        success: true,
        duration: expect.any(Number),
        bytesWritten: Buffer.byteLength(content)
      });
    });

    it('should track performance metrics', async () => {
      const content = 'Performance test content';
      const result = await writeTool.execute({
        path: path.join(tempDir, 'perf.txt'),
        content: content
      });

      expect(result.metrics).toMatchObject({
        writeTime: expect.any(Number),
        throughput: expect.any(Number),
        encoding: 'utf8'
      });
    });
  });
});