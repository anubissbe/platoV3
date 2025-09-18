/**
 * Unit tests for autocomplete engine
 * Tests fuzzy search, usage learning, and performance requirements
 */

import { jest } from "@jest/globals";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createAutocompleteEngine } from "../../engine.js";
import type { SearchableItem, AutocompleteConfig } from "../../types.js";

// Mock file system operations
jest.mock("node:fs/promises");
const mockFs = fs as jest.Mocked<typeof fs>;

describe("AutocompleteEngine", () => {
  const testItems: SearchableItem[] = [
    {
      name: "help",
      aliases: ["h", "?"],
      description: "Show help information",
      type: "command",
    },
    {
      name: "edit",
      aliases: ["e"],
      description: "Edit files",
      type: "command",
    },
    {
      name: "search",
      aliases: ["find", "grep"],
      description: "Search for text",
      type: "command",
    },
    {
      name: "package.json",
      description: "Package configuration",
      type: "file",
    },
    {
      name: "src/main.ts",
      description: "Main source file",
      type: "file",
    },
    {
      name: "src/helper.ts",
      description: "Helper utilities",
      type: "file",
    },
  ];

  const testConfig: Partial<AutocompleteConfig> = {
    historyFilePath: "/tmp/test-autocomplete-history.json",
    maxResults: 5,
    maxResponseTime: 50,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock file system operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readFile.mockRejectedValue({ code: "ENOENT" }); // File doesn't exist
    mockFs.writeFile.mockResolvedValue();
  });

  describe("Basic Search Functionality", () => {
    test("should return empty results for empty query", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);
      const results = engine.search("", "mixed");
      expect(results).toHaveLength(0);
    });

    test("should return exact matches with high scores", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);
      const results = engine.search("help", "command");

      expect(results).toHaveLength(1);
      expect(results[0].item).toBe("help");
      expect(results[0].type).toBe("command");
      expect(results[0].score).toBeLessThan(0.1); // Very good match
    });

    test("should return fuzzy matches for partial queries", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);
      const results = engine.search("hel", "command");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item).toBe("help");
    });

    test("should search by aliases", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);
      const results = engine.search("?", "command");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item).toBe("help");
    });

    test("should filter by type", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);

      const commandResults = engine.search("e", "command");
      const fileResults = engine.search("src", "file");

      expect(commandResults.every(r => r.type === "command")).toBe(true);
      expect(fileResults.every(r => r.type === "file")).toBe(true);
    });

    test("should return mixed results for mixed type", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);
      const results = engine.search("s", "mixed");

      const hasCommands = results.some(r => r.type === "command");
      const hasFiles = results.some(r => r.type === "file");
      expect(hasCommands || hasFiles).toBe(true);
    });
  });

  describe("Performance Requirements", () => {
    test("should complete search within 50ms", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);

      const startTime = Date.now();
      engine.search("hel", "mixed");
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(50);
    });

    test("should handle large datasets efficiently", () => {
      // Create large dataset
      const largeItems: SearchableItem[] = [];
      for (let i = 0; i < 1000; i++) {
        largeItems.push({
          name: `command-${i}`,
          description: `Test command ${i}`,
          type: "command",
        });
      }

      const engine = createAutocompleteEngine(largeItems, testConfig);

      const startTime = Date.now();
      const results = engine.search("command", "command");
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(50);
      expect(results.length).toBeLessThanOrEqual(5); // Respects maxResults
    });
  });

  describe("Usage Pattern Learning", () => {
    test("should track usage statistics", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);

      // Initially no usage
      let history = engine.getHistory();
      expect(history.totalUsages).toBe(0);

      // Use an item
      engine.updateUsageStats("help", "command");

      history = engine.getHistory();
      expect(history.totalUsages).toBe(1);
      expect(history.items["help"]).toBeDefined();
      expect(history.items["help"].count).toBe(1);
      expect(history.items["help"].type).toBe("command");
    });

    test("should prioritize frequently used items", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);

      // Use "edit" command multiple times
      for (let i = 0; i < 5; i++) {
        engine.updateUsageStats("edit", "command");
      }

      // Use "help" command once
      engine.updateUsageStats("help", "command");

      // Search for "e" - should prioritize "edit" due to usage
      const results = engine.search("e", "command");
      expect(results[0].item).toBe("edit");
      expect(results[0].usageCount).toBe(5);
    });

    test("should save usage history to file", async () => {
      const engine = createAutocompleteEngine(testItems, testConfig);

      engine.updateUsageStats("help", "command");

      // Wait for async save to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        testConfig.historyFilePath,
        expect.stringContaining('"help"'),
        "utf8"
      );
    });

    test("should load existing usage history", async () => {
      const mockHistoryData = {
        items: {
          "help": {
            count: 3,
            lastUsed: "2023-01-01T00:00:00.000Z",
            type: "command",
          },
        },
        totalUsages: 3,
        lastUpdated: "2023-01-01T00:00:00.000Z",
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockHistoryData));

      const engine = createAutocompleteEngine(testItems, testConfig);

      // Wait for async load to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      const history = engine.getHistory();
      expect(history.items["help"]).toBeDefined();
      expect(history.items["help"].count).toBe(3);
    });

    test("should clear usage history", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);

      engine.updateUsageStats("help", "command");
      expect(engine.getHistory().totalUsages).toBe(1);

      engine.clearHistory();
      expect(engine.getHistory().totalUsages).toBe(0);
      expect(Object.keys(engine.getHistory().items)).toHaveLength(0);
    });
  });

  describe("Scoring Algorithm", () => {
    test("should calculate final scores correctly", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);

      const results = engine.search("h", "command");

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.finalScore).toBeGreaterThan(0);
        expect(result.score).toBeGreaterThanOrEqual(0);
      });
    });

    test("should sort results by final score", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);

      const results = engine.search("e", "mixed");

      if (results.length > 1) {
        for (let i = 1; i < results.length; i++) {
          expect(results[i].finalScore).toBeGreaterThanOrEqual(results[i - 1].finalScore);
        }
      }
    });
  });

  describe("Highlight Ranges", () => {
    test("should provide highlight ranges for matches", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);
      const results = engine.search("hel", "command");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].highlight).toBeDefined();
      expect(Array.isArray(results[0].highlight)).toBe(true);
    });

    test("should have valid highlight range indices", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);
      const results = engine.search("help", "command");

      if (results.length > 0 && results[0].highlight.length > 0) {
        const highlight = results[0].highlight[0];
        expect(highlight.start).toBeGreaterThanOrEqual(0);
        expect(highlight.end).toBeGreaterThan(highlight.start);
        expect(highlight.end).toBeLessThanOrEqual(results[0].item.length);
      }
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty items array", () => {
      const engine = createAutocompleteEngine([], testConfig);
      const results = engine.search("test", "mixed");
      expect(results).toHaveLength(0);
    });

    test("should handle special characters in query", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);
      const results = engine.search("@#$%", "mixed");
      expect(Array.isArray(results)).toBe(true);
    });

    test("should handle very long queries", () => {
      const engine = createAutocompleteEngine(testItems, testConfig);
      const longQuery = "a".repeat(1000);
      const results = engine.search(longQuery, "mixed");
      expect(Array.isArray(results)).toBe(true);
    });

    test("should handle file system errors gracefully", async () => {
      mockFs.writeFile.mockRejectedValue(new Error("Permission denied"));

      const engine = createAutocompleteEngine(testItems, testConfig);

      // Should not throw error
      expect(() => {
        engine.updateUsageStats("help", "command");
      }).not.toThrow();
    });
  });

  describe("Configuration", () => {
    test("should respect maxResults configuration", () => {
      const config = { ...testConfig, maxResults: 2 };
      const engine = createAutocompleteEngine(testItems, config);

      const results = engine.search("", "mixed"); // This should return 0 due to minQueryLength
      expect(results.length).toBeLessThanOrEqual(2);

      const results2 = engine.search("s", "mixed");
      expect(results2.length).toBeLessThanOrEqual(2);
    });

    test("should respect minQueryLength configuration", () => {
      const config = { ...testConfig, minQueryLength: 3 };
      const engine = createAutocompleteEngine(testItems, config);

      const shortResults = engine.search("he", "mixed");
      expect(shortResults).toHaveLength(0);

      const longResults = engine.search("hel", "mixed");
      expect(longResults.length).toBeGreaterThan(0);
    });

    test("should disable usage learning when configured", () => {
      const config = { ...testConfig, enableUsageLearning: false };
      const engine = createAutocompleteEngine(testItems, config);

      engine.updateUsageStats("help", "command");

      const history = engine.getHistory();
      expect(history.totalUsages).toBe(0);
    });
  });
});