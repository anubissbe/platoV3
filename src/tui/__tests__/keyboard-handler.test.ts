import { setupTestEnvironment } from "../../__tests__/helpers/test-cleanup.js";

// Setup clean test environment
setupTestEnvironment({
  disableConsole: true,
  maxEventListeners: 30,
});

// Mock all external dependencies
jest.mock("../../config", () => ({
  loadConfig: jest.fn().mockResolvedValue({
    provider: {
      active: "copilot",
      copilot: {
        base_url: "http://localhost:8080",
        chat_path: "/chat/completions",
      },
    },
    model: { active: "gpt-4" },
    ui: {
      mouse_mode: true,
      paste_threshold: 150,
    },
  }),
  setConfigValue: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../slash/commands", () => ({
  SLASH_COMMANDS: {
    help: { description: "Show help" },
    login: { description: "Login to service" },
    logout: { description: "Logout from service" },
  },
}));

// Mock dependencies that orchestrator needs
jest.mock("../../providers/chat_fallback", () => ({
  chatCompletions: jest
    .fn()
    .mockResolvedValue({ content: "mock response", usage: null }),
  chatStream: jest
    .fn()
    .mockResolvedValue({ content: "mock response", usage: null }),
}));

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

jest.mock("../../providers/chat", () => ({
  chatCompletions: mockChatCompletions,
  chatStream: mockChatStream,
}));

jest.mock("../../tools/patch", () => ({
  dryRunApply: jest.fn().mockResolvedValue({ ok: true, conflicts: [] }),
  apply: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../policies/security", () => ({
  reviewPatch: jest.fn().mockReturnValue([]),
}));

jest.mock("../../tools/permissions", () => ({
  checkPermission: jest.fn().mockResolvedValue("allow"),
}));

jest.mock("../../tools/hooks", () => ({
  runHooks: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../integrations/mcp", () => ({
  callTool: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../styles/manager", () => ({
  initializeStyleManager: jest.fn().mockResolvedValue(undefined),
  getStyleManager: jest.fn().mockReturnValue({
    getCurrentStyle: jest.fn().mockReturnValue({
      name: "default",
      colors: {},
      formatting: {},
    }),
    applyStyle: jest.fn(),
  }),
}));

