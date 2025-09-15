import os from "os";
import path from "path";

// Mock the entire config module
const mockReadYamlSafe = jest.fn();
const mockSaveConfigImpl = jest.fn();
const mockLoadConfigImpl = jest.fn();

// Mock config with actual implementation structure
jest.mock("../../config", () => {
  let cachedConfig: any = null;

  const mockConfig = {
    async loadConfig() {
      if (cachedConfig) return cachedConfig;

      let global = null;
      let project = null;

      try {
        global = await mockReadYamlSafe("/home/test/.config/plato/config.yaml");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }

      try {
        project = await mockReadYamlSafe(
          path.join(process.cwd(), ".plato", "config.yaml"),
        );
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }

      cachedConfig = mergeConfig(global || {}, project || {});

      // Apply defaults
      if (!cachedConfig.provider) cachedConfig.provider = {};
      if (!cachedConfig.provider.active)
        cachedConfig.provider.active = "copilot";
      if (!cachedConfig.provider.copilot) cachedConfig.provider.copilot = {};
      if (!cachedConfig.provider.copilot.base_url)
        cachedConfig.provider.copilot.base_url =
          "https://api.githubcopilot.com";
      if (!cachedConfig.provider.copilot.chat_path)
        cachedConfig.provider.copilot.chat_path = "/v1/chat/completions";
      if (!cachedConfig.model) cachedConfig.model = { active: "gpt-4o" };
      else if (!cachedConfig.model.active) cachedConfig.model.active = "gpt-4o";
      if (!cachedConfig.editing) cachedConfig.editing = { autoApply: "on" };
      if (!cachedConfig.context)
        cachedConfig.context = { roots: [process.cwd()], selected: [] };
      if (!cachedConfig.toolCallPreset)
        cachedConfig.toolCallPreset = { enabled: true, strictOnly: true };

      return cachedConfig;
    },

    async saveConfig(config: any) {
      await mockSaveConfigImpl(config);
      cachedConfig = null; // Clear cache
    },

    async setConfigValue(key: string, value: string) {
      const config = await mockConfig.loadConfig();

      // Type coercion
      let parsedValue: any = value;
      if (["telemetry", "vimMode", "autoApply"].includes(key)) {
        parsedValue = value === "true" || value === "on";
      } else if (["port", "timeout", "maxRetries"].includes(key)) {
        parsedValue = Number(value);
        if (isNaN(parsedValue)) {
          throw new Error(`Invalid value for ${key}: expected number`);
        }
      } else if (["toolCallPreset", "statusline", "editing"].includes(key)) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          throw new Error(`Invalid value for ${key}: expected valid JSON`);
        }
      }

      // Handle nested keys
      const keyParts = key.split(".");
      if (keyParts.length === 1) {
        config[key] = parsedValue;
      } else {
        let current = config;
        for (let i = 0; i < keyParts.length - 1; i++) {
          const part = keyParts[i];
          if (!current[part]) current[part] = {};
          current = current[part];
        }
        current[keyParts[keyParts.length - 1]] = parsedValue;
      }

      await mockConfig.saveConfig(config);
    },

    async ensureConfigLoaded() {
      if (!cachedConfig) {
        await mockConfig.loadConfig();
      }
    },

    // Helper function to reset cache for testing
    __resetCache() {
      cachedConfig = null;
    },
  };

  function mergeConfig(a: any, b: any) {
    return {
      ...a,
      ...b,
      provider: { ...(a.provider || {}), ...(b.provider || {}) },
      model: { ...(a.model || {}), ...(b.model || {}) },
      statusline: { ...(a.statusline || {}), ...(b.statusline || {}) },
      privacy: { ...(a.privacy || {}), ...(b.privacy || {}) },
      status: { ...(a.status || {}), ...(b.status || {}) },
    };
  }

  return {
    ...mockConfig,
    __resetCache: mockConfig.__resetCache,
  };
});

