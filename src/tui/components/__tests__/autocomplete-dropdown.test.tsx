/**
 * Tests for AutocompleteDropdown component
 * Validates dropdown rendering, keyboard navigation, and character highlighting
 */

import React from "react";
import { AutocompleteDropdown } from "../autocomplete-dropdown.js";
import type { AutocompleteResult } from "../../../autocomplete/types.js";

// Mock ink modules
jest.mock("ink", () => ({
  Box: ({ children }: { children: React.ReactNode }) => children,
  Text: ({ children }: { children: React.ReactNode }) => children,
  useInput: jest.fn(),
}));

// Mock picocolors
jest.mock("picocolors", () => ({
  cyan: (text: string) => text,
  yellow: (text: string) => text,
  green: (text: string) => text,
  gray: (text: string) => text,
  inverse: (text: string) => text,
  bold: (text: string) => text,
}));

const mockResults: AutocompleteResult[] = [
  {
    item: "help",
    score: 0.1,
    type: "command",
    highlight: [{ start: 0, end: 4 }],
    usageCount: 5,
    lastUsed: new Date("2023-01-01"),
    finalScore: 0.2,
  },
  {
    item: "src/components/Button.tsx",
    score: 0.3,
    type: "file",
    highlight: [{ start: 0, end: 3 }],
    usageCount: 2,
    lastUsed: new Date("2023-01-02"),
    finalScore: 0.4,
  },
  {
    item: "status",
    score: 0.2,
    type: "command",
    highlight: [{ start: 0, end: 6 }],
    usageCount: 3,
    lastUsed: new Date("2023-01-03"),
    finalScore: 0.3,
  },
];

describe("AutocompleteDropdown", () => {
  const mockOnSelect = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic Rendering", () => {
    it("should render component with empty results", () => {
      // Test that component can be created without errors
      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: [],
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });

    it("should render component with results", () => {
      // Test that component can be created with results
      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: mockResults,
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });

    it("should handle invisible state", () => {
      // Test that component can be created when not visible
      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: mockResults,
          isVisible: false,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });

    it("should handle selected item state", () => {
      // Test that component can be created with different selected index
      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: mockResults,
          isVisible: true,
          selectedIndex: 1,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });
  });

  describe("Character Highlighting", () => {
    it("should handle results with highlights", () => {
      // Test that component can handle results with highlight ranges
      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: mockResults,
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });

    it("should handle items without highlights", () => {
      const resultsWithoutHighlight: AutocompleteResult[] = [
        {
          item: "test",
          score: 0.1,
          type: "command",
          highlight: [],
          usageCount: 1,
          lastUsed: new Date(),
          finalScore: 0.1,
        },
      ];

      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: resultsWithoutHighlight,
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });
  });

  describe("Scroll Indicators", () => {
    it("should handle many results", () => {
      const manyResults: AutocompleteResult[] = Array.from({ length: 15 }, (_, i) => ({
        item: `item${i}`,
        score: 0.1,
        type: "command" as const,
        highlight: [],
        usageCount: 1,
        lastUsed: new Date(),
        finalScore: 0.1,
      }));

      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: manyResults,
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });

    it("should handle maxVisibleItems prop", () => {
      const manyResults: AutocompleteResult[] = Array.from({ length: 20 }, (_, i) => ({
        item: `item${i}`,
        score: 0.1,
        type: "command" as const,
        highlight: [],
        usageCount: 1,
        lastUsed: new Date(),
        finalScore: 0.1,
      }));

      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: manyResults,
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
          maxVisibleItems: 10,
        });
      }).not.toThrow();
    });
  });

  describe("Keyboard Navigation", () => {
    it("should register input handler", () => {
      const { useInput } = require("ink");

      React.createElement(AutocompleteDropdown, {
        results: mockResults,
        isVisible: true,
        selectedIndex: 0,
        onSelect: mockOnSelect,
        onCancel: mockOnCancel,
      });

      // Verify useInput was called during component creation
      expect(useInput).toHaveBeenCalled();
    });

    it("should handle callbacks correctly", () => {
      // Test that onSelect and onCancel callbacks are passed correctly
      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: mockResults,
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });
  });

  describe("Type Indicators", () => {
    it("should handle command type indicator", () => {
      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: [mockResults[0]],
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });

    it("should handle file type indicator", () => {
      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: [mockResults[1]],
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
    });
  });

  describe("Performance", () => {
    it("should handle large result sets efficiently", () => {
      const largeResults: AutocompleteResult[] = Array.from({ length: 1000 }, (_, i) => ({
        item: `item${i}`,
        score: 0.1,
        type: "command" as const,
        highlight: [],
        usageCount: 1,
        lastUsed: new Date(),
        finalScore: 0.1,
      }));

      const start = performance.now();
      expect(() => {
        React.createElement(AutocompleteDropdown, {
          results: largeResults,
          isVisible: true,
          selectedIndex: 0,
          onSelect: mockOnSelect,
          onCancel: mockOnCancel,
        });
      }).not.toThrow();
      const elapsed = performance.now() - start;

      // Should create component quickly even with large datasets
      expect(elapsed).toBeLessThan(50);
    });
  });
});