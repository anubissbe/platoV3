import { minimatch } from "minimatch";
import {
  Rule,
  PermissionQuery,
  PermissionResult,
  PermissionAction,
  Profile,
  PermissionContext,
} from "./types.js";

export interface RuleEngineOptions {
  enableCache: boolean;
  cacheTimeout: number;
  debugMode: boolean;
}

export class RuleEngine {
  private compiledPatterns = new Map<string, RegExp>();
  private options: RuleEngineOptions;

  constructor(options: Partial<RuleEngineOptions> = {}) {
    this.options = {
      enableCache: true,
      cacheTimeout: 5 * 60 * 1000, // 5 minutes
      debugMode: false,
      ...options,
    };
  }

  /**
   * Evaluate permission query against rules with priority-based resolution
   */
  async evaluatePermission(
    query: PermissionQuery,
    rules: Rule[],
    defaults: Record<string, PermissionAction>,
    profile?: Profile,
  ): Promise<PermissionResult> {
    const timestamp = new Date();

    // Sort rules by priority (higher first)
    const sortedRules = this.sortRulesByPriority(rules);

    // Evaluate rules in order
    for (const rule of sortedRules) {
      if (await this.ruleMatches(rule, query)) {
        // Check rule expiration
        if (rule.expiration && rule.expiration < timestamp) {
          continue; // Skip expired rule
        }

        // Check conditional rules
        if (
          rule.conditions &&
          !(await this.evaluateConditions(rule.conditions, query))
        ) {
          continue; // Skip rule with failed conditions
        }

        return {
          action: rule.action,
          rule,
          profile,
          reason: rule.reason || this.generateReason(rule, query),
          confidence: 1.0,
          timestamp,
        };
      }
    }

    // No rule matched, use default
    const defaultAction = this.getDefaultAction(query.tool, defaults);
    return {
      action: defaultAction,
      profile,
      reason: `No specific rule found, using default: ${defaultAction}`,
      confidence: 0.5,
      timestamp,
    };
  }

