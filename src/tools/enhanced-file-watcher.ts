/**
 * Enhanced File Watcher Module
 * Provides chokidar-based file system monitoring with conflict detection and performance optimizations
 */

import * as chokidar from "chokidar";
import * as fs from "fs/promises";
import { Stats } from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { EventEmitter } from "events";

export interface EnhancedWatcherOptions {
  /** Enable persistent watching (default: true) */
  persistent?: boolean;
  /** Enable recursive watching (default: true) */
  recursive?: boolean;
  /** Watch for file changes (default: true) */
  watchFiles?: boolean;
  /** Watch for directory changes (default: true) */
  watchDirs?: boolean;
  /** Paths to ignore (default: ['node_modules', '.git', 'dist', 'build']) */
  ignored?: string | string[] | ((path: string) => boolean);
  /** Debounce delay in milliseconds (default: 150) */
  debounceDelay?: number;
  /** Enable conflict detection (default: true) */
  conflictDetection?: boolean;
  /** Enable file content hashing (default: true) */
  enableHashing?: boolean;
  /** Maximum file size for hashing in bytes (default: 10MB) */
  maxHashSize?: number;
  /** Use polling for compatibility (default: false) */
  usePolling?: boolean;
  /** Polling interval in milliseconds when usePolling is true (default: 1000) */
  pollingInterval?: number;
  /** Wait for write to finish before emitting events (default: true) */
  awaitWriteFinish?: boolean;
  /** Stabilization threshold for awaitWriteFinish in milliseconds (default: 2000) */
  stabilityThreshold?: number;
}

export interface ExternalChangeEvent {
  /** Type of change detected */
  type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
  /** Full path to the changed file/directory */
  fullPath: string;
  /** Relative path from the watched directory */
  relativePath: string;
  /** Timestamp when the change was detected */
  timestamp: number;
  /** File stats if available */
  stats?: Stats;
  /** File content hash if enabled and applicable */
  contentHash?: string;
  /** Previous content hash for comparison */
  previousHash?: string;
  /** Indicates if this change conflicts with local modifications */
  isConflict?: boolean;
  /** Conflict metadata */
  conflictMetadata?: ConflictMetadata;
}

export interface ConflictMetadata {
  /** Type of conflict detected */
  conflictType: "content_modified" | "file_deleted" | "file_moved" | "permission_changed";
  /** Local modification timestamp */
  localModified?: number;
  /** External modification timestamp */
  externalModified?: number;
  /** Size difference in bytes */
  sizeDifference?: number;
  /** Description of the conflict */
  description: string;
}

export interface WatcherStats {
  /** Number of files being watched */
  watchedFiles: number;
  /** Number of directories being watched */
  watchedDirs: number;
  /** Total events processed */
  totalEvents: number;
  /** Events in the last minute */
  recentEvents: number;
  /** Average processing time per event in milliseconds */
  avgProcessingTime: number;
  /** Number of conflicts detected */
  conflictsDetected: number;
  /** Watcher start time */
  startTime: number;
  /** Last event timestamp */
  lastEventTime?: number;
}

interface FileHashCache {
  [filePath: string]: {
    hash: string;
    mtime: number;
    size: number;
  };
}

interface PendingChanges {
  [filePath: string]: {
    timer: NodeJS.Timeout;
    event: ExternalChangeEvent;
  };
}

