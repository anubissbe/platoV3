#!/usr/bin/env node
/**
 * Enhanced coverage report generator with multiple output formats
 */

const fs = require('fs');
const path = require('path');

/**
 * Coverage report configuration
 */
const REPORT_CONFIG = {
  outputDir: 'coverage-reports',
  templates: {
    html: path.join(__dirname, 'templates', 'coverage-report.html'),
    markdown: path.join(__dirname, 'templates', 'coverage-report.md'),
  },
  thresholds: {
    excellent: 90,
    good: 80,
    fair: 70,
    poor: 60,
  }
};

/**
 * Load coverage data from Jest output
 */
function loadCoverageData() {
  const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
  
  if (!fs.existsSync(coveragePath)) {
    throw new Error('Coverage summary not found. Run tests with coverage first.');
  }
  
  return JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
}

/**
 * Get coverage category based on percentage
 */
function getCoverageCategory(percentage) {
  if (percentage >= REPORT_CONFIG.thresholds.excellent) return 'excellent';
  if (percentage >= REPORT_CONFIG.thresholds.good) return 'good';
  if (percentage >= REPORT_CONFIG.thresholds.fair) return 'fair';
  if (percentage >= REPORT_CONFIG.thresholds.poor) return 'poor';
  return 'critical';
}

/**
 * Get color for coverage percentage
 */
function getCoverageColor(percentage, format = 'hex') {
  const category = getCoverageCategory(percentage);
  const colors = {
    excellent: { hex: '#4CAF50', emoji: '🟢' },
    good: { hex: '#8BC34A', emoji: '✅' },
    fair: { hex: '#FFC107', emoji: '⚠️' },
    poor: { hex: '#FF9800', emoji: '⚠️' },
    critical: { hex: '#F44336', emoji: '❌' }
  };
  
  return colors[category][format];
}

/**
 * Generate file-level coverage analysis
 */
function analyzeFileCoverage(coverageData) {
  const files = Object.keys(coverageData)
    .filter(key => key !== 'total')
    .map(filePath => {
      const data = coverageData[filePath];
      const avgCoverage = (
        data.lines.pct + 
        data.statements.pct + 
        data.functions.pct + 
        data.branches.pct
      ) / 4;
      
      return {
        path: filePath,
        coverage: {
          lines: data.lines.pct,
          statements: data.statements.pct,
          functions: data.functions.pct,
          branches: data.branches.pct,
          average: avgCoverage
        },
        category: getCoverageCategory(avgCoverage),
        uncovered: {
          lines: data.lines.total - data.lines.covered,
          statements: data.statements.total - data.statements.covered,
          functions: data.functions.total - data.functions.covered,
          branches: data.branches.total - data.branches.covered,
        }
      };
    })
    .sort((a, b) => a.coverage.average - b.coverage.average);
  
  return files;
}

/**
 * Generate directory-level coverage summary
 */
