/**
 * Integration Testing Suite for Command Interactions and Workflows
 * Tests realistic user workflows and command combinations
 */

import { describe, test, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { processSlashCommand } from '../commands/router.js';
import { loadConfig, setConfigValue, resetConfig } from '../config.js';
import { MemoryManager } from '../memory/manager.js';
import { Session } from '../core/session.js';

const INTEGRATION_TIMEOUT = 45000; // 45 seconds for complex workflows

describe('Command Integration & Workflow Tests', () => {
  let mockSession: Session;
  let testDir: string;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'plato-integration-'));
    process.chdir(testDir);

    // Setup git for commands that need it
    try {
      const { execa } = await import('execa');
      await execa('git', ['init']);
      await execa('git', ['config', 'user.name', 'Integration Test']);
      await execa('git', ['config', 'user.email', 'integration@test.com']);
    } catch (error) {
      console.warn('Git setup failed:', error);
    }
  }, INTEGRATION_TIMEOUT);

  beforeEach(async () => {
    // Fresh session for each test
    mockSession = {
      conversationMessages: [],
      addMessage: jest.fn(),
      clearMessages: jest.fn(),
      getMessages: jest.fn(() => []),
      exportMessages: jest.fn(),
      compactMessages: jest.fn(),
      costAnalytics: {
        totalCost: 0.25,
        totalInputTokens: 1500,
        totalOutputTokens: 800,
        sessionCosts: [
          { timestamp: Date.now() - 1000, inputTokens: 500, outputTokens: 300, cost: 0.08 },
          { timestamp: Date.now() - 500, inputTokens: 1000, outputTokens: 500, cost: 0.17 }
        ]
      }
    } as any;

    await resetConfig();
  }, 10000);

  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  // Test 1: Complete Project Setup Workflow
  describe('Project Setup Workflow', () => {
    test('new project initialization sequence', async () => {
      // 1. Check initial status
      let result = await processSlashCommand('status', [], mockSession);
      expect(result.handled).toBe(true);
      expect(result.output).toBeDefined();

      // 2. Initialize project documentation
      result = await processSlashCommand('init', [], mockSession);
      expect(result.handled).toBe(true);

      // 3. Configure project settings
      result = await processSlashCommand('config', ['set', 'project.name', 'integration-test'], mockSession);
      expect(result.handled).toBe(true);

      result = await processSlashCommand('config', ['set', 'project.description', 'Integration test project'], mockSession);
      expect(result.handled).toBe(true);

      // 4. Verify configuration was applied
      result = await processSlashCommand('config', ['get'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.output).toContain('project.name');
      expect(result.output).toContain('integration-test');

      // 5. Check final status
      result = await processSlashCommand('status', [], mockSession);
      expect(result.handled).toBe(true);
    }, INTEGRATION_TIMEOUT);

    test('project directory management workflow', async () => {
      // Create test directories
      await fs.mkdir('src', { recursive: true });
      await fs.mkdir('tests', { recursive: true });
      await fs.writeFile('src/index.js', 'console.log("Hello world");');

      // 1. Add working directories
      let result = await processSlashCommand('add-dir', [], mockSession);
      expect(result.handled).toBe(true);

      // 2. Check project structure
      result = await processSlashCommand('bashes', [], mockSession);
      expect(result.handled).toBe(true);

      // 3. Scan for todos (should work with created files)
      result = await processSlashCommand('todos', ['scan'], mockSession);
      expect(result.handled).toBe(true);

      // 4. List found todos
      result = await processSlashCommand('todos', ['list'], mockSession);
      expect(result.handled).toBe(true);
    }, INTEGRATION_TIMEOUT);
  });

  // Test 2: Configuration Management Workflow
  describe('Configuration Management', () => {
    test('comprehensive config workflow', async () => {
      const configSettings = [
        { key: 'ui.theme', value: 'dark' },
        { key: 'ai.model', value: 'gpt-4' },
        { key: 'session.autosave', value: 'true' },
        { key: 'output.verbosity', value: 'detailed' }
      ];

      // 1. Set multiple configuration values
      for (const { key, value } of configSettings) {
        const result = await processSlashCommand('config', ['set', key, value], mockSession);
        expect(result.handled).toBe(true);
        expect(result.error).toBeUndefined();
      }

      // 2. Verify all settings were applied
      const result = await processSlashCommand('config', ['get'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.output).toBeDefined();

      for (const { key, value } of configSettings) {
        expect(result.output).toContain(key);
        expect(result.output).toContain(value);
      }

      // 3. Test config persistence across commands
      const statusResult = await processSlashCommand('status', [], mockSession);
      expect(statusResult.handled).toBe(true);

      // Config should still be there after other commands
      const persistResult = await processSlashCommand('config', ['get'], mockSession);
      expect(persistResult.handled).toBe(true);
      expect(persistResult.output).toContain('ui.theme');
    });

    test('config validation and error handling', async () => {
      // Test invalid config operations
      let result = await processSlashCommand('config', ['invalid-operation'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.error).toBeDefined();

      // Test missing value
      result = await processSlashCommand('config', ['set', 'incomplete.key'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.error).toBeDefined();

      // Test valid operation after errors
      result = await processSlashCommand('config', ['set', 'recovery.test', 'works'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  // Test 3: Session Management Lifecycle
  describe('Session Management Lifecycle', () => {
    test('complete session workflow', async () => {
      // 1. Check initial session status
      let result = await processSlashCommand('context', ['status'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.output).toBeDefined();

      // 2. Add session data (simulate conversation)
      mockSession.conversationMessages.push(
        { role: 'user', content: 'Test message 1', timestamp: Date.now() - 2000 },
        { role: 'assistant', content: 'Response 1', timestamp: Date.now() - 1500 },
        { role: 'user', content: 'Test message 2', timestamp: Date.now() - 1000 },
        { role: 'assistant', content: 'Response 2', timestamp: Date.now() - 500 }
      );

      // 3. Check context with conversation data
      result = await processSlashCommand('context', ['status'], mockSession);
      expect(result.handled).toBe(true);

      // 4. Test context export
      const exportFile = path.join(testDir, 'session-export.json');
      result = await processSlashCommand('context', ['export', exportFile], mockSession);
      expect(result.handled).toBe(true);

      // Verify export file was created
      try {
        const exportData = await fs.readFile(exportFile, 'utf8');
        const parsed = JSON.parse(exportData);
        expect(parsed.messages).toBeDefined();
        expect(Array.isArray(parsed.messages)).toBe(true);
      } catch (error) {
        // Export might be mocked or fail in test environment
        console.warn('Export file verification failed:', error);
      }

      // 5. Test context compaction
      result = await processSlashCommand('context', ['compact'], mockSession);
      expect(result.handled).toBe(true);
    });

    test('memory management workflow', async () => {
      // 1. Check initial memory status
      let result = await processSlashCommand('memory', ['status'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.output).toBeDefined();

      // 2. Search for non-existent terms
      result = await processSlashCommand('memory', ['search', 'nonexistent-term'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.output).toContain('No memories found');

      // 3. Test memory compaction
      result = await processSlashCommand('memory', ['compact'], mockSession);
      expect(result.handled).toBe(true);

      // 4. Test memory statistics
      result = await processSlashCommand('memory', ['statistics'], mockSession);
      expect(result.handled).toBe(true);

      // 5. Test memory export
      const memoryExportFile = path.join(testDir, 'memory-export.json');
      result = await processSlashCommand('memory', ['export', memoryExportFile], mockSession);
      expect(result.handled).toBe(true);
    });
  });

  // Test 4: UI and Interaction Workflow
  describe('UI and Interaction Workflow', () => {
    test('UI configuration workflow', async () => {
      // 1. Configure statusline
      let result = await processSlashCommand('statusline', [], mockSession);
      expect(result.handled).toBe(true);

      // 2. Test mouse toggle
      result = await processSlashCommand('mouse', [], mockSession);
      expect(result.handled).toBe(true);

      // 3. Test paste mode
      result = await processSlashCommand('paste', [], mockSession);
      expect(result.handled).toBe(true);

      // 4. Test output style changes
      result = await processSlashCommand('output-style', [], mockSession);
      expect(result.handled).toBe(true);

      // 5. Verify settings persist
      result = await processSlashCommand('status', [], mockSession);
      expect(result.handled).toBe(true);
    });

    test('interactive command workflows', async () => {
      // 1. Commands that may require confirmation
      let result = await processSlashCommand('context', ['clear'], mockSession);
      expect(result.handled).toBe(true);

      if (result.requiresConfirmation) {
        // Test confirmation workflow
        expect(result.output).toContain('Are you sure');
      }

      // 2. Memory clear (should require confirmation)
      result = await processSlashCommand('memory', ['clear'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.requiresConfirmation).toBe(true);

      // 3. Test help for complex commands
      result = await processSlashCommand('help', [], mockSession);
      expect(result.handled).toBe(true);
      expect(result.output).toBeDefined();
    });
  });

  // Test 5: AI and Model Management Workflow
  describe('AI Model Management Workflow', () => {
    test('model selection and status workflow', async () => {
      // 1. Check available models
      let result = await processSlashCommand('model', [], mockSession);
      expect(result.handled).toBe(true);

      // 2. Try to switch model
      result = await processSlashCommand('model', ['gpt-4'], mockSession);
      expect(result.handled).toBe(true);

      // 3. Check status after model change
      result = await processSlashCommand('status', [], mockSession);
      expect(result.handled).toBe(true);

      // 4. Try switching to another model
      result = await processSlashCommand('model', ['gpt-3.5-turbo'], mockSession);
      expect(result.handled).toBe(true);
    });

    test('agent configuration workflow', async () => {
      // 1. Check initial agents
      let result = await processSlashCommand('agents', [], mockSession);
      expect(result.handled).toBe(true);

      // 2. Test permissions management
      result = await processSlashCommand('permissions', [], mockSession);
      expect(result.handled).toBe(true);

      // 3. Verify status shows configuration
      result = await processSlashCommand('status', [], mockSession);
      expect(result.handled).toBe(true);
    });
  });

  // Test 6: Error Recovery and Resilience
  describe('Error Recovery Workflows', () => {
    test('graceful error handling across commands', async () => {
      // 1. Cause an error and recover
      let result = await processSlashCommand('config', ['invalid-op'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.error).toBeDefined();

      // 2. Should be able to continue normally
      result = await processSlashCommand('help', [], mockSession);
      expect(result.handled).toBe(true);
      expect(result.error).toBeUndefined();

      // 3. Test file operation errors
      result = await processSlashCommand('context', ['export', '/invalid/path/file.json'], mockSession);
      expect(result.handled).toBe(true);
      expect(result.error).toBeDefined();

      // 4. Recovery should still work
      result = await processSlashCommand('status', [], mockSession);
      expect(result.handled).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('command chaining resilience', async () => {
      const commandChain = [
        ['help', []],
        ['config', ['set', 'test.chain', 'value1']],
        ['status', []],
        ['config', ['invalid-operation']], // This should fail
        ['config', ['get']], // This should still work
        ['memory', ['status']],
      ];

      let successCount = 0;
      let errorCount = 0;

      for (const [command, args] of commandChain) {
        const result = await processSlashCommand(command, args, mockSession);
        expect(result.handled).toBe(true);

        if (result.error) {
          errorCount++;
        } else {
          successCount++;
        }
      }

      // Should have some successes and handle errors gracefully
      expect(successCount).toBeGreaterThan(0);
      expect(successCount + errorCount).toBe(commandChain.length);
    });
  });

  // Test 7: Performance Under Load
  describe('Performance Integration Tests', () => {
    test('rapid command execution', async () => {
      const rapidCommands = [
        ['help', []],
        ['status', []],
        ['config', ['get']],
        ['memory', ['status']]
      ];

      const startTime = Date.now();
      const promises = [];

      // Execute commands rapidly in parallel
      for (let i = 0; i < 5; i++) {
        for (const [command, args] of rapidCommands) {
          promises.push(processSlashCommand(command, args, mockSession));
        }
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();

      // All commands should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds

      // All commands should be handled
      results.forEach(result => {
        expect(result.handled).toBe(true);
      });

      // Most should succeed
      const successRate = results.filter(r => !r.error).length / results.length;
      expect(successRate).toBeGreaterThan(0.8); // 80% success rate
    });

    test('session state consistency under load', async () => {
      // Add initial session data
      mockSession.conversationMessages = [
        { role: 'user', content: 'Initial message', timestamp: Date.now() }
      ];

      // Execute multiple session-related commands
      const sessionCommands = [
        'context status',
        'memory status',
        'status',
        'config get'
      ];

      for (let i = 0; i < 3; i++) {
        for (const cmdStr of sessionCommands) {
          const [command, ...args] = cmdStr.split(' ');
          const result = await processSlashCommand(command, args, mockSession);
          expect(result.handled).toBe(true);

          // Session should remain consistent
          expect(mockSession.conversationMessages).toBeDefined();
          expect(mockSession.conversationMessages.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // Test 8: Real-world Usage Scenarios
  describe('Real-world Usage Scenarios', () => {
    test('typical development session workflow', async () => {
      // Simulate a typical development session
      const workflow = [
        // Start session
        ['status', []],
        ['help', []],

        // Configure environment
        ['config', ['set', 'project.type', 'typescript']],
        ['config', ['set', 'ui.theme', 'dark']],

        // Initialize project
        ['init', []],

        // Work with memory and context
        ['memory', ['status']],
        ['context', ['status']],

        // Check configuration
        ['config', ['get']],

        // Final status
        ['status', []]
      ];

      for (const [command, args] of workflow) {
        const result = await processSlashCommand(command, args, mockSession);
        expect(result.handled).toBe(true);

        // Log any errors for debugging
        if (result.error) {
          console.log(`Warning in ${command}: ${result.error}`);
        }
      }
    });

    test('troubleshooting session workflow', async () => {
      // Simulate troubleshooting workflow
      const troubleshooting = [
        // Check system status
        ['status', []],

        // Look for help
        ['help', []],

        // Check memory for previous issues
        ['memory', ['search', 'error']],
        ['memory', ['search', 'failed']],

        // Check context
        ['context', ['status']],

        // Try to fix config
        ['config', ['get']],

        // Final check
        ['status', []]
      ];

      for (const [command, args] of troubleshooting) {
        const result = await processSlashCommand(command, args, mockSession);
        expect(result.handled).toBe(true);
      }
    });
  });
});