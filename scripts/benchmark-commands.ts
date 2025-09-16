#!/usr/bin/env tsx

/**
 * Command Performance Benchmarking Tool
 *
 * Analyzes performance of all implemented Plato TUI commands and provides
 * optimization recommendations based on real execution data.
 */

import { performance } from 'perf_hooks';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { commandPerformanceMonitor } from '../src/utils/performance-monitor.js';
import { intelligentCacheManager } from '../src/utils/cache-manager.js';

interface CommandBenchmarkResult {
  command: string;
  category: 'fast' | 'standard' | 'complex';
  executions: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  successRate: number;
  memoryUsage: number;
  cacheHitRate: number;
  bottlenecks: string[];
  performanceGrade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';
  recommendations: string[];
}

interface BenchmarkSuite {
  timestamp: string;
  totalCommands: number;
  implementedCommands: number;
  benchmarkedCommands: number;
  overallPerformance: string;
  results: CommandBenchmarkResult[];
  systemInfo: {
    nodeVersion: string;
    platform: string;
    memory: number;
    cpus: number;
  };
}

class CommandBenchmarker {
  private implementedCommands: Map<string, Function> = new Map();
  private benchmarkResults: CommandBenchmarkResult[] = [];

  constructor() {
    this.loadImplementedCommands();
  }

  private async loadImplementedCommands(): Promise<void> {
    console.log('🔍 Discovering implemented commands...');

    try {
      // Import the commands module
      const { slashCommands } = await import('../src/slash/commands.js');

      // Filter commands that have execute functions
      const implementedCount = slashCommands.filter((cmd: any) => cmd.execute).length;
      console.log(`Found ${implementedCount} implemented commands out of ${slashCommands.length} total`);

      // Store implemented commands
      slashCommands.forEach((cmd: any) => {
        if (cmd.execute) {
          this.implementedCommands.set(cmd.name, cmd.execute);
        }
      });

    } catch (error) {
      console.error('Failed to load commands:', error);
      process.exit(1);
    }
  }

  /**
   * Run comprehensive benchmark on all implemented commands
   */
  async runComprehensiveBenchmark(): Promise<BenchmarkSuite> {
    console.log('\n🚀 Starting Comprehensive Command Performance Benchmark');
    console.log('=' .repeat(60));

    const startTime = performance.now();

    // Warm up the system
    await this.warmupSystem();

    // Benchmark each implemented command
    for (const [commandName, executeFunc] of this.implementedCommands.entries()) {
      console.log(`\n📊 Benchmarking /${commandName}...`);

      try {
        const result = await this.benchmarkCommand(commandName, executeFunc);
        this.benchmarkResults.push(result);

        this.logCommandResult(result);
      } catch (error) {
        console.error(`❌ Failed to benchmark /${commandName}:`, error);
      }
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    console.log(`\n✅ Benchmark completed in ${(totalTime / 1000).toFixed(2)}s`);

    // Generate comprehensive report
    const suite = this.generateBenchmarkSuite(totalTime);
    await this.saveBenchmarkReport(suite);

    return suite;
  }

  /**
   * Benchmark a specific command with multiple test scenarios
   */
  private async benchmarkCommand(
    commandName: string,
    executeFunc: Function
  ): Promise<CommandBenchmarkResult> {
    const category = this.categorizeCommand(commandName);
    const testScenarios = this.getTestScenariosForCommand(commandName);

    const executionTimes: number[] = [];
    const memoryUsages: number[] = [];
    let successCount = 0;
    let cacheHits = 0;
    let totalCacheOps = 0;

    // Run multiple executions with different scenarios
    for (const scenario of testScenarios) {
      for (let i = 0; i < scenario.iterations; i++) {
        const measurementId = commandPerformanceMonitor.startCommandMeasurement(
          commandName,
          scenario.args
        );

        const memoryBefore = process.memoryUsage().heapUsed;
        const startTime = performance.now();

        try {
          // Execute the command
          await executeFunc(scenario.args, scenario.mockSession, scenario.mockProvider);
          successCount++;
        } catch (error) {
          // Command failed, but still record timing
          console.warn(`Command /${commandName} failed with args [${scenario.args.join(', ')}]:`, error);
        }

        const endTime = performance.now();
        const memoryAfter = process.memoryUsage().heapUsed;

        executionTimes.push(endTime - startTime);
        memoryUsages.push(memoryAfter - memoryBefore);

        // End measurement and get metrics
        const metrics = commandPerformanceMonitor.endCommandMeasurement(
          measurementId,
          commandName,
          scenario.args,
          true
        );

        // Track cache statistics
        totalCacheOps += metrics.cacheHits + metrics.cacheMisses;
        cacheHits += metrics.cacheHits;
      }
    }

    // Calculate statistics
    const totalExecutions = testScenarios.reduce((sum, scenario) => sum + scenario.iterations, 0);
    const averageTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
    const minTime = Math.min(...executionTimes);
    const maxTime = Math.max(...executionTimes);
    const successRate = (successCount / totalExecutions) * 100;
    const averageMemory = memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length;
    const cacheHitRate = totalCacheOps > 0 ? (cacheHits / totalCacheOps) * 100 : 0;

    // Get bottlenecks from performance monitor
    const report = commandPerformanceMonitor.getPerformanceReport();
    const commandStats = report.commandStats.find(stat => stat.command === commandName);
    const bottlenecks = commandStats?.bottlenecks || [];

    // Generate performance grade
    const grade = this.calculatePerformanceGrade(category, averageTime, successRate, cacheHitRate);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      commandName,
      category,
      averageTime,
      successRate,
      cacheHitRate,
      bottlenecks
    );

    return {
      command: commandName,
      category,
      executions: totalExecutions,
      averageTime,
      minTime,
      maxTime,
      successRate,
      memoryUsage: averageMemory,
      cacheHitRate,
      bottlenecks,
      performanceGrade: grade,
      recommendations
    };
  }

