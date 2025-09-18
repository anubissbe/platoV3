/**
 * Multi-File Editor Core
 * Provides unified editing sessions with cross-file change tracking
 */

import { EventEmitter } from "events";
import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";

export interface EditOperation {
  id: string;
  type: "insert" | "delete" | "replace";
  filePath: string;
  position: {
    line: number;
    column: number;
  };
  content: string;
  previousContent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ConflictState {
  hasConflicts: boolean;
  conflictType: "external_change" | "concurrent_edit" | "file_deleted";
  externalModifiedTime?: Date;
  conflicts: Array<{
    line: number;
    local: string;
    external: string;
    resolution?: "local" | "external" | "merged";
  }>;
}

export interface FileEdit {
  filePath: string;
  originalContent: string;
  currentContent: string;
  changes: EditOperation[];
  isDirty: boolean;
  lastModified: Date;
  originalModifiedTime: Date;
  conflictState?: ConflictState;
  encoding: BufferEncoding;
}

export interface EditSession {
  id: string;
  files: Map<string, FileEdit>;
  history: EditOperation[];
  currentHistoryIndex: number;
  startTime: Date;
  lastActivity: Date;
  isActive: boolean;
  metadata: {
    totalOperations: number;
    totalFilesEdited: number;
    sessionDuration: number;
  };
}

export interface MultiFileEditorOptions {
  maxHistorySize?: number;
  autoSaveInterval?: number;
  conflictDetection?: boolean;
  enableBackups?: boolean;
  workspaceRoot?: string;
}

export class MultiFileEditor extends EventEmitter {
  private sessions: Map<string, EditSession> = new Map();
  private activeSessionId: string | null = null;
  private options: Required<MultiFileEditorOptions>;
  private autoSaveTimer: NodeJS.Timeout | null = null;

  constructor(options: MultiFileEditorOptions = {}) {
    super();

    this.options = {
      maxHistorySize: options.maxHistorySize ?? 1000,
      autoSaveInterval: options.autoSaveInterval ?? 30000, // 30 seconds
      conflictDetection: options.conflictDetection ?? true,
      enableBackups: options.enableBackups ?? true,
      workspaceRoot: options.workspaceRoot ?? process.cwd()
    };

    this.startAutoSave();
  }

  /**
   * Create a new editing session
   */
  async createSession(filePaths: string[]): Promise<string> {
    const sessionId = randomUUID();
    const session: EditSession = {
      id: sessionId,
      files: new Map(),
      history: [],
      currentHistoryIndex: -1,
      startTime: new Date(),
      lastActivity: new Date(),
      isActive: true,
      metadata: {
        totalOperations: 0,
        totalFilesEdited: 0,
        sessionDuration: 0
      }
    };

    // Load all files into the session
    for (const filePath of filePaths) {
      const absolutePath = path.resolve(this.options.workspaceRoot, filePath);

      try {
        await this.addFileToSession(session, absolutePath);
      } catch (error) {
        // If file doesn't exist, create empty file edit
        const fileEdit: FileEdit = {
          filePath: absolutePath,
          originalContent: "",
          currentContent: "",
          changes: [],
          isDirty: false,
          lastModified: new Date(),
          originalModifiedTime: new Date(),
          encoding: "utf8"
        };

        session.files.set(absolutePath, fileEdit);
        this.emit("fileAdded", { sessionId, filePath: absolutePath, isNew: true });
      }
    }

    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;

    this.emit("sessionCreated", { sessionId, filePaths });
    return sessionId;
  }

  /**
   * Add a file to an existing session
   */
  private async addFileToSession(session: EditSession, filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath, "utf8");

    const fileEdit: FileEdit = {
      filePath,
      originalContent: content,
      currentContent: content,
      changes: [],
      isDirty: false,
      lastModified: new Date(),
      originalModifiedTime: stats.mtime,
      encoding: "utf8"
    };

    // Detect conflicts if enabled
    if (this.options.conflictDetection) {
      fileEdit.conflictState = await this.detectConflicts(fileEdit);
    }

