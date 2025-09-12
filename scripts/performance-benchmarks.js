#!/usr/bin/env node

/**
 * Performance Benchmarking Suite for PlatoV3 Tests
 * Measures and tracks test execution performance over time
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class PerformanceBenchmark {
  constructor() {
    this.timestamp = new Date().toISOString();
    this.resultsDir = path.join(process.cwd(), 'performance-results');
    this.baselineFile = path.join(this.resultsDir, 'baseline.json');
    
    // Ensure results directory exists
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async runBenchmark() {
    console.log('🚀 Starting PlatoV3 Performance Benchmark...\n');
    
    const results = {
      timestamp: this.timestamp,
      nodeVersion: process.version,
      platform: process.platform,
      cpus: require('os').cpus().length,
      memory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + 'GB',
      configurations: {}
    };

    // Test different Jest configurations
    const configs = [
      { name: 'performance', config: 'jest.config.performance.cjs', target: 10000 },
      { name: 'fast', config: 'jest.config.fast.cjs', target: 15000 },
      { name: 'reliable', config: 'jest.config.reliable.cjs', target: 30000 },
      { name: 'default', config: 'jest.config.cjs', target: 48000 }
    ];

    for (const { name, config, target } of configs) {
      console.log(`📊 Testing configuration: ${name}`);
      
      try {
        const startTime = Date.now();
        const result = execSync(`npm test -- --config=${config} --passWithNoTests --silent`, {
          encoding: 'utf8',
          timeout: 120000, // 2 minute timeout
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Parse Jest output for detailed metrics
        const metrics = this.parseJestOutput(result);
        
        results.configurations[name] = {
          duration,
          target,
          improvement: ((target - duration) / target * 100).toFixed(1) + '%',
          withinTarget: duration <= target,
          ...metrics
        };
        
        console.log(`  ⏱️  Duration: ${duration}ms (target: ${target}ms)`);
        console.log(`  🎯 Status: ${duration <= target ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  📈 Improvement: ${results.configurations[name].improvement}\n`);
        
      } catch (error) {
        console.error(`  ❌ Failed to run ${name} configuration:`, error.message);
        results.configurations[name] = {
          error: error.message,
          duration: null,
          target,
          withinTarget: false
        };
      }
    }

    return results;
  }

  parseJestOutput(output) {
    const metrics = {
      testSuites: { total: 0, passed: 0, failed: 0 },
      tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
      coverage: null
    };

    // Parse test suite results
    const testSuiteMatch = output.match(/Test Suites:\s+(\d+)\s+failed,?\s*(\d+)\s+passed,?\s*(\d+)\s+total/);
    if (testSuiteMatch) {
      metrics.testSuites = {
        failed: parseInt(testSuiteMatch[1]) || 0,
        passed: parseInt(testSuiteMatch[2]) || 0,
        total: parseInt(testSuiteMatch[3]) || 0
      };
    }

    // Parse individual test results
    const testMatch = output.match(/Tests:\s+(\d+)\s+failed,?\s*(\d+)\s+skipped,?\s*(\d+)\s+passed,?\s*(\d+)\s+total/);
    if (testMatch) {
      metrics.tests = {
        failed: parseInt(testMatch[1]) || 0,
        skipped: parseInt(testMatch[2]) || 0,
        passed: parseInt(testMatch[3]) || 0,
        total: parseInt(testMatch[4]) || 0
      };
    }

    // Parse timing
    const timeMatch = output.match(/Time:\s+([\d.]+)\s*s/);
    if (timeMatch) {
      metrics.jestReportedTime = parseFloat(timeMatch[1]) * 1000; // Convert to ms
    }

    return metrics;
  }

  async saveResults(results) {
    const filename = `performance-results-${this.timestamp.replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(this.resultsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`📁 Results saved to: ${filepath}`);
    
    // Update latest results
    fs.writeFileSync(path.join(this.resultsDir, 'latest.json'), JSON.stringify(results, null, 2));
    
    return filepath;
  }

  async compareWithBaseline(results) {
    if (!fs.existsSync(this.baselineFile)) {
      console.log('📊 No baseline found. Saving current results as baseline...');
      fs.writeFileSync(this.baselineFile, JSON.stringify(results, null, 2));
      return;
    }

    const baseline = JSON.parse(fs.readFileSync(this.baselineFile, 'utf8'));
    
    console.log('\n📈 Performance Comparison vs Baseline:\n');
    
    for (const [configName, config] of Object.entries(results.configurations)) {
      const baselineConfig = baseline.configurations[configName];
      if (!baselineConfig || !baselineConfig.duration || !config.duration) continue;
      
      const improvement = baselineConfig.duration - config.duration;
      const improvementPercent = (improvement / baselineConfig.duration * 100).toFixed(1);
      
      console.log(`${configName.toUpperCase()}:`);
      console.log(`  Current: ${config.duration}ms`);
      console.log(`  Baseline: ${baselineConfig.duration}ms`);
      console.log(`  Change: ${improvement > 0 ? '✅' : '❌'} ${improvementPercent}% ${improvement > 0 ? 'faster' : 'slower'}\n`);
    }
  }

  generateReport(results) {
    console.log('\n📊 PERFORMANCE BENCHMARK REPORT');
    console.log('=====================================\n');
    
    console.log(`🖥️  System: ${results.platform} | ${results.cpus} CPUs | ${results.memory}`);
    console.log(`📅 Date: ${results.timestamp}`);
    console.log(`🔧 Node: ${results.nodeVersion}\n`);
    
    // Sort configurations by performance
    const sortedConfigs = Object.entries(results.configurations)
      .filter(([_, config]) => config.duration)
      .sort(([_, a], [__, b]) => a.duration - b.duration);
    
    console.log('⚡ PERFORMANCE RANKING:');
    console.log('----------------------');
    
    sortedConfigs.forEach(([name, config], index) => {
      const rank = index + 1;
      const status = config.withinTarget ? '🎯' : '⚠️';
      const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '  ';
      
      console.log(`${emoji} ${rank}. ${name.toUpperCase()}: ${config.duration}ms ${status}`);
      console.log(`     Target: ${config.target}ms | Improvement: ${config.improvement}`);
      
      if (config.tests) {
        console.log(`     Tests: ${config.tests.passed}/${config.tests.total} passed | ${config.testSuites.passed}/${config.testSuites.total} suites\n`);
      }
    });

    // Performance recommendations
    const fastestConfig = sortedConfigs[0];
    if (fastestConfig && fastestConfig[1].duration <= 10000) {
      console.log('✅ PERFORMANCE TARGET ACHIEVED!');
      console.log(`   Fastest configuration: ${fastestConfig[0]} (${fastestConfig[1].duration}ms)`);
    } else {
      console.log('🎯 OPTIMIZATION OPPORTUNITIES:');
      console.log('   - Use performance configuration for development');
      console.log('   - Run slow tests separately in CI');
      console.log('   - Consider test suite segregation');
    }
    
    console.log('\n=====================================\n');
  }
}

// CLI execution
async function main() {
  const benchmark = new PerformanceBenchmark();
  
  try {
    const results = await benchmark.runBenchmark();
    const filepath = await benchmark.saveResults(results);
    
    await benchmark.compareWithBaseline(results);
    benchmark.generateReport(results);
    
    // Set exit code based on performance target
    const performanceConfig = results.configurations.performance;
    if (performanceConfig && performanceConfig.duration && performanceConfig.duration <= 10000) {
      console.log('🎉 All performance targets met!');
      process.exit(0);
    } else {
      console.log('⚠️ Performance targets not met. See recommendations above.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = PerformanceBenchmark;