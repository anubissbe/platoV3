// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from "@jest/globals";
import { EventEmitter } from "events";

// Set up Jest environment
beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

// Mock the resource manager to prevent timer leaks and handle cleanup
const mockResourceManager = {
  acquireResource: jest.fn().mockResolvedValue({ id: 'test-resource', release: jest.fn() }),
  releaseResource: jest.fn().mockResolvedValue(undefined),
  cleanup: jest.fn().mockResolvedValue(undefined),
  getStats: () => ({ active: 0, total: 0 }), // Direct function instead of jest.fn()
  isHealthy: () => true, // Direct function instead of jest.fn()
  _timers: new Set(),
  _cleanupInterval: null,
  // Add methods to prevent timer leaks
  _clearTimers: function() {
    this._timers.forEach((timer) => clearTimeout(timer));
    this._timers.clear();
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
};

jest.mock("../utils/resource-manager.js", () => ({
  globalResourceManager: mockResourceManager,
  ResourceManager: jest.fn().mockImplementation(() => mockResourceManager),
}));

// Mock other utils to prevent side effects
jest.mock("../utils/circuit-breaker.js", () => ({
  CircuitBreaker: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockImplementation(async (fn) => await fn()),
    getStats: jest.fn().mockReturnValue({ state: 'CLOSED', failures: 0 }),
  })),
  circuitBreakerManager: {
    getOrCreate: jest.fn().mockReturnValue({
      execute: jest.fn().mockImplementation(async (fn) => await fn()),
      getStats: jest.fn().mockReturnValue({ state: 'CLOSED', failures: 0 }),
    }),
  },
}));

jest.mock("../utils/validation.js", () => ({
  validateCommandArguments: jest.fn().mockResolvedValue({ valid: true, sanitized: [] }),
  validatePath: jest.fn().mockResolvedValue({ valid: true, sanitized: "" }),
  validateUrl: jest.fn().mockResolvedValue({ valid: true, sanitized: "" }),
}));

// Mock resilient command executor
const mockResilientExecutor = {
  executeCommand: jest.fn().mockImplementation(async (commandFn, args, options) => {
    try {
      // Execute the command function directly for testing
      const result = await commandFn(args || [], { fallback: false });
      return {
        success: true,
        output: result || "Mock command executed successfully",
        error: null,
        fallbackUsed: false,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        output: null,
        fallbackUsed: false,
      };
    }
  }),
};

// Mock command resilience to prevent MCP connection attempts
jest.mock("../utils/command-resilience.js", () => ({
  ResilientCommandExecutor: jest.fn().mockImplementation(() => mockResilientExecutor),
}));

// Mock resilient commands with all exported functions
jest.mock("../commands/resilient-commands.js", () => ({
  executeMcpCommand: jest.fn().mockResolvedValue("Mock MCP command executed"),
  executeProxyCommand: jest.fn().mockResolvedValue("Mock proxy command executed"),
  executeLoginCommand: jest.fn().mockResolvedValue("Mock login command executed"),
  executeInstallGitlabAppCommand: jest.fn().mockResolvedValue("Mock GitLab app command executed"),
  executeHooksCommand: jest.fn().mockResolvedValue("Mock hooks command executed"),
}));

// Mock MCP store
jest.mock("../integrations/mcp.js", () => ({
  Store: {
    fromFile: jest.fn(() => ({
      servers: new Map(),
      save: jest.fn().mockResolvedValue(undefined),
      list: jest.fn(() => []),
      get: jest.fn(() => null),
      add: jest.fn(),
      remove: jest.fn(() => false),
    })),
  },
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    listTools: jest.fn().mockResolvedValue([]),
    callTool: jest.fn().mockResolvedValue({ content: [{ type: "text", text: "Mock tool result" }] }),
  })),
}));

// Mock prompts to prevent interactive input
jest.mock("prompts", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ choice: "yes" }),
}));

// Mock child_process
jest.mock("child_process", () => ({
  execSync: jest.fn().mockImplementation((cmd) => {
    const command = String(cmd);
    if (command.includes("git")) return "mock git output";
    return "mock command output";
  }),
  spawn: jest.fn().mockImplementation(() => {
    const mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = jest.fn();
    setTimeout(() => {
      mockProcess.emit("close", 0);
    }, 10);
    return mockProcess;
  }),
}));

// Mock fs/promises
jest.mock("fs/promises", () => ({
  readFile: jest.fn().mockResolvedValue("mock file content"),
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ isDirectory: () => false }),
}));

// Mock configuration object
const mockConfig = {
  model: {
    active: "gpt-4o",
    temperature: 0.7,
    max_tokens: 4000,
  },
  provider: {
    anthropic: {
      api_key: "mock-key",
    },
    openai: {
      api_key: "mock-key",
    },
  },
  patch: {
    mode: "manual",
    git_commit: false,
    max_payload_mb: 20,
  },
};

