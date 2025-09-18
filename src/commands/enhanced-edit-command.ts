/**
 * Enhanced Edit Command with Multi-File Support
 * Integrates the existing EditTool with the new multi-file editing system
 */

import * as fs from "fs/promises";
import * as path from "path";
import { MultiFileEditor, EditOperation, FileEdit } from "../tools/multi-file-editor.js";
import { EditHistoryManager } from "../tools/edit-history.js";
import { EditTool } from "../tools/native/edit-tool.js";
import fg from "fast-glob";

export interface EnhancedEditOptions {
  sessionId?: string;
  useMultiFileEditor?: boolean;
  enableHistory?: boolean;
  autoSave?: boolean;
  createSession?: boolean;
  showDiff?: boolean;
  trackChanges?: boolean;
}

export interface MultiFileEditResult {
  sessionId: string;
  filesEdited: string[];
  totalChanges: number;
  errors: Array<{ file: string; error: string }>;
  diff?: string;
  summary: string;
}

/**
 * Enhanced Edit Command Handler
 * Provides multi-file editing capabilities with history tracking
 */
export class EnhancedEditCommand {
  private multiFileEditor: MultiFileEditor;
  private historyManager: EditHistoryManager;
  private editTool: EditTool;

  constructor() {
    this.multiFileEditor = new MultiFileEditor();
    this.historyManager = new EditHistoryManager();
    this.editTool = new EditTool();
  }

  /**
   * Execute enhanced edit command with multi-file support
   */
  async execute(
    args: string[],
    options: EnhancedEditOptions = {}
  ): Promise<MultiFileEditResult> {
    if (args.length === 0) {
      throw new Error("File path(s) required");
    }

    const {
      useMultiFileEditor = true,
      enableHistory = true,
      autoSave = true,
      createSession = true,
      showDiff = true,
      trackChanges = true,
    } = options;

    // Parse arguments
    const { filePaths, pattern, replacement, editOptions } = this.parseArguments(args);

    // Expand glob patterns
    const expandedPaths = await this.expandGlobPatterns(filePaths);

    if (expandedPaths.length === 0) {
      throw new Error("No files found matching the specified pattern(s)");
    }

    // Determine if we should use multi-file editor
    const shouldUseMultiFile = useMultiFileEditor && (
      expandedPaths.length > 1 ||
      options.sessionId ||
      createSession
    );

    if (shouldUseMultiFile) {
      return this.executeMultiFileEdit(
        expandedPaths,
        pattern,
        replacement,
        editOptions,
        options
      );
    } else {
      return this.executeSingleFileEdit(
        expandedPaths[0],
        pattern,
        replacement,
        editOptions,
        options
      );
    }
  }

