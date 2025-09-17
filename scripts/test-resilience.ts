#!/usr/bin/env npx tsx
/**
 * Resilience Patterns Demo
 * 
 * Demonstrates circuit breaker, resource management, and validation patterns
 * for high-risk commands in Plato.
 */

import { CircuitBreaker, circuitBreakerManager } from '../src/utils/circuit-breaker.js';
import { globalResourceManager } from '../src/utils/resource-manager.js';
import { resilientCommandExecutor } from '../src/utils/command-resilience.js';
import { CommandValidator, PathValidator, URLValidator } from '../src/utils/validation.js';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function demoCircuitBreaker() {
  log('\n🔧 Circuit Breaker Demo', colors.bright);
  log('='.repeat(50), colors.blue);
  
  const breaker = circuitBreakerManager.getOrCreate('demo-service', {
    failureThreshold: 3,
    resetTimeout: 5000,
    timeout: 2000,
    minimumCalls: 2,
    expectedFailureRate: 0.5,
    enableDebug: true
  }, {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
    backoffMultiplier: 2,
    jitter: true
  });

  // Simulate normal operations
  log('\n1. Normal operations:', colors.green);
  for (let i = 0; i < 3; i++) {
    try {
      const result = await breaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return `Success ${i + 1}`;
      });
      log(`  ✅ ${result}`, colors.green);
    } catch (error) {
      log(`  ❌ ${error instanceof Error ? error.message : String(error)}`, colors.red);
    }
  }

  // Simulate failures to open circuit
  log('\n2. Simulating failures:', colors.yellow);
  for (let i = 0; i < 4; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error(`Simulated failure ${i + 1}`);
      });
    } catch (error) {
      log(`  ❌ ${error instanceof Error ? error.message : String(error)}`, colors.red);
    }
  }

  // Show circuit state
  const stats = breaker.getStats();
  log(`\n📊 Circuit State: ${stats.state}`, colors.magenta);
  log(`   Failure Count: ${stats.failureCount}`, colors.magenta);
  log(`   Success Count: ${stats.successCount}`, colors.magenta);
  log(`   Failure Rate: ${(stats.failureRate * 100).toFixed(1)}%`, colors.magenta);

  // Test fallback
  log('\n3. Testing fallback:', colors.cyan);
  try {
    const result = await breaker.execute(
      async () => {
        throw new Error('Should not execute');
      },
      async () => {
        return 'Fallback response';
      }
    );
    log(`  🔄 ${result}`, colors.cyan);
  } catch (error) {
    log(`  ❌ ${error instanceof Error ? error.message : String(error)}`, colors.red);
  }
}

async function demoResourceManagement() {
  log('\n🗂️  Resource Management Demo', colors.bright);
  log('=' .repeat(50), colors.blue);

  // Acquire resources
  log('\n1. Acquiring resources:', colors.green);
  
  const resources: string[] = [];
  
  for (let i = 0; i < 3; i++) {
    const resourceId = `demo-resource-${i + 1}`;
    try {
      await globalResourceManager.acquire(
        resourceId,
        'demo',
        async () => ({ id: resourceId, data: `Resource data ${i + 1}` }),
        async (resource) => {
          log(`    🗑️  Cleaned up ${resource.id}`, colors.yellow);
        },
        { priority: 5, timeout: 5000 }
      );
      resources.push(resourceId);
      log(`  ✅ Acquired ${resourceId}`, colors.green);
    } catch (error) {
      log(`  ❌ Failed to acquire ${resourceId}: ${error}`, colors.red);
    }
  }

  // Show resource statistics
  const stats = globalResourceManager.getStats();
  log('\n📊 Resource Statistics:', colors.magenta);
  log(`   Total Resources: ${stats.totalResources}`, colors.magenta);
  log(`   Active Resources: ${stats.activeResources}`, colors.magenta);
  log(`   Resources by Type:`, colors.magenta);
  for (const [type, count] of Object.entries(stats.resourcesByType)) {
    log(`     ${type}: ${count}`, colors.magenta);
  }
  
  if (stats.oldestResource) {
    log(`   Oldest Resource: ${stats.oldestResource.id} (${Math.floor(stats.oldestResource.age / 1000)}s old)`, colors.magenta);
  }

  // Test resource leasing and cleanup
  log('\n2. Testing resource operations:', colors.cyan);
  
  try {
    const result = await globalResourceManager.withResource(
      'temp-resource',
      'temporary',
      async () => ({ tempData: 'This will be cleaned up' }),
      async (resource) => {
        log(`    🔧 Using resource: ${JSON.stringify(resource)}`, colors.cyan);
        return `Processed: ${resource.tempData}`;
      },
      async (resource) => {
        log(`    🗑️  Auto-cleaned temp resource`, colors.yellow);
      }
    );
    log(`  ✅ Operation result: ${result}`, colors.green);
  } catch (error) {
    log(`  ❌ Operation failed: ${error}`, colors.red);
  }

  // Release acquired resources
  log('\n3. Releasing resources:', colors.yellow);
  for (const resourceId of resources) {
    const released = await globalResourceManager.release(resourceId);
    if (released) {
      log(`  ✅ Released ${resourceId}`, colors.green);
    } else {
      log(`  ⚠️  Failed to release ${resourceId}`, colors.yellow);
    }
  }
}

