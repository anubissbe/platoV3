import fs from "fs/promises";
import path from "path";
import { AuditLogger } from "./AuditLogger";
import {
  AuditEntry,
  AuditReport,
  AuditReportSummary,
  AuditAnomaly,
  AuditSearchCriteria,
  PermissionAction,
} from "./types.js";

/**
 * Comprehensive audit report generation system
 * Generates compliance reports, security assessments, and operational insights
 */

export interface ReportOptions {
  title?: string;
  description?: string;
  timeRange: {
    start: Date;
    end: Date;
  };
  includeEntries?: boolean;
  maxEntries?: number;
  format?: "json" | "html" | "pdf" | "csv";
  outputPath?: string;
  filters?: AuditSearchCriteria;
  anonymize?: boolean; // Remove sensitive data
  complianceStandards?: string[]; // e.g., ['SOX', 'GDPR', 'HIPAA']
}

export interface ComplianceStandard {
  name: string;
  requirements: string[];
  checkCompliance: (entries: AuditEntry[]) => ComplianceResult;
}

export interface ComplianceResult {
  standard: string;
  compliant: boolean;
  score: number; // 0-100
  issues: string[];
  recommendations: string[];
}

export class AuditReporter {
  private auditLogger: AuditLogger;
  private complianceStandards: Map<string, ComplianceStandard> = new Map();

  constructor(auditLogger: AuditLogger) {
    this.auditLogger = auditLogger;
    this.initializeComplianceStandards();
  }

  /**
   * Generate comprehensive audit report
   */
  async generateReport(options: ReportOptions): Promise<AuditReport> {
    const startTime = Date.now();
    const reportId = this.generateReportId();

    // Collect audit entries based on filters and time range
    const searchCriteria: AuditSearchCriteria = {
      ...options.filters,
      startDate: options.timeRange.start,
      endDate: options.timeRange.end,
      limit: options.maxEntries || 10000,
    };

    const entries = await this.auditLogger.searchEntries(searchCriteria);

    // Generate summary statistics
    const summary = await this.generateSummary(entries, options);

    // Detect anomalies
    const anomalies = await this.detectAnomalies(entries);

    // Create the report
    const report: AuditReport = {
      id: reportId,
      title:
        options.title ||
        `Audit Report - ${new Date().toISOString().split("T")[0]}`,
      description: options.description || "Automated audit log analysis report",
      generated_at: new Date(),
      time_range: options.timeRange,
      filters: searchCriteria,
      summary,
      entries: options.includeEntries ? entries : [],
      metadata: {
        total_entries: entries.length,
        processed_entries: entries.length,
        generation_time_ms: Date.now() - startTime,
        schema_version: "1.0.0",
      },
    };

    // Add anomalies to summary
    report.summary.anomalies = anomalies;

    return report;
  }

  /**
   * Generate compliance report for specific standards
   */
  async generateComplianceReport(
    standards: string[],
    options: Omit<ReportOptions, "complianceStandards">,
  ): Promise<{ report: AuditReport; compliance: ComplianceResult[] }> {
    const report = await this.generateReport({
      ...options,
      complianceStandards: standards,
    });

    const complianceResults: ComplianceResult[] = [];

    for (const standardName of standards) {
      const standard = this.complianceStandards.get(standardName);
      if (standard) {
        const result = standard.checkCompliance(report.entries);
        complianceResults.push(result);
      }
    }

    return { report, compliance: complianceResults };
  }

  /**
   * Generate security assessment report
   */
  async generateSecurityReport(options: ReportOptions): Promise<AuditReport> {
    const securityFilters: AuditSearchCriteria = {
      ...options.filters,
      category: "security",
    };

    const securityOptions = {
      ...options,
      title: "Security Assessment Report",
      description:
        "Analysis of security-related permission decisions and potential threats",
      filters: securityFilters,
    };

    const report = await this.generateReport(securityOptions);

    // Enhanced security analysis
    report.summary.risk_distribution = this.analyzeRiskDistribution(
      report.entries,
    );

    return report;
  }

