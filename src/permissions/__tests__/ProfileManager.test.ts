import { ProfileManager } from "../ProfileManager";
import {
  Profile,
  ProfileActivationRule,
  PermissionProfile,
  Rule,
} from "../types";
import * as fs from "fs/promises";
import * as path from "path";
import { execa } from "execa";

// Mock dependencies
jest.mock("fs/promises");
jest.mock("execa");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExeca = execa as jest.MockedFunction<typeof execa>;

describe("ProfileManager", () => {
  let profileManager: ProfileManager;
  let mockCwd: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCwd = "/test/project";
    jest.spyOn(process, "cwd").mockReturnValue(mockCwd);
    profileManager = new ProfileManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Profile Loading", () => {
    const mockConfig = {
      permissions: {
        version: 2,
        profiles: {
          development: {
            description: "Development profile",
            activation: {
              branch_pattern: "feature/*|develop",
              env: "NODE_ENV=development",
            },
            defaults: {
              fs_write: "allow" as const,
              exec: "confirm" as const,
            },
            rules: [],
          },
          production: {
            description: "Production profile",
            activation: {
              branch_pattern: "main|master",
              env: "NODE_ENV=production",
            },
            defaults: {
              fs_write: "deny" as const,
              exec: "deny" as const,
            },
            rules: [],
          },
        },
      },
    };

    it("should load profiles from YAML configuration", async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      await profileManager.loadProfiles();
      const profiles = profileManager.getAllProfiles();

      expect(profiles).toHaveLength(2);
      expect(profiles[0].name).toBe("development");
      expect(profiles[1].name).toBe("production");
    });

    it("should handle missing configuration files gracefully", async () => {
      mockFs.readFile.mockRejectedValue(new Error("File not found"));

      await expect(profileManager.loadProfiles()).resolves.not.toThrow();
      expect(profileManager.getAllProfiles()).toHaveLength(0);
    });

    it("should merge global and project configurations", async () => {
      const globalConfig = {
        permissions: {
          profiles: {
            development: {
              description: "Global dev",
              activation: {},
              defaults: {},
              rules: [],
            },
          },
        },
      };
      const projectConfig = {
        permissions: {
          profiles: {
            development: {
              description: "Project dev",
              activation: {},
              defaults: { fs_write: "allow" },
              rules: [],
            },
            testing: {
              description: "Test profile",
              activation: {},
              defaults: {},
              rules: [],
            },
          },
        },
      };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(globalConfig))
        .mockResolvedValueOnce(JSON.stringify(projectConfig));

      await profileManager.loadProfiles();
      const profiles = profileManager.getAllProfiles();

      expect(profiles).toHaveLength(2);
      expect(profiles[0].description).toBe("Project dev"); // Project config overrides global
      expect(profiles[1].name).toBe("testing"); // Additional profile from project
    });
  });

  describe("Context Detection", () => {
    beforeEach(() => {
      const config = {
        permissions: {
          profiles: {
            development: {
              description: "Development profile",
              activation: {
                branch_pattern: "feature/*|develop",
                env: "NODE_ENV=development",
              },
              defaults: {},
              rules: [],
            },
            production: {
              description: "Production profile",
              activation: {
                branch_pattern: "main|master|release/*",
                env: "NODE_ENV=production",
              },
              defaults: {},
              rules: [],
            },
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));
    });

    it("should detect active profile based on git branch", async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: "feature/new-permissions",
        stderr: "",
        exitCode: 0,
      } as any);

      await profileManager.loadProfiles();
      const activeProfile = await profileManager.detectActiveProfile();

      expect(mockExeca).toHaveBeenCalledWith(
        "git",
        ["branch", "--show-current"],
        { cwd: mockCwd },
      );
      expect(activeProfile?.name).toBe("development");
    });

    it("should detect active profile based on environment variables", async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: "main",
        stderr: "",
        exitCode: 0,
      } as any);

      process.env.NODE_ENV = "production";

      await profileManager.loadProfiles();
      const activeProfile = await profileManager.detectActiveProfile();

      expect(activeProfile?.name).toBe("production");
    });

    it("should return null if no profile matches context", async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: "unknown-branch",
        stderr: "",
        exitCode: 0,
      } as any);

      delete process.env.NODE_ENV;

      await profileManager.loadProfiles();
      const activeProfile = await profileManager.detectActiveProfile();

      expect(activeProfile).toBeNull();
    });

    it("should handle git command failures gracefully", async () => {
      mockExeca.mockRejectedValueOnce(new Error("Not a git repository"));

      await profileManager.loadProfiles();
      const activeProfile = await profileManager.detectActiveProfile();

      expect(activeProfile).toBeNull();
    });
  });

  describe("Profile Switching", () => {
    beforeEach(async () => {
      const config = {
        permissions: {
          profiles: {
            development: {
              description: "Development profile",
              activation: {},
              defaults: { fs_write: "allow" },
              rules: [],
            },
            production: {
              description: "Production profile",
              activation: {},
              defaults: { fs_write: "deny" },
              rules: [],
            },
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));
      await profileManager.loadProfiles();
    });

    it("should switch to a specific profile", async () => {
      const result = await profileManager.switchProfile("production");

      expect(result).toBe(true);
      expect(profileManager.getCurrentProfile()?.name).toBe("production");
    });

    it("should return false when switching to non-existent profile", async () => {
      const result = await profileManager.switchProfile("non-existent");

      expect(result).toBe(false);
      expect(profileManager.getCurrentProfile()).toBeNull();
    });

    it("should emit profile change events", async () => {
      const onProfileChange = jest.fn();
      profileManager.on("profileChanged", onProfileChange);

      await profileManager.switchProfile("development");

      expect(onProfileChange).toHaveBeenCalledWith(
        expect.objectContaining({
          previous: null,
          current: expect.objectContaining({ name: "development" }),
          reason: "manual",
        }),
      );
    });
  });

  describe("Profile Inheritance", () => {
    beforeEach(async () => {
      const config = {
        permissions: {
          global_rules: [
            {
              match: { tool: "fs_write", path: "**/.env*" },
              action: "deny",
              priority: 100,
            },
          ],
          profiles: {
            development: {
              description: "Development profile",
              activation: {},
              defaults: { fs_write: "allow", exec: "confirm" },
              rules: [
                {
                  match: { tool: "fs_write", path: "src/**" },
                  action: "allow",
                  priority: 50,
                },
              ],
            },
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));
      await profileManager.loadProfiles();
    });

    it("should inherit global rules in profile resolution", async () => {
      await profileManager.switchProfile("development");
      const resolvedRules = profileManager.getResolvedRules();

      expect(resolvedRules).toHaveLength(2); // 1 global + 1 profile rule
      expect(resolvedRules[0].priority).toBe(100); // Global rule has higher priority
    });

    it("should support full inheritance chain: global → project → profile → temporary", async () => {
      // Set up config with all rule levels
      const fullConfig = {
        permissions: {
          global_rules: [
            {
              match: { tool: "fs_write" },
              action: "confirm",
              priority: 10,
              reason: "Global rule",
            },
          ],
          project_rules: [
            {
              match: { tool: "exec" },
              action: "deny",
              priority: 20,
              reason: "Project rule",
            },
          ],
          profiles: {
            development: {
              description: "Dev profile",
              activation: {},
              defaults: {},
              rules: [
                {
                  match: { tool: "fs_read" },
                  action: "allow",
                  priority: 30,
                  reason: "Profile rule",
                },
              ],
            },
          },
        },
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(fullConfig));
      await profileManager.loadProfiles();
      await profileManager.switchProfile("development");

      // Add temporary rule
      profileManager.addTemporaryRule({
        id: "temp-1",
        match: { tool: "network" },
        action: "allow",
        priority: 40,
        reason: "Temporary rule",
      });

      const resolvedRules = profileManager.getResolvedRules();

      expect(resolvedRules).toHaveLength(4);

      // Check rule order (temporary should be first due to +10000 priority boost)
      expect(resolvedRules[0].match.tool).toBe("network"); // Temporary rule
      expect(resolvedRules[1].match.tool).toBe("fs_read"); // Profile rule
      expect(resolvedRules[2].match.tool).toBe("exec"); // Project rule
      expect(resolvedRules[3].match.tool).toBe("fs_write"); // Global rule
    });

    it("should support profile inheritance via inherits_from", async () => {
      const configWithInheritance = {
        permissions: {
          profiles: {
            base: {
              description: "Base profile",
              activation: {},
              defaults: { fs_write: "confirm" },
              rules: [
                {
                  match: { tool: "base_tool" },
                  action: "allow",
                  priority: 10,
                  reason: "Base rule",
                },
              ],
            },
            derived: {
              description: "Derived profile",
              activation: {},
              defaults: { exec: "deny" },
              inherits_from: "base",
              rules: [
                {
                  match: { tool: "derived_tool" },
                  action: "deny",
                  priority: 20,
                  reason: "Derived rule",
                },
              ],
            },
          },
        },
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(configWithInheritance));
      await profileManager.loadProfiles();
      await profileManager.switchProfile("derived");

      const resolvedRules = profileManager.getResolvedRules();

      expect(resolvedRules).toHaveLength(2);
      expect(resolvedRules[0].match.tool).toBe("derived_tool"); // Higher priority
      expect(resolvedRules[1].match.tool).toBe("base_tool"); // Inherited but lower priority
      expect(resolvedRules[1].priority).toBe(-990); // Base priority (10) - 1000
    });

    it("should merge defaults with proper precedence", async () => {
      await profileManager.switchProfile("development");
      const defaults = profileManager.getResolvedDefaults();

      expect(defaults).toEqual({
        fs_write: "allow",
        exec: "confirm",
      });
    });
  });

  describe("Profile Validation", () => {
    it("should validate profile configuration structure", async () => {
      const invalidConfig = {
        permissions: {
          profiles: {
            invalid: {
              // Missing description - required field
            },
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(profileManager.loadProfiles()).rejects.toThrow(
        "Profile must have a description",
      );
    });

    it("should validate activation rules", async () => {
      const configWithInvalidRule = {
        permissions: {
          profiles: {
            test: {
              description: "Test profile",
              activation: {
                branch_pattern: "[invalid-regex",
              },
              defaults: {},
              rules: [],
            },
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(configWithInvalidRule));

      await expect(profileManager.loadProfiles()).rejects.toThrow(
        "Invalid branch pattern",
      );
    });
  });

  describe("Automatic Profile Management", () => {
    beforeEach(async () => {
      const config = {
        permissions: {
          profiles: {
            development: {
              description: "Development profile",
              activation: {
                branch_pattern: "feature/*|develop",
              },
              defaults: {},
              rules: [],
            },
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));
      await profileManager.loadProfiles();
    });

    it("should automatically activate matching profile on context change", async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: "feature/new-feature",
        stderr: "",
        exitCode: 0,
      } as any);

      await profileManager.autoActivateProfile();

      expect(profileManager.getCurrentProfile()?.name).toBe("development");
    });

    it("should not change profile if current profile still matches", async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: "feature/test",
        stderr: "",
        exitCode: 0,
      } as any);

      // First activation
      await profileManager.autoActivateProfile();
      const firstProfile = profileManager.getCurrentProfile();

      // Second activation with different feature branch
      mockExeca.mockResolvedValueOnce({
        stdout: "feature/another",
        stderr: "",
        exitCode: 0,
      } as any);

      await profileManager.autoActivateProfile();
      const secondProfile = profileManager.getCurrentProfile();

      expect(firstProfile).toBe(secondProfile); // Same profile instance
    });
  });

  describe("Temporary Rule Management", () => {
    beforeEach(async () => {
      const config = {
        permissions: {
          profiles: {
            test: {
              description: "Test profile",
              activation: {},
              defaults: {},
              rules: [],
            },
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));
      await profileManager.loadProfiles();
    });

    it("should add and manage temporary rules", () => {
      const temporaryRule: Rule = {
        id: "temp-rule-1",
        match: { tool: "test_tool" },
        action: "allow",
        priority: 50,
        reason: "Temporary testing rule",
      };

      profileManager.addTemporaryRule(temporaryRule);

      const tempRules = profileManager.getTemporaryRules();
      expect(tempRules).toHaveLength(1);
      expect(tempRules[0].id).toBe("temp-rule-1");
      expect(tempRules[0].priority).toBe(10050); // Original + 10000 boost
    });

    it("should remove specific temporary rules", () => {
      const rule1: Rule = {
        id: "temp-1",
        match: { tool: "tool1" },
        action: "allow",
      };
      const rule2: Rule = {
        id: "temp-2",
        match: { tool: "tool2" },
        action: "deny",
      };

      profileManager.addTemporaryRule(rule1);
      profileManager.addTemporaryRule(rule2);

      expect(profileManager.getTemporaryRules()).toHaveLength(2);

      const removed = profileManager.removeTemporaryRule("temp-1");
      expect(removed).toBe(true);
      expect(profileManager.getTemporaryRules()).toHaveLength(1);
      expect(profileManager.getTemporaryRules()[0].id).toBe("temp-2");
    });

    it("should clear all temporary rules", () => {
      profileManager.addTemporaryRule({
        id: "temp-1",
        match: { tool: "tool1" },
        action: "allow",
      });
      profileManager.addTemporaryRule({
        id: "temp-2",
        match: { tool: "tool2" },
        action: "deny",
      });

      expect(profileManager.getTemporaryRules()).toHaveLength(2);

      profileManager.clearTemporaryRules();
      expect(profileManager.getTemporaryRules()).toHaveLength(0);
    });

    it("should emit events for temporary rule changes", () => {
      const rulesChangedHandler = jest.fn();
      profileManager.on("rulesChanged", rulesChangedHandler);

      const rule: Rule = {
        id: "temp-test",
        match: { tool: "test" },
        action: "allow",
      };

      profileManager.addTemporaryRule(rule);
      expect(rulesChangedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "temporary_added",
          rule: expect.objectContaining({ id: "temp-test" }),
        }),
      );

      profileManager.removeTemporaryRule("temp-test");
      expect(rulesChangedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "temporary_removed",
          ruleId: "temp-test",
        }),
      );
    });
  });

  describe("Hot-Reload Capability", () => {
    beforeEach(async () => {
      const config = {
        permissions: {
          profiles: {
            test: {
              description: "Test profile",
              activation: {},
              defaults: {},
              rules: [],
            },
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));
      await profileManager.loadProfiles();
    });

    afterEach(() => {
      profileManager.destroy(); // Clean up watchers
    });

    it("should enable and disable hot-reload capability", () => {
      expect(profileManager.isHotReloadEnabled()).toBe(false);

      const enabledHandler = jest.fn();
      const disabledHandler = jest.fn();
      profileManager.on("hotReloadEnabled", enabledHandler);
      profileManager.on("hotReloadDisabled", disabledHandler);

      profileManager.enableHotReload();
      expect(profileManager.isHotReloadEnabled()).toBe(true);
      expect(enabledHandler).toHaveBeenCalled();

      profileManager.disableHotReload();
      expect(profileManager.isHotReloadEnabled()).toBe(false);
      expect(disabledHandler).toHaveBeenCalled();
    });

    it("should not enable hot-reload multiple times", () => {
      const enabledHandler = jest.fn();
      profileManager.on("hotReloadEnabled", enabledHandler);

      profileManager.enableHotReload();
      profileManager.enableHotReload(); // Second call should be ignored

      expect(enabledHandler).toHaveBeenCalledTimes(1);
      expect(profileManager.isHotReloadEnabled()).toBe(true);
    });

    it("should clean up resources on destroy", () => {
      profileManager.enableHotReload();
      expect(profileManager.isHotReloadEnabled()).toBe(true);

      profileManager.destroy();
      expect(profileManager.isHotReloadEnabled()).toBe(false);
    });
  });
});