async function demoValidation() {
  log('\n✅ Input Validation Demo', colors.bright);
  log('=' .repeat(50), colors.blue);

  // Command argument validation
  log('\n1. Command Argument Validation:', colors.green);
  
  const testCases = [
    { args: ['valid', 'args', 'here'], name: 'Valid arguments' },
    { args: [], name: 'Empty arguments' },
    { args: ['arg', 'with spaces'], name: 'Arguments with spaces' },
    { args: ['arg;with;semicolons'], name: 'Dangerous characters' },
    { args: ['../../../etc/passwd'], name: 'Directory traversal' },
  ];

  for (const testCase of testCases) {
    const result = CommandValidator.validateArgs(testCase.args, {
      maxArgs: 5,
      minArgs: 1,
      maxInputLength: 100,
      allowEmpty: false
    });
    
    const status = result.isValid ? '✅' : '❌';
    const color = result.isValid ? colors.green : colors.red;
    log(`  ${status} ${testCase.name}: ${result.isValid ? 'Valid' : result.errors.join(', ')}`, color);
    
    if (result.warnings.length > 0) {
      log(`     ⚠️  Warnings: ${result.warnings.join(', ')}`, colors.yellow);
    }
  }

  // Path validation
  log('\n2. Path Validation:', colors.green);
  
  const pathTestCases = [
    { path: './valid/path.txt', name: 'Valid relative path' },
    { path: '/absolute/path.txt', name: 'Absolute path' },
    { path: '../../../etc/passwd', name: 'Directory traversal' },
    { path: 'script.exe', name: 'Executable file' },
    { path: 'normal-file.json', name: 'Normal file' },
  ];

  for (const testCase of pathTestCases) {
    try {
      const result = await PathValidator.validatePath(testCase.path, {
        allowRelative: true,
        allowOutsideCwd: false,
        maxLength: 255,
        blockedExtensions: ['exe', 'bat', 'cmd'],
        mustExist: false
      });
      
      const status = result.isValid ? '✅' : '❌';
      const color = result.isValid ? colors.green : colors.red;
      log(`  ${status} ${testCase.name}: ${result.isValid ? 'Valid' : result.errors.join(', ')}`, color);
      
      if (result.warnings.length > 0) {
        log(`     ⚠️  Warnings: ${result.warnings.join(', ')}`, colors.yellow);
      }
    } catch (error) {
      log(`  ❌ ${testCase.name}: ${error}`, colors.red);
    }
  }

  // URL validation
  log('\n3. URL Validation:', colors.green);
  
  const urlTestCases = [
    { url: 'http://localhost:8080', name: 'Local HTTP' },
    { url: 'https://api.github.com', name: 'HTTPS API' },
    { url: 'ws://localhost:9999', name: 'WebSocket' },
    { url: 'ftp://example.com', name: 'Unsupported protocol' },
    { url: 'http://192.168.1.100', name: 'Private network' },
    { url: 'invalid-url', name: 'Invalid URL format' },
  ];

  for (const testCase of urlTestCases) {
    const result = URLValidator.validateURL(testCase.url);
    
    const status = result.isValid ? '✅' : '❌';
    const color = result.isValid ? colors.green : colors.red;
    log(`  ${status} ${testCase.name}: ${result.isValid ? 'Valid' : result.errors.join(', ')}`, color);
    
    if (result.warnings.length > 0) {
      log(`     ⚠️  Warnings: ${result.warnings.join(', ')}`, colors.yellow);
    }
  }
}