  /**
   * Categorize command by expected performance characteristics
   */
  private categorizeCommand(commandName: string): 'fast' | 'standard' | 'complex' {
    const fastCommands = ['help', 'mouse', 'paste', 'statusline', 'keydebug'];
    const complexCommands = ['memory', 'debug', 'security-review', 'analytics', 'export'];

    if (fastCommands.includes(commandName)) return 'fast';
    if (complexCommands.includes(commandName)) return 'complex';
    return 'standard';
  }

  /**
   * Get test scenarios for a specific command
   */
  private getTestScenariosForCommand(commandName: string): Array<{
    args: string[];
    iterations: number;
    mockSession: any;
    mockProvider: any;
  }> {
    const mockSession = { id: 'test-session' };
    const mockProvider = { model: 'test-model' };

    const baseScenarios = {
      fast: [
        { args: [], iterations: 20 },
        { args: ['help'], iterations: 10 }
      ],
      standard: [
        { args: [], iterations: 10 },
        { args: ['status'], iterations: 5 },
        { args: ['list'], iterations: 5 }
      ],
      complex: [
        { args: [], iterations: 5 },
        { args: ['status'], iterations: 3 },
        { args: ['export', 'test.json'], iterations: 2 }
      ]
    };

    const category = this.categorizeCommand(commandName);
    const scenarios = baseScenarios[category];

    // Add command-specific scenarios
    const commandSpecificScenarios = this.getCommandSpecificScenarios(commandName);

    return [...scenarios, ...commandSpecificScenarios].map(scenario => ({
      ...scenario,
      mockSession,
      mockProvider
    }));
  }

  /**
   * Get command-specific test scenarios
   */
  private getCommandSpecificScenarios(commandName: string): Array<{ args: string[]; iterations: number }> {
    const scenarios: Record<string, Array<{ args: string[]; iterations: number }>> = {
      memory: [
        { args: ['statistics'], iterations: 3 },
        { args: ['search', 'test'], iterations: 2 },
        { args: ['compact'], iterations: 1 }
      ],
      mcp: [
        { args: ['list'], iterations: 5 },
        { args: ['tools'], iterations: 3 }
      ],
      help: [
        { args: ['memory'], iterations: 5 },
        { args: ['mcp'], iterations: 5 }
      ],
      'output-style': [
        { args: ['list'], iterations: 3 },
        { args: ['set', 'minimal'], iterations: 2 }
      ]
    };

    return scenarios[commandName] || [];
  }

