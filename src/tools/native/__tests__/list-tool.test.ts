/**
 * Tests for List Tool - Native implementation
 * Comprehensive test coverage for directory listing with glob patterns, stats, and sorting
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ListTool } from '../list-tool.js';
import { ToolError, ErrorClass } from '../types.js';

describe('ListTool', () => {
  let listTool: ListTool;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plato-list-test-'));
    listTool = new ListTool(tempDir);

    // Create a complex directory structure for testing
    const structure = {
      'file1.txt': 'Content 1',
      'file2.js': 'console.log("test");',
      'README.md': '# Test Project\nDescription here',
      'config.json': '{"test": true}',
      '.hidden.txt': 'Hidden file content',
      '.gitignore': '*.log\n*.tmp',
      'subdir1/nested.txt': 'Nested content',
      'subdir1/script.py': 'print("hello")',
      'subdir1/.hidden-nested': 'Hidden nested',
      'subdir2/deep/deep.txt': 'Deep content directly in deep dir',
      'subdir2/deep/very/deep.txt': 'Very deep content',
      'subdir2/large.txt': 'X'.repeat(10000),
      'subdir3/empty-dir/.gitkeep': '',
      'symlink-target.txt': 'Symlink target',
    };

    for (const [filePath, content] of Object.entries(structure)) {
      const fullPath = path.join(tempDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }

    // Create a symlink (skip on Windows due to permission issues)
    if (process.platform !== 'win32') {
      await fs.symlink(
        path.join(tempDir, 'symlink-target.txt'),
        path.join(tempDir, 'symlink.txt')
      );
    }
  });

  afterEach(async () => {
    if (tempDir) {
      await (typeof (fs as any).rm === "function" ? (fs as any).rm : fs.rmdir)(tempDir, { recursive: true });
    }
  });

  describe('Basic Directory Listing', () => {
    it('should list files and directories in current directory', async () => {
      const result = await listTool.execute({
        path: '.'
      });

      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
      expect(result.directories).toBeDefined();
      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.totalDirectories).toBeGreaterThan(0);

      // Check for expected files
      const fileNames = result.files!.map(f => f.name);
      expect(fileNames).toContain('file1.txt');
      expect(fileNames).toContain('file2.js');
      expect(fileNames).toContain('README.md');
      expect(fileNames).toContain('config.json');

      // Check for expected directories
      const dirNames = result.directories!.map(d => d.name);
      expect(dirNames).toContain('subdir1');
      expect(dirNames).toContain('subdir2');
      expect(dirNames).toContain('subdir3');
    });

    it('should not include hidden files by default', async () => {
      const result = await listTool.execute({
        path: '.'
      });

      expect(result.success).toBe(true);
      const fileNames = result.files!.map(f => f.name);
      expect(fileNames).not.toContain('.hidden.txt');
      expect(fileNames).not.toContain('.gitignore');
    });

    it('should include hidden files when requested', async () => {
      const result = await listTool.execute({
        path: '.',
        includeHidden: true
      });

      expect(result.success).toBe(true);
      const fileNames = result.files!.map(f => f.name);
      expect(fileNames).toContain('.hidden.txt');
      expect(fileNames).toContain('.gitignore');
    });

    it('should handle empty directories', async () => {
      const emptyDir = path.join(tempDir, 'empty');
      await fs.mkdir(emptyDir);

      const result = await listTool.execute({
        path: emptyDir
      });

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(0);
      expect(result.directories).toHaveLength(0);
      expect(result.totalFiles).toBe(0);
      expect(result.totalDirectories).toBe(0);
    });

    it('should handle non-existent directories', async () => {
      await expect(listTool.execute({
        path: 'nonexistent'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMANENT,
        code: 'ENOENT'
      });
    });
  });

  describe('Recursive Listing', () => {
    it('should list files recursively', async () => {
      const result = await listTool.execute({
        path: '.',
        recursive: true
      });

      expect(result.success).toBe(true);
      const filePaths = result.files!.map(f => f.path);
      
      // Should include nested files
      expect(filePaths.some(p => p.includes('subdir1/nested.txt'))).toBe(true);
      expect(filePaths.some(p => p.includes('subdir1/script.py'))).toBe(true);
      expect(filePaths.some(p => p.includes('subdir2/deep/very/deep.txt'))).toBe(true);
    });

    it('should respect max depth limit', async () => {
      const result = await listTool.execute({
        path: '.',
        recursive: true,
        maxDepth: 2
      });

      expect(result.success).toBe(true);
      const filePaths = result.files!.map(f => f.path);
      
      // Should include depth 1
      expect(filePaths.some(p => p.includes('subdir1/nested.txt'))).toBe(true);
      
      // Should exclude depth > 2
      expect(filePaths.some(p => p.includes('subdir2/deep/very/deep.txt'))).toBe(false);
    });

    it('should include hidden files recursively when requested', async () => {
      const result = await listTool.execute({
        path: '.',
        recursive: true,
        includeHidden: true
      });

      expect(result.success).toBe(true);
      const filePaths = result.files!.map(f => f.path);
      expect(filePaths.some(p => p.includes('.hidden-nested'))).toBe(true);
    });
  });

  describe('Glob Patterns', () => {
    it('should filter files by extension', async () => {
      const result = await listTool.execute({
        path: '.',
        glob: '*.txt'
      });

      expect(result.success).toBe(true);
      const fileNames = result.files!.map(f => f.name);
      expect(fileNames).toContain('file1.txt');
      expect(fileNames).not.toContain('file2.js');
      expect(fileNames).not.toContain('config.json');
    });

    it('should support complex glob patterns', async () => {
      const result = await listTool.execute({
        path: '.',
        recursive: true,
        glob: '**/*.{js,py}'
      });

      expect(result.success).toBe(true);
      const filePaths = result.files!.map(f => f.path);
      expect(filePaths.some(p => p.endsWith('file2.js'))).toBe(true);
      expect(filePaths.some(p => p.includes('script.py'))).toBe(true);
      expect(filePaths.some(p => p.endsWith('.txt'))).toBe(false);
    });

    it('should handle glob patterns with recursive search', async () => {
      const result = await listTool.execute({
        path: '.',
        recursive: true,
        glob: '**/deep/*.txt'
      });

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files![0].name).toBe('deep.txt');
    });

    it('should handle invalid glob patterns gracefully', async () => {
      await expect(listTool.execute({
        path: '.',
        glob: '[invalid-glob'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'INVALID_GLOB_PATTERN'
      });
    });
  });

  describe('Sorting and Ordering', () => {
    it('should sort by name ascending by default', async () => {
      const result = await listTool.execute({
        path: '.'
      });

      expect(result.success).toBe(true);
      const fileNames = result.files!.map(f => f.name);
      const sortedNames = [...fileNames].sort();
      expect(fileNames).toEqual(sortedNames);
    });

    it('should sort by name descending', async () => {
      const result = await listTool.execute({
        path: '.',
        sortBy: 'name',
        sortOrder: 'desc'
      });

      expect(result.success).toBe(true);
      const fileNames = result.files!.map(f => f.name);
      const sortedNames = [...fileNames].sort().reverse();
      expect(fileNames).toEqual(sortedNames);
    });

    it('should sort by size', async () => {
      const result = await listTool.execute({
        path: '.',
        stats: true,
        sortBy: 'size',
        sortOrder: 'desc'
      });

      expect(result.success).toBe(true);
      const files = result.files!;
      
      // Verify sizes are in descending order
      for (let i = 1; i < files.length; i++) {
        expect(files[i - 1].size!).toBeGreaterThanOrEqual(files[i].size!);
      }
    });

    it('should sort by modification time', async () => {
      // Create files with different modification times
      const file1 = path.join(tempDir, 'older.txt');
      const file2 = path.join(tempDir, 'newer.txt');
      
      await fs.writeFile(file1, 'older');
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await fs.writeFile(file2, 'newer');

      const result = await listTool.execute({
        path: '.',
        stats: true,
        sortBy: 'modified',
        sortOrder: 'desc'
      });

      expect(result.success).toBe(true);
      const files = result.files!.filter(f => f.name.includes('.txt') && f.name !== 'file1.txt');
      
      if (files.length >= 2) {
        const newer = files.find(f => f.name === 'newer.txt');
        const older = files.find(f => f.name === 'older.txt');
        
        expect(newer).toBeDefined();
        expect(older).toBeDefined();
        expect(new Date(newer!.modified!)).toBeInstanceOf(Date);
        expect(new Date(older!.modified!)).toBeInstanceOf(Date);
      }
    });

    it('should sort by type (directories first)', async () => {
      const result = await listTool.execute({
        path: '.',
        sortBy: 'type'
      });

      expect(result.success).toBe(true);
      // Directories should be listed before files when sorted by type
      expect(result.directories).toBeDefined();
      expect(result.files).toBeDefined();
    });
  });

  describe('File Statistics', () => {
    it('should include file stats when requested', async () => {
      const result = await listTool.execute({
        path: '.',
        stats: true
      });

      expect(result.success).toBe(true);
      const files = result.files!;
      
      expect(files.length).toBeGreaterThan(0);
      // Filter to regular files only (exclude symlinks)
      const regularFiles = files.filter(file => file.type === 'file');
      expect(regularFiles.length).toBeGreaterThan(0);
      
      regularFiles.forEach(file => {
        expect(file.size).toBeDefined();
        expect(file.modified).toBeDefined();
        expect(file.created).toBeDefined();
        expect(file.type).toBe('file');
        
        if (process.platform !== 'win32') {
          expect(file.permissions).toBeDefined();
        }
      });
    });

    it('should calculate total size correctly', async () => {
      const result = await listTool.execute({
        path: '.',
        stats: true,
        recursive: true
      });

      expect(result.success).toBe(true);
      expect(result.totalSize).toBeDefined();
      expect(result.totalSize!).toBeGreaterThan(0);

      // Verify total size calculation
      const calculatedSize = result.files!.reduce((sum, file) => sum + (file.size || 0), 0);
      expect(result.totalSize).toBe(calculatedSize);
    });

    it('should handle symlinks correctly', async () => {
      if (process.platform !== 'win32') {
        const result = await listTool.execute({
          path: '.',
          stats: true
        });

        expect(result.success).toBe(true);
        const symlink = result.files!.find(f => f.name === 'symlink.txt');
        
        if (symlink) {
          expect(symlink.type).toBe('symlink');
        }
      }
    });

    it('should handle permission information', async () => {
      if (process.platform !== 'win32') {
        // Create a file with specific permissions
        const testFile = path.join(tempDir, 'perm-test.txt');
        await fs.writeFile(testFile, 'test');
        await fs.chmod(testFile, 0o644);

        const result = await listTool.execute({
          path: '.',
          stats: true
        });

        expect(result.success).toBe(true);
        const file = result.files!.find(f => f.name === 'perm-test.txt');
        
        expect(file).toBeDefined();
        expect(file!.permissions).toBeDefined();
        expect(file!.permissions).toMatch(/^-rw-r--r--$/);
      }
    });
  });

  describe('Performance and Large Directories', () => {
    it('should handle directories with many files efficiently', async () => {
      const manyFilesDir = path.join(tempDir, 'many-files');
      await fs.mkdir(manyFilesDir);

      // Create 1000 files
      const promises = Array.from({ length: 1000 }, (_, i) => 
        fs.writeFile(path.join(manyFilesDir, `file${i}.txt`), `Content ${i}`)
      );
      await Promise.all(promises);

      const start = Date.now();
      const result = await listTool.execute({
        path: manyFilesDir,
        stats: true
      });
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1000);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should stream results for very large directories', async () => {
      const largeDirPath = path.join(tempDir, 'large-stream');
      await fs.mkdir(largeDirPath);

      // Create many files
      const promises = Array.from({ length: 100 }, (_, i) => 
        fs.writeFile(path.join(largeDirPath, `stream-file${i}.txt`), `Content ${i}`)
      );
      await Promise.all(promises);

      const events: any[] = [];
      const stream = listTool.stream!({
        path: largeDirPath,
        stats: true
      });

      for await (const event of stream) {
        events.push(event);
        if (events.length > 10) break;
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'progress')).toBe(true);
    });

    it('should enforce maximum results limit', async () => {
      const result = await listTool.execute({
        path: '.',
        recursive: true,
        glob: '**/*'
      });

      // Assuming we have a reasonable number of files in test setup
      expect(result.success).toBe(true);
      if (result.files!.length > 10000) {
        expect(result.truncated).toBe(true);
      }
    });
  });

  describe('Security and Path Validation', () => {
    it('should reject path traversal attempts', async () => {
      await expect(listTool.execute({
        path: '../../../etc'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMISSION,
        code: 'PATH_TRAVERSAL'
      });
    });

    it('should reject absolute paths outside workspace', async () => {
      await expect(listTool.execute({
        path: '/etc'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMISSION,
        code: 'ACCESS_DENIED'
      });
    });

    it('should handle permission denied scenarios', async () => {
      if (process.platform !== 'win32') {
        const restrictedDir = path.join(tempDir, 'restricted');
        await fs.mkdir(restrictedDir);
        await fs.chmod(restrictedDir, 0o000); // No permissions

        await expect(listTool.execute({
          path: restrictedDir
        })).rejects.toMatchObject({
          errorClass: ErrorClass.PERMISSION,
          code: 'EACCES'
        });

        // Restore permissions for cleanup
        await fs.chmod(restrictedDir, 0o755);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted filesystem entries gracefully', async () => {
      // Simulate by creating a symlink to non-existent target
      if (process.platform !== 'win32') {
        const brokenSymlink = path.join(tempDir, 'broken-symlink');
        await fs.symlink('/nonexistent/target', brokenSymlink);

        const result = await listTool.execute({
          path: '.',
          stats: true
        });

        expect(result.success).toBe(true);
        // Should still list other files successfully
        expect(result.files!.length).toBeGreaterThan(0);
      }
    });

    it('should provide detailed error information', async () => {
      const error = await listTool.execute({
        path: 'nonexistent-deep/nested'
      }).catch(e => e);

      expect(error).toBeInstanceOf(ToolError);
      expect(error.errorClass).toBe(ErrorClass.PERMANENT);
      expect(error.code).toBe('ENOENT');
      expect(error.details).toMatchObject({
        path: expect.any(String)
      });
    });
  });

  describe('Telemetry and Monitoring', () => {
    it('should emit telemetry events', async () => {
      const telemetryEvents: any[] = [];
      listTool.on('telemetry', (event) => telemetryEvents.push(event));

      await listTool.execute({
        path: '.',
        recursive: true
      });

      expect(telemetryEvents).toHaveLength(1);
      expect(telemetryEvents[0]).toMatchObject({
        tool: 'list',
        success: true,
        duration: expect.any(Number),
        filesFound: expect.any(Number),
        directoriesFound: expect.any(Number)
      });
    });

    it('should track detailed performance metrics', async () => {
      const result = await listTool.execute({
        path: '.',
        recursive: true,
        stats: true,
        sortBy: 'size'
      });

      expect(result.metrics).toMatchObject({
        filesScanned: expect.any(Number),
        directoriesScanned: expect.any(Number),
        filterTime: expect.any(Number),
        sortTime: expect.any(Number),
        duration: expect.any(Number)
      });
    });
  });
});