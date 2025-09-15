import { execa } from "execa";
import fs from "fs/promises";
import path from "path";

/**
 * @fileoverview Patch Engine - Core Git patch operations system
 *
 * This module provides safe, Git-based patch application and management for Plato.
 * It handles unified diff processing with security validation, journaling for
 * rollback capability, and integration with Git's native patch application.
 *
 * Key features:
 * - Secure diff sanitization with path traversal protection
 * - Dry-run validation before applying patches
 * - Journal-based patch history for rollback operations
 * - Git repository integration with proper error handling
 *
 * @author Plato Team
 * @since 1.0.0
 */

/**
 * Type alias for unified diff strings
 * Represents a Git unified diff format patch
 */
export type UnifiedDiff = string;

/**
 * Validates a unified diff by performing a dry-run application
 *
 * Tests whether a patch can be applied successfully without making any changes
 * to the working directory. Uses Git's `--check` flag for validation.
 *
 * @param diff - The unified diff string to validate
 * @returns Promise resolving to validation result with conflicts if any
 * @throws {Error} When Git repository is not initialized or diff is malformed
 *
 * @example
 * ```typescript
 * const result = await dryRunApply(diffString);
 * if (result.ok) {
 *   console.log('Patch can be applied safely');
 * } else {
 *   console.error('Conflicts:', result.conflicts);
 * }
 * ```
 */
