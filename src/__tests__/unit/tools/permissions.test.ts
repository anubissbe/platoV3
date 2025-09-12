import { setupTestEnvironment } from '../../helpers/test-cleanup.js';
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { 
  loadPermissions, 
  checkPermission, 
  savePermissions, 
  getProjectPermissions,
  setDefault,
  addPermissionRule,
  removePermissionRule,
  type Permissions,
  type Rule,
  type PermissionQuery
} from '../../../tools/permissions';

// Setup clean test environment
setupTestEnvironment({
  disableConsole: true,
  maxEventListeners: 10
});

jest.mock('fs/promises');
jest.mock('yaml');
jest.mock('../../../config');

describe('permissions', () => {
  const mockCwd = '/project';
  const projectConfigPath = path.join(mockCwd, '.plato', 'config.yaml');
  const globalConfigPath = path.join(process.env.HOME || '/home/user', '.config', 'plato', 'config.yaml');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    delete process.env.PLATO_SKIP_PERMISSIONS;
    
    // Setup YAML mocks
    (YAML.parse as jest.Mock).mockImplementation((text: string) => {
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    });
    (YAML.stringify as jest.Mock).mockImplementation((obj: any) => JSON.stringify(obj));

    // Setup fs mocks
    const mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.mkdir = jest.fn().mockResolvedValue(undefined);
    mockFs.writeFile = jest.fn().mockResolvedValue(undefined);
    mockFs.readFile = jest.fn().mockImplementation((filePath) => {
      return Promise.reject(new Error('ENOENT'));
    });

    // Mock config module
    const mockLoadConfig = require('../../../config').loadConfig;
    mockLoadConfig.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadPermissions', () => {
    it('should load and merge permissions from global and project configs', async () => {
      const globalConfig = { permissions: { defaults: { fs_patch: 'confirm' } } };
      const projectConfig = { 
        permissions: { 
          defaults: { mcp_tool: 'allow' },
          rules: [{ match: { tool: 'fs_patch' }, action: 'deny' }]
        } 
      };

      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockImplementation((filePath) => {
        if (filePath === globalConfigPath) {
          return Promise.resolve(JSON.stringify(globalConfig));
        } else if (filePath === projectConfigPath) {
          return Promise.resolve(JSON.stringify(projectConfig));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const permissions = await loadPermissions();

      expect(permissions.defaults?.fs_patch).toBe('confirm');
      expect(permissions.defaults?.mcp_tool).toBe('allow');
      expect(permissions.rules).toHaveLength(1);
      expect(permissions.rules?.[0].action).toBe('deny');
    });

    it('should handle missing config files gracefully', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const permissions = await loadPermissions();

      expect(permissions).toBeDefined();
      expect(permissions.defaults).toEqual({});
      expect(permissions.rules).toEqual([]);
    });

    it('should handle invalid YAML gracefully', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue('invalid: yaml: content');
      (YAML.parse as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid YAML');
      });

      const permissions = await loadPermissions();

      expect(permissions).toBeDefined();
      expect(permissions.defaults).toEqual({});
      expect(permissions.rules).toEqual([]);
    });
  });

  describe('checkPermission', () => {
    it('should return allow for skip permissions environment variable', async () => {
      process.env.PLATO_SKIP_PERMISSIONS = 'true';

      const result = await checkPermission({ tool: 'fs_patch' });

      expect(result).toBe('allow');
    });

    it('should return allow for dangerous mode in config', async () => {
      const mockLoadConfig = require('../../../config').loadConfig;
      mockLoadConfig.mockResolvedValue({
        privacy: { dangerous_mode: true }
      });

      const result = await checkPermission({ tool: 'fs_patch' });

      expect(result).toBe('allow');
    });

    it('should check rules in order and return first match', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        permissions: {
          rules: [
            { match: { tool: 'fs_patch' }, action: 'deny' },
            { match: { tool: 'fs_patch' }, action: 'allow' }
          ]
        }
      }));

      const mockLoadConfig = require('../../../config').loadConfig;
      mockLoadConfig.mockResolvedValue({});

      const result = await checkPermission({ tool: 'fs_patch' });

      expect(result).toBe('deny');
    });

    it('should use defaults when no rules match', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        permissions: {
          defaults: { fs_patch: 'confirm' },
          rules: [
            { match: { tool: 'other_tool' }, action: 'deny' }
          ]
        }
      }));

      const mockLoadConfig = require('../../../config').loadConfig;
      mockLoadConfig.mockResolvedValue({});

      const result = await checkPermission({ tool: 'fs_patch' });

      expect(result).toBe('confirm');
    });

    it('should default to allow when no rules or defaults match', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        permissions: {
          defaults: {},
          rules: []
        }
      }));

      const mockLoadConfig = require('../../../config').loadConfig;
      mockLoadConfig.mockResolvedValue({});

      const result = await checkPermission({ tool: 'unknown_tool' });

      expect(result).toBe('allow');
    });

    it('should match glob patterns correctly', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        permissions: {
          rules: [
            { match: { path: '/test/**' }, action: 'confirm' }
          ]
        }
      }));

      const mockLoadConfig = require('../../../config').loadConfig;
      mockLoadConfig.mockResolvedValue({});

      const result1 = await checkPermission({ tool: 'fs_patch', path: '/test/file.txt' });
      const result2 = await checkPermission({ tool: 'fs_patch', path: '/other/file.txt' });

      expect(result1).toBe('confirm');
      expect(result2).toBe('allow');
    });

    it('should match command patterns with regex', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        permissions: {
          rules: [
            { match: { command: 'rm.*' }, action: 'deny' }
          ]
        }
      }));

      const mockLoadConfig = require('../../../config').loadConfig;
      mockLoadConfig.mockResolvedValue({});

      const result = await checkPermission({ tool: 'bash', command: 'rm -rf /' });

      expect(result).toBe('deny');
    });
  });

  describe('savePermissions', () => {
    it('should save permissions to project config', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify({}));

      const permissions: Permissions = {
        defaults: { fs_patch: 'confirm' },
        rules: []
      };

      await savePermissions(permissions);

      expect(mockFs.mkdir).toHaveBeenCalledWith(path.dirname(projectConfigPath), { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle missing project config file', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const permissions: Permissions = {
        defaults: { fs_patch: 'confirm' },
        rules: []
      };

      await savePermissions(permissions);

      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('getProjectPermissions', () => {
    it('should return project permissions', async () => {
      const config = { permissions: { defaults: { fs_patch: 'confirm' }, rules: [] } };
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const permissions = await getProjectPermissions();

      expect(permissions).toEqual(config.permissions);
    });

    it('should return empty permissions when file does not exist', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const permissions = await getProjectPermissions();

      expect(permissions).toEqual({ defaults: {}, rules: [] });
    });
  });

  describe('setDefault', () => {
    it('should set default permission for a tool', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify({}));

      await setDefault('fs_patch', 'confirm');

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.permissions.defaults.fs_patch).toBe('confirm');
    });
  });

  describe('addPermissionRule', () => {
    it('should add a new rule to existing permissions', async () => {
      const existingConfig = { permissions: { defaults: {}, rules: [] } };
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));

      const newRule: Rule = { match: { tool: 'fs_patch' }, action: 'deny' };
      await addPermissionRule(newRule);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.permissions.rules).toHaveLength(1);
      expect(writtenData.permissions.rules[0]).toEqual(newRule);
    });
  });

  describe('removePermissionRule', () => {
    it('should remove rule at specified index', async () => {
      const existingConfig = {
        permissions: {
          defaults: {},
          rules: [
            { match: { tool: 'fs_patch' }, action: 'deny' },
            { match: { tool: 'mcp_tool' }, action: 'allow' }
          ]
        }
      };
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));

      await removePermissionRule(0);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.permissions.rules).toHaveLength(1);
      expect(writtenData.permissions.rules[0].match.tool).toBe('mcp_tool');
    });

    it('should handle invalid indices gracefully', async () => {
      const existingConfig = { permissions: { defaults: {}, rules: [] } };
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));

      await removePermissionRule(5);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.permissions.rules).toHaveLength(0);
    });
  });
});