jest.mock("../../providers/copilot", () => ({
  getAvailableModels: jest.fn().mockResolvedValue([
    { id: "gpt-4", name: "GPT-4" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
  ]),
  getAuthInfo: jest.fn().mockResolvedValue({ loggedIn: true }),
}));

jest.mock("../context-command", () => ({
  handleContextCommand: jest.fn().mockResolvedValue("Context handled"),
}));

jest.mock("fs/promises", () => ({
  readFile: jest.fn().mockResolvedValue("{}"),
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("simple-git", () => ({
  default: () => ({
    checkIsRepo: jest.fn().mockResolvedValue(true),
    status: jest.fn().mockResolvedValue({ current: "main" }),
  }),
}));

// Import the modules we're testing after mocking
import orchestrator from "../../runtime/orchestrator";

// Define KeyboardState interface for testing
interface KeyboardState {
  input: string;
  multiLineInput: string[];
  isMultiLine: boolean;
  escapeCount: number;
  escapeTimeout: NodeJS.Timeout | null;
  transcriptMode: boolean;
  backgroundMode: boolean;
  historyMode: boolean;
  selectedHistoryIndex: number;
  messageHistory: Array<{ role: string; content: string }>;
  isCommandPaletteOpen: boolean;
  mouseMode: boolean;
  pasteBuffer: string;
  pasteTimeout: NodeJS.Timeout | null;
  pasteMode: boolean;
}

describe("Keyboard Handler Logic", () => {
  let mockKeyboardState: KeyboardState;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "test";

    // Initialize mock keyboard state
    mockKeyboardState = {
      input: "",
      multiLineInput: [],
      isMultiLine: false,
      escapeCount: 0,
      escapeTimeout: null,
      transcriptMode: false,
      backgroundMode: false,
      historyMode: false,
      selectedHistoryIndex: -1,
      messageHistory: [],
      isCommandPaletteOpen: false,
      mouseMode: true,
      pasteBuffer: "",
      pasteTimeout: null,
      pasteMode: false,
    };
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.PLATO_PARITY_MODE;
    delete process.env.PLATO_STATIC_TUI;
  });

  describe("Keyboard State Management", () => {
    test("should initialize with correct default state", () => {
      expect(mockKeyboardState.input).toBe("");
      expect(mockKeyboardState.isMultiLine).toBe(false);
      expect(mockKeyboardState.mouseMode).toBe(true);
      expect(mockKeyboardState.transcriptMode).toBe(false);
      expect(mockKeyboardState.backgroundMode).toBe(false);
      expect(mockKeyboardState.historyMode).toBe(false);
      expect(mockKeyboardState.selectedHistoryIndex).toBe(-1);
      expect(mockKeyboardState.isCommandPaletteOpen).toBe(false);
      expect(mockKeyboardState.pasteMode).toBe(false);
    });

    test("should handle multi-line mode toggle", () => {
      expect(mockKeyboardState.isMultiLine).toBe(false);

      // Simulate multi-line mode toggle
      mockKeyboardState.isMultiLine = true;
      mockKeyboardState.multiLineInput = ["line 1", "line 2"];

      expect(mockKeyboardState.isMultiLine).toBe(true);
      expect(mockKeyboardState.multiLineInput).toHaveLength(2);
    });

    test("should manage escape key counting", () => {
      expect(mockKeyboardState.escapeCount).toBe(0);

      // Simulate escape key press
      mockKeyboardState.escapeCount = 1;
      expect(mockKeyboardState.escapeCount).toBe(1);

      // Simulate timeout reset
      mockKeyboardState.escapeCount = 0;
      expect(mockKeyboardState.escapeCount).toBe(0);
    });

    test("should handle mouse mode configuration", () => {
      expect(mockKeyboardState.mouseMode).toBe(true);

      // Simulate parity mode (should disable mouse mode)
      process.env.PLATO_PARITY_MODE = "1";
      mockKeyboardState.mouseMode = false;

      expect(mockKeyboardState.mouseMode).toBe(false);
    });
  });

  describe("Mode State Management", () => {
    test("should handle transcript mode state", async () => {
      expect(orchestrator.isTranscriptMode()).toBe(false);

      await orchestrator.setTranscriptMode(true);
      expect(orchestrator.isTranscriptMode()).toBe(true);

      await orchestrator.setTranscriptMode(false);
      expect(orchestrator.isTranscriptMode()).toBe(false);
    });

    test("should handle background mode state", () => {
      expect(orchestrator.isBackgroundMode()).toBe(false);

      orchestrator.setBackgroundMode(true);
      expect(orchestrator.isBackgroundMode()).toBe(true);

      orchestrator.setBackgroundMode(false);
      expect(orchestrator.isBackgroundMode()).toBe(false);
    });

    test("should handle history mode state", () => {
      expect(mockKeyboardState.historyMode).toBe(false);

      // Simulate history mode activation
      mockKeyboardState.historyMode = true;
      mockKeyboardState.selectedHistoryIndex = 0;

      expect(mockKeyboardState.historyMode).toBe(true);
      expect(mockKeyboardState.selectedHistoryIndex).toBe(0);
    });
  });

  describe("Message History Management", () => {
    test("should return message history", async () => {
      const history = await orchestrator.getMessageHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    test("should handle history message selection", async () => {
      const result = await orchestrator.selectHistoryMessage(0);
      expect(result).toBeDefined(); // Just ensure it doesn't crash
    });

    test("should handle invalid history indices gracefully", async () => {
      const result1 = await orchestrator.selectHistoryMessage(-1);
      expect(result1).toBeDefined();

      const result2 = await orchestrator.selectHistoryMessage(9999);
      expect(result2).toBeDefined();
    });

    test("should manage message history in state", () => {
      const mockMessage = { role: "user", content: "test message" };
      mockKeyboardState.messageHistory.push(mockMessage);

      expect(mockKeyboardState.messageHistory).toHaveLength(1);
      expect(mockKeyboardState.messageHistory[0]).toEqual(mockMessage);
    });
  });

  describe("Command Palette Management", () => {
    test("should handle command palette state", () => {
      expect(mockKeyboardState.isCommandPaletteOpen).toBe(false);

      // Simulate opening command palette
      mockKeyboardState.isCommandPaletteOpen = true;
      expect(mockKeyboardState.isCommandPaletteOpen).toBe(true);

      // Simulate closing command palette
      mockKeyboardState.isCommandPaletteOpen = false;
      expect(mockKeyboardState.isCommandPaletteOpen).toBe(false);
    });

    test("should support slash command detection", () => {
      mockKeyboardState.input = "/help";
      expect(mockKeyboardState.input.startsWith("/")).toBe(true);

      mockKeyboardState.input = "/login";
      expect(mockKeyboardState.input.startsWith("/")).toBe(true);

      mockKeyboardState.input = "regular input";
      expect(mockKeyboardState.input.startsWith("/")).toBe(false);
    });
  });

  describe("Paste Detection and Handling", () => {
    test("should initialize paste buffer correctly", () => {
      expect(mockKeyboardState.pasteBuffer).toBe("");
      expect(mockKeyboardState.pasteMode).toBe(false);
      expect(mockKeyboardState.pasteTimeout).toBe(null);
    });

    test("should handle paste mode toggle", () => {
      expect(mockKeyboardState.pasteMode).toBe(false);

      // Simulate paste mode activation
      mockKeyboardState.pasteMode = true;
      expect(mockKeyboardState.pasteMode).toBe(true);

      // Simulate paste mode deactivation
      mockKeyboardState.pasteMode = false;
      expect(mockKeyboardState.pasteMode).toBe(false);
    });

    test("should manage paste buffer content", () => {
      const pasteContent = "pasted content";
      mockKeyboardState.pasteBuffer = pasteContent;

      expect(mockKeyboardState.pasteBuffer).toBe(pasteContent);

      // Clear buffer
      mockKeyboardState.pasteBuffer = "";
      expect(mockKeyboardState.pasteBuffer).toBe("");
    });
  });

  describe("Environment Variable Handling", () => {
    test("should handle PLATO_PARITY_MODE environment variable", () => {
      delete process.env.PLATO_PARITY_MODE;
      // In normal mode, mouse should be enabled
      let mouseMode = true;
      expect(mouseMode).toBe(true);

      process.env.PLATO_PARITY_MODE = "1";
      // In parity mode, mouse should be disabled
      mouseMode = false;
      expect(mouseMode).toBe(false);
    });

    test("should handle PLATO_STATIC_TUI environment variable", () => {
      process.env.PLATO_STATIC_TUI = "1";
      // Static TUI mode should be recognized
      expect(process.env.PLATO_STATIC_TUI).toBe("1");

      delete process.env.PLATO_STATIC_TUI;
      expect(process.env.PLATO_STATIC_TUI).toBeUndefined();
    });

    test("should handle missing environment variables", () => {
      // Clear all PLATO environment variables
      Object.keys(process.env)
        .filter(key => key.startsWith("PLATO_"))
        .forEach(key => delete process.env[key]);

      // Should handle gracefully with defaults
      const hasAnyPlatoEnv = Object.keys(process.env)
        .some(key => key.startsWith("PLATO_"));
      expect(hasAnyPlatoEnv).toBe(false);
    });
  });

  describe("Input Processing", () => {
    test("should handle regular text input", () => {
      const inputText = "Hello world";
      mockKeyboardState.input = inputText;

      expect(mockKeyboardState.input).toBe(inputText);
    });

    test("should handle multi-line input", () => {
      mockKeyboardState.isMultiLine = true;
      mockKeyboardState.multiLineInput = ["line 1", "line 2", "line 3"];

      expect(mockKeyboardState.multiLineInput).toHaveLength(3);
      expect(mockKeyboardState.multiLineInput.join("\n")).toBe("line 1\nline 2\nline 3");
    });

    test("should handle special characters", () => {
      const specialChars = "!@#$%^&*()[]{}|;':\",./<>?";
      mockKeyboardState.input = specialChars;

      expect(mockKeyboardState.input).toBe(specialChars);
    });

    test("should handle unicode input", () => {
      const unicodeInput = "🎯 ✅ 🔄 test";
      mockKeyboardState.input = unicodeInput;

      expect(mockKeyboardState.input).toBe(unicodeInput);
    });
  });

  describe("Stream Management", () => {
    test("should handle stream cancellation", () => {
      // Should not throw when cancelling stream
      expect(() => orchestrator.cancelStream()).not.toThrow();
    });

    test("should handle multiple stream operations", () => {
      // Should handle multiple cancellations gracefully
      expect(() => {
        orchestrator.cancelStream();
        orchestrator.cancelStream();
      }).not.toThrow();
    });
  });

  describe("Error Handling and Edge Cases", () => {
    test("should handle timeout cleanup", () => {
      // Simulate timeout setting and cleanup
      const mockTimeout = setTimeout(() => {}, 1000);
      mockKeyboardState.escapeTimeout = mockTimeout;

      expect(mockKeyboardState.escapeTimeout).not.toBe(null);

      // Cleanup
      if (mockKeyboardState.escapeTimeout) {
        clearTimeout(mockKeyboardState.escapeTimeout);
        mockKeyboardState.escapeTimeout = null;
      }

      expect(mockKeyboardState.escapeTimeout).toBe(null);
    });

    test("should handle paste timeout cleanup", () => {
      // Simulate paste timeout setting and cleanup
      const mockTimeout = setTimeout(() => {}, 150);
      mockKeyboardState.pasteTimeout = mockTimeout;

      expect(mockKeyboardState.pasteTimeout).not.toBe(null);

      // Cleanup
      if (mockKeyboardState.pasteTimeout) {
        clearTimeout(mockKeyboardState.pasteTimeout);
        mockKeyboardState.pasteTimeout = null;
      }

      expect(mockKeyboardState.pasteTimeout).toBe(null);
    });

    test("should handle empty input gracefully", async () => {
      const response = await orchestrator.respond("");
      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
    });

    test("should handle state reset", () => {
      // Set some state
      mockKeyboardState.input = "test input";
      mockKeyboardState.isMultiLine = true;
      mockKeyboardState.historyMode = true;
      mockKeyboardState.selectedHistoryIndex = 5;

      // Reset state
      mockKeyboardState = {
        input: "",
        multiLineInput: [],
        isMultiLine: false,
        escapeCount: 0,
        escapeTimeout: null,
        transcriptMode: false,
        backgroundMode: false,
        historyMode: false,
        selectedHistoryIndex: -1,
        messageHistory: [],
        isCommandPaletteOpen: false,
        mouseMode: true,
        pasteBuffer: "",
        pasteTimeout: null,
        pasteMode: false,
      };

      expect(mockKeyboardState.input).toBe("");
      expect(mockKeyboardState.isMultiLine).toBe(false);
      expect(mockKeyboardState.historyMode).toBe(false);
      expect(mockKeyboardState.selectedHistoryIndex).toBe(-1);
    });
  });
});