export async function dryRunApply(
  diff: UnifiedDiff,
): Promise<{ ok: boolean; conflicts: string[] }> {
  diff = sanitizeDiff(diff);
  await ensureGitRepo();
  const tmp = await writeTemp(diff);
  try {
    await execa("git", ["apply", "--check", tmp]);
    return { ok: true, conflicts: [] };
  } catch (e: any) {
    const msg = e?.stderr || e?.stdout || String(e);
    return { ok: false, conflicts: msg.split("\n").filter(Boolean) };
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/**
 * Applies a unified diff to the working directory
 *
 * Sanitizes the diff, writes it to a temporary file, and applies it using Git.
 * Records the operation in the patch journal for potential rollback.
 *
 * @param diff - The unified diff string to apply
 * @throws {Error} When Git repository is not initialized, patch fails, or conflicts exist
 *
 * @example
 * ```typescript
 * try {
 *   await apply(patchString);
 *   console.log('Patch applied successfully');
 * } catch (error) {
 *   console.error('Failed to apply patch:', error.message);
 * }
 * ```
 */
export async function apply(diff: UnifiedDiff): Promise<void> {
  diff = sanitizeDiff(diff);
  await ensureGitRepo();
  const tmp = await writeTemp(diff);
  try {
    await execa("git", ["apply", "--whitespace=nowarn", tmp]);
    await appendJournal({ action: "apply", diff });
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/**
 * Reverts a previously applied unified diff
 *
 * Applies the diff in reverse using Git's `-R` flag to undo changes.
 * Records the revert operation in the patch journal.
 *
 * @param diff - The unified diff string to revert
 * @throws {Error} When Git repository is not initialized or revert fails
 *
 * @example
 * ```typescript
 * try {
 *   await revert(previousPatchString);
 *   console.log('Patch reverted successfully');
 * } catch (error) {
 *   console.error('Failed to revert patch:', error.message);
 * }
 * ```
 */
export async function revert(diff: UnifiedDiff): Promise<void> {
  diff = sanitizeDiff(diff);
  await ensureGitRepo();
  const tmp = await writeTemp(diff);
  try {
    await execa("git", ["apply", "-R", tmp]);
    await appendJournal({ action: "revert", diff });
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/**
 * Reverts the most recently applied patch from the journal
 *
 * Searches the patch journal backwards for the last 'apply' operation and
 * reverts it. Updates the journal with the revert operation.
 *
 * @returns Promise resolving to true if a patch was reverted, false if no patches to revert
 * @throws {Error} When Git repository is not initialized or revert fails
 *
 * @example
 * ```typescript
 * const reverted = await revertLast();
 * if (reverted) {
 *   console.log('Last patch reverted successfully');
 * } else {
 *   console.log('No patches to revert');
 * }
 * ```
 */
export async function revertLast(): Promise<boolean> {
  const j = await readJournal();
  for (let i = j.length - 1; i >= 0; i--) {
    const entry = j[i];
    if (entry.action === "apply") {
      await revert(entry.diff);
      j.push({ action: "revert", diff: entry.diff, at: Date.now() });
      await writeJournal(j);
      return true;
    }
  }
  return false;
}

/**
 * Writes a diff to a temporary file in the .plato directory
 *
 * @param diff - The diff content to write
 * @returns Promise resolving to the temporary file path
 * @private
 */
async function writeTemp(diff: string) {
  const f = path.join(process.cwd(), `.plato/tmp-${Date.now()}.patch`);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, diff, "utf8");
  return f;
}

/**
 * Journal entry for tracking patch operations
 * @private
 */
type JournalEntry = {
  /** The type of operation performed */
  action: "apply" | "revert";
  /** The diff that was applied or reverted */
  diff: string;
  /** Timestamp when the operation occurred */
  at?: number;
};
const JOURNAL = path.join(process.cwd(), ".plato/journal.json");

async function appendJournal(entry: JournalEntry) {
  const j = await readJournal();
  j.push({ ...entry, at: Date.now() });
  await writeJournal(j);
}

async function readJournal(): Promise<JournalEntry[]> {
  try {
    const txt = await fs.readFile(JOURNAL, "utf8");
    return JSON.parse(txt) as JournalEntry[];
  } catch {
    return [];
  }
}

async function writeJournal(j: JournalEntry[]) {
  await fs.mkdir(path.dirname(JOURNAL), { recursive: true });
  await fs.writeFile(JOURNAL, JSON.stringify(j, null, 2), "utf8");
}

let simpleGitInstance: any = null;

/**
 * Gets a singleton instance of the simple-git library
 *
 * Lazy-loads the simple-git module and caches the instance for reuse.
 * This approach reduces initial load time and memory usage.
 *
 * @returns Promise resolving to the simple-git constructor function
 *
 * @example
 * ```typescript
 * const simpleGit = await getSimpleGit();
 * const git = simpleGit();
 * const isRepo = await git.checkIsRepo();
 * ```
 */
export async function getSimpleGit() {
  if (!simpleGitInstance) {
    const { default: simpleGit } = await import("simple-git");
    simpleGitInstance = simpleGit;
  }
  return simpleGitInstance;
}

/**
 * Ensures the current directory is a Git repository
 *
 * Verifies that Git operations can be performed by checking if the current
 * directory is initialized as a Git repository.
 *
 * @throws {Error} When the current directory is not a Git repository
 * @private
 */
async function ensureGitRepo() {
  const simpleGit = await getSimpleGit();
  const git = simpleGit();
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error(
      "Patch operations require a Git repository. Run `git init` first.",
    );
  }
}

/**
 * Sanitizes and validates a unified diff for security and compatibility
 *
 * Performs multiple security and format validations on diff input:
 * - Removes potential command injection patterns
 * - Strips control characters and null bytes
 * - Validates against path traversal attacks
 * - Normalizes line endings and encoding
 * - Ensures Git-compatible diff headers
 *
 * @param input - Raw diff string to sanitize
 * @returns Sanitized and validated diff string
 * @throws {Error} When diff contains path traversal attempts
 * @private
 *
 * @security
 * This function is critical for preventing:
 * - Command injection via $(command) or `command` substitution
 * - Path traversal attacks via ../../../ patterns
 * - Malformed patches that could cause Git errors
 */
function sanitizeDiff(input: string): string {
  let s = input || "";

  // Security: Remove potential command injection
  s = s.replace(/\$\(.+?\)/g, "");
  s = s.replace(/`.+?`/g, ""); // Remove backtick command substitution

  // Strip null bytes and control characters
  s = s.replace(/\0/g, "");
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""); // Control chars except \t \n \r

  // Remove explicit patch markers if present (with optional trailing asterisks)
  s = s.replace(/^\*\*\*\s+Begin Patch.*$/gim, "");
  s = s.replace(/^\*\*\*\s+End Patch.*$/gim, "");

  // Remove fenced code block markers like ``` or ```diff
  s = s.replace(/^```.*$/gm, "");

  // Normalize line endings and trim
  s = s.replace(/\r\n?/g, "\n").trim();

  // Security: Validate patch headers don't contain path traversal
  const lines = s.split("\n");
  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      const path = line.slice(4).trim().split(/\s+/)[0];
      if (
        path.includes("../") ||
        path.includes("..\\") ||
        path.startsWith("/")
      ) {
        throw new Error("Patch contains path traversal attempt");
      }
    }
  }

  // Ensure valid UTF-8 by encoding and decoding
  s = Buffer.from(s, "utf8").toString("utf8");

  // Ensure traditional unified diff headers use a/ and b/ prefixes for git apply friendliness
  s = s.replace(/^---\s+(?!a\/)(?!\/dev\/null)([^\n]+)$/gm, "--- a/$1");
  s = s.replace(/^\+\+\+\s+(?!b\/)(?!\/dev\/null)([^\n]+)$/gm, "+++ b/$1");

  return s;
}
