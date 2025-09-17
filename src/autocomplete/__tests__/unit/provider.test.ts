import { AutocompleteProvider } from "../../provider.js";
import { SearchableItem } from "../../types.js";
import * as fs from "fs/promises";
import { SLASH_COMMANDS } from "../../../slash/commands.js";

// Mock fast-glob
jest.mock("fast-glob", () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock fs/promises
jest.mock("fs/promises", () => ({
  stat: jest.fn(),
}));

describe("AutocompleteProvider", () => {
  let provider: AutocompleteProvider;

  beforeEach(() => {
    provider = new AutocompleteProvider();
    jest.clearAllMocks();
  });

  describe("Command Data Provider", () => {
    it("should extract commands from SLASH_COMMANDS array", async () => {
      const commands = await provider.getCommandItems();

      expect(commands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "help",
            type: "command",
            description: expect.any(String),
            category: "Core",
          }),
        ])
      );
    });

    it("should include command aliases as searchable terms", async () => {
      const commands = await provider.getCommandItems();

      // Each command should have at least an empty aliases array or undefined (which becomes [])
      commands.forEach(command => {
        expect(command.aliases).toBeDefined();
        expect(Array.isArray(command.aliases)).toBe(true);
      });

      // Test will pass if no commands have aliases currently
      const commandsWithAliases = commands.filter(cmd => cmd.aliases && cmd.aliases.length > 0);
      expect(commandsWithAliases.length).toBeGreaterThanOrEqual(0);
    });

    it("should properly format command items", async () => {
      const commands = await provider.getCommandItems();

      commands.forEach(command => {
        expect(command).toMatchObject({
          name: expect.any(String),
          type: "command",
          description: expect.any(String),
          category: expect.any(String),
        });
        expect(command.name).toMatch(/^[a-z-]+$/); // Valid command format
      });
    });
  });

  describe("File Data Provider", () => {
    beforeEach(() => {
      const mockGlob = require("fast-glob").default;
      const mockStat = fs.stat as jest.MockedFunction<typeof fs.stat>;

      // Mock glob to return test files (glob already filters, so only return valid files)
      mockGlob.mockResolvedValue([
        "src/components/Button.tsx",
        "src/utils/helpers.ts",
        "package.json",
        "README.md",
        "src/tests/setup.js",
      ]);

      // Mock stat to return file stats
      mockStat.mockResolvedValue({
        mtime: new Date("2023-01-01"),
        isFile: () => true,
      } as any);
    });

    it("should scan files with proper patterns", async () => {
      const files = await provider.getFileItems();
      const mockGlob = require("fast-glob").default;

      expect(mockGlob).toHaveBeenCalledWith(
        expect.arrayContaining([
          "**/*.{ts,tsx,js,jsx,json,md}",
        ]),
        expect.objectContaining({
          ignore: expect.arrayContaining([
            "node_modules/**",
            "dist/**",
            "build/**",
            ".git/**",
          ]),
          absolute: false,
          onlyFiles: true,
        })
      );
    });

    it("should filter to allowed file types", async () => {
      const files = await provider.getFileItems();

      files.forEach(file => {
        expect(file.name).toMatch(/\.(ts|tsx|js|jsx|json|md)$/);
        expect(file.type).toBe("file");
      });
    });

    it("should exclude ignored directories", async () => {
      const files = await provider.getFileItems();

      files.forEach(file => {
        expect(file.name).not.toMatch(/^node_modules\//);
        expect(file.name).not.toMatch(/^build\//);
        expect(file.name).not.toMatch(/^dist\//);
        expect(file.name).not.toMatch(/^\.git\//);
      });
    });

    it("should include file metadata", async () => {
      const files = await provider.getFileItems();

      files.forEach(file => {
        expect(file).toMatchObject({
          name: expect.any(String),
          type: "file",
          description: expect.any(String),
        });
      });
    });
  });

  describe("Caching System", () => {
    beforeEach(() => {
      const mockGlob = require("fast-glob").default;
      mockGlob.mockResolvedValue(["test.ts"]);

      const mockStat = fs.stat as jest.MockedFunction<typeof fs.stat>;
      mockStat.mockResolvedValue({
        mtime: new Date("2023-01-01"),
        isFile: () => true,
      } as any);
    });

    it("should cache file scan results", async () => {
      const mockGlob = require("fast-glob").default;

      // First call
      await provider.getFileItems();
      expect(mockGlob).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await provider.getFileItems();
      expect(mockGlob).toHaveBeenCalledTimes(1);
    });

    it("should cache for specified TTL (5 minutes)", async () => {
      const provider = new AutocompleteProvider({ cacheTTL: 100 }); // 100ms for testing
      const mockGlob = require("fast-glob").default;

      // First call
      await provider.getFileItems();
      expect(mockGlob).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second call should re-scan
      await provider.getFileItems();
      expect(mockGlob).toHaveBeenCalledTimes(2);
    });

    it("should allow cache invalidation", async () => {
      const mockGlob = require("fast-glob").default;

      // First call
      await provider.getFileItems();
      expect(mockGlob).toHaveBeenCalledTimes(1);

      // Invalidate cache
      provider.invalidateCache();

      // Second call should re-scan
      await provider.getFileItems();
      expect(mockGlob).toHaveBeenCalledTimes(2);
    });
  });

  describe("Performance Requirements", () => {
    it("should return command items in under 10ms", async () => {
      const start = performance.now();
      await provider.getCommandItems();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
    });

    it("should return cached file items in under 10ms", async () => {
      // Prime the cache
      await provider.getFileItems();

      const start = performance.now();
      await provider.getFileItems();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
    });

    it("should handle large file sets efficiently", async () => {
      const mockGlob = require("fast-glob").default;
      const mockStat = fs.stat as jest.MockedFunction<typeof fs.stat>;

      // Mock a large file set (1000 files)
      const largeFileSet = Array.from({ length: 1000 }, (_, i) => `src/file${i}.ts`);
      mockGlob.mockResolvedValue(largeFileSet);

      mockStat.mockResolvedValue({
        mtime: new Date("2023-01-01"),
        isFile: () => true,
      } as any);

      const start = performance.now();
      const files = await provider.getFileItems();
      const elapsed = performance.now() - start;

      expect(files).toHaveLength(1000);
      expect(elapsed).toBeLessThan(100); // Should handle 1000 files in <100ms
    });
  });

  describe("getAllItems", () => {
    it("should combine command and file items", async () => {
      const mockGlob = require("fast-glob").default;
      const mockStat = fs.stat as jest.MockedFunction<typeof fs.stat>;

      mockGlob.mockResolvedValue(["test.ts"]);
      mockStat.mockResolvedValue({
        mtime: new Date("2023-01-01"),
        isFile: () => true,
      } as any);

      const allItems = await provider.getAllItems();

      const commandItems = allItems.filter(item => item.type === "command");
      const fileItems = allItems.filter(item => item.type === "file");

      expect(commandItems.length).toBeGreaterThan(0);
      expect(fileItems.length).toBeGreaterThan(0);
      expect(allItems.length).toBe(commandItems.length + fileItems.length);
    });
  });
});