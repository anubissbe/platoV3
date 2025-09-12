#!/usr/bin/env node
/**
 * Performance Benchmarking Suite for Critical Paths
 * Measures and tracks performance of key operations in PlatoV3
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

/**
 * Critical path definitions
 */
const CRITICAL_PATHS = {
  cli_startup: {
    name: 'CLI Startup Time',
    description: 'Time from CLI invocation to ready state',
    target: 500, // ms
    warning: 750,
    critical: 1000
  },
  
  tui_initialization: {
    name: 'TUI Initialization',
    description: 'Time to initialize terminal UI components',
    target: 200,
    warning: 400,
    critical: 600
  },
  
  chat_completion: {
    name: 'Chat Completion Processing',
    description: 'Time to process and display chat completions',
    target: 100,
    warning: 200,
    critical: 500
  },
  
  mcp_tool_call: {
    name: 'MCP Tool Call Execution',
    description: 'Time to execute MCP tool calls',
    target: 1000,
    warning: 2000,
    critical: 5000
  },
  
  file_operations: {
    name: 'File Operations',
    description: 'Time for read/write/edit operations',
    target: 50,
    warning: 100,
    critical: 200
  },
  
  session_persistence: {
    name: 'Session Save/Load',
    description: 'Time to save or load session state',
    target: 100,
    warning: 250,
    critical: 500
  },
  
  context_indexing: {
    name: 'Context Indexing',
    description: 'Time to build or update context index',
    target: 1000,
    warning: 3000,
    critical: 5000
  },
  
  memory_operations: {
    name: 'Memory Operations',
    description: 'Time for memory read/write operations',
    target: 25,
    warning: 50,
    critical: 100
  }
};

/**
 * Benchmark result structure
 */
class BenchmarkResult {
  constructor(pathId, measurements, metadata = {}) {
    this.pathId = pathId;
    this.measurements = measurements; // array of timing measurements
    this.metadata = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      ...metadata
    };
    
    // Calculate statistics
    this.stats = this.calculateStatistics(measurements);
    this.performance = this.evaluatePerformance(pathId);
  }
  
  calculateStatistics(measurements) {
    if (measurements.length === 0) return null;
    
    const sorted = [...measurements].sort((a, b) => a - b);
    const count = measurements.length;
    const sum = measurements.reduce((a, b) => a + b, 0);
    
    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: sum / count,
      median: count % 2 === 0 
        ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
        : sorted[Math.floor(count / 2)],
      p90: sorted[Math.floor(count * 0.9)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
      stdDev: this.calculateStandardDeviation(measurements, sum / count)
    };
  }
  
  calculateStandardDeviation(values, mean) {
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }
  
  evaluatePerformance(pathId) {
    const path = CRITICAL_PATHS[pathId];
    if (!path || !this.stats) return { status: 'unknown', message: 'No data' };
    
    const value = this.stats.p95; // Use 95th percentile for evaluation
    
    if (value <= path.target) {
      return { status: 'excellent', message: `Within target (${path.target}ms)` };
    } else if (value <= path.warning) {
      return { status: 'good', message: `Acceptable (${path.warning}ms threshold)` };
    } else if (value <= path.critical) {
      return { status: 'warning', message: `Approaching critical threshold (${path.critical}ms)` };
    } else {
      return { status: 'critical', message: `Exceeds critical threshold (${path.critical}ms)` };
    }
  }
}

/**
 * Performance benchmark runner
 */
class PerformanceBenchmarkRunner {
  constructor(options = {}) {
    this.options = {
      iterations: 10,
      warmupIterations: 3,
      outputDir: 'performance-reports',
      verbose: true,
      ...options
    };
    
    this.results = new Map();
  }
  
