#!/usr/bin/env node
/**
 * Coverage exclusion management script
 * Automatically identifies and manages files that should be excluded from coverage
 */

const fs = require("fs");
const path = require("path");
// Using fs.readdirSync recursively instead of glob to avoid dependency

/**
 * Default exclusion patterns
 */
const DEFAULT_EXCLUSIONS = {
  // Test files and directories
  test_files: [
    "!src/**/*.test.ts",
    "!src/**/*.test.tsx",
    "!src/**/__tests__/**",
    "!src/**/__mocks__/**",
    "!src/**/*.spec.ts",
    "!src/**/*.spec.tsx",
  ],

  // Type definitions and interfaces
  type_files: [
    "!src/**/*.d.ts",
    "!src/**/types.ts",
    "!src/**/interfaces.ts",
    "!src/**/*.types.ts",
    "!src/**/*.interface.ts",
  ],

  // Configuration and constants
  config_files: [
    "!src/**/constants.ts",
    "!src/**/config.ts",
    "!src/**/configuration.ts",
    "!src/**/*.config.ts",
    "!src/**/*.constants.ts",
  ],

  // Simple re-export files
  index_files: ["!src/**/index.ts", "!src/**/index.tsx"],

  // Build and generated files
  generated_files: [
    "!src/**/dist/**",
    "!src/**/build/**",
    "!src/**/generated/**",
    "!src/**/*.generated.ts",
    "!src/**/*.generated.tsx",
  ],

  // CLI entry points (hard to test)
  entry_points: ["!src/cli.ts", "!src/main.ts", "!src/app.ts", "!src/index.ts"],

  // Vendor and third-party code
  vendor_files: [
    "!src/**/vendor/**",
    "!src/**/third-party/**",
    "!src/**/external/**",
  ],

  // Documentation and examples
  docs_files: [
    "!src/**/docs/**",
    "!src/**/examples/**",
    "!src/**/*.example.ts",
    "!src/**/*.example.tsx",
    "!src/**/*.stories.ts",
    "!src/**/*.stories.tsx",
  ],
};

/**
 * Analyze files in the project to identify potential exclusions
 */
function analyzeProjectFiles() {
  const srcPath = path.join(process.cwd(), "src");

  if (!fs.existsSync(srcPath)) {
    throw new Error("src directory not found");
  }

  // Find all TypeScript files recursively
  function findTSFiles(dir, basePath = "") {
    const files = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relativePath = path.join(basePath, item.name);

      if (item.isDirectory()) {
        files.push(...findTSFiles(fullPath, relativePath));
      } else if (
        item.isFile() &&
        (item.name.endsWith(".ts") || item.name.endsWith(".tsx"))
      ) {
        files.push(relativePath);
      }
    }
    return files;
  }

  const allFiles = findTSFiles(srcPath);

  const analysis = {
    total_files: allFiles.length,
    categories: {
      test_files: [],
      type_files: [],
      config_files: [],
      index_files: [],
      generated_files: [],
      entry_points: [],
      vendor_files: [],
      docs_files: [],
      small_files: [],
      large_files: [],
      regular_files: [],
    },
    recommendations: [],
  };

  allFiles.forEach((filePath) => {
    const fullPath = path.join(srcPath, filePath);
    const fileName = path.basename(filePath);
    const stats = fs.statSync(fullPath);
    const fileSize = stats.size;

    // Categorize files
    if (
      filePath.includes("__tests__") ||
      filePath.includes("__mocks__") ||
      fileName.includes(".test.") ||
      fileName.includes(".spec.")
    ) {
      analysis.categories.test_files.push(filePath);
    } else if (
      fileName.endsWith(".d.ts") ||
      fileName === "types.ts" ||
      fileName === "interfaces.ts"
    ) {
      analysis.categories.type_files.push(filePath);
    } else if (
      fileName === "constants.ts" ||
      fileName === "config.ts" ||
      fileName.includes(".config.") ||
      fileName.includes(".constants.")
    ) {
      analysis.categories.config_files.push(filePath);
    } else if (fileName === "index.ts" || fileName === "index.tsx") {
      // Check if it's a simple re-export file
      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n").filter((line) => line.trim());
      const exportLines = lines.filter((line) =>
        line.trim().startsWith("export"),
      );

      if (exportLines.length === lines.length || lines.length <= 5) {
        analysis.categories.index_files.push(filePath);
      } else {
        analysis.categories.regular_files.push(filePath);
      }
    } else if (
      filePath.includes("/generated/") ||
      fileName.includes(".generated.")
    ) {
      analysis.categories.generated_files.push(filePath);
    } else if (
      fileName === "cli.ts" ||
      fileName === "main.ts" ||
      fileName === "app.ts"
    ) {
      analysis.categories.entry_points.push(filePath);
    } else if (
      filePath.includes("/vendor/") ||
      filePath.includes("/third-party/") ||
      filePath.includes("/external/")
    ) {
      analysis.categories.vendor_files.push(filePath);
    } else if (
      filePath.includes("/docs/") ||
      filePath.includes("/examples/") ||
      fileName.includes(".example.") ||
      fileName.includes(".stories.")
    ) {
      analysis.categories.docs_files.push(filePath);
    } else if (fileSize < 50) {
      analysis.categories.small_files.push({ path: filePath, size: fileSize });
    } else if (fileSize > 10000) {
      analysis.categories.large_files.push({ path: filePath, size: fileSize });
    } else {
      analysis.categories.regular_files.push(filePath);
    }
  });

  // Generate recommendations
  if (analysis.categories.small_files.length > 0) {
    analysis.recommendations.push({
      type: "small_files",
      count: analysis.categories.small_files.length,
      message:
        "Consider excluding very small files (< 50 bytes) as they likely contain only exports or constants",
      files: analysis.categories.small_files.slice(0, 5),
    });
  }

  if (analysis.categories.index_files.length > 10) {
    analysis.recommendations.push({
      type: "index_files",
      count: analysis.categories.index_files.length,
      message:
        "Many index files detected - these are typically re-exports and can be excluded",
      files: analysis.categories.index_files.slice(0, 5),
    });
  }

  return analysis;
}

