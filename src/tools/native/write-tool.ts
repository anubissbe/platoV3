/**
 * Write Tool - Native implementation
 * Implements file writing with atomic operations, directory creation, and Claude Code compatibility
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  NativeTool,
  WriteToolArgs,
  WriteToolResponse,
  WriteToolMetrics,
  ToolError,
  ErrorClass,
  ToolEvent
} from './types.js';
import { ErrorClassifier } from './error-classifier.js';

export class WriteTool extends EventEmitter implements NativeTool {
  private readonly maxFileSize: number = 50 * 1024 * 1024; // 50MB
  private readonly workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    super();
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  async execute(args: WriteToolArgs): Promise<WriteToolResponse> {
    const startTime = Date.now();
    let bytesWritten = 0;

    try {
      // Validate inputs
      this.validateArgs(args);
      
      // Validate and normalize path
      const normalizedPath = await this.validatePath(args.path);
      
      // Determine content encoding and convert to buffer
      const encoding = args.encoding || 'utf8';
      let contentBuffer: Buffer;
      let isBinary = false;

      if (encoding === 'base64') {
        contentBuffer = Buffer.from(args.content, 'base64');
        isBinary = true;
      } else if (encoding === 'binary') {
        contentBuffer = Buffer.from(args.content, 'binary');
        isBinary = true;
      } else {
        contentBuffer = Buffer.from(args.content, encoding as BufferEncoding);
      }

      // Check file size limits
      if (contentBuffer.length > this.maxFileSize) {
        throw new ToolError(
          ErrorClass.VALIDATION,
          'FILE_TOO_LARGE',
          `Content size (${contentBuffer.length} bytes) exceeds maximum (${this.maxFileSize} bytes)`,
          { size: contentBuffer.length, maxSize: this.maxFileSize }
        );
      }

      // Create parent directories if requested
      let dirsCreated: string[] = [];
      if (args.createDirs) {
        dirsCreated = await this.createParentDirectories(normalizedPath);
      } else {
        // Check if parent directory exists when not creating directories
        const parentDir = path.dirname(normalizedPath);
        try {
          await fs.access(parentDir);
        } catch (error) {
          throw ErrorClassifier.createToolError(error as Error, { 
            tool: 'write',
            operation: 'createParentDirectories',
            path: args.path, 
            parentDir 
          });
        }
      }

      // Check if file exists for overwrite detection
      let fileExists = false;
      let originalStats: any = null;
      try {
        originalStats = await fs.stat(normalizedPath);
        fileExists = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // Prepare backup path if requested
      let backupPath: string | undefined;
      if (args.backup && fileExists) {
        backupPath = await this.createBackup(normalizedPath);
      }

      // Perform write operation
      let tempPath: string | undefined;
      if (args.atomic) {
        tempPath = await this.performAtomicWrite(normalizedPath, contentBuffer);
      } else {
        await fs.writeFile(normalizedPath, contentBuffer);
      }

      bytesWritten = contentBuffer.length;

      // Handle permissions
      if (args.permissions !== undefined) {
        await fs.chmod(normalizedPath, args.permissions);
      } else if (args.preservePermissions && originalStats) {
        await fs.chmod(normalizedPath, originalStats.mode);
      }

      // Create response
      const response: WriteToolResponse = {
        success: true,
        bytesWritten,
        encoding,
        overwritten: fileExists,
        atomic: args.atomic || false,
        backupPath,
        dirsCreated,
        tempPath,
        isBinary,
        metrics: this.createMetrics(startTime, bytesWritten, encoding)
      };

      // Emit telemetry
      this.emitTelemetry(true, Date.now() - startTime, bytesWritten);

      return response;

    } catch (error) {
      // Emit telemetry for errors
      this.emitTelemetry(false, Date.now() - startTime, bytesWritten, error);
      
      if (error instanceof ToolError) {
        throw error;
      }

      // Use ErrorClassifier to create standardized tool error
      throw ErrorClassifier.createToolError(error as Error, { 
        tool: 'write',
        path: args.path 
      });
    }
  }

  async *stream(args: WriteToolArgs): AsyncGenerator<ToolEvent> {
    const executionId = `write-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let sequence = 0;

    try {
      yield {
        type: 'metadata',
        data: { executionId, tool: 'write', path: args.path },
        timestamp: Date.now(),
        sequence: sequence++
      };

      // For large writes, we can stream the writing process
      const normalizedPath = await this.validatePath(args.path);
      const encoding = args.encoding || 'utf8';
      
      let contentBuffer: Buffer;
      if (encoding === 'base64') {
        contentBuffer = Buffer.from(args.content, 'base64');
      } else if (encoding === 'binary') {
        contentBuffer = Buffer.from(args.content, 'binary');
      } else {
        contentBuffer = Buffer.from(args.content, encoding as BufferEncoding);
      }

      if (contentBuffer.length > this.maxFileSize) {
        throw new ToolError(ErrorClass.VALIDATION, 'FILE_TOO_LARGE', 'Content too large');
      }

      // Create directories if needed
      if (args.createDirs) {
        const dirsCreated = await this.createParentDirectories(normalizedPath);
        if (dirsCreated.length > 0) {
          yield {
            type: 'progress',
            data: { stage: 'directories_created', paths: dirsCreated },
            timestamp: Date.now(),
            sequence: sequence++
          };
        }
      }

      // Write in chunks for large files
      const chunkSize = 64 * 1024; // 64KB chunks
      if (contentBuffer.length > chunkSize) {
        yield {
          type: 'progress',
          data: { stage: 'writing', totalBytes: contentBuffer.length },
          timestamp: Date.now(),
          sequence: sequence++
        };

        const fileHandle = await fs.open(normalizedPath, 'w');
        try {
          let bytesWritten = 0;
          for (let offset = 0; offset < contentBuffer.length; offset += chunkSize) {
            const chunk = contentBuffer.subarray(offset, Math.min(offset + chunkSize, contentBuffer.length));
            await fileHandle.write(chunk);
            bytesWritten += chunk.length;

            yield {
              type: 'progress',
              data: { 
                stage: 'writing',
                bytesWritten, 
                totalBytes: contentBuffer.length, 
                progress: bytesWritten / contentBuffer.length 
              },
              timestamp: Date.now(),
              sequence: sequence++
            };
          }
        } finally {
          await fileHandle.close();
        }
      } else {
        // Small file, write directly
        await fs.writeFile(normalizedPath, contentBuffer);
      }

      yield {
        type: 'complete',
        data: {
          success: true,
          bytesWritten: contentBuffer.length,
          encoding,
          path: normalizedPath
        },
        success: true,
        timestamp: Date.now(),
        sequence: sequence++
      };

    } catch (error) {
      yield {
        type: 'error',
        data: { error: (error as Error).message },
        timestamp: Date.now(),
        sequence: sequence++
      };
    }
  }

  private validateArgs(args: WriteToolArgs): void {
    if (!args.path || typeof args.path !== 'string' || args.path.trim() === '') {
      throw new ToolError(
        ErrorClass.VALIDATION,
        'INVALID_PATH',
        'Path must be a non-empty string'
      );
    }

    if (args.content === undefined || args.content === null) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        'MISSING_CONTENT',
        'Content is required'
      );
    }

    if (typeof args.content !== 'string') {
      throw new ToolError(
        ErrorClass.VALIDATION,
        'INVALID_CONTENT',
        'Content must be a string'
      );
    }
  }

  private async validatePath(inputPath: string): Promise<string> {
    // Handle both relative and absolute paths correctly
    let absolutePath: string;
    if (path.isAbsolute(inputPath)) {
      absolutePath = inputPath;
    } else {
      absolutePath = path.resolve(this.workspaceRoot, inputPath);
    }
    
    // Check for path traversal
    if (!absolutePath.startsWith(this.workspaceRoot)) {
      throw new ToolError(
        ErrorClass.PERMISSION,
        'PATH_TRAVERSAL',
        'Path traversal not allowed',
        { path: inputPath, resolved: absolutePath }
      );
    }

    return absolutePath;
  }

  private async createParentDirectories(filePath: string): Promise<string[]> {
    const dirsCreated: string[] = [];
    const parentDir = path.dirname(filePath);

    if (parentDir === this.workspaceRoot) {
      return dirsCreated;
    }

    try {
      await fs.access(parentDir);
      return dirsCreated; // Directory already exists
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Create parent directories recursively
    const pathParts = path.relative(this.workspaceRoot, parentDir).split(path.sep);
    let currentPath = this.workspaceRoot;

    for (const part of pathParts) {
      if (!part) continue;
      
      currentPath = path.join(currentPath, part);
      
      try {
        await fs.access(currentPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          await fs.mkdir(currentPath);
          dirsCreated.push(currentPath);
        } else {
          throw error;
        }
      }
    }

    return dirsCreated;
  }

  private async createBackup(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup-${timestamp}`;
    
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }

  private async performAtomicWrite(filePath: string, content: Buffer): Promise<string> {
    // Create temporary file in the same directory
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    const tempFilename = `.${filename}.tmp-${crypto.randomBytes(6).toString('hex')}`;
    const tempPath = path.join(dir, tempFilename);

    try {
      // Write to temporary file
      await fs.writeFile(tempPath, content);
      
      // Atomic rename
      await fs.rename(tempPath, filePath);
      
      return tempPath;
    } catch (error) {
      // Clean up temporary file on error
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  private createMetrics(startTime: number, bytesWritten: number, encoding: string): WriteToolMetrics {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const throughput = duration > 0 ? (bytesWritten / duration) * 1000 : 0; // bytes per second

    return {
      duration,
      startTime,
      endTime,
      writeTime: duration,
      throughput,
      encoding,
      bytesWritten
    };
  }


  private emitTelemetry(success: boolean, duration: number, bytesWritten: number = 0, error?: any): void {
    this.emit('telemetry', {
      tool: 'write',
      success,
      duration,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      bytesWritten,
      error: error?.message,
      cancelled: false
    });
  }
}