/**
 * Working integration tests for permissions system using real configuration files
 * Based on understanding from unit tests and actual API behavior
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { loadPermissions, checkPermission, getProjectPermissions, savePermissions, setDefault, addPermissionRule, type Permissions, type Rule } from '../../tools/permissions';

describe('Permissions System Real Config Integration Tests', () => {
  let originalCwd: string;
  let originalHome: string | undefined;
  const tempProjectDir = path.join(os.tmpdir(), 'plato-integration-test');
  const tempHomeDir = path.join(os.tmpdir(), 'plato-home-integration');

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalHome = process.env.HOME;

    // Clean up and create temp directories
    try {
      await fs.rm(tempProjectDir, { recursive: true, force: true });
      await fs.rm(tempHomeDir, { recursive: true, force: true });
    } catch {}

    await fs.mkdir(path.join(tempProjectDir, '.plato'), { recursive: true });
    await fs.mkdir(path.join(tempHomeDir, '.config', 'plato'), { recursive: true });

    // Register temp directories with the mock system
    ((global as any).mockTempDirs = (global as any).mockTempDirs || new Set()).add(tempProjectDir);
    ((global as any).mockTempDirs = (global as any).mockTempDirs || new Set()).add(tempHomeDir);

    process.chdir(tempProjectDir);
    process.env.HOME = tempHomeDir;
    delete process.env.PLATO_SKIP_PERMISSIONS;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    try {
      await fs.rm(tempProjectDir, { recursive: true, force: true });
      await fs.rm(tempHomeDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Real Config File Loading', () => {
    test('should load permissions from global config file', async () => {
      const globalConfig = {
        permissions: {
          defaults: {
            mcp_tool: 'deny',
            fs_patch: 'confirm'
          },
          rules: [
            {
              match: { tool: 'mcp_tool', path: '/safe/*' },
              action: 'allow'
            }
          ]
        }
      };

      const globalConfigPath = path.join(tempHomeDir, '.config', 'plato', 'config.yaml');
      await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));

      const permissions = await loadPermissions();

      // Test that global config is loaded
      expect(permissions.defaults?.mcp_tool).toBe('deny');
      expect(permissions.defaults?.fs_patch).toBe('confirm');
      expect(permissions.rules).toHaveLength(1);
      expect(permissions.rules?.[0].match.tool).toBe('mcp_tool');
      expect(permissions.rules?.[0].action).toBe('allow');
    });

    test('should load permissions from project config file', async () => {
      const projectConfig = {
        permissions: {
          defaults: {
            mcp_tool: 'allow'
          },
          rules: [
            {
              match: { tool: 'mcp_tool', command: 'dangerous_.*' },
              action: 'deny'
            }
          ]
        }
      };

      const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');
      await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));

      const permissions = await loadPermissions();

      expect(permissions.defaults?.mcp_tool).toBe('allow');
      expect(permissions.rules).toHaveLength(1);
      expect(permissions.rules?.[0].match.command).toBe('dangerous_.*');
    });

    test('should handle missing config files gracefully', async () => {
      // No config files exist
      const permissions = await loadPermissions();

      // Based on unit tests, missing files return empty object
      expect(permissions).toEqual({});
    });

    test('should handle malformed YAML gracefully', async () => {
      const globalConfigPath = path.join(tempHomeDir, '.config', 'plato', 'config.yaml');
      await fs.writeFile(globalConfigPath, 'invalid: yaml: [');

      // Should return empty object on parse error
      const permissions = await loadPermissions();
      expect(permissions).toEqual({});
    });
  });

  describe('Config Inheritance and Override Behavior', () => {
    test('should properly merge global and project configurations', async () => {
      // Create global config
      const globalConfig = {
        permissions: {
          defaults: {
            mcp_tool: 'deny',
            fs_patch: 'confirm',
            browser: 'allow'
          },
          rules: [
            {
              match: { tool: 'fs_patch', path: '/global/restricted/*' },
              action: 'deny'
            }
          ]
        }
      };

      // Create project config that overrides some settings
      const projectConfig = {
        permissions: {
          defaults: {
            mcp_tool: 'allow' // Override global deny
          },
          rules: [
            {
              match: { tool: 'mcp_tool', path: '/project/sensitive/*' },
              action: 'deny'
            }
          ]
        }
      };

      const globalConfigPath = path.join(tempHomeDir, '.config', 'plato', 'config.yaml');
      const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');
      
      await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));
      await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));

      const permissions = await loadPermissions();

      // Test that project overrides global for same keys
      expect(permissions.defaults?.mcp_tool).toBe('allow'); // Overridden by project
      expect(permissions.defaults?.fs_patch).toBe('confirm'); // From global (not overridden)
      expect(permissions.defaults?.browser).toBe('allow'); // From global (not in project)

      // Rules are merged (both rules should be present)
      expect(permissions.rules).toHaveLength(2);
      
      // Find rules by their distinctive properties
      const projectRule = permissions.rules?.find(r => r.match.path === '/project/sensitive/*');
      const globalRule = permissions.rules?.find(r => r.match.path === '/global/restricted/*');
      
      expect(projectRule).toBeDefined();
      expect(globalRule).toBeDefined();
      expect(projectRule?.action).toBe('deny');
      expect(globalRule?.action).toBe('deny');
    });

    test('should handle project config without permissions section', async () => {
      const globalConfig = {
        permissions: {
          defaults: { mcp_tool: 'deny' },
          rules: [
            { match: { tool: 'mcp_tool', path: '/safe/*' }, action: 'allow' }
          ]
        }
      };

      const projectConfig = {
        other_setting: 'value'
        // No permissions section
      };

      const globalConfigPath = path.join(tempHomeDir, '.config', 'plato', 'config.yaml');
      const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');
      
      await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));
      await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));

      const permissions = await loadPermissions();

      // Should have global permissions plus project config
      expect(permissions.defaults?.mcp_tool).toBe('deny');
      expect(permissions.rules).toHaveLength(1);
    });
  });

  describe('Permission Checking with Real Configs', () => {
    beforeEach(async () => {
      // Clear any cached config to ensure fresh load
      const configModule = await import('../../config.js');
      (configModule as any).cached = null;
      
      // Set up realistic configuration
      const globalConfig = {
        permissions: {
          defaults: {
            mcp_tool: 'deny',
            fs_patch: 'confirm'
          },
          rules: [
            {
              match: { tool: 'fs_patch', path: '/tmp/*' },
              action: 'allow'
            }
          ]
        }
      };

      const projectConfig = {
        permissions: {
          defaults: {
            mcp_tool: 'allow' // Override global default
          },
          rules: [
            {
              match: { tool: 'mcp_tool', command: 'delete_.*' },
              action: 'deny'
            }
          ]
        }
      };

      const globalConfigPath = path.join(tempHomeDir, '.config', 'plato', 'config.yaml');
      const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');
      
      await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));
      await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));
    });

    test('should check permissions using merged configuration', async () => {
      // Test command rule matching (project rule)
      expect(await checkPermission({
        tool: 'mcp_tool',
        command: 'delete_all'
      })).toBe('deny'); // Matches project rule

      // Test path rule matching (global rule)
      expect(await checkPermission({
        tool: 'fs_patch',
        path: '/tmp/test.txt'
      })).toBe('allow'); // Matches global rule

      // Test default fallback (project default overrides global)
      expect(await checkPermission({
        tool: 'mcp_tool',
        path: '/random/file.txt'
      })).toBe('allow'); // Falls back to project default

      // Test default fallback (global default, not overridden by project)
      expect(await checkPermission({
        tool: 'fs_patch',
        path: '/etc/config.txt'
      })).toBe('confirm'); // Falls back to global default

      // Test ultimate fallback
      expect(await checkPermission({
        tool: 'unknown_tool',
        path: '/any/path'
      })).toBe('allow'); // No default, ultimate fallback
    });

    test('should handle glob pattern matching', async () => {
      const testConfig = {
        permissions: {
          defaults: { mcp_tool: 'deny' },
          rules: [
            {
              match: { tool: 'mcp_tool', path: '**/*.safe.json' },
              action: 'allow'
            },
            {
              match: { tool: 'mcp_tool', path: '/project/**/config/*.yaml' },
              action: 'allow'
            }
          ]
        }
      };

      const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');
      await fs.writeFile(projectConfigPath, yaml.stringify(testConfig));

      // Test ** pattern
      expect(await checkPermission({
        tool: 'mcp_tool',
        path: '/any/deep/path/data.safe.json'
      })).toBe('allow');

      // Test complex path pattern
      expect(await checkPermission({
        tool: 'mcp_tool',
        path: '/project/module/config/settings.yaml'
      })).toBe('allow');

      // Test non-matching pattern
      expect(await checkPermission({
        tool: 'mcp_tool',
        path: '/project/module/config/settings.json'
      })).toBe('deny'); // Falls back to default
    });

    test('should handle regex command patterns', async () => {
      const testConfig = {
        permissions: {
          defaults: { mcp_tool: 'allow' },
          rules: [
            {
              match: { tool: 'mcp_tool', command: '^(delete|remove|rm)_.*' },
              action: 'deny'
            },
            {
              match: { tool: 'mcp_tool', command: 'system_.*' },
              action: 'confirm'
            }
          ]
        }
      };

      const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');
      await fs.writeFile(projectConfigPath, yaml.stringify(testConfig));

      // Test regex matching
      expect(await checkPermission({
        tool: 'mcp_tool',
        command: 'delete_file'
      })).toBe('deny');

      expect(await checkPermission({
        tool: 'mcp_tool',
        command: 'remove_directory'
      })).toBe('deny');

      expect(await checkPermission({
        tool: 'mcp_tool',
        command: 'system_reboot'
      })).toBe('confirm');

      // Test non-matching command
      expect(await checkPermission({
        tool: 'mcp_tool',
        command: 'read_file'
      })).toBe('allow'); // Falls back to default
    });
  });

  describe('Project Permissions Management', () => {
    test('should save permissions to project config', async () => {
      const permissions: Permissions = {
        defaults: { mcp_tool: 'confirm' },
        rules: [
          { match: { tool: 'mcp_tool', path: '/test/*' }, action: 'allow' }
        ]
      };

      await savePermissions(permissions);

      // Verify saved correctly
      const loaded = await getProjectPermissions();
      expect(loaded.defaults?.mcp_tool).toBe('confirm');
      expect(loaded.rules).toHaveLength(1);
      expect(loaded.rules?.[0].match.path).toBe('/test/*');
    });

    test('should set tool defaults correctly', async () => {
      await setDefault('test_tool', 'deny');

      const permissions = await getProjectPermissions();
      expect(permissions.defaults?.test_tool).toBe('deny');

      // Verify it affects permission checking
      expect(await checkPermission({ tool: 'test_tool' })).toBe('deny');
    });

    test('should add permission rules correctly', async () => {
      const rule: Rule = {
        match: { tool: 'fs_patch', path: '/restricted/*' },
        action: 'deny'
      };

      await addPermissionRule(rule);

      const permissions = await getProjectPermissions();
      expect(permissions.rules).toHaveLength(1);
      expect(permissions.rules?.[0].match.path).toBe('/restricted/*');

      // Verify it affects permission checking
      expect(await checkPermission({
        tool: 'fs_patch',
        path: '/restricted/file.txt'
      })).toBe('deny');
    });
  });

  describe('Environment Variable Handling', () => {
    test('should respect PLATO_SKIP_PERMISSIONS environment variable', async () => {
      // Set up restrictive permissions
      const restrictiveConfig = {
        permissions: {
          defaults: { mcp_tool: 'deny' },
          rules: []
        }
      };

      const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');
      await fs.writeFile(projectConfigPath, yaml.stringify(restrictiveConfig));

      // Without skip flag
      expect(await checkPermission({ tool: 'mcp_tool' })).toBe('deny');

      // With skip flag
      process.env.PLATO_SKIP_PERMISSIONS = 'true';
      expect(await checkPermission({ tool: 'mcp_tool' })).toBe('allow');
    });
  });

  describe('Production Config Compatibility', () => {
    test('should work with minimal production-like config', async () => {
      // Test with actual production config structure
      const productionConfig = {
        permissions: {
          defaults: {
            mcp: 'allow'
          }
        }
      };

      const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');
      await fs.writeFile(projectConfigPath, yaml.stringify(productionConfig));

      // Test typical operations
      expect(await checkPermission({ tool: 'mcp' })).toBe('allow');
      expect(await checkPermission({ tool: 'mcp', command: 'read_file' })).toBe('allow');
      expect(await checkPermission({ tool: 'mcp', path: '/project/src/file.ts' })).toBe('allow');

      const permissions = await loadPermissions();
      expect(permissions.defaults?.mcp).toBe('allow');
    });
  });
});