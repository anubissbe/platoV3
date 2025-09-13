/**
 * Jest Performance Reporter
 * Captures and reports performance test results and metrics
 */

const fs = require('fs');
const path = require('path');

class PerformanceReporter {
  constructor(globalConfig, options) {
    this.globalConfig = globalConfig;
    this.options = options || {};
    this.outputFile = this.options.outputFile || 'performance-test-results.json';
    this.results = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cpuCount: require('os').cpus().length,
        totalMemory: require('os').totalmem(),
        freeMemory: require('os').freemem(),
      },
      testResults: [],
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        totalDuration: 0,
        averageTestDuration: 0,
        slowTests: [],
        performanceMetrics: {}
      }
    };
  }

  onTestResult(test, testResult) {
    const testFile = path.relative(process.cwd(), testResult.testFilePath);
    
    // Capture performance-specific metrics
    const performanceData = {
      testFilePath: testFile,
      duration: testResult.perfStats?.end - testResult.perfStats?.start || 0,
      numPassingTests: testResult.numPassingTests,
      numFailingTests: testResult.numFailingTests,
      numPendingTests: testResult.numPendingTests,
      tests: testResult.testResults.map(test => ({
        title: test.fullName,
        status: test.status,
        duration: test.duration || 0,
        failureMessages: test.failureMessages,
        ancestorTitles: test.ancestorTitles,
        // Extract performance metrics from console output
        performanceMetrics: this.extractPerformanceMetrics(test)
      })),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };

    this.results.testResults.push(performanceData);
    
    // Update summary
    this.results.summary.totalTests += testResult.testResults.length;
    this.results.summary.passedTests += testResult.numPassingTests;
    this.results.summary.failedTests += testResult.numFailingTests;
    this.results.summary.skippedTests += testResult.numPendingTests;
    this.results.summary.totalDuration += performanceData.duration;
    
    // Track slow tests (> 5 seconds)
    if (performanceData.duration > 5000) {
      this.results.summary.slowTests.push({
        testFile: testFile,
        duration: performanceData.duration,
        slowTestsCount: performanceData.tests.filter(t => t.duration > 1000).length
      });
    }
  }

  extractPerformanceMetrics(test) {
    const metrics = {};
    
    // Look for performance-related data in test title and output
    if (test.fullName.includes('benchmark')) {
      metrics.type = 'benchmark';
    } else if (test.fullName.includes('load')) {
      metrics.type = 'load_test';
    } else if (test.fullName.includes('memory')) {
      metrics.type = 'memory_test';
    } else if (test.fullName.includes('stability')) {
      metrics.type = 'stability_test';
    }
    
    // Extract numeric metrics from failure messages or console output
    if (test.failureMessages) {
      test.failureMessages.forEach(message => {
        const opsMatch = message.match(/(\d+\.?\d*)\s*operations?\s*per\s*second/i);
        if (opsMatch) {
          metrics.operationsPerSecond = parseFloat(opsMatch[1]);
        }
        
        const responseTimeMatch = message.match(/(\d+\.?\d*)\s*ms\s*average/i);
        if (responseTimeMatch) {
          metrics.averageResponseTime = parseFloat(responseTimeMatch[1]);
        }
        
        const memoryMatch = message.match(/(\d+\.?\d*)\s*MB/i);
        if (memoryMatch) {
          metrics.memoryUsageMB = parseFloat(memoryMatch[1]);
        }
      });
    }
    
    return Object.keys(metrics).length > 0 ? metrics : undefined;
  }

  onRunComplete(contexts, results) {
    // Finalize summary
    this.results.summary.averageTestDuration = this.results.summary.totalDuration / Math.max(1, this.results.summary.totalTests);
    
    // Calculate overall performance metrics
    this.calculateOverallMetrics();
    
    // Save results to file
    this.saveResults();
    
    // Print performance summary
    this.printSummary();
  }

  calculateOverallMetrics() {
    const metrics = this.results.summary.performanceMetrics;
    const allTests = this.results.testResults.flatMap(r => r.tests);
    
    // Performance test counts by type
    metrics.benchmarkTests = allTests.filter(t => t.performanceMetrics?.type === 'benchmark').length;
    metrics.loadTests = allTests.filter(t => t.performanceMetrics?.type === 'load_test').length;
    metrics.memoryTests = allTests.filter(t => t.performanceMetrics?.type === 'memory_test').length;
    metrics.stabilityTests = allTests.filter(t => t.performanceMetrics?.type === 'stability_test').length;
    
    // Average metrics across all tests
    const testsWithOps = allTests.filter(t => t.performanceMetrics?.operationsPerSecond);
    if (testsWithOps.length > 0) {
      metrics.averageOperationsPerSecond = testsWithOps.reduce((sum, t) => sum + t.performanceMetrics.operationsPerSecond, 0) / testsWithOps.length;
    }
    
    const testsWithResponseTime = allTests.filter(t => t.performanceMetrics?.averageResponseTime);
    if (testsWithResponseTime.length > 0) {
      metrics.averageResponseTime = testsWithResponseTime.reduce((sum, t) => sum + t.performanceMetrics.averageResponseTime, 0) / testsWithResponseTime.length;
    }
    
    // Memory usage statistics
    const memoryUsages = this.results.testResults.map(r => r.memoryUsage.heapUsed);
    metrics.memoryStats = {
      min: Math.min(...memoryUsages),
      max: Math.max(...memoryUsages),
      average: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
      growth: Math.max(...memoryUsages) - Math.min(...memoryUsages)
    };
  }

  saveResults() {
    try {
      // Ensure performance-reports directory exists
      const reportsDir = path.join(process.cwd(), 'performance-reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      
      // Save main results file
      const outputPath = path.join(process.cwd(), this.outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2));
      
      // Save timestamped copy in reports directory
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const timestampedPath = path.join(reportsDir, `performance-report-${timestamp}.json`);
      fs.writeFileSync(timestampedPath, JSON.stringify(this.results, null, 2));
      
      console.log(`\n📊 Performance results saved to: ${outputPath}`);
      console.log(`📊 Timestamped report saved to: ${timestampedPath}`);
      
    } catch (error) {
      console.error('Failed to save performance results:', error.message);
    }
  }

  printSummary() {
    const { summary, environment } = this.results;
    
    console.log('\n🚀 PERFORMANCE TEST SUMMARY');
    console.log('='.repeat(50));
    
    console.log(`📈 Test Results:`);
    console.log(`   Total Tests: ${summary.totalTests}`);
    console.log(`   Passed: ${summary.passedTests} (${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}%)`);
    console.log(`   Failed: ${summary.failedTests}`);
    console.log(`   Skipped: ${summary.skippedTests}`);
    
    console.log(`\n⏱️  Timing:`);
    console.log(`   Total Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`   Average Test Duration: ${summary.averageTestDuration.toFixed(0)}ms`);
    
    if (summary.slowTests.length > 0) {
      console.log(`\n🐌 Slow Tests (>5s):`);
      summary.slowTests.forEach(test => {
        console.log(`   ${test.testFile}: ${(test.duration / 1000).toFixed(2)}s`);
      });
    }
    
    console.log(`\n💾 Memory Usage:`);
    if (summary.performanceMetrics.memoryStats) {
      const memStats = summary.performanceMetrics.memoryStats;
      console.log(`   Min: ${(memStats.min / 1024 / 1024).toFixed(1)}MB`);
      console.log(`   Max: ${(memStats.max / 1024 / 1024).toFixed(1)}MB`);
      console.log(`   Average: ${(memStats.average / 1024 / 1024).toFixed(1)}MB`);
      console.log(`   Growth: ${(memStats.growth / 1024 / 1024).toFixed(1)}MB`);
    }
    
    console.log(`\n🧪 Test Types:`);
    console.log(`   Benchmark Tests: ${summary.performanceMetrics.benchmarkTests || 0}`);
    console.log(`   Load Tests: ${summary.performanceMetrics.loadTests || 0}`);
    console.log(`   Memory Tests: ${summary.performanceMetrics.memoryTests || 0}`);
    console.log(`   Stability Tests: ${summary.performanceMetrics.stabilityTests || 0}`);
    
    if (summary.performanceMetrics.averageOperationsPerSecond) {
      console.log(`\n⚡ Performance Metrics:`);
      console.log(`   Average Operations/Second: ${summary.performanceMetrics.averageOperationsPerSecond.toFixed(1)}`);
      if (summary.performanceMetrics.averageResponseTime) {
        console.log(`   Average Response Time: ${summary.performanceMetrics.averageResponseTime.toFixed(1)}ms`);
      }
    }
    
    console.log(`\n🖥️  Environment:`);
    console.log(`   Node.js: ${environment.nodeVersion}`);
    console.log(`   Platform: ${environment.platform} (${environment.arch})`);
    console.log(`   CPUs: ${environment.cpuCount}`);
    console.log(`   Total Memory: ${(environment.totalMemory / 1024 / 1024 / 1024).toFixed(1)}GB`);
    
    console.log('\n' + '='.repeat(50));
  }
}

module.exports = PerformanceReporter;