function analyzeDirectoryCoverage(fileAnalysis) {
  const directories = {};
  
  fileAnalysis.forEach(file => {
    const dirPath = path.dirname(file.path);
    
    if (!directories[dirPath]) {
      directories[dirPath] = {
        files: [],
        totals: { lines: 0, statements: 0, functions: 0, branches: 0 },
        fileCount: 0
      };
    }
    
    directories[dirPath].files.push(file);
    directories[dirPath].fileCount++;
    
    Object.keys(directories[dirPath].totals).forEach(metric => {
      directories[dirPath].totals[metric] += file.coverage[metric];
    });
  });
  
  // Calculate averages
  Object.keys(directories).forEach(dirPath => {
    const dir = directories[dirPath];
    Object.keys(dir.totals).forEach(metric => {
      dir.totals[metric] = dir.totals[metric] / dir.fileCount;
    });
    dir.average = (dir.totals.lines + dir.totals.statements + dir.totals.functions + dir.totals.branches) / 4;
    dir.category = getCoverageCategory(dir.average);
  });
  
  return directories;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(coverageData, fileAnalysis, directoryAnalysis) {
  const total = coverageData.total;
  const timestamp = new Date().toISOString();
  
  let markdown = `# Coverage Report

Generated: ${timestamp}

## Overall Coverage

| Metric | Coverage | Status |
|--------|----------|---------|
| Lines | ${total.lines.pct.toFixed(1)}% (${total.lines.covered}/${total.lines.total}) | ${getCoverageColor(total.lines.pct, 'emoji')} |
| Statements | ${total.statements.pct.toFixed(1)}% (${total.statements.covered}/${total.statements.total}) | ${getCoverageColor(total.statements.pct, 'emoji')} |
| Functions | ${total.functions.pct.toFixed(1)}% (${total.functions.covered}/${total.functions.total}) | ${getCoverageColor(total.functions.pct, 'emoji')} |
| Branches | ${total.branches.pct.toFixed(1)}% (${total.branches.covered}/${total.branches.total}) | ${getCoverageColor(total.branches.pct, 'emoji')} |

## Directory Coverage

| Directory | Average | Lines | Statements | Functions | Branches | Files |
|-----------|---------|-------|------------|-----------|----------|-------|
`;

  Object.entries(directoryAnalysis)
    .sort(([,a], [,b]) => a.average - b.average)
    .forEach(([dirPath, data]) => {
      markdown += `| ${dirPath} | ${getCoverageColor(data.average, 'emoji')} ${data.average.toFixed(1)}% | ${data.totals.lines.toFixed(1)}% | ${data.totals.statements.toFixed(1)}% | ${data.totals.functions.toFixed(1)}% | ${data.totals.branches.toFixed(1)}% | ${data.fileCount} |\n`;
    });

  markdown += `\n## Low Coverage Files

Files with coverage below 80%:

| File | Coverage | Lines | Statements | Functions | Branches |
|------|----------|-------|------------|-----------|----------|
`;

  const lowCoverageFiles = fileAnalysis.filter(file => file.coverage.average < 80);
  
  if (lowCoverageFiles.length === 0) {
    markdown += '| *No files with low coverage* | - | - | - | - | - |\n';
  } else {
    lowCoverageFiles.forEach(file => {
      markdown += `| ${file.path} | ${getCoverageColor(file.coverage.average, 'emoji')} ${file.coverage.average.toFixed(1)}% | ${file.coverage.lines.toFixed(1)}% | ${file.coverage.statements.toFixed(1)}% | ${file.coverage.functions.toFixed(1)}% | ${file.coverage.branches.toFixed(1)}% |\n`;
    });
  }

  markdown += `\n## Recommendations

### High Priority
`;

  const criticalFiles = fileAnalysis.filter(file => file.category === 'critical');
  if (criticalFiles.length > 0) {
    markdown += `- **${criticalFiles.length} files with critical coverage** (< 60%): Add comprehensive tests\n`;
    criticalFiles.slice(0, 5).forEach(file => {
      markdown += `  - ${file.path}: ${file.coverage.average.toFixed(1)}%\n`;
    });
  }

  const poorFiles = fileAnalysis.filter(file => file.category === 'poor');
  if (poorFiles.length > 0) {
    markdown += `- **${poorFiles.length} files with poor coverage** (60-70%): Add targeted tests\n`;
  }

  markdown += `\n### Medium Priority
`;

  const fairFiles = fileAnalysis.filter(file => file.category === 'fair');
  if (fairFiles.length > 0) {
    markdown += `- **${fairFiles.length} files with fair coverage** (70-80%): Add edge case tests\n`;
  }

  markdown += `\n### Coverage Metrics
- Total files analyzed: ${fileAnalysis.length}
- Files meeting 80% threshold: ${fileAnalysis.filter(f => f.coverage.average >= 80).length}
- Average coverage: ${(fileAnalysis.reduce((sum, f) => sum + f.coverage.average, 0) / fileAnalysis.length).toFixed(1)}%

### Test Commands
\`\`\`bash
# Run comprehensive coverage
npm run test:coverage:comprehensive

# Generate detailed HTML report
npm run test:coverage:detailed

# Enforce thresholds
npm run test:coverage:enforce

# Generate badges
npm run test:coverage:badges
\`\`\`
`;

  return markdown;
}

/**
 * Generate JSON report for programmatic use
 */
function generateJsonReport(coverageData, fileAnalysis, directoryAnalysis) {
  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: coverageData.total,
      thresholds: REPORT_CONFIG.thresholds,
      fileCount: fileAnalysis.length,
      averageCoverage: fileAnalysis.reduce((sum, f) => sum + f.coverage.average, 0) / fileAnalysis.length,
    },
    files: fileAnalysis,
    directories: directoryAnalysis,
    recommendations: {
      critical: fileAnalysis.filter(f => f.category === 'critical').length,
      poor: fileAnalysis.filter(f => f.category === 'poor').length,
      fair: fileAnalysis.filter(f => f.category === 'fair').length,
      good: fileAnalysis.filter(f => f.category === 'good').length,
      excellent: fileAnalysis.filter(f => f.category === 'excellent').length,
    }
  };
}

/**
 * Generate console report
 */
