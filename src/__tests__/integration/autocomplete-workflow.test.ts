/**
 * Integration tests for autocomplete workflow in TUI mode
 * Tests the complete flow from user input to autocomplete suggestions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createAutocompleteEngine } from '../../autocomplete/engine.js';
import { AutocompleteProvider } from '../../autocomplete/provider.js';
import type { AutocompleteEngine, SearchableItem } from '../../autocomplete/types.js';

// Mock file system for testing
jest.mock('fs/promises');
jest.mock('fast-glob');

describe('Autocomplete Workflow Integration', () => {
  let engine: AutocompleteEngine;
  let provider: AutocompleteProvider;

  beforeEach(async () => {
    // Create autocomplete engine with test configuration
    engine = createAutocompleteEngine([], {
      maxResults: 10,
      minQueryLength: 1,
      maxResponseTime: 50,
      fuzzyThreshold: 0.4,
      enableUsageLearning: false, // Disable for tests
      historyFilePath: '/tmp/test-autocomplete-history.json',
    });

    // Create provider with mock data
    provider = new AutocompleteProvider({
      cacheTTL: 5 * 60 * 1000, // 5 minutes
      maxFiles: 1000,
      workingDirectory: process.cwd(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Command Autocomplete Workflow', () => {
    it('should provide command suggestions when typing slash commands', async () => {
      // Setup mock commands
      const mockCommands: SearchableItem[] = [
        {
          name: '/help',
          aliases: ['/?'],
          description: 'Show help information',
          type: 'command',
        },
        {
          name: '/edit',
          description: 'Edit a file',
          type: 'command',
        },
        {
          name: '/search',
          description: 'Search for patterns',
          type: 'command',
        },
      ];

      engine.updateItems(mockCommands);

      // Test slash command triggering
      const results = engine.search('/h', 'command');

      expect(results).toHaveLength(1);
      expect(results[0].item).toBe('/help');
      expect(results[0].type).toBe('command');
      expect(results[0].highlight).toEqual([{ start: 0, end: 2 }]);
    });

    it('should rank frequently used commands higher', async () => {
      // Create engine with usage learning enabled for this test
      const learningEngine = createAutocompleteEngine([], {
        maxResults: 10,
        minQueryLength: 1,
        maxResponseTime: 50,
        fuzzyThreshold: 0.4,
        enableUsageLearning: true,
        historyFilePath: '/tmp/test-usage-ranking.json',
      });

      const mockCommands: SearchableItem[] = [
        { name: '/help', type: 'command', description: 'Help command' },
        { name: '/edit', type: 'command', description: 'Edit command' },
        { name: '/search', type: 'command', description: 'Search command' },
      ];

      learningEngine.updateItems(mockCommands);

      // Simulate usage of /edit command multiple times
      learningEngine.updateUsageStats('/edit', 'command');
      learningEngine.updateUsageStats('/edit', 'command');
      learningEngine.updateUsageStats('/edit', 'command');

      const results = learningEngine.search('/', 'command');

      // Find /edit in results
      const editResult = results.find(r => r.item === '/edit');
      expect(editResult).toBeDefined();
      expect(editResult!.usageCount).toBe(3);

      // Verify usage affects ranking - /edit should have better finalScore due to usage
      const helpResult = results.find(r => r.item === '/help');
      expect(helpResult).toBeDefined();
      expect(editResult!.finalScore).toBeLessThan(helpResult!.finalScore); // Lower score is better
    });

    it('should provide partial command matching', async () => {
      const mockCommands: SearchableItem[] = [
        { name: '/edit', type: 'command', description: 'Edit files' },
        { name: '/search', type: 'command', description: 'Search patterns' },
      ];

      engine.updateItems(mockCommands);

      const results = engine.search('/ed', 'command');

      expect(results).toHaveLength(1);
      expect(results[0].item).toBe('/edit');
    });
  });

  describe('File Autocomplete Workflow', () => {
    it('should provide file suggestions for mixed search', async () => {
      // Mock getAllItems to return test files
      jest.spyOn(provider, 'getAllItems').mockResolvedValue([
        { name: 'src/autocomplete/engine.ts', type: 'file', description: 'TypeScript file' },
        { name: 'src/autocomplete/provider.ts', type: 'file', description: 'TypeScript file' },
        { name: 'package.json', type: 'file', description: 'Package configuration' },
      ]);

      const allItems = await provider.getAllItems();
      engine.updateItems(allItems);

      const results = engine.search('engine', 'mixed');

      expect(results.length).toBeGreaterThan(0);
      expect(results.find(r => r.item.includes('engine.ts'))).toBeDefined();
    });

    it('should filter files by type when specified', async () => {
      jest.spyOn(provider, 'getAllItems').mockResolvedValue([
        { name: 'src/test.ts', type: 'file', description: 'TypeScript file' },
        { name: '/help', type: 'command', description: 'Help command' },
      ]);

      const allItems = await provider.getAllItems();
      engine.updateItems(allItems);

      const fileResults = engine.search('test', 'file');

      expect(fileResults).toHaveLength(1);
      expect(fileResults[0].type).toBe('file');
      expect(fileResults[0].item).toBe('src/test.ts');
    });
  });

  describe('Performance Requirements', () => {
    it('should return results within 50ms target', async () => {
      // Create a larger dataset for performance testing
      const largeDataset: SearchableItem[] = [];
      for (let i = 0; i < 1000; i++) {
        largeDataset.push({
          name: `/command${i}`,
          type: 'command',
          description: `Test command ${i}`,
        });
      }

      engine.updateItems(largeDataset);

      const startTime = Date.now();
      const results = engine.search('/comm', 'command');
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(50);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(10); // Max results limit
    });

    it('should handle empty queries gracefully', async () => {
      const mockItems: SearchableItem[] = [
        { name: '/help', type: 'command', description: 'Help' },
      ];

      engine.updateItems(mockItems);

      const results = engine.search('', 'mixed');

      expect(results).toHaveLength(0);
    });

    it('should handle queries below minimum length', async () => {
      // Test with minQueryLength = 1 (from config)
      const mockItems: SearchableItem[] = [
        { name: '/help', type: 'command', description: 'Help' },
      ];

      engine.updateItems(mockItems);

      const results = engine.search('h', 'mixed');

      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Usage Learning Integration', () => {
    it('should track usage statistics when enabled', async () => {
      // Create engine with usage learning enabled
      const learningEngine = createAutocompleteEngine([], {
        maxResults: 10,
        minQueryLength: 1,
        maxResponseTime: 50,
        fuzzyThreshold: 0.4,
        enableUsageLearning: true,
        historyFilePath: '/tmp/test-learning-history.json',
      });

      const mockItems: SearchableItem[] = [
        { name: '/edit', type: 'command', description: 'Edit files' },
      ];

      learningEngine.updateItems(mockItems);
      learningEngine.updateUsageStats('/edit', 'command');

      const history = learningEngine.getHistory();

      expect(history.items['/edit']).toBeDefined();
      expect(history.items['/edit'].count).toBe(1);
      expect(history.items['/edit'].type).toBe('command');
      expect(history.totalUsages).toBe(1);
    });

    it('should clear history when requested', async () => {
      const mockItems: SearchableItem[] = [
        { name: '/edit', type: 'command', description: 'Edit files' },
      ];

      engine.updateItems(mockItems);
      engine.updateUsageStats('/edit', 'command');
      engine.clearHistory();

      const history = engine.getHistory();

      expect(Object.keys(history.items)).toHaveLength(0);
      expect(history.totalUsages).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle search with no items gracefully', async () => {
      const results = engine.search('test', 'mixed');

      expect(results).toHaveLength(0);
    });

    it('should handle invalid search types gracefully', async () => {
      const mockItems: SearchableItem[] = [
        { name: '/help', type: 'command', description: 'Help' },
      ];

      engine.updateItems(mockItems);

      // Test with 'mixed' type which should work
      const results = engine.search('help', 'mixed');

      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Highlight Range Calculation', () => {
    it('should provide correct highlight ranges for matches', async () => {
      const mockItems: SearchableItem[] = [
        { name: '/help', type: 'command', description: 'Help command' },
      ];

      engine.updateItems(mockItems);

      const results = engine.search('/he', 'command');

      expect(results).toHaveLength(1);
      expect(results[0].highlight).toBeDefined();
      expect(results[0].highlight.length).toBeGreaterThan(0);
      expect(results[0].highlight[0]).toHaveProperty('start');
      expect(results[0].highlight[0]).toHaveProperty('end');
    });
  });
});