/**
 * Analysis test to understand actual permissions system behavior
 * This test explores the real behavior to document it correctly
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { loadPermissions, checkPermission, getProjectPermissions, savePermissions, setDefault, addPermissionRule } from '../../tools/permissions';

describe('Permissions System Behavior Analysis', () => {
  let originalCwd: string;
  let originalHome: string | undefined;
  const tempProjectDir = path.join(os.tmpdir(), 'plato-behavior-test');
  const tempHomeDir = path.join(os.tmpdir(), 'plato-home-test');

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

  test('should analyze empty permissions behavior', async () => {
    const permissions = await loadPermissions();
    console.log('Empty permissions:', JSON.stringify(permissions, null, 2));

    // Test what checkPermission returns with no configuration
    const result1 = await checkPermission({ tool: 'mcp' });
    const result2 = await checkPermission({ tool: 'unknown_tool' });
    
    console.log('checkPermission with no config:', { result1, result2 });
    
    expect(result1).toBe('allow'); // Default fallback
    expect(result2).toBe('allow'); // Default fallback
  });

  test('should analyze project config behavior', async () => {
    const projectConfig = {
      permissions: {
        defaults: { mcp: 'deny' },
        rules: [
          { match: { tool: 'mcp', path: '/safe/*' }, action: 'allow' }
        ]
      }
    };

    const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');
    await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));

    const permissions = await loadPermissions();
    console.log('Project permissions:', JSON.stringify(permissions, null, 2));

    const result1 = await checkPermission({ tool: 'mcp' });
    const result2 = await checkPermission({ tool: 'mcp', path: '/safe/file.txt' });
    const result3 = await checkPermission({ tool: 'unknown' });

    console.log('Project config results:', { result1, result2, result3 });

    // Document actual behavior
    expect(permissions.defaults).toBeDefined();
    expect(permissions.rules).toBeDefined();
  });

  test('should analyze global + project merging behavior', async () => {
    const globalConfig = {
      permissions: {
        defaults: { mcp: 'confirm', tool2: 'allow' },
        rules: [
          { match: { tool: 'mcp', path: '/global/*' }, action: 'allow' }
        ]
      }
    };

    const projectConfig = {
      permissions: {
        defaults: { mcp: 'deny' }, // Override global
        rules: [
          { match: { tool: 'mcp', path: '/project/*' }, action: 'allow' }
        ]
      }
    };

    const globalConfigPath = path.join(tempHomeDir, '.config', 'plato', 'config.yaml');
    const projectConfigPath = path.join(tempProjectDir, '.plato', 'config.yaml');

    await fs.writeFile(globalConfigPath, yaml.stringify(globalConfig));
    await fs.writeFile(projectConfigPath, yaml.stringify(projectConfig));

    const permissions = await loadPermissions();
    console.log('Merged permissions:', JSON.stringify(permissions, null, 2));

    // Test how merging actually works
    const result1 = await checkPermission({ tool: 'mcp' });
    const result2 = await checkPermission({ tool: 'tool2' });
    const result3 = await checkPermission({ tool: 'mcp', path: '/global/file' });
    const result4 = await checkPermission({ tool: 'mcp', path: '/project/file' });

    console.log('Merged config results:', { result1, result2, result3, result4 });
  });

  test('should analyze savePermissions and project API behavior', async () => {
    console.log('Testing savePermissions...');
    
    await setDefault('test_tool', 'confirm');
    
    const permissions1 = await getProjectPermissions();
    console.log('After setDefault:', JSON.stringify(permissions1, null, 2));

    await addPermissionRule({
      match: { tool: 'test_tool', path: '/test/*' },
      action: 'allow'
    });

    const permissions2 = await getProjectPermissions();
    console.log('After addPermissionRule:', JSON.stringify(permissions2, null, 2));

    // Check if file was created
    const configPath = path.join(tempProjectDir, '.plato', 'config.yaml');
    try {
      const fileContent = await fs.readFile(configPath, 'utf8');
      console.log('Config file content:', fileContent);
    } catch (error) {
      console.log('Config file error:', error instanceof Error ? error.message : String(error));
    }
  });

  test('should analyze rule matching behavior', async () => {
    await savePermissions({
      defaults: { test_tool: 'deny' },
      rules: [
        { match: { tool: 'test_tool', path: '/allow/*' }, action: 'allow' },
        { match: { tool: 'test_tool', command: 'safe_.*' }, action: 'allow' },
        { match: { tool: 'test_tool', path: '/deny/*' }, action: 'deny' }
      ]
    });

    const results = [];
    
    // Test path matching
    results.push(['path /allow/file', await checkPermission({ tool: 'test_tool', path: '/allow/file' })]);
    results.push(['path /deny/file', await checkPermission({ tool: 'test_tool', path: '/deny/file' })]);
    results.push(['path /other/file', await checkPermission({ tool: 'test_tool', path: '/other/file' })]);
    
    // Test command matching
    results.push(['command safe_op', await checkPermission({ tool: 'test_tool', command: 'safe_operation' })]);
    results.push(['command unsafe_op', await checkPermission({ tool: 'test_tool', command: 'unsafe_operation' })]);
    
    // Test no path/command
    results.push(['no path/command', await checkPermission({ tool: 'test_tool' })]);

    console.log('Rule matching results:', results);

    // Just verify tests run without crashing
    expect(results.length).toBe(6);
  });
});