import { EventEmitter } from "events";
import { ProfileManager } from "./ProfileManager.js";
import { AuditLogger } from "./AuditLogger.js";
import { RuleEngine } from "./RuleEngine.js";
import { SafetyGuard } from "./SafetyGuard.js";
import { RiskAssessment } from "./RiskAssessment.js";
import {
  PermissionQuery,
  PermissionResult,
  PermissionAction,
  Profile,
  Rule,
} from "./types.js";

export interface PermissionManagerOptions {
  profileManager: ProfileManager;
  auditLogger: AuditLogger;
  configPath?: string;
  enableSafetyGuards?: boolean;
  enableRiskAssessment?: boolean;
}

/**
 * Central permission management system that coordinates all permission components
 */
export class PermissionManager extends EventEmitter {
  private profileManager: ProfileManager;
  private auditLogger: AuditLogger;
  private ruleEngine: RuleEngine;
  private safetyGuard: SafetyGuard;
  private riskAssessment: RiskAssessment;
  private options: Required<PermissionManagerOptions>;

  constructor(options: PermissionManagerOptions) {
    super();

    this.options = {
      configPath: options.configPath || ".plato/permissions.yml",
      enableSafetyGuards: options.enableSafetyGuards ?? true,
      enableRiskAssessment: options.enableRiskAssessment ?? true,
      ...options,
    };

    this.profileManager = options.profileManager;
    this.auditLogger = options.auditLogger;
    this.ruleEngine = new RuleEngine({ enableCache: true });
    this.safetyGuard = new SafetyGuard();
    this.riskAssessment = new RiskAssessment();

    this.setupEventListeners();
  }

  /**
   * Initialize the permission manager
   */
  async initialize(): Promise<void> {
    // Initialize components
    await this.auditLogger.initialize?.();

    // Load initial configuration
    await this.profileManager.loadProfiles();

    this.emit("initialized");
  }

  /**
   * Main permission checking method
   */
  async checkPermission(query: PermissionQuery): Promise<PermissionResult> {
    const startTime = Date.now();

    try {
      // 1. Safety guard checks first
      if (this.options.enableSafetyGuards) {
        const safetyResult = this.safetyGuard.validateOperation(query);
        if (!safetyResult.valid) {
          return this.createResult(
            "deny",
            query,
            safetyResult.reason || "Safety guard violation",
            startTime,
          );
        }
      }

      // 2. Get current profile
      const currentProfile = this.profileManager.getCurrentProfile();
      if (!currentProfile) {
        return this.createResult("deny", query, "No active profile", startTime);
      }

      // 3. Rule evaluation
      const ruleResult = await this.ruleEngine.evaluatePermission(
        query,
        currentProfile.rules,
        currentProfile.defaults,
        currentProfile,
      );
      if (ruleResult) {
        return this.createResult(
          ruleResult.action,
          query,
          ruleResult.reason,
          startTime,
        );
      }

      // 4. Risk assessment (if enabled)
      if (this.options.enableRiskAssessment) {
        const riskLevel = RiskAssessment.assessRisk(query);
        if (riskLevel.level === "critical") {
          return this.createResult(
            "deny",
            query,
            `Critical risk: ${riskLevel.factors.join(", ")}`,
            startTime,
          );
        }
        if (riskLevel.level === "high") {
          return this.createResult(
            "confirm",
            query,
            `High risk: ${riskLevel.factors.join(", ")}`,
            startTime,
          );
        }
      }

      // 5. Fall back to profile defaults
      const defaultAction = this.getDefaultAction(query, currentProfile);
      return this.createResult(
        defaultAction,
        query,
        "Default policy",
        startTime,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return this.createResult(
        "deny",
        query,
        `Permission check failed: ${errorMsg}`,
        startTime,
      );
    }
  }

  /**
   * Get default action from profile
   */
  private getDefaultAction(
    query: PermissionQuery,
    profile: Profile,
  ): PermissionAction {
    // Map tool types to profile defaults
    const toolMapping: Record<string, string> = {
      mcp_operation: "network_request",
      mcp_call: "network_request",
      fs_write: "fs_write",
      fs_read: "fs_read",
      shell_execute: "shell_execute",
      bash: "shell_execute",
      git: "shell_execute",
    };

    const defaultKey = toolMapping[query.tool] || "fs_write";
    return profile.defaults[defaultKey] || "confirm";
  }

  /**
   * Create a permission result with audit logging
   */
  private async createResult(
    action: PermissionAction,
    query: PermissionQuery,
    reason: string,
    startTime: number,
  ): Promise<PermissionResult> {
    const result: PermissionResult = {
      action,
      reason,
      timestamp: new Date(),
      profile: this.profileManager.getCurrentProfile() || undefined,
      confidence: 1.0,
    };

    // Audit log the decision
    await this.auditLogger.logPermissionDecision(query, result);

    // Emit event
    this.emit("permissionChecked", { query, result });

    return result;
  }

  /**
   * Add a temporary rule
   */
  async addTemporaryRule(rule: Rule, duration?: number): Promise<void> {
    const currentProfile = this.profileManager.getCurrentProfile();
    if (!currentProfile) {
      throw new Error("No active profile to add rule to");
    }

    const tempRule: Rule = {
      ...rule,
      id: `temp_${Date.now()}`,
      expiration: duration ? new Date(Date.now() + duration) : undefined,
    };

    this.profileManager.addTemporaryRule(tempRule);
    this.emit("ruleAdded", { rule: tempRule, profile: currentProfile.name });
  }

  /**
   * Get permission statistics
   */
  async getStatistics(): Promise<any> {
    return await this.auditLogger.getStatistics();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.profileManager.on("profileChanged", (event) => {
      this.emit("profileChanged", event);
    });

    this.auditLogger.on("logRotated", (data) => {
      this.emit("auditLogRotated", data);
    });
  }

  /**
   * Get the profile manager (for UI components)
   */
  getProfileManager(): ProfileManager {
    return this.profileManager;
  }

  /**
   * Get the audit logger (for UI components)
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Get safe mode status
   */
  isSafeMode(): boolean {
    // SafetyGuard doesn't have safe mode methods, return false for now
    return false;
  }

  /**
   * Set safe mode
   */
  setSafeMode(enabled: boolean): void {
    // SafetyGuard doesn't have safe mode methods, no-op for now
    this.emit("safeModeChanged", enabled);
  }

  /**
   * Emergency stop - disable all permissions
   */
  emergencyStop(): void {
    this.emit("emergencyStop");
    // Implementation would disable all permission checks
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.auditLogger.cleanup?.();
    this.removeAllListeners();
    this.emit("cleanup");
  }
}
