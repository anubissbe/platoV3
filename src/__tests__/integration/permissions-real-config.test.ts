/**
 * Integration tests for permissions system using real configuration files
 * Tests actual config loading, inheritance, and override behavior with the current API
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import yaml from "yaml";
import {
  loadPermissions,
  checkPermission,
  getProjectPermissions,
  savePermissions,
  setDefault,
  addPermissionRule,
  type Permissions,
  type Rule,
} from "../../tools/permissions";

describe("Permissions System Integration Tests (Real Config Files)", () => {
  let originalCwd: string;
  let originalHome: string | undefined;
  const tempProjectDir = path.join(os.tmpdir(), "plato-test-project");
  const tempHomeDir = path.join(os.tmpdir(), "plato-test-home");

  beforeEach(async () => {
    // Store original values
    originalCwd = process.cwd();
    originalHome = process.env.HOME;

    // Clean up any existing temp directories
    try {
      await fs.rm(tempProjectDir, { recursive: true, force: true });
      await fs.rm(tempHomeDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directories don't exist
    }

    // Create temp directories
    await fs.mkdir(path.join(tempProjectDir, ".plato"), { recursive: true });
    await fs.mkdir(path.join(tempHomeDir, ".config", "plato"), {
      recursive: true,
    });

    // Set environment to use temp directories
    process.chdir(tempProjectDir);
    process.env.HOME = tempHomeDir;

    // Clear permissions environment variables
    delete process.env.PLATO_SKIP_PERMISSIONS;
  });

  afterEach(async () => {
    // Restore original environment
    process.chdir(originalCwd);
    process.env.HOME = originalHome;

    // Clean up temp directories
    try {
      await fs.rm(tempProjectDir, { recursive: true, force: true });
      await fs.rm(tempHomeDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Real YAML Config File Loading", () => {
    test("should load permissions from real global config file", async () => {
      const globalConfig = {
        permissions: {
          defaults: {
            mcp_tool: "deny",
            fs_patch: "confirm",
          },
          rules: [
            {
              match: { tool: "mcp_tool", path: "/safe/*" },
              action: "allow",
            },
          ],
        },
      };

      const globalConfigPath = path.join(
        tempHomeDir,
        ".config",
        "plato",
        "config.yaml",
      );
      await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));

      // Load permissions using the actual API
      const permissions = await loadPermissions();

      expect(permissions.defaults?.mcp_tool).toBe("deny");
      expect(permissions.defaults?.fs_patch).toBe("confirm");
      expect(permissions.rules).toHaveLength(1);
      expect(permissions.rules?.[0].match.tool).toBe("mcp_tool");
      expect(permissions.rules?.[0].action).toBe("allow");
    });

    test("should load permissions from real project config file", async () => {
      const projectConfig = {
        permissions: {
          defaults: {
            mcp_tool: "allow",
          },
          rules: [
            {
              match: { tool: "mcp_tool", command: "dangerous_.*" },
              action: "deny",
            },
          ],
        },
      };

      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );
      await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));

      const permissions = await loadPermissions();

      expect(permissions.defaults?.mcp_tool).toBe("allow");
      expect(permissions.rules).toHaveLength(1);
      expect(permissions.rules?.[0].match.command).toBe("dangerous_.*");
    });

    test("should handle malformed YAML gracefully", async () => {
      const globalConfigPath = path.join(
        tempHomeDir,
        ".config",
        "plato",
        "config.yaml",
      );
      await fs.writeFile(
        globalConfigPath,
        "invalid: yaml: content: [malformed]",
      );

      // Should return defaults without throwing
      const permissions = await loadPermissions();

      // API handles malformed YAML gracefully - returns empty structure
      expect(permissions.defaults).toEqual({});
      expect(permissions.rules).toEqual([]);
    });

    test("should handle missing config files gracefully", async () => {
      // No config files exist
      const permissions = await loadPermissions();

      // Should return empty permissions object
      expect(permissions.defaults).toBeUndefined();
      expect(permissions.rules).toBeUndefined();
    });
  });

  describe("Config Inheritance and Override Behavior", () => {
    test("should properly merge global and project configurations", async () => {
      // Create global config
      const globalConfig = {
        permissions: {
          defaults: {
            mcp_tool: "deny",
            fs_patch: "confirm",
            browser: "allow",
          },
          rules: [
            {
              match: { tool: "mcp_tool", path: "/global/safe/*" },
              action: "allow",
            },
            {
              match: { tool: "fs_patch", path: "/global/restricted/*" },
              action: "deny",
            },
          ],
        },
      };

      // Create project config that overrides some settings
      const projectConfig = {
        permissions: {
          defaults: {
            mcp_tool: "allow", // Override global deny
            fs_patch: "confirm", // Same as global
            // browser not specified - should inherit from global
          },
          rules: [
            {
              match: { tool: "mcp_tool", path: "/project/sensitive/*" },
              action: "deny",
            },
            // fs_patch rule not specified - should inherit from global
          ],
        },
      };

      const globalConfigPath = path.join(
        tempHomeDir,
        ".config",
        "plato",
        "config.yaml",
      );
      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );

      await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));
      await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));

      const permissions = await loadPermissions();

      // Test defaults inheritance and override - project overrides global
      expect(permissions.defaults?.mcp_tool).toBe("allow"); // Overridden by project
      expect(permissions.defaults?.fs_patch).toBe("confirm"); // Same in both
      expect(permissions.defaults?.browser).toBe("allow"); // Inherited from global

      // Rules should be merged (project overrides global with same keys)
      expect(permissions.rules).toHaveLength(1); // Project config overrides entirely
      expect(permissions.rules?.[0].match.path).toBe("/project/sensitive/*"); // Project rule only
    });

    test("should handle project config with missing permissions section", async () => {
      const globalConfig = {
        permissions: {
          defaults: { mcp_tool: "deny" },
          rules: [
            { match: { tool: "mcp_tool", path: "/safe/*" }, action: "allow" },
          ],
        },
      };

      const projectConfig = {
        other_setting: "value",
        // No permissions section
      };

      const globalConfigPath = path.join(
        tempHomeDir,
        ".config",
        "plato",
        "config.yaml",
      );
      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );

      await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));
      await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));

      const permissions = await loadPermissions();

      // Should use global permissions with project config overriding
      expect(permissions.defaults?.mcp_tool).toBe("deny");
      expect(permissions.rules).toHaveLength(1);
      // Note: Other settings from project config are merged at config level, not permissions level
    });

    test("should handle empty permissions section gracefully", async () => {
      const globalConfig = {
        permissions: {
          defaults: { mcp_tool: "allow" },
        },
      };

      const projectConfig = {
        permissions: {}, // Empty permissions section
      };

      const globalConfigPath = path.join(
        tempHomeDir,
        ".config",
        "plato",
        "config.yaml",
      );
      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );

      await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));
      await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));

      const permissions = await loadPermissions();

      // Empty project permissions should override global (due to merge behavior)
      expect(permissions.defaults).toEqual({});
      expect(permissions.rules).toBeUndefined();
    });
  });

  describe("Permission Query with Real Configs", () => {
    beforeEach(async () => {
      // Set up realistic configuration scenario
      const globalConfig = {
        permissions: {
          defaults: {
            mcp_tool: "deny",
            fs_patch: "confirm",
          },
          rules: [
            {
              match: { tool: "mcp_tool", path: "*/safe/*" },
              action: "allow",
            },
            {
              match: { tool: "fs_patch", path: "/tmp/*" },
              action: "allow",
            },
          ],
        },
      };

      const projectConfig = {
        permissions: {
          defaults: {
            mcp_tool: "allow", // Override global default
          },
          rules: [
            {
              match: { tool: "mcp_tool", command: "delete_.*" },
              action: "deny",
            },
          ],
        },
      };

      const globalConfigPath = path.join(
        tempHomeDir,
        ".config",
        "plato",
        "config.yaml",
      );
      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );

      await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));
      await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));
    });

    test("should check permissions using merged configuration", async () => {
      // Test various permission scenarios
      expect(
        await checkPermission({
          tool: "mcp_tool",
          command: "delete_all",
        }),
      ).toBe("deny"); // Matches project rule

      expect(
        await checkPermission({
          tool: "mcp_tool",
          path: "/random/file.txt",
        }),
      ).toBe("allow"); // Falls back to project default

      expect(
        await checkPermission({
          tool: "fs_patch",
          path: "/etc/config.txt",
        }),
      ).toBe("allow"); // Falls back to project default (overrides global)

      expect(
        await checkPermission({
          tool: "unknown_tool",
          path: "/any/path",
        }),
      ).toBe("allow"); // No default, ultimate fallback
    });

    test("should handle complex glob patterns from real config", async () => {
      const complexConfig = {
        permissions: {
          defaults: { mcp_tool: "deny" },
          rules: [
            {
              match: { tool: "mcp_tool", path: "**/*.safe.json" },
              action: "allow",
            },
            {
              match: { tool: "mcp_tool", path: "/project/**/config/*.yaml" },
              action: "allow",
            },
          ],
        },
      };

      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );
      await fs.writeFile(projectConfigPath, yaml.stringify(complexConfig));

      expect(
        await checkPermission({
          tool: "mcp_tool",
          path: "/any/deep/path/data.safe.json",
        }),
      ).toBe("allow");

      expect(
        await checkPermission({
          tool: "mcp_tool",
          path: "/project/module/config/settings.yaml",
        }),
      ).toBe("allow");

      expect(
        await checkPermission({
          tool: "mcp_tool",
          path: "/project/module/config/settings.json",
        }),
      ).toBe("deny"); // Doesn't match *.yaml pattern, falls back to default
    });

    test("should handle regex command patterns from real config", async () => {
      const regexConfig = {
        permissions: {
          defaults: { mcp_tool: "allow" },
          rules: [
            {
              match: { tool: "mcp_tool", command: "^(delete|remove|rm)_.*" },
              action: "deny",
            },
            {
              match: { tool: "mcp_tool", command: "system_.*" },
              action: "confirm",
            },
          ],
        },
      };

      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );
      await fs.writeFile(projectConfigPath, yaml.stringify(regexConfig));

      expect(
        await checkPermission({
          tool: "mcp_tool",
          command: "delete_file",
        }),
      ).toBe("deny");

      expect(
        await checkPermission({
          tool: "mcp_tool",
          command: "remove_directory",
        }),
      ).toBe("deny");

      expect(
        await checkPermission({
          tool: "mcp_tool",
          command: "system_reboot",
        }),
      ).toBe("confirm");

      expect(
        await checkPermission({
          tool: "mcp_tool",
          command: "read_file",
        }),
      ).toBe("allow"); // Falls back to default
    });
  });

  describe("Project Permissions Management API", () => {
    test("should handle project-specific permissions with savePermissions", async () => {
      const permissions: Permissions = {
        defaults: { mcp_tool: "confirm" },
        rules: [
          { match: { tool: "mcp_tool", path: "/test/*" }, action: "allow" },
        ],
      };

      await savePermissions(permissions);

      const loaded = await getProjectPermissions();
      expect(loaded.defaults?.mcp_tool).toBe("confirm");
      expect(loaded.rules).toHaveLength(1);

      // Verify it's saved to the correct file
      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );
      const fileContent = await fs.readFile(projectConfigPath, "utf8");
      const parsedConfig = yaml.parse(fileContent);
      expect(parsedConfig.permissions.defaults.mcp_tool).toBe("confirm");
    });

    test("should handle setDefault API correctly", async () => {
      await setDefault("mcp_tool", "deny");

      const permissions = await getProjectPermissions();
      expect(permissions.defaults?.mcp_tool).toBe("deny");

      // Test it affects permission checking
      expect(await checkPermission({ tool: "mcp_tool" })).toBe("deny");
    });

    test("should handle addPermissionRule API correctly", async () => {
      const rule: Rule = {
        match: { tool: "fs_patch", path: "/restricted/*" },
        action: "deny",
      };

      await addPermissionRule(rule);

      const permissions = await getProjectPermissions();
      expect(permissions.rules).toHaveLength(1);
      expect(permissions.rules?.[0].match.path).toBe("/restricted/*");

      // Test it affects permission checking
      expect(
        await checkPermission({
          tool: "fs_patch",
          path: "/restricted/file.txt",
        }),
      ).toBe("deny");
    });
  });

  describe("Environment Variable and Dangerous Mode Handling", () => {
    test("should respect PLATO_SKIP_PERMISSIONS environment variable", async () => {
      // Set up restrictive permissions
      const restrictiveConfig = {
        permissions: {
          defaults: { mcp_tool: "deny" },
          rules: [],
        },
      };

      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );
      await fs.writeFile(projectConfigPath, yaml.stringify(restrictiveConfig));

      // Without skip flag
      expect(await checkPermission({ tool: "mcp_tool" })).toBe("deny");

      // With skip flag
      process.env.PLATO_SKIP_PERMISSIONS = "true";
      expect(await checkPermission({ tool: "mcp_tool" })).toBe("allow");
    });
  });

  describe("Real-World Configuration Scenarios", () => {
    test("should handle minimal config like current production setup", async () => {
      // Test with minimal config like current production setup
      const minimalConfig = {
        permissions: {
          defaults: {
            mcp: "allow",
          },
        },
      };

      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );
      await fs.writeFile(projectConfigPath, yaml.stringify(minimalConfig));

      expect(
        await checkPermission({
          tool: "mcp",
          command: "any_command",
          path: "/any/path",
        }),
      ).toBe("allow");

      const permissions = await loadPermissions();
      expect(permissions.defaults?.mcp).toBe("allow");
      expect(permissions.rules).toBeUndefined();
    });

    test("should work with actual project config structure", async () => {
      // Test with actual config structure from the project
      const actualConfig = {
        permissions: {
          defaults: {
            mcp: "allow",
          },
        },
      };

      const projectConfigPath = path.join(
        tempProjectDir,
        ".plato",
        "config.yaml",
      );
      await fs.writeFile(projectConfigPath, yaml.stringify(actualConfig));

      // Simulate typical MCP tool calls
      expect(await checkPermission({ tool: "mcp" })).toBe("allow");
      expect(await checkPermission({ tool: "mcp", command: "read_file" })).toBe(
        "allow",
      );
      expect(
        await checkPermission({ tool: "mcp", path: "/project/src/file.ts" }),
      ).toBe("allow");
    });
  });
});
