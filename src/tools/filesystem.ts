/**
 * Direct File System Access Module
 * Provides comprehensive file operations for Claude Code parity
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { EventEmitter } from "events";

export interface FileSystemOptions {
  encoding?: BufferEncoding;
  flag?: string;
  mode?: number;
  recursive?: boolean;
  force?: boolean;
  backup?: boolean;
}

export interface FileInfo {
  path: string;
  exists: boolean;
  size?: number;
  isFile?: boolean;
  isDirectory?: boolean;
  modified?: Date;
  created?: Date;
  permissions?: string;
}

export interface FileOperation {
  type: "read" | "write" | "create" | "delete" | "move" | "copy";
  source: string;
  target?: string;
  content?: string | Buffer;
  options?: FileSystemOptions;
  timestamp: number;
  success: boolean;
  error?: string;
}

export class FileSystemTool extends EventEmitter {
  private operations: FileOperation[] = [];
  private watchedPaths: Set<string> = new Set();

  constructor(private workspaceRoot: string = process.cwd()) {
    super();
  }

  /**
   * Read file contents with encoding support
   */
  async readFile(filePath: string, options: FileSystemOptions = {}): Promise<string | Buffer> {
    const operation: FileOperation = {
      type: "read",
      source: filePath,
      timestamp: Date.now(),
      success: false,
      options
    };

    try {
      const absolutePath = this.resolvePath(filePath);
      await this.validatePermissions(absolutePath, "read");

      const content = await fs.readFile(absolutePath, options.encoding || "utf8");

      operation.success = true;
      this.operations.push(operation);
      this.emit("operation", operation);

      return content;
    } catch (error) {
      operation.error = error instanceof Error ? error.message : String(error);
      this.operations.push(operation);
      this.emit("error", operation);
      throw error;
    }
  }

  /**
   * Write file contents with atomic operations
   */
  async writeFile(
    filePath: string,
    content: string | Buffer,
    options: FileSystemOptions = {}
  ): Promise<void> {
    const operation: FileOperation = {
      type: "write",
      source: filePath,
      content: typeof content === "string" ? content : content.toString(),
      timestamp: Date.now(),
      success: false,
      options
    };

    try {
      const absolutePath = this.resolvePath(filePath);
      await this.validatePermissions(absolutePath, "write");

      // Create backup if requested
      if (options.backup && await this.exists(absolutePath)) {
        await this.createBackup(absolutePath);
      }

      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });

      // Atomic write using temporary file
      const tempPath = absolutePath + ".tmp";
      await fs.writeFile(tempPath, content, {
        encoding: options.encoding || "utf8",
        mode: options.mode,
        flag: options.flag
      });

      await fs.rename(tempPath, absolutePath);

      operation.success = true;
      this.operations.push(operation);
      this.emit("operation", operation);
    } catch (error) {
      operation.error = error instanceof Error ? error.message : String(error);
      this.operations.push(operation);
      this.emit("error", operation);
      throw error;
    }
  }

  /**
   * Create new file or directory
   */
  async create(filePath: string, content?: string, options: FileSystemOptions = {}): Promise<void> {
    const operation: FileOperation = {
      type: "create",
      source: filePath,
      content,
      timestamp: Date.now(),
      success: false,
      options
    };

    try {
      const absolutePath = this.resolvePath(filePath);
      await this.validatePermissions(absolutePath, "write");

      if (await this.exists(absolutePath) && !options.force) {
        throw new Error(`File already exists: ${filePath}`);
      }

      if (content === undefined) {
        // Create directory
        await fs.mkdir(absolutePath, {
          recursive: options.recursive !== false,
          mode: options.mode
        });
      } else {
        // Create file
        await this.writeFile(filePath, content, options);
      }

      operation.success = true;
      this.operations.push(operation);
      this.emit("operation", operation);
    } catch (error) {
      operation.error = error instanceof Error ? error.message : String(error);
      this.operations.push(operation);
      this.emit("error", operation);
      throw error;
    }
  }

  /**
   * Delete file or directory
   */
  async delete(filePath: string, options: FileSystemOptions = {}): Promise<void> {
    const operation: FileOperation = {
      type: "delete",
      source: filePath,
      timestamp: Date.now(),
      success: false,
      options
    };

    try {
      const absolutePath = this.resolvePath(filePath);
      await this.validatePermissions(absolutePath, "write");

      if (!await this.exists(absolutePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Create backup if requested
      if (options.backup) {
        await this.createBackup(absolutePath);
      }

      const stats = await fs.stat(absolutePath);
      if (stats.isDirectory()) {
        await fs.rmdir(absolutePath, { recursive: options.recursive || false });
      } else {
        await fs.unlink(absolutePath);
      }

      operation.success = true;
      this.operations.push(operation);
      this.emit("operation", operation);
    } catch (error) {
      operation.error = error instanceof Error ? error.message : String(error);
      this.operations.push(operation);
      this.emit("error", operation);
      throw error;
    }
  }

  /**
   * Move or rename file/directory
   */
  async move(sourcePath: string, targetPath: string, options: FileSystemOptions = {}): Promise<void> {
    const operation: FileOperation = {
      type: "move",
      source: sourcePath,
      target: targetPath,
      timestamp: Date.now(),
      success: false,
      options
    };

    try {
      const absoluteSource = this.resolvePath(sourcePath);
      const absoluteTarget = this.resolvePath(targetPath);

      await this.validatePermissions(absoluteSource, "write");
      await this.validatePermissions(absoluteTarget, "write");

      if (!await this.exists(absoluteSource)) {
        throw new Error(`Source not found: ${sourcePath}`);
      }

      if (await this.exists(absoluteTarget) && !options.force) {
        throw new Error(`Target already exists: ${targetPath}`);
      }

      await fs.rename(absoluteSource, absoluteTarget);

      operation.success = true;
      this.operations.push(operation);
      this.emit("operation", operation);
    } catch (error) {
      operation.error = error instanceof Error ? error.message : String(error);
      this.operations.push(operation);
      this.emit("error", operation);
      throw error;
    }
  }

  /**
   * Copy file or directory
   */
  async copy(sourcePath: string, targetPath: string, options: FileSystemOptions = {}): Promise<void> {
    const operation: FileOperation = {
      type: "copy",
      source: sourcePath,
      target: targetPath,
      timestamp: Date.now(),
      success: false,
      options
    };

    try {
      const absoluteSource = this.resolvePath(sourcePath);
      const absoluteTarget = this.resolvePath(targetPath);

      await this.validatePermissions(absoluteSource, "read");
      await this.validatePermissions(absoluteTarget, "write");

      if (!await this.exists(absoluteSource)) {
        throw new Error(`Source not found: ${sourcePath}`);
      }

      if (await this.exists(absoluteTarget) && !options.force) {
        throw new Error(`Target already exists: ${targetPath}`);
      }

      await fs.copyFile(absoluteSource, absoluteTarget);

      operation.success = true;
      this.operations.push(operation);
      this.emit("operation", operation);
    } catch (error) {
      operation.error = error instanceof Error ? error.message : String(error);
      this.operations.push(operation);
      this.emit("error", operation);
      throw error;
    }
  }

  /**
   * Get file information
   */
  async getInfo(filePath: string): Promise<FileInfo> {
    const absolutePath = this.resolvePath(filePath);

    try {
      const stats = await fs.stat(absolutePath);
      return {
        path: filePath,
        exists: true,
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        modified: stats.mtime,
        created: stats.birthtime,
        permissions: stats.mode.toString(8)
      };
    } catch (error) {
      return {
        path: filePath,
        exists: false
      };
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string, options: FileSystemOptions = {}): Promise<string[]> {
    const absolutePath = this.resolvePath(dirPath);
    await this.validatePermissions(absolutePath, "read");

    try {
      const entries = await fs.readdir(absolutePath);
      return entries.sort();
    } catch (error) {
      throw new Error(`Cannot list directory: ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if file/directory exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = this.resolvePath(filePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get operation history
   */
  getOperations(): FileOperation[] {
    return [...this.operations];
  }

  /**
   * Clear operation history
   */
  clearOperations(): void {
    this.operations = [];
  }

  // Private helper methods

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return path.normalize(filePath);
    }
    return path.resolve(this.workspaceRoot, filePath);
  }

  private async validatePermissions(filePath: string, operation: "read" | "write"): Promise<void> {
    // Basic permission validation - can be enhanced with more sophisticated permission system
    try {
      if (operation === "read") {
        await fs.access(path.dirname(filePath), fsSync.constants.R_OK);
      } else {
        await fs.access(path.dirname(filePath), fsSync.constants.W_OK);
      }
    } catch (error) {
      // Directory doesn't exist or no permission - this is handled by create operations
      if (operation === "write") {
        // Try to create parent directory
        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
        } catch {
          throw new Error(`No write permission for: ${filePath}`);
        }
      } else {
        throw new Error(`No read permission for: ${filePath}`);
      }
    }
  }

  private async createBackup(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${filePath}.backup.${timestamp}`;
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }
}

// Export singleton instance
export const fileSystem = new FileSystemTool();