async function demoResilientExecution() {
  log('\n🛡️  Resilient Command Execution Demo', colors.bright);
  log('=' .repeat(50), colors.blue);

  // Successful execution
  log('\n1. Successful Execution:', colors.green);
  
  try {
    const result = await resilientCommandExecutor.executeCommand(
      async (args, context) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return `Successfully processed: ${args.join(' ')}`;
      },
      ['demo', 'command', 'args'],
      {
        commandName: 'demo-success',
        validation: {
          minArgs: 1,
          maxArgs: 5,
          maxInputLength: 100
        },
        resources: {
          cleanup: true,
          timeout: 5000,
          priority: 5
        },
        debug: true
      }
    );
    
    log(`  ✅ Result: ${result.output}`, colors.green);
    log(`  📊 Execution Time: ${result.executionTime}ms`, colors.magenta);
    log(`  🔄 Retried: ${result.retried}`, colors.cyan);
    log(`  🔧 Circuit State: ${result.circuitState}`, colors.cyan);
  } catch (error) {
    log(`  ❌ Error: ${error}`, colors.red);
  }

  // Execution with retries
  log('\n2. Execution with Retries:', colors.yellow);
  
  let attemptCount = 0;
  try {
    const result = await resilientCommandExecutor.executeCommand(
      async (args, context) => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return `Success on attempt ${attemptCount}`;
      },
      ['retry', 'demo'],
      {
        commandName: 'demo-retry',
        retry: {
          maxRetries: 3,
          baseDelay: 500,
          maxDelay: 2000,
          backoffMultiplier: 1.5,
          jitter: false
        },
        debug: true
      }
    );
    
    log(`  ✅ Result: ${result.output}`, colors.green);
    log(`  🔄 Retry Count: ${result.retryCount}`, colors.yellow);
    log(`  📊 Execution Time: ${result.executionTime}ms`, colors.magenta);
  } catch (error) {
    log(`  ❌ Error: ${error}`, colors.red);
  }

  // Validation failure
  log('\n3. Validation Failure:', colors.red);
  
  try {
    const result = await resilientCommandExecutor.executeCommand(
      async (args, context) => {
        return 'Should not execute';
      },
      [], // Empty args (validation should fail)
      {
        commandName: 'demo-validation-fail',
        validation: {
          minArgs: 1, // Require at least 1 arg
          maxArgs: 5
        }
      }
    );
    
    log(`  ❌ Unexpected success: ${result.output}`, colors.red);
  } catch (error) {
    // Expected validation failure is handled in the result
    log(`  ✅ Validation correctly prevented execution`, colors.green);
  }
}

async function showStatistics() {
  log('\n📊 Final Statistics', colors.bright);
  log('=' .repeat(50), colors.blue);

  // Circuit breaker statistics
  const cbStats = resilientCommandExecutor.getCircuitBreakerStats();
  log('\nCircuit Breaker Statistics:', colors.magenta);
  for (const [name, stats] of Object.entries(cbStats)) {
    log(`  ${name}:`, colors.cyan);
    log(`    State: ${stats.state}`, colors.cyan);
    log(`    Failures: ${stats.failureCount}`, colors.cyan);
    log(`    Success Rate: ${((stats.successCount / (stats.successCount + stats.failureCount)) * 100 || 0).toFixed(1)}%`, colors.cyan);
  }

  // Resource statistics
  const resourceStats = resilientCommandExecutor.getResourceStats();
  log('\nResource Statistics:', colors.magenta);
  log(`  Total Resources: ${resourceStats.totalResources}`, colors.cyan);
  log(`  Active Resources: ${resourceStats.activeResources}`, colors.cyan);
  log(`  Average Age: ${Math.floor(resourceStats.averageAge / 1000)}s`, colors.cyan);
}

async function cleanup() {
  log('\n🧹 Cleanup', colors.bright);
  log('=' .repeat(50), colors.blue);
  
  try {
    await resilientCommandExecutor.cleanup();
    await globalResourceManager.shutdown();
    log('  ✅ Cleanup completed successfully', colors.green);
  } catch (error) {
    log(`  ❌ Cleanup error: ${error}`, colors.red);
  }
}

async function main() {
  log('🚀 Plato Resilience Patterns Demo', colors.bright);
  log('This demo showcases circuit breaker, resource management,\nand validation patterns for high-risk commands.\n', colors.cyan);

  try {
    await demoCircuitBreaker();
    await demoResourceManagement();
    await demoValidation();
    await demoResilientExecution();
    await showStatistics();
  } catch (error) {
    log(`\n❌ Demo error: ${error}`, colors.red);
    console.error(error);
  } finally {
    await cleanup();
  }

  log('\n✨ Demo completed!', colors.bright);
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as runDemo };