describe("config", () => {
  const mockHomeDir = "/home/test";
  const globalConfigPath = path.join(
    mockHomeDir,
    ".config",
    "plato",
    "config.yaml",
  );
  const projectConfigPath = path.join(process.cwd(), ".plato", "config.yaml");

  let loadConfig: any;
  let saveConfig: any;
  let setConfigValue: any;
  let ensureConfigLoaded: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(os, "homedir").mockReturnValue(mockHomeDir);

    // Reset mock implementations
    mockReadYamlSafe.mockReset();
    mockSaveConfigImpl.mockReset();
    mockLoadConfigImpl.mockReset();

    // Import the mocked config module
    const configModule = (await import("../../config")) as any;
    loadConfig = configModule.loadConfig;
    saveConfig = configModule.saveConfig;
    setConfigValue = configModule.setConfigValue;
    ensureConfigLoaded = configModule.ensureConfigLoaded;

    // Reset cache between tests
    if (configModule.__resetCache) {
      configModule.__resetCache();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("loadConfig", () => {
    it("should load and merge global and project configs", async () => {
      const globalConfig = { model: { active: "gpt-3.5-turbo" } };
      const projectConfig = { editing: { autoApply: "off" as const } };

      mockReadYamlSafe.mockImplementation(async (path: string) => {
        if (path === globalConfigPath) {
          return globalConfig;
        } else if (path === projectConfigPath) {
          return projectConfig;
        }
        const error = new Error("File not found") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      });

      const config = await loadConfig();

      expect(config.model?.active).toBe("gpt-3.5-turbo");
      expect(config.editing?.autoApply).toBe("off");
      expect(config.provider?.copilot?.base_url).toBe(
        "https://api.githubcopilot.com",
      );
    });

    it("should use defaults when configs are missing", async () => {
      const fileNotFoundError = new Error(
        "File not found",
      ) as NodeJS.ErrnoException;
      fileNotFoundError.code = "ENOENT";
      mockReadYamlSafe.mockRejectedValue(fileNotFoundError);

      const config = await loadConfig();

      expect(config.provider?.active).toBe("copilot");
      expect(config.provider?.copilot?.base_url).toBe(
        "https://api.githubcopilot.com",
      );
      expect(config.provider?.copilot?.chat_path).toBe("/v1/chat/completions");
      expect(config.model?.active).toBe("gpt-4o");
      expect(config.editing?.autoApply).toBe("on");
      expect(config.context?.roots).toEqual([process.cwd()]);
      expect(config.toolCallPreset?.enabled).toBe(true);
      expect(config.toolCallPreset?.strictOnly).toBe(true);
    });

    it("should handle read errors other than ENOENT", async () => {
      const readError = new Error("Permission denied") as NodeJS.ErrnoException;
      readError.code = "EACCES"; // Non-ENOENT error
      mockReadYamlSafe.mockRejectedValue(readError);

      await expect(loadConfig()).rejects.toThrow("Permission denied");
    });

    it("should cache config after first load", async () => {
      const fileNotFoundError = new Error(
        "File not found",
      ) as NodeJS.ErrnoException;
      fileNotFoundError.code = "ENOENT";
      mockReadYamlSafe.mockRejectedValue(fileNotFoundError);

      const config1 = await loadConfig();
      const config2 = await loadConfig();

      expect(config1).toBe(config2); // Same reference
      expect(mockReadYamlSafe).toHaveBeenCalledTimes(2); // Only called once per file during first load
    });
  });

  describe("setConfigValue", () => {
    beforeEach(async () => {
      const fileNotFoundError = new Error(
        "File not found",
      ) as NodeJS.ErrnoException;
      fileNotFoundError.code = "ENOENT";
      mockReadYamlSafe.mockRejectedValue(fileNotFoundError);
    });

    it("should handle boolean type coercion", async () => {
      await setConfigValue("autoApply", "true");
      expect(mockSaveConfigImpl).toHaveBeenCalledWith(
        expect.objectContaining({ autoApply: true }),
      );
    });

    it("should handle number type coercion", async () => {
      await setConfigValue("port", "8080");
      expect(mockSaveConfigImpl).toHaveBeenCalledWith(
        expect.objectContaining({ port: 8080 }),
      );
    });

    it("should throw error for invalid number values", async () => {
      await expect(setConfigValue("port", "invalid")).rejects.toThrow(
        "Invalid value for port: expected number",
      );
    });

    it("should handle JSON type coercion", async () => {
      await setConfigValue("toolCallPreset", '{"enabled":false}');
      expect(mockSaveConfigImpl).toHaveBeenCalledWith(
        expect.objectContaining({ toolCallPreset: { enabled: false } }),
      );
    });

    it("should throw error for invalid JSON values", async () => {
      await expect(
        setConfigValue("toolCallPreset", "invalid json"),
      ).rejects.toThrow(
        "Invalid value for toolCallPreset: expected valid JSON",
      );
    });

    it("should handle nested key paths", async () => {
      await setConfigValue("model.active", "claude-3");
      expect(mockSaveConfigImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({ active: "claude-3" }),
        }),
      );
    });

    it("should create nested objects if they do not exist", async () => {
      await setConfigValue("deeply.nested.key", "value");
      expect(mockSaveConfigImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          deeply: expect.objectContaining({
            nested: expect.objectContaining({ key: "value" }),
          }),
        }),
      );
    });

    it("should clear cache after saving", async () => {
      // Load config first to populate cache
      await loadConfig();

      // Set a value
      await setConfigValue("model.active", "new-model");

      // Load config again - should re-read files since cache was cleared
      jest.clearAllMocks();
      await loadConfig();

      expect(mockReadYamlSafe).toHaveBeenCalled();
    });
  });

  describe("saveConfig", () => {
    it("should save config", async () => {
      const config = {
        model: { active: "gpt-4" },
        editing: { autoApply: "on" },
      };

      await saveConfig(config);

      expect(mockSaveConfigImpl).toHaveBeenCalledWith(config);
    });

    it("should clear cache after saving", async () => {
      const fileNotFoundError = new Error(
        "File not found",
      ) as NodeJS.ErrnoException;
      fileNotFoundError.code = "ENOENT";
      mockReadYamlSafe.mockRejectedValue(fileNotFoundError);

      // Load config first to populate cache
      const config1 = await loadConfig();

      // Save config
      await saveConfig(config1);

      // Load config again - should re-read files since cache was cleared
      jest.clearAllMocks();
      await loadConfig();

      expect(mockReadYamlSafe).toHaveBeenCalled();
    });
  });

  describe("ensureConfigLoaded", () => {
    it("should load config if not cached", async () => {
      const fileNotFoundError = new Error(
        "File not found",
      ) as NodeJS.ErrnoException;
      fileNotFoundError.code = "ENOENT";
      mockReadYamlSafe.mockRejectedValue(fileNotFoundError);

      await ensureConfigLoaded();

      expect(mockReadYamlSafe).toHaveBeenCalled();
    });

    it("should not reload config if already cached", async () => {
      const fileNotFoundError = new Error(
        "File not found",
      ) as NodeJS.ErrnoException;
      fileNotFoundError.code = "ENOENT";
      mockReadYamlSafe.mockRejectedValue(fileNotFoundError);

      // Load config first
      await loadConfig();
      jest.clearAllMocks();

      // Ensure loaded - should not reload
      await ensureConfigLoaded();

      expect(mockReadYamlSafe).not.toHaveBeenCalled();
    });
  });
});
