/**
 * Jest Global Setup for Performance Testing
 * Initializes environment for performance and reliability testing
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

module.exports = async () => {
  console.log("🚀 Setting up performance testing environment...\n");

  // Create necessary directories
  const dirs = [
    "performance-reports",
    "performance-baselines",
    "performance-logs",
    "tmp/plato-performance-test",
  ];

  for (const dir of dirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  }

  // Set up environment variables
  process.env.NODE_ENV = "test";
  process.env.PLATO_PERFORMANCE_MODE = "true";
  process.env.PLATO_RELIABILITY_TESTING = "true";
  process.env.PLATO_MEMORY_LEAK_DETECTION = "true";
  process.env.PLATO_TEST_TEMP_DIR = path.join(
    process.cwd(),
    "tmp/plato-performance-test",
  );

  // Enable garbage collection exposure for memory testing
  if (typeof global.gc === "undefined") {
    console.log(
      "⚠️  Garbage collection not exposed. Run with --expose-gc for memory leak detection.",
    );
  } else {
    console.log("🗑️  Garbage collection enabled for memory testing.");
  }

  // Log system information
  console.log("🖥️  System Information:");
  console.log(`   Node.js: ${process.version}`);
  console.log(`   Platform: ${os.platform()} (${os.arch()})`);
  console.log(`   CPUs: ${os.cpus().length}`);
  console.log(
    `   Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)}GB`,
  );
  console.log(
    `   Free Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)}GB`,
  );

  // Initialize performance baseline tracking
  const baselineFile = path.join(
    process.cwd(),
    "performance-baselines",
    "current-baseline.json",
  );
  if (!fs.existsSync(baselineFile)) {
    const initialBaseline = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        cpuCount: os.cpus().length,
        totalMemory: os.totalmem(),
      },
      baselines: {},
    };

    fs.writeFileSync(baselineFile, JSON.stringify(initialBaseline, null, 2));
    console.log("📊 Created performance baseline file");
  }

  // Set up memory monitoring
  let memoryMonitoringInterval;
  if (process.env.PLATO_MEMORY_MONITORING === "true") {
    memoryMonitoringInterval = setInterval(() => {
      const usage = process.memoryUsage();
      const logEntry = {
        timestamp: new Date().toISOString(),
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        rss: usage.rss,
      };

      const logFile = path.join(
        process.cwd(),
        "performance-logs",
        "memory-usage.jsonl",
      );
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + "\n");
    }, 5000); // Log every 5 seconds

    // Store interval ID for cleanup
    global.__memoryMonitoringInterval = memoryMonitoringInterval;
    console.log("📈 Memory monitoring enabled (5s intervals)");
  }

  // Clean up old performance artifacts (keep last 10)
  const cleanupDirs = ["performance-reports", "performance-baselines"];
  for (const dir of cleanupDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      const files = fs
        .readdirSync(dirPath)
        .filter((file) => file.endsWith(".json"))
        .map((file) => ({
          name: file,
          path: path.join(dirPath, file),
          mtime: fs.statSync(path.join(dirPath, file)).mtime,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // Keep only the 10 most recent files
      const filesToDelete = files.slice(10);
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
      }

      if (filesToDelete.length > 0) {
        console.log(
          `🧹 Cleaned up ${filesToDelete.length} old files from ${dir}`,
        );
      }
    }
  }

  console.log("\n✅ Performance testing environment setup complete!\n");
};
