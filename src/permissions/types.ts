import { EventEmitter } from "events";

// Base permission types (extend existing)
export type PermissionAction = "allow" | "deny" | "confirm";

export interface Rule {
  id?: string; // Optional ID for tracking temporary rules
  match: {
    tool?: string;
    path?: string;
    command?: string;
    operation?: string;
  };
  action: PermissionAction;
  priority?: number;
  expiration?: Date;
  reason?: string;
  conditions?: RuleCondition[];
}

export interface RuleCondition {
  type: "time" | "environment" | "file_size" | "user_confirmation";
  value: any;
}

// Profile system types
export interface ProfileActivationRule {
  branch_pattern?: string;
  env?: string;
  directory_pattern?: string;
  time_range?: {
    start: string;
    end: string;
  };
}

export interface PermissionProfile {
  name: string;
  description: string;
  activation: ProfileActivationRule;
  defaults: Record<string, PermissionAction>;
  rules: Rule[];
  inherits_from?: string;
}

export interface Profile extends PermissionProfile {
  isActive: boolean;
  lastActivated?: Date;
  activationScore?: number;
}

// Configuration types
export interface AdvancedPermissionsConfig {
  version: number;
  profiles: Record<string, PermissionProfile>;
  global_rules?: Rule[];
  project_rules?: Rule[]; // Project-level rules
  protected_paths?: string[];
  audit?: {
    enabled: boolean;
    retention_days: number;
    log_level: "debug" | "info" | "warn" | "error";
  };
  rate_limits?: Record<string, string>; // e.g., "fs_write": "10/minute"
}

// Context detection types
export interface PermissionContext {
  currentBranch?: string;
  environment: Record<string, string>;
  workingDirectory: string;
  gitRepository?: {
    root: string;
    remotes: string[];
  };
  timestamp: Date;
}

// Profile management types
export interface ProfileChangeEvent {
  previous: Profile | null;
  current: Profile | null;
  reason: "manual" | "automatic" | "forced";
}

