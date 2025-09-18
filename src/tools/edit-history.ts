/**
 * Edit History and Undo/Redo System
 * Provides comprehensive history management for multi-file editing with granular undo/redo
 */

import { EventEmitter } from "events";
import { EditOperation, FileEdit, EditSession } from "./multi-file-editor.js";

export interface HistoryEntry {
  id: string;
  timestamp: Date;
  sessionId: string;
  operation: EditOperation;
  fileState: {
    filePath: string;
    contentBefore: string;
    contentAfter: string;
    isDirtyBefore: boolean;
    isDirtyAfter: boolean;
  };
  description: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface HistoryBranch {
  id: string;
  name: string;
  description: string;
  parentEntryId?: string;
  entries: HistoryEntry[];
  createdAt: Date;
  isActive: boolean;
}

export interface HistorySnapshot {
  id: string;
  sessionId: string;
  timestamp: Date;
  description: string;
  fileStates: Map<string, {
    content: string;
    isDirty: boolean;
    lastModified: Date;
  }>;
  operations: EditOperation[];
  branchId: string;
}

export interface UndoRedoOptions {
  maxHistorySize?: number;
  enableBranching?: boolean;
  autoSnapshot?: boolean;
  snapshotInterval?: number; // milliseconds
  preserveFileState?: boolean;
}

export interface HistoryStatistics {
  totalOperations: number;
  undoableOperations: number;
  redoableOperations: number;
  branches: number;
  snapshots: number;
  memoryUsage: number; // bytes
  oldestEntry?: Date;
  newestEntry?: Date;
}

/**
 * Edit History Manager - Comprehensive undo/redo system for multi-file editing
 */
export class EditHistoryManager extends EventEmitter {
  private histories: Map<string, HistoryEntry[]> = new Map(); // sessionId -> entries
  private branches: Map<string, HistoryBranch> = new Map(); // branchId -> branch
  private snapshots: Map<string, HistorySnapshot> = new Map(); // snapshotId -> snapshot
  private currentPositions: Map<string, number> = new Map(); // sessionId -> position
  private activeBranches: Map<string, string> = new Map(); // sessionId -> activeBranchId
  private options: Required<UndoRedoOptions>;
  private snapshotTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(options: UndoRedoOptions = {}) {
    super();

    this.options = {
      maxHistorySize: options.maxHistorySize ?? 1000,
      enableBranching: options.enableBranching ?? true,
      autoSnapshot: options.autoSnapshot ?? true,
      snapshotInterval: options.snapshotInterval ?? 300000, // 5 minutes
      preserveFileState: options.preserveFileState ?? true,
    };
  }

  /**
   * Initialize history tracking for a session
   */
  initializeSession(sessionId: string): void {
    if (!this.histories.has(sessionId)) {
      this.histories.set(sessionId, []);
      this.currentPositions.set(sessionId, -1);

      // Create default branch
      const defaultBranch: HistoryBranch = {
        id: `${sessionId}-main`,
        name: "main",
        description: "Main editing branch",
        entries: [],
        createdAt: new Date(),
        isActive: true,
      };

      this.branches.set(defaultBranch.id, defaultBranch);
      this.activeBranches.set(sessionId, defaultBranch.id);

      // Setup auto-snapshot timer
      if (this.options.autoSnapshot) {
        this.setupAutoSnapshot(sessionId);
      }

      this.emit("sessionInitialized", { sessionId });
    }
  }