/**
 * Generate exclusion patterns based on analysis
 */
function generateExclusionPatterns(analysis, options = {}) {
  const patterns = [];

  // Always include base patterns
  Object.values(DEFAULT_EXCLUSIONS).forEach((categoryPatterns) => {
    patterns.push(...categoryPatterns);
  });

  // Add dynamic exclusions based on analysis
  if (options.excludeSmallFiles && analysis.categories.small_files.length > 0) {
    analysis.categories.small_files.forEach((file) => {
      patterns.push(`!src/${file.path}`);
    });
  }

  if (options.excludeSimpleIndexFiles) {
    analysis.categories.index_files.forEach((filePath) => {
      patterns.push(`!src/${filePath}`);
    });
  }

  return patterns;
}

/**
 * Update Jest configuration with new exclusion patterns
 */
function updateJestConfig(
  exclusionPatterns,
  configPath = "jest.config.coverage.cjs",
) {
  const configFullPath = path.join(process.cwd(), configPath);

  if (!fs.existsSync(configFullPath)) {
    throw new Error(`Jest config not found: ${configPath}`);
  }

  let configContent = fs.readFileSync(configFullPath, "utf8");

  // Find the collectCoverageFrom section
  const collectCoverageFromMatch = configContent.match(
    /collectCoverageFrom:\s*\[([\s\S]*?)\]/,
  );

  if (!collectCoverageFromMatch) {
    throw new Error("collectCoverageFrom section not found in Jest config");
  }

  // Generate new collectCoverageFrom array
  const basePatterns = [
    "'src/**/*.{ts,tsx}'",
    "'src/providers/**/*.{ts,tsx}'",
    "'src/tools/**/*.{ts,tsx}'",
    "'src/runtime/**/*.{ts,tsx}'",
    "'src/tui/**/*.{ts,tsx}'",
    "'src/commands/**/*.{ts,tsx}'",
    "'src/integrations/**/*.{ts,tsx}'",
    "'src/slash/**/*.{ts,tsx}'",
    "'src/memory/**/*.{ts,tsx}'",
    "'src/context/**/*.{ts,tsx}'",
    "'src/permissions/**/*.{ts,tsx}'",
    "'src/config/**/*.{ts,tsx}'",
    "'src/services/**/*.{ts,tsx}'",
  ];

  const exclusionPatternsFormatted = exclusionPatterns.map(
    (pattern) => `'${pattern}'`,
  );

  const newCollectCoverageFrom = `collectCoverageFrom: [
    // Include patterns
${basePatterns.map((pattern) => `    ${pattern},`).join("\n")}
    
    // Exclude patterns
${exclusionPatternsFormatted.map((pattern) => `    ${pattern},`).join("\n")}
  ]`;

  // Replace the existing collectCoverageFrom
  configContent = configContent.replace(
    /collectCoverageFrom:\s*\[([\s\S]*?)\]/,
    newCollectCoverageFrom,
  );

  // Write back to file
  fs.writeFileSync(configFullPath, configContent);

  return configFullPath;
}

