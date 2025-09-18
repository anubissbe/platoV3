/**
 * Autocomplete Data Provider
 * Provides command and file data sources for the autocomplete engine
 */

import glob from "fast-glob";
import * as fs from "fs/promises";
import * as path from "path";
import { SearchableItem } from "./types.js";
import { SLASH_COMMANDS } from "../slash/commands.js";

export interface ProviderConfig {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL?: number;
  /** Working directory for file scanning (default: process.cwd()) */
  workingDirectory?: string;
  /** Maximum number of files to scan (default: 10000) */
  maxFiles?: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class AutocompleteProvider {
  private config: ProviderConfig;
  private commandCache: CacheEntry<SearchableItem[]> | null = null;
  private fileCache: CacheEntry<SearchableItem[]> | null = null;

  constructor(config: ProviderConfig = {}) {
    this.config = {
      cacheTTL: 5 * 60 * 1000, // 5 minutes default
      workingDirectory: process.cwd(),
      maxFiles: 10000,
      ...config,
    };
  }

  /**
   * Get command items from SLASH_COMMANDS array
   */
  async getCommandItems(): Promise<SearchableItem[]> {
    // Check cache first
    if (this.commandCache && this.isCacheValid(this.commandCache)) {
      return this.commandCache.data;
    }

    const commandItems: SearchableItem[] = SLASH_COMMANDS.map(command => ({
      name: command.name,
      aliases: command.aliases || [],
      description: command.description || command.summary || `Execute ${command.name} command`,
      category: command.category,
      type: "command" as const,
    }));

    // Cache the results
    this.commandCache = {
      data: commandItems,
      timestamp: Date.now(),
      ttl: this.config.cacheTTL!,
    };

    return commandItems;
  }

  /**
   * Get file items from file system scan
   */
  async getFileItems(): Promise<SearchableItem[]> {
    // Check cache first
    if (this.fileCache && this.isCacheValid(this.fileCache)) {
      return this.fileCache.data;
    }

    const startTime = performance.now();

    try {
      // Define file patterns to include
      const patterns = [
        "**/*.{ts,tsx,js,jsx,json,md}",
      ];

      // Define patterns to ignore
      const ignorePatterns = [
        "node_modules/**",
        "dist/**",
        "build/**",
        ".git/**",
        "coverage/**",
        ".nyc_output/**",
        "tmp/**",
        "temp/**",
        "*.log",
        "*.cache",
      ];

      // Scan for files
      const filePaths = await glob(patterns, {
        ignore: ignorePatterns,
        absolute: false,
        onlyFiles: true,
        cwd: this.config.workingDirectory,
        suppressErrors: true,
      });

      // Limit the number of files to prevent performance issues
      const limitedFiles = filePaths.slice(0, this.config.maxFiles!);

      // Convert to SearchableItem format with metadata
      const fileItems: SearchableItem[] = await Promise.all(
        limitedFiles.map(async (filePath) => {
          try {
            const fullPath = path.resolve(this.config.workingDirectory!, filePath);
            const stats = await fs.stat(fullPath);
            const ext = path.extname(filePath);
            const basename = path.basename(filePath);
            const dirname = path.dirname(filePath);

            return {
              name: filePath,
              aliases: [basename], // Include basename as alias for easier searching
              description: this.getFileDescription(filePath, ext, stats.mtime),
              category: this.getFileCategory(ext),
              type: "file" as const,
            };
          } catch (error) {
            // If stat fails, return basic info
            return {
              name: filePath,
              aliases: [path.basename(filePath)],
              description: `File: ${filePath}`,
              category: this.getFileCategory(path.extname(filePath)),
              type: "file" as const,
            };
          }
        })
      );

      const elapsed = performance.now() - startTime;

      // Cache the results
      this.fileCache = {
        data: fileItems,
        timestamp: Date.now(),
        ttl: this.config.cacheTTL!,
      };

      // Log performance if it's slow
      if (elapsed > 100) {
        console.warn(`File scan took ${elapsed.toFixed(1)}ms for ${fileItems.length} files`);
      }

      return fileItems;
    } catch (error) {
      console.warn(`File scanning failed: ${error}`);
      return [];
    }
  }

  /**
   * Get all items (commands + files)
   */
  async getAllItems(): Promise<SearchableItem[]> {
    const [commands, files] = await Promise.all([
      this.getCommandItems(),
      this.getFileItems(),
    ]);

    return [...commands, ...files];
  }

  /**
   * Invalidate cache to force refresh
   */
  invalidateCache(): void {
    this.commandCache = null;
    this.fileCache = null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    commands: { cached: boolean; age?: number; items?: number };
    files: { cached: boolean; age?: number; items?: number };
  } {
    const now = Date.now();

    return {
      commands: this.commandCache
        ? {
            cached: this.isCacheValid(this.commandCache),
            age: now - this.commandCache.timestamp,
            items: this.commandCache.data.length,
          }
        : { cached: false },
      files: this.fileCache
        ? {
            cached: this.isCacheValid(this.fileCache),
            age: now - this.fileCache.timestamp,
            items: this.fileCache.data.length,
          }
        : { cached: false },
    };
  }

  // Private helper methods

  private isCacheValid<T>(cache: CacheEntry<T>): boolean {
    return Date.now() - cache.timestamp < cache.ttl;
  }

  private getFileDescription(filePath: string, ext: string, mtime: Date): string {
    const relativeTime = this.getRelativeTime(mtime);
    const fileType = this.getFileTypeDescription(ext);
    const dir = path.dirname(filePath);

    if (dir === ".") {
      return `${fileType} (${relativeTime})`;
    }
    return `${fileType} in ${dir} (${relativeTime})`;
  }

  private getFileCategory(ext: string): string {
    const categoryMap: Record<string, string> = {
      ".ts": "TypeScript",
      ".tsx": "React TypeScript",
      ".js": "JavaScript",
      ".jsx": "React JavaScript",
      ".json": "Configuration",
      ".md": "Documentation",
      ".yml": "Configuration",
      ".yaml": "Configuration",
      ".toml": "Configuration",
      ".env": "Configuration",
    };

    return categoryMap[ext] || "File";
  }

  private getFileTypeDescription(ext: string): string {
    const typeMap: Record<string, string> = {
      ".ts": "TypeScript file",
      ".tsx": "React TypeScript component",
      ".js": "JavaScript file",
      ".jsx": "React JavaScript component",
      ".json": "JSON configuration",
      ".md": "Markdown document",
      ".yml": "YAML configuration",
      ".yaml": "YAML configuration",
      ".toml": "TOML configuration",
      ".env": "Environment variables",
    };

    return typeMap[ext] || "File";
  }

  private getRelativeTime(date: Date): string {
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return "just now";
    }
  }
}

/**
 * Factory function to create a new autocomplete provider
 */
export function createAutocompleteProvider(config?: ProviderConfig): AutocompleteProvider {
  return new AutocompleteProvider(config);
}