  /**
   * Record a new edit operation in history
   */
  recordOperation(
    sessionId: string,
    operation: EditOperation,
    fileStateBefore: FileEdit,
    fileStateAfter: FileEdit,
    description?: string
  ): void {
    const history = this.histories.get(sessionId);
    if (!history) {
      throw new Error(`Session ${sessionId} not initialized`);
    }

    const currentPosition = this.currentPositions.get(sessionId)!;
    const activeBranchId = this.activeBranches.get(sessionId)!;
    const activeBranch = this.branches.get(activeBranchId)!;

    // Create history entry
    const entry: HistoryEntry = {
      id: `${sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      sessionId,
      operation,
      fileState: {
        filePath: operation.filePath,
        contentBefore: fileStateBefore.currentContent,
        contentAfter: fileStateAfter.currentContent,
        isDirtyBefore: fileStateBefore.isDirty,
        isDirtyAfter: fileStateAfter.isDirty,
      },
      description: description || this.generateDescription(operation),
      canUndo: true,
      canRedo: false,
    };

    // Handle branching when inserting at non-head position
    if (this.options.enableBranching && currentPosition < history.length - 1) {
      this.createBranch(sessionId, entry, `branch-${Date.now()}`);
    } else {
      // Remove any operations after current position (traditional undo/redo)
      if (currentPosition < history.length - 1) {
        history.splice(currentPosition + 1);
        activeBranch.entries.splice(currentPosition + 1);
      }

      // Add new entry
      history.push(entry);
      activeBranch.entries.push(entry);
      this.currentPositions.set(sessionId, history.length - 1);
    }

    // Trim history if it exceeds max size
    this.trimHistory(sessionId);

    this.emit("operationRecorded", { sessionId, entry });
  }

  /**
   * Undo the last operation
   */
  async undo(sessionId: string): Promise<HistoryEntry | null> {
    const history = this.histories.get(sessionId);
    const currentPosition = this.currentPositions.get(sessionId);

    if (!history || currentPosition === undefined || currentPosition < 0) {
      return null;
    }

    const entry = history[currentPosition];
    if (!entry.canUndo) {
      return null;
    }

    // Move position back
    this.currentPositions.set(sessionId, currentPosition - 1);

    this.emit("undoPerformed", { sessionId, entry });
    return entry;
  }

  /**
   * Redo the next operation
   */
  async redo(sessionId: string): Promise<HistoryEntry | null> {
    const history = this.histories.get(sessionId);
    const currentPosition = this.currentPositions.get(sessionId);

    if (!history || currentPosition === undefined || currentPosition >= history.length - 1) {
      return null;
    }

    const nextPosition = currentPosition + 1;
    const entry = history[nextPosition];

    if (!entry) {
      return null;
    }

    // Move position forward
    this.currentPositions.set(sessionId, nextPosition);

    this.emit("redoPerformed", { sessionId, entry });
    return entry;
  }

  /**
   * Create a new branch from current position
   */
  createBranch(sessionId: string, fromEntry: HistoryEntry, branchName: string): string {
    if (!this.options.enableBranching) {
      throw new Error("Branching is disabled");
    }

    const branchId = `${sessionId}-${branchName}-${Date.now()}`;
    const branch: HistoryBranch = {
      id: branchId,
      name: branchName,
      description: `Branch created from ${fromEntry.description}`,
      parentEntryId: fromEntry.id,
      entries: [fromEntry],
      createdAt: new Date(),
      isActive: false,
    };

    this.branches.set(branchId, branch);

    // Switch to new branch
    this.switchBranch(sessionId, branchId);

    this.emit("branchCreated", { sessionId, branchId, branch });
    return branchId;
  }

  /**
   * Switch to a different branch
   */
  switchBranch(sessionId: string, branchId: string): void {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    // Deactivate current branch
    const currentBranchId = this.activeBranches.get(sessionId);
    if (currentBranchId) {
      const currentBranch = this.branches.get(currentBranchId);
      if (currentBranch) {
        currentBranch.isActive = false;
      }
    }

    // Activate new branch
    branch.isActive = true;
    this.activeBranches.set(sessionId, branchId);

    // Update history and position
    this.histories.set(sessionId, branch.entries);
    this.currentPositions.set(sessionId, branch.entries.length - 1);

    this.emit("branchSwitched", { sessionId, branchId, branch });
  }

  /**
   * Create a snapshot of current session state
   */
  createSnapshot(sessionId: string, description: string): string {
    const history = this.histories.get(sessionId);
    const activeBranchId = this.activeBranches.get(sessionId);

    if (!history || !activeBranchId) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const snapshotId = `snapshot-${sessionId}-${Date.now()}`;
    const snapshot: HistorySnapshot = {
      id: snapshotId,
      sessionId,
      timestamp: new Date(),
      description,
      fileStates: new Map(),
      operations: [...history.map(entry => entry.operation)],
      branchId: activeBranchId,
    };

    this.snapshots.set(snapshotId, snapshot);

    this.emit("snapshotCreated", { sessionId, snapshotId, snapshot });
    return snapshotId;
  }

  /**
   * Restore session from a snapshot
   */
  restoreSnapshot(snapshotId: string): void {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    const { sessionId } = snapshot;

    // Restore history and position
    const branch = this.branches.get(snapshot.branchId);
    if (branch) {
      this.histories.set(sessionId, branch.entries);
      this.currentPositions.set(sessionId, branch.entries.length - 1);
      this.activeBranches.set(sessionId, snapshot.branchId);
    }

    this.emit("snapshotRestored", { sessionId, snapshotId, snapshot });
  }

  /**
   * Get history for a session
   */
  getHistory(sessionId: string): HistoryEntry[] {
    return this.histories.get(sessionId) || [];
  }

  /**
   * Get current position in history
   */
  getCurrentPosition(sessionId: string): number {
    return this.currentPositions.get(sessionId) ?? -1;
  }

  /**
   * Check if undo is available
   */
  canUndo(sessionId: string): boolean {
    const position = this.getCurrentPosition(sessionId);
    return position >= 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(sessionId: string): boolean {
    const history = this.getHistory(sessionId);
    const position = this.getCurrentPosition(sessionId);
    return position < history.length - 1;
  }

  /**
   * Get branches for a session
   */
  getBranches(sessionId: string): HistoryBranch[] {
    return Array.from(this.branches.values()).filter(
      branch => branch.id.startsWith(sessionId)
    );
  }

  /**
   * Get active branch for a session
   */
  getActiveBranch(sessionId: string): HistoryBranch | null {
    const activeBranchId = this.activeBranches.get(sessionId);
    return activeBranchId ? this.branches.get(activeBranchId) || null : null;
  }

  /**
   * Get snapshots for a session
   */
  getSnapshots(sessionId: string): HistorySnapshot[] {
    return Array.from(this.snapshots.values()).filter(
      snapshot => snapshot.sessionId === sessionId
    );
  }

  /**
   * Get history statistics
   */
  getStatistics(sessionId: string): HistoryStatistics {
    const history = this.getHistory(sessionId);
    const branches = this.getBranches(sessionId);
    const snapshots = this.getSnapshots(sessionId);

    const currentPosition = this.getCurrentPosition(sessionId);

    let memoryUsage = 0;
    history.forEach(entry => {
      memoryUsage += JSON.stringify(entry).length * 2; // Rough estimate in bytes
    });

    const oldestEntry = history.length > 0 ? history[0]?.timestamp : undefined;
    const newestEntry = history.length > 0 ? history[history.length - 1]?.timestamp : undefined;

    return {
      totalOperations: history.length,
      undoableOperations: Math.max(0, currentPosition + 1),
      redoableOperations: Math.max(0, history.length - currentPosition - 1),
      branches: branches.length,
      snapshots: snapshots.length,
      memoryUsage,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Clear history for a session
   */
  clearHistory(sessionId: string): void {
    this.histories.delete(sessionId);
    this.currentPositions.delete(sessionId);

    // Clear related branches
    const sessionBranches = this.getBranches(sessionId);
    sessionBranches.forEach(branch => this.branches.delete(branch.id));
    this.activeBranches.delete(sessionId);

    // Clear related snapshots
    const sessionSnapshots = this.getSnapshots(sessionId);
    sessionSnapshots.forEach(snapshot => this.snapshots.delete(snapshot.id));

    // Clear auto-snapshot timer
    const timer = this.snapshotTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.snapshotTimers.delete(sessionId);
    }

    this.emit("historyCleared", { sessionId });
  }

  /**
   * Compact history by removing redundant entries
   */
  compactHistory(sessionId: string): number {
    const history = this.getHistory(sessionId);
    if (history.length === 0) return 0;

    const compacted: HistoryEntry[] = [];
    let removedCount = 0;

    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      const nextEntry = history[i + 1];

      // Skip redundant operations (e.g., consecutive identical changes)
      if (nextEntry && this.areOperationsRedundant(entry.operation, nextEntry.operation)) {
        removedCount++;
        continue;
      }

      compacted.push(entry);
    }

    // Update history
    this.histories.set(sessionId, compacted);

    // Adjust current position
    const currentPosition = this.getCurrentPosition(sessionId);
    const newPosition = Math.min(currentPosition, compacted.length - 1);
    this.currentPositions.set(sessionId, newPosition);

    this.emit("historyCompacted", { sessionId, removedCount });
    return removedCount;
  }

  /**
   * Export history to JSON
   */
  exportHistory(sessionId: string): string {
    const history = this.getHistory(sessionId);
    const branches = this.getBranches(sessionId);
    const snapshots = this.getSnapshots(sessionId);
    const statistics = this.getStatistics(sessionId);

    const exportData = {
      sessionId,
      timestamp: new Date().toISOString(),
      history,
      branches,
      snapshots,
      statistics,
      currentPosition: this.getCurrentPosition(sessionId),
      activeBranchId: this.activeBranches.get(sessionId),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import history from JSON
   */
  importHistory(jsonData: string): void {
    const data = JSON.parse(jsonData);
    const { sessionId } = data;

    // Clear existing history
    this.clearHistory(sessionId);

    // Import data
    this.histories.set(sessionId, data.history || []);
    this.currentPositions.set(sessionId, data.currentPosition ?? -1);

    if (data.branches) {
      data.branches.forEach((branch: HistoryBranch) => {
        this.branches.set(branch.id, branch);
      });
    }

    if (data.snapshots) {
      data.snapshots.forEach((snapshot: HistorySnapshot) => {
        this.snapshots.set(snapshot.id, snapshot);
      });
    }

    if (data.activeBranchId) {
      this.activeBranches.set(sessionId, data.activeBranchId);
    }

    this.emit("historyImported", { sessionId, data });
  }

  // Private helper methods

  private generateDescription(operation: EditOperation): string {
    const fileName = operation.filePath.split('/').pop() || operation.filePath;

    switch (operation.type) {
      case "insert":
        return `Insert text in ${fileName} at line ${operation.position.line + 1}`;
      case "delete":
        return `Delete text in ${fileName} at line ${operation.position.line + 1}`;
      case "replace":
        return `Replace text in ${fileName} at line ${operation.position.line + 1}`;
      default:
        return `Edit ${fileName}`;
    }
  }

  private trimHistory(sessionId: string): void {
    const history = this.histories.get(sessionId);
    if (!history || history.length <= this.options.maxHistorySize) return;

    const trimCount = history.length - this.options.maxHistorySize;
    const trimmed = history.splice(0, trimCount);

    // Adjust current position
    const currentPosition = this.getCurrentPosition(sessionId);
    this.currentPositions.set(sessionId, Math.max(-1, currentPosition - trimCount));

    this.emit("historyTrimmed", { sessionId, trimmedCount: trimCount, trimmedEntries: trimmed });
  }

  private setupAutoSnapshot(sessionId: string): void {
    const timer = setInterval(() => {
      const history = this.getHistory(sessionId);
      if (history.length > 0) {
        this.createSnapshot(sessionId, `Auto-snapshot ${new Date().toISOString()}`);
      }
    }, this.options.snapshotInterval);

    this.snapshotTimers.set(sessionId, timer);
  }

  private areOperationsRedundant(op1: EditOperation, op2: EditOperation): boolean {
    return (
      op1.filePath === op2.filePath &&
      op1.type === op2.type &&
      op1.position.line === op2.position.line &&
      op1.position.column === op2.position.column &&
      op1.content === op2.content
    );
  }

  /**
   * Destroy the history manager and cleanup resources
   */
  destroy(): void {
    // Clear all timers
    for (const timer of this.snapshotTimers.values()) {
      clearInterval(timer);
    }
    this.snapshotTimers.clear();

    // Clear all data
    this.histories.clear();
    this.branches.clear();
    this.snapshots.clear();
    this.currentPositions.clear();
    this.activeBranches.clear();

    this.emit("destroyed");
  }
}

// Export singleton instance
export const editHistoryManager = new EditHistoryManager();