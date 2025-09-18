/**
 * Tests for paste command implementation
 */

import { executePasteCommand } from "../paste-command.js";
import { getPasteSettingsManager } from "../../config/paste-settings.js";

// Mock the settings manager
jest.mock("../../config/paste-settings.js", () => {
  const mockManager = {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    activatePasteMode: jest.fn(),
    deactivatePasteMode: jest.fn(),
    togglePasteMode: jest.fn(),
    isActive: jest.fn(),
    resetSettings: jest.fn(),
  };

  return {
    getPasteSettingsManager: () => mockManager,
    DEFAULT_PASTE_SETTINGS: {
      defaultTimeout: 5,
      isActive: false,
      currentTimeout: 5,
      showCountdown: true,
      autoClear: true,
    },
  };
});

describe("Paste Command", () => {
  const mockManager = getPasteSettingsManager() as jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockManager.getSettings.mockReturnValue({
      defaultTimeout: 5,
      isActive: false,
      currentTimeout: 5,
      showCountdown: true,
      autoClear: true,
    });
  });

  describe("Help Command", () => {
    it("should show help when requested", async () => {
      const result = await executePasteCommand(["help"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("📋 Paste Command Usage:");
      expect(result.output).toContain("Basic Usage:");
      expect(result.output).toContain("/paste");
    });

    it("should show help for invalid arguments", async () => {
      const result = await executePasteCommand(["invalid"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("📋 Paste Command Usage:");
    });
  });

  describe("Status Command", () => {
    it("should show current status", async () => {
      const result = await executePasteCommand(["status"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("📋 Paste Mode Configuration:");
      expect(result.output).toContain("Currently Active: No");
      expect(mockManager.getSettings).toHaveBeenCalled();
    });
  });

  describe("Toggle Command", () => {
    it("should toggle paste mode with default timeout", async () => {
      mockManager.togglePasteMode.mockReturnValue({
        defaultTimeout: 5,
        isActive: true,
        currentTimeout: 5,
        showCountdown: true,
        autoClear: true,
      });

      const result = await executePasteCommand([]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("✅ Paste mode enabled");
      expect(mockManager.togglePasteMode).toHaveBeenCalledWith(undefined);
    });

    it("should toggle paste mode with specific timeout", async () => {
      mockManager.togglePasteMode.mockReturnValue({
        defaultTimeout: 5,
        isActive: true,
        currentTimeout: 10,
        showCountdown: true,
        autoClear: true,
      });

      const result = await executePasteCommand(["toggle"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("✅ Paste mode enabled");
      expect(mockManager.togglePasteMode).toHaveBeenCalledWith(undefined);
    });
  });

  describe("Enable/Disable Commands", () => {
    it("should enable paste mode with custom timeout", async () => {
      mockManager.activatePasteMode.mockReturnValue({
        defaultTimeout: 5,
        isActive: true,
        currentTimeout: 10,
        showCountdown: true,
        autoClear: true,
      });

      const result = await executePasteCommand(["10"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("✅ Paste mode enabled for 10 seconds");
      expect(mockManager.activatePasteMode).toHaveBeenCalledWith(10);
    });

    it("should enable paste mode with 'on' command", async () => {
      mockManager.activatePasteMode.mockReturnValue({
        defaultTimeout: 5,
        isActive: true,
        currentTimeout: 5,
        showCountdown: true,
        autoClear: true,
      });

      const result = await executePasteCommand(["on"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("✅ Paste mode enabled");
      expect(mockManager.activatePasteMode).toHaveBeenCalledWith(undefined);
    });

    it("should disable paste mode with 'off' command", async () => {
      mockManager.deactivatePasteMode.mockReturnValue({
        defaultTimeout: 5,
        isActive: false,
        currentTimeout: 5,
        showCountdown: true,
        autoClear: true,
      });

      const result = await executePasteCommand(["off"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("✅ Paste mode disabled");
      expect(mockManager.deactivatePasteMode).toHaveBeenCalled();
    });
  });

  describe("Configuration Commands", () => {
    it("should show current configuration", async () => {
      const result = await executePasteCommand(["config"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("📋 Paste Mode Configuration:");
      expect(mockManager.getSettings).toHaveBeenCalled();
    });

    it("should update configuration setting", async () => {
      mockManager.updateSettings.mockImplementation(() => {});
      mockManager.getSettings.mockReturnValue({
        defaultTimeout: 10,
        isActive: false,
        currentTimeout: 5,
        showCountdown: true,
        autoClear: true,
      });

      const result = await executePasteCommand(["config", "defaultTimeout", "10"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("✅ Updated defaultTimeout to 10");
      expect(mockManager.updateSettings).toHaveBeenCalledWith({
        defaultTimeout: 10,
      });
    });

    it("should reset configuration to defaults", async () => {
      mockManager.resetSettings.mockReturnValue({
        defaultTimeout: 5,
        isActive: false,
        currentTimeout: 5,
        showCountdown: true,
        autoClear: true,
      });

      const result = await executePasteCommand(["reset"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("✅ Paste settings reset to defaults");
      expect(mockManager.resetSettings).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle errors gracefully", async () => {
      mockManager.getSettings.mockImplementation(() => {
        throw new Error("Test error");
      });

      const result = await executePasteCommand(["status"]);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Paste command failed:");
      expect(result.error).toContain("Test error");
    });
  });
});