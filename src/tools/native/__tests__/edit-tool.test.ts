/**
 * Tests for Edit Tool - Native implementation
 * Comprehensive test coverage for file editing with pattern matching and diff generation
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { EditTool } from '../edit-tool.js';
import { ToolError, ErrorClass } from '../types.js';

describe('EditTool', () => {
  let editTool: EditTool;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plato-edit-test-'));
    editTool = new EditTool(tempDir);

    // Create test files with various content patterns
    const testFiles = {
      'simple.txt': 'Hello, World!\nThis is line 2\nLine 3 with data\nFinal line',
      'code.js': `function greet(name) {\n  console.log("Hello, " + name);\n  return name;\n}\n\ngreet("World");`,
      'config.json': '{\n  "name": "test",\n  "version": "1.0.0",\n  "debug": true\n}',
      'multiline.txt': 'First paragraph\nwith multiple lines\n\nSecond paragraph\nwith more content\n\nThird paragraph'
    };

    for (const [filename, content] of Object.entries(testFiles)) {
      await fs.writeFile(path.join(tempDir, filename), content);
    }
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rmdir(tempDir, { recursive: true });
    }
  });

  describe('Line-based Editing', () => {
    it('should replace single line by line number', async () => {
      const filePath = 'simple.txt';
      
      const result = await editTool.execute({
        path: filePath,
        lineNumber: 2,
        replacement: 'This is the updated line 2'
      });

      expect(result.success).toBe(true);
      expect(result.changes).toBe(1);
      expect(result.linesModified).toEqual([2]);

      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      const lines = content.split('\n');
      expect(lines[1]).toBe('This is the updated line 2');
    });

    it('should replace multiple lines by range', async () => {
      const filePath = 'simple.txt';
      
      const result = await editTool.execute({
        path: filePath,
        startLine: 2,
        endLine: 3,
        replacement: 'Combined line 2 and 3'
      });

      expect(result.success).toBe(true);
      expect(result.changes).toBe(1);
      expect(result.linesModified).toEqual([2, 3]);

      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      const lines = content.split('\n');
      expect(lines[1]).toBe('Combined line 2 and 3');
      expect(lines).toHaveLength(3); // Original 4 lines, replaced 2 with 1
    });

    it('should insert new lines', async () => {
      const filePath = 'simple.txt';
      
      const result = await editTool.execute({
        path: filePath,
        insertAfterLine: 2,
        replacement: 'New inserted line'
      });

      expect(result.success).toBe(true);
      expect(result.changes).toBe(1);
      expect(result.linesAdded).toBe(1);

      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      const lines = content.split('\n');
      expect(lines[2]).toBe('New inserted line');
      expect(lines).toHaveLength(5); // Original 4 + 1 inserted
    });

    it('should delete lines', async () => {
      const filePath = 'simple.txt';
      
      const result = await editTool.execute({
        path: filePath,
        startLine: 2,
        endLine: 3,
        delete: true
      });

      expect(result.success).toBe(true);
      expect(result.changes).toBe(1);
      expect(result.linesDeleted).toBe(2);

      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      const lines = content.split('\n');
      expect(lines).toHaveLength(2); // Original 4 - 2 deleted
      expect(lines[1]).toBe('Final line');
    });

    it('should handle out-of-range line numbers gracefully', async () => {
      const filePath = 'simple.txt';
      
      await expect(editTool.execute({
        path: filePath,
        lineNumber: 10,
        replacement: 'Out of range'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'LINE_OUT_OF_RANGE'
      });
    });
  });

  describe('Pattern-based Editing', () => {
    it('should replace first occurrence of string pattern', async () => {
      const filePath = 'simple.txt';
      
      const result = await editTool.execute({
        path: filePath,
        pattern: 'line',
        replacement: 'row',
        replaceFirst: true
      });

      expect(result.success).toBe(true);
      expect(result.changes).toBe(1);
      expect(result.matchCount).toBe(1);

      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(content).toContain('This is row 2'); // First 'line' replaced
      expect(content).toContain('Line 3'); // Second 'line' unchanged
    });

    it('should replace all occurrences of string pattern', async () => {
      const filePath = 'simple.txt';
      
      const result = await editTool.execute({
        path: filePath,
        pattern: 'line',
        replacement: 'row',
        replaceAll: true,
        caseInsensitive: true
      });

      expect(result.success).toBe(true);
      expect(result.changes).toBeGreaterThan(1);
      expect(result.matchCount).toBeGreaterThan(1);

      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(content).toContain('This is row 2');
      expect(content).toContain('row 3 with data');
      expect(content).toContain('Final row');
    });

    it('should support regular expressions', async () => {
      const filePath = 'code.js';
      
      const result = await editTool.execute({
        path: filePath,
        pattern: /console\.log\("([^"]+)"\)/,
        replacement: 'console.warn("$1")',
        regex: true
      });

      expect(result.success).toBe(true);
      expect(result.changes).toBe(1);

      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(content).toContain('console.warn("Hello, " + name)');
    });

    it('should support capture groups in replacements', async () => {
      const filePath = 'config.json';
      
      const result = await editTool.execute({
        path: filePath,
        pattern: /"version": "([^"]+)"/,
        replacement: '"version": "$1-beta"',
        regex: true
      });

      expect(result.success).toBe(true);
      expect(result.changes).toBe(1);

      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(content).toContain('"version": "1.0.0-beta"');
    });

    it('should handle complex multiline patterns', async () => {
      const filePath = 'multiline.txt';
      
      const result = await editTool.execute({
        path: filePath,
        pattern: /Second paragraph\nwith more content/,
        replacement: 'Modified second paragraph\nwith updated content',
        regex: true,
        multiline: true
      });

      expect(result.success).toBe(true);
      expect(result.changes).toBe(1);

      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(content).toContain('Modified second paragraph\nwith updated content');
    });
  });

  describe('Diff Generation', () => {
    it('should generate unified diff for changes', async () => {
      const filePath = 'simple.txt';
      
      const result = await editTool.execute({
        path: filePath,
        lineNumber: 2,
        replacement: 'This is the updated line 2',
        generateDiff: true
      });

      expect(result.success).toBe(true);
      expect(result.diff).toBeDefined();
      expect(result.diff).toContain('@@');
      expect(result.diff).toContain('-This is line 2');
      expect(result.diff).toContain('+This is the updated line 2');
    });

    it('should include context lines in diff', async () => {
      const filePath = 'simple.txt';
      
      const result = await editTool.execute({
        path: filePath,
        lineNumber: 2,
        replacement: 'Updated line',
        generateDiff: true,
        contextLines: 2
      });

      expect(result.success).toBe(true);
      expect(result.diff).toContain('Hello, World!'); // Context before
      expect(result.diff).toContain('Line 3 with data'); // Context after
    });

    it('should generate diff for multiple changes', async () => {
      const filePath = 'simple.txt';
      
      const result = await editTool.execute({
        path: filePath,
        pattern: 'line',
        replacement: 'row',
        replaceAll: true,
        caseInsensitive: true,
        generateDiff: true
      });

      expect(result.success).toBe(true);
      expect(result.diff).toBeDefined();
      expect(result.diff?.split('@@')).toHaveLength(3); // Header + 2 change hunks
    });

    it('should handle binary files in diff generation', async () => {
      const binaryPath = 'binary.dat';
      const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
      await fs.writeFile(path.join(tempDir, binaryPath), binaryData);

      const result = await editTool.execute({
        path: binaryPath,
        pattern: Buffer.from([0x50, 0x4E]),
        replacement: Buffer.from([0x58, 0x59]),
        binary: true,
        generateDiff: true
      });

      expect(result.success).toBe(true);
      expect(result.diff).toContain('Binary files differ');
    });
  });

  describe('Conflict Detection', () => {
    it('should detect concurrent modifications', async () => {
      const filePath = 'concurrent.txt';
      const originalContent = 'Original content\nLine 2\nLine 3';
      await fs.writeFile(path.join(tempDir, filePath), originalContent);

      // Simulate concurrent modification by changing file between reads
      const originalReadFile = fs.readFile;
      let readCount = 0;
      jest.spyOn(fs, 'readFile').mockImplementation(async (path: any, options?: any) => {
        if (readCount === 0 && path.toString().includes('concurrent.txt')) {
          readCount++;
          return originalContent;
        }
        if (readCount === 1 && path.toString().includes('concurrent.txt')) {
          // Simulate file change by another process
          await originalReadFile.call(fs, filePath, 'utf8').then(content => 
            fs.writeFile(filePath.replace('concurrent.txt', 'concurrent.txt.bak'), content)
          );
          await fs.writeFile(path as string, 'Modified by someone else\nLine 2\nLine 3');
          return originalReadFile.call(fs, path, options);
        }
        return originalReadFile.call(fs, path, options);
      });

      await expect(editTool.execute({
        path: filePath,
        lineNumber: 1,
        replacement: 'My modification',
        detectConflicts: true
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'CONCURRENT_MODIFICATION'
      });

      (fs.readFile as jest.Mock).mockRestore();
    });

    it('should handle merge conflicts gracefully', async () => {
      const filePath = 'merge-conflict.txt';
      const conflictContent = `Line 1
<<<<<<< HEAD
My change
=======
Their change
>>>>>>> branch
Line 4`;

      await fs.writeFile(path.join(tempDir, filePath), conflictContent);

      await expect(editTool.execute({
        path: filePath,
        pattern: 'Line 1',
        replacement: 'Updated Line 1'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'MERGE_CONFLICT_DETECTED'
      });
    });
  });

  describe('Atomic Operations and Backup', () => {
    it('should perform atomic edits with backup', async () => {
      const filePath = 'atomic.txt';
      const originalContent = 'Original content for atomic edit';
      await fs.writeFile(path.join(tempDir, filePath), originalContent);

      const result = await editTool.execute({
        path: filePath,
        pattern: 'Original',
        replacement: 'Updated',
        atomic: true,
        backup: true
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();

      // Verify new content
      const newContent = await fs.readFile(filePath, 'utf8');
      expect(newContent).toBe('Updated content for atomic edit');

      // Verify backup
      if (result.backupPath) {
        const backupContent = await fs.readFile(result.backupPath, 'utf8');
        expect(backupContent).toBe(originalContent);
      }
    });

    it('should rollback on atomic edit failure', async () => {
      const filePath = 'atomic-fail.txt';
      const originalContent = 'Original content';
      await fs.writeFile(path.join(tempDir, filePath), originalContent);

      // Mock a failure during write
      const originalWriteFile = fs.writeFile;
      jest.spyOn(fs, 'writeFile').mockImplementationOnce(async (path: any, data: any) => {
        if (path.toString().includes('atomic-fail.txt') && !path.toString().includes('.tmp')) {
          throw new Error('Simulated write failure');
        }
        return originalWriteFile.call(fs, path, data);
      });

      await expect(editTool.execute({
        path: filePath,
        pattern: 'Original',
        replacement: 'Updated',
        atomic: true
      })).rejects.toThrow();

      // Verify original content is preserved
      const content = await fs.readFile(path.join(tempDir, filePath), 'utf8');
      expect(content).toBe(originalContent);

      (fs.writeFile as jest.Mock).mockRestore();
    });
  });

  describe('Performance and Large Files', () => {
    it('should handle large files efficiently', async () => {
      const largePath = 'large.txt';
      const largeContent = Array.from({ length: 10000 }, (_, i) => `Line ${i + 1}`).join('\n');
      await fs.writeFile(path.join(tempDir, largePath), largeContent);

      const start = Date.now();
      const result = await editTool.execute({
        path: largePath,
        pattern: 'Line 5000',
        replacement: 'Modified Line 5000'
      });
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.changes).toBe(1);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should stream progress for large edit operations', async () => {
      const largePath = 'stream-large.txt';
      const largeContent = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1} with pattern`).join('\n');
      await fs.writeFile(path.join(tempDir, largePath), largeContent);

      const events: any[] = [];
      const stream = editTool.stream({
        path: largePath,
        pattern: 'pattern',
        replacement: 'updated',
        replaceAll: true
      });

      for await (const event of stream) {
        events.push(event);
        if (events.length > 10) break; // Don't collect all events
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'progress')).toBe(true);
    });

    it('should respect memory limits for large files', async () => {
      // Create a file larger than memory limit
      const hugePath = 'huge.txt';
      // Simulate by mocking file size check
      jest.spyOn(fs, 'stat').mockResolvedValueOnce({
        size: 200 * 1024 * 1024, // 200MB
        isFile: () => true
      } as any);

      await expect(editTool.execute({
        path: hugePath,
        pattern: 'test',
        replacement: 'updated'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'FILE_TOO_LARGE'
      });

      (fs.stat as jest.Mock).mockRestore();
    });
  });

  describe('Security and Validation', () => {
    it('should validate file paths', async () => {
      await expect(editTool.execute({
        path: '../../../etc/passwd',
        pattern: 'test',
        replacement: 'malicious'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMISSION,
        code: 'PATH_TRAVERSAL'
      });
    });

    it('should handle permission errors gracefully', async () => {
      const restrictedPath = 'readonly.txt';
      await fs.writeFile(path.join(tempDir, restrictedPath), 'readonly content');
      
      if (process.platform !== 'win32') {
        await fs.chmod(path.join(tempDir, restrictedPath), 0o444); // Read-only

        await expect(editTool.execute({
          path: restrictedPath,
          pattern: 'readonly',
          replacement: 'modified'
        })).rejects.toMatchObject({
          errorClass: ErrorClass.PERMISSION,
          code: 'EACCES'
        });
      }
    });

    it('should validate pattern syntax for regex', async () => {
      const filePath = 'simple.txt';
      
      await expect(editTool.execute({
        path: filePath,
        pattern: '[invalid-regex',
        replacement: 'test',
        regex: true
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'INVALID_REGEX'
      });
    });
  });

  describe('Telemetry and Monitoring', () => {
    it('should emit telemetry events', async () => {
      const telemetryEvents: any[] = [];
      editTool.on('telemetry', (event) => telemetryEvents.push(event));

      await editTool.execute({
        path: 'simple.txt',
        pattern: 'line',
        replacement: 'row'
      });

      expect(telemetryEvents).toHaveLength(1);
      expect(telemetryEvents[0]).toMatchObject({
        tool: 'edit',
        success: true,
        duration: expect.any(Number),
        changes: expect.any(Number)
      });
    });

    it('should track detailed edit metrics', async () => {
      const result = await editTool.execute({
        path: 'simple.txt',
        pattern: 'line',
        replacement: 'row',
        replaceAll: true,
        caseInsensitive: true,
        generateDiff: true
      });

      expect(result.metrics).toMatchObject({
        patternMatches: expect.any(Number),
        bytesChanged: expect.any(Number),
        processingTime: expect.any(Number),
        diffGenerationTime: expect.any(Number)
      });
    });
  });
});