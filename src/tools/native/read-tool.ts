/**
 * Read Tool - Native implementation
 * Implements file reading with encoding detection, line range support, and Claude Code compatibility
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { 
  NativeTool, 
  ReadToolArgs, 
  ReadToolResponse, 
  ReadToolMetrics,
  ToolError, 
  ErrorClass,
  ToolEvent 
} from './types.js';

// Common binary file signatures
const BINARY_SIGNATURES = [
  [0x89, 0x50, 0x4E, 0x47], // PNG
  [0xFF, 0xD8, 0xFF],       // JPEG
  [0x47, 0x49, 0x46],       // GIF
  [0x25, 0x50, 0x44, 0x46], // PDF
  [0x50, 0x4B],             // ZIP/Office files
  [0x7F, 0x45, 0x4C, 0x46], // ELF
  [0x4D, 0x5A],             // PE/EXE
];

// Text encoding detection patterns
const UTF8_BOM = [0xEF, 0xBB, 0xBF];
const UTF16_LE_BOM = [0xFF, 0xFE];
const UTF16_BE_BOM = [0xFE, 0xFF];

export class ReadTool extends EventEmitter implements NativeTool {
  private readonly maxFileSize: number = 100 * 1024 * 1024; // 100MB
  private readonly workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    super();
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  async execute(args: ReadToolArgs): Promise<ReadToolResponse> {
    const startTime = Date.now();
    let bytesRead = 0;

    try {
      // Validate and normalize path
      const normalizedPath = await this.validatePath(args.path);
      
      // Check file stats
      const stats = await fs.stat(normalizedPath);
      if (!stats.isFile()) {
        throw new ToolError(
          ErrorClass.VALIDATION,
          'NOT_A_FILE',
          `Path is not a file: ${args.path}`,
          { path: args.path, type: stats.isDirectory() ? 'directory' : 'other' }
        );
      }

      // Check file size limits
      if (stats.size > this.maxFileSize) {
        throw new ToolError(
          ErrorClass.VALIDATION,
          'FILE_TOO_LARGE',
          `File size (${stats.size} bytes) exceeds maximum (${this.maxFileSize} bytes)`,
          { size: stats.size, maxSize: this.maxFileSize }
        );
      }

      // Read file content
      const buffer = await fs.readFile(normalizedPath);
      bytesRead = buffer.length;

      // Detect encoding and binary status
      const originallyBinary = args.forceText ? this.isBinaryContent(buffer) : false;
      const encodingInfo = await this.detectEncoding(buffer, args.encoding, args.forceText);
      
      if (encodingInfo.isBinary && !args.forceText) {
        return this.createResponse(true, {
          content: buffer.toString('base64'),
          encoding: 'binary',
          isBinary: true,
          size: stats.size,
          resolvedPath: normalizedPath,
          metrics: this.createMetrics(startTime, bytesRead, 'binary')
        });
      }

      // Convert to text
      let content: string;
      let actualEncoding = encodingInfo.encoding;
      let encodingFallback = originallyBinary;

      try {
        content = buffer.toString(encodingInfo.encoding as BufferEncoding);
      } catch (err) {
        // Fallback to UTF-8 if encoding fails
        content = buffer.toString('utf8');
        actualEncoding = 'utf8';
        encodingFallback = true;
      }

      // Handle line range if specified
      if (args.startLine !== undefined || args.endLine !== undefined) {
        return this.handleLineRange(content, args, {
          encoding: actualEncoding,
          detectedEncoding: encodingInfo.detectedEncoding,
          size: stats.size,
          encodingFallback,
          resolvedPath: normalizedPath,
          metrics: this.createMetrics(startTime, bytesRead, actualEncoding)
        });
      }

      // Return full content
      return this.createResponse(true, {
        content,
        encoding: actualEncoding,
        detectedEncoding: encodingInfo.detectedEncoding,
        size: stats.size,
        truncated: false,
        encodingFallback,
        resolvedPath: normalizedPath,
        metrics: this.createMetrics(startTime, bytesRead, actualEncoding)
      });

    } catch (error) {
      // Emit telemetry for errors
      this.emitTelemetry(false, Date.now() - startTime, bytesRead, error);
      
      if (error instanceof ToolError) {
        throw error;
      }

      // Convert system errors to tool errors
      const systemError = error as NodeJS.ErrnoException;
      const errorClass = this.classifyError(systemError.code);
      
      throw new ToolError(
        errorClass,
        systemError.code || 'UNKNOWN_ERROR',
        systemError.message,
        { path: args.path, originalError: systemError }
      );
    }
  }

  async *stream(args: ReadToolArgs): AsyncGenerator<ToolEvent> {
    const executionId = `read-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let sequence = 0;

    try {
      yield {
        type: 'metadata',
            bytesRead, 
            totalBytes: stats.size, 
            progress: bytesRead / stats.size,
            timestamp: Date.now(),
            sequence: sequence++
          };
        }

        // Combine chunks and process
        const fullBuffer = Buffer.concat(chunks);
        const encodingInfo = await this.detectEncoding(fullBuffer, args.encoding, args.forceText);
        
        let content: string;
        if (encodingInfo.isBinary && !args.forceText) {
          content = fullBuffer.toString('base64');
        } else {
          content = fullBuffer.toString(encodingInfo.encoding as BufferEncoding);
        }

        yield {
          type: 'complete',
          data: {
            success: true,
            content,
            encoding: encodingInfo.encoding,
            isBinary: encodingInfo.isBinary,
            size: stats.size
          },
          timestamp: Date.now(),
          sequence: sequence++
        };

      } finally {
        await fileHandle.close();
      }

    } catch (error) {
      yield {
        type: 'error',
            bytesRead, 
            totalBytes: stats.size, 
            progress: bytesRead / stats.size,
        outOfRange: true
      });
    }

    // Extract lines (convert to 0-based indexing)
    const startIndex = startLine - 1;
    const endIndex = Math.min(endLine - 1, totalLines - 1);
    const selectedLines = lines.slice(startIndex, endIndex + 1);

    return this.createResponse(true, {
      ...baseResponse,
      content: selectedLines.join('\n'),
      totalLines,
      requestedRange: { start: startLine, end: endLine },
      outOfRange: false
    });
  }

  private createResponse(success: boolean, data: Partial<ReadToolResponse> = {}): ReadToolResponse {
    const response: ReadToolResponse = {
      success,
      ...data
    };

    // Emit telemetry
    if (data.metrics) {
      this.emitTelemetry(success, data.metrics.duration, data.metrics.bytesRead, data.error);
    }

    return response;
  }

  private createMetrics(startTime: number, bytesRead: number, encoding: string): ReadToolMetrics {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const throughput = duration > 0 ? (bytesRead / duration) * 1000 : 0; // bytes per second

    return {
      duration,
      startTime,
      endTime,
      readTime: duration,
      throughput,
      encoding,
      bytesRead
    };
  }

  private classifyError(errorCode?: string): ErrorClass {
    switch (errorCode) {
      case 'ENOENT':
      case 'EISDIR':
      case 'ENOTDIR':
        return ErrorClass.PERMANENT;
      
      case 'EACCES':
      case 'EPERM':
        return ErrorClass.PERMISSION;
      
      case 'EAGAIN':
      case 'EBUSY':
      case 'ETIMEDOUT':
        return ErrorClass.TRANSIENT;
      
      default:
        return ErrorClass.PERMANENT;
    }
  }

  private emitTelemetry(success: boolean, duration: number, bytesRead: number = 0, error?: any): void {
    this.emit('telemetry', {
      tool: 'read',
      success,
      duration,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      bytesRead,
      error: error?.message,
      cancelled: false
    });
  }
}