/**
 * File Watcher Compatibility Layer
 * Provides backward compatibility between the basic and enhanced file watcher implementations
 */

import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import {
  FileWatcher as BasicFileWatcher,
  FileChangeEvent,
  WatcherOptions,
  WatcherInfo
} from "./file-watcher.js";
import {
  EnhancedFileWatcher,
  EnhancedWatcherOptions,
  ExternalChangeEvent
} from "./enhanced-file-watcher.js";

/**
 * Configuration for file watcher migration
 */
export interface FileWatcherConfig {
  /** Use enhanced file watcher (chokidar-based) instead of basic (fs.watch) */
  useEnhanced?: boolean;
  /** Enable gradual migration with fallback to fs.watch on error */
  enableFallback?: boolean;
  /** Log migration events for debugging */
  debugMigration?: boolean;
}

// Global configuration for file watcher migration
let globalConfig: FileWatcherConfig = {
  useEnhanced: false, // Start with basic by default for backward compatibility
  enableFallback: true,
  debugMigration: false
};

/**
 * Set global file watcher configuration
 */
export function setFileWatcherConfig(config: Partial<FileWatcherConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current file watcher configuration
 */
export function getFileWatcherConfig(): FileWatcherConfig {
  return { ...globalConfig };
}

/**
 * Unified FileWatcher class that provides backward compatibility
 * Can use either basic (fs.watch) or enhanced (chokidar) implementation
 */
export class FileWatcher extends EventEmitter {
  private implementation: BasicFileWatcher | EnhancedFileWatcher;
  private isEnhanced: boolean;
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    super();
    this.workspaceRoot = workspaceRoot;
    this.isEnhanced = globalConfig.useEnhanced ?? false;

    // Create the appropriate implementation
    if (this.isEnhanced) {
      this.implementation = this.createEnhancedWatcher();
    } else {
      this.implementation = new BasicFileWatcher(workspaceRoot);
    }

    // Forward all events from the implementation
    this.setupEventForwarding();

    if (globalConfig.debugMigration) {
      console.log(`[FileWatcher] Using ${this.isEnhanced ? 'enhanced (chokidar)' : 'basic (fs.watch)'} implementation`);
    }
  }

  /**
   * Create enhanced watcher with proper options mapping
   */
  private createEnhancedWatcher(): EnhancedFileWatcher {
    const enhancedWatcher = new EnhancedFileWatcher({
      persistent: true,
      recursive: true,
      debounceDelay: 100, // Match basic watcher's debounce delay
      enableHashing: false, // Disable by default for backward compatibility
      conflictDetection: false, // Disable by default for backward compatibility
      awaitWriteFinish: false // Disable for backward compatibility with basic behavior
    });

    return enhancedWatcher;
  }

  /**
   * Setup event forwarding from implementation to this wrapper
   */
  private setupEventForwarding(): void {
    if (this.isEnhanced) {
      const enhanced = this.implementation as EnhancedFileWatcher;

      // Map enhanced events to basic events
      enhanced.on("change", (event: ExternalChangeEvent) => {
        const basicEvent: FileChangeEvent = this.mapToBasicEvent(event);
        this.emit("change", basicEvent);
      });

      enhanced.on("add", (event: ExternalChangeEvent) => {
        const basicEvent: FileChangeEvent = {
          ...this.mapToBasicEvent(event),
          type: "create"
        };
        this.emit("change", basicEvent);
        this.emit("create", basicEvent);
      });

      enhanced.on("unlink", (event: ExternalChangeEvent) => {
        const basicEvent: FileChangeEvent = {
          ...this.mapToBasicEvent(event),
          type: "delete"
        };
        this.emit("change", basicEvent);
        this.emit("delete", basicEvent);
      });

      // Forward other events
      enhanced.on("error", (error: any) => this.emit("error", error));
      enhanced.on("ready", () => this.emit("ready"));
      enhanced.on("watch-start", (data: any) => this.emit("watch-start", data));
      enhanced.on("watch-stop", (data: any) => this.emit("watch-stop", data));
    } else {
      // Forward all events from basic implementation
      const basic = this.implementation as BasicFileWatcher;
      basic.on("change", (event: FileChangeEvent) => this.emit("change", event));
      basic.on("create", (event: FileChangeEvent) => this.emit("create", event));
      basic.on("delete", (event: FileChangeEvent) => this.emit("delete", event));
      basic.on("error", (error: any) => this.emit("error", error));
      basic.on("watch-start", (data: any) => this.emit("watch-start", data));
      basic.on("watch-stop", (data: any) => this.emit("watch-stop", data));
      basic.on("close", (data: any) => this.emit("close", data));
    }
  }

  /**
   * Map enhanced event to basic event format
   */
  private mapToBasicEvent(event: ExternalChangeEvent): FileChangeEvent {
    // Map event types
    let type: FileChangeEvent["type"] = "change";
    switch (event.type) {
      case "add":
      case "addDir":
        type = "create";
        break;
      case "unlink":
      case "unlinkDir":
        type = "delete";
        break;
      case "change":
        type = "change";
        break;
    }

    return {
      type,
      filename: path.basename(event.fullPath),
      fullPath: event.fullPath,
      timestamp: event.timestamp,
      stats: event.stats
    };
  }

  /**
   * Map basic options to enhanced options
   */
  private mapToEnhancedOptions(options: WatcherOptions): Partial<EnhancedWatcherOptions> {
    return {
      persistent: options.persistent,
      recursive: options.recursive,
      // Map other options as needed
    };
  }

  /**
   * Start watching a file or directory
   */
  async watch(watchPath: string, options: WatcherOptions = {}): Promise<void> {
    try {
      if (this.isEnhanced) {
        const enhanced = this.implementation as EnhancedFileWatcher;
        // Enhanced watcher takes paths in watch() and options were set in constructor
        await enhanced.watch(watchPath);
      } else {
        const basic = this.implementation as BasicFileWatcher;
        basic.watch(watchPath, options);
      }
    } catch (error) {
      if (globalConfig.enableFallback && this.isEnhanced) {
        if (globalConfig.debugMigration) {
          console.warn(`[FileWatcher] Enhanced watcher failed, falling back to basic: ${error}`);
        }

        // Fallback to basic implementation
        this.isEnhanced = false;
        this.implementation = new BasicFileWatcher(this.workspaceRoot);
        this.setupEventForwarding();

        const basic = this.implementation as BasicFileWatcher;
        basic.watch(watchPath, options);
      } else {
        throw error;
      }
    }
  }

  /**
   * Stop watching a specific path
   */
  async unwatch(watchPath?: string): Promise<boolean> {
    if (this.isEnhanced) {
      const enhanced = this.implementation as EnhancedFileWatcher;
      if (watchPath) {
        // Enhanced watcher doesn't support unwatching specific paths
        // We need to stop all watching
        await enhanced.unwatch();
        return true;
      } else {
        await enhanced.unwatch();
        return true;
      }
    } else {
      const basic = this.implementation as BasicFileWatcher;
      if (watchPath) {
        return basic.unwatch(watchPath);
      } else {
        basic.unwatchAll();
        return true;
      }
    }
  }

  /**
   * Stop all watchers
   */
  async unwatchAll(): Promise<void> {
    if (this.isEnhanced) {
      const enhanced = this.implementation as EnhancedFileWatcher;
      await enhanced.unwatch();
    } else {
      const basic = this.implementation as BasicFileWatcher;
      basic.unwatchAll();
    }
  }

  /**
   * Get information about active watchers
   */
  getWatchers(): WatcherInfo[] {
    if (this.isEnhanced) {
      const enhanced = this.implementation as EnhancedFileWatcher;
      const stats = enhanced.getStats();
      // Create synthetic watcher info from stats
      return [{
        path: this.workspaceRoot,
        options: {},
        isActive: true,
        eventCount: stats.totalEvents
      }];
    } else {
      const basic = this.implementation as BasicFileWatcher;
      return basic.getWatchers();
    }
  }

  /**
   * Check if a path is being watched
   */
  isWatching(watchPath: string): boolean {
    if (this.isEnhanced) {
      // Enhanced watcher doesn't have a direct method for this
      // We'll assume it's watching if the watcher is active
      const enhanced = this.implementation as EnhancedFileWatcher;
      const stats = enhanced.getStats();
      return stats.watchedFiles > 0 || stats.watchedDirs > 0;
    } else {
      const basic = this.implementation as BasicFileWatcher;
      return basic.isWatching(watchPath);
    }
  }

  /**
   * Set debounce delay for file events
   */
  setDebounceDelay(delay: number): void {
    if (this.isEnhanced) {
      // Enhanced watcher sets this at construction time
      // We can't change it dynamically
      if (globalConfig.debugMigration) {
        console.warn('[FileWatcher] Cannot change debounce delay on enhanced watcher after initialization');
      }
    } else {
      const basic = this.implementation as BasicFileWatcher;
      basic.setDebounceDelay(delay);
    }
  }
}

