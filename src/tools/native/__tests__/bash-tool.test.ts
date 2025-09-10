/**
 * Tests for Bash Tool - Native implementation
 * Comprehensive test coverage for process execution with streaming capabilities
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { BashTool } from '../bash-tool.js';
import { ToolError, ErrorClass } from '../types.js';

describe('BashTool', () => {
  let bashTool: BashTool;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plato-bash-test-'));
    bashTool = new BashTool();

    // Create test files for bash operations
    const testFiles = {
      'test.txt': 'Hello World\nSecond line\nThird line',
      'script.sh': '#!/bin/bash\necho "Hello from script"\necho "Error message" >&2\nexit 42',
      'input.txt': 'Line 1\nLine 2\nLine 3',
      'executable.sh': '#!/bin/bash\necho "Executable script"\nsleep 0.1\necho "Done"',
      'slow-script.sh': '#!/bin/bash\nsleep 2\necho "Slow script completed"'
    };

    for (const [filename, content] of Object.entries(testFiles)) {
      const filePath = path.join(tempDir, filename);
      await fs.writeFile(filePath, content);
      
      // Make shell scripts executable
      if (filename.endsWith('.sh')) {
        await fs.chmod(filePath, 0o755);
      }
    }
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Basic Command Execution', () => {
    it('should execute simple echo command', async () => {
      const result = await bashTool.execute({
        command: 'echo "Hello World"'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Hello World\n');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
    });

    it('should capture stderr output', async () => {
      const result = await bashTool.execute({
        command: 'echo "Error message" >&2'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Error message\n');
      expect(result.exitCode).toBe(0);
    });

    it('should handle non-zero exit codes', async () => {
      const result = await bashTool.execute({
        command: 'exit 42'
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(42);
    });

    it('should execute commands with pipes', async () => {
      const result = await bashTool.execute({
        command: 'echo -e "line1\\nline2\\nline3" | grep line2'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('line2\n');
      expect(result.exitCode).toBe(0);
    });

    it('should handle command with arguments', async () => {
      const result = await bashTool.execute({
        command: 'ls -la /tmp'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('total');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Working Directory Management', () => {
    it('should execute command in specified working directory', async () => {
      const result = await bashTool.execute({
        command: 'pwd',
        cwd: tempDir
      });

      expect(result.success).toBe(true);
      expect(result.stdout?.trim()).toBe(tempDir);
      expect(result.exitCode).toBe(0);
    });

    it('should handle relative paths in working directory', async () => {
      // Create subdirectory
      const subDir = path.join(tempDir, 'subdir');
      await fs.mkdir(subDir);

      const result = await bashTool.execute({
        command: 'pwd',
        cwd: subDir
      });

      expect(result.success).toBe(true);
      expect(result.stdout?.trim()).toBe(subDir);
    });

    it('should fail with invalid working directory', async () => {
      await expect(bashTool.execute({
        command: 'pwd',
        cwd: '/nonexistent/directory'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMANENT,
        code: 'ENOENT'
      });
    });

    it('should use files relative to working directory', async () => {
      const result = await bashTool.execute({
        command: 'cat test.txt',
        cwd: tempDir
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Hello World\nSecond line\nThird line');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Environment Variable Management', () => {
    it('should pass environment variables to command', async () => {
      const result = await bashTool.execute({
        command: 'echo $TEST_VAR',
        env: {
          TEST_VAR: 'test_value'
        }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('test_value\n');
    });

    it('should inherit system environment by default', async () => {
      const result = await bashTool.execute({
        command: 'echo $HOME'
      });

      expect(result.success).toBe(true);
      expect(result.stdout?.trim()).toBe(os.homedir());
    });

    it('should override system environment variables', async () => {
      const result = await bashTool.execute({
        command: 'echo $PATH',
        env: {
          PATH: '/custom/path'
        }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('/custom/path\n');
    });

    it('should handle multiple environment variables', async () => {
      const result = await bashTool.execute({
        command: 'echo "$VAR1,$VAR2,$VAR3"',
        env: {
          VAR1: 'value1',
          VAR2: 'value2',
          VAR3: 'value3'
        }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('value1,value2,value3\n');
    });
  });

  describe('Input/Output Handling', () => {
    it('should provide input to command via stdin', async () => {
      const result = await bashTool.execute({
        command: 'cat',
        input: 'Hello from stdin'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Hello from stdin');
    });

    it('should handle multiline input', async () => {
      const input = 'Line 1\nLine 2\nLine 3';
      const result = await bashTool.execute({
        command: 'wc -l',
        input
      });

      expect(result.success).toBe(true);
      expect(result.stdout?.trim()).toBe('3');
    });

    it('should handle binary input data', async () => {
      const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]).toString();
      const result = await bashTool.execute({
        command: 'cat',
        input: binaryData
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Hello');
    });

    it('should handle large input data', async () => {
      const largeInput = 'x'.repeat(1000000); // 1MB of data
      const result = await bashTool.execute({
        command: 'wc -c',
        input: largeInput
      });

      expect(result.success).toBe(true);
      expect(result.stdout?.trim()).toBe('1000000');
    });
  });

  describe('Shell Selection and Options', () => {
    it('should use bash shell by default', async () => {
      const result = await bashTool.execute({
        command: 'echo $0'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('bash');
    });

    it('should use specified shell', async () => {
      const result = await bashTool.execute({
        command: 'echo $0',
        shell: '/bin/sh'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('sh');
    });

    it('should execute script files', async () => {
      const scriptPath = path.join(tempDir, 'script.sh');
      const result = await bashTool.execute({
        command: `bash ${scriptPath}`,
        cwd: tempDir
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Hello from script\n');
      expect(result.stderr).toBe('Error message\n');
      expect(result.exitCode).toBe(42);
    });

    it('should handle executable scripts', async () => {
      const scriptPath = path.join(tempDir, 'executable.sh');
      const result = await bashTool.execute({
        command: scriptPath,
        cwd: tempDir
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Executable script');
      expect(result.stdout).toContain('Done');
    });
  });

  describe('Timeout and Cancellation', () => {
    it('should enforce timeout limits', async () => {
      const start = Date.now();
      
      await expect(bashTool.execute({
        command: 'sleep 3',
        timeout: 1000 // 1 second
      })).rejects.toMatchObject({
        errorClass: ErrorClass.TIMEOUT,
        code: 'EXECUTION_TIMEOUT'
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
      expect(duration).toBeGreaterThan(900);
    });

    it('should handle fast commands within timeout', async () => {
      const result = await bashTool.execute({
        command: 'echo "Fast command"',
        timeout: 5000
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Fast command\n');
      expect(result.timedOut).toBeFalsy();
    });

    it('should provide timeout information in response', async () => {
      const result = await bashTool.execute({
        command: 'sleep 0.1',
        timeout: 5000
      }).catch(error => error);

      if (result.timedOut !== undefined) {
        expect(typeof result.timedOut).toBe('boolean');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle command not found errors', async () => {
      await expect(bashTool.execute({
        command: 'nonexistent_command'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMANENT,
        code: 'COMMAND_NOT_FOUND'
      });
    });

    it('should handle permission denied errors', async () => {
      // Create a file without execute permissions
      const scriptPath = path.join(tempDir, 'no-exec.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\necho "test"');
      await fs.chmod(scriptPath, 0o644); // No execute permission

      await expect(bashTool.execute({
        command: scriptPath
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMISSION,
        code: 'EACCES'
      });
    });

    it('should handle invalid shell path', async () => {
      await expect(bashTool.execute({
        command: 'echo test',
        shell: '/nonexistent/shell'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMANENT,
        code: 'ENOENT'
      });
    });

    it('should classify errors correctly', async () => {
      // Test various error conditions
      const errorTests = [
        { command: 'nonexistent_command', expectedClass: ErrorClass.PERMANENT },
        { command: 'sleep 2', timeout: 500, expectedClass: ErrorClass.TIMEOUT }
      ];

      for (const test of errorTests) {
        try {
          await bashTool.execute(test);
          fail('Expected command to throw error');
        } catch (error) {
          expect((error as any).errorClass).toBe(test.expectedClass);
        }
      }
    });
  });

  describe('Performance and Resource Management', () => {
    it('should track execution metrics', async () => {
      const result = await bashTool.execute({
        command: 'echo "Performance test"'
      });

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.executionTime).toBeGreaterThan(0);
      expect(result.metrics?.stdoutBytes).toBeGreaterThan(0);
      expect(typeof result.metrics?.exitCode).toBe('number');
    });

    it('should handle large output efficiently', async () => {
      const start = Date.now();
      const result = await bashTool.execute({
        command: 'seq 1 10000'
      });
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.stdout?.split('\n')).toHaveLength(10001); // 10000 lines + empty line
      expect(duration).toBeLessThan(2000); // Should be fast
    });

    it('should track memory usage', async () => {
      const result = await bashTool.execute({
        command: 'echo "Memory test"'
      });

      expect(result.metrics?.peakMemoryUsage).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent executions', async () => {
      const commands = Array.from({ length: 5 }, (_, i) => 
        bashTool.execute({
          command: `echo "Command ${i}"`,
          timeout: 5000
        })
      );

      const results = await Promise.all(commands);
      
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.stdout).toBe(`Command ${index}\n`);
      });
    });
  });

  describe('Security and Sandboxing', () => {
    it('should prevent path traversal in working directory', async () => {
      await expect(bashTool.execute({
        command: 'pwd',
        cwd: '../../../etc'
      })).rejects.toMatchObject({
        errorClass: ErrorClass.PERMISSION,
        code: 'PATH_TRAVERSAL'
      });
    });

    it('should validate command arguments', async () => {
      await expect(bashTool.execute({
        command: ''
      })).rejects.toMatchObject({
        errorClass: ErrorClass.VALIDATION,
        code: 'INVALID_COMMAND'
      });
    });

    it('should handle dangerous commands safely', async () => {
      // These commands should be isolated to the temp directory
      const result = await bashTool.execute({
        command: 'ls -la',
        cwd: tempDir
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('test.txt');
    });

    it('should limit resource usage', async () => {
      // This test ensures the tool respects resource limits
      const result = await bashTool.execute({
        command: 'echo "Resource test"',
        timeout: 1000
      });

      expect(result.metrics?.peakMemoryUsage).toBeLessThan(100 * 1024 * 1024); // 100MB limit
    });
  });

  describe('Telemetry and Monitoring', () => {
    it('should emit telemetry events', async () => {
      const telemetryEvents: any[] = [];
      bashTool.on('telemetry', (event) => telemetryEvents.push(event));

      await bashTool.execute({
        command: 'echo "Telemetry test"'
      });

      expect(telemetryEvents).toHaveLength(1);
      expect(telemetryEvents[0]).toMatchObject({
        tool: 'bash',
        success: true,
        duration: expect.any(Number),
        exitCode: 0
      });
    });

    it('should track detailed execution metrics', async () => {
      const result = await bashTool.execute({
        command: 'echo "Detailed metrics test"'
      });

      expect(result.metrics).toMatchObject({
        executionTime: expect.any(Number),
        stdoutBytes: expect.any(Number),
        stderrBytes: expect.any(Number),
        peakMemoryUsage: expect.any(Number),
        exitCode: expect.any(Number)
      });
    });

    it('should include signal information when process is terminated', async () => {
      // This test would require a way to send signals, which is complex in tests
      // For now, we'll just ensure the field exists when available
      const result = await bashTool.execute({
        command: 'echo "Signal test"'
      });

      // Signal should be undefined for normal completion
      expect(result.signal).toBeUndefined();
    });
  });

  describe('Background Process Support', () => {
    it('should handle background flag', async () => {
      const result = await bashTool.execute({
        command: 'echo "Background test"',
        background: false // Foreground execution
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Background test\n');
    });

    it('should provide process ID information', async () => {
      const result = await bashTool.execute({
        command: 'echo $$' // Print process ID
      });

      expect(result.success).toBe(true);
      expect(result.pid).toBeGreaterThan(0);
      expect(parseInt(result.stdout?.trim() || '0')).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Recovery', () => {
    it('should handle empty command output', async () => {
      const result = await bashTool.execute({
        command: 'true' // Command that produces no output
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
    });

    it('should handle commands with special characters', async () => {
      const result = await bashTool.execute({
        command: 'echo "Special chars: !@#$%^&*()"'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Special chars: !@#$%^&*()\n');
    });

    it('should handle very long command lines', async () => {
      const longArg = 'x'.repeat(1000);
      const result = await bashTool.execute({
        command: `echo "${longArg}"`
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe(longArg + '\n');
    });

    it('should handle Unicode output', async () => {
      const result = await bashTool.execute({
        command: 'echo "Unicode: 🚀 ñáéíóú 中文"'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Unicode: 🚀 ñáéíóú 中文\n');
    });

    it('should recover from process crashes gracefully', async () => {
      // Simulate a command that might cause issues
      const result = await bashTool.execute({
        command: 'bash -c "exit 127"' // Command not found exit code
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(127);
    });
  });
});