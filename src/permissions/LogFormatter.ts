import { AuditEntry, LogFormatter, LogFormatOptions } from "./types.js";

/**
 * Comprehensive log formatting system for audit entries
 * Supports multiple output formats with customizable options
 */

export class JsonLogFormatter implements LogFormatter {
  constructor(private options: LogFormatOptions = { format: "json" }) {}

  format(entry: AuditEntry): string {
    const formattedEntry = this.prepareEntry(entry);
    return JSON.stringify(
      formattedEntry,
      null,
      this.options.format === "json" ? 0 : 2,
    );
  }

  formatBatch(entries: AuditEntry[]): string {
    const formattedEntries = entries.map((entry) => this.prepareEntry(entry));
    return JSON.stringify(formattedEntries, null, 2);
  }

  private prepareEntry(entry: AuditEntry): any {
    const result: any = {
      id: entry.id,
      timestamp: this.formatTimestamp(entry.timestamp),
      query: entry.query,
      result: {
        ...entry.result,
        timestamp: this.formatTimestamp(entry.result.timestamp),
      },
    };

    if (entry.profile) result.profile = entry.profile;
    if (entry.session_id) result.session_id = entry.session_id;
    if (entry.user_decision) result.user_decision = entry.user_decision;

    if (this.options.include_context && entry.context) {
      result.context = entry.context;
    }

    if (this.options.include_metadata && entry.metadata) {
      result.metadata = entry.metadata;
    }

    return result;
  }

  private formatTimestamp(date: Date): string {
    if (this.options.timezone) {
      return date.toLocaleString("en-US", { timeZone: this.options.timezone });
    }
    return this.options.date_format === "iso"
      ? date.toISOString()
      : date.toLocaleString();
  }
}

export class StructuredLogFormatter implements LogFormatter {
  constructor(private options: LogFormatOptions = { format: "structured" }) {}

  format(entry: AuditEntry): string {
    const parts: string[] = [
      `[${this.formatTimestamp(entry.timestamp)}]`,
      `[${entry.metadata?.level?.toUpperCase() || "INFO"}]`,
      `[${entry.metadata?.category || "permission"}]`,
      `ID=${entry.id}`,
      `TOOL=${entry.query.tool}`,
      `ACTION=${entry.result.action}`,
      `REASON="${entry.result.reason}"`,
    ];

    if (entry.profile) parts.push(`PROFILE=${entry.profile}`);
    if (entry.session_id) parts.push(`SESSION=${entry.session_id}`);
    if (entry.user_decision) parts.push(`USER_DECISION=${entry.user_decision}`);

    if (this.options.include_context && entry.context) {
      parts.push(`SOURCE=${entry.context.source}`);
      if (entry.context.git_context?.branch) {
        parts.push(`BRANCH=${entry.context.git_context.branch}`);
      }
    }

    if (this.options.include_metadata && entry.metadata) {
      if (entry.metadata.duration_ms)
        parts.push(`DURATION=${entry.metadata.duration_ms}ms`);
      if (entry.metadata.risk_score !== undefined)
        parts.push(`RISK=${entry.metadata.risk_score}`);
      if (entry.metadata.cache_hit !== undefined)
        parts.push(`CACHE_HIT=${entry.metadata.cache_hit}`);
      if (entry.metadata.tags && entry.metadata.tags.length > 0) {
        parts.push(`TAGS=${entry.metadata.tags.join(",")}`);
      }
    }

    return parts.join(" ");
  }

  formatBatch(entries: AuditEntry[]): string {
    return entries.map((entry) => this.format(entry)).join("\n");
  }

  private formatTimestamp(date: Date): string {
    return this.options.timezone
      ? date.toLocaleString("en-US", { timeZone: this.options.timezone })
      : date.toISOString();
  }
}

export class CsvLogFormatter implements LogFormatter {
  private readonly headers = [
    "id",
    "timestamp",
    "level",
    "category",
    "tool",
    "operation",
    "path",
    "action",
    "reason",
    "confidence",
    "profile",
    "session_id",
    "user_decision",
    "source",
    "git_branch",
    "duration_ms",
    "risk_score",
    "cache_hit",
    "tags",
  ];