  /**
   * Run benchmark for a specific critical path
   */
  async benchmarkPath(pathId, benchmarkFunction) {
    const pathConfig = CRITICAL_PATHS[pathId];
    if (!pathConfig) {
      throw new Error(`Unknown critical path: ${pathId}`);
    }
    
    if (this.options.verbose) {
      console.log(`\n🏃 Benchmarking: ${pathConfig.name}`);
      console.log(`   Description: ${pathConfig.description}`);
      console.log(`   Target: ${pathConfig.target}ms, Warning: ${pathConfig.warning}ms, Critical: ${pathConfig.critical}ms`);
    }
    
    const measurements = [];
    
    // Warmup runs
    if (this.options.verbose) {
      console.log(`   Warming up (${this.options.warmupIterations} iterations)...`);
    }
    
    for (let i = 0; i < this.options.warmupIterations; i++) {
      try {
        await benchmarkFunction();
      } catch (error) {
        console.warn(`   Warmup iteration ${i + 1} failed:`, error.message);
      }
    }
    
    // Actual benchmark runs
    if (this.options.verbose) {
      console.log(`   Running benchmark (${this.options.iterations} iterations)...`);
    }
    
    for (let i = 0; i < this.options.iterations; i++) {
      try {
        const startTime = performance.now();
        await benchmarkFunction();
        const duration = performance.now() - startTime;
        measurements.push(duration);
        
        if (this.options.verbose) {
          const statusIcon = duration <= pathConfig.target ? '✅' : 
                           duration <= pathConfig.warning ? '⚠️' : '❌';
          process.stdout.write(`   ${statusIcon} Iteration ${i + 1}: ${duration.toFixed(1)}ms\n`);
        }
      } catch (error) {
        console.error(`   ❌ Iteration ${i + 1} failed:`, error.message);
      }
    }
    
    if (measurements.length === 0) {
      throw new Error(`All benchmark iterations failed for ${pathId}`);
    }
    
    const result = new BenchmarkResult(pathId, measurements, {
      iterations: this.options.iterations,
      warmupIterations: this.options.warmupIterations,
      successfulRuns: measurements.length
    });
    
    this.results.set(pathId, result);
    
    if (this.options.verbose) {
      this.printResult(pathId, result);
    }
    
    return result;
  }
  
  /**
   * Run all available benchmarks
   */
  async runAllBenchmarks() {
    console.log('🏁 Starting Performance Benchmark Suite');
    console.log('=====================================');
    
    // Define benchmark functions for each critical path
    const benchmarks = {
      cli_startup: () => this.benchmarkCliStartup(),
      tui_initialization: () => this.benchmarkTuiInitialization(),
      chat_completion: () => this.benchmarkChatCompletion(),
      mcp_tool_call: () => this.benchmarkMcpToolCall(),
      file_operations: () => this.benchmarkFileOperations(),
      session_persistence: () => this.benchmarkSessionPersistence(),
      context_indexing: () => this.benchmarkContextIndexing(),
      memory_operations: () => this.benchmarkMemoryOperations()
    };
    
    const startTime = performance.now();
    
    for (const [pathId, benchmarkFn] of Object.entries(benchmarks)) {
      try {
        await this.benchmarkPath(pathId, benchmarkFn);
      } catch (error) {
        console.error(`\n❌ Benchmark failed for ${pathId}:`, error.message);
      }
    }
    
    const totalDuration = performance.now() - startTime;
    console.log(`\n⏱️  Total benchmark time: ${(totalDuration / 1000).toFixed(1)}s`);
    
    return this.generateReport();
  }
  
  // Mock benchmark functions (these would be replaced with actual implementations)
  async benchmarkCliStartup() {
    // Simulate CLI startup time
    const delay = Math.random() * 300 + 200; // 200-500ms
    await this.sleep(delay);
  }
  
  async benchmarkTuiInitialization() {
    // Simulate TUI initialization
    const delay = Math.random() * 200 + 100; // 100-300ms
    await this.sleep(delay);
  }
  
  async benchmarkChatCompletion() {
    // Simulate chat completion processing
    const delay = Math.random() * 100 + 50; // 50-150ms
    await this.sleep(delay);
  }
  
  async benchmarkMcpToolCall() {
    // Simulate MCP tool call
    const delay = Math.random() * 1000 + 500; // 500-1500ms
    await this.sleep(delay);
  }
  
  async benchmarkFileOperations() {
    // Simulate file operations
    const delay = Math.random() * 50 + 25; // 25-75ms
    await this.sleep(delay);
  }
  
  async benchmarkSessionPersistence() {
    // Simulate session save/load
    const delay = Math.random() * 100 + 50; // 50-150ms
    await this.sleep(delay);
  }
  
  async benchmarkContextIndexing() {
    // Simulate context indexing
    const delay = Math.random() * 2000 + 500; // 500-2500ms
    await this.sleep(delay);
  }
  
