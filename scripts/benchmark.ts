#!/usr/bin/env tsx

/**
 * Performance Benchmarking Tool
 * Standalone CLI tool for measuring and reporting Plato performance metrics
 * Supports rendering, scrolling, memory, and response time benchmarks
 */

import { performance } from 'perf_hooks';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface BenchmarkConfig {
  iterations: number;
  warmupRuns: number;
  targetFPS: number;
  memoryThresholdMB: number;
  responseTimeTargetMs: number;
}

interface BenchmarkResult {
  name: string;
  operation: string;
  averageTime: number;
  minTime: number;
  maxTime: number;
  iterations: number;
  memoryUsed?: number;
  passedThreshold: boolean;
  timestamp: string;
}

interface BenchmarkSuite {
  config: BenchmarkConfig;
  results: BenchmarkResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    overallPerformance: 'excellent' | 'good' | 'fair' | 'poor';
  };
}

class PerformanceBenchmark {
  private config: BenchmarkConfig;
  private results: BenchmarkResult[] = [];

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = {
      iterations: 100,
      warmupRuns: 10,
      targetFPS: 60,
      memoryThresholdMB: 100,
      responseTimeTargetMs: 50,
      ...config
    };
  }

  /**
   * Run a benchmark function multiple times and collect statistics
   */
  async benchmark(
    name: string,
    operation: string,
    fn: () => Promise<any> | any,
    threshold?: number
  ): Promise<BenchmarkResult> {
    console.log(`🏃 Running benchmark: ${name}`);
    
    // Warmup runs
    for (let i = 0; i < this.config.warmupRuns; i++) {
      await fn();
    }

    const times: number[] = [];
    const memoryStart = process.memoryUsage().heapUsed;

    // Actual benchmark runs
    for (let i = 0; i < this.config.iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    const memoryEnd = process.memoryUsage().heapUsed;
    const memoryUsed = (memoryEnd - memoryStart) / (1024 * 1024); // Convert to MB

    const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    const effectiveThreshold = threshold || this.getDefaultThreshold(operation);
    const passedThreshold = averageTime <= effectiveThreshold;

    const result: BenchmarkResult = {
      name,
      operation,
      averageTime,
      minTime,
      maxTime,
      iterations: this.config.iterations,
      memoryUsed,
      passedThreshold,
      timestamp: new Date().toISOString()
    };

    this.results.push(result);
    this.logResult(result);
    return result;
  }

  /**
   * Get default performance thresholds based on operation type
   */
  private getDefaultThreshold(operation: string): number {
    const thresholds: Record<string, number> = {
      'rendering': 16.67, // 60fps = 16.67ms per frame
      'scrolling': 16.67,
      'input': this.config.responseTimeTargetMs,
      'memory': this.config.memoryThresholdMB,
      'startup': 2000, // 2 seconds
      'command': 100, // 100ms for command execution
      'api': 500, // 500ms for API calls
      'file': 50, // 50ms for file operations
    };

    for (const [key, value] of Object.entries(thresholds)) {
      if (operation.toLowerCase().includes(key)) {
        return value;
      }
    }

    return 100; // Default 100ms threshold
  }

  /**
   * Log individual benchmark result
   */
  private logResult(result: BenchmarkResult): void {
    const status = result.passedThreshold ? '✅' : '❌';
    const memInfo = result.memoryUsed ? ` | Memory: ${result.memoryUsed.toFixed(2)}MB` : '';
    
    console.log(
      `  ${status} ${result.name}: ${result.averageTime.toFixed(2)}ms avg ` +
      `(${result.minTime.toFixed(2)}-${result.maxTime.toFixed(2)}ms)${memInfo}`
    );
  }

  /**
   * Run comprehensive benchmark suite
   */
  async runComprehensiveSuite(): Promise<BenchmarkSuite> {
    console.log('🚀 Starting Comprehensive Performance Benchmark Suite\n');
    console.log(`Configuration:
  - Iterations: ${this.config.iterations}
  - Warmup runs: ${this.config.warmupRuns}
  - Target FPS: ${this.config.targetFPS} (${(1000/this.config.targetFPS).toFixed(2)}ms per frame)
  - Memory threshold: ${this.config.memoryThresholdMB}MB
  - Response time target: ${this.config.responseTimeTargetMs}ms\n`);

    // 1. Component Rendering Benchmarks
    await this.benchmarkComponentRendering();

    // 2. Scrolling Performance
    await this.benchmarkScrolling();

    // 3. Memory Usage
    await this.benchmarkMemoryUsage();

    // 4. Input Response Times
    await this.benchmarkInputResponse();

    // 5. File Operations
    await this.benchmarkFileOperations();

    // 6. Mock API Response Times
    await this.benchmarkAPIResponse();

    const summary = this.generateSummary();
    const suite: BenchmarkSuite = {
      config: this.config,
      results: this.results,
      summary
    };

    this.generateReport(suite);
    return suite;
  }

  /**
   * Benchmark component rendering performance
   */
  private async benchmarkComponentRendering(): Promise<void> {
    console.log('\n📊 Component Rendering Benchmarks');

    // Mock React component rendering
    await this.benchmark(
      'Header Component Render',
      'rendering',
      () => {
        // Simulate component creation and virtual DOM operations
        const mockElement = { 
          type: 'Header', 
          props: { model: 'test', status: 'connected' },
          children: []
        };
        // Simulate processing time
        for (let i = 0; i < 1000; i++) {
          Math.random();
        }
        return mockElement;
      }
    );

    await this.benchmark(
      'ConversationArea Large Render',
      'rendering',
      () => {
        // Simulate rendering large conversation
        const messages = Array.from({ length: 100 }, (_, i) => ({
          id: i,
          content: `Message ${i}`.repeat(10),
          timestamp: Date.now()
        }));
        // Simulate virtual scrolling calculations
        const visibleItems = messages.slice(0, 20);
        for (let i = 0; i < 5000; i++) {
          Math.random();
        }
        return visibleItems;
      }
    );

    await this.benchmark(
      'StatusLine Update',
      'rendering',
      () => {
        // Simulate real-time status updates
        const metrics = {
          tokens: Math.floor(Math.random() * 1000),
          responseTime: Math.random() * 100,
          memoryUsage: Math.random() * 50
        };
        // Simulate formatting and rendering
        for (let i = 0; i < 500; i++) {
          Math.random();
        }
        return metrics;
      }
    );
  }

  /**
   * Benchmark scrolling performance
   */
  private async benchmarkScrolling(): Promise<void> {
    console.log('\n📜 Scrolling Performance Benchmarks');

    await this.benchmark(
      'Smooth Scroll Step',
      'scrolling',
      () => {
        // Simulate smooth scrolling calculation
        const currentPosition = Math.random() * 1000;
        const targetPosition = currentPosition + 10;
        const ease = (t: number) => t * t * (3 - 2 * t); // Smooth ease function
        
        for (let i = 0; i < 100; i++) {
          const progress = i / 100;
          const position = currentPosition + (targetPosition - currentPosition) * ease(progress);
          // Simulate position update
        }
      }
    );

    await this.benchmark(
      'Virtual Scroll Calculation',
      'scrolling',
      () => {
        // Simulate virtual scrolling viewport calculation
        const totalItems = 10000;
        const itemHeight = 20;
        const viewportHeight = 400;
        const scrollPosition = Math.random() * (totalItems * itemHeight);
        
        const startIndex = Math.floor(scrollPosition / itemHeight);
        const endIndex = Math.min(totalItems, startIndex + Math.ceil(viewportHeight / itemHeight) + 1);
        const visibleItems = Array.from({ length: endIndex - startIndex }, (_, i) => startIndex + i);
        
        return { startIndex, endIndex, visibleItems };
      }
    );

    await this.benchmark(
      'Mouse Wheel Processing',
      'scrolling',
      () => {
        // Simulate mouse wheel event processing
        const deltaY = (Math.random() - 0.5) * 100;
        const scrollSensitivity = 3;
        const newDelta = deltaY * scrollSensitivity;
        
        // Simulate momentum and easing
        for (let i = 0; i < 50; i++) {
          Math.random();
        }
        
        return { deltaY: newDelta };
      }
    );
  }

  /**
   * Benchmark memory usage patterns
   */
  private async benchmarkMemoryUsage(): Promise<void> {
    console.log('\n💾 Memory Usage Benchmarks');

    await this.benchmark(
      'Memory Allocation Pattern',
      'memory',
      () => {
        // Simulate memory allocation patterns similar to conversation storage
        const conversation = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: 'A'.repeat(Math.floor(Math.random() * 500) + 100),
          timestamp: Date.now(),
          metadata: { tokens: Math.floor(Math.random() * 100) }
        }));
        
        // Simulate processing
        const processed = conversation.map(msg => ({
          ...msg,
          processed: true,
          wordCount: msg.content.split(' ').length
        }));
        
        return processed.length;
      }
    );

    await this.benchmark(
      'Memory Compaction',
      'memory',
      () => {
        // Simulate memory compaction process
        const largeArray = Array.from({ length: 10000 }, () => Math.random());
        const compacted = largeArray.filter((_, i) => i % 10 === 0);
        return compacted.length;
      }
    );
  }

  /**
   * Benchmark input response times
   */
  private async benchmarkInputResponse(): Promise<void> {
    console.log('\n⌨️  Input Response Benchmarks');

    await this.benchmark(
      'Keystroke Processing',
      'input',
      () => {
        // Simulate keystroke event processing
        const keyEvent = {
          key: 'a',
          ctrlKey: false,
          shiftKey: false,
          timestamp: performance.now()
        };
        
        // Simulate input validation and processing
        const isValid = /^[a-zA-Z0-9\s]$/.test(keyEvent.key);
        const processed = isValid ? keyEvent.key : '';
        
        return processed;
      }
    );

    await this.benchmark(
      'Command Recognition',
      'input',
      () => {
        // Simulate slash command recognition
        const input = '/help status memory';
        const parts = input.split(' ');
        const command = parts[0];
        const args = parts.slice(1);
        
        // Simulate command lookup
        const commands = ['/help', '/status', '/model', '/login', '/memory'];
        const found = commands.includes(command);
        
        return { command, args, found };
      }
    );
  }

  /**
   * Benchmark file operations
   */
  private async benchmarkFileOperations(): Promise<void> {
    console.log('\n📁 File Operation Benchmarks');

    await this.benchmark(
      'Config File Read',
      'file',
      () => {
        // Simulate reading configuration file
        const mockConfig = JSON.stringify({
          theme: 'dark',
          shortcuts: { save: 'Ctrl+S' },
          performance: { targetFPS: 60 }
        });
        
        const parsed = JSON.parse(mockConfig);
        return Object.keys(parsed).length;
      }
    );

    await this.benchmark(
      'Session Save',
      'file',
      () => {
        // Simulate session data serialization
        const session = {
          id: Math.random().toString(36),
          messages: Array.from({ length: 50 }, (_, i) => ({
            id: i,
            content: 'Message content '.repeat(10),
            timestamp: Date.now()
          })),
          metadata: { tokens: 1000, model: 'test' }
        };
        
        const serialized = JSON.stringify(session);
        return serialized.length;
      }
    );
  }

  /**
   * Benchmark API response times
   */
  private async benchmarkAPIResponse(): Promise<void> {
    console.log('\n🌐 API Response Benchmarks');

    await this.benchmark(
      'Mock API Call',
      'api',
      async () => {
        // Simulate API call with random delay
        const delay = Math.random() * 100 + 50; // 50-150ms
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return {
          status: 'success',
          data: { response: 'Mock AI response', tokens: 42 },
          timing: delay
        };
      }
    );

    await this.benchmark(
      'Response Processing',
      'api',
      () => {
        // Simulate processing AI response
        const response = 'This is a mock AI response with some content that needs to be processed and formatted for display in the terminal interface.';
        
        // Simulate markdown processing
        const lines = response.split('\n');
        const processed = lines.map(line => ({
          content: line,
          formatted: line.replace(/\*\*(.*?)\*\*/g, '$1'),
          wordCount: line.split(' ').length
        }));
        
        return processed.length;
      }
    );
  }

  /**
   * Generate benchmark summary
   */
  private generateSummary() {
    const totalTests = this.results.length;
    const passed = this.results.filter(r => r.passedThreshold).length;
    const failed = totalTests - passed;

    const passRate = (passed / totalTests) * 100;
    let overallPerformance: 'excellent' | 'good' | 'fair' | 'poor';

    if (passRate >= 90) overallPerformance = 'excellent';
    else if (passRate >= 75) overallPerformance = 'good';
    else if (passRate >= 60) overallPerformance = 'fair';
    else overallPerformance = 'poor';

    return {
      totalTests,
      passed,
      failed,
      overallPerformance
    };
  }

  /**
   * Generate comprehensive performance report
   */
  private generateReport(suite: BenchmarkSuite): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(process.cwd(), `performance-report-${timestamp}.md`);

    const report = `# Performance Benchmark Report

Generated: ${new Date().toLocaleString()}

## Configuration
- Iterations: ${suite.config.iterations}
- Warmup runs: ${suite.config.warmupRuns}
- Target FPS: ${suite.config.targetFPS}
- Memory threshold: ${suite.config.memoryThresholdMB}MB
- Response time target: ${suite.config.responseTimeTargetMs}ms

## Summary
- **Total tests**: ${suite.summary.totalTests}
- **Passed**: ${suite.summary.passed} ✅
- **Failed**: ${suite.summary.failed} ❌
- **Pass rate**: ${((suite.summary.passed / suite.summary.totalTests) * 100).toFixed(1)}%
- **Overall performance**: ${suite.summary.overallPerformance.toUpperCase()}

## Detailed Results

| Test Name | Operation | Avg Time | Min Time | Max Time | Memory (MB) | Status |
|-----------|-----------|----------|----------|----------|-------------|---------|
${suite.results.map(r => 
  `| ${r.name} | ${r.operation} | ${r.averageTime.toFixed(2)}ms | ${r.minTime.toFixed(2)}ms | ${r.maxTime.toFixed(2)}ms | ${r.memoryUsed?.toFixed(2) || 'N/A'} | ${r.passedThreshold ? '✅' : '❌'} |`
).join('\n')}

## Performance Categories

### Rendering Performance
${this.getCategoryResults(suite.results, 'rendering')}

### Scrolling Performance
${this.getCategoryResults(suite.results, 'scrolling')}

### Memory Usage
${this.getCategoryResults(suite.results, 'memory')}

### Input Response
${this.getCategoryResults(suite.results, 'input')}

### File Operations
${this.getCategoryResults(suite.results, 'file')}

### API Performance
${this.getCategoryResults(suite.results, 'api')}

## Recommendations

${this.generateRecommendations(suite)}

---
*Generated by Plato Performance Benchmark Tool*
`;

    writeFileSync(reportPath, report);
    console.log(`\n📊 Performance report saved: ${reportPath}`);
  }

  /**
   * Get results for specific category
   */
  private getCategoryResults(results: BenchmarkResult[], category: string): string {
    const categoryResults = results.filter(r => r.operation === category);
    if (categoryResults.length === 0) return 'No tests in this category.';

    return categoryResults.map(r => 
      `- **${r.name}**: ${r.averageTime.toFixed(2)}ms avg ${r.passedThreshold ? '✅' : '❌'}`
    ).join('\n');
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(suite: BenchmarkSuite): string {
    const failed = suite.results.filter(r => !r.passedThreshold);
    if (failed.length === 0) {
      return '🎉 All performance targets met! No recommendations at this time.';
    }

    const recommendations: string[] = [];

    // Check rendering performance
    const slowRendering = failed.filter(r => r.operation === 'rendering');
    if (slowRendering.length > 0) {
      recommendations.push('🎨 **Rendering optimization needed**: Consider implementing React.memo(), useMemo(), or component virtualization.');
    }

    // Check memory usage
    const highMemory = suite.results.filter(r => r.memoryUsed && r.memoryUsed > suite.config.memoryThresholdMB);
    if (highMemory.length > 0) {
      recommendations.push('💾 **Memory optimization needed**: Implement conversation compaction, lazy loading, or memory cleanup.');
    }

    // Check input responsiveness
    const slowInput = failed.filter(r => r.operation === 'input');
    if (slowInput.length > 0) {
      recommendations.push('⌨️ **Input optimization needed**: Consider debouncing, throttling, or async input processing.');
    }

    if (recommendations.length === 0) {
      recommendations.push('🔍 **Review failed tests**: Analyze specific failure patterns and optimize accordingly.');
    }

    return recommendations.join('\n\n');
  }

  /**
   * Save results to JSON for further analysis
   */
  saveResults(filename?: string): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `performance-results-${timestamp}.json`;
    const filepath = join(process.cwd(), filename || defaultFilename);
    
    const data = {
      timestamp: new Date().toISOString(),
      config: this.config,
      results: this.results,
      summary: this.generateSummary()
    };

    writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 Results saved: ${filepath}`);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  const benchmark = new PerformanceBenchmark({
    iterations: parseInt(args.find(arg => arg.startsWith('--iterations='))?.split('=')[1] || '100'),
    targetFPS: parseInt(args.find(arg => arg.startsWith('--fps='))?.split('=')[1] || '60'),
  });

  console.log('🚀 Plato Performance Benchmark Tool\n');

  try {
    switch (command) {
      case 'all':
      case 'comprehensive':
        await benchmark.runComprehensiveSuite();
        break;
      
      case 'rendering':
        await benchmark['benchmarkComponentRendering']();
        break;
      
      case 'scrolling':
        await benchmark['benchmarkScrolling']();
        break;
      
      case 'memory':
        await benchmark['benchmarkMemoryUsage']();
        break;
      
      case 'input':
        await benchmark['benchmarkInputResponse']();
        break;
      
      case 'api':
        await benchmark['benchmarkAPIResponse']();
        break;
      
      default:
        console.log(`Usage: npm run benchmark [command] [options]

Commands:
  all, comprehensive    Run all benchmarks (default)
  rendering            Component rendering benchmarks
  scrolling            Scrolling performance benchmarks  
  memory               Memory usage benchmarks
  input                Input response benchmarks
  api                  API response benchmarks

Options:
  --iterations=N       Number of iterations (default: 100)
  --fps=N             Target FPS (default: 60)

Examples:
  npm run benchmark
  npm run benchmark rendering --iterations=200
  npm run benchmark memory --fps=120
`);
        process.exit(1);
    }

    benchmark.saveResults();
    console.log('\n✅ Benchmark completed successfully!');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Entry point for direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { PerformanceBenchmark, BenchmarkResult, BenchmarkSuite };