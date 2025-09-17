#!/usr/bin/env node
/**
 * Performance Regression Detection System
 * Compares current performance against historical baselines and detects regressions
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Regression detection configuration
 */
const REGRESSION_CONFIG = {
  // Thresholds for different severity levels
  thresholds: {
    minor: 0.15, // 15% degradation
    moderate: 0.25, // 25% degradation
    major: 0.5, // 50% degradation
    critical: 1.0, // 100% degradation
  },

  // Statistical analysis settings
  analysis: {
    confidenceLevel: 0.95,
    minimumSamples: 5,
    outlierThreshold: 2.0, // Standard deviations
    trendWindowSize: 10,
  },

  // Baseline settings
  baseline: {
    storageDir: "performance-baselines",
    retentionDays: 30,
    minimumBaselines: 3,
  },
};

/**
 * Performance regression detector
 */
class PerformanceRegressionDetector {
  constructor(options = {}) {
    this.config = this.deepMerge(REGRESSION_CONFIG, options);
    this.baselineDir = path.join(
      process.cwd(),
      this.config.baseline.storageDir,
    );
    this.ensureBaselineDir();
  }

  /**
   * Deep merge configuration objects
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (
        source[key] !== null &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Analyze current performance against baselines
   */
  async analyzePerformance(currentResults, options = {}) {
    const analysis = {
      timestamp: new Date().toISOString(),
      summary: {
        totalPaths: 0,
        regressions: 0,
        improvements: 0,
        stable: 0,
      },
      results: [],
      recommendations: [],
      severity: "none",
    };

    console.log("\n🔍 Performance Regression Analysis");
    console.log("=================================");

    for (const [pathId, currentResult] of Object.entries(currentResults)) {
      analysis.summary.totalPaths++;

      try {
        const pathAnalysis = await this.analyzePathPerformance(
          pathId,
          currentResult,
        );
        analysis.results.push(pathAnalysis);

        // Update summary counts
        if (pathAnalysis.regression.detected) {
          analysis.summary.regressions++;

          // Track highest severity
          const severityLevels = {
            none: 0,
            minor: 1,
            moderate: 2,
            major: 3,
            critical: 4,
          };
          if (
            severityLevels[pathAnalysis.regression.severity] >
            severityLevels[analysis.severity]
          ) {
            analysis.severity = pathAnalysis.regression.severity;
          }

          // Add recommendations for regressions
          if (pathAnalysis.regression.severity !== "minor") {
            analysis.recommendations.push({
              path: pathId,
              severity: pathAnalysis.regression.severity,
              issue: pathAnalysis.regression.description,
              action: this.getRecommendedAction(
                pathAnalysis.regression.severity,
              ),
              impact: pathAnalysis.regression.impact,
            });
          }
        } else if (pathAnalysis.change.type === "improvement") {
          analysis.summary.improvements++;
        } else {
          analysis.summary.stable++;
        }
      } catch (error) {
        console.warn(`⚠️  Failed to analyze ${pathId}: ${error.message}`);
      }
    }

    // Generate overall assessment
    analysis.assessment = this.generateOverallAssessment(analysis);

    return analysis;
  }

  /**
   * Analyze performance for a specific path
   */
  async analyzePathPerformance(pathId, currentResult) {
    const baselines = await this.loadBaselines(pathId);
    const pathAnalysis = {
      pathId,
      current: this.extractMetrics(currentResult),
      baselines: baselines.length,
      change: { type: "unknown", magnitude: 0, confidence: 0 },
      regression: {
        detected: false,
        severity: "none",
        description: "",
        impact: 0,
      },
      trend: { direction: "stable", confidence: 0 },
    };

    if (baselines.length < this.config.analysis.minimumSamples) {
      console.log(
        `📊 ${pathId}: Insufficient baselines (${baselines.length}/${this.config.analysis.minimumSamples})`,
      );
      pathAnalysis.change.type = "insufficient_data";
      return pathAnalysis;
    }

    // Calculate baseline statistics
    const baselineStats = this.calculateBaselineStats(baselines);
    const currentValue = pathAnalysis.current.p95;

    // Detect regression
    const regressionResult = this.detectRegression(currentValue, baselineStats);
    pathAnalysis.regression = regressionResult;

    // Analyze change magnitude and direction
    const changeAnalysis = this.analyzeChange(currentValue, baselineStats);
    pathAnalysis.change = changeAnalysis;

    // Analyze trend
    const trendAnalysis = this.analyzeTrend(baselines, currentValue);
    pathAnalysis.trend = trendAnalysis;

    this.printPathAnalysis(pathId, pathAnalysis);

    return pathAnalysis;
  }

