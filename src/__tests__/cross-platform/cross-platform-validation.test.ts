/**
 * Cross-Platform Validation Testing Suite
 * Tests Windows, macOS, Linux native terminals, WSL1/WSL2, and Docker compatibility
 * Ensures consistent behavior across terminal applications and environments
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import os from "os";
import path from "path";
import fs from "fs/promises";

// Import components for testing
import { TerminalCapabilities } from "../../tui/terminal-detection.js";
import { MouseEventHandler } from "../../tui/mouse-event-handler.js";
import { KeyboardHandler } from "../../tui/keyboard-handler.js";
import { ScrollController } from "../../tui/scroll-controller.js";

// Mock platform-specific modules
jest.mock("os");
jest.mock("process");

const mockOs = os as jest.Mocked<typeof os>;

describe("Cross-Platform Validation Suite", () => {
  let originalPlatform: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original values
    originalPlatform = process.platform;
    originalEnv = { ...process.env };

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process, "platform", { value: originalPlatform });
    process.env = originalEnv;

    jest.restoreAllMocks();
  });

  describe("Windows Platform Testing", () => {
    beforeEach(() => {
      // Mock Windows environment
      Object.defineProperty(process, "platform", { value: "win32" });
      mockOs.platform.mockReturnValue("win32");
      mockOs.type.mockReturnValue("Windows_NT");
      mockOs.release.mockReturnValue("10.0.19043");
    });

    it("should detect Windows Terminal properly", () => {
      process.env.TERM_PROGRAM = "Windows Terminal";
      process.env.WT_SESSION = "abc123";
      process.env.TERM = "xterm-256color";

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("win32");
      expect(detection.terminalApp).toBe("Windows Terminal");
      expect(detection.colorSupport).toBe("256color");
      expect(detection.mouseSupport).toBe(true);
      expect(detection.unicodeSupport).toBe(true);
    });

    it("should handle Command Prompt limitations", () => {
      process.env.TERM_PROGRAM = "";
      process.env.TERM = "";
      process.env.ComSpec = "C:\\Windows\\system32\\cmd.exe";

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("win32");
      expect(detection.terminalApp).toBe("Command Prompt");
      expect(detection.colorSupport).toBe("basic");
      expect(detection.mouseSupport).toBe(false);
      expect(detection.rawModeSupport).toBe(false);
    });

    it("should handle PowerShell terminal", () => {
      process.env.TERM_PROGRAM = "";
      process.env.TERM = "xterm";
      process.env.PSModulePath = "C:\\Program Files\\PowerShell\\Modules";

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("win32");
      expect(detection.terminalApp).toBe("PowerShell");
      expect(detection.colorSupport).toBe("16color");
      expect(detection.mouseSupport).toBe(true);
    });

    it("should test mouse event handling on Windows", () => {
      process.env.TERM_PROGRAM = "Windows Terminal";

      const mouseHandler = new MouseEventHandler();
      const mockCallback = jest.fn();

      // Simulate Windows-style mouse events
      mouseHandler.enable();
      mouseHandler.onScroll(mockCallback);

      // Test mouse wheel events
      const wheelUpEvent = "\x1b[M@!!"; // Mouse wheel up
      const wheelDownEvent = "\x1b[Ma!!"; // Mouse wheel down

      mouseHandler.handleMouseSequence(wheelUpEvent);
      mouseHandler.handleMouseSequence(wheelDownEvent);

      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "up",
          x: expect.any(Number),
          y: expect.any(Number),
        }),
      );
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "down",
          x: expect.any(Number),
          y: expect.any(Number),
        }),
      );
    });

    it("should handle keyboard input on Windows", async () => {
      const keyboardHandler = new KeyboardHandler();
      const mockOnInput = jest.fn();

      keyboardHandler.setInputHandler(mockOnInput);
      keyboardHandler.enableRawMode();

      // Simulate Windows keyboard sequences
      const testInputs = [
        "\r", // Enter key
        "\x03", // Ctrl+C
        "\x16", // Ctrl+V (paste)
        "\x1b[A", // Up arrow
        "\x1b[B", // Down arrow
      ];

      for (const input of testInputs) {
        await keyboardHandler.handleKeypress(Buffer.from(input));
      }

      expect(mockOnInput).toHaveBeenCalledTimes(5);

      keyboardHandler.disableRawMode();
    });

    it("should test file operations with Windows paths", async () => {
      const tempDir = "C:\\temp\\plato-test";
      const testFile = path.join(tempDir, "test.plato");

      // Mock Windows file system operations
      const mockStat = jest
        .fn()
        .mockResolvedValue({ isDirectory: () => false });
      const mockReadFile = jest.fn().mockResolvedValue("test content");
      const mockWriteFile = jest.fn().mockResolvedValue(undefined);

      jest.mocked(fs.stat).mockImplementation(mockStat);
      jest.mocked(fs.readFile).mockImplementation(mockReadFile);
      jest.mocked(fs.writeFile).mockImplementation(mockWriteFile);

      // Test Windows path handling
      await expect(fs.stat(testFile)).resolves.toBeDefined();
      await expect(fs.readFile(testFile, "utf8")).resolves.toBe("test content");
      await expect(
        fs.writeFile(testFile, "new content"),
      ).resolves.toBeUndefined();

      expect(mockStat).toHaveBeenCalledWith(testFile);
      expect(mockReadFile).toHaveBeenCalledWith(testFile, "utf8");
      expect(mockWriteFile).toHaveBeenCalledWith(testFile, "new content");
    });
  });

  describe("macOS Platform Testing", () => {
    beforeEach(() => {
      // Mock macOS environment
      Object.defineProperty(process, "platform", { value: "darwin" });
      mockOs.platform.mockReturnValue("darwin");
      mockOs.type.mockReturnValue("Darwin");
      mockOs.release.mockReturnValue("21.6.0");
    });

    it("should detect iTerm2 properly", () => {
      process.env.TERM_PROGRAM = "iTerm.app";
      process.env.TERM_PROGRAM_VERSION = "3.4.16";
      process.env.TERM = "xterm-256color";
      process.env.COLORTERM = "truecolor";

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("darwin");
      expect(detection.terminalApp).toBe("iTerm2");
      expect(detection.colorSupport).toBe("truecolor");
      expect(detection.mouseSupport).toBe(true);
      expect(detection.unicodeSupport).toBe(true);
      expect(detection.version).toBe("3.4.16");
    });

    it("should detect macOS Terminal.app", () => {
      process.env.TERM_PROGRAM = "Apple_Terminal";
      process.env.TERM_PROGRAM_VERSION = "440";
      process.env.TERM = "xterm-256color";

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("darwin");
      expect(detection.terminalApp).toBe("Terminal.app");
      expect(detection.colorSupport).toBe("256color");
      expect(detection.mouseSupport).toBe(true);
    });

    it("should test macOS-specific keyboard shortcuts", async () => {
      const keyboardHandler = new KeyboardHandler();
      const mockOnInput = jest.fn();

      keyboardHandler.setInputHandler(mockOnInput);

      // Test macOS Command key combinations
      const macOSInputs = [
        "\x1b[1;2A", // Shift+Up
        "\x1b[1;2B", // Shift+Down
        "\x1b[1;5A", // Ctrl+Up
        "\x1b[1;5B", // Ctrl+Down
        "\x1b[1;9A", // Cmd+Up (if supported)
      ];

      for (const input of macOSInputs) {
        await keyboardHandler.handleKeypress(Buffer.from(input));
      }

      expect(mockOnInput).toHaveBeenCalledTimes(5);
    });

    it("should handle Unicode characters properly on macOS", () => {
      const testStrings = [
        "🚀 Rocket emoji",
        "你好 Chinese characters",
        "🎯📊💡 Multiple emojis",
        "Àáâãäå Special characters",
      ];

      const capabilities = new TerminalCapabilities();

      testStrings.forEach((str) => {
        const encoded = capabilities.encodeForTerminal(str);
        const width = capabilities.getStringWidth(str);

        expect(encoded).toContain(str);
        expect(width).toBeGreaterThan(0);
      });
    });
  });

  describe("Linux Native Platform Testing", () => {
    beforeEach(() => {
      // Mock Linux environment
      Object.defineProperty(process, "platform", { value: "linux" });
      mockOs.platform.mockReturnValue("linux");
      mockOs.type.mockReturnValue("Linux");
      mockOs.release.mockReturnValue("5.15.0-56-generic");
    });

    it("should detect GNOME Terminal", () => {
      process.env.TERM_PROGRAM = "";
      process.env.COLORTERM = "truecolor";
      process.env.TERM = "xterm-256color";
      process.env.VTE_VERSION = "6800";
      process.env.GNOME_TERMINAL_SCREEN = "/org/gnome/Terminal/screen/1";

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("linux");
      expect(detection.terminalApp).toBe("GNOME Terminal");
      expect(detection.colorSupport).toBe("truecolor");
      expect(detection.mouseSupport).toBe(true);
    });

    it("should detect KDE Konsole", () => {
      process.env.TERM_PROGRAM = "";
      process.env.COLORTERM = "truecolor";
      process.env.TERM = "xterm-256color";
      process.env.KONSOLE_VERSION = "210800";

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("linux");
      expect(detection.terminalApp).toBe("Konsole");
      expect(detection.colorSupport).toBe("truecolor");
    });

    it("should handle basic Linux console", () => {
      process.env.TERM_PROGRAM = "";
      process.env.COLORTERM = "";
      process.env.TERM = "linux";

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("linux");
      expect(detection.terminalApp).toBe("Linux Console");
      expect(detection.colorSupport).toBe("16color");
      expect(detection.mouseSupport).toBe(false);
    });

    it("should test Linux-specific terminal features", () => {
      process.env.TERM = "xterm-256color";

      const scrollController = new ScrollController();
      scrollController.initialize();

      // Test Linux terminal scrolling capabilities
      const mockScrollCallback = jest.fn();
      scrollController.onScroll(mockScrollCallback);

      // Simulate scroll events
      scrollController.scroll(-3); // Scroll up
      scrollController.scroll(5); // Scroll down

      expect(mockScrollCallback).toHaveBeenCalledTimes(2);
      expect(mockScrollCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "up",
          delta: 3,
        }),
      );
      expect(mockScrollCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "down",
          delta: 5,
        }),
      );
    });

    it("should handle Linux filesystem permissions", async () => {
      const capabilities = new TerminalCapabilities();
      const homeDir = "/home/testuser";
      const configDir = path.join(homeDir, ".config", "plato");

      // Mock filesystem checks
      const mockAccess = jest.fn().mockResolvedValue(undefined);
      const mockMkdir = jest.fn().mockResolvedValue(undefined);

      jest.mocked(fs.access).mockImplementation(mockAccess);
      jest.mocked(fs.mkdir).mockImplementation(mockMkdir);

      // Test directory creation with proper permissions
      await capabilities.ensureConfigDirectory(configDir);

      expect(mockAccess).toHaveBeenCalledWith(configDir);
      expect(mockMkdir).toHaveBeenCalledWith(configDir, { recursive: true });
    });
  });

  describe("WSL1 and WSL2 Compatibility Testing", () => {
    beforeEach(() => {
      // Mock WSL environment
      Object.defineProperty(process, "platform", { value: "linux" });
      mockOs.platform.mockReturnValue("linux");
      mockOs.type.mockReturnValue("Linux");
    });

    it("should detect WSL1 environment", () => {
      // WSL1 specific environment
      process.env.WSL_DISTRO_NAME = "Ubuntu";
      process.env.WSLENV = "PATH/l:USERNAME";
      mockOs.release.mockReturnValue("4.4.0-19041-Microsoft");

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("linux");
      expect(detection.isWSL).toBe(true);
      expect(detection.wslVersion).toBe(1);
      expect(detection.wslDistro).toBe("Ubuntu");
    });

    it("should detect WSL2 environment", () => {
      // WSL2 specific environment
      process.env.WSL_DISTRO_NAME = "Ubuntu-20.04";
      process.env.WSLENV = "PATH/l:USERNAME";
      mockOs.release.mockReturnValue("5.10.16.3-microsoft-standard-WSL2");

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("linux");
      expect(detection.isWSL).toBe(true);
      expect(detection.wslVersion).toBe(2);
      expect(detection.wslDistro).toBe("Ubuntu-20.04");
    });

    it("should handle WSL raw mode limitations", async () => {
      // Mock WSL environment with raw mode issues
      process.env.WSL_DISTRO_NAME = "Ubuntu";
      mockOs.release.mockReturnValue("4.4.0-19041-Microsoft");

      const keyboardHandler = new KeyboardHandler();

      // WSL may have raw mode limitations
      const rawModeEnabled = keyboardHandler.enableRawMode();

      if (!rawModeEnabled) {
        // Should fallback to line-based input in WSL
        expect(keyboardHandler.isRawModeSupported()).toBe(false);
        expect(keyboardHandler.getInputMode()).toBe("line");
      }

      keyboardHandler.disableRawMode();
    });

    it("should test WSL filesystem path translation", async () => {
      process.env.WSL_DISTRO_NAME = "Ubuntu";

      const capabilities = new TerminalCapabilities();

      // Test Windows path translation in WSL
      const windowsPath = "C:\\Users\\username\\Documents";
      const wslPath = "/mnt/c/Users/username/Documents";

      const translated = capabilities.translatePath(windowsPath);
      expect(translated).toBe(wslPath);

      // Test reverse translation
      const backTranslated = capabilities.translatePath(wslPath, "windows");
      expect(backTranslated).toBe(windowsPath);
    });

    it("should handle WSL mouse support variations", () => {
      process.env.WSL_DISTRO_NAME = "Ubuntu";
      process.env.TERM_PROGRAM = "Windows Terminal";

      const mouseHandler = new MouseEventHandler();
      const capabilities = mouseHandler.detectCapabilities();

      // WSL in Windows Terminal should support mouse
      expect(capabilities.mouseSupport).toBe(true);
      expect(capabilities.scrollSupport).toBe(true);
      expect(capabilities.clickSupport).toBe(true);

      // But may have different event formats
      expect(capabilities.eventFormat).toBe("xterm");
    });
  });

  describe("Docker Container Deployment Testing", () => {
    beforeEach(() => {
      // Mock Docker container environment
      Object.defineProperty(process, "platform", { value: "linux" });
      mockOs.platform.mockReturnValue("linux");
    });

    it("should detect Docker container environment", () => {
      // Docker-specific environment indicators
      process.env.container = "docker";
      mockOs.release.mockReturnValue("5.4.0-65-generic");

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      expect(detection.platform).toBe("linux");
      expect(detection.isContainer).toBe(true);
      expect(detection.containerType).toBe("docker");
    });

    it("should handle limited Docker terminal capabilities", () => {
      process.env.container = "docker";
      process.env.TERM = "xterm";
      process.env.COLORTERM = "";

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      // Docker may have limited capabilities
      expect(detection.colorSupport).toBe("16color");
      expect(detection.mouseSupport).toBe(false);
      expect(detection.rawModeSupport).toBe(false);
    });

    it("should test Docker volume mounting", async () => {
      process.env.container = "docker";

      const testVolumePath = "/app/data";
      const configFile = path.join(testVolumePath, "config.json");

      // Mock Docker volume operations
      const mockStat = jest.fn().mockResolvedValue({ isDirectory: () => true });
      const mockReadFile = jest.fn().mockResolvedValue('{"test": true}');
      const mockWriteFile = jest.fn().mockResolvedValue(undefined);

      jest.mocked(fs.stat).mockImplementation(mockStat);
      jest.mocked(fs.readFile).mockImplementation(mockReadFile);
      jest.mocked(fs.writeFile).mockImplementation(mockWriteFile);

      // Test volume accessibility
      await expect(fs.stat(testVolumePath)).resolves.toBeDefined();
      await expect(fs.readFile(configFile, "utf8")).resolves.toBe(
        '{"test": true}',
      );
      await expect(
        fs.writeFile(configFile, '{"updated": true}'),
      ).resolves.toBeUndefined();

      expect(mockStat).toHaveBeenCalledWith(testVolumePath);
      expect(mockReadFile).toHaveBeenCalledWith(configFile, "utf8");
      expect(mockWriteFile).toHaveBeenCalledWith(
        configFile,
        '{"updated": true}',
      );
    });

    it("should handle Docker networking limitations", async () => {
      process.env.container = "docker";

      // Mock network requests within Docker
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ test: "response" }),
      });

      global.fetch = mockFetch;

      // Test network connectivity from Docker
      const response = await fetch("http://localhost:3000/api/test");
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toEqual({ test: "response" });

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/test");
    });
  });

  describe("Terminal Application Consistency Testing", () => {
    const terminalConfigs = [
      {
        name: "VS Code Integrated Terminal",
        env: {
          TERM_PROGRAM: "vscode",
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
        expected: {
          terminalApp: "VS Code",
          colorSupport: "truecolor",
          mouseSupport: true,
        },
      },
      {
        name: "Alacritty",
        env: {
          TERM_PROGRAM: "",
          TERM: "alacritty",
          COLORTERM: "truecolor",
        },
        expected: {
          terminalApp: "Alacritty",
          colorSupport: "truecolor",
          mouseSupport: true,
        },
      },
      {
        name: "Kitty",
        env: {
          TERM_PROGRAM: "",
          TERM: "xterm-kitty",
          COLORTERM: "truecolor",
          KITTY_WINDOW_ID: "1",
        },
        expected: {
          terminalApp: "Kitty",
          colorSupport: "truecolor",
          mouseSupport: true,
        },
      },
      {
        name: "Hyper",
        env: {
          TERM_PROGRAM: "Hyper",
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
        expected: {
          terminalApp: "Hyper",
          colorSupport: "truecolor",
          mouseSupport: true,
        },
      },
    ];

    terminalConfigs.forEach((config) => {
      it(`should handle ${config.name} consistently`, () => {
        // Set environment for this terminal
        Object.keys(config.env).forEach((key) => {
          process.env[key] = config.env[key];
        });

        const capabilities = new TerminalCapabilities();
        const detection = capabilities.detect();

        expect(detection.terminalApp).toBe(config.expected.terminalApp);
        expect(detection.colorSupport).toBe(config.expected.colorSupport);
        expect(detection.mouseSupport).toBe(config.expected.mouseSupport);

        // Test basic functionality
        const scrollController = new ScrollController();
        const mouseHandler = new MouseEventHandler();

        expect(() => scrollController.initialize()).not.toThrow();
        expect(() => mouseHandler.enable()).not.toThrow();

        scrollController.destroy();
        mouseHandler.disable();
      });
    });

    it("should provide consistent behavior across all terminal applications", () => {
      terminalConfigs.forEach((config) => {
        // Reset environment
        Object.keys(process.env).forEach((key) => {
          if (key.startsWith("TERM") || key === "COLORTERM") {
            delete process.env[key];
          }
        });

        // Set terminal-specific environment
        Object.keys(config.env).forEach((key) => {
          process.env[key] = config.env[key];
        });

        const capabilities = new TerminalCapabilities();
        const detection = capabilities.detect();

        // All modern terminals should support basic features
        expect(detection.colorSupport).not.toBe("none");
        expect(detection.unicodeSupport).toBe(true);

        // Test input handling consistency
        const keyboardHandler = new KeyboardHandler();
        expect(() => keyboardHandler.initialize()).not.toThrow();

        keyboardHandler.cleanup();
      });
    });
  });

  describe("Environment Recovery and Fallback Testing", () => {
    it("should handle completely unknown terminal environment", () => {
      // Clear all terminal-related environment variables
      Object.keys(process.env).forEach((key) => {
        if (key.includes("TERM") || key.includes("COLOR")) {
          delete process.env[key];
        }
      });

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      // Should fallback to safe defaults
      expect(detection.terminalApp).toBe("Unknown");
      expect(detection.colorSupport).toBe("basic");
      expect(detection.mouseSupport).toBe(false);
      expect(detection.rawModeSupport).toBe(false);
    });

    it("should gracefully handle feature detection failures", () => {
      // Mock feature detection failures
      const originalStdout = process.stdout;

      Object.defineProperty(process, "stdout", {
        value: {
          ...originalStdout,
          isTTY: false,
          hasColors: () => false,
          columns: 0,
          rows: 0,
        },
      });

      const capabilities = new TerminalCapabilities();
      const detection = capabilities.detect();

      // Should handle non-TTY gracefully
      expect(detection.isTTY).toBe(false);
      expect(detection.colorSupport).toBe("none");
      expect(detection.dimensions).toEqual({ width: 80, height: 24 }); // Fallback

      // Restore original stdout
      Object.defineProperty(process, "stdout", { value: originalStdout });
    });

    it("should provide fallback mechanisms for all platforms", () => {
      const platforms = ["win32", "darwin", "linux"];

      platforms.forEach((platform) => {
        Object.defineProperty(process, "platform", { value: platform });
        mockOs.platform.mockReturnValue(platform);

        // Clear environment for clean test
        Object.keys(process.env).forEach((key) => {
          if (key.includes("TERM")) {
            delete process.env[key];
          }
        });

        const capabilities = new TerminalCapabilities();
        const detection = capabilities.detect();

        expect(detection.platform).toBe(platform);
        expect(detection.terminalApp).toBeDefined();
        expect(detection.colorSupport).toBeDefined();
        expect(typeof detection.mouseSupport).toBe("boolean");
        expect(typeof detection.rawModeSupport).toBe("boolean");
      });
    });
  });
});
