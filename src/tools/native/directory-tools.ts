/**
 * Simplified Directory Tools - Native implementation
 * Basic implementations for testing directory operations
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { ToolError, ErrorClass, NativeTool, DirectoryToolResponse } from './types.js';

// Simplified interfaces
interface MkdirArguments {
  path: string;
  recursive?: boolean;
  permissions?: number;
}

interface MkdirResponse extends DirectoryToolResponse {
  created: boolean;
  path: string;
}

interface DeleteArguments {
  path: string;
  recursive?: boolean;
  force?: boolean;
  confirm?: boolean;
}

interface DeleteResponse extends DirectoryToolResponse {
  deleted: boolean;
  itemsAffected: number;
}

interface MoveArguments {
  source: string;
  destination: string;
  overwrite?: boolean;
}

interface MoveResponse extends DirectoryToolResponse {
  moved: boolean;
  oldPath: string;
  newPath: string;
  overwritten: boolean;
}

/**
 * Simple MkdirTool - Directory creation
 */
export class MkdirTool extends EventEmitter implements NativeTool {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    super();
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  async execute(args: MkdirArguments): Promise<MkdirResponse> {
    const startTime = Date.now();
    
    try {
      const targetPath = path.resolve(this.workspaceRoot, args.path);
      
      // Check for path traversal attempts
      if (args.path.includes('../') || args.path.includes('..\\')) {
        throw new ToolError(
          ErrorClass.PERMISSION,
          'PATH_TRAVERSAL',
          `Path traversal attempt detected: ${args.path}`,
          { path: args.path }
        );
      }
      
      // Basic security check - ensure within workspace
      if (!targetPath.startsWith(this.workspaceRoot)) {
        throw new ToolError(
          ErrorClass.PERMISSION,
          'PATH_OUTSIDE_WORKSPACE',
          `Path is outside workspace: ${targetPath}`,
          { path: targetPath }
        );
      }

      let created = false;

      try {
        // Check if already exists
        const stats = await fs.stat(targetPath);
        if (stats.isDirectory()) {
          created = false;
        } else {
          throw new ToolError(
            ErrorClass.VALIDATION,
            'FILE_EXISTS',
            `Path exists but is not a directory: ${targetPath}`,
            { path: targetPath }
          );
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // Directory doesn't exist, create it
          await fs.mkdir(targetPath, { 
            recursive: args.recursive,
            mode: args.permissions 
          });
          created = true;
        } else if (error instanceof ToolError) {
          throw error;
        } else {
          // Map specific error codes
          let errorClass = ErrorClass.PERMANENT;
          if (error.code === 'EACCES' || error.code === 'EPERM') {
            errorClass = ErrorClass.PERMISSION;
          } else if (error.code === 'ENOENT') {
            errorClass = ErrorClass.PERMANENT;
          }
          
          throw new ToolError(
            errorClass,
            error.code || 'MKDIR_FAILED',
            error.message || 'Directory creation failed',
            { path: targetPath, originalError: error }
          );
        }
      }

      const duration = Date.now() - startTime;
      
      // Emit telemetry
      this.emit('telemetry', {
        tool: 'mkdir',
        success: true,
        duration,
        created,
        path: targetPath
      });

      return {
        success: true,
        created,
        path: targetPath
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.emit('telemetry', {
        tool: 'mkdir',
        success: false,
        duration,
        error: error instanceof ToolError ? error : new ToolError(
          ErrorClass.PERMANENT,
          'MKDIR_FAILED',
          error.message || 'Directory creation failed',
          { originalError: error }
        )
      });

      throw error instanceof ToolError ? error : new ToolError(
        ErrorClass.PERMANENT,
        'MKDIR_FAILED',
        error.message || 'Directory creation failed',
        { originalError: error }
      );
    }
  }
}

/**
 * Simple DeleteTool - File and directory deletion
 */
export class DeleteTool extends EventEmitter implements NativeTool {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    super();
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  async execute(args: DeleteArguments): Promise<DeleteResponse> {
    const startTime = Date.now();
    
    try {
      const targetPath = path.resolve(this.workspaceRoot, args.path);
      
      // Basic security check
      if (!targetPath.startsWith(this.workspaceRoot)) {
        throw new ToolError(
          ErrorClass.PERMISSION,
          'PATH_OUTSIDE_WORKSPACE',
          `Path is outside workspace: ${targetPath}`,
          { path: targetPath }
        );
      }

      let deleted = false;
      let itemsAffected = 0;

      try {
        const stats = await fs.stat(targetPath);
        
        if (stats.isDirectory()) {
          // Check for dangerous operations requiring confirmation
          // Only require confirmation for deleting the workspace root itself
          const isWorkspaceRoot = path.resolve(targetPath) === path.resolve(this.workspaceRoot);
          if (args.recursive && isWorkspaceRoot && !args.confirm) {
            return {
              success: false,
              deleted: false,
              itemsAffected: 0
            };
          }
          
          if (!args.recursive) {
            // Check if directory is empty
            const entries = await fs.readdir(targetPath);
            if (entries.length > 0) {
              throw new ToolError(
                ErrorClass.VALIDATION,
                'DIRECTORY_NOT_EMPTY',
                `Directory is not empty: ${targetPath}`,
                { path: targetPath }
              );
            }
          } else {
            // Count items recursively for better reporting
            itemsAffected = await this.countItems(targetPath);
          }
          
          // Use rm with recursive option for directories (with fallback for compatibility)
          if (typeof (fs as any).rm === 'function') {
            await (fs as any).rm(targetPath, { recursive: args.recursive || false });
          } else {
            // Fallback to rmdir for older Node.js versions or Jest compatibility
            // @ts-ignore - rmdir may be deprecated but still available
            await fs.rmdir(targetPath, { recursive: args.recursive || false });
          }
          deleted = true;
        } else {
          itemsAffected = 1;
          await fs.unlink(targetPath);
          deleted = true;
        }

      } catch (error: any) {
        if (error.code === 'ENOENT') {
          if (args.force) {
            deleted = false;
            itemsAffected = 0;
          } else {
            throw new ToolError(
              ErrorClass.PERMANENT,
              'ENOENT',
              `Path does not exist: ${targetPath}`,
              { path: targetPath }
            );
          }
        } else if (error instanceof ToolError) {
          throw error;
        } else {
          // Map specific error codes
          let errorClass = ErrorClass.PERMANENT;
          if (error.code === 'EACCES' || error.code === 'EPERM') {
            errorClass = ErrorClass.PERMISSION;
          } else if (error.code === 'ENOENT') {
            errorClass = ErrorClass.PERMANENT;
          }
          
          throw new ToolError(
            errorClass,
            error.code || 'DELETE_FAILED',
            error.message || 'Deletion failed',
            { path: targetPath, originalError: error }
          );
        }
      }

      const duration = Date.now() - startTime;
      
      this.emit('telemetry', {
        tool: 'delete',
        success: true,
        duration,
        deleted,
        itemsAffected
      });

      return {
        success: true,
        deleted,
        itemsAffected
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.emit('telemetry', {
        tool: 'delete',
        success: false,
        duration,
        error: error instanceof ToolError ? error : new ToolError(
          ErrorClass.PERMANENT,
          'DELETE_FAILED',
          error.message || 'Deletion failed',
          { originalError: error }
        )
      });

      throw error instanceof ToolError ? error : new ToolError(
        ErrorClass.PERMANENT,
        'DELETE_FAILED',
        error.message || 'Deletion failed',
        { originalError: error }
      );
    }
  }

  // Helper method to count items recursively
  private async countItems(dirPath: string): Promise<number> {
    try {
      const entries = await fs.readdir(dirPath);
      let count = entries.length;
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        try {
          const statResult = await fs.stat(entryPath);
          if (statResult.isDirectory()) {
            count += await this.countItems(entryPath);
          }
        } catch {
          // Skip entries we can't access
        }
      }
      return count + 1; // Include the directory itself
    } catch {
      return 1; // Just the directory if we can't read it
    }
  }