// Export convenience functions that match the original API
export function watchSourceFiles(
  directory: string,
  callback: (event: FileChangeEvent) => void,
  extensions: string[] = [".ts", ".tsx", ".js", ".jsx", ".json"]
): FileWatcher {
  const watcher = new FileWatcher();

  watcher.on("change", (event: FileChangeEvent) => {
    const ext = path.extname(event.filename);
    if (extensions.includes(ext)) {
      callback(event);
    }
  });

  watcher.watch(directory, { recursive: true });
  return watcher;
}

export function watchConfigFiles(
  directory: string,
  callback: (event: FileChangeEvent) => void,
  configFiles: string[] = ["package.json", "tsconfig.json", ".env", "plato.config.js"]
): FileWatcher {
  const watcher = new FileWatcher();

  watcher.on("change", (event: FileChangeEvent) => {
    if (configFiles.includes(event.filename)) {
      callback(event);
    }
  });

  watcher.watch(directory, { recursive: true });
  return watcher;
}

export function watchFile(filePath: string, callback: (event: FileChangeEvent) => void): FileWatcher {
  const watcher = new FileWatcher();
  watcher.on("change", callback);
  watcher.watch(filePath);
  return watcher;
}

// Export singleton instance
export const fileWatcher = new FileWatcher();

// Export types for backward compatibility
export type { FileChangeEvent, WatcherOptions, WatcherInfo } from "./file-watcher.js";