// Permission query and result types
export interface PermissionQuery {
  tool: string;
  server?: string;
  action?: string;
  operation?: string;
  path?: string;
  command?: string;
  arguments?: any;
  context?: AuditContext;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export interface PermissionResult {
  action: PermissionAction;
  rule?: Rule;
  profile?: Profile;
  reason: string;
  confidence: number;
  timestamp: Date;
}

// Enhanced audit logging types
export interface AuditEntry {
  id: string;
  timestamp: Date;
  query: PermissionQuery;
  result: PermissionResult;
  profile?: string;
  session_id?: string;
  user_decision?: "approved" | "denied" | "skipped";
  context: AuditContext;
  metadata: AuditMetadata;
}

export interface AuditContext {
  user_agent?: string;
  request_id?: string;
  correlation_id?: string;
  source: "cli" | "api" | "ui" | "system";
  ip_address?: string;
  workspace_path: string;
  git_context?: {
    branch: string;
    commit_hash?: string;
    repository?: string;
    is_clean: boolean;
  };
  environment: {
    node_env?: string;
    platform: string;
    node_version: string;
    user_home?: string;
  };
  parent_process?: {
    pid: number;
    command: string;
  };
}

export interface AuditMetadata {
  version: string; // Schema version for backward compatibility
  level: "debug" | "info" | "warn" | "error";
  category: "permission" | "security" | "compliance" | "performance";
  tags: string[]; // For filtering and categorization
  duration_ms?: number; // Time taken to process the permission check
  retry_count?: number; // If the operation was retried
  cache_hit?: boolean; // Whether result came from cache
  performance_metrics?: {
    cpu_usage?: number;
    memory_usage?: number;
    disk_io?: number;
  };
  compliance_flags?: string[]; // Regulatory compliance markers
  risk_score?: number; // 0-100 risk assessment
}

// Log formatting types
export interface LogFormatter {
  format(entry: AuditEntry): string;
  formatBatch(entries: AuditEntry[]): string;
}

export interface LogFormatOptions {
  format: "json" | "structured" | "csv" | "human-readable";
  include_context?: boolean;
  include_metadata?: boolean;
  include_stack_trace?: boolean;
  timezone?: string;
  date_format?: string;
  field_separator?: string;
  max_field_length?: number;
}

// Audit report types
export interface AuditReport {
  id: string;
  title: string;
  description: string;
  generated_at: Date;
  time_range: {
    start: Date;
    end: Date;
  };
  filters: AuditSearchCriteria;
  summary: AuditReportSummary;
  entries: AuditEntry[];
  metadata: {
    total_entries: number;
    processed_entries: number;
    generation_time_ms: number;
    schema_version: string;
  };
}

export interface AuditReportSummary {
  total_decisions: number;
  decision_breakdown: Record<PermissionAction, number>;
  profile_usage: Record<string, number>;
  tool_usage: Record<string, number>;
  risk_distribution: {
    low: number; // 0-33
    medium: number; // 34-66
    high: number; // 67-100
  };
  compliance_status: {
    compliant: number;
    non_compliant: number;
    pending_review: number;
  };
  performance_metrics: {
    average_decision_time_ms: number;
    cache_hit_ratio: number;
    retry_rate: number;
  };
  anomalies: AuditAnomaly[];
}

export interface AuditAnomaly {
  id: string;
  type:
    | "unusual_pattern"
    | "high_risk"
    | "policy_violation"
    | "performance_degradation";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  detected_at: Date;
  affected_entries: string[]; // Entry IDs
  suggested_action?: string;
}

// Enhanced search criteria
export interface AuditSearchCriteria {
  tool?: string;
  action?: PermissionAction;
  profile?: string;
  sessionId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  // Enhanced filtering options
  level?: "debug" | "info" | "warn" | "error";
  category?: "permission" | "security" | "compliance" | "performance";
  tags?: string[];
  source?: "cli" | "api" | "ui" | "system";
  risk_score_min?: number;
  risk_score_max?: number;
  has_user_decision?: boolean;
  cache_hit?: boolean;
  git_branch?: string;
  workspace_path?: string;
  sort_by?: "timestamp" | "risk_score" | "duration_ms";
  sort_order?: "asc" | "desc";
}

// UI component types
export interface PermissionPromptProps {
  query: PermissionQuery;
  suggestedAction: PermissionAction;
  rule?: Rule;
  onDecision: (decision: "allow" | "deny" | "skip", remember?: boolean) => void;
  onElevate?: () => void;
}

export interface ProfileIndicatorProps {
  currentProfile: Profile | null;
  isActive: boolean;
  onClick?: () => void;
}

// Event types for ProfileManager
export interface ProfileManagerEvents {
  profileChanged: [ProfileChangeEvent];
  profileLoaded: [Profile[]];
  activationFailed: [Error];
  contextChanged: [PermissionContext];
  rulesChanged: [
    { type: string; rule?: Rule; ruleId?: string; count?: number },
  ];
  hotReloadEnabled: [];
  hotReloadDisabled: [];
  configReloaded: [
    { filePath: string; profileCount: number; currentProfile?: string },
  ];
  reloadError: [{ filePath: string; error: Error }];
}

// Manager interfaces
export interface IProfileManager extends EventEmitter {
  loadProfiles(): Promise<void>;
  getAllProfiles(): Profile[];
  getCurrentProfile(): Profile | null;
  switchProfile(profileName: string): Promise<boolean>;
  detectActiveProfile(): Promise<Profile | null>;
  autoActivateProfile(): Promise<void>;
  getResolvedRules(): Rule[];
  getResolvedDefaults(): Record<string, PermissionAction>;
  validateProfile(profile: PermissionProfile): Promise<boolean>;
}

export interface IAuditLogger {
  log(entry: AuditEntry): Promise<void>;
  search(criteria: Partial<AuditEntry>): Promise<AuditEntry[]>;
  cleanup(): Promise<void>;
  getStats(): Promise<{
    totalEntries: number;
    oldestEntry: Date;
    retention: number;
  }>;
}

export interface IPermissionCache {
  get(key: string): PermissionResult | undefined;
  set(key: string, result: PermissionResult, ttl?: number): void;
  invalidate(pattern?: string): void;
  clear(): void;
  stats(): { hits: number; misses: number; size: number };
}

// Error types
export class PermissionError extends Error {
  constructor(
    message: string,
    public code: string,
    public query?: PermissionQuery,
    public rule?: Rule,
  ) {
    super(message);
    this.name = "PermissionError";
  }
}

export class ProfileError extends Error {
  constructor(
    message: string,
    public profileName?: string,
  ) {
    super(message);
    this.name = "ProfileError";
  }
}

// Risk assessment types for permission prompts
export type RiskLevel = "low" | "medium" | "high" | "critical";

// Permission decision with extended metadata
export interface PermissionDecision {
  action: "allow" | "deny";
  permanent: boolean;
  timestamp: number;
  reason?: string;
  elevate?: boolean;
  duration?: number; // For temporary elevation in milliseconds
  metadata?: Record<string, any>;
}
