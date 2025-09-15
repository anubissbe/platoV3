/**
 * Tests for test reliability helpers
 * Testing the utilities that improve test stability
 */

import {
  withRetry,
  waitForCondition,
  sleep,
  MockTimer,
  ResourceTracker,
  withTimeout,
  TestIdGenerator,
  MockFileSystem,
  setupReliableTestEnvironment,
} from "./helpers/test-reliability";

describe("Test Reliability Helpers", () => {
  describe("withRetry", () => {
    it("should succeed on first attempt if operation succeeds", async () => {
      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        return "success";
      };

      const result = await withRetry(operation, { maxRetries: 3, delayMs: 10 });
      expect(result).toBe("success");
      expect(attemptCount).toBe(1);
    });

    it("should retry on failure and eventually succeed", async () => {
      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Temporary failure");
        }
        return "success";
      };

      const result = await withRetry(operation, { maxRetries: 3, delayMs: 10 });
      expect(result).toBe("success");
      expect(attemptCount).toBe(3);
    });

    it("should throw last error after max retries exceeded", async () => {
      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        throw new Error(`Failure ${attemptCount}`);
      };

      await expect(
        withRetry(operation, { maxRetries: 2, delayMs: 10 }),
      ).rejects.toThrow("Failure 3");
      expect(attemptCount).toBe(3); // initial + 2 retries
    });

    it("should apply backoff multiplier correctly", async () => {
      let attemptCount = 0;
      const timestamps: number[] = [];
      const operation = async () => {
        attemptCount++;
        timestamps.push(Date.now());
        if (attemptCount < 3) {
          throw new Error("Failure");
        }
        return "success";
      };

      await withRetry(operation, {
        maxRetries: 3,
        delayMs: 50,
        backoffMultiplier: 2,
      });

      // Should have 3 timestamps
      expect(timestamps).toHaveLength(3);

      // Check that delays roughly double (allowing for jitter)
      if (timestamps.length >= 3) {
        const delay1 = timestamps[1] - timestamps[0];
        const delay2 = timestamps[2] - timestamps[1];
        expect(delay2).toBeGreaterThan(delay1 * 1.5); // Account for jitter
      }
    });
  });

  describe("waitForCondition", () => {
    it("should resolve immediately if condition is already true", async () => {
      const condition = () => true;
      const startTime = Date.now();

      await waitForCondition(condition, { timeoutMs: 1000, intervalMs: 10 });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(50); // Should be very quick
    });

    it("should wait for condition to become true", async () => {
      let value = false;
      const condition = () => value;

      // Set value to true after 100ms
      setTimeout(() => {
        value = true;
      }, 100);

      const startTime = Date.now();
      await waitForCondition(condition, { timeoutMs: 1000, intervalMs: 10 });
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThan(90);
      expect(elapsed).toBeLessThan(200);
    });

    it("should timeout if condition never becomes true", async () => {
      const condition = () => false;

      await expect(
        waitForCondition(condition, { timeoutMs: 100, intervalMs: 10 }),
      ).rejects.toThrow("Condition not met within 100ms");
    });

    it("should handle async conditions", async () => {
      let value = false;
      const condition = async () => {
        await sleep(5); // Small async delay
        return value;
      };

      setTimeout(() => {
        value = true;
      }, 50);

      await expect(
        waitForCondition(condition, { timeoutMs: 200, intervalMs: 10 }),
      ).resolves.toBeUndefined();
    });
  });

  describe("MockTimer", () => {
    let mockTimer: MockTimer;

    beforeEach(() => {
      mockTimer = new MockTimer(1000);
    });

    afterEach(() => {
      mockTimer.clearAll();
    });

    it("should track mock time correctly", () => {
      expect(mockTimer.now()).toBe(1000);
      mockTimer.advance(500);
      expect(mockTimer.now()).toBe(1500);
    });

    it("should handle setTimeout and clearTimeout", (done) => {
      let callbackCalled = false;
      const id = mockTimer.setTimeout(() => {
        callbackCalled = true;
        expect(callbackCalled).toBe(true);
        done();
      }, 100);

      expect(typeof id).toBe("number");

      // Cancel and reschedule to test clearTimeout
      mockTimer.clearTimeout(id);
      setTimeout(done, 50); // Should complete without callback
    });

    it("should clear all timers", (done) => {
      let callback1Called = false;
      let callback2Called = false;

      mockTimer.setTimeout(() => {
        callback1Called = true;
      }, 100);
      mockTimer.setTimeout(() => {
        callback2Called = true;
      }, 200);

      mockTimer.clearAll();

      setTimeout(() => {
        expect(callback1Called).toBe(false);
        expect(callback2Called).toBe(false);
        done();
      }, 300);
    });
  });

  describe("ResourceTracker", () => {
    let resourceTracker: ResourceTracker;

    beforeEach(() => {
      resourceTracker = new ResourceTracker();
    });

    afterEach(async () => {
      await resourceTracker.cleanup();
    });

    it("should track and cleanup resources", async () => {
      let cleaned = false;
      resourceTracker.track(() => {
        cleaned = true;
      });

      await resourceTracker.cleanup();
      expect(cleaned).toBe(true);
    });

    it("should track timers and clear them on cleanup", async () => {
      let timerCalled = false;
      const timer = setTimeout(() => {
        timerCalled = true;
      }, 100);
      resourceTracker.trackTimer(timer);

      await resourceTracker.cleanup();

      // Wait to ensure timer would have fired
      await sleep(150);
      expect(timerCalled).toBe(false);
    });

    it("should handle cleanup errors gracefully", async () => {
      resourceTracker.track(() => {
        throw new Error("Cleanup error");
      });

      // Should not throw
      await expect(resourceTracker.cleanup()).resolves.toBeUndefined();
    });
  });

  describe("withTimeout", () => {
    it("should resolve if operation completes within timeout", async () => {
      const operation = sleep(50).then(() => "completed");
      const result = await withTimeout(operation, 100);
      expect(result).toBe("completed");
    });

    it("should reject if operation exceeds timeout", async () => {
      const operation = sleep(150).then(() => "completed");
      await expect(
        withTimeout(operation, 100, "Custom timeout message"),
      ).rejects.toThrow("Custom timeout message");
    });
  });

  describe("TestIdGenerator", () => {
    let generator: TestIdGenerator;

    beforeEach(() => {
      generator = new TestIdGenerator("test");
    });

    it("should generate sequential IDs", () => {
      expect(generator.next()).toBe("test-1");
      expect(generator.next()).toBe("test-2");
      expect(generator.next()).toBe("test-3");
    });

    it("should reset counter", () => {
      generator.next();
      generator.next();
      generator.reset();
      expect(generator.next()).toBe("test-1");
    });

    it("should use custom prefix", () => {
      const customGen = new TestIdGenerator("custom");
      expect(customGen.next()).toBe("custom-1");
    });
  });

  describe("MockFileSystem", () => {
    let mockFs: MockFileSystem;

    beforeEach(() => {
      mockFs = new MockFileSystem();
    });

    afterEach(() => {
      mockFs.clear();
    });

    it("should set and get files", () => {
      mockFs.setFile("/test.txt", "hello world");
      const file = mockFs.getFile("/test.txt");

      expect(file).toBeDefined();
      expect(file!.content.toString()).toBe("hello world");
      expect(file!.stats.size).toBe(11);
      expect(file!.stats.isFile).toBe(true);
    });

    it("should check file existence", () => {
      expect(mockFs.exists("/nonexistent.txt")).toBe(false);
      mockFs.setFile("/exists.txt", "content");
      expect(mockFs.exists("/exists.txt")).toBe(true);
    });

    it("should list all paths", () => {
      mockFs.setFile("/file1.txt", "content1");
      mockFs.setFile("/file2.txt", "content2");

      const paths = mockFs.getAllPaths();
      expect(paths).toContain("/file1.txt");
      expect(paths).toContain("/file2.txt");
      expect(paths).toHaveLength(2);
    });
  });

  describe("setupReliableTestEnvironment", () => {
    it("should provide all utilities and cleanup function", async () => {
      const env = setupReliableTestEnvironment();

      expect(env.resourceTracker).toBeInstanceOf(ResourceTracker);
      expect(env.mockTimer).toBeInstanceOf(MockTimer);
      expect(env.idGenerator).toBeInstanceOf(TestIdGenerator);
      expect(env.mockFs).toBeInstanceOf(MockFileSystem);
      expect(typeof env.cleanup).toBe("function");

      // Test that utilities work
      env.mockFs.setFile("/test.txt", "test");
      expect(env.mockFs.exists("/test.txt")).toBe(true);

      const id = env.idGenerator.next();
      expect(id).toBe("test-1");

      // Cleanup should work
      await expect(env.cleanup()).resolves.toBeUndefined();
    });
  });
});
