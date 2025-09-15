import { EventEmitter } from "events";
import fs from "fs/promises";
import path from "path";
import { AuditEntry, AuditSearchCriteria } from "./types.js";

/**
 * Configurable retention policy system for audit logs
 * Supports time-based, size-based, and content-based retention rules
 */

export interface RetentionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number; // Higher priority rules evaluated first
  conditions: RetentionCondition[];
  action: "delete" | "archive" | "compress" | "mark_for_review";
  schedule?: RetentionSchedule;
}

export interface RetentionCondition {
  type: "age" | "size" | "count" | "risk_score" | "category" | "tag" | "custom";
  operator:
    | "greater_than"
    | "less_than"
    | "equals"
    | "not_equals"
    | "contains"
    | "matches_pattern";
  value: any;
  unit?: "days" | "hours" | "minutes" | "bytes" | "kb" | "mb" | "gb";
}

export interface RetentionSchedule {
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  time?: string; // HH:MM format for daily/weekly/monthly
  day_of_week?: number; // 0-6 for weekly (0 = Sunday)
  day_of_month?: number; // 1-31 for monthly
}

export interface RetentionStats {
  rules_applied: number;
  entries_processed: number;
  entries_deleted: number;
  entries_archived: number;
  entries_compressed: number;
  bytes_freed: number;
  last_cleanup: Date;
  next_cleanup?: Date;
}

export interface RetentionPolicyOptions {
  rulesFile?: string;
  archiveDirectory?: string;
  enableAutomaticCleanup?: boolean;
  cleanupIntervalMinutes?: number;
  safetyMargin?: number; // Days to keep beyond retention period for safety
  maxBatchSize?: number;
  enableBackups?: boolean;
}

/**
 * Advanced retention policy manager
 */
export class RetentionPolicy extends EventEmitter {
  private options: Required<RetentionPolicyOptions>;
  private rules: RetentionRule[] = [];
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(options: RetentionPolicyOptions = {}) {
    super();

    this.options = {
      rulesFile:
        options.rulesFile ||
        path.join(process.cwd(), ".plato", "retention-rules.json"),
      archiveDirectory:
        options.archiveDirectory ||
        path.join(process.cwd(), ".plato", "audit-archive"),
      enableAutomaticCleanup: options.enableAutomaticCleanup !== false,
      cleanupIntervalMinutes: options.cleanupIntervalMinutes || 60, // 1 hour
      safetyMargin: options.safetyMargin || 7, // 7 days safety margin
      maxBatchSize: options.maxBatchSize || 1000,
      enableBackups: options.enableBackups !== false,
    };
  }

