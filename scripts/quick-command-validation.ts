#!/usr/bin/env tsx
/**
 * Quick Command Validation Script
 * Tests all implemented commands for basic functionality
 */

import { SLASH_COMMANDS } from '../src/slash/commands.js';
import { processSlashCommand } from '../src/commands/router.js';

interface ValidationResult {
  command: string;
  implemented: boolean;
  success: boolean;
  executionTime: number;
  error?: string;
}

async function validateCommands(): Promise<ValidationResult[]> {
  console.log('🚀 Starting quick command validation...\n');

  // Create mock session
  const mockSession = {
    conversationMessages: [],
    addMessage: () => {},
    clearMessages: () => {},
    getMessages: () => [],
    exportMessages: () => {},
    compactMessages: () => {},
    costAnalytics: {
      totalCost: 0.15,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      sessionCosts: []
    }
  } as any;

  const results: ValidationResult[] = [];

  for (const command of SLASH_COMMANDS) {
    process.stdout.write(`Testing /${command.name}... `);

    const startTime = Date.now();
    let implemented = false;
    let success = false;
    let error: string | undefined;

    try {
      const result = await processSlashCommand(command.name, [], mockSession);
      const executionTime = Date.now() - startTime;

      implemented = result.handled;

      if (result.handled && !result.error) {
        success = true;
        console.log(`✅ ${executionTime}ms`);
      } else if (result.handled) {
        success = false;
        error = result.error;
        console.log(`⚠️  ${executionTime}ms (${result.error})`);
      } else {
        console.log(`❌ Not implemented`);
      }

      results.push({
        command: command.name,
        implemented,
        success,
        executionTime,
        error
      });

    } catch (err) {
      const executionTime = Date.now() - startTime;
      error = err instanceof Error ? err.message : String(err);
      console.log(`❌ ${executionTime}ms (${error})`);

      results.push({
        command: command.name,
        implemented: false,
        success: false,
        executionTime,
        error
      });
    }
  }

  return results;
}

async function generateReport(results: ValidationResult[]): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMMAND VALIDATION REPORT');
  console.log('='.repeat(60));

  const totalCommands = results.length;
  const implementedCommands = results.filter(r => r.implemented).length;
  const successfulCommands = results.filter(r => r.success).length;
  const failedCommands = results.filter(r => r.implemented && !r.success).length;

  console.log('\n📈 Summary:');
  console.log(`  Total Commands: ${totalCommands}`);
  console.log(`  Implemented: ${implementedCommands} (${(implementedCommands/totalCommands*100).toFixed(1)}%)`);
  console.log(`  Successful: ${successfulCommands} (${(successfulCommands/totalCommands*100).toFixed(1)}%)`);
  console.log(`  Failed: ${failedCommands} (${(failedCommands/totalCommands*100).toFixed(1)}%)`);
  console.log(`  Not Implemented: ${totalCommands - implementedCommands}`);

  const avgTime = results.filter(r => r.success).reduce((sum, r) => sum + r.executionTime, 0) / successfulCommands;
  console.log(`  Average Execution Time: ${avgTime.toFixed(2)}ms`);

  // Category breakdown
  console.log('\n📋 By Category:');
  const categories: Record<string, { total: number; implemented: number; successful: number }> = {};

  for (const command of SLASH_COMMANDS) {
    const category = command.category || 'Unknown';
    if (!categories[category]) {
      categories[category] = { total: 0, implemented: 0, successful: 0 };
    }
    categories[category].total++;

    const result = results.find(r => r.command === command.name);
    if (result?.implemented) {
      categories[category].implemented++;
      if (result.success) {
        categories[category].successful++;
      }
    }
  }

  for (const [category, stats] of Object.entries(categories)) {
    const implRate = (stats.implemented / stats.total * 100).toFixed(1);
    const successRate = stats.implemented > 0 ? (stats.successful / stats.implemented * 100).toFixed(1) : '0.0';
    console.log(`  ${category}: ${stats.implemented}/${stats.total} impl (${implRate}%), ${stats.successful} success (${successRate}%)`);
  }

  // Failed commands
  const failed = results.filter(r => r.implemented && !r.success);
  if (failed.length > 0) {
    console.log('\n❌ Failed Commands:');
    failed.forEach(r => {
      console.log(`  /${r.command}: ${r.error}`);
    });
  }

  // Missing commands
  const missing = results.filter(r => !r.implemented);
  if (missing.length > 0) {
    console.log('\n🚫 Missing Commands:');
    missing.forEach(r => {
      console.log(`  /${r.command}`);
    });
  }

  // Performance insights
  const slowCommands = results.filter(r => r.success && r.executionTime > 200);
  if (slowCommands.length > 0) {
    console.log('\n🐌 Slow Commands (>200ms):');
    slowCommands.forEach(r => {
      console.log(`  /${r.command}: ${r.executionTime}ms`);
    });
  }

  console.log('\n' + '='.repeat(60));

  // Production readiness assessment
  const readinessScore = Math.round(
    (implementedCommands / totalCommands) * 0.6 * 100 +
    (successfulCommands / totalCommands) * 0.4 * 100
  );

  console.log('🎯 Production Readiness Assessment:');
  console.log(`  Score: ${readinessScore}/100`);

  if (readinessScore >= 80) {
    console.log('  Status: ✅ PRODUCTION READY');
  } else if (readinessScore >= 60) {
    console.log('  Status: ⚠️  NEEDS IMPROVEMENT');
  } else {
    console.log('  Status: ❌ NOT PRODUCTION READY');
  }

  console.log('\n💡 Recommendations:');
  if (implementedCommands / totalCommands < 0.8) {
    console.log('  - Implement remaining commands to reach 80% coverage');
  }
  if (failedCommands > 0) {
    console.log('  - Fix failed command implementations');
  }
  if (slowCommands.length > 3) {
    console.log('  - Optimize slow commands for better performance');
  }
  if (readinessScore >= 80) {
    console.log('  - Commands are production ready! Consider comprehensive testing.');
  }

  console.log('='.repeat(60));
}

async function main() {
  try {
    const results = await validateCommands();
    await generateReport(results);

    // Exit code based on results
    const implementedRate = results.filter(r => r.implemented).length / results.length;
    if (implementedRate >= 0.8) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);