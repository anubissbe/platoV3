/**
 * Jest Custom Resolver for Performance Tests
 * Optimizes module resolution for faster test execution
 */

const path = require("path");
const fs = require("fs");

// Cache resolved modules for performance
const resolveCache = new Map();

module.exports = (request, options) => {
  // Create cache key
  const cacheKey = `${request}:${options.basedir}`;

  // Check cache first
  if (resolveCache.has(cacheKey)) {
    return resolveCache.get(cacheKey);
  }

  try {
    // Use default resolver for most cases
    const resolved = options.defaultResolver(request, options);

    // Cache the result
    resolveCache.set(cacheKey, resolved);

    return resolved;
  } catch (error) {
    // Handle specific performance test cases
    const basedir = options.basedir || process.cwd();

    // Performance test specific module mappings
    const performanceTestMappings = {
      // Map ink to our optimized mock
      ink: path.join(__dirname, "src/__tests__/__mocks__/ink.ts"),

      // Map React to actual React (not mocked in performance tests)
      react: require.resolve("react"),

      // Map performance utilities
      "@/test-utils": path.join(__dirname, "src/__tests__/utils/test-utils.ts"),
      "@/performance": path.join(__dirname, "src/tui/performance/index.ts"),
    };

    // Check if we have a specific mapping
    if (performanceTestMappings[request]) {
      const resolved = performanceTestMappings[request];
      resolveCache.set(cacheKey, resolved);
      return resolved;
    }

    // Handle relative paths for performance tests
    if (request.startsWith("./") || request.startsWith("../")) {
      const resolved = path.resolve(basedir, request);

      // Check if file exists with .ts or .tsx extension
      const extensions = [".ts", ".tsx", ".js", ".jsx"];
      for (const ext of extensions) {
        const withExt = resolved + ext;
        if (fs.existsSync(withExt)) {
          resolveCache.set(cacheKey, withExt);
          return withExt;
        }
      }

      // Check if it's a directory with index file
      for (const ext of extensions) {
        const indexFile = path.join(resolved, "index" + ext);
        if (fs.existsSync(indexFile)) {
          resolveCache.set(cacheKey, indexFile);
          return indexFile;
        }
      }
    }

    // Handle @/ alias for src directory
    if (request.startsWith("@/")) {
      const srcPath = request.replace("@/", "src/");
      const resolved = path.resolve(basedir, srcPath);

      const extensions = [".ts", ".tsx", ".js", ".jsx"];
      for (const ext of extensions) {
        const withExt = resolved + ext;
        if (fs.existsSync(withExt)) {
          resolveCache.set(cacheKey, withExt);
          return withExt;
        }
      }
    }

    // Fallback to original error
    throw error;
  }
};

// Clear cache periodically to prevent memory leaks
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    if (resolveCache.size > 1000) {
      resolveCache.clear();
    }
  }, 30000); // Clear every 30 seconds if cache gets large
}
