#!/usr/bin/env node
/**
 * Enhanced coverage threshold enforcement with detailed reporting
 */

const fs = require("fs");
const path = require("path");

/**
 * Coverage thresholds configuration
 * These can be overridden via environment variables or command line args
 */
const DEFAULT_THRESHOLDS = {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
  // Directory-specific thresholds
  "src/providers/": {
    branches: 85,
    functions: 85,
    lines: 85,
    statements: 85,
  },
  "src/tools/": {
    branches: 85,
    functions: 85,
    lines: 85,
    statements: 85,
  },
  "src/runtime/": {
    branches: 90,
    functions: 90,
    lines: 90,
    statements: 90,
  },
  "src/tui/": {
    branches: 70,
    functions: 70,
    lines: 70,
    statements: 70,
  },
  "src/config/": {
    branches: 75,
    functions: 75,
    lines: 75,
    statements: 75,
  },
  "src/services/": {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
};

/**
 * Get threshold values, allowing environment overrides
 */
function getThresholds() {
  const thresholds = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));

  // Allow environment variable overrides
  if (process.env.COVERAGE_THRESHOLD_GLOBAL) {
    const globalThreshold = parseInt(process.env.COVERAGE_THRESHOLD_GLOBAL);
    thresholds.global = {
      branches: globalThreshold,
      functions: globalThreshold,
      lines: globalThreshold,
      statements: globalThreshold,
    };
  }

  return thresholds;
}

/**
 * Load coverage data from Jest output
 */
function loadCoverageData() {
  const coveragePath = path.join(
    process.cwd(),
    "coverage",
    "coverage-summary.json",
  );

  if (!fs.existsSync(coveragePath)) {
    throw new Error(
      "Coverage summary not found. Run tests with coverage first.",
    );
  }

  return JSON.parse(fs.readFileSync(coveragePath, "utf8"));
}

/**
 * Check if coverage meets threshold
 * @param {number} actual - Actual coverage percentage
 * @param {number} threshold - Required threshold
 * @returns {boolean} Whether threshold is met
 */
function meetsThreshold(actual, threshold) {
  return actual >= threshold;
}

/**
 * Get status emoji based on coverage vs threshold
 */
function getStatusEmoji(actual, threshold) {
  if (actual >= threshold + 10) return "🟢"; // Well above threshold
  if (actual >= threshold) return "✅"; // Meets threshold
  if (actual >= threshold - 5) return "⚠️"; // Close to threshold
  return "❌"; // Below threshold
}

/**
 * Format coverage percentage with color coding
 */
function formatCoverage(actual, threshold) {
  const status = getStatusEmoji(actual, threshold);
  return `${status} ${actual.toFixed(1)}% (threshold: ${threshold}%)`;
}

/**
 * Check coverage against thresholds
 */
function checkCoverage(coverageData, thresholds) {
  const results = {
    passed: [],
    failed: [],
    warnings: [],
    overall: true,
  };

  // Check global thresholds
  const total = coverageData.total;
  const globalThresholds = thresholds.global;

  console.log("\n📊 Global Coverage Analysis:");
  console.log("============================");

  ["lines", "statements", "functions", "branches"].forEach((metric) => {
    const actual = total[metric].pct;
    const threshold = globalThresholds[metric];
    const passed = meetsThreshold(actual, threshold);

    console.log(`${metric.padEnd(12)}: ${formatCoverage(actual, threshold)}`);

    if (passed) {
      results.passed.push({ scope: "global", metric, actual, threshold });
    } else {
      results.failed.push({ scope: "global", metric, actual, threshold });
      results.overall = false;
    }

    // Add warnings for close calls
    if (passed && actual < threshold + 5) {
      results.warnings.push({
        scope: "global",
        metric,
        actual,
        threshold,
        message: "Close to threshold",
      });
    }
  });

  // Check directory-specific thresholds (if available in coverage data)
  console.log("\n📁 Directory Coverage Analysis:");
  console.log("==============================");

  Object.entries(thresholds).forEach(([dirPattern, dirThresholds]) => {
    if (dirPattern === "global") return;

    // Find matching files in coverage data
    const matchingFiles = Object.keys(coverageData).filter((filePath) => {
      return filePath.includes(dirPattern.replace("/", ""));
    });

    if (matchingFiles.length === 0) {
      console.log(`${dirPattern.padEnd(20)}: No files found`);
      return;
    }

    // Calculate directory coverage
    const dirStats = {
      lines: 0,
      statements: 0,
      functions: 0,
      branches: 0,
      total: 0,
    };
    let fileCount = 0;

    matchingFiles.forEach((filePath) => {
      if (filePath === "total") return;
      const fileData = coverageData[filePath];
      if (!fileData) return;

      ["lines", "statements", "functions", "branches"].forEach((metric) => {
        if (fileData[metric]) {
          dirStats[metric] += fileData[metric].pct || 0;
        }
      });
      fileCount++;
    });

    if (fileCount > 0) {
      ["lines", "statements", "functions", "branches"].forEach((metric) => {
        const avgCoverage = dirStats[metric] / fileCount;
        const threshold = dirThresholds[metric];
        const passed = meetsThreshold(avgCoverage, threshold);

        console.log(
          `${dirPattern.padEnd(20)} ${metric.padEnd(10)}: ${formatCoverage(avgCoverage, threshold)}`,
        );

        if (!passed) {
          results.failed.push({
            scope: dirPattern,
            metric,
            actual: avgCoverage,
            threshold,
          });
          results.overall = false;
        }
      });
    }
  });

  return results;
}