  /**
   * Execute multi-file edit operation
   */
  private async executeMultiFileEdit(
    filePaths: string[],
    pattern?: string,
    replacement?: string,
    editOptions?: any,
    options: EnhancedEditOptions = {}
  ): Promise<MultiFileEditResult> {
    let sessionId = options.sessionId;

    // Create new session if needed
    if (!sessionId || options.createSession) {
      sessionId = await this.multiFileEditor.createSession(filePaths);

      if (options.enableHistory) {
        this.historyManager.initializeSession(sessionId);
      }
    }

    const result: MultiFileEditResult = {
      sessionId,
      filesEdited: [],
      totalChanges: 0,
      errors: [],
      summary: "",
    };

    const session = this.multiFileEditor.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Process each file
    for (const filePath of filePaths) {
      try {
        const fileEdit = session.files.get(path.resolve(filePath));
        if (!fileEdit) {
          result.errors.push({
            file: filePath,
            error: "File not found in session"
          });
          continue;
        }

        // Create edit operation
        if (pattern && replacement !== undefined) {
          const operationTemplate = await this.createEditOperation(
            filePath,
            pattern,
            replacement,
            editOptions
          );

          // Store file state before edit for history
          const fileStateBefore = { ...fileEdit };

          // Apply edit operation to the session
          await this.multiFileEditor.applyEdit(sessionId, operationTemplate);

          // Track in history if enabled
          if (options.enableHistory) {
            const fileStateAfter = session.files.get(path.resolve(filePath))!;
            // Need to create a full EditOperation for history
            const fullOperation: EditOperation = {
              ...operationTemplate,
              id: `edit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date()
            };

            this.historyManager.recordOperation(
              sessionId,
              fullOperation,
              fileStateBefore,
              fileStateAfter,
              `Edit ${path.basename(filePath)}: ${pattern} → ${replacement}`
            );
          }

          result.filesEdited.push(filePath);
          result.totalChanges++;
        }
      } catch (error) {
        result.errors.push({
          file: filePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Auto-save session if enabled
    if (options.autoSave && result.totalChanges > 0) {
      await this.multiFileEditor.saveSession(sessionId);
    }

    // Generate summary diff if requested
    if (options.showDiff && result.totalChanges > 0) {
      result.diff = await this.generateSessionDiff(sessionId);
    }

    // Generate summary
    result.summary = this.generateSummary(result);

    return result;
  }

  /**
   * Execute single file edit (legacy compatibility)
   */
  private async executeSingleFileEdit(
    filePath: string,
    pattern?: string,
    replacement?: string,
    editOptions?: any,
    options: EnhancedEditOptions = {}
  ): Promise<MultiFileEditResult> {
    const sessionId = `single-${Date.now()}`;

    try {
      // Use the native EditTool for single file operations
      const editResult = await this.editTool.execute({
        path: filePath,
        pattern,
        replacement,
        generateDiff: options.showDiff,
        ...editOptions
      });

      const result: MultiFileEditResult = {
        sessionId,
        filesEdited: editResult.success ? [filePath] : [],
        totalChanges: editResult.changes || 0,
        errors: editResult.success ? [] : [{ file: filePath, error: "Edit failed" }],
        diff: editResult.diff,
        summary: ""
      };

      result.summary = this.generateSummary(result);
      return result;
    } catch (error) {
      return {
        sessionId,
        filesEdited: [],
        totalChanges: 0,
        errors: [{ file: filePath, error: error instanceof Error ? error.message : String(error) }],
        summary: `Failed to edit ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create edit operation from command arguments
   */
  private async createEditOperation(
    filePath: string,
    pattern: string,
    replacement: string,
    options: any = {}
  ): Promise<Omit<EditOperation, "id" | "timestamp">> {
    // For now, we'll create a simple replace operation
    // This can be enhanced to support more complex operations
    return {
      type: "replace",
      filePath: path.resolve(filePath),
      position: { line: 0, column: 0 }, // Will be calculated during application
      content: replacement,
      previousContent: pattern,
      metadata: {
        pattern,
        replacement,
        options
      }
    };
  }

  /**
   * Generate diff for entire session
   */
  private async generateSessionDiff(sessionId: string): Promise<string> {
    const session = this.multiFileEditor.getSession(sessionId);
    if (!session) return "";

    let diff = "";

    for (const [filePath, fileEdit] of session.files) {
      if (fileEdit.isDirty) {
        const fileName = path.basename(filePath);
        diff += `\n--- ${fileName} (original)\n`;
        diff += `+++ ${fileName} (modified)\n`;

        // Simple line-by-line diff
        const originalLines = fileEdit.originalContent.split('\n');
        const currentLines = fileEdit.currentContent.split('\n');

        const maxLines = Math.max(originalLines.length, currentLines.length);
        for (let i = 0; i < maxLines; i++) {
          const originalLine = originalLines[i];
          const currentLine = currentLines[i];

          if (originalLine !== currentLine) {
            if (originalLine !== undefined) {
              diff += `-${originalLine}\n`;
            }
            if (currentLine !== undefined) {
              diff += `+${currentLine}\n`;
            }
          }
        }
      }
    }

    return diff;
  }

  /**
   * Parse command arguments
   */
  private parseArguments(args: string[]): {
    filePaths: string[];
    pattern?: string;
    replacement?: string;
    editOptions: any;
  } {
    const editOptions: any = {};
    const filePaths: string[] = [];
    let pattern: string | undefined;
    let replacement: string | undefined;

    let i = 0;
    while (i < args.length) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        // Handle flags
        switch (arg) {
          case '--lines':
            editOptions.lineNumber = parseInt(args[++i]);
            break;
          case '--regex':
            editOptions.regex = true;
            break;
          case '--case-insensitive':
            editOptions.caseInsensitive = true;
            break;
          case '--replace-all':
            editOptions.replaceAll = true;
            break;
          case '--no-backup':
            editOptions.backup = false;
            break;
          case '--atomic':
            editOptions.atomic = true;
            break;
          default:
            // Unknown flag, skip
            break;
        }
      } else if (filePaths.length === 0) {
        // First non-flag argument is file path(s)
        filePaths.push(arg);
      } else if (!pattern) {
        // Second argument is pattern
        pattern = arg;
      } else if (!replacement) {
        // Third argument is replacement
        replacement = arg;
      } else {
        // Additional file paths
        filePaths.push(arg);
      }

      i++;
    }

    return { filePaths, pattern, replacement, editOptions };
  }

  /**
   * Expand glob patterns to file paths
   */
  private async expandGlobPatterns(patterns: string[]): Promise<string[]> {
    const allPaths: string[] = [];

    for (const pattern of patterns) {
      try {
        // Check if it's a glob pattern
        if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
          const matches = await fg(pattern, {
            cwd: process.cwd(),
            absolute: true,
            onlyFiles: true
          });
          allPaths.push(...matches);
        } else {
          // Regular file path
          const absolutePath = path.resolve(pattern);
          try {
            await fs.access(absolutePath);
            allPaths.push(absolutePath);
          } catch {
            // File doesn't exist, but we'll let the edit tool handle the error
            allPaths.push(absolutePath);
          }
        }
      } catch (error) {
        // Glob expansion failed, treat as literal path
        allPaths.push(path.resolve(pattern));
      }
    }

    // Remove duplicates
    return [...new Set(allPaths)];
  }

  /**
   * Generate summary message
   */
  private generateSummary(result: MultiFileEditResult): string {
    if (result.totalChanges === 0 && result.errors.length === 0) {
      return "No files were edited.";
    }

    let summary = "";

    if (result.filesEdited.length > 0) {
      summary += `✅ Successfully edited ${result.filesEdited.length} file${result.filesEdited.length > 1 ? 's' : ''}`;
      if (result.totalChanges > 0) {
        summary += ` with ${result.totalChanges} change${result.totalChanges > 1 ? 's' : ''}`;
      }
      summary += "\n";
    }

    if (result.errors.length > 0) {
      summary += `❌ Failed to edit ${result.errors.length} file${result.errors.length > 1 ? 's' : ''}:\n`;
      result.errors.forEach(error => {
        summary += `  • ${error.file}: ${error.error}\n`;
      });
    }

    return summary.trim();
  }

  /**
   * Get active editing sessions
   */
  getActiveSessions(): string[] {
    // This would need to be implemented based on how sessions are tracked
    // For now, return empty array
    return [];
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): any {
    const session = this.multiFileEditor.getSession(sessionId);
    const stats = this.historyManager.getStatistics(sessionId);

    return {
      session,
      statistics: stats,
      canUndo: this.historyManager.canUndo(sessionId),
      canRedo: this.historyManager.canRedo(sessionId)
    };
  }

  /**
   * Undo last operation in session
   */
  async undo(sessionId: string): Promise<boolean> {
    const entry = await this.historyManager.undo(sessionId);
    if (!entry) return false;

    // Apply the undo operation to the multi-file editor
    // This would need more sophisticated implementation
    return true;
  }

  /**
   * Redo next operation in session
   */
  async redo(sessionId: string): Promise<boolean> {
    const entry = await this.historyManager.redo(sessionId);
    if (!entry) return false;

    // Apply the redo operation to the multi-file editor
    // This would need more sophisticated implementation
    return true;
  }

  /**
   * Save session changes
   */
  async saveSession(sessionId: string): Promise<void> {
    await this.multiFileEditor.saveSession(sessionId);
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string, save: boolean = true): Promise<void> {
    await this.multiFileEditor.closeSession(sessionId, save);
    this.historyManager.clearHistory(sessionId);
  }
}

// Export singleton instance
export const enhancedEditCommand = new EnhancedEditCommand();