/**
 * Tests for Directory Tools - Native implementation
 * Comprehensive test coverage for Mkdir, Rmdir, Delete, Move/Rename operations
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { MkdirTool, DeleteTool, MoveTool } from '../directory-tools.js';
import { ToolError, ErrorClass } from '../types.js';

describe('Directory Tools', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plato-dir-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      try {
        // Try fs.rm (Node.js 14.14.0+)
        await (typeof (fs as any).rm === "function" ? (fs as any).rm : fs.rmdir)(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Fallback cleanup method
        try {
          await (typeof (fs as any).rm === "function" ? (fs as any).rm : fs.rmdir)(tempDir, { recursive: true });
        } catch (fallbackError) {
          // Last resort - try rimraf-like manual deletion
          console.warn('Failed to clean up temp directory:', tempDir);
        }
      }
    }
  });

  describe('MkdirTool', () => {
    let mkdirTool: MkdirTool;

    beforeEach(() => {
      mkdirTool = new MkdirTool(tempDir);
    });

    it('should create single directory', async () => {
      const dirPath = path.join(tempDir, 'new-dir');
      
      const result = await mkdirTool.execute({
        path: dirPath
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(result.path).toBe(dirPath);

      // Verify directory was created
      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories recursively', async () => {
      const dirPath = path.join(tempDir, 'nested', 'deep', 'directory');
      
      const result = await mkdirTool.execute({
        path: dirPath,
        recursive: true
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);

      // Verify all directories were created
      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);

      const parentStats = await fs.stat(path.join(tempDir, 'nested'));
      expect(parentStats.isDirectory()).toBe(true);
    });

    it('should fail to create nested directories without recursive flag', async () => {
      const dirPath = path.join(tempDir, 'nested', 'deep', 'directory');
      
      await expect(mkdirTool.execute({
        path: dirPath,
        recursive: false
      })).rejects.toMatchObject({
        class: ErrorClass.PERMANENT,
        code: 'ENOENT'
      });
    });

    it('should handle existing directory gracefully', async () => {
      const dirPath = path.join(tempDir, 'existing');
      await fs.mkdir(dirPath);

      const result = await mkdirTool.execute({
        path: dirPath
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(false);
      expect(result.path).toBe(dirPath);
    });

    it('should set directory permissions when specified', async () => {
      if (process.platform !== 'win32') {
        const dirPath = path.join(tempDir, 'with-perms');
        
        const result = await mkdirTool.execute({
          path: dirPath,
          permissions: 0o750
        });

        expect(result.success).toBe(true);
        expect(result.created).toBe(true);

        const stats = await fs.stat(dirPath);
        expect(stats.mode & 0o777).toBe(0o750);
      }
    });

    it('should reject path traversal attempts', async () => {
      await expect(mkdirTool.execute({
        path: '../../../malicious'
      })).rejects.toMatchObject({
        class: ErrorClass.PERMISSION,
        code: 'PATH_TRAVERSAL'
      });
    });

    it('should handle permission errors gracefully', async () => {
      if (process.platform !== 'win32') {
        // Create a read-only parent directory
        const parentDir = path.join(tempDir, 'readonly-parent');
        await fs.mkdir(parentDir);
        await fs.chmod(parentDir, 0o555);

        await expect(mkdirTool.execute({
          path: path.join(parentDir, 'child'),
          recursive: true
        })).rejects.toMatchObject({
          class: ErrorClass.PERMISSION,
          code: 'EACCES'
        });

        // Restore permissions for cleanup
        await fs.chmod(parentDir, 0o755);
      }
    });

    it('should emit telemetry events', async () => {
      const telemetryEvents: any[] = [];
      mkdirTool.on('telemetry', (event) => telemetryEvents.push(event));

      await mkdirTool.execute({
        path: path.join(tempDir, 'telemetry-dir'),
        recursive: true
      });

      expect(telemetryEvents).toHaveLength(1);
      expect(telemetryEvents[0]).toMatchObject({
        tool: 'mkdir',
        success: true,
        duration: expect.any(Number)
      });
    });
  });

  describe('DeleteTool', () => {
    let deleteTool: DeleteTool;

    beforeEach(() => {
      deleteTool = new DeleteTool(tempDir);
    });

    beforeEach(async () => {
      // Create test files and directories
      const testStructure = {
        'file1.txt': 'Content 1',
        'file2.txt': 'Content 2',
        'subdir/nested.txt': 'Nested content',
        'subdir/script.js': 'console.log("test");',
        'emptydir/.gitkeep': ''
      };

      for (const [filePath, content] of Object.entries(testStructure)) {
        const fullPath = path.join(tempDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        if (content || path.basename(filePath) === '.gitkeep') {
          await fs.writeFile(fullPath, content);
        }
      }
    });

    it('should delete single file', async () => {
      const filePath = path.join(tempDir, 'file1.txt');
      
      const result = await deleteTool.execute({
        path: filePath
      });

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);
      expect(result.itemsAffected).toBe(1);

      // Verify file was deleted
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('should delete empty directory', async () => {
      const dirPath = path.join(tempDir, 'emptydir');
      // Remove the .gitkeep file to make it truly empty
      await fs.unlink(path.join(dirPath, '.gitkeep'));
      
      const result = await deleteTool.execute({
        path: dirPath
      });

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);

      // Verify directory was deleted
      await expect(fs.access(dirPath)).rejects.toThrow();
    });

    it('should fail to delete non-empty directory without recursive flag', async () => {
      const dirPath = path.join(tempDir, 'subdir');
      
      await expect(deleteTool.execute({
        path: dirPath,
        recursive: false
      })).rejects.toMatchObject({
        class: ErrorClass.VALIDATION,
        code: 'DIRECTORY_NOT_EMPTY'
      });
    });

    it('should delete directory recursively', async () => {
      const dirPath = path.join(tempDir, 'subdir');
      
      const result = await deleteTool.execute({
        path: dirPath,
        recursive: true
      });

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);
      expect(result.itemsAffected).toBeGreaterThan(1);

      // Verify directory and contents were deleted
      await expect(fs.access(dirPath)).rejects.toThrow();
    });

    it('should require confirmation for dangerous operations', async () => {
      const result = await deleteTool.execute({
        path: tempDir, // Trying to delete entire temp directory
        recursive: true,
        confirm: false // No confirmation provided
      });

      // Should fail without confirmation
      expect(result.success).toBe(false);
      
      // Directory should still exist
      const stats = await fs.stat(tempDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should proceed with confirmation', async () => {
      const testDir = path.join(tempDir, 'to-delete');
      await fs.mkdir(testDir);
      await fs.writeFile(path.join(testDir, 'file.txt'), 'test');
      
      const result = await deleteTool.execute({
        path: testDir,
        recursive: true,
        confirm: true
      });

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);

      // Verify deletion
      await expect(fs.access(testDir)).rejects.toThrow();
    });

    it('should handle non-existent files with force flag', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.txt');
      
      const result = await deleteTool.execute({
        path: nonExistentPath,
        force: true
      });

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(false);
    });

    it('should fail on non-existent files without force flag', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.txt');
      
      await expect(deleteTool.execute({
        path: nonExistentPath,
        force: false
      })).rejects.toMatchObject({
        class: ErrorClass.PERMANENT,
        code: 'ENOENT'
      });
    });

    it('should handle permission errors gracefully', async () => {
      if (process.platform !== 'win32') {
        const protectedFile = path.join(tempDir, 'protected.txt');
        await fs.writeFile(protectedFile, 'protected content');
        await fs.chmod(protectedFile, 0o000); // No permissions

        await expect(deleteTool.execute({
          path: protectedFile
        })).rejects.toMatchObject({
          class: ErrorClass.PERMISSION,
          code: 'EACCES'
        });
      }
    });

    it('should provide progress for large deletions', async () => {
      // Create many files to delete
      const manyFilesDir = path.join(tempDir, 'many-files');
      await fs.mkdir(manyFilesDir);

      const promises = Array.from({ length: 100 }, (_, i) => 
        fs.writeFile(path.join(manyFilesDir, `file${i}.txt`), `Content ${i}`)
      );
      await Promise.all(promises);

      const events: any[] = [];
      const stream = deleteTool.stream!({
        path: manyFilesDir,
        recursive: true,
        confirm: true
      });

      for await (const event of stream) {
        events.push(event);
        if (event.type === 'complete') break;
      }

      expect(events.length).toBeGreaterThan(1);
      expect(events.some(e => e.type === 'progress')).toBe(true);
      expect(events[events.length - 1].type).toBe('complete');
    });
  });

  describe('MoveTool', () => {
    let moveTool: MoveTool;

    beforeEach(() => {
      moveTool = new MoveTool(tempDir);
    });

    beforeEach(async () => {
      // Create test files and directories
      await fs.writeFile(path.join(tempDir, 'source.txt'), 'Source content');
      await fs.writeFile(path.join(tempDir, 'existing.txt'), 'Existing content');
      await fs.mkdir(path.join(tempDir, 'sourcedir'));
      await fs.writeFile(path.join(tempDir, 'sourcedir', 'nested.txt'), 'Nested content');
      await fs.mkdir(path.join(tempDir, 'targetdir'));
    });

    it('should move file to new location', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'destination.txt');
      
      const result = await moveTool.execute({
        source: sourcePath,
        destination: destPath
      });

      expect(result.success).toBe(true);
      expect(result.moved).toBe(true);

      // Verify source is gone and destination exists
      await expect(fs.access(sourcePath)).rejects.toThrow();
      const content = await fs.readFile(destPath, 'utf8');
      expect(content).toBe('Source content');
    });

    it('should rename file in same directory', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'renamed.txt');
      
      const result = await moveTool.execute({
        source: sourcePath,
        destination: destPath
      });

      expect(result.success).toBe(true);
      expect(result.moved).toBe(true);

      // Verify rename
      await expect(fs.access(sourcePath)).rejects.toThrow();
      const content = await fs.readFile(destPath, 'utf8');
      expect(content).toBe('Source content');
    });

    it('should move directory', async () => {
      const sourcePath = path.join(tempDir, 'sourcedir');
      const destPath = path.join(tempDir, 'destdir');
      
      const result = await moveTool.execute({
        source: sourcePath,
        destination: destPath
      });

      expect(result.success).toBe(true);
      expect(result.moved).toBe(true);

      // Verify directory move
      await expect(fs.access(sourcePath)).rejects.toThrow();
      const stats = await fs.stat(destPath);
      expect(stats.isDirectory()).toBe(true);

      const nestedContent = await fs.readFile(path.join(destPath, 'nested.txt'), 'utf8');
      expect(nestedContent).toBe('Nested content');
    });

    it('should fail when destination exists without overwrite flag', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'existing.txt');
      
      await expect(moveTool.execute({
        source: sourcePath,
        destination: destPath,
        overwrite: false
      })).rejects.toMatchObject({
        class: ErrorClass.VALIDATION,
        code: 'DESTINATION_EXISTS'
      });
    });

    it('should overwrite destination when flag is set', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'existing.txt');
      
      const result = await moveTool.execute({
        source: sourcePath,
        destination: destPath,
        overwrite: true
      });

      expect(result.success).toBe(true);
      expect(result.moved).toBe(true);

      // Verify overwrite
      const content = await fs.readFile(destPath, 'utf8');
      expect(content).toBe('Source content');
    });

    it('should preserve metadata when requested', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'destination.txt');
      
      // Set specific modification time
      const testTime = new Date('2023-01-01T00:00:00Z');
      try {
        await fs.utimes(sourcePath, testTime, testTime);
      } catch (error) {
        // Skip this part of the test if utimes is not available
        console.warn('fs.utimes not available, skipping metadata test');
      }
      
      const result = await moveTool.execute({
        source: sourcePath,
        destination: destPath
      });

      expect(result.success).toBe(true);
      expect(result.moved).toBe(true);

      if (process.platform !== 'win32') {
        const stats = await fs.stat(destPath);
        expect(Math.abs(stats.mtime.getTime() - testTime.getTime())).toBeLessThan(1000);
      }
    });

    it('should handle cross-device moves', async () => {
      // This is difficult to test without multiple devices, so we simulate
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'cross-device.txt');
      
      // Mock a cross-device error on first attempt
      const originalRename = fs.rename;
      let renameCallCount = 0;
      
      jest.spyOn(fs, 'rename').mockImplementation(async (oldPath, newPath) => {
        renameCallCount++;
        if (renameCallCount === 1) {
          const error = new Error('Invalid cross-device link') as any;
          error.code = 'EXDEV';
          throw error;
        }
        return originalRename.call(fs, oldPath, newPath);
      });

      const result = await moveTool.execute({
        source: sourcePath,
        destination: destPath
      });

      expect(result.success).toBe(true);
      expect(result.moved).toBe(true);

      (fs.rename as jest.Mock).mockRestore();
    });

    it('should handle permission errors', async () => {
      if (process.platform !== 'win32') {
        const sourcePath = path.join(tempDir, 'source.txt');
        const destDir = path.join(tempDir, 'readonly-dest');
        await fs.mkdir(destDir);
        await fs.chmod(destDir, 0o555); // Read-only

        const destPath = path.join(destDir, 'dest.txt');

        await expect(moveTool.execute({
          source: sourcePath,
          destination: destPath
        })).rejects.toMatchObject({
          class: ErrorClass.PERMISSION,
          code: 'EACCES'
        });

        // Restore permissions for cleanup
        await fs.chmod(destDir, 0o755);
      }
    });

    it('should emit telemetry events', async () => {
      const telemetryEvents: any[] = [];
      moveTool.on('telemetry', (event) => telemetryEvents.push(event));

      await moveTool.execute({
        source: path.join(tempDir, 'source.txt'),
        destination: path.join(tempDir, 'moved.txt')
      });

      expect(telemetryEvents).toHaveLength(1);
      expect(telemetryEvents[0]).toMatchObject({
        tool: 'move',
        success: true,
        duration: expect.any(Number)
      });
    });
  });
});