/**
 * Generate detailed failure report
 */
function generateFailureReport(results) {
  if (results.failed.length === 0) return;

  console.log("\n❌ Coverage Threshold Failures:");
  console.log("===============================");

  results.failed.forEach((failure) => {
    const deficit = failure.threshold - failure.actual;
    console.log(
      `${failure.scope}/${failure.metric}: ${failure.actual.toFixed(1)}% (need ${deficit.toFixed(1)}% more)`,
    );
  });

  console.log("\n💡 Suggestions to improve coverage:");
  console.log("===================================");
  console.log("1. Add unit tests for uncovered functions");
  console.log("2. Test error handling and edge cases");
  console.log("3. Add integration tests for component interactions");
  console.log("4. Review and test conditional branches");
  console.log("5. Run: npm run test:coverage:detailed -- --verbose");
}

/**
 * Generate warnings report
 */
function generateWarningsReport(results) {
  if (results.warnings.length === 0) return;

  console.log("\n⚠️  Coverage Warnings:");
  console.log("=====================");

  results.warnings.forEach((warning) => {
    console.log(
      `${warning.scope}/${warning.metric}: ${warning.actual.toFixed(1)}% (${warning.message})`,
    );
  });
}

/**
 * Generate success report
 */
function generateSuccessReport(results) {
  console.log(
    `\n✅ Coverage Summary: ${results.passed.length} passed, ${results.failed.length} failed`,
  );

  if (results.overall) {
    console.log("🎉 All coverage thresholds met!");

    // Show some stats
    const total = results.passed.length + results.failed.length;
    const passRate = ((results.passed.length / total) * 100).toFixed(1);
    console.log(
      `📈 Pass rate: ${passRate}% (${results.passed.length}/${total})`,
    );
  }
}

/**
 * Main enforcement function
 */
function main() {
  try {
    console.log("🔍 Coverage Threshold Enforcement");
    console.log("=================================");

    const thresholds = getThresholds();
    const coverageData = loadCoverageData();
    const results = checkCoverage(coverageData, thresholds);

    generateWarningsReport(results);
    generateFailureReport(results);
    generateSuccessReport(results);

    // Exit with appropriate code
    if (!results.overall) {
      console.log(
        "\n💡 Run `npm run test:coverage:detailed` for detailed coverage report",
      );
      process.exit(1);
    }

    console.log("\n✨ Coverage enforcement passed!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Coverage enforcement error:", error.message);
    console.error("\n💡 Make sure to run tests with coverage first:");
    console.error("   npm run test:coverage:comprehensive");
    process.exit(1);
  }
}

// Command line interface
if (require.main === module) {
  // Handle command line arguments
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Coverage Threshold Enforcement Tool

Usage: node enforce-coverage-thresholds.js [options]

Options:
  --help, -h              Show this help message
  --strict                Use stricter thresholds (+10%)
  --relaxed               Use relaxed thresholds (-10%)

Environment Variables:
  COVERAGE_THRESHOLD_GLOBAL   Set global threshold (overrides default 80%)

Examples:
  node enforce-coverage-thresholds.js
  COVERAGE_THRESHOLD_GLOBAL=85 node enforce-coverage-thresholds.js
  node enforce-coverage-thresholds.js --strict
    `);
    process.exit(0);
  }

  // Apply strict/relaxed modifiers
  if (args.includes("--strict")) {
    Object.keys(DEFAULT_THRESHOLDS).forEach((key) => {
      if (typeof DEFAULT_THRESHOLDS[key] === "object") {
        Object.keys(DEFAULT_THRESHOLDS[key]).forEach((metric) => {
          DEFAULT_THRESHOLDS[key][metric] = Math.min(
            95,
            DEFAULT_THRESHOLDS[key][metric] + 10,
          );
        });
      }
    });
  }

  if (args.includes("--relaxed")) {
    Object.keys(DEFAULT_THRESHOLDS).forEach((key) => {
      if (typeof DEFAULT_THRESHOLDS[key] === "object") {
        Object.keys(DEFAULT_THRESHOLDS[key]).forEach((metric) => {
          DEFAULT_THRESHOLDS[key][metric] = Math.max(
            50,
            DEFAULT_THRESHOLDS[key][metric] - 10,
          );
        });
      }
    });
  }

  main();
}

module.exports = { main, checkCoverage, getThresholds };