  /**
   * Calculate performance grade based on metrics
   */
  private calculatePerformanceGrade(
    category: string,
    averageTime: number,
    successRate: number,
    cacheHitRate: number
  ): CommandBenchmarkResult['performanceGrade'] {
    const thresholds = {
      fast: { excellent: 25, good: 50, fair: 100 },
      standard: { excellent: 100, good: 200, fair: 500 },
      complex: { excellent: 500, good: 1000, fair: 2000 }
    };

    const categoryThresholds = thresholds[category as keyof typeof thresholds];
    let score = 0;

    // Performance score (0-40 points)
    if (averageTime <= categoryThresholds.excellent) score += 40;
    else if (averageTime <= categoryThresholds.good) score += 30;
    else if (averageTime <= categoryThresholds.fair) score += 20;
    else score += 10;

    // Success rate score (0-35 points)
    if (successRate >= 98) score += 35;
    else if (successRate >= 95) score += 30;
    else if (successRate >= 90) score += 25;
    else if (successRate >= 80) score += 15;
    else score += 5;

    // Cache efficiency score (0-25 points) - only if caching is used
    if (cacheHitRate > 0) {
      if (cacheHitRate >= 80) score += 25;
      else if (cacheHitRate >= 60) score += 20;
      else if (cacheHitRate >= 40) score += 15;
      else score += 10;
    } else {
      score += 15; // Neutral score for commands without caching
    }

    // Convert score to grade
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C+';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    commandName: string,
    category: string,
    averageTime: number,
    successRate: number,
    cacheHitRate: number,
    bottlenecks: string[]
  ): string[] {
    const recommendations: string[] = [];

    const thresholds = {
      fast: { good: 50 },
      standard: { good: 200 },
      complex: { good: 1000 }
    };

    const categoryThreshold = thresholds[category as keyof typeof thresholds].good;

    // Performance recommendations
    if (averageTime > categoryThreshold) {
      recommendations.push(`🚀 Optimize execution time - currently ${averageTime.toFixed(2)}ms (target: <${categoryThreshold}ms)`);
    }

    // Success rate recommendations
    if (successRate < 95) {
      recommendations.push(`🛠️  Improve error handling - success rate is ${successRate.toFixed(1)}% (target: >95%)`);
    }

    // Caching recommendations
    if (cacheHitRate > 0 && cacheHitRate < 70) {
      recommendations.push(`📦 Optimize caching strategy - hit rate is ${cacheHitRate.toFixed(1)}% (target: >70%)`);
    } else if (cacheHitRate === 0 && category !== 'fast') {
      recommendations.push('💾 Consider implementing result caching for expensive operations');
    }

    // Bottleneck-specific recommendations
    bottlenecks.forEach(bottleneck => {
      switch (bottleneck) {
        case 'execution-time':
          recommendations.push('⚡ Consider async/await optimization and parallel processing');
          break;
        case 'memory-usage':
          recommendations.push('🧹 Implement memory cleanup and object pooling');
          break;
        case 'network-calls':
          recommendations.push('🌐 Batch network requests and implement connection pooling');
          break;
        case 'file-operations':
          recommendations.push('📁 Optimize file I/O with streaming and batching');
          break;
      }
    });

    // Command-specific recommendations
    const commandSpecific = this.getCommandSpecificRecommendations(commandName, averageTime);
    recommendations.push(...commandSpecific);

    return recommendations.slice(0, 5); // Limit to top 5 recommendations
  }

  /**
   * Get command-specific optimization recommendations
   */
  private getCommandSpecificRecommendations(commandName: string, averageTime: number): string[] {
    const recommendations: Record<string, string[]> = {
      memory: [
        '🔍 Implement memory statistics caching',
        '📊 Use streaming for large data exports',
        '🧠 Add intelligent memory compaction'
      ],
      mcp: [
        '🔗 Implement MCP server connection pooling',
        '📋 Cache MCP server configurations',
        '⚙️  Batch MCP tool queries'
      ],
      help: [
        '📚 Pre-compute and cache help content',
        '🔍 Implement indexed command search',
        '📝 Use help content compression'
      ],
      debug: [
        '🐛 Implement debug session caching',
        '📊 Optimize diagnostic data collection',
        '🔧 Add parallel debugging operations'
      ]
    };

    return recommendations[commandName]?.slice(0, 3) || [];
  }