  /**
   * Detect performance regression
   */
  detectRegression(currentValue, baselineStats) {
    const regression = {
      detected: false,
      severity: "none",
      description: "",
      impact: 0,
      confidence: 0,
    };

    // Calculate regression ratio
    const ratio = (currentValue - baselineStats.mean) / baselineStats.mean;

    if (ratio <= 0) {
      // Performance improved
      return regression;
    }

    // Determine severity based on thresholds
    let severity = "none";
    if (ratio >= this.config.thresholds.critical) {
      severity = "critical";
    } else if (ratio >= this.config.thresholds.major) {
      severity = "major";
    } else if (ratio >= this.config.thresholds.moderate) {
      severity = "moderate";
    } else if (ratio >= this.config.thresholds.minor) {
      severity = "minor";
    }

    if (severity !== "none") {
      // Calculate statistical confidence
      const zScore = (currentValue - baselineStats.mean) / baselineStats.stdDev;
      const confidence = this.calculateConfidence(zScore);

      // Only flag as regression if confidence is high enough
      if (confidence >= this.config.analysis.confidenceLevel) {
        regression.detected = true;
        regression.severity = severity;
        regression.impact = ratio;
        regression.confidence = confidence;
        regression.description = `Performance degraded by ${(ratio * 100).toFixed(1)}% (${currentValue.toFixed(1)}ms vs ${baselineStats.mean.toFixed(1)}ms baseline)`;
      }
    }

    return regression;
  }

  /**
   * Analyze performance change
   */
  analyzeChange(currentValue, baselineStats) {
    const change = {
      type: "stable",
      magnitude: 0,
      confidence: 0,
    };

    const ratio = (currentValue - baselineStats.mean) / baselineStats.mean;
    const zScore = (currentValue - baselineStats.mean) / baselineStats.stdDev;
    const confidence = this.calculateConfidence(Math.abs(zScore));

    change.magnitude = Math.abs(ratio);
    change.confidence = confidence;

    if (confidence >= 0.8) {
      // High confidence threshold
      if (ratio > 0.05) {
        // 5% threshold for degradation
        change.type = "degradation";
      } else if (ratio < -0.05) {
        // 5% threshold for improvement
        change.type = "improvement";
      }
    }

    return change;
  }

  /**
   * Analyze performance trend
   */
  analyzeTrend(baselines, currentValue) {
    const trend = {
      direction: "stable",
      confidence: 0,
      slope: 0,
    };

    if (baselines.length < this.config.analysis.trendWindowSize) {
      return trend;
    }

    // Use recent baselines for trend analysis
    const recentBaselines = baselines
      .slice(-this.config.analysis.trendWindowSize)
      .map((b) => b.stats.p95);

    // Add current value
    recentBaselines.push(currentValue);

    // Calculate linear regression slope
    const n = recentBaselines.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = recentBaselines;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate correlation coefficient for confidence
    const meanX = sumX / n;
    const meanY = sumY / n;
    const ssXY = x.reduce(
      (sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY),
      0,
    );
    const ssX = x.reduce((sum, xi) => sum + (xi - meanX) ** 2, 0);
    const ssY = y.reduce((sum, yi) => sum + (yi - meanY) ** 2, 0);

    const correlation = ssXY / Math.sqrt(ssX * ssY);

    trend.slope = slope;
    trend.confidence = Math.abs(correlation);

    if (trend.confidence > 0.7) {
      // High confidence threshold
      if (slope > 5) {
        // 5ms per measurement threshold
        trend.direction = "degrading";
      } else if (slope < -5) {
        trend.direction = "improving";
      }
    }

    return trend;
  }

  /**
   * Calculate statistical confidence from z-score
   */
  calculateConfidence(zScore) {
    // Convert z-score to confidence using normal distribution approximation
    const absZ = Math.abs(zScore);
    if (absZ >= 2.58) return 0.99; // 99% confidence
    if (absZ >= 2.33) return 0.98; // 98% confidence
    if (absZ >= 1.96) return 0.95; // 95% confidence
    if (absZ >= 1.64) return 0.9; // 90% confidence
    if (absZ >= 1.28) return 0.8; // 80% confidence
    if (absZ >= 1.04) return 0.7; // 70% confidence
    return (absZ / 1.96) * 0.95; // Approximate for lower z-scores
  }

