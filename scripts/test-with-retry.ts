#!/usr/bin/env tsx
/**
 * Test Runner with Retry Logic
 * Implements intelligent retry for intermittent test failures
 */

import { execaCommand } from 'execa';
import { performance } from 'perf_hooks';

interface TestRunResult {
  success: boolean;
  output: string;
  errors: string[];
  duration: number;
  passedTests: number;
  failedTests: number;
  totalTests: number;
}

interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
  retryPatterns: RegExp[];
  skipPatterns: RegExp[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffMs: 1000,
  retryPatterns: [
    /timeout/i,
    /connection reset/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /socket hang up/i,
    /network error/i,
    /flaky/i,
    /intermittent/i,
  ],
  skipPatterns: [
    /syntax error/i,
    /type error/i,
    /reference error/i,
    /compilation failed/i,
    /cannot find module/i,
  ],
};

class TestRetryRunner {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  async runTestCommand(command: string): Promise<TestRunResult> {
    const startTime = performance.now();
    let lastResult: TestRunResult | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffTime = this.config.backoffMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.1 * backoffTime;
        const totalDelay = backoffTime + jitter;
        
        console.log(`⏳ Retrying in ${Math.round(totalDelay)}ms (attempt ${attempt + 1}/${this.config.maxRetries + 1})...`);
        await this.sleep(totalDelay);
      }

      try {
        console.log(`🧪 Running tests (attempt ${attempt + 1})...`);
        const result = await this.executeTests(command);
        
        if (result.success) {
          const totalDuration = performance.now() - startTime;
          console.log(`✅ Tests passed on attempt ${attempt + 1} (${Math.round(totalDuration)}ms total)`);
          return { ...result, duration: totalDuration };
        }

        lastResult = result;

        // Check if we should retry based on error patterns
        if (attempt < this.config.maxRetries) {
          const shouldRetry = this.shouldRetryErrors(result.errors);
          if (shouldRetry) {
            console.log(`🔄 Test failures may be transient, retrying...`);
            continue;
          } else {
            console.log(`❌ Test failures appear to be permanent, not retrying`);
            break;
          }
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastResult = {
          success: false,
          output: '',
          errors: [errorMessage],
          duration: performance.now() - startTime,
          passedTests: 0,
          failedTests: 0,
          totalTests: 0,
        };

        if (attempt < this.config.maxRetries && this.shouldRetryErrors([errorMessage])) {
          console.log(`🔄 Command error may be transient, retrying...`);
          continue;
        } else {
          break;
        }
      }
    }

    const totalDuration = performance.now() - startTime;
    console.log(`❌ All retry attempts failed (${Math.round(totalDuration)}ms total)`);
    return lastResult || {
      success: false,
      output: '',
      errors: ['Unknown error'],
      duration: totalDuration,
      passedTests: 0,
      failedTests: 0,
      totalTests: 0,
    };
  }

  private async executeTests(command: string): Promise<TestRunResult> {
    try {
      const result = await execaCommand(command, {
        timeout: 120000, // 2 minute timeout per attempt
        cwd: process.cwd(),
        stdio: 'pipe',
      });

      const output = result.stdout;
      const parsed = this.parseJestOutput(output);
      
      return {
        success: parsed.failedTests === 0,
        output,
        errors: parsed.errors,
        duration: 0, // Will be set by caller
        passedTests: parsed.passedTests,
        failedTests: parsed.failedTests,
        totalTests: parsed.totalTests,
      };

    } catch (error: any) {
      const output = error.stdout || '';
      const stderr = error.stderr || '';
      const parsed = this.parseJestOutput(output + '\n' + stderr);
      
      return {
        success: false,
        output: output + stderr,
        errors: [...parsed.errors, error.message],
        duration: 0,
        passedTests: parsed.passedTests,
        failedTests: parsed.failedTests,
        totalTests: parsed.totalTests,
      };
    }
  }

  private parseJestOutput(output: string): {
    passedTests: number;
    failedTests: number;
    totalTests: number;
    errors: string[];
  } {
    // Parse Jest test summary
    const testMatch = output.match(/Tests:\s+(?:(\d+) failed,\s*)?(?:(\d+) skipped,\s*)?(\d+) passed,\s*(\d+) total/);
    const failed = testMatch?.[1] ? parseInt(testMatch[1]) : 0;
    const passed = parseInt(testMatch?.[3] || '0');
    const total = parseInt(testMatch?.[4] || '0');

    // Extract error messages
    const errors: string[] = [];
    const errorLines = output.split('\n').filter(line => 
      line.includes('Error:') || 
      line.includes('Failed:') ||
      line.includes('timeout') ||
      line.includes('FAIL')
    );

    errors.push(...errorLines.slice(0, 10)); // Limit to first 10 errors

    return {
      passedTests: passed,
      failedTests: failed,
      totalTests: total,
      errors,
    };
  }

  private shouldRetryErrors(errors: string[]): boolean {
    const errorText = errors.join(' ').toLowerCase();

    // Don't retry if matches skip patterns (permanent errors)
    for (const pattern of this.config.skipPatterns) {
      if (pattern.test(errorText)) {
        return false;
      }
    }

    // Retry if matches retry patterns (transient errors)
    for (const pattern of this.config.retryPatterns) {
      if (pattern.test(errorText)) {
        return true;
      }
    }

    // Default: don't retry for unrecognized errors
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.join(' ') || 'npm run test:reliable';
  
  console.log('🚀 Test Runner with Retry Logic');
  console.log('================================');
  console.log(`Command: ${command}\n`);

  const runner = new TestRetryRunner({
    maxRetries: process.env.TEST_MAX_RETRIES ? parseInt(process.env.TEST_MAX_RETRIES) : 3,
    backoffMs: process.env.TEST_BACKOFF_MS ? parseInt(process.env.TEST_BACKOFF_MS) : 1000,
  });

  const result = await runner.runTestCommand(command);

  console.log('\n📊 Final Results');
  console.log('================');
  console.log(`Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Duration: ${Math.round(result.duration)}ms`);
  console.log(`Tests: ${result.passedTests}/${result.totalTests} passed`);

  if (!result.success && result.errors.length > 0) {
    console.log('\n🚨 Error Summary:');
    result.errors.slice(0, 5).forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
    
    if (result.errors.length > 5) {
      console.log(`... and ${result.errors.length - 5} more errors`);
    }
  }

  process.exit(result.success ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}