  /**
   * Warm up the system before benchmarking
   */
  private async warmupSystem(): Promise<void> {
    console.log('🔥 Warming up system...');

    // Warm up performance monitoring
    const warmupId = commandPerformanceMonitor.startCommandMeasurement('warmup');
    await new Promise(resolve => setTimeout(resolve, 100));
    commandPerformanceMonitor.endCommandMeasurement(warmupId, 'warmup');

    // Warm up cache system
    intelligentCacheManager.set('warmup-key', 'warmup-value', 'config');
    intelligentCacheManager.get('warmup-key', 'config');

    // Trigger garbage collection if available
    if (global.gc) {
      global.gc();
    }

    console.log('✅ System warmed up');
  }

  /**
   * Log individual command result
   */
  private logCommandResult(result: CommandBenchmarkResult): void {
    const gradeEmoji = {
      'A+': '🏆', 'A': '🥇', 'B+': '🥈', 'B': '🥉',
      'C+': '📊', 'C': '📈', 'D': '⚠️ ', 'F': '❌'
    };

    console.log(`  ${gradeEmoji[result.performanceGrade]} Grade: ${result.performanceGrade}`);
    console.log(`  ⏱️  Average: ${result.averageTime.toFixed(2)}ms`);
    console.log(`  ✅ Success: ${result.successRate.toFixed(1)}%`);

    if (result.cacheHitRate > 0) {
      console.log(`  📦 Cache: ${result.cacheHitRate.toFixed(1)}%`);
    }

    if (result.recommendations.length > 0) {
      console.log(`  💡 Top suggestion: ${result.recommendations[0]}`);
    }
  }