  constructor(private options: LogFormatOptions = { format: "csv" }) {}

  format(entry: AuditEntry): string {
    const values = this.extractValues(entry);
    return this.formatCsvRow(values);
  }

  formatBatch(entries: AuditEntry[]): string {
    const separator = this.options.field_separator || ",";
    let result = this.headers.join(separator) + "\n";

    for (const entry of entries) {
      const values = this.extractValues(entry);
      result += this.formatCsvRow(values) + "\n";
    }

    return result.trim();
  }

  private extractValues(entry: AuditEntry): string[] {
    const maxLength = this.options.max_field_length || 1000;

    const truncate = (value: string): string => {
      return value.length > maxLength
        ? value.substring(0, maxLength) + "..."
        : value;
    };

    return [
      entry.id,
      this.formatTimestamp(entry.timestamp),
      entry.metadata?.level || "info",
      entry.metadata?.category || "permission",
      entry.query.tool,
      entry.query.operation || "",
      entry.query.path || "",
      entry.result.action,
      truncate(entry.result.reason),
      entry.result.confidence.toString(),
      entry.profile || "",
      entry.session_id || "",
      entry.user_decision || "",
      entry.context?.source || "",
      entry.context?.git_context?.branch || "",
      entry.metadata?.duration_ms?.toString() || "",
      entry.metadata?.risk_score?.toString() || "",
      entry.metadata?.cache_hit?.toString() || "",
      entry.metadata?.tags?.join(";") || "",
    ];
  }

  private formatCsvRow(values: string[]): string {
    const separator = this.options.field_separator || ",";
    const escapedValues = values.map((value) => {
      // Escape quotes and wrap in quotes if contains separator, quotes, or newlines
      const escaped = value.replace(/"/g, '""');
      return escaped.includes(separator) ||
        escaped.includes('"') ||
        escaped.includes("\n")
        ? `"${escaped}"`
        : escaped;
    });
    return escapedValues.join(separator);
  }

  private formatTimestamp(date: Date): string {
    return this.options.timezone
      ? date.toLocaleString("en-US", { timeZone: this.options.timezone })
      : date.toISOString();
  }
}

export class HumanReadableLogFormatter implements LogFormatter {
  constructor(
    private options: LogFormatOptions = { format: "human-readable" },
  ) {}