  /**
   * Initialize retention policy system
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.options.archiveDirectory, { recursive: true });
      await this.loadRules();

      if (this.options.enableAutomaticCleanup) {
        this.startAutomaticCleanup();
      }

      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Add or update a retention rule
   */
  async addRule(rule: Omit<RetentionRule, "id">): Promise<string> {
    const id = `rule_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const newRule: RetentionRule = {
      ...rule,
      id,
    };

    this.rules.push(newRule);
    await this.saveRules();

    this.emit("ruleAdded", newRule);
    return id;
  }

  /**
   * Remove a retention rule
   */
  async removeRule(ruleId: string): Promise<boolean> {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter((rule) => rule.id !== ruleId);

    if (this.rules.length < initialLength) {
      await this.saveRules();
      this.emit("ruleRemoved", { ruleId });
      return true;
    }

    return false;
  }

  /**
   * Get all retention rules
   */
  getRules(): RetentionRule[] {
    return [...this.rules];
  }

  /**
   * Apply retention policies to audit entries
   */
  async applyRetentionPolicies(
    entries: AuditEntry[],
    logDirectory: string,
  ): Promise<RetentionStats> {
    if (this.isRunning) {
      throw new Error("Retention policy application already in progress");
    }

    this.isRunning = true;
    const startTime = Date.now();

    const stats: RetentionStats = {
      rules_applied: 0,
      entries_processed: 0,
      entries_deleted: 0,
      entries_archived: 0,
      entries_compressed: 0,
      bytes_freed: 0,
      last_cleanup: new Date(),
    };

    try {
      // Sort rules by priority (highest first)
      const sortedRules = [...this.rules]
        .filter((rule) => rule.enabled)
        .sort((a, b) => b.priority - a.priority);

      const entriesToProcess = [...entries];
      const processedEntryIds = new Set<string>();

      for (const rule of sortedRules) {
        if (entriesToProcess.length === 0) break;

        const matchingEntries = this.evaluateRule(rule, entriesToProcess);
        if (matchingEntries.length === 0) continue;

        stats.rules_applied++;

        for (const entry of matchingEntries) {
          if (processedEntryIds.has(entry.id)) continue; // Already processed by higher priority rule

          const result = await this.executeRetentionAction(
            rule,
            entry,
            logDirectory,
          );

          if (result.success) {
            processedEntryIds.add(entry.id);
            stats.entries_processed++;
            stats.bytes_freed += result.bytesFreed || 0;

            switch (rule.action) {
              case "delete":
                stats.entries_deleted++;
                break;
              case "archive":
                stats.entries_archived++;
                break;
              case "compress":
                stats.entries_compressed++;
                break;
            }
          }

          // Respect batch size limits
          if (stats.entries_processed >= this.options.maxBatchSize) {
            break;
          }
        }

        if (stats.entries_processed >= this.options.maxBatchSize) {
          break;
        }
      }

      this.emit("retentionCompleted", stats);
      return stats;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Create default retention rules
   */
  async createDefaultRules(): Promise<void> {
    const defaultRules: Omit<RetentionRule, "id">[] = [
      {
        name: "High Risk Entry Retention",
        description: "Keep high-risk entries for extended period",
        enabled: true,
        priority: 100,
        conditions: [
          {
            type: "risk_score",
            operator: "greater_than",
            value: 70,
          },
        ],
        action: "archive",
        schedule: {
          frequency: "monthly",
          day_of_month: 1,
          time: "02:00",
        },
      },
      {
        name: "Security Event Long Retention",
        description: "Keep security-related events for compliance",
        enabled: true,
        priority: 90,
        conditions: [
          {
            type: "category",
            operator: "equals",
            value: "security",
          },
          {
            type: "age",
            operator: "greater_than",
            value: 90,
            unit: "days",
          },
        ],
        action: "compress",
        schedule: {
          frequency: "weekly",
          day_of_week: 0,
          time: "01:00",
        },
      },
      {
        name: "General Log Cleanup",
        description: "Standard cleanup of old log entries",
        enabled: true,
        priority: 10,
        conditions: [
          {
            type: "age",
            operator: "greater_than",
            value: 30,
            unit: "days",
          },
        ],
        action: "delete",
        schedule: {
          frequency: "daily",
          time: "03:00",
        },
      },
      {
        name: "Debug Level Cleanup",
        description: "Aggressively clean debug-level entries",
        enabled: true,
        priority: 20,
        conditions: [
          {
            type: "age",
            operator: "greater_than",
            value: 7,
            unit: "days",
          },
          {
            type: "risk_score",
            operator: "less_than",
            value: 30,
          },
        ],
        action: "delete",
        schedule: {
          frequency: "daily",
          time: "04:00",
        },
      },
    ];

    for (const rule of defaultRules) {
      await this.addRule(rule);
    }
  }

  /**
   * Get retention statistics
   */
  getStats(): RetentionStats {
    // This would be implemented to return current stats
    // For now, return empty stats
    return {
      rules_applied: 0,
      entries_processed: 0,
      entries_deleted: 0,
      entries_archived: 0,
      entries_compressed: 0,
      bytes_freed: 0,
      last_cleanup: new Date(),
      next_cleanup: this.calculateNextCleanup(),
    };
  }

  /**
   * Stop automatic cleanup
   */
  async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    await this.saveRules();
    this.removeAllListeners();
  }

  // Private helper methods

  private async loadRules(): Promise<void> {
    try {
      const content = await fs.readFile(this.options.rulesFile, "utf8");
      this.rules = JSON.parse(content);
      this.emit("rulesLoaded", { count: this.rules.length });
    } catch (error) {
      // Rules file doesn't exist, start with empty rules
      this.rules = [];
      await this.createDefaultRules();
      this.emit("defaultRulesCreated");
    }
  }

  private async saveRules(): Promise<void> {
    const dir = path.dirname(this.options.rulesFile);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.options.rulesFile,
      JSON.stringify(this.rules, null, 2),
      "utf8",
    );
  }

  private startAutomaticCleanup(): void {
    const intervalMs = this.options.cleanupIntervalMinutes * 60 * 1000;

    this.cleanupTimer = setInterval(() => {
      this.emit("automaticCleanupTriggered");
    }, intervalMs);
  }

  private evaluateRule(
    rule: RetentionRule,
    entries: AuditEntry[],
  ): AuditEntry[] {
    return entries.filter((entry) => {
      return rule.conditions.every((condition) =>
        this.evaluateCondition(condition, entry),
      );
    });
  }

  private evaluateCondition(
    condition: RetentionCondition,
    entry: AuditEntry,
  ): boolean {
    let actualValue: any;

    switch (condition.type) {
      case "age":
        const entryAge = Date.now() - entry.timestamp.getTime();
        const conditionAge = this.convertToMilliseconds(
          condition.value,
          condition.unit || "days",
        );
        actualValue = entryAge;
        return this.compareValues(
          actualValue,
          conditionAge,
          condition.operator,
        );

      case "risk_score":
        actualValue = entry.metadata?.risk_score || 0;
        return this.compareValues(
          actualValue,
          condition.value,
          condition.operator,
        );

      case "category":
        actualValue = entry.metadata?.category || "permission";
        return this.compareValues(
          actualValue,
          condition.value,
          condition.operator,
        );

      case "tag":
        actualValue = entry.metadata?.tags || [];
        return condition.operator === "contains"
          ? actualValue.includes(condition.value)
          : this.compareValues(
              actualValue,
              condition.value,
              condition.operator,
            );

      case "size":
        // This would need to be implemented based on entry size calculation
        actualValue = JSON.stringify(entry).length;
        const conditionBytes = this.convertToBytes(
          condition.value,
          condition.unit || "bytes",
        );
        return this.compareValues(
          actualValue,
          conditionBytes,
          condition.operator,
        );

      default:
        return false;
    }
  }

  private compareValues(actual: any, expected: any, operator: string): boolean {
    switch (operator) {
      case "greater_than":
        return actual > expected;
      case "less_than":
        return actual < expected;
      case "equals":
        return actual === expected;
      case "not_equals":
        return actual !== expected;
      case "contains":
        return Array.isArray(actual)
          ? actual.includes(expected)
          : typeof actual === "string"
            ? actual.includes(expected)
            : false;
      case "matches_pattern":
        return typeof actual === "string"
          ? new RegExp(expected).test(actual)
          : false;
      default:
        return false;
    }
  }

  private convertToMilliseconds(value: number, unit: string): number {
    switch (unit) {
      case "minutes":
        return value * 60 * 1000;
      case "hours":
        return value * 60 * 60 * 1000;
      case "days":
        return value * 24 * 60 * 60 * 1000;
      default:
        return value;
    }
  }

  private convertToBytes(value: number, unit: string): number {
    switch (unit) {
      case "kb":
        return value * 1024;
      case "mb":
        return value * 1024 * 1024;
      case "gb":
        return value * 1024 * 1024 * 1024;
      default:
        return value;
    }
  }

  private async executeRetentionAction(
    rule: RetentionRule,
    entry: AuditEntry,
    logDirectory: string,
  ): Promise<{ success: boolean; bytesFreed?: number }> {
    try {
      switch (rule.action) {
        case "delete":
          // In a real implementation, this would remove the entry from log files
          return { success: true, bytesFreed: JSON.stringify(entry).length };

        case "archive":
          const archivePath = path.join(
            this.options.archiveDirectory,
            `archived_${entry.id}.json`,
          );
          await fs.writeFile(
            archivePath,
            JSON.stringify(entry, null, 2),
            "utf8",
          );
          return { success: true };

        case "compress":
          // In a real implementation, this would compress the entry
          return {
            success: true,
            bytesFreed: Math.floor(JSON.stringify(entry).length * 0.7),
          };

        case "mark_for_review":
          // Mark entry for manual review
          this.emit("entryMarkedForReview", { entry, rule });
          return { success: true };

        default:
          return { success: false };
      }
    } catch (error) {
      this.emit("actionError", { rule, entry, error });
      return { success: false };
    }
  }

  private calculateNextCleanup(): Date | undefined {
    if (!this.options.enableAutomaticCleanup) {
      return undefined;
    }

    const now = new Date();
    const next = new Date(
      now.getTime() + this.options.cleanupIntervalMinutes * 60 * 1000,
    );
    return next;
  }
}