function generateConsoleReport(coverageData, fileAnalysis, directoryAnalysis) {
  const total = coverageData.total;
  
  console.log('\n📊 Detailed Coverage Analysis');
  console.log('=============================');
  
  // Overall summary
  console.log('\n📈 Overall Coverage:');
  console.log(`Lines:      ${getCoverageColor(total.lines.pct, 'emoji')} ${total.lines.pct.toFixed(1)}% (${total.lines.covered}/${total.lines.total})`);
  console.log(`Statements: ${getCoverageColor(total.statements.pct, 'emoji')} ${total.statements.pct.toFixed(1)}% (${total.statements.covered}/${total.statements.total})`);
  console.log(`Functions:  ${getCoverageColor(total.functions.pct, 'emoji')} ${total.functions.pct.toFixed(1)}% (${total.functions.covered}/${total.functions.total})`);
  console.log(`Branches:   ${getCoverageColor(total.branches.pct, 'emoji')} ${total.branches.pct.toFixed(1)}% (${total.branches.covered}/${total.branches.total})`);
  
  // Directory breakdown
  console.log('\n📁 Directory Coverage:');
  Object.entries(directoryAnalysis)
    .sort(([,a], [,b]) => b.average - a.average)
    .slice(0, 10)
    .forEach(([dirPath, data]) => {
      const shortPath = dirPath.length > 30 ? '...' + dirPath.slice(-27) : dirPath;
      console.log(`${shortPath.padEnd(30)} ${getCoverageColor(data.average, 'emoji')} ${data.average.toFixed(1)}% (${data.fileCount} files)`);
    });
  
  // Low coverage files
  const lowCoverageFiles = fileAnalysis.filter(file => file.coverage.average < 80).slice(0, 10);
  if (lowCoverageFiles.length > 0) {
    console.log('\n⚠️  Files Needing Attention (< 80%):');
    lowCoverageFiles.forEach(file => {
      const shortPath = file.path.length > 40 ? '...' + file.path.slice(-37) : file.path;
      console.log(`${shortPath.padEnd(40)} ${getCoverageColor(file.coverage.average, 'emoji')} ${file.coverage.average.toFixed(1)}%`);
    });
  }
  
  // Statistics
  console.log('\n📊 Coverage Statistics:');
  console.log(`Total files:        ${fileAnalysis.length}`);
  console.log(`Above 90% (excellent): ${fileAnalysis.filter(f => f.category === 'excellent').length}`);
  console.log(`Above 80% (good):      ${fileAnalysis.filter(f => f.category === 'good').length}`);
  console.log(`Above 70% (fair):      ${fileAnalysis.filter(f => f.category === 'fair').length}`);
  console.log(`Above 60% (poor):      ${fileAnalysis.filter(f => f.category === 'poor').length}`);
  console.log(`Below 60% (critical):  ${fileAnalysis.filter(f => f.category === 'critical').length}`);
  
  const avgCoverage = fileAnalysis.reduce((sum, f) => sum + f.coverage.average, 0) / fileAnalysis.length;
  console.log(`Average coverage:   ${getCoverageColor(avgCoverage, 'emoji')} ${avgCoverage.toFixed(1)}%`);
}

/**
 * Ensure output directory exists
 */
function ensureOutputDir() {
  const outputDir = path.join(process.cwd(), REPORT_CONFIG.outputDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

/**
 * Main report generation function
 */
function main() {
  try {
    console.log('📋 Generating Detailed Coverage Reports');
    console.log('======================================');
    
    // Load and analyze data
    const coverageData = loadCoverageData();
    const fileAnalysis = analyzeFileCoverage(coverageData);
    const directoryAnalysis = analyzeDirectoryCoverage(fileAnalysis);
    
    // Generate console report
    generateConsoleReport(coverageData, fileAnalysis, directoryAnalysis);
    
    // Ensure output directory
    const outputDir = ensureOutputDir();
    
    // Generate markdown report
    const markdownReport = generateMarkdownReport(coverageData, fileAnalysis, directoryAnalysis);
    const markdownPath = path.join(outputDir, 'coverage-report.md');
    fs.writeFileSync(markdownPath, markdownReport);
    console.log(`\n📄 Markdown report: ${markdownPath}`);
    
    // Generate JSON report
    const jsonReport = generateJsonReport(coverageData, fileAnalysis, directoryAnalysis);
    const jsonPath = path.join(outputDir, 'coverage-analysis.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
    console.log(`📄 JSON report: ${jsonPath}`);
    
    // Generate CSV for spreadsheet analysis
    const csvPath = path.join(outputDir, 'coverage-files.csv');
    const csvHeader = 'File,Average,Lines,Statements,Functions,Branches,Category\n';
    const csvData = fileAnalysis.map(file => 
      `"${file.path}",${file.coverage.average.toFixed(1)},${file.coverage.lines.toFixed(1)},${file.coverage.statements.toFixed(1)},${file.coverage.functions.toFixed(1)},${file.coverage.branches.toFixed(1)},${file.category}`
    ).join('\n');
    fs.writeFileSync(csvPath, csvHeader + csvData);
    console.log(`📄 CSV report: ${csvPath}`);
    
    console.log('\n✨ Coverage reports generated successfully!');
    console.log('\n💡 Next steps:');
    console.log('   - Review coverage-report.md for detailed analysis');
    console.log('   - Open coverage/lcov-report/index.html for interactive report');
    console.log('   - Run npm run test:coverage:enforce to check thresholds');
    
  } catch (error) {
    console.error('\n❌ Error generating coverage reports:', error.message);
    console.error('\n💡 Make sure to run tests with coverage first:');
    console.error('   npm run test:coverage:comprehensive');
    process.exit(1);
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Detailed Coverage Report Generator

Usage: node generate-coverage-reports.js [options]

Options:
  --help, -h              Show this help message
  --quiet, -q             Suppress console output
  --format <type>         Generate specific format (markdown|json|csv|all)

Examples:
  node generate-coverage-reports.js
  node generate-coverage-reports.js --quiet
  node generate-coverage-reports.js --format markdown
    `);
    process.exit(0);
  }
  
  main();
}

module.exports = { 
  main, 
  analyzeFileCoverage, 
  analyzeDirectoryCoverage, 
  generateMarkdownReport, 
  generateJsonReport 
};