    session.files.set(filePath, fileEdit);
    this.emit("fileAdded", { sessionId: session.id, filePath, isNew: false });
  }

  /**
   * Apply an edit operation to a file in the session
   */
  async applyEdit(sessionId: string, operation: Omit<EditOperation, "id" | "timestamp">): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      throw new Error(`Session ${sessionId} not found or inactive`);
    }

    const fileEdit = session.files.get(operation.filePath);
    if (!fileEdit) {
      throw new Error(`File ${operation.filePath} not found in session`);
    }

    const fullOperation: EditOperation = {
      ...operation,
      id: randomUUID(),
      timestamp: new Date()
    };

    // Apply the operation to the file content
    const updatedContent = this.applyOperationToContent(
      fileEdit.currentContent,
      fullOperation
    );

    // Update file edit state
    fileEdit.currentContent = updatedContent;
    fileEdit.changes.push(fullOperation);
    fileEdit.isDirty = fileEdit.originalContent !== updatedContent;
    fileEdit.lastModified = new Date();

    // Add to session history
    session.history.push(fullOperation);
    session.currentHistoryIndex = session.history.length - 1;
    session.lastActivity = new Date();
    session.metadata.totalOperations++;

    // Trim history if needed
    if (session.history.length > this.options.maxHistorySize) {
      session.history = session.history.slice(-this.options.maxHistorySize);
      session.currentHistoryIndex = session.history.length - 1;
    }

    // Detect conflicts after edit
    if (this.options.conflictDetection) {
      fileEdit.conflictState = await this.detectConflicts(fileEdit);
    }

    this.emit("editApplied", { sessionId, operation: fullOperation, fileEdit });
  }

  /**
   * Apply operation to text content
   */
  private applyOperationToContent(content: string, operation: EditOperation): string {
    const lines = content.split("\n");
    const { line, column } = operation.position;

    switch (operation.type) {
      case "insert":
        if (line >= lines.length) {
          // Insert at end
          lines.push(operation.content);
        } else {
          const currentLine = lines[line] || "";
          const before = currentLine.substring(0, column);
          const after = currentLine.substring(column);
          lines[line] = before + operation.content + after;
        }
        break;

      case "delete":
        if (line < lines.length) {
          const currentLine = lines[line] || "";
          const deleteLength = operation.content.length;
          const before = currentLine.substring(0, column);
          const after = currentLine.substring(column + deleteLength);
          lines[line] = before + after;
        }
        break;

      case "replace":
        if (line < lines.length) {
          const currentLine = lines[line] || "";
          const replaceLength = operation.previousContent?.length || 0;
          const before = currentLine.substring(0, column);
          const after = currentLine.substring(column + replaceLength);
          lines[line] = before + operation.content + after;
        }
        break;
    }

    return lines.join("\n");
  }

  /**
   * Get session details
   */
  getSession(sessionId: string): EditSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get active session
   */
  getActiveSession(): EditSession | null {
    return this.activeSessionId ? this.getSession(this.activeSessionId) : null;
  }

  /**
   * Get file edit from session
   */
  getFileEdit(sessionId: string, filePath: string): FileEdit | null {
    const session = this.getSession(sessionId);
    return session?.files.get(filePath) || null;
  }

  /**
   * Save all dirty files in session
   */
  async saveSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const savePromises: Promise<void>[] = [];

    for (const [filePath, fileEdit] of session.files) {
      if (fileEdit.isDirty) {
        savePromises.push(this.saveFile(sessionId, filePath));
      }
    }

    await Promise.all(savePromises);
    this.emit("sessionSaved", { sessionId });
  }

  /**
   * Save a single file
   */
  async saveFile(sessionId: string, filePath: string): Promise<void> {
    const fileEdit = this.getFileEdit(sessionId, filePath);
    if (!fileEdit) {
      throw new Error(`File ${filePath} not found in session ${sessionId}`);
    }

    // Create backup if enabled
    if (this.options.enableBackups && fileEdit.originalContent !== fileEdit.currentContent) {
      await this.createBackup(filePath);
    }

    // Write file
    await fs.writeFile(filePath, fileEdit.currentContent, fileEdit.encoding);

    // Update file edit state
    fileEdit.originalContent = fileEdit.currentContent;
    fileEdit.isDirty = false;
    fileEdit.originalModifiedTime = new Date();

    this.emit("fileSaved", { sessionId, filePath });
  }

  /**
   * Close session and cleanup
   */
  async closeSession(sessionId: string, saveChanges: boolean = true): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (saveChanges) {
      await this.saveSession(sessionId);
    }

    // Update metadata
    session.isActive = false;
    session.metadata.sessionDuration = Date.now() - session.startTime.getTime();

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }

    this.sessions.delete(sessionId);
    this.emit("sessionClosed", { sessionId, saved: saveChanges });
  }

  /**
   * Detect file conflicts
   */
  private async detectConflicts(fileEdit: FileEdit): Promise<ConflictState> {
    try {
      const stats = await fs.stat(fileEdit.filePath);

      // Check if file was modified externally
      if (stats.mtime > fileEdit.originalModifiedTime) {
        const externalContent = await fs.readFile(fileEdit.filePath, "utf8");

        if (externalContent !== fileEdit.originalContent) {
          return {
            hasConflicts: true,
            conflictType: "external_change",
            externalModifiedTime: stats.mtime,
            conflicts: this.generateConflictMarkers(
              fileEdit.originalContent,
              externalContent,
              fileEdit.currentContent
            )
          };
        }
      }
    } catch (error) {
      // File might have been deleted
      return {
        hasConflicts: true,
        conflictType: "file_deleted",
        conflicts: []
      };
    }

    return {
      hasConflicts: false,
      conflictType: "external_change",
      conflicts: []
    };
  }

  /**
   * Generate conflict markers for three-way merge
   */
  private generateConflictMarkers(
    original: string,
    external: string,
    local: string
  ): ConflictState["conflicts"] {
    const originalLines = original.split("\n");
    const externalLines = external.split("\n");
    const localLines = local.split("\n");

    const conflicts: ConflictState["conflicts"] = [];

    // Simple line-by-line conflict detection
    const maxLines = Math.max(originalLines.length, externalLines.length, localLines.length);

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || "";
      const externalLine = externalLines[i] || "";
      const localLine = localLines[i] || "";

      if (originalLine !== externalLine && originalLine !== localLine && externalLine !== localLine) {
        conflicts.push({
          line: i,
          local: localLine,
          external: externalLine
        });
      }
    }

    return conflicts;
  }

  /**
   * Create backup file
   */
  private async createBackup(filePath: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${filePath}.backup.${timestamp}`;

    try {
      await fs.copyFile(filePath, backupPath);
    } catch (error) {
      // Backup creation failed, but don't fail the main operation
      this.emit("backupFailed", { filePath, error });
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      this.autoSaveAllSessions();
    }, this.options.autoSaveInterval);
  }

  /**
   * Auto-save all active sessions
   */
  private async autoSaveAllSessions(): Promise<void> {
    const savePromises: Promise<void>[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.isActive) {
        savePromises.push(
          this.saveSession(sessionId).catch(error => {
            this.emit("autoSaveFailed", { sessionId, error });
          })
        );
      }
    }

    await Promise.all(savePromises);
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): EditSession["metadata"] | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return {
      ...session.metadata,
      sessionDuration: Date.now() - session.startTime.getTime()
    };
  }

  /**
   * List all files in session
   */
  getSessionFiles(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    return session ? Array.from(session.files.keys()) : [];
  }

  /**
   * Get dirty files in session
   */
  getDirtyFiles(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    if (!session) return [];

    return Array.from(session.files.entries())
      .filter(([_, fileEdit]) => fileEdit.isDirty)
      .map(([filePath, _]) => filePath);
  }

  /**
   * Cleanup and destroy editor
   */
  destroy(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Close all sessions
    const closePromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.closeSession(sessionId, true)
    );

    Promise.all(closePromises).then(() => {
      this.emit("destroyed");
    });
  }
}

// Export singleton instance
export const multiFileEditor = new MultiFileEditor();