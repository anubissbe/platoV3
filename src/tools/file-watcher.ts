/**
 * File Watcher Module
 * Provides real-time file system monitoring for Claude Code parity
 */

import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";

export interface WatcherOptions {
  persistent?: boolean;
  recursive?: boolean;
  encoding?: BufferEncoding;
  signal?: AbortSignal;
}

export interface FileChangeEvent {
  type: "change" | "rename" | "create" | "delete";
  filename: string;
  fullPath: string;
  timestamp: number;
  stats?: fs.Stats;
}

export interface WatcherInfo {
  path: string;
  options: WatcherOptions;
  isActive: boolean;
  lastEvent?: FileChangeEvent;
  eventCount: number;
}

export class FileWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private watcherInfo: Map<string, WatcherInfo> = new Map();
  private debounceMap: Map<string, NodeJS.Timeout> = new Map();
  private debounceDelay: number = 100; // ms

  constructor(private workspaceRoot: string = process.cwd()) {
    super();
  }

  /**
   * Start watching a file or directory
   */
  watch(watchPath: string, options: WatcherOptions = {}): void {
    const absolutePath = this.resolvePath(watchPath);
    const watchKey = absolutePath;

    // Check if already watching
    if (this.watchers.has(watchKey)) {
      throw new Error(`Already watching: ${watchPath}`);
    }

    // Verify path exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Path does not exist: ${watchPath}`);
    }

    try {
      const fsWatcher = fs.watch(absolutePath, {
        persistent: options.persistent !== false,
        recursive: options.recursive || false,
        encoding: options.encoding || "utf8",
        signal: options.signal
      }, (eventType, filename) => {
        this.handleFileSystemEvent(watchKey, eventType, filename || "");
      });

      fsWatcher.on("error", (error) => {
        this.emit("error", { watchPath: absolutePath, error });
      });

      fsWatcher.on("close", () => {
        this.emit("close", { watchPath: absolutePath });
        this.cleanup(watchKey);
      });

      this.watchers.set(watchKey, fsWatcher);
      this.watcherInfo.set(watchKey, {
        path: absolutePath,
        options,
        isActive: true,
        eventCount: 0
      });

      this.emit("watch-start", { watchPath: absolutePath, options });
    } catch (error) {
      throw new Error(`Failed to watch ${watchPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stop watching a specific path
   */
  unwatch(watchPath: string): boolean {
    const absolutePath = this.resolvePath(watchPath);
    const watchKey = absolutePath;

    const watcher = this.watchers.get(watchKey);
    if (!watcher) {
      return false;
    }

    try {
      watcher.close();
      this.cleanup(watchKey);
      this.emit("watch-stop", { watchPath: absolutePath });
      return true;
    } catch (error) {
      this.emit("error", { watchPath: absolutePath, error });
      return false;
    }
  }

  /**
   * Stop all watchers
   */
  unwatchAll(): void {
    for (const [watchKey, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch (error) {
        this.emit("error", { watchPath: watchKey, error });
      }
    }
    this.cleanup();
  }

  /**
   * Get information about active watchers
   */
  getWatchers(): WatcherInfo[] {
    return Array.from(this.watcherInfo.values());
  }

  /**
   * Check if a path is being watched
   */
  isWatching(watchPath: string): boolean {
    const absolutePath = this.resolvePath(watchPath);
    return this.watchers.has(absolutePath);
  }

  /**
   * Set debounce delay for file events
   */
  setDebounceDelay(delay: number): void {
    this.debounceDelay = Math.max(0, delay);
  }

  // Private methods

  private handleFileSystemEvent(watchKey: string, eventType: string, filename?: string): void {
    if (!filename) return;

    const info = this.watcherInfo.get(watchKey);
    if (!info) return;

    const fullPath = path.join(info.path, filename);
    const debounceKey = `${watchKey}:${filename}`;

    // Clear existing debounce timer
    const existingTimer = this.debounceMap.get(debounceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.processFileEvent(watchKey, eventType, filename, fullPath);
      this.debounceMap.delete(debounceKey);
    }, this.debounceDelay);

    this.debounceMap.set(debounceKey, timer);
  }

  private async processFileEvent(watchKey: string, eventType: string, filename: string, fullPath: string): Promise<void> {
    const info = this.watcherInfo.get(watchKey);
    if (!info) return;

    try {
      // Determine actual event type
      const exists = fs.existsSync(fullPath);
      let actualEventType: FileChangeEvent["type"];
      let stats: fs.Stats | undefined;

      if (eventType === "rename") {
        actualEventType = exists ? "create" : "delete";
      } else {
        actualEventType = "change";
      }

      // Get file stats if file exists
      if (exists) {
        try {
          stats = await fs.promises.stat(fullPath);
        } catch {
          // File might have been deleted between existence check and stat
          actualEventType = "delete";
        }
      }

      const event: FileChangeEvent = {
        type: actualEventType,
        filename,
        fullPath,
        timestamp: Date.now(),
        stats
      };

      // Update watcher info
      info.lastEvent = event;
      info.eventCount++;

      // Emit the event
      this.emit("change", event);
      this.emit(actualEventType, event);

    } catch (error) {
      this.emit("error", { watchPath: fullPath, error });
    }
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return path.normalize(filePath);
    }
    return path.resolve(this.workspaceRoot, filePath);
  }

  private cleanup(watchKey?: string): void {
    if (watchKey) {
      this.watchers.delete(watchKey);
      this.watcherInfo.delete(watchKey);

      // Clear any pending debounce timers for this watcher
      for (const [key, timer] of this.debounceMap) {
        if (key.startsWith(watchKey + ":")) {
          clearTimeout(timer);
          this.debounceMap.delete(key);
        }
      }
    } else {
      // Clean up everything
      this.watchers.clear();
      this.watcherInfo.clear();

      // Clear all debounce timers
      for (const timer of this.debounceMap.values()) {
        clearTimeout(timer);
      }
      this.debounceMap.clear();
    }
  }
}

// Convenience functions for common watching patterns

/**
 * Watch for changes in source code files
 */
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

/**
 * Watch for configuration file changes
 */
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

/**
 * Watch a single file
 */
export function watchFile(
  filePath: string,
  callback: (event: FileChangeEvent) => void
): FileWatcher {
  const watcher = new FileWatcher();
  watcher.on("change", callback);
  watcher.watch(filePath);
  return watcher;
}

// Export singleton instance
export const fileWatcher = new FileWatcher();

