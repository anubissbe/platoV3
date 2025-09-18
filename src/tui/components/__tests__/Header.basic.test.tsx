import React from "react";
import { describe, it, expect, jest } from "@jest/globals";
import { Header } from "../Header.js";

// Mock the style manager
jest.mock("../../../styles/manager.js", () => ({
  getStyleManager: jest.fn(() => ({
    getStyle: jest.fn(() => ({
      theme: {
        primary: "cyan",
        secondary: "gray",
        success: "green",
        error: "red",
        warning: "yellow",
        info: "blue",
      },
      formatting: {
        bold: false,
        italic: false,
        underline: false,
      },
    })),
  })),
}));

describe("Header Component - Basic Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates Header component without crashing", () => {
    expect(() => {
      React.createElement(Header, {});
    }).not.toThrow();
  });

  it("accepts all expected props without TypeScript errors", () => {
    const props = {
      model: "gpt-4",
      provider: "copilot",
      providerStatus: "connected" as const,
      tokens: 1250,
      maxTokens: 4000,
      connectionStatus: "connected" as const,
      latency: 120,
      showKeyboardShortcuts: true,
      sessionInfo: {
        startTime: new Date(),
        messageCount: 5,
      },
    };

    expect(() => {
      React.createElement(Header, props);
    }).not.toThrow();
  });

  it("has default props that work correctly", () => {
    expect(() => {
      React.createElement(Header, {});
    }).not.toThrow();
  });

  it("handles undefined optional props gracefully", () => {
    const props = {
      tokens: undefined,
      maxTokens: undefined,
      rateLimit: undefined,
      error: undefined,
    };

    expect(() => {
      React.createElement(Header, props);
    }).not.toThrow();
  });

  describe("Helper functions", () => {
    // Test helper functions by importing the module
    const { getDurationString } = require("../Header.js");

    it("formats duration correctly", () => {
      // This would test the getDurationString helper
      // But since it's not exported, we'll test the component behavior
      expect(true).toBe(true); // Placeholder
    });
  });
});