  /**
   * Generate comprehensive benchmark suite
   */
  private generateBenchmarkSuite(totalTime: number): BenchmarkSuite {
    const overallGrades = this.benchmarkResults.map(r => r.performanceGrade);
    const gradePoints = {
      'A+': 100, 'A': 90, 'B+': 85, 'B': 80,
      'C+': 70, 'C': 60, 'D': 50, 'F': 0
    };

    const averageScore = overallGrades.reduce((sum, grade) => sum + gradePoints[grade], 0) / overallGrades.length;
    let overallPerformance: string;

    if (averageScore >= 90) overallPerformance = 'Excellent';
    else if (averageScore >= 80) overallPerformance = 'Good';
    else if (averageScore >= 70) overallPerformance = 'Fair';
    else if (averageScore >= 60) overallPerformance = 'Poor';
    else overallPerformance = 'Critical';

    return {
      timestamp: new Date().toISOString(),
      totalCommands: 40, // Total defined commands
      implementedCommands: this.implementedCommands.size,
      benchmarkedCommands: this.benchmarkResults.length,
      overallPerformance,
      results: this.benchmarkResults,
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        cpus: require('os').cpus().length
      }
    };
  }

  /**
   * Save benchmark report to file
   */
  private async saveBenchmarkReport(suite: BenchmarkSuite): Promise<void> {
    const reportsDir = join(process.cwd(), '.plato', 'performance', 'command-benchmarks');

    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(reportsDir, `command-benchmark-${timestamp}.json`);
    const markdownPath = join(reportsDir, `command-benchmark-${timestamp}.md`);

    // Save JSON report
    writeFileSync(reportPath, JSON.stringify(suite, null, 2));

    // Generate and save Markdown report
    const markdown = this.generateMarkdownReport(suite);
    writeFileSync(markdownPath, markdown);

    console.log(`\n📊 Benchmark report saved:`);
    console.log(`  JSON: ${reportPath}`);
    console.log(`  Markdown: ${markdownPath}`);
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdownReport(suite: BenchmarkSuite): string {
    return `# Plato TUI Command Performance Benchmark Report

Generated: ${new Date(suite.timestamp).toLocaleString()}

## Summary

- **Total Commands**: ${suite.totalCommands}
- **Implemented**: ${suite.implementedCommands} (${Math.round((suite.implementedCommands / suite.totalCommands) * 100)}%)
- **Benchmarked**: ${suite.benchmarkedCommands}
- **Overall Performance**: ${suite.overallPerformance}

## System Information

- **Node Version**: ${suite.systemInfo.nodeVersion}
- **Platform**: ${suite.systemInfo.platform}
- **Memory**: ${suite.systemInfo.memory}MB
- **CPUs**: ${suite.systemInfo.cpus}

## Performance Results

| Command | Category | Grade | Avg Time (ms) | Success Rate | Cache Hit Rate | Bottlenecks |
|---------|----------|-------|---------------|--------------|----------------|-------------|
${suite.results.map(result =>
  `| ${result.command} | ${result.category} | ${result.performanceGrade} | ${result.averageTime.toFixed(2)} | ${result.successRate.toFixed(1)}% | ${result.cacheHitRate.toFixed(1)}% | ${result.bottlenecks.join(', ') || 'None'} |`
).join('\n')}

## Detailed Recommendations

${suite.results.map(result => `
### /${result.command}

**Performance Grade**: ${result.performanceGrade}
**Execution Time**: ${result.averageTime.toFixed(2)}ms (${result.minTime.toFixed(2)}-${result.maxTime.toFixed(2)}ms)
**Success Rate**: ${result.successRate.toFixed(1)}%

**Recommendations**:
${result.recommendations.map(rec => `- ${rec}`).join('\n')}
`).join('\n')}

## Performance Distribution

- **A-Grade Commands**: ${suite.results.filter(r => r.performanceGrade.startsWith('A')).length}
- **B-Grade Commands**: ${suite.results.filter(r => r.performanceGrade.startsWith('B')).length}
- **C-Grade Commands**: ${suite.results.filter(r => r.performanceGrade.startsWith('C')).length}
- **D-F Grade Commands**: ${suite.results.filter(r => ['D', 'F'].includes(r.performanceGrade)).length}

## Top Performance Issues

${this.getTopPerformanceIssues(suite.results).map(issue => `- ${issue}`).join('\n')}

---
*Generated by Plato TUI Command Performance Benchmarker*
`;
  }

  /**
   * Get top performance issues across all commands
   */
  private getTopPerformanceIssues(results: CommandBenchmarkResult[]): string[] {
    const issues: string[] = [];

    // Find slowest commands
    const slowCommands = results
      .filter(r => r.performanceGrade === 'D' || r.performanceGrade === 'F')
      .sort((a, b) => b.averageTime - a.averageTime);

    if (slowCommands.length > 0) {
      issues.push(`Slowest command: /${slowCommands[0].command} (${slowCommands[0].averageTime.toFixed(2)}ms)`);
    }

    // Find commands with low success rates
    const unreliableCommands = results.filter(r => r.successRate < 95);
    if (unreliableCommands.length > 0) {
      issues.push(`${unreliableCommands.length} commands have success rates below 95%`);
    }

    // Find caching opportunities
    const noCacheCommands = results.filter(r => r.cacheHitRate === 0 && r.category !== 'fast');
    if (noCacheCommands.length > 0) {
      issues.push(`${noCacheCommands.length} commands could benefit from caching`);
    }

    return issues.slice(0, 5);
  }
}

// CLI execution
async function main() {
  console.log('🎯 Plato TUI Command Performance Benchmarker');
  console.log('==========================================\n');

  const benchmarker = new CommandBenchmarker();

  try {
    const suite = await benchmarker.runComprehensiveBenchmark();

    console.log('\n📈 Benchmark Summary:');
    console.log(`Overall Performance: ${suite.overallPerformance}`);
    console.log(`Commands Benchmarked: ${suite.benchmarkedCommands}/${suite.implementedCommands}`);

    const excellentCommands = suite.results.filter(r => r.performanceGrade.startsWith('A')).length;
    const needsWork = suite.results.filter(r => ['D', 'F'].includes(r.performanceGrade)).length;

    console.log(`Excellent Performance: ${excellentCommands} commands`);
    if (needsWork > 0) {
      console.log(`⚠️  Needs Optimization: ${needsWork} commands`);
    }

  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { CommandBenchmarker };