  /**
   * Check if a rule matches the given query
   */
  private async ruleMatches(
    rule: Rule,
    query: PermissionQuery,
  ): Promise<boolean> {
    const { match } = rule;

    // Tool matching
    if (match.tool && !this.matchesPattern(query.tool, match.tool)) {
      return false;
    }

    // Operation matching
    if (
      match.operation &&
      query.operation &&
      !this.matchesPattern(query.operation, match.operation)
    ) {
      return false;
    }

    // Path matching (supports glob patterns)
    if (match.path && query.path && !this.matchesPath(query.path, match.path)) {
      return false;
    }

    // Command matching (supports regex)
    if (
      match.command &&
      query.command &&
      !this.matchesCommand(query.command, match.command)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Match against simple patterns with wildcards
   */
  private matchesPattern(value: string, pattern: string): boolean {
    // Convert simple pattern to regex
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
      .replace(/\\\*/g, ".*") // Convert * to .*
      .replace(/\\\?/g, "."); // Convert ? to .

    const regex = this.getCompiledRegex(`^${regexPattern}$`);
    return regex.test(value);
  }

  /**
   * Match file paths using minimatch for advanced glob patterns
   */
  private matchesPath(filePath: string, pattern: string): boolean {
    // Support multiple patterns separated by |
    const patterns = pattern.split("|");
    return patterns.some((p) =>
      minimatch(filePath, p.trim(), {
        dot: true, // Match files starting with .
        matchBase: true, // Match basename against pattern
        noext: false, // Don't ignore extension
      }),
    );
  }

  /**
   * Match commands using regex patterns
   */
  private matchesCommand(command: string, pattern: string): boolean {
    try {
      const regex = this.getCompiledRegex(pattern);
      return regex.test(command);
    } catch (error) {
      // Invalid regex, fall back to literal match
      return command.includes(pattern);
    }
  }

  /**
   * Get or compile regex pattern with caching
   */
  private getCompiledRegex(pattern: string): RegExp {
    if (!this.compiledPatterns.has(pattern)) {
      try {
        this.compiledPatterns.set(pattern, new RegExp(pattern));
      } catch (error) {
        // Invalid regex, create literal match
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        this.compiledPatterns.set(pattern, new RegExp(escaped));
      }
    }
    return this.compiledPatterns.get(pattern)!;
  }

  /**
   * Sort rules by priority (higher priority first)
   */
  private sortRulesByPriority(rules: Rule[]): Rule[] {
    return [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Evaluate conditional rules
   */
  private async evaluateConditions(
    conditions: any[],
    query: PermissionQuery,
  ): Promise<boolean> {
    for (const condition of conditions) {
      switch (condition.type) {
        case "time":
          if (!this.evaluateTimeCondition(condition.value)) {
            return false;
          }
          break;

        case "environment":
          if (
            !this.evaluateEnvironmentCondition(
              condition.value,
              this.convertToPermissionContext(query.context),
            )
          ) {
            return false;
          }
          break;

        case "file_size":
          if (
            query.path &&
            !(await this.evaluateFileSizeCondition(query.path, condition.value))
          ) {
            return false;
          }
          break;

        default:
          // Unknown condition type, assume failed
          return false;
      }
    }
    return true;
  }

  /**
   * Evaluate time-based conditions
   */
  private evaluateTimeCondition(timeRange: {
    start: string;
    end: string;
  }): boolean {
    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();

    const start = this.parseTime(timeRange.start);
    const end = this.parseTime(timeRange.end);

    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      // Overnight range (e.g., 22:00 to 06:00)
      return currentTime >= start || currentTime <= end;
    }
  }

  /**
   * Evaluate environment variable conditions
   */
  private convertToPermissionContext(
    auditContext?: any,
  ): PermissionContext | undefined {
    if (!auditContext) return undefined;

    return {
      workingDirectory:
        auditContext.workspace_path ||
        auditContext.workingDirectory ||
        process.cwd(),
      timestamp: new Date(),
      environment: auditContext.environment || {},
      currentBranch: auditContext.git_context?.branch,
      gitRepository: auditContext.git_context
        ? {
            root: auditContext.git_context.repository || "",
            remotes: [],
          }
        : undefined,
    };
  }

  private evaluateEnvironmentCondition(
    envCondition: { key: string; value: string },
    context?: PermissionContext,
  ): boolean {
    // Check context environment first, then fall back to process.env
    const envValue =
      context?.environment?.[envCondition.key] ?? process.env[envCondition.key];
    return envValue === envCondition.value;
  }

  /**
   * Evaluate file size conditions
   */
  private async evaluateFileSizeCondition(
    filePath: string,
    sizeLimit: number,
  ): Promise<boolean> {
    try {
      const fs = await import("fs/promises");
      const stats = await fs.stat(filePath);
      return stats.size <= sizeLimit;
    } catch (error) {
      // File doesn't exist or can't be accessed
      return true; // Allow operation
    }
  }

  /**
   * Parse time string to minutes from midnight
   */
  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 100 + minutes;
  }

  /**
   * Get default action for a tool
   */
  private getDefaultAction(
    tool: string,
    defaults: Record<string, PermissionAction>,
  ): PermissionAction {
    // Try exact match first
    if (defaults[tool]) {
      return defaults[tool];
    }

    // Try pattern matching for tools like "fs_*"
    for (const [pattern, action] of Object.entries(defaults)) {
      if (this.matchesPattern(tool, pattern)) {
        return action;
      }
    }

    // Global default
    return "confirm";
  }

  /**
   * Generate human-readable reason for rule match
   */
  private generateReason(rule: Rule, query: PermissionQuery): string {
    const parts: string[] = [];

    if (rule.match.tool) {
      parts.push(`tool '${rule.match.tool}'`);
    }

    if (rule.match.path) {
      parts.push(`path '${rule.match.path}'`);
    }

    if (rule.match.command) {
      parts.push(`command pattern '${rule.match.command}'`);
    }

    if (rule.match.operation) {
      parts.push(`operation '${rule.match.operation}'`);
    }

    const matchDescription = parts.join(", ");
    return `Rule matched: ${matchDescription} → ${rule.action}`;
  }

  /**
   * Validate rule structure and patterns
   */
  validateRule(rule: Rule): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!rule.match) {
      errors.push("Rule must have match criteria");
    }

    if (!rule.action || !["allow", "deny", "confirm"].includes(rule.action)) {
      errors.push("Rule must have valid action (allow, deny, or confirm)");
    }

    // Validate patterns
    if (rule.match?.command) {
      try {
        new RegExp(rule.match.command);
      } catch (error) {
        errors.push(`Invalid regex pattern in command: ${rule.match.command}`);
      }
    }

    if (rule.match?.path) {
      // Basic validation for glob patterns
      const invalidChars = /[<>:"|]/;
      if (invalidChars.test(rule.match.path)) {
        errors.push(`Invalid characters in path pattern: ${rule.match.path}`);
      }
    }

    // Validate priority
    if (
      rule.priority !== undefined &&
      (rule.priority < 0 || rule.priority > 1000)
    ) {
      errors.push("Rule priority must be between 0 and 1000");
    }

    // Validate expiration
    if (rule.expiration && rule.expiration <= new Date()) {
      errors.push("Rule expiration date must be in the future");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear compiled pattern cache
   */
  clearCache(): void {
    this.compiledPatterns.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; patterns: string[] } {
    return {
      size: this.compiledPatterns.size,
      patterns: Array.from(this.compiledPatterns.keys()),
    };
  }
}
