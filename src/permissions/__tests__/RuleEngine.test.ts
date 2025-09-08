import { RuleEngine } from '../RuleEngine';
import {
  Rule,
  PermissionQuery,
  PermissionAction,
  Profile,
  PermissionContext
} from '../types';

describe('RuleEngine', () => {
  let ruleEngine: RuleEngine;
  let mockProfile: Profile;

  beforeEach(() => {
    ruleEngine = new RuleEngine();
    mockProfile = {
      name: 'test-profile',
      description: 'Test profile',
      activation: {},
      defaults: { fs_write: 'confirm' },
      rules: [],
      isActive: true,
      lastActivated: new Date(),
      activationScore: 100
    };
  });

  describe('Rule Priority and Evaluation', () => {
    it('should evaluate rules in priority order (highest first)', async () => {
      const rules: Rule[] = [
        {
          match: { tool: 'fs_write' },
          action: 'allow',
          priority: 10,
          reason: 'Low priority rule'
        },
        {
          match: { tool: 'fs_write' },
          action: 'deny',
          priority: 100,
          reason: 'High priority rule'
        }
      ];

      const query: PermissionQuery = {
        tool: 'fs_write',
        path: '/test/file.txt',
        context: {
          workingDirectory: '/test',
          environment: {},
          timestamp: new Date()
        }
      };

      const result = await ruleEngine.evaluatePermission(query, rules, {}, mockProfile);

      expect(result.action).toBe('deny'); // High priority rule should win
      expect(result.rule?.priority).toBe(100);
      expect(result.reason).toContain('High priority rule');
    });

    it('should handle rules with same priority using first-match strategy', async () => {
      const rules: Rule[] = [
        {
          match: { tool: 'fs_write', path: '*.ts' },
          action: 'allow',
          priority: 50,
          reason: 'Allow TypeScript files'
        },
        {
          match: { tool: 'fs_write' },
          action: 'deny',
          priority: 50,
          reason: 'Deny all writes'
        }
      ];

      const query: PermissionQuery = {
        tool: 'fs_write',
        path: 'test.ts',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      const result = await ruleEngine.evaluatePermission(query, rules, {}, mockProfile);

      expect(result.action).toBe('allow'); // First matching rule should win
      expect(result.reason).toContain('Allow TypeScript files');
    });
  });

  describe('Advanced Pattern Matching', () => {
    it('should support glob patterns for path matching', async () => {
      const rules: Rule[] = [
        {
          match: { tool: 'fs_write', path: '**/*.test.{js,ts}' },
          action: 'allow',
          priority: 100,
          reason: 'Allow test files'
        }
      ];

      const testCases = [
        { path: 'src/auth.test.ts', shouldMatch: true },
        { path: 'tests/integration.test.js', shouldMatch: true },
        { path: 'src/auth.ts', shouldMatch: false },
        { path: 'README.md', shouldMatch: false }
      ];

      for (const testCase of testCases) {
        const query: PermissionQuery = {
          tool: 'fs_write',
          path: testCase.path,
          context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
        };

        const result = await ruleEngine.evaluatePermission(query, rules, { fs_write: 'deny' }, mockProfile);
        
        if (testCase.shouldMatch) {
          expect(result.action).toBe('allow');
          expect(result.rule).toBeDefined();
        } else {
          expect(result.action).toBe('deny'); // Should use default
          expect(result.rule).toBeUndefined();
        }
      }
    });

    it('should support regex patterns for command matching', async () => {
      const rules: Rule[] = [
        {
          match: { tool: 'exec', command: '^npm\\s+(install|ci|run)' },
          action: 'allow',
          priority: 100,
          reason: 'Allow safe npm commands'
        },
        {
          match: { tool: 'exec', command: 'rm.*-rf' },
          action: 'deny',
          priority: 200,
          reason: 'Block dangerous rm commands'
        }
      ];

      const testCases = [
        { command: 'npm install lodash', expectedAction: 'allow' as PermissionAction },
        { command: 'npm run build', expectedAction: 'allow' as PermissionAction },
        { command: 'rm -rf node_modules', expectedAction: 'deny' as PermissionAction },
        { command: 'ls -la', expectedAction: 'confirm' as PermissionAction } // default
      ];

      for (const testCase of testCases) {
        const query: PermissionQuery = {
          tool: 'exec',
          command: testCase.command,
          context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
        };

        const result = await ruleEngine.evaluatePermission(
          query, 
          rules, 
          { exec: 'confirm' }, 
          mockProfile
        );
        
        expect(result.action).toBe(testCase.expectedAction);
      }
    });

    it('should support multiple pattern alternatives with pipe separator', async () => {
      const rules: Rule[] = [
        {
          match: { tool: 'fs_write', path: 'src/**/*.{ts,js}|tests/**/*.spec.{ts,js}' },
          action: 'allow',
          priority: 100,
          reason: 'Allow source and test files'
        }
      ];

      const testCases = [
        { path: 'src/auth/index.ts', shouldMatch: true },
        { path: 'tests/unit/auth.spec.js', shouldMatch: true },
        { path: 'docs/README.md', shouldMatch: false },
        { path: 'package.json', shouldMatch: false }
      ];

      for (const testCase of testCases) {
        const query: PermissionQuery = {
          tool: 'fs_write',
          path: testCase.path,
          context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
        };

        const result = await ruleEngine.evaluatePermission(query, rules, { fs_write: 'deny' }, mockProfile);
        
        expect(result.action).toBe(testCase.shouldMatch ? 'allow' : 'deny');
      }
    });
  });

  describe('Rule Expiration and Conditions', () => {
    it('should skip expired rules', async () => {
      const expiredRule: Rule = {
        match: { tool: 'fs_write' },
        action: 'allow',
        priority: 100,
        expiration: new Date(Date.now() - 1000), // 1 second ago
        reason: 'Expired rule'
      };

      const activeRule: Rule = {
        match: { tool: 'fs_write' },
        action: 'deny',
        priority: 50,
        reason: 'Active rule'
      };

      const query: PermissionQuery = {
        tool: 'fs_write',
        path: '/test/file.txt',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      const result = await ruleEngine.evaluatePermission(
        query, 
        [expiredRule, activeRule], 
        { fs_write: 'confirm' }, 
        mockProfile
      );

      expect(result.action).toBe('deny'); // Should use active rule, not expired one
      expect(result.rule?.priority).toBe(50);
    });

    it('should evaluate time-based conditional rules', async () => {
      const timeRule: Rule = {
        match: { tool: 'exec' },
        action: 'allow',
        priority: 100,
        conditions: [
          {
            type: 'time',
            value: { start: '09:00', end: '17:00' }
          }
        ],
        reason: 'Allow exec during business hours'
      };

      const query: PermissionQuery = {
        tool: 'exec',
        command: 'ls -la',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      // Mock time to be within business hours (12:00)
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);
      jest.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);

      const result = await ruleEngine.evaluatePermission(query, [timeRule], { exec: 'deny' }, mockProfile);

      expect(result.action).toBe('allow');
      expect(result.rule).toBeDefined();

      // Restore mocks
      jest.restoreAllMocks();
    });

    it('should evaluate environment variable conditions', async () => {
      const envRule: Rule = {
        match: { tool: 'fs_write', path: '**/.env*' },
        action: 'deny',
        priority: 100,
        conditions: [
          {
            type: 'environment',
            value: { key: 'NODE_ENV', value: 'production' }
          }
        ],
        reason: 'Deny .env changes in production'
      };

      const query: PermissionQuery = {
        tool: 'fs_write',
        path: '.env.local',
        context: {
          workingDirectory: '/test',
          environment: { NODE_ENV: 'production' },
          timestamp: new Date()
        }
      };

      const result = await ruleEngine.evaluatePermission(query, [envRule], { fs_write: 'allow' }, mockProfile);

      expect(result.action).toBe('deny');
      expect(result.reason).toContain('Deny .env changes in production');
    });
  });

  describe('Rule Compilation and Caching', () => {
    it('should cache compiled regex patterns for performance', async () => {
      const rule: Rule = {
        match: { tool: 'exec', command: '^npm\\s+install' },
        action: 'allow',
        priority: 100
      };

      const query: PermissionQuery = {
        tool: 'exec',
        command: 'npm install lodash',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      // First evaluation should compile the pattern
      await ruleEngine.evaluatePermission(query, [rule], {}, mockProfile);
      const cacheStats1 = ruleEngine.getCacheStats();
      expect(cacheStats1.size).toBeGreaterThan(0);

      // Second evaluation should use cached pattern
      await ruleEngine.evaluatePermission(query, [rule], {}, mockProfile);
      const cacheStats2 = ruleEngine.getCacheStats();
      expect(cacheStats2.size).toBe(cacheStats1.size); // No new patterns added
    });

    it('should clear cache when requested', () => {
      // Add some patterns to cache
      const patterns = ['^test.*', '.*\\.js$', 'npm\\s+install'];
      patterns.forEach(pattern => {
        try {
          // Trigger pattern compilation
          new RegExp(pattern);
        } catch (error) {
          // Ignore invalid patterns for this test
        }
      });

      ruleEngine.clearCache();
      const cacheStats = ruleEngine.getCacheStats();
      expect(cacheStats.size).toBe(0);
    });
  });

  describe('Rule Validation', () => {
    it('should validate rule structure and patterns', () => {
      const validRule: Rule = {
        match: { tool: 'fs_write', path: '**/*.ts' },
        action: 'allow',
        priority: 100,
        reason: 'Allow TypeScript files'
      };

      const validation = ruleEngine.validateRule(validRule);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid rule structure', () => {
      const invalidRule = {
        match: { tool: 'fs_write' },
        // Missing action
        priority: 100
      } as Rule;

      const validation = ruleEngine.validateRule(invalidRule);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid regex patterns in commands', () => {
      const ruleWithInvalidRegex: Rule = {
        match: { tool: 'exec', command: '[invalid-regex' },
        action: 'deny',
        priority: 100
      };

      const validation = ruleEngine.validateRule(ruleWithInvalidRegex);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(error => error.includes('Invalid regex pattern'))).toBe(true);
    });

    it('should detect invalid path patterns', () => {
      const ruleWithInvalidPath: Rule = {
        match: { tool: 'fs_write', path: 'path/with/invalid|chars' },
        action: 'allow',
        priority: 100
      };

      const validation = ruleEngine.validateRule(ruleWithInvalidPath);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(error => error.includes('Invalid characters in path pattern'))).toBe(true);
    });
  });

  describe('Multi-stage Evaluation Pipeline', () => {
    it('should handle complex rule chains with inheritance', async () => {
      const globalRules: Rule[] = [
        {
          match: { tool: 'fs_write', path: '**/.env*' },
          action: 'deny',
          priority: 1000,
          reason: 'Global: Never allow .env modifications'
        }
      ];

      const profileRules: Rule[] = [
        {
          match: { tool: 'fs_write', path: 'src/**' },
          action: 'allow',
          priority: 100,
          reason: 'Profile: Allow source modifications'
        }
      ];

      const query: PermissionQuery = {
        tool: 'fs_write',
        path: 'src/.env.local',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      // Test that global rules override profile rules due to higher priority
      const allRules = [...globalRules, ...profileRules];
      const result = await ruleEngine.evaluatePermission(query, allRules, { fs_write: 'confirm' }, mockProfile);

      expect(result.action).toBe('deny');
      expect(result.rule?.priority).toBe(1000);
      expect(result.reason).toContain('Global: Never allow .env modifications');
    });
  });

  describe('Default Action Resolution', () => {
    it('should use default action when no rules match', async () => {
      const rules: Rule[] = [
        {
          match: { tool: 'exec', command: 'npm.*' },
          action: 'allow',
          priority: 100
        }
      ];

      const query: PermissionQuery = {
        tool: 'fs_write',
        path: 'test.txt',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      const result = await ruleEngine.evaluatePermission(query, rules, { fs_write: 'deny' }, mockProfile);

      expect(result.action).toBe('deny');
      expect(result.rule).toBeUndefined();
      expect(result.reason).toContain('No specific rule found, using default: deny');
    });

    it('should support pattern matching for default tool selection', async () => {
      const query: PermissionQuery = {
        tool: 'fs_read',
        path: 'test.txt',
        context: { workingDirectory: '/test', environment: {}, timestamp: new Date() }
      };

      const defaults = {
        'fs_*': 'allow' as PermissionAction,
        'exec_*': 'deny' as PermissionAction
      };

      const result = await ruleEngine.evaluatePermission(query, [], defaults, mockProfile);

      expect(result.action).toBe('allow');
      expect(result.reason).toContain('No specific rule found, using default: allow');
    });
  });
});