  async benchmarkMemoryOperations() {
    // Simulate memory operations
    const delay = Math.random() * 30 + 10; // 10-40ms
    await this.sleep(delay);
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Print benchmark result
   */
  printResult(pathId, result) {
    const pathConfig = CRITICAL_PATHS[pathId];
    const stats = result.stats;
    const perf = result.performance;
    
    console.log(`\n   📊 Results:`);
    console.log(`      Mean:      ${stats.mean.toFixed(1)}ms`);
    console.log(`      Median:    ${stats.median.toFixed(1)}ms`);
    console.log(`      P95:       ${stats.p95.toFixed(1)}ms`);
    console.log(`      Min/Max:   ${stats.min.toFixed(1)}ms / ${stats.max.toFixed(1)}ms`);
    console.log(`      Std Dev:   ${stats.stdDev.toFixed(1)}ms`);
    
    const statusIcons = {
      excellent: '🟢',
      good: '✅',
      warning: '⚠️',
      critical: '❌'
    };
    
    console.log(`   ${statusIcons[perf.status]} Status: ${perf.status.toUpperCase()} - ${perf.message}`);
  }
  
  /**
   * Generate comprehensive benchmark report
   */
  generateReport() {
    const timestamp = new Date().toISOString();
    const report = {
      timestamp,
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        totalBenchmarks: this.results.size
      },
      summary: this.generateSummary(),
      results: Object.fromEntries(this.results.entries()),
      recommendations: this.generateRecommendations()
    };
    
    // Save report
    this.ensureOutputDir();
    const reportPath = path.join(this.options.outputDir, `benchmark-${timestamp.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Benchmark report saved: ${reportPath}`);
    
    return report;
  }
  
  generateSummary() {
    const results = Array.from(this.results.values());
    const statusCounts = { excellent: 0, good: 0, warning: 0, critical: 0 };
    
    results.forEach(result => {
      statusCounts[result.performance.status]++;
    });
    
    return {
      total: results.length,
      statusCounts,
      overallHealth: this.calculateOverallHealth(statusCounts)
    };
  }
  
  calculateOverallHealth(statusCounts) {
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    if (total === 0) return 'unknown';
    
    const score = (statusCounts.excellent * 4 + statusCounts.good * 3 + statusCounts.warning * 2 + statusCounts.critical * 1) / (total * 4);
    
    if (score >= 0.9) return 'excellent';
    if (score >= 0.7) return 'good';
    if (score >= 0.5) return 'fair';
    return 'poor';
  }
  
  generateRecommendations() {
    const recommendations = [];
    
    for (const [pathId, result] of this.results.entries()) {
      const pathConfig = CRITICAL_PATHS[pathId];
      const perf = result.performance;
      
      if (perf.status === 'critical') {
        recommendations.push({
          priority: 'high',
          path: pathConfig.name,
          issue: `Performance is critical (P95: ${result.stats.p95.toFixed(1)}ms > ${pathConfig.critical}ms)`,
          action: 'Immediate optimization required'
        });
      } else if (perf.status === 'warning') {
        recommendations.push({
          priority: 'medium',
          path: pathConfig.name,
          issue: `Performance is degrading (P95: ${result.stats.p95.toFixed(1)}ms)`,
          action: 'Schedule optimization work'
        });
      }
    }
    
    return recommendations;
  }
  
  ensureOutputDir() {
    const outputDir = path.join(process.cwd(), this.options.outputDir);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Performance Benchmark Suite

Usage: node performance-benchmarks.cjs [options]

Options:
  --help, -h              Show this help message
  --iterations <n>        Number of benchmark iterations (default: 10)
  --warmup <n>           Number of warmup iterations (default: 3)
  --quiet, -q            Suppress verbose output
  --output-dir <dir>     Output directory for reports (default: performance-reports)

Examples:
  node performance-benchmarks.cjs
  node performance-benchmarks.cjs --iterations 20 --warmup 5
  node performance-benchmarks.cjs --quiet --output-dir ./benchmarks
    `);
    process.exit(0);
  }
  
  const options = {
    iterations: parseInt(args[args.indexOf('--iterations') + 1]) || 10,
    warmupIterations: parseInt(args[args.indexOf('--warmup') + 1]) || 3,
    verbose: !args.includes('--quiet') && !args.includes('-q'),
    outputDir: args[args.indexOf('--output-dir') + 1] || 'performance-reports'
  };
  
  const runner = new PerformanceBenchmarkRunner(options);
  
  try {
    const report = await runner.runAllBenchmarks();
    
    console.log('\n📈 Benchmark Summary:');
    console.log('====================');
    console.log(`Overall Health: ${report.summary.overallHealth.toUpperCase()}`);
    console.log(`Results: ${report.summary.statusCounts.excellent}🟢 ${report.summary.statusCounts.good}✅ ${report.summary.statusCounts.warning}⚠️ ${report.summary.statusCounts.critical}❌`);
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach((rec, i) => {
        const priorityIcon = rec.priority === 'high' ? '🔥' : '⚠️';
        console.log(`${priorityIcon} ${rec.path}: ${rec.action}`);
      });
    } else {
      console.log('\n✨ All benchmarks performing within acceptable limits!');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Benchmark suite failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { PerformanceBenchmarkRunner, BenchmarkResult, CRITICAL_PATHS };