export class EnhancedFileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private options: Required<EnhancedWatcherOptions>;
  private hashCache: FileHashCache = {};
  private pendingChanges: PendingChanges = {};
  private stats: WatcherStats;
  private processingTimes: number[] = [];
  private statsResetInterval: NodeJS.Timeout | null = null;

  constructor(options: EnhancedWatcherOptions = {}) {
    super();

    // Set default options
    this.options = {
      persistent: true,
      recursive: true,
      watchFiles: true,
      watchDirs: true,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/.next/**',
        '**/.nuxt/**',
        '**/.cache/**',
        '**/.vscode/**',
        '**/.idea/**',
        '**/tmp/**',
        '**/temp/**',
        '**/*.log',
        '**/.DS_Store',
        '**/Thumbs.db'
      ],
      debounceDelay: 150,
      conflictDetection: true,
      enableHashing: true,
      maxHashSize: 10 * 1024 * 1024, // 10MB
      usePolling: false,
      pollingInterval: 1000,
      awaitWriteFinish: true,
      stabilityThreshold: 2000,
      ...options,
    };

    this.stats = {
      watchedFiles: 0,
      watchedDirs: 0,
      totalEvents: 0,
      recentEvents: 0,
      avgProcessingTime: 0,
      conflictsDetected: 0,
      startTime: Date.now(),
    };

    // Clear recent events counter every minute
    this.statsResetInterval = setInterval(() => {
      this.stats.recentEvents = 0;
    }, 60000);
    // Allow tests to clean up properly
    if (this.statsResetInterval.unref) {
      this.statsResetInterval.unref();
    }
  }

  /**
   * Start watching a path
   */
  async watch(watchPath: string | string[]): Promise<void> {
    if (this.watcher) {
      throw new Error("Watcher is already active. Call unwatch() first.");
    }

    const chokidarOptions: chokidar.WatchOptions = {
      persistent: this.options.persistent,
      ignored: this.options.ignored,
      ignoreInitial: false,
      followSymlinks: true,
      cwd: process.cwd(),
      disableGlobbing: false,
      usePolling: this.options.usePolling,
      interval: this.options.pollingInterval,
      binaryInterval: this.options.pollingInterval * 2,
      alwaysStat: true,
      depth: this.options.recursive ? undefined : 1,
      awaitWriteFinish: this.options.awaitWriteFinish
        ? {
            stabilityThreshold: this.options.stabilityThreshold,
            pollInterval: 100,
          }
        : false,
    };

    this.watcher = chokidar.watch(watchPath, chokidarOptions);

    // Set up event handlers
    this.watcher
      .on("add", (filePath, stats) => this.handleEvent("add", filePath, stats))
      .on("change", (filePath, stats) => this.handleEvent("change", filePath, stats))
      .on("unlink", (filePath) => this.handleEvent("unlink", filePath))
      .on("addDir", (dirPath, stats) => this.handleEvent("addDir", dirPath, stats))
      .on("unlinkDir", (dirPath) => this.handleEvent("unlinkDir", dirPath))
      .on("error", (error) => this.emit("error", error))
      .on("ready", () => {
        this.emit("ready");
        this.updateWatchedCounts();
      });

    return new Promise((resolve) => {
      this.watcher!.on("ready", () => resolve());
    });
  }

  /**
   * Stop watching and clean up resources
   */
  async unwatch(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    // Clear pending timers
    Object.values(this.pendingChanges).forEach(({ timer }) => {
      clearTimeout(timer);
    });
    this.pendingChanges = {};

    // Clear stats reset interval
    if (this.statsResetInterval) {
      clearInterval(this.statsResetInterval);
      this.statsResetInterval = null;
    }

    await this.watcher.close();
    this.watcher = null;
    this.hashCache = {};
  }

  /**
   * Get current watcher statistics
   */
  getStats(): WatcherStats {
    return { ...this.stats };
  }

  /**
   * Force a conflict check on a specific file
   */
  async checkForConflicts(filePath: string): Promise<ConflictMetadata | null> {
    if (!this.options.conflictDetection) {
      return null;
    }

    try {
      const absolutePath = path.resolve(filePath);
      const stats = await fs.stat(absolutePath);
      const cachedHash = this.hashCache[absolutePath];

      if (!cachedHash) {
        return null; // No baseline for comparison
      }

      // Check if file was modified externally
      if (stats.mtime.getTime() > cachedHash.mtime) {
        const currentHash = await this.calculateFileHash(absolutePath);

        if (currentHash !== cachedHash.hash) {
          return {
            conflictType: "content_modified",
            externalModified: stats.mtime.getTime(),
            localModified: cachedHash.mtime,
            sizeDifference: stats.size - cachedHash.size,
            description: `File "${filePath}" was modified externally`,
          };
        }
      }

      return null;
    } catch (error) {
      // File might have been deleted
      if ((error as any).code === "ENOENT") {
        return {
          conflictType: "file_deleted",
          description: `File "${filePath}" was deleted externally`,
        };
      }
      throw error;
    }
  }

  /**
   * Add a file to the hash cache manually
   */
  async addToHashCache(filePath: string): Promise<void> {
    if (!this.options.enableHashing) {
      return;
    }

    try {
      const absolutePath = path.resolve(filePath);
      const stats = await fs.stat(absolutePath);

      if (stats.isFile() && stats.size <= this.options.maxHashSize) {
        const hash = await this.calculateFileHash(absolutePath);
        this.hashCache[absolutePath] = {
          hash,
          mtime: stats.mtime.getTime(),
          size: stats.size,
        };
      }
    } catch (error) {
      // Ignore errors - file might not exist or be accessible
    }
  }

  /**
   * Handle file system events
   */
  private async handleEvent(
    eventType: "add" | "change" | "unlink" | "addDir" | "unlinkDir",
    filePath: string,
    stats?: Stats
  ): Promise<void> {
    const startTime = Date.now();
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(process.cwd(), absolutePath);

    // Skip if not watching this type
    if (
      (eventType === "add" || eventType === "change" || eventType === "unlink") &&
      !this.options.watchFiles
    ) {
      return;
    }
    if ((eventType === "addDir" || eventType === "unlinkDir") && !this.options.watchDirs) {
      return;
    }

    // Create base event
    const event: ExternalChangeEvent = {
      type: eventType,
      fullPath: absolutePath,
      relativePath,
      timestamp: Date.now(),
      stats,
    };

    // Add content hash for file events
    if (
      this.options.enableHashing &&
      (eventType === "add" || eventType === "change") &&
      stats?.isFile() &&
      stats.size <= this.options.maxHashSize
    ) {
      try {
        const currentHash = await this.calculateFileHash(absolutePath);
        const previousHash = this.hashCache[absolutePath]?.hash;

        event.contentHash = currentHash;
        event.previousHash = previousHash;

        // Update hash cache
        this.hashCache[absolutePath] = {
          hash: currentHash,
          mtime: stats.mtime.getTime(),
          size: stats.size,
        };
      } catch (error) {
        // Ignore hash calculation errors
      }
    }

    // Conflict detection
    if (this.options.conflictDetection && eventType === "change") {
      const conflictMetadata = await this.checkForConflicts(absolutePath);
      if (conflictMetadata) {
        event.isConflict = true;
        event.conflictMetadata = conflictMetadata;
        this.stats.conflictsDetected++;
      }
    }

    // Handle debouncing
    if (this.options.debounceDelay > 0) {
      this.debounceEvent(event);
    } else {
      this.emitEvent(event);
    }

    // Update statistics
    const processingTime = Date.now() - startTime;
    this.updateProcessingStats(processingTime);
    this.updateWatchedCounts();
  }

  /**
   * Debounce events to prevent spam
   */
  private debounceEvent(event: ExternalChangeEvent): void {
    const key = event.fullPath;

    // Clear existing timer
    if (this.pendingChanges[key]) {
      clearTimeout(this.pendingChanges[key].timer);
    }

    // Set new timer
    this.pendingChanges[key] = {
      timer: setTimeout(() => {
        this.emitEvent(event);
        delete this.pendingChanges[key];
      }, this.options.debounceDelay),
      event,
    };
  }

  /**
   * Emit the final event
   */
  private emitEvent(event: ExternalChangeEvent): void {
    this.stats.totalEvents++;
    this.stats.recentEvents++;
    this.stats.lastEventTime = event.timestamp;

    this.emit("change", event);
    this.emit(event.type, event);

    if (event.isConflict) {
      this.emit("conflict", event);
    }
  }

  /**
   * Calculate SHA-256 hash of file content
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const stats = await fs.stat(filePath);

    // Use streaming for files larger than maxHashSize
    if (stats.size > this.options.maxHashSize) {
      // For very large files, only hash first and last chunks
      const chunkSize = 1024 * 1024; // 1MB chunks
      const buffer = Buffer.alloc(chunkSize * 2);

      const fd = await fs.open(filePath, 'r');
      try {
        // Read first chunk
        await fd.read(buffer, 0, chunkSize, 0);
        // Read last chunk
        if (stats.size > chunkSize) {
          await fd.read(buffer, chunkSize, chunkSize, stats.size - chunkSize);
        }

        // Hash the sampled content with size for uniqueness
        const hash = crypto.createHash("sha256");
        hash.update(buffer);
        hash.update(stats.size.toString());
        return hash.digest("hex");
      } finally {
        await fd.close();
      }
    } else {
      // For smaller files, read entire content
      const content = await fs.readFile(filePath);
      return crypto.createHash("sha256").update(content).digest("hex");
    }
  }

  /**
   * Update processing time statistics
   */
  private updateProcessingStats(processingTime: number): void {
    this.processingTimes.push(processingTime);

    // Keep only the last 100 measurements
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }

    // Calculate average
    this.stats.avgProcessingTime =
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
  }

  /**
   * Update watched file/directory counts
   */
  private updateWatchedCounts(): void {
    if (!this.watcher) {
      return;
    }

    const watched = this.watcher.getWatched();
    let fileCount = 0;
    let dirCount = Object.keys(watched).length;

    for (const files of Object.values(watched)) {
      fileCount += files.length;
    }

    this.stats.watchedFiles = fileCount;
    this.stats.watchedDirs = dirCount;
  }
}

/**
 * Factory function to create a new enhanced file watcher
 */
export function createEnhancedFileWatcher(options: EnhancedWatcherOptions = {}): EnhancedFileWatcher {
  return new EnhancedFileWatcher(options);
}

/**
 * Convenience function to watch a single directory with default settings
 */
export async function watchDirectory(
  dirPath: string,
  options: EnhancedWatcherOptions = {}
): Promise<EnhancedFileWatcher> {
  const watcher = createEnhancedFileWatcher(options);
  await watcher.watch(dirPath);
  return watcher;
}

/**
 * Convenience function to watch multiple paths
 */
export async function watchPaths(
  paths: string[],
  options: EnhancedWatcherOptions = {}
): Promise<EnhancedFileWatcher> {
  const watcher = createEnhancedFileWatcher(options);
  await watcher.watch(paths);
  return watcher;
}