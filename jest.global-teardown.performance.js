/**
 * Jest Global Teardown for Performance Testing
 * Cleans up after performance and reliability testing
 */

const fs = require("fs");
const path = require("path");

module.exports = async () => {
  console.log("\n🧹 Performance testing environment teardown...\n");

  // Stop memory monitoring if it was enabled
  if (global.__memoryMonitoringInterval) {
    clearInterval(global.__memoryMonitoringInterval);
    console.log("📈 Memory monitoring stopped");
  }

  // Clean up temporary test directories
  const tempDir = process.env.PLATO_TEST_TEMP_DIR;
  if (tempDir && fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`📁 Cleaned up temp directory: ${tempDir}`);
    } catch (error) {
      console.warn(`⚠️  Failed to cleanup temp directory: ${error.message}`);
    }
  }

  // Clean up any remaining test artifacts
  const testDirs = ["tmp/plato-performance-test", "tmp/plato-reliability-test"];

  for (const dir of testDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`📁 Cleaned up: ${dir}`);
      } catch (error) {
        console.warn(`⚠️  Failed to cleanup ${dir}: ${error.message}`);
      }
    }
  }

  // Generate final performance summary
  const reportsDir = path.join(process.cwd(), "performance-reports");
  if (fs.existsSync(reportsDir)) {
    const reportFiles = fs
      .readdirSync(reportsDir)
      .filter(
        (file) =>
          file.startsWith("performance-report-") && file.endsWith(".json"),
      )
      .sort()
      .reverse();

    if (reportFiles.length > 0) {
      const latestReport = path.join(reportsDir, reportFiles[0]);
      console.log(`📊 Latest performance report: ${reportFiles[0]}`);

      try {
        const reportData = JSON.parse(fs.readFileSync(latestReport, "utf8"));

        console.log("\n📋 Final Performance Summary:");
        console.log(`   Tests Run: ${reportData.summary.totalTests}`);
        console.log(
          `   Success Rate: ${((reportData.summary.passedTests / reportData.summary.totalTests) * 100).toFixed(1)}%`,
        );
        console.log(
          `   Total Duration: ${(reportData.summary.totalDuration / 1000).toFixed(2)}s`,
        );

        if (reportData.summary.performanceMetrics.memoryStats) {
          const memStats = reportData.summary.performanceMetrics.memoryStats;
          console.log(
            `   Memory Growth: ${(memStats.growth / 1024 / 1024).toFixed(1)}MB`,
          );
        }

        if (reportData.summary.slowTests.length > 0) {
          console.log(`   Slow Tests: ${reportData.summary.slowTests.length}`);
        }
      } catch (error) {
        console.warn(
          `⚠️  Failed to parse performance report: ${error.message}`,
        );
      }
    }
  }

  // Force garbage collection for final cleanup
  if (typeof global.gc === "function") {
    try {
      global.gc();
      console.log("🗑️  Final garbage collection completed");
    } catch (error) {
      console.warn(
        `⚠️  Failed to run final garbage collection: ${error.message}`,
      );
    }
  }

  // Reset environment variables
  delete process.env.PLATO_PERFORMANCE_MODE;
  delete process.env.PLATO_RELIABILITY_TESTING;
  delete process.env.PLATO_MEMORY_LEAK_DETECTION;
  delete process.env.PLATO_TEST_TEMP_DIR;

  console.log("\n✅ Performance testing environment teardown complete!\n");
};