  // Streaming support
  async* stream(args: DeleteArguments): AsyncGenerator<any> {
    yield { type: 'start', path: args.path };
    yield { type: 'progress', message: 'Analyzing target...' };
    
    try {
      const result = await this.execute(args);
      yield { type: 'progress', message: `Deleted ${result.itemsAffected} items` };
      yield { type: 'complete', ...result };
    } catch (error) {
      yield { type: 'error', error: error instanceof ToolError ? error : new ToolError(
        ErrorClass.PERMANENT,
        'DELETE_FAILED',
        (error as Error).message || 'Deletion failed',
        { originalError: error }
      )};
    }
  }
}

/**
 * Simple MoveTool - File and directory moving
 */
export class MoveTool extends EventEmitter implements NativeTool {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    super();
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  async execute(args: MoveArguments): Promise<MoveResponse> {
    const startTime = Date.now();
    
    try {
      const sourcePath = path.resolve(this.workspaceRoot, args.source);
      const destPath = path.resolve(this.workspaceRoot, args.destination);
      
      // Basic security checks
      if (!sourcePath.startsWith(this.workspaceRoot) || !destPath.startsWith(this.workspaceRoot)) {
        throw new ToolError(
          ErrorClass.PERMISSION,
          'PATH_OUTSIDE_WORKSPACE',
          'Source or destination path is outside workspace',
          { source: sourcePath, destination: destPath }
        );
      }

      // Check if source exists
      try {
        await fs.stat(sourcePath);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          throw new ToolError(
            ErrorClass.PERMANENT,
            'ENOENT',
            `Source path does not exist: ${sourcePath}`,
            { source: sourcePath, destination: destPath }
          );
        }
        throw error;
      }

      // Check if destination exists
      let destExists = false;
      try {
        await fs.stat(destPath);
        destExists = true;
        
        if (!args.overwrite) {
          throw new ToolError(
            ErrorClass.VALIDATION,
            'DESTINATION_EXISTS',
            `Destination already exists: ${destPath}`,
            { source: sourcePath, destination: destPath }
          );
        }
      } catch (error: any) {
        if (error instanceof ToolError) throw error;
        if (error.code !== 'ENOENT') {
          throw new ToolError(
            ErrorClass.PERMANENT,
            error.code || 'STAT_FAILED',
            error.message || 'Failed to check destination',
            { source: sourcePath, destination: destPath, originalError: error }
          );
        }
      }

      // Perform the move
      await fs.rename(sourcePath, destPath);

      const duration = Date.now() - startTime;
      
      this.emit('telemetry', {
        tool: 'move',
        success: true,
        duration,
        moved: true,
        overwritten: destExists
      });

      return {
        success: true,
        moved: true,
        oldPath: sourcePath,
        newPath: destPath,
        overwritten: destExists
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.emit('telemetry', {
        tool: 'move',
        success: false,
        duration,
        error: error instanceof ToolError ? error : new ToolError(
          ErrorClass.PERMANENT,
          'MOVE_FAILED',
          error.message || 'Move operation failed',
          { originalError: error }
        )
      });

      // Map specific error codes
      let errorClass = ErrorClass.PERMANENT;
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        errorClass = ErrorClass.PERMISSION;
      } else if (error.code === 'ENOENT') {
        errorClass = ErrorClass.PERMANENT;
      } else if (error.code === 'EEXIST') {
        errorClass = ErrorClass.VALIDATION;
      } else if (error.code === 'EXDEV') {
        errorClass = ErrorClass.TRANSIENT; // Cross-device moves can be retried with copy+delete
      }

      throw error instanceof ToolError ? error : new ToolError(
        errorClass,
        error.code || 'MOVE_FAILED',
        error.message || 'Move operation failed',
        { originalError: error }
      );
    }
  }
}