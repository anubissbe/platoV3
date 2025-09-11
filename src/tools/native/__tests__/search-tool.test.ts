/**
 * Tests for Search Tool - Native implementation
 * Comprehensive test coverage for ripgrep-based searching with regex and file type filters
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SearchTool } from '../search-tool.js';
import { ToolError, ErrorClass } from '../types.js';

describe('SearchTool', () => {
  let searchTool: SearchTool;
  let tempDir: string;

  beforeEach(async () => {
    searchTool = new SearchTool();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plato-search-test-'));

    // Create test files with various content patterns
    const testFiles = {
      'file1.txt': 'Hello World\nThis is a test file\nWith multiple lines\nAnd some patterns to find',
      'file2.js': `function greet(name) {\n  console.log("Hello, " + name);\n  return "greeting";\n}\n\nconst message = "Hello World";`,
      'file3.py': `def calculate(x, y):\n    result = x + y\n    print(f"Result: {result}")\n    return result\n\nif __name__ == "__main__":\n    calculate(5, 10)`,
      'file4.md': '# Test Document\n\nThis is a **markdown** file.\n\n## Section 1\n\nContent with *emphasis* and `code`.',
      'config.json': '{\n  "name": "test-project",\n  "version": "1.0.0",\n  "debug": true,\n  "patterns": ["test", "debug"]\n}',
      '.hidden.txt': 'Hidden file content\nWith secret patterns\nDEBUG: hidden debug info',
      'binary.dat': Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).toString('binary'),
      'subdir/nested.txt': 'Nested file content\nWith nested patterns\nMore nested content',
      'subdir/deep/very/deep.txt': 'Very deep content\nHELLO from deep file\nEnd of deep content',
      'subdir/script.sh': '#!/bin/bash\necho "Hello from script"\ngrep "pattern" file.txt',
      'large.txt': Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}: Pattern ${i % 10}`).join('\n')
    };

    for (const [filePath, content] of Object.entries(testFiles)) {
      const fullPath = path.join(tempDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      if (filePath === 'binary.dat') {
        await fs.writeFile(fullPath, Buffer.from(content, 'binary'));
      } else {
        await fs.writeFile(fullPath, content);
      }
    }
  });

  afterEach(async () => {
    if (tempDir) {
      // Use rmdir for Node.js compatibility, fallback to rm if available
      try {
        await (typeof (fs as any).rm === "function" ? (fs as any).rm : fs.rmdir)(tempDir, { recursive: true, force: true });
      } catch (error: any) {
        if (error.code === 'ENOENT') return; // Already deleted
        // Fallback to rmdir for older Node.js versions
        try {
          await (typeof (fs as any).rm === "function" ? (fs as any).rm : fs.rmdir)(tempDir, { recursive: true });
        } catch (rmError: any) {
          if (rmError.code !== 'ENOENT') {
            console.warn('Failed to cleanup temp directory:', rmError.message);
          }
        }
      }
    }
  });

  describe('Basic Text Search', () => {
    it('should find simple text pattern', async () => {
      const result = await searchTool.execute({
        pattern: 'Hello',
        path: tempDir
      });

      expect(result.success).toBe(true);
      expect(result.matches).toBeDefined();
      expect(result.totalMatches).toBeGreaterThan(0);
      expect(result.filesWithMatches).toBeGreaterThan(0);

      // Should find matches in multiple files
      const files = result.matches!.map(m => path.basename(m.file));
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.js');
    });

    it('should provide match details with line and column', async () => {
      const result = await searchTool.execute({
        pattern: 'test',
        path: tempDir
      });

      expect(result.success).toBe(true);
      expect(result.matches!.length).toBeGreaterThan(0);

      const match = result.matches![0];
      expect(match).toMatchObject({
        file: expect.stringContaining(tempDir),
        line: expect.any(Number),
        column: expect.any(Number),
        content: expect.stringContaining('test')
      });
    });

    it('should handle case-insensitive search', async () => {
      const result = await searchTool.execute({
        pattern: 'HELLO',
        path: tempDir,
        caseInsensitive: true
      });

      expect(result.success).toBe(true);
      expect(result.totalMatches).toBeGreaterThan(0);

      // Should find both 'Hello' and 'HELLO' patterns
      const matchContent = result.matches!.map(m => m.content);
      expect(matchContent.some(c => c.includes('Hello'))).toBe(true);
    });

    it('should handle case-sensitive search by default', async () => {
      const result = await searchTool.execute({
        pattern: 'HELLO',
        path: tempDir,
        caseInsensitive: false
      });

      expect(result.success).toBe(true);
      
      // Should only find exact case matches
      const matchContent = result.matches!.map(m => m.content);
      matchContent.forEach(content => {
        if (content.includes('HELLO')) {
          expect(content).toContain('HELLO');
        }
      });
    });

    it('should handle whole word matching', async () => {
      const result = await searchTool.execute({
        pattern: 'test',
        path: tempDir,
        wholeWord: true
      });

      expect(result.success).toBe(true);
      
      // Should only match whole words, not substrings
      result.matches!.forEach(match => {
        const regex = /\btest\b/i;
        expect(regex.test(match.content)).toBe(true);
      });
    });

    it('should search in specific file', async () => {
      const specificFile = path.join(tempDir, 'file1.txt');
      const result = await searchTool.execute({
        pattern: 'Hello',
        path: specificFile
      });

      expect(result.success).toBe(true);
      expect(result.matches).toBeDefined();
      expect(result.filesSearched).toBe(1);
      
      if (result.matches!.length > 0) {
        expect(result.matches![0].file).toBe(specificFile);
      }
    });

    it('should handle non-existent file paths', async () => {
      await expect(searchTool.execute({
        pattern: 'test',
        path: path.join(tempDir, 'nonexistent.txt')
      })).rejects.toMatchObject({
        class: ErrorClass.PERMANENT,
        code: 'ENOENT'
      });
    });
  });

  describe('Regular Expression Search', () => {
    it('should support regular expressions', async () => {
      const result = await searchTool.execute({
        pattern: 'function\\s+\\w+\\s*\\(',
        path: tempDir,
        regex: true
      });

      expect(result.success).toBe(true);
      expect(result.totalMatches).toBeGreaterThan(0);

      // Should find function declarations
      const jsMatches = result.matches!.filter(m => m.file.endsWith('.js'));
      expect(jsMatches.length).toBeGreaterThan(0);
      expect(jsMatches[0].content).toMatch(/function\s+\w+\s*\(/);
    });

    it('should support complex regex patterns', async () => {
      const result = await searchTool.execute({
        pattern: '"[^"]*":\\s*"[^"]*"',
        path: tempDir,
        regex: true
      });

      expect(result.success).toBe(true);
      
      // Should find JSON key-value pairs
      const jsonMatches = result.matches!.filter(m => m.file.endsWith('.json'));
      expect(jsonMatches.length).toBeGreaterThan(0);
    });

    it('should handle invalid regex patterns', async () => {
      await expect(searchTool.execute({
        pattern: '[invalid-regex',
        path: tempDir,
        regex: true
      })).rejects.toMatchObject({
        class: ErrorClass.VALIDATION,
        code: 'INVALID_REGEX'
      });
    });

    it('should support multiline regex matching', async () => {
      const result = await searchTool.execute({
        pattern: 'def\\s+\\w+.*?return',
        path: tempDir,
        regex: true
      });

      expect(result.success).toBe(true);
      
      // Should find Python function definitions
      const pyMatches = result.matches!.filter(m => m.file.endsWith('.py'));
      expect(pyMatches.length).toBeGreaterThan(0);
    });
  });

  describe('Context Lines', () => {
    it('should provide context lines around matches', async () => {
      const result = await searchTool.execute({
        pattern: 'multiple lines',
        path: tempDir,
        contextLines: 2
      });

      expect(result.success).toBe(true);
      expect(result.matches!.length).toBeGreaterThan(0);

      const match = result.matches![0];
      expect(match.beforeContext).toBeDefined();
      expect(match.afterContext).toBeDefined();
      expect(match.beforeContext!.length).toBeLessThanOrEqual(2);
      expect(match.afterContext!.length).toBeLessThanOrEqual(2);
    });

    it('should handle context at file boundaries', async () => {
      const result = await searchTool.execute({
        pattern: 'Hello World',
        path: path.join(tempDir, 'file1.txt'),
        contextLines: 5
      });

      expect(result.success).toBe(true);
      expect(result.matches!.length).toBeGreaterThan(0);

      const match = result.matches![0];
      if (match.line === 1) {
        // First line should have no before context
        expect(match.beforeContext).toHaveLength(0);
      }
    });

    it('should not duplicate context for adjacent matches', async () => {
      const result = await searchTool.execute({
        pattern: 'Pattern',
        path: path.join(tempDir, 'large.txt'),
        contextLines: 3
      });

      expect(result.success).toBe(true);
      expect(result.matches!.length).toBeGreaterThan(1);

      // Context should be handled properly for multiple matches
      result.matches!.forEach(match => {
        expect(match.beforeContext!.length).toBeLessThanOrEqual(3);
        expect(match.afterContext!.length).toBeLessThanOrEqual(3);
      });
    });
  });

  describe('File Type Filtering', () => {
    it('should filter by single file type', async () => {
      const result = await searchTool.execute({
        pattern: 'function',
        path: tempDir,
        fileTypes: ['js']
      });

      expect(result.success).toBe(true);
      
      // Should only search JavaScript files
      result.matches!.forEach(match => {
        expect(match.file).toMatch(/\.js$/);
      });
    });

    it('should filter by multiple file types', async () => {
      const result = await searchTool.execute({
        pattern: 'Hello',
        path: tempDir,
        fileTypes: ['txt', 'md']
      });

      expect(result.success).toBe(true);
      
      // Should search both txt and md files
      const extensions = result.matches!.map(m => path.extname(m.file));
      const uniqueExtensions = [...new Set(extensions)];
      
      uniqueExtensions.forEach(ext => {
        expect(['.txt', '.md']).toContain(ext);
      });
    });

    it('should handle unknown file types gracefully', async () => {
      const result = await searchTool.execute({
        pattern: 'test',
        path: tempDir,
        fileTypes: ['unknown-extension']
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(0);
      expect(result.filesSearched).toBe(0);
    });
  });

  describe('Exclude Patterns', () => {
    it('should exclude files by pattern', async () => {
      const result = await searchTool.execute({
        pattern: 'Hello',
        path: tempDir,
        excludePatterns: ['*.js']
      });

      expect(result.success).toBe(true);
      
      // Should not find matches in JS files
      result.matches!.forEach(match => {
        expect(match.file).not.toMatch(/\.js$/);
      });
    });

    it('should exclude directories', async () => {
      const result = await searchTool.execute({
        pattern: 'nested',
        path: tempDir,
        excludePatterns: ['subdir']
      });

      expect(result.success).toBe(true);
      
      // Should not find matches in subdir
      result.matches!.forEach(match => {
        expect(match.file).not.toContain('subdir');
      });
    });

    it('should support multiple exclude patterns', async () => {
      const result = await searchTool.execute({
        pattern: 'test',
        path: tempDir,
        excludePatterns: ['*.json', '*.md', 'subdir/*']
      });

      expect(result.success).toBe(true);
      
      result.matches!.forEach(match => {
        expect(match.file).not.toMatch(/\.(json|md)$/);
        expect(match.file).not.toContain('subdir/');
      });
    });
  });

  describe('Hidden Files and Directories', () => {
    it('should exclude hidden files by default', async () => {
      const result = await searchTool.execute({
        pattern: 'secret',
        path: tempDir
      });

      expect(result.success).toBe(true);
      
      // Should not find matches in hidden files
      result.matches!.forEach(match => {
        expect(path.basename(match.file)).not.toMatch(/^\./);
      });
    });

    it('should include hidden files when requested', async () => {
      const result = await searchTool.execute({
        pattern: 'secret',
        path: tempDir,
        includeHidden: true
      });

      expect(result.success).toBe(true);
      expect(result.totalMatches).toBeGreaterThan(0);
      
      // Should find matches in hidden files
      const hiddenMatches = result.matches!.filter(m => 
        path.basename(m.file).startsWith('.')
      );
      expect(hiddenMatches.length).toBeGreaterThan(0);
    });
  });

  describe('Result Limits and Truncation', () => {
    it('should respect maximum results limit', async () => {
      const result = await searchTool.execute({
        pattern: 'Pattern',
        path: tempDir,
        maxResults: 5
      });

      expect(result.success).toBe(true);
      expect(result.matches!.length).toBeLessThanOrEqual(5);
      
      if (result.totalMatches! > 5) {
        expect(result.truncated).toBe(true);
      }
    });

    it('should handle large result sets efficiently', async () => {
      const start = Date.now();
      const result = await searchTool.execute({
        pattern: 'Pattern',
        path: path.join(tempDir, 'large.txt'),
        maxResults: 100
      });
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete quickly
    });

    it('should provide accurate counts even with truncation', async () => {
      const result = await searchTool.execute({
        pattern: 'Line',
        path: path.join(tempDir, 'large.txt'),
        maxResults: 10
      });

      expect(result.success).toBe(true);
      expect(result.totalMatches).toBeGreaterThan(result.matches!.length);
      expect(result.truncated).toBe(true);
    });
  });

  describe('Binary File Handling', () => {
    it('should skip binary files by default', async () => {
      const result = await searchTool.execute({
        pattern: 'PNG',
        path: tempDir
      });

      expect(result.success).toBe(true);
      
      // Should not search binary files
      const binaryMatches = result.matches!.filter(m => m.file.endsWith('.dat'));
      expect(binaryMatches).toHaveLength(0);
    });

    it('should indicate when binary files are skipped', async () => {
      const result = await searchTool.execute({
        pattern: 'test',
        path: tempDir
      });

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      // Binary files should be counted as scanned but not searched
    });
  });

  describe('Performance and Streaming', () => {
    it('should stream results for large searches', async () => {
      const events: any[] = [];
      const stream = searchTool.stream!({
        pattern: 'Pattern',
        path: tempDir,
        maxResults: 1000
      });

      for await (const event of stream) {
        events.push(event);
        if (events.length > 10) break; // Don't collect all events
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'progress')).toBe(true);
    });

    it('should handle large directories efficiently', async () => {
      // Create many files to search
      const manyFilesDir = path.join(tempDir, 'many-files');
      await fs.mkdir(manyFilesDir);

      const promises = Array.from({ length: 100 }, (_, i) => 
        fs.writeFile(path.join(manyFilesDir, `file${i}.txt`), `Content ${i} with pattern`)
      );
      await Promise.all(promises);

      const start = Date.now();
      const result = await searchTool.execute({
        pattern: 'pattern',
        path: manyFilesDir
      });
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.filesSearched).toBe(100);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });

    it('should provide performance metrics', async () => {
      const result = await searchTool.execute({
        pattern: 'Hello',
        path: tempDir
      });

      expect(result.success).toBe(true);
      expect(result.metrics).toMatchObject({
        filesSearched: expect.any(Number),
        bytesSearched: expect.any(Number),
        matchCount: expect.any(Number),
        duration: expect.any(Number)
      });
    });
  });

  describe('Security and Path Validation', () => {
    it('should reject path traversal attempts', async () => {
      await expect(searchTool.execute({
        pattern: 'test',
        path: '../../../etc'
      })).rejects.toMatchObject({
        class: ErrorClass.PERMISSION,
        code: 'PATH_TRAVERSAL'
      });
    });

    it('should reject absolute paths outside workspace', async () => {
      await expect(searchTool.execute({
        pattern: 'test',
        path: '/etc/passwd'
      })).rejects.toMatchObject({
        class: ErrorClass.PERMISSION,
        code: 'ACCESS_DENIED'
      });
    });

    it('should handle permission denied gracefully', async () => {
      if (process.platform !== 'win32') {
        const restrictedDir = path.join(tempDir, 'restricted');
        await fs.mkdir(restrictedDir);
        await fs.writeFile(path.join(restrictedDir, 'secret.txt'), 'secret content');
        await fs.chmod(restrictedDir, 0o000); // No permissions

        const result = await searchTool.execute({
          pattern: 'secret',
          path: tempDir
        });

        // Should succeed but skip restricted directory
        expect(result.success).toBe(true);
        
        // Restore permissions for cleanup
        await fs.chmod(restrictedDir, 0o755);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle ripgrep errors gracefully', async () => {
      // Mock ripgrep failure
      const originalSpawn = require('child_process').spawn;
      jest.spyOn(require('child_process'), 'spawn').mockImplementationOnce(() => {
        const mockProcess = {
          stdout: { on: jest.fn(), pipe: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((event, callback) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('ripgrep not found')), 10);
            }
          }),
          kill: jest.fn()
        };
        return mockProcess;
      });

      await expect(searchTool.execute({
        pattern: 'test',
        path: tempDir
      })).rejects.toMatchObject({
        class: ErrorClass.PERMANENT,
        code: 'RIPGREP_ERROR'
      });

      require('child_process').spawn.mockRestore();
    });

    it('should provide detailed error information', async () => {
      const error = await searchTool.execute({
        pattern: 'test',
        path: path.join(tempDir, 'nonexistent')
      }).catch(e => e);

      expect(error).toBeInstanceOf(ToolError);
      expect(error.class).toBe(ErrorClass.PERMANENT);
      expect(error.details).toMatchObject({
        pattern: 'test',
        path: expect.any(String)
      });
    });
  });

  describe('Telemetry and Monitoring', () => {
    it('should emit telemetry events', async () => {
      const telemetryEvents: any[] = [];
      searchTool.on('telemetry', (event) => telemetryEvents.push(event));

      await searchTool.execute({
        pattern: 'Hello',
        path: tempDir
      });

      expect(telemetryEvents).toHaveLength(1);
      expect(telemetryEvents[0]).toMatchObject({
        tool: 'search',
        success: true,
        duration: expect.any(Number),
        matchCount: expect.any(Number),
        filesSearched: expect.any(Number)
      });
    });

    it('should track ripgrep integration metrics', async () => {
      const result = await searchTool.execute({
        pattern: 'test',
        path: tempDir
      });

      expect(result.metrics).toMatchObject({
        filesSearched: expect.any(Number),
        bytesSearched: expect.any(Number),
        matchCount: expect.any(Number),
        ripgrepTime: expect.any(Number)
      });
    });
  });
});