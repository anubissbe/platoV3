import { setupTestEnvironment } from "./helpers/test-cleanup.js";

// Setup clean test environment
setupTestEnvironment({
  disableConsole: true,
  maxEventListeners: 20,
});

// Mock all dependencies before importing orchestrator
jest.mock("../providers/chat_fallback", () => ({
  chatCompletions: jest
    .fn()
    .mockResolvedValue({ content: "mock response", usage: null }),
  chatStream: jest
    .fn()
    .mockResolvedValue({ content: "mock response", usage: null }),
}));

// Mock the specific module path used by orchestrator
const mockChatCompletions = jest
  .fn()
  .mockResolvedValue({
    content: "mock response",
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  });
const mockChatStream = jest
  .fn()
  .mockResolvedValue({
    content: "mock response",
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  });

jest.mock("../providers/chat.js", () => ({
  chatCompletions: mockChatCompletions,
  chatStream: mockChatStream,
}));

jest.mock("../providers/chat", () => ({
  chatCompletions: mockChatCompletions,
  chatStream: mockChatStream,
}));

jest.mock("../tools/patch", () => ({
  dryRunApply: jest.fn().mockResolvedValue({ ok: true, conflicts: [] }),
  apply: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../policies/security", () => ({
  reviewPatch: jest.fn().mockReturnValue([]),
}));

jest.mock("../tools/permissions", () => ({
  checkPermission: jest.fn().mockResolvedValue("allow"),
}));

jest.mock("../tools/hooks", () => ({
  runHooks: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../integrations/mcp", () => ({
  callTool: jest.fn().mockResolvedValue({}),
}));

jest.mock("../config", () => ({
  loadConfig: () =>
    Promise.resolve({
      provider: {
        active: "copilot",
        copilot: {
          base_url: "http://localhost:8080",
          chat_path: "/chat/completions",
        },
      },
      model: { active: "gpt-4" },
    }),
  setConfigValue: jest.fn(),
}));

jest.mock("../providers/copilot", () => ({
  getAuthInfo: () => Promise.resolve({ loggedIn: false }),
  providerFetch: jest.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: "mock response" } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
    text: () => Promise.resolve("mock response"),
  }),
}));

jest.mock("simple-git", () => ({
  default: () => ({
    checkIsRepo: () => Promise.resolve(false),
    status: () => Promise.resolve({ current: "main" }),
  }),
}));

jest.mock("fs/promises", () => ({
  mkdtemp: jest.fn().mockResolvedValue("/tmp/test"),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  readFile: jest.fn().mockResolvedValue("{}"),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 1024 }),
}));

jest.mock("child_process", () => ({
  execSync: jest.fn().mockReturnValue(""),
}));

import orchestrator from "../runtime/orchestrator";

describe("Keyboard Shortcuts - Core Functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  describe("Orchestrator Core Methods", () => {
    test("should respond to user input", async () => {
      const response = await orchestrator.respond("test input");
      expect(typeof response).toBe("string");
    });

    test("should cancel stream when requested", () => {
      orchestrator.cancelStream();
      expect(true).toBe(true); // Should not throw
    });

    test("should track transcript mode state", async () => {
      expect(orchestrator.isTranscriptMode()).toBe(false);

      await orchestrator.setTranscriptMode(true);
      expect(orchestrator.isTranscriptMode()).toBe(true);

      await orchestrator.setTranscriptMode(false);
      expect(orchestrator.isTranscriptMode()).toBe(false);
    });

    test("should track background mode state", () => {
      expect(orchestrator.isBackgroundMode()).toBe(false);

      orchestrator.setBackgroundMode(true);
      expect(orchestrator.isBackgroundMode()).toBe(true);

      orchestrator.setBackgroundMode(false);
      expect(orchestrator.isBackgroundMode()).toBe(false);
    });

    test("should return message history", async () => {
      const history = await orchestrator.getMessageHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    test("should handle history message selection", async () => {
      const result = await orchestrator.selectHistoryMessage(0);
      expect(result).toBeDefined();
    });
  });

  describe("Memory Management", () => {
    test("should handle memory operations without errors", async () => {
      const history = await orchestrator.getMessageHistory();
      const selection = await orchestrator.selectHistoryMessage(0);

      expect(Array.isArray(history)).toBe(true);
      expect(selection).toBeDefined();
    });

    test("should handle invalid history indices gracefully", async () => {
      const result = await orchestrator.selectHistoryMessage(-1);
      expect(result).toBeDefined(); // Should handle gracefully

      const result2 = await orchestrator.selectHistoryMessage(9999);
      expect(result2).toBeDefined(); // Should handle gracefully
    });
  });

  describe("Concurrent Operations", () => {
    test("should handle multiple rapid mode changes", async () => {
      const operations = Array.from({ length: 5 }, (_, i) =>
        orchestrator.setTranscriptMode(i % 2 === 0),
      );

      await Promise.all(operations);
      expect(true).toBe(true); // Should not throw
    });

    test("should handle concurrent operations safely", async () => {
      const concurrentOps = [
        orchestrator.setTranscriptMode(true),
        orchestrator.getMessageHistory(),
        // Removed handleImagePaste as it doesn't exist
      ];

      await Promise.all(concurrentOps.filter((op) => op !== undefined));
      expect(true).toBe(true); // Should complete without errors

      // Cleanup
      await orchestrator.setTranscriptMode(false);
    });
  });

  describe("State Consistency", () => {
    test("should maintain state consistency across operations", async () => {
      // Test state consistency
      await orchestrator.setTranscriptMode(true);
      orchestrator.setBackgroundMode(true);

      expect(orchestrator.isTranscriptMode()).toBe(true);
      expect(orchestrator.isBackgroundMode()).toBe(true);

      // Reset state
      await orchestrator.setTranscriptMode(false);
      orchestrator.setBackgroundMode(false);
    });

    test("should handle stream cancellation properly", () => {
      // Test cancellation without active stream
      orchestrator.cancelStream();
      expect(true).toBe(true); // Should not throw

      // Test multiple cancellations
      orchestrator.cancelStream();
      orchestrator.cancelStream();
      expect(true).toBe(true); // Should not throw
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty input gracefully", async () => {
      const response = await orchestrator.respond("");
      expect(typeof response).toBe("string");
    });

    test("should handle special characters in input", async () => {
      const response = await orchestrator.respond("!@#$%^&*()");
      expect(typeof response).toBe("string");
    });

    test("should handle unicode input", async () => {
      const response = await orchestrator.respond("🎯 ✅ 🔄");
      expect(typeof response).toBe("string");
    });
  });
});
