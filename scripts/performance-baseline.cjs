#!/usr/bin/env node

/**
 * Performance baseline tracking script
 * Measures and tracks test execution performance
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASELINE_FILE = path.join(__dirname, '..', 'performance-baseline.json');
const RESULTS_DIR = path.join(__dirname, '..', '.performance');

// Performance targets and thresholds
const PERFORMANCE_TARGETS = {
  fast: {
    target: 8000, // 8 seconds target
    warning: 10000, // 10 seconds warning
    critical: 15000, // 15 seconds critical
    baseline: 47700, // Original baseline: 47.7 seconds
  },
  reliable: {
    target: 30000, // 30 seconds target
    warning: 45000, // 45 seconds warning  
    critical: 60000, // 60 seconds critical
  }
};

class PerformanceMonitor {
  constructor() {
    this.ensureResultsDir();
    this.baseline = this.loadBaseline();
  }

  ensureResultsDir() {
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
  }

  loadBaseline() {
    try {
      if (fs.existsSync(BASELINE_FILE)) {
        return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load performance baseline:', error.message);
    }
    return {};
  }

  saveBaseline(results) {
    const baseline = {
      ...this.baseline,
      lastUpdated: new Date().toISOString(),
      results
    };
    
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
    console.log('✅ Performance baseline updated');
  }

  measureTestExecution(configName, command) {
    console.log(`📊 Measuring ${configName} performance...`);
    const startTime = Date.now();
    
    try {
      const output = execSync(command, { 
        encoding: 'utf8',
        stdio: ['inherit', 'pipe', 'pipe'],
        timeout: 120000 // 2 minute timeout
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Extract test stats from output
      const stats = this.parseTestOutput(output);
      
      const result = {
        configName,
        executionTime,
        timestamp: new Date().toISOString(),
        stats,
        status: 'success'
      };
      
      this.analyzePerformance(result);
      return result;
      
    } catch (error) {
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      const result = {
        configName,
        executionTime,
        timestamp: new Date().toISOString(),
        error: error.message,
        status: 'failed'
      };
      
      console.error(`❌ ${configName} failed in ${executionTime}ms`);
      return result;
    }
  }

  parseTestOutput(output) {
    const stats = {
      testSuites: { passed: 0, failed: 0, total: 0 },
      tests: { passed: 0, failed: 0, skipped: 0, total: 0 }
    };

    // Parse Jest output
    const suiteMatch = output.match(/Test Suites:\s+(\d+)\s+failed,\s+\d+\s+skipped,\s+(\d+)\s+passed,\s+(\d+)\s+of\s+\d+\s+total/);
    if (suiteMatch) {
      stats.testSuites.failed = parseInt(suiteMatch[1]);
      stats.testSuites.passed = parseInt(suiteMatch[2]);
      stats.testSuites.total = parseInt(suiteMatch[3]);
    }

    const testMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+skipped,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (testMatch) {
      stats.tests.failed = parseInt(testMatch[1]);
      stats.tests.skipped = parseInt(testMatch[2]);
      stats.tests.passed = parseInt(testMatch[3]);
      stats.tests.total = parseInt(testMatch[4]);
    }

    return stats;
  }

  analyzePerformance(result) {
    const { configName, executionTime } = result;
    const target = PERFORMANCE_TARGETS[configName];
    
    if (!target) {
      console.log(`⚠️  No performance target defined for ${configName}`);
      return;
    }

    const improvement = target.baseline ? 
      ((target.baseline - executionTime) / target.baseline * 100).toFixed(1) : 0;

    console.log(`\n📈 Performance Analysis for ${configName}:`);
    console.log(`   Execution Time: ${executionTime}ms`);
    console.log(`   Target: ${target.target}ms`);
    
    if (target.baseline) {
      console.log(`   Baseline: ${target.baseline}ms`);
      console.log(`   Improvement: ${improvement}% faster`);
    }

    // Performance status
    if (executionTime <= target.target) {
      console.log(`   Status: ✅ EXCELLENT (within target)`);
    } else if (executionTime <= target.warning) {
      console.log(`   Status: ⚠️  WARNING (exceeds target but acceptable)`);
    } else if (executionTime <= target.critical) {
      console.log(`   Status: 🚨 CRITICAL (performance degradation)`);
    } else {
      console.log(`   Status: ❌ FAILED (severe performance issue)`);
    }

    // Developer velocity impact
    if (configName === 'fast') {
      const velocityMultiplier = Math.round(target.baseline / executionTime * 100) / 100;
      console.log(`   Developer Velocity: ${velocityMultiplier}x faster development`);
    }
  }

  generateReport() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(RESULTS_DIR, `performance-report-${timestamp}.json`);
    
    console.log('\n🎯 Running Performance Benchmarks...\n');

    const results = [];

    // Measure fast test execution
    try {
      const fastResult = this.measureTestExecution(
        'fast',
        'npm run test:fast'
      );
      results.push(fastResult);
    } catch (error) {
      console.error('Failed to measure fast tests:', error.message);
    }

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      targets: PERFORMANCE_TARGETS,
      results,
      summary: this.generateSummary(results)
    };

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`\n📋 Performance report saved: ${reportFile}`);
    console.log('\n📊 Performance Summary:');
    console.log(JSON.stringify(report.summary, null, 2));

    // Update baseline if this is a successful run
    const successfulResults = results.filter(r => r.status === 'success');
    if (successfulResults.length > 0) {
      this.saveBaseline(successfulResults);
    }

    return report;
  }

  generateSummary(results) {
    const summary = {
      totalTests: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      averageExecutionTime: 0,
      performanceGrade: 'A+'
    };

    const successfulResults = results.filter(r => r.status === 'success');
    if (successfulResults.length > 0) {
      summary.averageExecutionTime = Math.round(
        successfulResults.reduce((sum, r) => sum + r.executionTime, 0) / successfulResults.length
      );
    }

    // Calculate performance grade
    const fastResult = results.find(r => r.configName === 'fast' && r.status === 'success');
    if (fastResult) {
      const target = PERFORMANCE_TARGETS.fast;
      if (fastResult.executionTime <= target.target) {
        summary.performanceGrade = 'A+';
      } else if (fastResult.executionTime <= target.warning) {
        summary.performanceGrade = 'A';
      } else if (fastResult.executionTime <= target.critical) {
        summary.performanceGrade = 'B';
      } else {
        summary.performanceGrade = 'F';
      }
    }

    return summary;
  }

  // Command line interface
  run() {
    const command = process.argv[2];
    
    switch (command) {
      case 'benchmark':
        return this.generateReport();
      case 'fast':
        return this.measureTestExecution('fast', 'npm run test:fast');
      case 'baseline':
        console.log('Current performance baseline:');
        console.log(JSON.stringify(this.baseline, null, 2));
        break;
      case 'clean':
        if (fs.existsSync(RESULTS_DIR)) {
          fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
          console.log('✅ Performance results cleaned');
        }
        break;
      default:
        console.log(`
🎯 Performance Baseline Tool

Commands:
  benchmark  - Run full performance benchmark
  fast      - Measure fast test performance only
  baseline  - Show current baseline
  clean     - Clean performance results

Example:
  node scripts/performance-baseline.cjs benchmark
        `);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const monitor = new PerformanceMonitor();
  monitor.run();
}

module.exports = PerformanceMonitor;