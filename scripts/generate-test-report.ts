#!/usr/bin/env tsx
/**
 * Test Validation Report Generator
 * Runs comprehensive tests and generates detailed validation report
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { CommandBenchmark } from './benchmark-commands.js';
import { SLASH_COMMANDS } from '../src/slash/commands.js';

const exec = promisify(require('child_process').exec);

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

interface ValidationReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    npmVersion: string;
    platform: string;
    arch: string;
  };
  commandCoverage: {
    totalCommands: number;
    implementedCommands: number;
    coveragePercentage: number;
    implementedList: string[];
    missingList: string[];
    categoryCoverage: Record<string, { total: number; implemented: number; percentage: number }>;
  };
  testResults: TestResult[];
  performanceResults?: any;
  qualityMetrics: {
    codeComplexity: string;
    testCoverage: number;
    eslintIssues: number;
    typeScriptErrors: number;
  };
  recommendations: string[];
  productionReadiness: {
    score: number;
    criticalIssues: string[];
    warnings: string[];
    strengths: string[];
  };
}

class TestReportGenerator {
  private report: ValidationReport;

  constructor() {
    this.report = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        npmVersion: '',
        platform: process.platform,
        arch: process.arch,
      },
      commandCoverage: {
        totalCommands: 0,
        implementedCommands: 0,
        coveragePercentage: 0,
        implementedList: [],
        missingList: [],
        categoryCoverage: {}
      },
      testResults: [],
      qualityMetrics: {
        codeComplexity: 'Unknown',
        testCoverage: 0,
        eslintIssues: 0,
        typeScriptErrors: 0
      },
      recommendations: [],
      productionReadiness: {
        score: 0,
        criticalIssues: [],
        warnings: [],
        strengths: []
      }
    };
  }

  async initialize(): Promise<void> {
    console.log('🔧 Initializing test validation environment...');

    try {
      // Get npm version
      const { stdout: npmVersion } = await exec('npm --version');
      this.report.environment.npmVersion = npmVersion.trim();
    } catch (error) {
      this.report.environment.npmVersion = 'Unknown';
    }

    // Ensure we're in the right directory
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    try {
      await fs.access(packageJsonPath);
    } catch (error) {
      throw new Error('package.json not found. Please run from project root.');
    }

    console.log('✅ Environment initialized');
  }

  async analyzeCommandCoverage(): Promise<void> {
    console.log('📊 Analyzing command coverage...');

    const totalCommands = SLASH_COMMANDS.length;
    const categories: Record<string, { total: number; implemented: number }> = {};

    let implementedCount = 0;
    const implementedList: string[] = [];
    const missingList: string[] = [];

    // Test each command to see if it's implemented
    for (const command of SLASH_COMMANDS) {
      const category = command.category || 'Unknown';

      if (!categories[category]) {
        categories[category] = { total: 0, implemented: 0 };
      }
      categories[category].total++;

      try {
        // Try to execute the command to see if it's implemented
        const { processSlashCommand } = await import('../src/commands/router.js');
        const mockSession = {
          conversationMessages: [],
          addMessage: () => {},
          clearMessages: () => {},
          getMessages: () => [],
          exportMessages: () => {},
          compactMessages: () => {},
          costAnalytics: {
            totalCost: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            sessionCosts: []
          }
        } as any;

        const result = await processSlashCommand(command.name, [], mockSession);

        if (result.handled && !result.error) {
          implementedCount++;
          implementedList.push(command.name);
          categories[category].implemented++;
        } else if (result.handled) {
          // Command is recognized but may have implementation issues
          implementedCount++;
          implementedList.push(`${command.name} (with issues)`);
          categories[category].implemented++;
        } else {
          missingList.push(command.name);
        }
      } catch (error) {
        // If command execution fails completely, it's missing
        missingList.push(command.name);
      }
    }

    // Calculate category coverage
    const categoryCoverage: Record<string, { total: number; implemented: number; percentage: number }> = {};
    for (const [category, stats] of Object.entries(categories)) {
      categoryCoverage[category] = {
        total: stats.total,
        implemented: stats.implemented,
        percentage: (stats.implemented / stats.total) * 100
      };
    }

    this.report.commandCoverage = {
      totalCommands,
      implementedCommands: implementedCount,
      coveragePercentage: (implementedCount / totalCommands) * 100,
      implementedList,
      missingList,
      categoryCoverage
    };

    console.log(`✅ Command coverage analyzed: ${implementedCount}/${totalCommands} (${(implementedCount/totalCommands*100).toFixed(1)}%)`);
  }

  async runTestSuite(suiteName: string, command: string): Promise<TestResult> {
    console.log(`🧪 Running ${suiteName}...`);

    return new Promise((resolve) => {
      const startTime = Date.now();
      let output = '';

      const child = spawn('npm', ['run', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;
        const success = code === 0;

        // Parse Jest output for details
        const details = this.parseTestOutput(output);

        resolve({
          name: suiteName,
          passed: success,
          duration,
          error: success ? undefined : `Exit code: ${code}`,
          details
        });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        child.kill();
        resolve({
          name: suiteName,
          passed: false,
          duration: Date.now() - startTime,
          error: 'Timeout after 5 minutes',
          details: { total: 0, passed: 0, failed: 0, skipped: 0 }
        });
      }, 300000);
    });
  }

  private parseTestOutput(output: string): { total: number; passed: number; failed: number; skipped: number } {
    // Parse Jest output for test statistics
    const passMatch = output.match(/(\d+) passing/);
    const failMatch = output.match(/(\d+) failing/);
    const skipMatch = output.match(/(\d+) pending/);
    const totalMatch = output.match(/Tests:\s*(\d+)/);

    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;
    const skipped = skipMatch ? parseInt(skipMatch[1]) : 0;
    const total = totalMatch ? parseInt(totalMatch[1]) : passed + failed + skipped;

    return { total, passed, failed, skipped };
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Running comprehensive test suite...\n');

    const testSuites = [
      { name: 'Unit Tests', command: 'test:unit' },
      { name: 'Integration Tests', command: 'test:integration' },
      { name: 'E2E Command Tests', command: 'test:e2e' },
      { name: 'Comprehensive Suite', command: 'test:comprehensive' }
    ];

    for (const suite of testSuites) {
      try {
        const result = await this.runTestSuite(suite.name, suite.command);
        this.report.testResults.push(result);

        const status = result.passed ? '✅' : '❌';
        const duration = (result.duration / 1000).toFixed(1);
        console.log(`${status} ${suite.name}: ${result.details.passed}/${result.details.total} tests (${duration}s)`);

        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      } catch (error) {
        console.log(`❌ ${suite.name}: Failed to run`);
        this.report.testResults.push({
          name: suite.name,
          passed: false,
          duration: 0,
          error: error instanceof Error ? error.message : String(error),
          details: { total: 0, passed: 0, failed: 0, skipped: 0 }
        });
      }
    }
  }

  async runPerformanceBenchmarks(): Promise<void> {
    console.log('\n⚡ Running performance benchmarks...');

    try {
      const benchmark = new CommandBenchmark();
      await benchmark.setup();
      await benchmark.runFullBenchmark();
      const report = benchmark.generateReport();
      await benchmark.cleanup();

      this.report.performanceResults = report;
      console.log('✅ Performance benchmarks completed');

    } catch (error) {
      console.log('❌ Performance benchmarks failed:', error);
      this.report.performanceResults = null;
    }
  }

  async analyzeQualityMetrics(): Promise<void> {
    console.log('\n🔍 Analyzing code quality metrics...');

    try {
      // Run TypeScript compiler check
      try {
        await exec('npx tsc --noEmit');
        this.report.qualityMetrics.typeScriptErrors = 0;
        console.log('✅ TypeScript: No errors');
      } catch (error) {
        const output = error.stdout || error.stderr || '';
        const errorCount = (output.match(/error TS\d+/g) || []).length;
        this.report.qualityMetrics.typeScriptErrors = errorCount;
        console.log(`⚠️  TypeScript: ${errorCount} errors`);
      }

      // Run ESLint check
      try {
        await exec('npx eslint src --format=json');
        this.report.qualityMetrics.eslintIssues = 0;
        console.log('✅ ESLint: No issues');
      } catch (error) {
        try {
          const output = error.stdout || '';
          const results = JSON.parse(output);
          const issueCount = results.reduce((total: number, file: any) => total + file.errorCount + file.warningCount, 0);
          this.report.qualityMetrics.eslintIssues = issueCount;
          console.log(`⚠️  ESLint: ${issueCount} issues`);
        } catch (parseError) {
          this.report.qualityMetrics.eslintIssues = -1; // Unknown
          console.log('❌ ESLint: Could not parse results');
        }
      }

      // Try to get test coverage
      try {
        const { stdout } = await exec('npm run test:coverage --silent');
        const coverageMatch = stdout.match(/All files\s*\|\s*([\d.]+)/);
        if (coverageMatch) {
          this.report.qualityMetrics.testCoverage = parseFloat(coverageMatch[1]);
          console.log(`✅ Test Coverage: ${this.report.qualityMetrics.testCoverage}%`);
        }
      } catch (error) {
        console.log('⚠️  Test Coverage: Could not determine');
      }

    } catch (error) {
      console.log('❌ Quality metrics analysis failed:', error);
    }
  }

  generateRecommendations(): void {
    console.log('\n💡 Generating recommendations...');

    const recommendations: string[] = [];

    // Command coverage recommendations
    if (this.report.commandCoverage.coveragePercentage < 80) {
      recommendations.push(`Increase command coverage from ${this.report.commandCoverage.coveragePercentage.toFixed(1)}% to at least 80%`);
    }

    // Test success recommendations
    const failedTests = this.report.testResults.filter(t => !t.passed);
    if (failedTests.length > 0) {
      recommendations.push(`Fix ${failedTests.length} failing test suite(s): ${failedTests.map(t => t.name).join(', ')}`);
    }

    // Quality recommendations
    if (this.report.qualityMetrics.typeScriptErrors > 0) {
      recommendations.push(`Fix ${this.report.qualityMetrics.typeScriptErrors} TypeScript errors`);
    }

    if (this.report.qualityMetrics.eslintIssues > 10) {
      recommendations.push(`Address ${this.report.qualityMetrics.eslintIssues} ESLint issues`);
    }

    if (this.report.qualityMetrics.testCoverage > 0 && this.report.qualityMetrics.testCoverage < 70) {
      recommendations.push(`Increase test coverage from ${this.report.qualityMetrics.testCoverage}% to at least 70%`);
    }

    // Performance recommendations
    if (this.report.performanceResults) {
      const slowCommands = this.report.performanceResults.bottlenecks.slowestCommands || [];
      if (slowCommands.length > 0 && slowCommands[0].time > 1000) {
        recommendations.push(`Optimize slow commands: ${slowCommands.slice(0, 3).map((c: any) => c.command).join(', ')}`);
      }

      const failedCommands = this.report.performanceResults.bottlenecks.failedCommands || [];
      if (failedCommands.length > 0) {
        recommendations.push(`Fix failing commands: ${failedCommands.slice(0, 3).map((c: any) => c.command).join(', ')}`);
      }
    }

    // Missing implementation recommendations
    if (this.report.commandCoverage.missingList.length > 0) {
      const topMissing = this.report.commandCoverage.missingList.slice(0, 5);
      recommendations.push(`Implement missing commands: ${topMissing.join(', ')}`);
    }

    this.report.recommendations = recommendations;
    console.log(`✅ Generated ${recommendations.length} recommendations`);
  }

  calculateProductionReadiness(): void {
    console.log('\n📋 Calculating production readiness...');

    let score = 100;
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const strengths: string[] = [];

    // Command coverage scoring
    const coverageScore = this.report.commandCoverage.coveragePercentage;
    if (coverageScore < 50) {
      score -= 30;
      criticalIssues.push(`Very low command implementation coverage (${coverageScore.toFixed(1)}%)`);
    } else if (coverageScore < 70) {
      score -= 15;
      warnings.push(`Low command implementation coverage (${coverageScore.toFixed(1)}%)`);
    } else if (coverageScore > 80) {
      strengths.push(`Good command implementation coverage (${coverageScore.toFixed(1)}%)`);
    }

    // Test results scoring
    const totalTests = this.report.testResults.reduce((sum, t) => sum + t.details.total, 0);
    const passedTests = this.report.testResults.reduce((sum, t) => sum + t.details.passed, 0);
    const testSuccessRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    if (testSuccessRate < 70) {
      score -= 25;
      criticalIssues.push(`Low test success rate (${testSuccessRate.toFixed(1)}%)`);
    } else if (testSuccessRate < 90) {
      score -= 10;
      warnings.push(`Moderate test success rate (${testSuccessRate.toFixed(1)}%)`);
    } else if (testSuccessRate > 95) {
      strengths.push(`Excellent test success rate (${testSuccessRate.toFixed(1)}%)`);
    }

    // Quality metrics scoring
    if (this.report.qualityMetrics.typeScriptErrors > 0) {
      score -= 20;
      criticalIssues.push(`TypeScript compilation errors (${this.report.qualityMetrics.typeScriptErrors})`);
    } else {
      strengths.push('Clean TypeScript compilation');
    }

    if (this.report.qualityMetrics.eslintIssues > 50) {
      score -= 15;
      warnings.push(`High ESLint issue count (${this.report.qualityMetrics.eslintIssues})`);
    } else if (this.report.qualityMetrics.eslintIssues > 0) {
      score -= 5;
      warnings.push(`Minor ESLint issues (${this.report.qualityMetrics.eslintIssues})`);
    } else if (this.report.qualityMetrics.eslintIssues === 0) {
      strengths.push('No ESLint issues');
    }

    // Performance scoring
    if (this.report.performanceResults) {
      const failedCommands = this.report.performanceResults.bottlenecks.failedCommands || [];
      if (failedCommands.length > 3) {
        score -= 15;
        warnings.push(`Multiple failing commands in performance tests (${failedCommands.length})`);
      } else if (failedCommands.length === 0) {
        strengths.push('All commands pass performance tests');
      }

      const avgTime = this.report.performanceResults.summary.averageExecutionTime;
      if (avgTime > 2000) {
        score -= 10;
        warnings.push(`High average command execution time (${avgTime.toFixed(0)}ms)`);
      } else if (avgTime < 500) {
        strengths.push(`Fast average command execution time (${avgTime.toFixed(0)}ms)`);
      }
    }

    // Cap score at reasonable bounds
    score = Math.max(0, Math.min(100, score));

    this.report.productionReadiness = {
      score,
      criticalIssues,
      warnings,
      strengths
    };

    console.log(`✅ Production readiness score: ${score}/100`);
  }

  async generateMarkdownReport(): Promise<string> {
    const report = `# TEST VALIDATION REPORT

**Generated:** ${new Date(this.report.timestamp).toLocaleString()}
**Node.js:** ${this.report.environment.nodeVersion}
**Platform:** ${this.report.environment.platform} (${this.report.environment.arch})

## 🎯 Executive Summary

**Production Readiness Score: ${this.report.productionReadiness.score}/100**

${this.report.productionReadiness.score >= 80 ? '✅ **PRODUCTION READY**' :
  this.report.productionReadiness.score >= 60 ? '⚠️ **NEEDS IMPROVEMENT**' :
  '❌ **NOT PRODUCTION READY**'}

## 📊 Command Coverage Analysis

- **Total Commands:** ${this.report.commandCoverage.totalCommands}
- **Implemented:** ${this.report.commandCoverage.implementedCommands} (${this.report.commandCoverage.coveragePercentage.toFixed(1)}%)
- **Missing:** ${this.report.commandCoverage.missingList.length}

### Implementation Status by Category

${Object.entries(this.report.commandCoverage.categoryCoverage)
  .map(([category, stats]) =>
    `- **${category}:** ${stats.implemented}/${stats.total} (${stats.percentage.toFixed(1)}%)`
  ).join('\n')}

### Implemented Commands

${this.report.commandCoverage.implementedList.map(cmd => `- \`/${cmd}\``).join('\n')}

${this.report.commandCoverage.missingList.length > 0 ? `
### Missing Commands

${this.report.commandCoverage.missingList.map(cmd => `- \`/${cmd}\``).join('\n')}
` : ''}

## 🧪 Test Results

${this.report.testResults.map(test => `
### ${test.name}

- **Status:** ${test.passed ? '✅ PASSED' : '❌ FAILED'}
- **Duration:** ${(test.duration / 1000).toFixed(1)}s
- **Tests:** ${test.details.passed}/${test.details.total} passed${test.details.failed > 0 ? `, ${test.details.failed} failed` : ''}${test.details.skipped > 0 ? `, ${test.details.skipped} skipped` : ''}
${test.error ? `- **Error:** ${test.error}` : ''}
`).join('\n')}

## ⚡ Performance Analysis

${this.report.performanceResults ? `
- **Average Execution Time:** ${this.report.performanceResults.summary.averageExecutionTime.toFixed(2)}ms
- **Fastest Command:** ${this.report.performanceResults.summary.minExecutionTime.toFixed(2)}ms
- **Slowest Command:** ${this.report.performanceResults.summary.maxExecutionTime.toFixed(2)}ms
- **Success Rate:** ${((this.report.performanceResults.summary.successfulCommands / this.report.performanceResults.summary.totalCommands) * 100).toFixed(1)}%
- **Total Memory Used:** ${this.formatBytes(this.report.performanceResults.summary.totalMemoryUsed)}

### Slowest Commands
${this.report.performanceResults.bottlenecks.slowestCommands.map((cmd: any, i: number) =>
  `${i + 1}. \`/${cmd.command} ${cmd.args.join(' ')}\` - ${cmd.time.toFixed(2)}ms`
).join('\n')}

${this.report.performanceResults.bottlenecks.failedCommands.length > 0 ? `
### Failed Commands
${this.report.performanceResults.bottlenecks.failedCommands.map((cmd: any, i: number) =>
  `${i + 1}. \`/${cmd.command} ${cmd.args.join(' ')}\` - ${cmd.error}`
).join('\n')}
` : ''}
` : '**Performance benchmarks not available**'}

## 🔍 Quality Metrics

- **TypeScript Errors:** ${this.report.qualityMetrics.typeScriptErrors >= 0 ? this.report.qualityMetrics.typeScriptErrors : 'Unknown'}
- **ESLint Issues:** ${this.report.qualityMetrics.eslintIssues >= 0 ? this.report.qualityMetrics.eslintIssues : 'Unknown'}
- **Test Coverage:** ${this.report.qualityMetrics.testCoverage > 0 ? this.report.qualityMetrics.testCoverage.toFixed(1) + '%' : 'Unknown'}

## 💡 Recommendations

${this.report.recommendations.length > 0 ?
  this.report.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n') :
  'No specific recommendations at this time.'}

## 🚀 Production Readiness Assessment

**Overall Score: ${this.report.productionReadiness.score}/100**

${this.report.productionReadiness.criticalIssues.length > 0 ? `
### ❌ Critical Issues
${this.report.productionReadiness.criticalIssues.map(issue => `- ${issue}`).join('\n')}
` : ''}

${this.report.productionReadiness.warnings.length > 0 ? `
### ⚠️ Warnings
${this.report.productionReadiness.warnings.map(warning => `- ${warning}`).join('\n')}
` : ''}

${this.report.productionReadiness.strengths.length > 0 ? `
### ✅ Strengths
${this.report.productionReadiness.strengths.map(strength => `- ${strength}`).join('\n')}
` : ''}

## 📋 Production Checklist

- [${this.report.commandCoverage.coveragePercentage >= 80 ? 'x' : ' '}] Command implementation coverage ≥80%
- [${this.report.testResults.every(t => t.passed) ? 'x' : ' '}] All test suites passing
- [${this.report.qualityMetrics.typeScriptErrors === 0 ? 'x' : ' '}] No TypeScript errors
- [${this.report.qualityMetrics.eslintIssues <= 10 ? 'x' : ' '}] ESLint issues ≤10
- [${this.report.qualityMetrics.testCoverage >= 70 ? 'x' : ' '}] Test coverage ≥70%
- [${this.report.performanceResults && this.report.performanceResults.summary.averageExecutionTime < 1000 ? 'x' : ' '}] Average command execution <1s
- [${this.report.recommendations.length <= 5 ? 'x' : ' '}] Recommendations addressed

---

*Report generated by Plato TUI Test Validation Suite*`;

    return report;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async saveReport(filename: string): Promise<void> {
    const markdownReport = await this.generateMarkdownReport();
    await fs.writeFile(filename, markdownReport);

    // Also save the raw JSON data
    const jsonFilename = filename.replace('.md', '.json');
    await fs.writeFile(jsonFilename, JSON.stringify(this.report, null, 2));

    console.log(`\n💾 Reports saved:`);
    console.log(`📄 Markdown: ${filename}`);
    console.log(`🗂️  JSON: ${jsonFilename}`);
  }

  async run(): Promise<void> {
    console.log('🚀 Starting comprehensive test validation...\n');

    try {
      await this.initialize();
      await this.analyzeCommandCoverage();
      await this.runAllTests();
      await this.runPerformanceBenchmarks();
      await this.analyzeQualityMetrics();
      this.generateRecommendations();
      this.calculateProductionReadiness();

      const reportPath = path.join(process.cwd(), 'TEST_VALIDATION_REPORT.md');
      await this.saveReport(reportPath);

      console.log('\n' + '='.repeat(60));
      console.log('✅ TEST VALIDATION COMPLETED');
      console.log('='.repeat(60));
      console.log(`📊 Production Readiness Score: ${this.report.productionReadiness.score}/100`);
      console.log(`📈 Command Coverage: ${this.report.commandCoverage.coveragePercentage.toFixed(1)}%`);
      console.log(`🧪 Test Suites Passed: ${this.report.testResults.filter(t => t.passed).length}/${this.report.testResults.length}`);
      console.log(`💡 Recommendations: ${this.report.recommendations.length}`);
      console.log('='.repeat(60));

    } catch (error) {
      console.error('❌ Test validation failed:', error);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const generator = new TestReportGenerator();
  await generator.run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { TestReportGenerator, type ValidationReport };