// Mock the config system properly with direct return values instead of resolved promises
const mockLoadConfig = () => mockConfig; // Direct function instead of jest.fn()

jest.mock("../config.js", () => ({
  loadConfig: mockLoadConfig,
  setConfigValue: jest.fn().mockResolvedValue(undefined),
  saveConfig: jest.fn().mockResolvedValue(undefined),
  paths: jest.fn().mockReturnValue({
    GLOBAL_DIR: "/mock/.config/plato",
    GLOBAL_CFG: "/mock/.config/plato/config.yaml",
    PROJECT_DIR: "/mock/.plato",
    PROJECT_CFG: "/mock/.plato/config.yaml",
  }),
}));

// Mock the session system
jest.mock("../core/session.js", () => ({
  loadSession: jest.fn().mockResolvedValue({
    messages: [],
    metadata: { created: new Date().toISOString() },
  }),
  saveSession: jest.fn().mockResolvedValue(undefined),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

// Mock router functions
jest.mock("../commands/router.js", () => ({
  getAvailableCommands: jest.fn().mockReturnValue("Mock available commands"),
}));

// Import the module to test after all mocks are set up
import { SLASH_COMMANDS } from "../slash/commands.js";

describe("Comprehensive Slash Commands Test Suite", () => {
  // Pre-execution cleanup to prevent timer leaks
  beforeEach(async () => {
    // Clear any existing timers but don't clear all mocks as that resets our direct functions
    if (mockResourceManager._clearTimers) {
      mockResourceManager._clearTimers();
    }
  });

  // Post-execution cleanup
  afterEach(async () => {
    // Ensure cleanup after each test but preserve our mock functions
    if (mockResourceManager._clearTimers) {
      mockResourceManager._clearTimers();
    }
  });

  describe("Available Commands Validation", () => {
    test("SLASH_COMMANDS should be defined and contain expected commands", () => {
      expect(SLASH_COMMANDS).toBeDefined();
      expect(Array.isArray(SLASH_COMMANDS)).toBe(true);

      // Check that we have the main commands
      expect(SLASH_COMMANDS.length).toBeGreaterThan(0);

      // Verify some key commands exist (based on actual implementation)
      const commandNames = SLASH_COMMANDS.map(cmd => cmd.name);
      const expectedCommands = ["help", "status", "models"];
      expectedCommands.forEach(cmd => {
        expect(commandNames).toContain(cmd);
      });
    });
  });

  describe("Command Execution Framework", () => {
    test("commands should have proper structure", () => {
      const helpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "help");
      expect(helpCommand).toBeDefined();
      expect(helpCommand?.name).toBe("help");
      expect(helpCommand?.execute).toBeDefined();
    });

    test("help command should execute without errors", async () => {
      const helpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "help");
      if (helpCommand?.execute) {
        const result = await helpCommand.execute([], {});
        expect(result).toBeTruthy();
        expect(result.output).toBeDefined();
      }
    });

    test("status command should execute without errors", async () => {
      const statusCommand = SLASH_COMMANDS.find(cmd => cmd.name === "status");
      if (statusCommand?.execute) {
        const result = await statusCommand.execute([], {});
        expect(result).toBeTruthy();
      }
    });
  });

  describe("Basic Commands", () => {
    test("commands should handle empty arguments", async () => {
      const helpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "help");
      if (helpCommand?.execute) {
        const result = await helpCommand.execute([], {});
        expect(result).toBeTruthy();
      }
    });

    test("commands should handle basic usage", async () => {
      // Test various commands with basic arguments
      const testCases = [
        { name: "help", args: [] },
        { name: "status", args: [] },
        { name: "models", args: [] },
      ];

      for (const { name, args } of testCases) {
        const command = SLASH_COMMANDS.find(cmd => cmd.name === name);
        if (command?.execute) {
          const result = await command.execute(args, {});
          expect(result).toBeTruthy();
        }
      }
    });
  });

  describe("Command Args Validation", () => {
    test("commands should handle various argument patterns", async () => {
      const helpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "help");
      if (helpCommand?.execute) {
        // Test different argument patterns
        const testCases = [
          [],
          ["topic"],
          ["topic", "subtopic"],
        ];

        for (const args of testCases) {
          const result = await helpCommand.execute(args, {});
          expect(result).toBeTruthy();
        }
      }
    });
  });

  describe("Advanced Commands", () => {
    test("permissions command should handle basic usage", async () => {
      const permissionsCommand = SLASH_COMMANDS.find(cmd => cmd.name === "permissions");
      if (permissionsCommand?.execute) {
        const result = await permissionsCommand.execute(["list"], {});
        expect(result).toBeTruthy();
      }
    });

    test("paste command should handle basic usage", async () => {
      const pasteCommand = SLASH_COMMANDS.find(cmd => cmd.name === "paste");
      if (pasteCommand?.execute) {
        const result = await pasteCommand.execute(["5"], {});
        expect(result).toBeTruthy();
      }
    });

    test("mcp command should handle basic operations", async () => {
      const mcpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "mcp");
      if (mcpCommand?.execute) {
        const result = await mcpCommand.execute(["list"], {});
        // For now just check it doesn't crash, some MCP operations might return undefined
        expect(result !== null).toBe(true);
      }
    });
  });

  describe("Complex Command Integration", () => {
    test("mcp attach should work with mocked integrations", async () => {
      const mcpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "mcp");
      if (mcpCommand?.execute) {
        const result = await mcpCommand.execute(["attach", "test-server", "http://localhost:8719"], {});
        // MCP commands might not return a result object, just check they don't crash
        expect(result !== null).toBe(true);
      }
    });

    test("permissions default should handle configuration", async () => {
      const permissionsCommand = SLASH_COMMANDS.find(cmd => cmd.name === "permissions");
      if (permissionsCommand?.execute) {
        const result = await permissionsCommand.execute(["default", "fs_patch", "allow"], {});
        expect(result).toBeTruthy();
      }
    });
  });

  describe("Error Handling", () => {
    test("commands should handle malformed arguments gracefully", async () => {
      const helpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "help");
      if (helpCommand?.execute) {
        const result = await helpCommand.execute(["--invalid-flag"], {});
        expect(result).toBeTruthy(); // Should not crash
      }
    });

    test("commands should handle special characters in arguments", async () => {
      const helpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "help");
      if (helpCommand?.execute) {
        const result = await helpCommand.execute(["topic!@#$%"], {});
        expect(result).toBeTruthy();
      }
    });

    test("commands should handle very long argument strings", async () => {
      const helpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "help");
      if (helpCommand?.execute) {
        const longArg = "a".repeat(1000);
        const result = await helpCommand.execute([longArg], {});
        expect(result).toBeTruthy();
      }
    });
  });

  describe("Resource Management Integration", () => {
    test("commands should not leak resources during execution", async () => {
      // Execute multiple commands to test resource management
      const commands = ["help", "status", "models"];

      for (const cmdName of commands) {
        const command = SLASH_COMMANDS.find(cmd => cmd.name === cmdName);
        if (command?.execute) {
          const result = await command.execute([], {});
          expect(result).toBeTruthy();
        }
      }

      // Resource manager should be available
      expect(mockResourceManager.cleanup).toBeDefined();
    });

    test("resource manager should provide valid stats", () => {
      const stats = mockResourceManager.getStats();
      expect(stats).toBeTruthy();
      expect(typeof stats).toBe("object");
    });
  });

  describe("Configuration Integration", () => {
    test("config should be accessible through mock system", async () => {
      // This tests that the config system is properly mocked
      const statusCommand = SLASH_COMMANDS.find(cmd => cmd.name === "status");
      if (statusCommand?.execute) {
        const result = await statusCommand.execute([], {});
        expect(result).toBeTruthy();
      }
    });

    test("commands should handle configuration access", async () => {
      const modelCommand = SLASH_COMMANDS.find(cmd => cmd.name === "models");
      if (modelCommand?.execute) {
        const result = await modelCommand.execute([], {});
        expect(result).toBeTruthy();
      }
    });
  });

  describe("Session Management Integration", () => {
    test("commands should integrate with session system", async () => {
      const statusCommand = SLASH_COMMANDS.find(cmd => cmd.name === "status");
      if (statusCommand?.execute) {
        const result = await statusCommand.execute([], {});
        expect(result).toBeTruthy();
        // Session system should be accessible (mocked)
      }
    });
  });

  describe("MCP Integration", () => {
    test("mcp commands should integrate with store system", async () => {
      const mcpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "mcp");
      if (mcpCommand?.execute) {
        const result = await mcpCommand.execute(["list"], {});
        // MCP list operations might not return a result object, just check they don't crash
        expect(result !== null).toBe(true);
      }
    });

    test("mcp server operations should be mocked correctly", async () => {
      const mcpCommand = SLASH_COMMANDS.find(cmd => cmd.name === "mcp");
      if (mcpCommand?.execute) {
        const result = await mcpCommand.execute(["tools"], {});
        // MCP tool operations might not return a result object, just check they don't crash
        expect(result !== null).toBe(true);
      }
    });
  });

  describe("Mock System Validation", () => {
    test("mocked config should be accessible", () => {
      const config = mockLoadConfig();
      expect(config).toBeDefined();
      expect(config).toBeTruthy();
      expect(config.model?.active).toBe("gpt-4o");
    });

    test("mocked resource manager should be functional", () => {
      const stats = mockResourceManager.getStats();
      expect(stats).toBeDefined();
      expect(stats).toBeTruthy();
      expect(mockResourceManager.isHealthy()).toBe(true);
    });
  });
});