  /**
   * Export report to various formats
   */
  async exportReport(
    report: AuditReport,
    format: "json" | "html" | "csv" = "json",
    outputPath?: string,
  ): Promise<string> {
    let content: string;
    let extension: string;

    switch (format) {
      case "json":
        content = JSON.stringify(report, null, 2);
        extension = "json";
        break;

      case "html":
        content = this.generateHtmlReport(report);
        extension = "html";
        break;

      case "csv":
        content = this.generateCsvReport(report);
        extension = "csv";
        break;

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    if (outputPath) {
      const finalPath = outputPath.endsWith(`.${extension}`)
        ? outputPath
        : `${outputPath}.${extension}`;
      await fs.writeFile(finalPath, content, "utf8");
      return finalPath;
    }

    return content;
  }

  /**
   * Schedule automatic report generation
   */
  async scheduleReports(schedule: {
    frequency: "daily" | "weekly" | "monthly";
    time: string; // HH:MM format
    options: ReportOptions;
    outputDirectory: string;
  }): Promise<void> {
    // This would integrate with a task scheduler
    // For now, just log the schedule
    console.log(`Report scheduled: ${schedule.frequency} at ${schedule.time}`);
    console.log(`Output directory: ${schedule.outputDirectory}`);
  }

  // Private helper methods

  private async generateSummary(
    entries: AuditEntry[],
    options: ReportOptions,
  ): Promise<AuditReportSummary> {
    const decisionBreakdown: Record<PermissionAction, number> = {
      allow: 0,
      deny: 0,
      confirm: 0,
    };

    const profileUsage: Record<string, number> = {};
    const toolUsage: Record<string, number> = {};
    let totalDecisionTime = 0;
    let cacheHits = 0;
    let retries = 0;

    for (const entry of entries) {
      // Count decisions
      decisionBreakdown[entry.result.action]++;

      // Count profile usage
      if (entry.profile) {
        profileUsage[entry.profile] = (profileUsage[entry.profile] || 0) + 1;
      }

      // Count tool usage
      toolUsage[entry.query.tool] = (toolUsage[entry.query.tool] || 0) + 1;

      // Aggregate performance metrics
      if (entry.metadata?.duration_ms) {
        totalDecisionTime += entry.metadata.duration_ms;
      }

      if (entry.metadata?.cache_hit) {
        cacheHits++;
      }

      if (entry.metadata?.retry_count && entry.metadata.retry_count > 0) {
        retries++;
      }
    }

    const averageDecisionTime =
      entries.length > 0 ? totalDecisionTime / entries.length : 0;
    const cacheHitRatio = entries.length > 0 ? cacheHits / entries.length : 0;
    const retryRate = entries.length > 0 ? retries / entries.length : 0;

    return {
      total_decisions: entries.length,
      decision_breakdown: decisionBreakdown,
      profile_usage: profileUsage,
      tool_usage: toolUsage,
      risk_distribution: this.analyzeRiskDistribution(entries),
      compliance_status: await this.analyzeCompliance(
        entries,
        options.complianceStandards,
      ),
      performance_metrics: {
        average_decision_time_ms: averageDecisionTime,
        cache_hit_ratio: cacheHitRatio,
        retry_rate: retryRate,
      },
      anomalies: [], // Will be populated by detectAnomalies
    };
  }

  private analyzeRiskDistribution(entries: AuditEntry[]): {
    low: number;
    medium: number;
    high: number;
  } {
    const distribution = { low: 0, medium: 0, high: 0 };

    for (const entry of entries) {
      const riskScore = entry.metadata?.risk_score || 0;

      if (riskScore < 33) {
        distribution.low++;
      } else if (riskScore < 67) {
        distribution.medium++;
      } else {
        distribution.high++;
      }
    }

    return distribution;
  }

  private async analyzeCompliance(
    entries: AuditEntry[],
    standards?: string[],
  ): Promise<{
    compliant: number;
    non_compliant: number;
    pending_review: number;
  }> {
    let compliant = 0;
    let nonCompliant = 0;
    let pendingReview = 0;

    for (const entry of entries) {
      // Simple compliance check based on metadata
      if (entry.metadata?.compliance_flags) {
        if (entry.metadata.compliance_flags.includes("compliant")) {
          compliant++;
        } else if (entry.metadata.compliance_flags.includes("non_compliant")) {
          nonCompliant++;
        } else {
          pendingReview++;
        }
      } else {
        pendingReview++;
      }
    }

    return {
      compliant,
      non_compliant: nonCompliant,
      pending_review: pendingReview,
    };
  }

  private async detectAnomalies(
    entries: AuditEntry[],
  ): Promise<AuditAnomaly[]> {
    const anomalies: AuditAnomaly[] = [];

    // Detect unusual patterns
    const toolCounts = new Map<string, number>();
    const actionCounts = new Map<PermissionAction, number>();
    const highRiskEntries: string[] = [];
    const performanceIssues: string[] = [];

    for (const entry of entries) {
      // Count tools and actions
      toolCounts.set(
        entry.query.tool,
        (toolCounts.get(entry.query.tool) || 0) + 1,
      );
      actionCounts.set(
        entry.result.action,
        (actionCounts.get(entry.result.action) || 0) + 1,
      );

      // Check for high risk
      if (entry.metadata?.risk_score && entry.metadata.risk_score > 80) {
        highRiskEntries.push(entry.id);
      }

      // Check for performance issues
      if (entry.metadata?.duration_ms && entry.metadata.duration_ms > 1000) {
        performanceIssues.push(entry.id);
      }
    }

    // Detect unusual tool usage (tools used excessively)
    const avgToolUsage = entries.length / toolCounts.size;
    for (const [tool, count] of toolCounts) {
      if (count > avgToolUsage * 3) {
        // More than 3x average
        anomalies.push({
          id: `anomaly_${Date.now()}_${Math.random().toString(36).substring(2)}`,
          type: "unusual_pattern",
          severity: "medium",
          description: `Tool "${tool}" used ${count} times (${((count / entries.length) * 100).toFixed(1)}% of all operations)`,
          detected_at: new Date(),
          affected_entries: [],
          suggested_action: `Review usage patterns for tool "${tool}" - may indicate automation or misuse`,
        });
      }
    }

    // Detect high risk concentration
    if (highRiskEntries.length > entries.length * 0.1) {
      // More than 10% high risk
      anomalies.push({
        id: `anomaly_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        type: "high_risk",
        severity: "high",
        description: `High concentration of high-risk operations: ${highRiskEntries.length} entries (${((highRiskEntries.length / entries.length) * 100).toFixed(1)}%)`,
        detected_at: new Date(),
        affected_entries: highRiskEntries,
        suggested_action:
          "Review security policies and consider tightening permissions for high-risk operations",
      });
    }

    // Detect performance degradation
    if (performanceIssues.length > 0) {
      anomalies.push({
        id: `anomaly_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        type: "performance_degradation",
        severity: "medium",
        description: `Slow permission decisions detected: ${performanceIssues.length} entries took >1000ms`,
        detected_at: new Date(),
        affected_entries: performanceIssues,
        suggested_action:
          "Optimize permission evaluation logic or consider caching improvements",
      });
    }

    return anomalies;
  }

  private generateHtmlReport(report: AuditReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>${report.title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { margin: 20px 0; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #e9ecef; border-radius: 5px; }
        .anomaly { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 5px 0; border-radius: 3px; }
        .high-severity { background: #f8d7da; border-color: #f5c6cb; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .table th { background: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${report.title}</h1>
        <p>${report.description}</p>
        <p><strong>Generated:</strong> ${report.generated_at.toLocaleString()}</p>
        <p><strong>Period:</strong> ${report.time_range.start.toLocaleString()} to ${report.time_range.end.toLocaleString()}</p>
    </div>

    <div class="summary">
        <h2>Summary Statistics</h2>
        <div class="metric">
            <strong>Total Decisions:</strong><br>
            ${report.summary.total_decisions.toLocaleString()}
        </div>
        <div class="metric">
            <strong>Allow:</strong> ${report.summary.decision_breakdown.allow}<br>
            <strong>Deny:</strong> ${report.summary.decision_breakdown.deny}<br>
            <strong>Confirm:</strong> ${report.summary.decision_breakdown.confirm}
        </div>
        <div class="metric">
            <strong>Risk Distribution:</strong><br>
            High: ${report.summary.risk_distribution.high}<br>
            Medium: ${report.summary.risk_distribution.medium}<br>
            Low: ${report.summary.risk_distribution.low}
        </div>
    </div>

    ${
      report.summary.anomalies.length > 0
        ? `
    <div class="anomalies">
        <h2>Detected Anomalies</h2>
        ${report.summary.anomalies
          .map(
            (anomaly) => `
            <div class="anomaly ${anomaly.severity === "high" ? "high-severity" : ""}">
                <strong>${anomaly.type.replace(/_/g, " ").toUpperCase()}</strong> (${anomaly.severity})
                <p>${anomaly.description}</p>
                ${anomaly.suggested_action ? `<p><em>Recommendation: ${anomaly.suggested_action}</em></p>` : ""}
            </div>
        `,
          )
          .join("")}
    </div>
    `
        : ""
    }

    <div class="metadata">
        <h2>Report Metadata</h2>
        <p><strong>Entries Processed:</strong> ${report.metadata.processed_entries.toLocaleString()}</p>
        <p><strong>Generation Time:</strong> ${report.metadata.generation_time_ms}ms</p>
        <p><strong>Schema Version:</strong> ${report.metadata.schema_version}</p>
    </div>
</body>
</html>
    `;
  }

  private generateCsvReport(report: AuditReport): string {
    const headers = [
      "timestamp",
      "tool",
      "action",
      "reason",
      "profile",
      "risk_score",
      "duration_ms",
    ];
    const rows = report.entries.map((entry) => [
      entry.timestamp.toISOString(),
      entry.query.tool,
      entry.result.action,
      entry.result.reason,
      entry.profile || "",
      entry.metadata?.risk_score || "",
      entry.metadata?.duration_ms || "",
    ]);

    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private initializeComplianceStandards(): void {
    // Initialize basic compliance standards
    this.complianceStandards.set("SOX", {
      name: "Sarbanes-Oxley Act",
      requirements: ["audit_trail", "data_integrity", "access_controls"],
      checkCompliance: (entries: AuditEntry[]): ComplianceResult => {
        const auditTrail = entries.length > 0;
        const issues: string[] = [];
        const recommendations: string[] = [];

        if (!auditTrail) {
          issues.push("No audit trail found");
          recommendations.push("Ensure all operations are logged");
        }

        return {
          standard: "SOX",
          compliant: issues.length === 0,
          score: issues.length === 0 ? 100 : 50,
          issues,
          recommendations,
        };
      },
    });

    // Add more standards as needed
  }
}
