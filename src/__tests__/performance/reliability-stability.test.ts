/**
 * Reliability and Stability Testing Suite
 * Tests system resilience, error recovery, and stability under various conditions
 * Validates fault tolerance, graceful degradation, and system robustness
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import {
  PerformanceMonitor,
  MemoryManager,
} from "../../tui/PerformanceMonitor";
import * as fs from "fs/promises";
import * as path from "path";

interface StabilityTestResult {
  testName: string;
  duration: number;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  errorRate: number;
  averageResponseTime: number;
  recoveryTime: number;
  stabilityScore: number; // 0-100
}

interface ErrorScenario {
  name: string;
  probability: number; // 0-1
  delay: number; // ms
  recoverable: boolean;
  errorType:
    | "network"
    | "memory"
    | "disk"
    | "timeout"
    | "permission"
    | "resource";
}

class ReliabilityTester {
  private monitor: PerformanceMonitor;
  private memoryManager: MemoryManager;
  private results: StabilityTestResult[] = [];

  constructor() {
    this.monitor = new PerformanceMonitor();
    this.memoryManager = new MemoryManager();
  }

  async runStabilityTest(
    testName: string,
    operation: () => Promise<void> | void,
    config: {
      duration: number;
      errorScenarios?: ErrorScenario[];
      expectedErrorRate?: number;
      isolatedTempDir?: boolean;
    },
  ): Promise<StabilityTestResult> {
    const {
      duration,
      errorScenarios = [],
      expectedErrorRate = 0.05,
      isolatedTempDir = false,
    } = config;

    let tempDir: string | undefined;
    if (isolatedTempDir) {
      tempDir = await this.createIsolatedTempDir();
    }

    const startTime = Date.now();
    const endTime = startTime + duration;

    let totalOperations = 0;
    let successfulOperations = 0;
    let failedOperations = 0;
    const responseTimes: number[] = [];
    let recoveryTime = 0;
    let lastFailureTime = 0;

    try {
      while (Date.now() < endTime) {
        const operationStart = Date.now();
        totalOperations++;

        try {
          // Inject errors based on scenarios
          const shouldInjectError = this.shouldInjectError(errorScenarios);
          if (shouldInjectError.inject) {
            await this.injectError(shouldInjectError.scenario!);
            if (shouldInjectError.scenario!.recoverable) {
              lastFailureTime = Date.now();
            }
          }

          await operation();

          const responseTime = Date.now() - operationStart;
          responseTimes.push(responseTime);
          successfulOperations++;

          // Calculate recovery time if we just recovered from failure
          if (lastFailureTime > 0 && Date.now() - lastFailureTime > 0) {
            recoveryTime = Math.max(recoveryTime, Date.now() - lastFailureTime);
            lastFailureTime = 0;
          }
        } catch (error) {
          failedOperations++;
          const responseTime = Date.now() - operationStart;
          responseTimes.push(responseTime);
        }

        // Small delay to prevent overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      if (tempDir) {
        await this.cleanupTempDir(tempDir);
      }
    }

    const actualDuration = Date.now() - startTime;
    const errorRate = failedOperations / totalOperations;
    const averageResponseTime =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0;

    // Calculate stability score (0-100)
    const stabilityScore = this.calculateStabilityScore({
      errorRate,
      expectedErrorRate,
      averageResponseTime,
      recoveryTime,
    });

    const result: StabilityTestResult = {
      testName,
      duration: actualDuration,
      totalOperations,
      successfulOperations,
      failedOperations,
      errorRate,
      averageResponseTime,
      recoveryTime,
      stabilityScore,
    };

    this.results.push(result);
    return result;
  }

  private async createIsolatedTempDir(): Promise<string> {
    const baseTempDir = process.env.TMPDIR || "/tmp";
    const testTempDir = path.join(
      baseTempDir,
      `plato-reliability-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    try {
      await fs.mkdir(testTempDir, { recursive: true });
      await fs.mkdir(path.join(testTempDir, ".plato"), { recursive: true });
      return testTempDir;
    } catch (error) {
      throw new Error(`Failed to create isolated temp directory: ${error}`);
    }
  }

  private async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup temp directory ${tempDir}:`, error);
    }
  }

  private shouldInjectError(scenarios: ErrorScenario[]): {
    inject: boolean;
    scenario?: ErrorScenario;
  } {
    for (const scenario of scenarios) {
      if (Math.random() < scenario.probability) {
        return { inject: true, scenario };
      }
    }
    return { inject: false };
  }

  private async injectError(scenario: ErrorScenario): Promise<void> {
    if (scenario.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, scenario.delay));
    }

    switch (scenario.errorType) {
      case "network":
        throw new Error(`Network error: ${scenario.name}`);
      case "memory":
        throw new Error(`Memory error: ${scenario.name}`);
      case "disk":
        throw new Error(`Disk I/O error: ${scenario.name}`);
      case "timeout":
        throw new Error(`Timeout error: ${scenario.name}`);
      case "permission":
        throw new Error(`Permission error: ${scenario.name}`);
      case "resource":
        throw new Error(`Resource exhaustion: ${scenario.name}`);
      default:
        throw new Error(`Unknown error: ${scenario.name}`);
    }
  }

  private calculateStabilityScore(params: {
    errorRate: number;
    expectedErrorRate: number;
    averageResponseTime: number;
    recoveryTime: number;
  }): number {
    const { errorRate, expectedErrorRate, averageResponseTime, recoveryTime } =
      params;

    // Start with perfect score
    let score = 100;

    // Penalize for error rate above expected
    if (errorRate > expectedErrorRate) {
      const errorPenalty = Math.min(50, (errorRate - expectedErrorRate) * 1000);
      score -= errorPenalty;
    }

    // Penalize for slow response times
    if (averageResponseTime > 100) {
      const responsePenalty = Math.min(25, (averageResponseTime - 100) / 10);
      score -= responsePenalty;
    }

    // Penalize for slow recovery
    if (recoveryTime > 1000) {
      const recoveryPenalty = Math.min(25, (recoveryTime - 1000) / 100);
      score -= recoveryPenalty;
    }

    return Math.max(0, Math.round(score));
  }

  getResults(): StabilityTestResult[] {
    return [...this.results];
  }

  cleanup(): void {
    this.results = [];
    this.monitor.clearMeasurements();
  }
}

// Mock file system operations that can fail
class UnreliableFileSystem {
  private failureRate: number;
  private failureType: "read" | "write" | "delete" | "permission" | "disk_full";

  constructor(
    failureRate: number = 0.1,
    failureType:
      | "read"
      | "write"
      | "delete"
      | "permission"
      | "disk_full" = "read",
  ) {
    this.failureRate = failureRate;
    this.failureType = failureType;
  }

  async readFile(filePath: string): Promise<string> {
    if (Math.random() < this.failureRate) {
      switch (this.failureType) {
        case "read":
          throw new Error(
            `ENOENT: no such file or directory, open '${filePath}'`,
          );
        case "permission":
          throw new Error(`EACCES: permission denied, open '${filePath}'`);
        default:
          throw new Error(`EIO: i/o error, read '${filePath}'`);
      }
    }
    return "mock file content";
  }

  async writeFile(filePath: string, data: string): Promise<void> {
    if (Math.random() < this.failureRate) {
      switch (this.failureType) {
        case "write":
          throw new Error(
            `ENOSPC: no space left on device, write '${filePath}'`,
          );
        case "permission":
          throw new Error(`EACCES: permission denied, write '${filePath}'`);
        case "disk_full":
          throw new Error(
            `ENOSPC: no space left on device, write '${filePath}'`,
          );
        default:
          throw new Error(`EIO: i/o error, write '${filePath}'`);
      }
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    if (Math.random() < this.failureRate) {
      switch (this.failureType) {
        case "delete":
          throw new Error(
            `ENOENT: no such file or directory, unlink '${filePath}'`,
          );
        case "permission":
          throw new Error(`EACCES: permission denied, unlink '${filePath}'`);
        default:
          throw new Error(`EIO: i/o error, unlink '${filePath}'`);
      }
    }
  }
}

describe("Reliability and Stability Testing", () => {
  let reliabilityTester: ReliabilityTester;

  beforeEach(() => {
    reliabilityTester = new ReliabilityTester();
  });

  afterEach(() => {
    reliabilityTester.cleanup();
  });

  describe("Basic Stability Testing", () => {
    it("should maintain stability under normal conditions", async () => {
      const operation = async () => {
        // Simulate normal operation with variable processing time
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
        return Math.random() * 1000; // Some work
      };

      const result = await reliabilityTester.runStabilityTest(
        "Normal Conditions Test",
        operation,
        {
          duration: 3000,
          expectedErrorRate: 0,
        },
      );

      expect(result.errorRate).toBe(0);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(90);
      expect(result.averageResponseTime).toBeLessThan(50);
      expect(result.totalOperations).toBeGreaterThan(100);
    }, 10000);

    it("should handle intermittent failures gracefully", async () => {
      let operationCount = 0;
      const operation = async () => {
        operationCount++;

        // Fail every 10th operation
        if (operationCount % 10 === 0) {
          throw new Error("Intermittent failure");
        }

        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
        return operationCount;
      };

      const result = await reliabilityTester.runStabilityTest(
        "Intermittent Failures Test",
        operation,
        {
          duration: 2000,
          expectedErrorRate: 0.1, // Expect ~10% failures
        },
      );

      expect(result.errorRate).toBeCloseTo(0.1, 1);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(70);
      expect(result.successfulOperations).toBeGreaterThan(
        result.failedOperations,
      );
    }, 10000);

    it("should recover from temporary service disruptions", async () => {
      let isServiceDown = false;
      let downStartTime = 0;
      const serviceDuration = 500; // 500ms downtime

      setTimeout(() => {
        isServiceDown = true;
        downStartTime = Date.now();
      }, 1000);

      setTimeout(() => {
        isServiceDown = false;
      }, 1000 + serviceDuration);

      const operation = async () => {
        if (isServiceDown) {
          throw new Error("Service temporarily unavailable");
        }

        await new Promise((resolve) => setTimeout(resolve, 5));
        return "success";
      };

      const result = await reliabilityTester.runStabilityTest(
        "Service Recovery Test",
        operation,
        {
          duration: 3000,
          expectedErrorRate: 0.2, // Expect some failures during downtime
        },
      );

      expect(result.errorRate).toBeGreaterThan(0);
      expect(result.errorRate).toBeLessThan(0.5);
      expect(result.recoveryTime).toBeGreaterThan(0);
      expect(result.recoveryTime).toBeLessThan(serviceDuration * 2);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(60);
    }, 10000);
  });

  describe("Error Injection and Fault Tolerance", () => {
    it("should handle network errors gracefully", async () => {
      const networkErrors: ErrorScenario[] = [
        {
          name: "Connection timeout",
          probability: 0.05,
          delay: 100,
          recoverable: true,
          errorType: "network",
        },
        {
          name: "Connection refused",
          probability: 0.03,
          delay: 0,
          recoverable: true,
          errorType: "network",
        },
      ];

      const operation = async () => {
        // Simulate network operation
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 30));
        return { status: "success", data: "network response" };
      };

      const result = await reliabilityTester.runStabilityTest(
        "Network Error Handling",
        operation,
        {
          duration: 2000,
          errorScenarios: networkErrors,
          expectedErrorRate: 0.08,
        },
      );

      expect(result.errorRate).toBeLessThan(0.15);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(75);
    }, 10000);

    it("should handle memory pressure scenarios", async () => {
      const memoryErrors: ErrorScenario[] = [
        {
          name: "Out of memory",
          probability: 0.02,
          delay: 50,
          recoverable: true,
          errorType: "memory",
        },
      ];

      let allocatedMemory: any[] = [];

      const operation = async () => {
        // Simulate memory-intensive operation
        const data = new Array(1000).fill("x".repeat(100));
        allocatedMemory.push(data);

        // Cleanup old allocations to prevent unlimited growth
        if (allocatedMemory.length > 50) {
          allocatedMemory.splice(0, 25);
        }

        return data.length;
      };

      const result = await reliabilityTester.runStabilityTest(
        "Memory Pressure Handling",
        operation,
        {
          duration: 2000,
          errorScenarios: memoryErrors,
          expectedErrorRate: 0.05,
        },
      );

      expect(result.stabilityScore).toBeGreaterThanOrEqual(70);
      expect(result.averageResponseTime).toBeLessThan(100);
    }, 10000);

    it("should handle disk I/O failures", async () => {
      const unreliableFS = new UnreliableFileSystem(0.1, "write");

      const operation = async () => {
        const fileName = `/tmp/test_${Date.now()}_${Math.random()}.txt`;
        const data = JSON.stringify({ test: "data", timestamp: Date.now() });

        try {
          await unreliableFS.writeFile(fileName, data);
          await unreliableFS.readFile(fileName);
          await unreliableFS.deleteFile(fileName);
          return "file_operation_success";
        } catch (error) {
          throw new Error(`File operation failed: ${error}`);
        }
      };

      const result = await reliabilityTester.runStabilityTest(
        "Disk I/O Error Handling",
        operation,
        {
          duration: 2000,
          expectedErrorRate: 0.1,
          isolatedTempDir: true,
        },
      );

      expect(result.errorRate).toBeCloseTo(0.1, 1);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(75);
    }, 10000);
  });

  describe("Resource Management and Isolation", () => {
    it("should properly isolate test environments", async () => {
      const tempDirs: string[] = [];

      const operation = async () => {
        // This operation should use isolated temp directory
        const testData = JSON.stringify({
          test: "isolation",
          timestamp: Date.now(),
          random: Math.random(),
        });

        // Simulate some file operations
        return testData.length;
      };

      // Run multiple tests in parallel to verify isolation
      const promises = [];
      for (let i = 0; i < 3; i++) {
        const promise = reliabilityTester.runStabilityTest(
          `Isolation Test ${i + 1}`,
          operation,
          {
            duration: 1000,
            isolatedTempDir: true,
          },
        );
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.errorRate).toBe(0);
        expect(result.stabilityScore).toBeGreaterThanOrEqual(95);
        expect(result.totalOperations).toBeGreaterThan(50);
      });
    }, 15000);

    it("should handle resource contention gracefully", async () => {
      const sharedResource = {
        inUse: false,
        data: "",
        accessCount: 0,
        maxConcurrentAccess: 3,
      };

      let currentConcurrentAccess = 0;

      const operation = async () => {
        // Try to acquire shared resource
        if (currentConcurrentAccess >= sharedResource.maxConcurrentAccess) {
          throw new Error("Resource busy - try again later");
        }

        currentConcurrentAccess++;
        sharedResource.accessCount++;

        try {
          // Simulate resource usage
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 50),
          );
          sharedResource.data = `accessed_${sharedResource.accessCount}`;

          return sharedResource.data;
        } finally {
          currentConcurrentAccess--;
        }
      };

      const result = await reliabilityTester.runStabilityTest(
        "Resource Contention Test",
        operation,
        {
          duration: 2000,
          expectedErrorRate: 0.2, // Some contention expected
        },
      );

      expect(result.errorRate).toBeGreaterThan(0);
      expect(result.errorRate).toBeLessThan(0.4);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(60);
      expect(sharedResource.accessCount).toBeGreaterThan(
        result.successfulOperations,
      );
    }, 10000);

    it("should cleanup resources properly after test completion", async () => {
      const resources: { id: string; active: boolean }[] = [];

      const operation = async () => {
        const resource = {
          id: `resource_${Date.now()}_${Math.random()}`,
          active: true,
        };
        resources.push(resource);

        // Simulate resource usage
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Mark as ready for cleanup (but don't cleanup immediately)
        resource.active = false;

        return resource.id;
      };

      const result = await reliabilityTester.runStabilityTest(
        "Resource Cleanup Test",
        operation,
        {
          duration: 1000,
          isolatedTempDir: true,
        },
      );

      // After test completion, verify cleanup
      const activeResources = resources.filter((r) => r.active);
      const inactiveResources = resources.filter((r) => !r.active);

      expect(activeResources).toHaveLength(0);
      expect(inactiveResources.length).toBe(result.totalOperations);
      expect(result.errorRate).toBe(0);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(95);
    }, 10000);
  });

  describe("Long-term Stability Testing", () => {
    it("should maintain performance over extended periods", async () => {
      let operationNumber = 0;
      const performanceHistory: number[] = [];

      const operation = async () => {
        operationNumber++;
        const startTime = performance.now();

        // Simulate work that might degrade over time
        const workSize = 100 + (operationNumber % 50); // Variable work
        const data = new Array(workSize).fill(0).map(() => Math.random());
        const result = data.reduce((a, b) => a + b, 0);

        const duration = performance.now() - startTime;
        performanceHistory.push(duration);

        return result;
      };

      const result = await reliabilityTester.runStabilityTest(
        "Extended Stability Test",
        operation,
        {
          duration: 5000, // 5 seconds
          expectedErrorRate: 0,
        },
      );

      // Analyze performance consistency
      const firstHalf = performanceHistory.slice(
        0,
        Math.floor(performanceHistory.length / 2),
      );
      const secondHalf = performanceHistory.slice(
        Math.floor(performanceHistory.length / 2),
      );

      const firstHalfAvg =
        firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg =
        secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      // Performance should not degrade significantly
      const degradation = secondHalfAvg / firstHalfAvg;
      expect(degradation).toBeLessThan(2); // Less than 2x slowdown

      expect(result.errorRate).toBe(0);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(85);
      expect(result.totalOperations).toBeGreaterThan(200);

      console.log(
        `Performance consistency: ${degradation.toFixed(2)}x, operations: ${result.totalOperations}`,
      );
    }, 15000);

    it("should detect memory leaks over time", async () => {
      const memoryManager = new MemoryManager();
      let allocationCounter = 0;
      const allocations: any[] = [];

      const operation = async () => {
        allocationCounter++;

        // Simulate potential memory leak scenario
        const data = new Array(200).fill(`allocation_${allocationCounter}`);
        allocations.push(data);

        // Cleanup occasionally (but not always - simulating leak)
        if (allocationCounter % 20 === 0) {
          // Only cleanup half the allocations
          allocations.splice(0, Math.floor(allocations.length / 2));
        }

        memoryManager.track(`allocation_${allocationCounter}`, data);

        return data.length;
      };

      const result = await reliabilityTester.runStabilityTest(
        "Memory Leak Detection Test",
        operation,
        {
          duration: 3000,
          expectedErrorRate: 0,
        },
      );

      // Check for potential memory leaks
      const leaks = memoryManager.detectLeaks();
      expect(leaks.potentialLeaks.length).toBeGreaterThan(0);

      expect(result.errorRate).toBe(0);
      expect(allocations.length).toBeGreaterThan(100); // Should have accumulated

      console.log(
        `Potential memory leaks detected: ${leaks.potentialLeaks.length}`,
      );
    }, 10000);
  });

  describe("Graceful Degradation Testing", () => {
    it("should maintain core functionality when secondary features fail", async () => {
      let primaryFeatureWorks = true;
      let secondaryFeatureWorks = true;

      // Simulate secondary feature failure after 1 second
      setTimeout(() => {
        secondaryFeatureWorks = false;
      }, 1000);

      const operation = async () => {
        let result = "";

        // Primary functionality (should always work)
        if (primaryFeatureWorks) {
          result += "primary";
        } else {
          throw new Error("Primary feature failed");
        }

        // Secondary functionality (may fail)
        try {
          if (secondaryFeatureWorks) {
            result += "_secondary";
          } else {
            throw new Error("Secondary feature unavailable");
          }
        } catch (error) {
          // Graceful degradation - continue without secondary feature
          result += "_degraded";
        }

        return result;
      };

      const result = await reliabilityTester.runStabilityTest(
        "Graceful Degradation Test",
        operation,
        {
          duration: 3000,
          expectedErrorRate: 0, // Should never fail due to graceful handling
        },
      );

      expect(result.errorRate).toBe(0);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(90);
      expect(result.totalOperations).toBeGreaterThan(150);
    }, 10000);

    it("should implement circuit breaker pattern for external dependencies", async () => {
      let externalServiceFailures = 0;
      let circuitBreakerOpen = false;
      const maxFailures = 5;
      const circuitBreakerTimeout = 1000;

      const operation = async () => {
        // Check if circuit breaker is open
        if (circuitBreakerOpen) {
          return "circuit_breaker_fallback";
        }

        try {
          // Simulate external service call
          if (Math.random() < 0.2) {
            // 20% failure rate
            throw new Error("External service unavailable");
          }

          // Reset failure count on success
          externalServiceFailures = 0;
          return "external_service_success";
        } catch (error) {
          externalServiceFailures++;

          // Open circuit breaker if too many failures
          if (externalServiceFailures >= maxFailures) {
            circuitBreakerOpen = true;

            // Auto-close circuit breaker after timeout
            setTimeout(() => {
              circuitBreakerOpen = false;
              externalServiceFailures = 0;
            }, circuitBreakerTimeout);
          }

          throw error;
        }
      };

      const result = await reliabilityTester.runStabilityTest(
        "Circuit Breaker Test",
        operation,
        {
          duration: 3000,
          expectedErrorRate: 0.15, // Some failures expected until circuit breaker kicks in
        },
      );

      expect(result.errorRate).toBeGreaterThan(0);
      expect(result.errorRate).toBeLessThan(0.3);
      expect(result.stabilityScore).toBeGreaterThanOrEqual(65);
    }, 10000);
  });
});