  /**
   * Extract metrics from benchmark result
   */
  extractMetrics(result) {
    return {
      mean: result.stats.mean,
      median: result.stats.median,
      p95: result.stats.p95,
      p99: result.stats.p99,
      stdDev: result.stats.stdDev,
      count: result.stats.count,
    };
  }

  /**
   * Calculate baseline statistics
   */
  calculateBaselineStats(baselines) {
    const values = baselines.map((b) => b.stats.p95);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      stdDev,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  }

  /**
   * Load historical baselines for a path
   */
  async loadBaselines(pathId) {
    const baselines = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(
      cutoffDate.getDate() - this.config.baseline.retentionDays,
    );

    try {
      const files = fs
        .readdirSync(this.baselineDir)
        .filter(
          (file) => file.startsWith("baseline-") && file.endsWith(".json"),
        )
        .sort()
        .reverse(); // Most recent first

      for (const file of files) {
        try {
          const filePath = path.join(this.baselineDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

          // Check if file is within retention period
          const fileDate = new Date(data.timestamp);
          if (fileDate < cutoffDate) {
            continue;
          }

          // Check if this baseline has our pathId
          if (data.results && data.results[pathId]) {
            baselines.push(data.results[pathId]);
          }
        } catch (error) {
          console.warn(`Failed to load baseline ${file}: ${error.message}`);
        }
      }
    } catch (error) {
      console.warn(`Failed to read baseline directory: ${error.message}`);
    }

    return baselines.slice(0, 50); // Limit to 50 most recent baselines
  }

  /**
   * Save current results as baseline
   */
  async saveBaseline(results) {
    const timestamp = new Date().toISOString();
    const baseline = {
      timestamp,
      results: {},
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        gitCommit: this.getGitCommit(),
      },
    };

    // Extract relevant metrics for each result
    for (const [pathId, result] of Object.entries(results)) {
      baseline.results[pathId] = {
        stats: this.extractMetrics(result),
        metadata: result.metadata,
      };
    }

    const filename = `baseline-${timestamp.replace(/[:.]/g, "-")}.json`;
    const filePath = path.join(this.baselineDir, filename);

    fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2));
    console.log(`💾 Baseline saved: ${filename}`);

    // Clean up old baselines
    this.cleanupOldBaselines();

    return filePath;
  }

  /**
   * Clean up old baseline files
   */
  cleanupOldBaselines() {
    const cutoffDate = new Date();
    cutoffDate.setDate(
      cutoffDate.getDate() - this.config.baseline.retentionDays,
    );

    try {
      const files = fs
        .readdirSync(this.baselineDir)
        .filter(
          (file) => file.startsWith("baseline-") && file.endsWith(".json"),
        );

      let deletedCount = 0;
      for (const file of files) {
        const filePath = path.join(this.baselineDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old baseline files`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup baselines: ${error.message}`);
    }
  }

  /**
   * Get current git commit hash
   */
  getGitCommit() {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Get recommended action for regression severity
   */
  getRecommendedAction(severity) {
    const actions = {
      critical: "IMMEDIATE: Stop deployment and investigate immediately",
      major: "HIGH: Schedule immediate investigation and fix",
      moderate: "MEDIUM: Investigate within 24 hours",
      minor: "LOW: Monitor and investigate when convenient",
    };

    return actions[severity] || "Monitor";
  }

  /**
   * Print path analysis results
   */
  printPathAnalysis(pathId, analysis) {
    const statusIcon = analysis.regression.detected
      ? analysis.regression.severity === "critical"
        ? "🚨"
        : analysis.regression.severity === "major"
          ? "❌"
          : analysis.regression.severity === "moderate"
            ? "⚠️"
            : "⚡"
      : analysis.change.type === "improvement"
        ? "📈"
        : "✅";

    console.log(`${statusIcon} ${pathId}:`);

    if (analysis.regression.detected) {
      console.log(`   🔥 REGRESSION: ${analysis.regression.description}`);
      console.log(
        `   📊 Confidence: ${(analysis.regression.confidence * 100).toFixed(1)}%`,
      );
    } else if (analysis.change.type === "improvement") {
      console.log(
        `   📈 Improved by ${(analysis.change.magnitude * 100).toFixed(1)}%`,
      );
    } else {
      console.log(`   ✅ Performance stable`);
    }

    if (analysis.trend.confidence > 0.7) {
      const trendIcon =
        analysis.trend.direction === "degrading"
          ? "📉"
          : analysis.trend.direction === "improving"
            ? "📈"
            : "➡️";
      console.log(
        `   ${trendIcon} Trend: ${analysis.trend.direction} (${(analysis.trend.confidence * 100).toFixed(0)}% confidence)`,
      );
    }
  }

  /**
   * Generate overall assessment
   */
  generateOverallAssessment(analysis) {
    const { summary } = analysis;
    const total = summary.totalPaths;

    let status = "healthy";
    let message = "All performance metrics within acceptable ranges";

    if (summary.regressions > 0) {
      const regressionRate = summary.regressions / total;

      if (analysis.severity === "critical" || regressionRate > 0.5) {
        status = "critical";
        message =
          "Critical performance regressions detected - immediate action required";
      } else if (analysis.severity === "major" || regressionRate > 0.3) {
        status = "degraded";
        message = "Significant performance degradation detected";
      } else if (analysis.severity === "moderate" || regressionRate > 0.1) {
        status = "warning";
        message =
          "Some performance degradation detected - monitoring recommended";
      } else {
        status = "minor_issues";
        message = "Minor performance regressions detected";
      }
    } else if (summary.improvements > summary.stable) {
      status = "improved";
      message = "Overall performance has improved";
    }

    return { status, message };
  }

  /**
   * Ensure baseline directory exists
   */
  ensureBaselineDir() {
    if (!fs.existsSync(this.baselineDir)) {
      fs.mkdirSync(this.baselineDir, { recursive: true });
    }
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Performance Regression Detector

Usage: node performance-regression-detector.cjs <command> [options]

Commands:
  analyze <report-file>       Analyze performance against baselines
  save-baseline <report-file> Save current performance as baseline
  cleanup                     Clean up old baseline files

Options:
  --help, -h                  Show this help message
  --confidence <level>        Confidence level for regression detection (0.8-0.99, default: 0.95)
  --retention-days <days>     Baseline retention period (default: 30)
  --quiet, -q                Suppress verbose output

Examples:
  node performance-regression-detector.cjs analyze latest-benchmark.json
  node performance-regression-detector.cjs save-baseline latest-benchmark.json
  node performance-regression-detector.cjs cleanup
    `);
    process.exit(0);
  }

  const command = args[0];
  const reportFile = args[1];

  if (!command) {
    console.error("❌ Command required. Use --help for usage information.");
    process.exit(1);
  }

  const options = {
    analysis: {
      confidenceLevel:
        parseFloat(args[args.indexOf("--confidence") + 1]) || 0.95,
    },
    baseline: {
      retentionDays: parseInt(args[args.indexOf("--retention-days") + 1]) || 30,
    },
  };

  const detector = new PerformanceRegressionDetector(options);

  try {
    switch (command) {
      case "analyze": {
        if (!reportFile) {
          console.error("❌ Report file required for analysis");
          process.exit(1);
        }

        if (!fs.existsSync(reportFile)) {
          console.error(`❌ Report file not found: ${reportFile}`);
          process.exit(1);
        }

        const reportData = JSON.parse(fs.readFileSync(reportFile, "utf8"));
        const analysis = await detector.analyzePerformance(
          reportData.results || reportData,
        );

        // Save analysis results
        const analysisPath = reportFile.replace(
          ".json",
          "-regression-analysis.json",
        );
        fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

        console.log(`\n📊 Regression Analysis Summary:`);
        console.log(`   Status: ${analysis.assessment.status.toUpperCase()}`);
        console.log(`   Message: ${analysis.assessment.message}`);
        console.log(
          `   Results: ${analysis.summary.regressions}⚠️ ${analysis.summary.improvements}📈 ${analysis.summary.stable}✅`,
        );
        console.log(`\n💾 Analysis saved: ${analysisPath}`);

        // Exit with appropriate code
        if (analysis.severity === "critical") {
          process.exit(2);
        } else if (analysis.severity === "major") {
          process.exit(1);
        }

        break;
      }

      case "save-baseline": {
        if (!reportFile) {
          console.error("❌ Report file required for baseline creation");
          process.exit(1);
        }

        if (!fs.existsSync(reportFile)) {
          console.error(`❌ Report file not found: ${reportFile}`);
          process.exit(1);
        }

        const reportData = JSON.parse(fs.readFileSync(reportFile, "utf8"));
        await detector.saveBaseline(reportData.results || reportData);
        console.log("✅ Baseline saved successfully");
        break;
      }

      case "cleanup": {
        detector.cleanupOldBaselines();
        console.log("✅ Cleanup completed");
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Operation failed:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { PerformanceRegressionDetector };
