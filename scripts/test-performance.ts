#!/usr/bin/env tsx
/**
 * Test Performance Analyzer
 * Benchmarks different test configurations and provides optimization recommendations
 */

import { execaCommand } from "execa";
import { performance } from "perf_hooks";

interface TestResult {
  config: string;
  duration: number;
  passedTests: number;
  failedTests: number;
  totalTests: number;
  coverage?: number;
}

async function runTestConfig(
  config: string,
  description: string,
): Promise<TestResult> {
  console.log(`\n🧪 Running ${description}...`);
  const startTime = performance.now();

  try {
    const result = await execaCommand(`npm run ${config}`, {
      timeout: 120000, // 2 minute timeout
      cwd: process.cwd(),
      stdio: "pipe",
    });

    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    // Parse Jest output for test counts
    const output = result.stdout;
    const testMatch = output.match(
      /Tests:\s+(?:(\d+) failed,\s*)?(?:(\d+) skipped,\s*)?(\d+) passed,\s*(\d+) total/,
    );
    const failed = testMatch?.[1] ? parseInt(testMatch[1]) : 0;
    const skipped = testMatch?.[2] ? parseInt(testMatch[2]) : 0;
    const passed = parseInt(testMatch?.[3] || "0");
    const total = parseInt(testMatch?.[4] || "0");

    return {
      config,
      duration,
      passedTests: passed,
      failedTests: failed,
      totalTests: total,
    };
  } catch (error: any) {
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    // Parse error output for partial results
    const output = error.stdout || "";
    const testMatch = output.match(
      /Tests:\s+(?:(\d+) failed,\s*)?(?:(\d+) skipped,\s*)?(\d+) passed,\s*(\d+) total/,
    );
    const failed = testMatch?.[1] ? parseInt(testMatch[1]) : 0;
    const passed = parseInt(testMatch?.[3] || "0");
    const total = parseInt(testMatch?.[4] || "0");

    return {
      config,
      duration,
      passedTests: passed,
      failedTests: failed,
      totalTests: total,
    };
  }
}

async function main() {
  console.log("🚀 PlatoV3 Test Performance Analyzer");
  console.log("=====================================\n");

  const configs = [
    { cmd: "test:fast", desc: "Fast Configuration (optimized)" },
    { cmd: "test:quick", desc: "Quick Configuration (silent)" },
    { cmd: "test", desc: "Standard Configuration (baseline)" },
  ];

  const results: TestResult[] = [];

  for (const config of configs) {
    try {
      const result = await runTestConfig(config.cmd, config.desc);
      results.push(result);

      console.log(`✅ ${config.desc}: ${result.duration}ms`);
      console.log(
        `   Tests: ${result.passedTests}/${result.totalTests} passed, ${result.failedTests} failed`,
      );
    } catch (error) {
      console.error(`❌ ${config.desc} failed:`, error);
    }
  }

  // Performance Analysis
  console.log("\n📊 Performance Analysis");
  console.log("========================\n");

  if (results.length >= 2) {
    const baseline =
      results.find((r) => r.config === "test") || results[results.length - 1];
    const fastest = results.reduce((min, curr) =>
      curr.duration < min.duration ? curr : min,
    );

    console.log(`🏃‍♂️ Fastest: ${fastest.config} (${fastest.duration}ms)`);
    console.log(`📈 Baseline: ${baseline.config} (${baseline.duration}ms)`);

    if (fastest !== baseline) {
      const improvement = Math.round(
        ((baseline.duration - fastest.duration) / baseline.duration) * 100,
      );
      const speedup =
        Math.round((baseline.duration / fastest.duration) * 10) / 10;
      console.log(
        `🚀 Performance Improvement: ${improvement}% faster (${speedup}x speedup)`,
      );
    }

    console.log("\n💡 Recommendations:");
    if (fastest.config === "test:fast") {
      console.log("   ✓ Use `npm run test:fast` for development");
      console.log("   ✓ Use `npm run test:quick` for quick checks");
      console.log(
        "   ✓ Use `npm run test:integration-only` for integration tests",
      );
    }

    console.log("\n📈 Test Suite Health:");
    results.forEach((result) => {
      const passRate = Math.round(
        (result.passedTests / result.totalTests) * 100,
      );
      const icon = passRate >= 90 ? "🟢" : passRate >= 70 ? "🟡" : "🔴";
      console.log(
        `   ${icon} ${result.config}: ${passRate}% pass rate (${result.totalTests} tests)`,
      );
    });
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
