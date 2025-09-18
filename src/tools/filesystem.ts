/**
 * Direct File System Access Module
 * Provides comprehensive file operations for Claude Code parity
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { PermissionManager } from "../permissions/PermissionManager.js";
import { PermissionQuery, PermissionResult } from "../permissions/types.js";

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

export enum FileOperationType {
  // Read operations
  READ_FILE = "read_file",
  READ_DIRECTORY = "read_directory",
  READ_METADATA = "read_metadata",

  // Write operations
  WRITE_FILE = "write_file",
  CREATE_FILE = "create_file",
  CREATE_DIRECTORY = "create_directory",
  APPEND_FILE = "append_file",

  // Modification operations
  MOVE_FILE = "move_file",
  COPY_FILE = "copy_file",
  DELETE_FILE = "delete_file",
  DELETE_DIRECTORY = "delete_directory",

  // Permission operations
  CHANGE_PERMISSIONS = "change_permissions",

  // System operations
  WATCH_FILE = "watch_file",
  UNWATCH_FILE = "unwatch_file"
}

export interface FileOperation {
  type: FileOperationType;
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
  private permissionManager: PermissionManager | null = null;

  constructor(private workspaceRoot: string = process.cwd()) {
    super();
  }

  /**
   * Set the permission manager for this file system tool
   */
  setPermissionManager(permissionManager: PermissionManager): void {
    this.permissionManager = permissionManager;
  }

  /**
   * Read file contents with encoding support
   */
  async readFile(filePath: string, options: FileSystemOptions = {}): Promise<string | Buffer> {
    const operation: FileOperation = {
      type: FileOperationType.READ_FILE,
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
      type: FileOperationType.WRITE_FILE,
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
    const operationType = content === undefined ? FileOperationType.CREATE_DIRECTORY : FileOperationType.CREATE_FILE;
    const operation: FileOperation = {
      type: operationType,
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
      type: FileOperationType.DELETE_FILE, // Will be updated to DELETE_DIRECTORY if needed
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
        operation.type = FileOperationType.DELETE_DIRECTORY;
        await fs.rmdir(absolutePath, { recursive: options.recursive || false });
      } else {
        operation.type = FileOperationType.DELETE_FILE;
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
      type: FileOperationType.MOVE_FILE,
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
      type: FileOperationType.COPY_FILE,
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
      await this.validatePermissions(absolutePath, FileOperationType.READ_METADATA);
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
      // If permission denied or file doesn't exist, return basic info
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
    await this.validatePermissions(absolutePath, FileOperationType.READ_DIRECTORY);

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

  private async validatePermissions(filePath: string, operation: "read" | "write" | FileOperationType): Promise<void> {
    // If no permission manager is set, fall back to basic filesystem checks
    if (!this.permissionManager) {
      // Basic permission validation fallback
      try {
        const fsOperation = typeof operation === "string" ? operation :
          (operation === FileOperationType.READ_FILE ||
           operation === FileOperationType.READ_DIRECTORY ||
           operation === FileOperationType.READ_METADATA) ? "read" : "write";

        if (fsOperation === "read") {
          await fs.access(path.dirname(filePath), fsSync.constants.R_OK);
        } else {
          await fs.access(path.dirname(filePath), fsSync.constants.W_OK);
        }
      } catch (error: unknown) {
        if (typeof operation !== "string" && (error as any)?.code === 'ENOENT') {
          // Directory doesn't exist - try to create it for write operations
          try {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
          } catch {
            throw new Error(`Cannot create directory for: ${filePath}`);
          }
        } else {
          const action = (typeof operation === "string" && operation === "read") ||
                        operation === FileOperationType.READ_FILE ||
                        operation === FileOperationType.READ_DIRECTORY ||
                        operation === FileOperationType.READ_METADATA ? "read from" : "write to";
          throw new Error(`Cannot ${action} ${filePath}: ${(error as Error)?.message || String(error)}`);
        }
      }
      return;
    }

    // Map granular operations to permission types
    let permissionOp: string;
    if (typeof operation === "string" && (operation === "read" || operation === "write")) {
      permissionOp = operation;
    } else {
      // Map FileOperationType to permission operation
      switch (operation) {
        case FileOperationType.READ_FILE:
        case FileOperationType.READ_DIRECTORY:
        case FileOperationType.READ_METADATA:
          permissionOp = "read";
          break;
        case FileOperationType.WRITE_FILE:
        case FileOperationType.CREATE_FILE:
        case FileOperationType.CREATE_DIRECTORY:
        case FileOperationType.APPEND_FILE:
        case FileOperationType.MOVE_FILE:
        case FileOperationType.COPY_FILE:
        case FileOperationType.DELETE_FILE:
        case FileOperationType.DELETE_DIRECTORY:
        case FileOperationType.CHANGE_PERMISSIONS:
          permissionOp = "write";
          break;
        case FileOperationType.WATCH_FILE:
        case FileOperationType.UNWATCH_FILE:
          permissionOp = "read";
          break;
        default:
          permissionOp = "write"; // Default to write for safety
      }
    }

    // Create permission query for the file operation
    const query: PermissionQuery = {
      tool: "filesystem",
      operation: permissionOp,
      path: filePath,
      context: {
        source: "cli" as const,
        workspace_path: this.workspaceRoot,
        environment: {
          platform: process.platform,
          node_version: process.version,
          node_env: process.env.NODE_ENV,
          user_home: process.env.HOME || process.env.USERPROFILE
        }
      },
      metadata: {
        operationType: typeof operation === "string" ? operation : operation,
        timestamp: Date.now()
      }
    };

    try {
      // Check permission through the permission system
      const result: PermissionResult = await this.permissionManager.checkPermission(query);

      if (result.action === "deny") {
        throw new Error(`Permission denied for ${permissionOp} on ${filePath}: ${result.reason || 'Access denied'}`);
      }

      // If permission granted, still verify basic filesystem access
      if (permissionOp === "read") {
        await fs.access(path.dirname(filePath), fsSync.constants.R_OK);
      } else {
        await fs.access(path.dirname(filePath), fsSync.constants.W_OK);
      }
    } catch (error: unknown) {
      // Handle filesystem access errors for write operations
      if (permissionOp === "write" && (error as any)?.code === 'ENOENT') {
        // Directory doesn't exist - try to create it if permission was granted
        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
        } catch {
          throw new Error(`Cannot create directory for: ${filePath}`);
        }
      } else if ((error as Error)?.message?.includes('Permission denied')) {
        // Re-throw permission errors from the permission system
        throw error;
      } else {
        // Handle other filesystem errors
        const action = permissionOp === "read" ? "read from" : "write to";
        throw new Error(`Cannot ${action} ${filePath}: ${(error as Error)?.message || String(error)}`);
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