  format(entry: AuditEntry): string {
    const lines: string[] = [];

    // Header line with timestamp and basic info
    const timestamp = this.formatTimestamp(entry.timestamp);
    const level = entry.metadata?.level?.toUpperCase() || "INFO";
    const category = entry.metadata?.category || "permission";

    lines.push(
      `${timestamp} [${level}] [${category.toUpperCase()}] Permission Decision`,
    );
    lines.push("─".repeat(80));

    // Core decision information
    lines.push(`  📋 ID: ${entry.id}`);
    lines.push(`  🔧 Tool: ${entry.query.tool}`);
    if (entry.query.operation)
      lines.push(`  ⚙️  Operation: ${entry.query.operation}`);
    if (entry.query.path) lines.push(`  📁 Path: ${entry.query.path}`);
    if (entry.query.command) lines.push(`  💻 Command: ${entry.query.command}`);

    // Decision result
    const actionEmoji =
      entry.result.action === "allow"
        ? "✅"
        : entry.result.action === "deny"
          ? "❌"
          : "⚠️";
    lines.push(`  ${actionEmoji} Action: ${entry.result.action.toUpperCase()}`);
    lines.push(`  💭 Reason: ${entry.result.reason}`);
    lines.push(
      `  🎯 Confidence: ${Math.round(entry.result.confidence * 100)}%`,
    );

    // Profile and session info
    if (entry.profile) lines.push(`  👤 Profile: ${entry.profile}`);
    if (entry.session_id) lines.push(`  🔗 Session: ${entry.session_id}`);
    if (entry.user_decision) {
      const decisionEmoji =
        entry.user_decision === "approved"
          ? "✅"
          : entry.user_decision === "denied"
            ? "❌"
            : "⏭️";
      lines.push(`  ${decisionEmoji} User Decision: ${entry.user_decision}`);
    }

    // Context information
    if (this.options.include_context && entry.context) {
      lines.push("");
      lines.push("  📍 Context:");
      lines.push(`    Source: ${entry.context.source}`);
      lines.push(`    Workspace: ${entry.context.workspace_path}`);

      if (entry.context.git_context) {
        lines.push(`    Git Branch: ${entry.context.git_context.branch}`);
        if (entry.context.git_context.commit_hash) {
          lines.push(
            `    Commit: ${entry.context.git_context.commit_hash.substring(0, 8)}`,
          );
        }
        lines.push(
          `    Clean Working Dir: ${entry.context.git_context.is_clean ? "Yes" : "No"}`,
        );
      }

      lines.push(`    Platform: ${entry.context.environment.platform}`);
      lines.push(`    Node.js: ${entry.context.environment.node_version}`);
    }

    // Metadata
    if (this.options.include_metadata && entry.metadata) {
      lines.push("");
      lines.push("  📊 Metadata:");

      if (entry.metadata.duration_ms) {
        lines.push(`    Processing Time: ${entry.metadata.duration_ms}ms`);
      }

      if (entry.metadata.risk_score !== undefined) {
        const riskEmoji =
          entry.metadata.risk_score < 33
            ? "🟢"
            : entry.metadata.risk_score < 67
              ? "🟡"
              : "🔴";
        lines.push(
          `    ${riskEmoji} Risk Score: ${entry.metadata.risk_score}/100`,
        );
      }

      if (entry.metadata.cache_hit !== undefined) {
        lines.push(`    Cache Hit: ${entry.metadata.cache_hit ? "Yes" : "No"}`);
      }

      if (entry.metadata.retry_count) {
        lines.push(`    Retries: ${entry.metadata.retry_count}`);
      }

      if (entry.metadata.tags && entry.metadata.tags.length > 0) {
        lines.push(`    Tags: ${entry.metadata.tags.join(", ")}`);
      }

      if (
        entry.metadata.compliance_flags &&
        entry.metadata.compliance_flags.length > 0
      ) {
        lines.push(
          `    Compliance: ${entry.metadata.compliance_flags.join(", ")}`,
        );
      }
    }

    return lines.join("\n") + "\n";
  }

  formatBatch(entries: AuditEntry[]): string {
    return entries
      .map((entry, index) => {
        const formatted = this.format(entry);
        return index > 0 ? "\n" + formatted : formatted;
      })
      .join("");
  }

  private formatTimestamp(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    };

    if (this.options.timezone) {
      options.timeZone = this.options.timezone;
    }

    return date.toLocaleString("en-US", options);
  }
}

/**
 * Factory function to create the appropriate formatter
 */
export function createLogFormatter(options: LogFormatOptions): LogFormatter {
  switch (options.format) {
    case "json":
      return new JsonLogFormatter(options);
    case "structured":
      return new StructuredLogFormatter(options);
    case "csv":
      return new CsvLogFormatter(options);
    case "human-readable":
      return new HumanReadableLogFormatter(options);
    default:
      throw new Error(`Unsupported log format: ${options.format}`);
  }
}

/**
 * Utility function to create context for audit entries
 */
export function createAuditContext(): import("./types").AuditContext {
  const context: import("./types").AuditContext = {
    source: "cli" as const,
    workspace_path: process.cwd(),
    environment: {
      platform: process.platform,
      node_version: process.version,
      node_env: process.env.NODE_ENV,
      user_home: process.env.HOME || process.env.USERPROFILE,
    },
  };

  // Add parent process information if available
  if (process.ppid) {
    context.parent_process = {
      pid: process.ppid,
      command: process.argv0 || "unknown",
    };
  }

  return context;
}

/**
 * Utility function to create default metadata for audit entries
 */
export function createAuditMetadata(
  level: "debug" | "info" | "warn" | "error" = "info",
): import("./types").AuditMetadata {
  return {
    version: "1.0.0",
    level,
    category: "permission",
    tags: [],
  };
}
