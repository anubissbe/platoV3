/**
 * List Tool - Native implementation
 * Implements directory listing with glob patterns, sorting, and Claude Code compatibility
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { promisify } from "util";
import {
  NativeTool,
  ListToolArgs,
  ListToolResponse,
  ListToolMetrics,
  FileInfo,
  ToolError,
  ErrorClass,
  ToolEvent,
} from "./types.js";
import { ErrorClassifier } from "./error-classifier.js";
import { minimatch } from "minimatch";

const lstat = promisify(fsSync.lstat);

export class ListTool extends EventEmitter implements NativeTool {
  private readonly workspaceRoot: string;
  private readonly maxDepth: number = 10; // Prevent infinite recursion

  constructor(workspaceRoot?: string) {
    super();
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  async execute(args: ListToolArgs): Promise<ListToolResponse> {
    const startTime = Date.now();
    let itemsProcessed = 0;

    try {
      // Validate and normalize path
      const normalizedPath = await this.validatePath(args.path || ".");

      // Check if directory exists
      let stats;
      try {
        stats = await fs.stat(normalizedPath);
      } catch (error) {
        throw ErrorClassifier.createToolError(error as Error, {
          tool: "list",
          operation: "validateDirectory",
          path: args.path,
        });
      }

      if (!stats.isDirectory()) {
        throw new ToolError(
          ErrorClass.PERMANENT,
          "ENOTDIR",
          "Not a directory",
          { path: args.path, type: "file" },
        );
      }

      // Get directory contents
      const { files, directories } = await this.listDirectory(
        normalizedPath,
        args,
      );
      itemsProcessed = files.length + directories.length;

      // Apply glob pattern if specified (use glob or pattern, prioritize glob)
      const filterStartTime = Date.now();
      const globPattern = args.glob || args.pattern;
      let filteredFiles = files;
      let filteredDirs = directories;

      if (globPattern) {
        // Validate glob pattern syntax
        if (!this.isValidGlobPattern(globPattern)) {
          throw new ToolError(
            ErrorClass.VALIDATION,
            "INVALID_GLOB_PATTERN",
            `Invalid glob pattern: ${globPattern}`,
            { pattern: globPattern },
          );
        }
        if (args.recursive && globPattern.includes("**")) {
          // For recursive glob patterns, match against relative path
          const workspaceRoot = this.workspaceRoot;
          filteredFiles = files.filter((file) => {
            const relativePath = path.relative(workspaceRoot, file.path);
            return minimatch(relativePath, globPattern, {
              dot: args.includeHidden,
            });
          });
          filteredDirs = directories.filter((dir) => {
            const relativePath = path.relative(workspaceRoot, dir.path);
            return minimatch(relativePath, globPattern, {
              dot: args.includeHidden,
            });
          });
        } else {
          // For simple patterns, match against name only
          filteredFiles = files.filter((file) =>
            minimatch(file.name, globPattern, { dot: args.includeHidden }),
          );
          filteredDirs = directories.filter((dir) =>
            minimatch(dir.name, globPattern, { dot: args.includeHidden }),
          );
        }
      }

      const filterTime = Date.now() - filterStartTime;

      // Apply sorting if specified
      const sortStartTime = Date.now();
      if (args.sortBy) {
        filteredFiles = this.sortEntries(
          filteredFiles,
          args.sortBy,
          args.sortOrder,
        );
        filteredDirs = this.sortEntries(
          filteredDirs,
          args.sortBy,
          args.sortOrder,
        );
      }
      const sortTime = Date.now() - sortStartTime;

      // Calculate total size - always calculate for Claude Code parity
      const totalSize = filteredFiles.reduce(
        (sum, file) => sum + (file.size || 0),
        0,
      );

      return this.createResponse(true, {
        files: filteredFiles,
        directories: filteredDirs,
        totalFiles: filteredFiles.length,
        totalDirectories: filteredDirs.length,
        totalSize, // Always include totalSize for Claude Code parity
        truncated: false, // Add truncated field defaulting to false
        resolvedPath: normalizedPath,
        metrics: this.createMetrics(
          startTime,
          itemsProcessed,
          files.length,
          directories.length,
          filterTime,
          sortTime,
        ),
      });
    } catch (error) {
      // Emit telemetry for errors
      this.emitTelemetry(
        false,
        Date.now() - startTime,
        itemsProcessed,
        error,
        0,
        0,
      );

      if (error instanceof ToolError) {
        throw error;
      }

      // Use ErrorClassifier to create standardized tool error
      throw ErrorClassifier.createToolError(error as Error, {
        tool: "list",
        path: args.path,
      });
    }
  }

  async *stream(args: ListToolArgs): AsyncGenerator<ToolEvent> {
    const executionId = `list-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let sequence = 0;
    let itemsProcessed = 0;

    try {
      yield {
        type: "metadata",
        data: { executionId, tool: "list", path: args.path },
        timestamp: Date.now(),
        sequence: sequence++,
      };

      // Validate and normalize path
      const normalizedPath = await this.validatePath(args.path || ".");

      // Check if directory exists and is a directory
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        throw new ToolError(
          ErrorClass.VALIDATION,
          "NOT_A_DIRECTORY",
          `Path is not a directory: ${args.path}`,
        );
      }

      yield {
        type: "progress",
        data: { stage: "reading", path: normalizedPath },
        progress: 0,
        timestamp: Date.now(),
        sequence: sequence++,
      };

      // Get directory contents
      const { files, directories } = await this.listDirectory(
        normalizedPath,
        args,
      );
      itemsProcessed = files.length + directories.length;

      yield {
        type: "progress",
        data: { stage: "filtering", totalItems: itemsProcessed },
        progress: 0.5,
        timestamp: Date.now(),
        sequence: sequence++,
      };

      // Apply glob pattern if specified
      const globPattern = args.glob || args.pattern;
      let filteredFiles = files;
      let filteredDirs = directories;

      if (globPattern) {
        filteredFiles = files.filter((file) =>
          minimatch(file.name, globPattern, { dot: args.includeHidden }),
        );
        filteredDirs = directories.filter((dir) =>
          minimatch(dir.name, globPattern, { dot: args.includeHidden }),
        );
      }

      // Apply sorting if specified
      if (args.sortBy) {
        filteredFiles = this.sortEntries(
          filteredFiles,
          args.sortBy,
          args.sortOrder,
        );
        filteredDirs = this.sortEntries(
          filteredDirs,
          args.sortBy,
          args.sortOrder,
        );
      }

      yield {
        type: "complete",
        data: {
          success: true,
          files: filteredFiles,
          directories: filteredDirs,
          totalFiles: filteredFiles.length,
          totalDirectories: filteredDirs.length,
          resolvedPath: normalizedPath,
        },
        success: true,
        timestamp: Date.now(),
        sequence: sequence++,
      };
    } catch (error) {
      yield {
        type: "error",
        data: { error: (error as Error).message },
        timestamp: Date.now(),
        sequence: sequence++,
      };
    }
  }

  private async listDirectory(
    dirPath: string,
    args: ListToolArgs,
  ): Promise<{ files: FileInfo[]; directories: FileInfo[] }> {
    const files: FileInfo[] = [];
    const directories: FileInfo[] = [];

    if (args.recursive) {
      const maxDepth = args.maxDepth || this.maxDepth;
      await this.listRecursive(dirPath, files, directories, args, 0, maxDepth);
    } else {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        // Skip hidden files unless explicitly included
        if (!args.includeHidden && item.startsWith(".")) {
          continue;
        }

        const itemPath = path.join(dirPath, item);
        let stats;
        try {
          stats = await lstat(itemPath); // Use lstat to properly detect symlinks
        } catch (error) {
          // Skip items that can't be statted (broken symlinks, permission issues)
          continue;
        }

        const entry: FileInfo = {
          name: item,
          path: itemPath,
          type: stats.isSymbolicLink()
            ? "symlink"
            : stats.isDirectory()
              ? "directory"
              : "file",
          size: stats.size,
          modified: new Date(stats.mtime),
          created: new Date(stats.birthtime),
          permissions: this.formatPermissions(stats.mode, stats.isDirectory()),
        };

        // Include stats if requested
        if (args.stats) {
          entry.size = stats.size;
          entry.modified = new Date(stats.mtime);
          entry.created = new Date(stats.birthtime);
          entry.permissions = this.formatPermissions(
            stats.mode,
            entry.type === "directory",
          );
        }

        if (entry.type === "directory") {
          directories.push(entry);
        } else {
          files.push(entry);
        }
      }
    }

    return { files, directories };
  }

  private async listRecursive(
    dirPath: string,
    files: FileInfo[],
    directories: FileInfo[],
    args: ListToolArgs,
    currentDepth: number,
    maxDepth: number,
  ): Promise<void> {
    if (currentDepth >= maxDepth) {
      return; // Prevent infinite recursion or enforce max depth
    }

    try {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        // Skip hidden files unless explicitly included
        if (!args.includeHidden && item.startsWith(".")) {
          continue;
        }

        const itemPath = path.join(dirPath, item);
        let stats;
        try {
          stats = await lstat(itemPath); // Use lstat to properly detect symlinks
        } catch (error) {
          // Skip items that can't be statted (broken symlinks, permission issues)
          continue;
        }

        const entry: FileInfo = {
          name: item,
          path: itemPath,
          type: stats.isSymbolicLink()
            ? "symlink"
            : stats.isDirectory()
              ? "directory"
              : "file",
          depth: currentDepth,
          size: stats.size,
          modified: new Date(stats.mtime),
          created: new Date(stats.birthtime),
          permissions: this.formatPermissions(stats.mode, stats.isDirectory()),
        };

        // Include stats if requested
        if (args.stats) {
          entry.size = stats.size;
          entry.modified = new Date(stats.mtime);
          entry.created = new Date(stats.birthtime);
          entry.permissions = this.formatPermissions(
            stats.mode,
            entry.type === "directory",
          );
        }

        if (entry.type === "directory") {
          directories.push(entry);
          // Recurse into subdirectories
          await this.listRecursive(
            itemPath,
            files,
            directories,
            args,
            currentDepth + 1,
            maxDepth,
          );
        } else {
          files.push(entry);
        }
      }
    } catch (error) {
      // Skip directories that can't be read (permission issues, etc.)
      // but don't fail the entire operation
      const systemError = error as NodeJS.ErrnoException;
      if (systemError.code === "EACCES" || systemError.code === "EPERM") {
        return;
      }
      throw error;
    }
  }

  private sortEntries(
    entries: FileInfo[],
    sortBy: string,
    sortOrder?: string,
  ): FileInfo[] {
    const sorted = [...entries].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
          break;
        case "size":
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case "modified":
          comparison =
            (a.modified?.getTime() || 0) - (b.modified?.getTime() || 0);
          break;
        case "type":
          if (a.type !== b.type) {
            comparison = a.type === "directory" ? -1 : 1;
          } else {
            comparison = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
          }
          break;
        default:
          return 0;
      }

      // Reverse for descending order
      return sortOrder === "desc" ? -comparison : comparison;
    });

    return sorted;
  }

  private async validatePath(inputPath: string): Promise<string> {
    // Check for absolute paths outside workspace
    if (path.isAbsolute(inputPath)) {
      if (!inputPath.startsWith(this.workspaceRoot)) {
        throw new ToolError(
          ErrorClass.PERMISSION,
          "ACCESS_DENIED",
          "Access to paths outside workspace not allowed",
          { path: inputPath, workspaceRoot: this.workspaceRoot },
        );
      }
      // Absolute path within workspace is OK
      return inputPath;
    }

    // Resolve relative path to absolute path
    const absolutePath = path.resolve(this.workspaceRoot, inputPath);

    // Check for relative path traversal (../ escapes)
    if (!absolutePath.startsWith(this.workspaceRoot)) {
      throw new ToolError(
        ErrorClass.PERMISSION,
        "PATH_TRAVERSAL",
        "Path traversal not allowed",
        { path: inputPath, resolved: absolutePath },
      );
    }

    // Resolve symlinks to their targets
    try {
      const realPath = await fs.realpath(absolutePath);

      // Ensure resolved symlink is still within workspace
      if (!realPath.startsWith(this.workspaceRoot)) {
        throw new ToolError(
          ErrorClass.PERMISSION,
          "SYMLINK_TRAVERSAL",
          "Symlink points outside workspace",
          { path: inputPath, symlink: absolutePath, target: realPath },
        );
      }

      return realPath;
    } catch (error) {
      // If realpath fails (directory doesn't exist), return the original path
      // This allows proper error handling in the main execute method
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return absolutePath;
      }
      throw error;
    }
  }

  private createResponse(
    success: boolean,
    data: Partial<ListToolResponse> = {},
  ): ListToolResponse {
    const response: ListToolResponse = {
      success,
      ...data,
    };

    // Emit telemetry
    if (data.metrics) {
      this.emitTelemetry(
        success,
        data.metrics.duration,
        (data.totalFiles || 0) + (data.totalDirectories || 0),
        data.error,
        data.totalFiles,
        data.totalDirectories,
      );
    }

    return response;
  }

  private createMetrics(
    startTime: number,
    itemsProcessed: number,
    filesScanned: number,
    directoriesScanned: number,
    filterTime: number,
    sortTime: number,
  ): ListToolMetrics {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const throughput = duration > 0 ? (itemsProcessed / duration) * 1000 : 0; // items per second

    return {
      duration,
      startTime,
      endTime,
      itemsProcessed,
      throughput,
      filesScanned,
      directoriesScanned,
      filterTime,
      sortTime,
    };
  }

  private isValidGlobPattern(pattern: string): boolean {
    // Check for unmatched square brackets
    let squareBrackets = 0;
    let inSquareBracket = false;

    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i];
      const prevChar = i > 0 ? pattern[i - 1] : "";

      if (char === "[" && prevChar !== "\\") {
        squareBrackets++;
        inSquareBracket = true;
      } else if (char === "]" && prevChar !== "\\" && inSquareBracket) {
        squareBrackets--;
        inSquareBracket = false;
      }
    }

    // If we have unmatched opening brackets, it's invalid
    return squareBrackets === 0;
  }

  private formatPermissions(mode: number, isDirectory: boolean): string {
    // Convert numeric mode to Unix-style permission string (Claude Code expects 9 chars only)
    const permissions = [
      // Owner permissions
      mode & 0o400 ? "r" : "-",
      mode & 0o200 ? "w" : "-",
      mode & 0o100 ? "x" : "-",
      // Group permissions
      mode & 0o040 ? "r" : "-",
      mode & 0o020 ? "w" : "-",
      mode & 0o010 ? "x" : "-",
      // Other permissions
      mode & 0o004 ? "r" : "-",
      mode & 0o002 ? "w" : "-",
      mode & 0o001 ? "x" : "-",
    ].join("");

    return permissions;
  }

  private emitTelemetry(
    success: boolean,
    duration: number,
    itemsProcessed: number = 0,
    error?: any,
    filesFound?: number,
    directoriesFound?: number,
  ): void {
    this.emit("telemetry", {
      tool: "list",
      success,
      duration,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      itemsProcessed,
      filesFound,
      directoriesFound,
      error: error?.message,
      cancelled: false,
    });
  }
}