/**
 * Generate exclusion report
 */
function generateExclusionReport(analysis, exclusionPatterns) {
  console.log("\n📊 Coverage Exclusion Analysis");
  console.log("==============================");

  console.log("\n📁 File Categories:");
  Object.entries(analysis.categories).forEach(([category, files]) => {
    if (Array.isArray(files) && files.length > 0) {
      console.log(
        `${category.replace("_", " ").padEnd(20)}: ${files.length} files`,
      );
    }
  });

  console.log("\n🚫 Exclusion Patterns:");
  exclusionPatterns.forEach((pattern) => {
    console.log(`  ${pattern}`);
  });

  console.log("\n💡 Recommendations:");
  if (analysis.recommendations.length === 0) {
    console.log("  No additional recommendations");
  } else {
    analysis.recommendations.forEach((rec) => {
      console.log(`  ${rec.type}: ${rec.message} (${rec.count} files)`);
      if (rec.files.length > 0) {
        rec.files.slice(0, 3).forEach((file) => {
          const displayPath = typeof file === "string" ? file : file.path;
          console.log(`    - ${displayPath}`);
        });
        if (rec.files.length > 3) {
          console.log(`    ... and ${rec.files.length - 3} more`);
        }
      }
    });
  }

  const totalExcluded = exclusionPatterns.length;
  const totalFiles = analysis.total_files;
  const includedFiles = totalFiles - totalExcluded;
  const exclusionRate = ((totalExcluded / totalFiles) * 100).toFixed(1);

  console.log("\n📈 Exclusion Summary:");
  console.log(`Total files:      ${totalFiles}`);
  console.log(`Excluded files:   ${totalExcluded}`);
  console.log(`Included files:   ${includedFiles}`);
  console.log(`Exclusion rate:   ${exclusionRate}%`);
}

/**
 * Main function
 */
function main() {
  try {
    console.log("🔍 Analyzing Coverage Exclusions");
    console.log("=================================");

    const analysis = analyzeProjectFiles();

    // Options from command line
    const args = process.argv.slice(2);
    const options = {
      excludeSmallFiles: args.includes("--exclude-small-files"),
      excludeSimpleIndexFiles: args.includes("--exclude-simple-index"),
      updateConfig: args.includes("--update-config"),
      dryRun: args.includes("--dry-run") || !args.includes("--update-config"),
    };

    const exclusionPatterns = generateExclusionPatterns(analysis, options);

    generateExclusionReport(analysis, exclusionPatterns);

    if (options.updateConfig && !options.dryRun) {
      const configPath = updateJestConfig(exclusionPatterns);
      console.log(`\n✅ Updated Jest configuration: ${configPath}`);
    } else {
      console.log(
        "\n💡 To update Jest configuration, run with --update-config",
      );
    }

    // Save analysis for future reference
    const analysisPath = path.join(
      process.cwd(),
      "coverage-exclusion-analysis.json",
    );
    fs.writeFileSync(
      analysisPath,
      JSON.stringify(
        {
          analysis,
          exclusionPatterns,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(`\n💾 Analysis saved: ${analysisPath}`);
  } catch (error) {
    console.error("\n❌ Error managing coverage exclusions:", error.message);
    process.exit(1);
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Coverage Exclusion Management Tool

Usage: node manage-coverage-exclusions.js [options]

Options:
  --help, -h                  Show this help message
  --exclude-small-files       Exclude files smaller than 50 bytes
  --exclude-simple-index      Exclude simple re-export index files
  --update-config             Update Jest configuration file
  --dry-run                   Show changes without updating files

Examples:
  node manage-coverage-exclusions.js
  node manage-coverage-exclusions.js --exclude-small-files --update-config
  node manage-coverage-exclusions.js --dry-run
    `);
    process.exit(0);
  }

  main();
}

module.exports = {
  main,
  analyzeProjectFiles,
  generateExclusionPatterns,
  updateJestConfig,
};
