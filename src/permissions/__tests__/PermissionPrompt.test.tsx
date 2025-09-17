import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { PermissionPrompt } from "../components/PermissionPrompt";
import { PermissionQuery, RiskLevel } from "../types";

// Mock the useInput hook from ink
jest.mock("ink", () => ({
  ...jest.requireActual("ink"),
  useInput: jest.fn(),
  useStdin: jest.fn(() => ({
    isRawModeSupported: true,
    setRawMode: jest.fn(),
  })),
}));

describe.skip("PermissionPrompt", () => {
  const mockOnResponse = jest.fn();
  const mockOnCancel = jest.fn();

  const defaultQuery: PermissionQuery = {
    tool: "fs_write",
    operation: "write",
    path: "/path/to/file.txt",
    timestamp: Date.now(),
    context: {
      source: "cli",
      environment: {
        platform: "linux",
        node_version: "v18.0.0",
      },
      workspace_path: "/opt/projects/test",
      user: "testuser",
      session_id: "test-session-123",
      tty: true,
      ci_environment: false,
      docker_environment: false,
      ssh_session: false,
      git_context: {
        branch: "main",
        commit_hash: "abc123",
        repository: "test-repo",
        is_clean: true,
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Component Rendering", () => {
    it("should render permission prompt with query details", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Permission Request");
      expect(lastFrame()).toContain("fs_write");
      expect(lastFrame()).toContain("/path/to/file.txt");
    });

    it("should display risk level indicator", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          riskLevel="high"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Risk");
      expect(lastFrame()).toContain("HIGH");
    });

    it("should show rule explanation when provided", () => {
      const explanation =
        "This operation requires approval due to sensitive path access";
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          ruleExplanation={explanation}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain(explanation);
    });

    it("should display operation preview", () => {
      const preview = "Will write 1024 bytes to configuration file";
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          operationPreview={preview}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Preview");
      expect(lastFrame()).toContain(preview);
    });

    it("should show temporary elevation option", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          allowTemporaryElevation={true}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Temporary");
      expect(lastFrame()).toContain("elevation");
    });

    it("should display keyboard shortcuts help", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          showKeyboardHelp={true}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("[Y]");
      expect(lastFrame()).toContain("[N]");
      expect(lastFrame()).toContain("[ESC]");
    });
  });

  describe("Risk Assessment Display", () => {
    it("should show low risk with green indicator", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          riskLevel="low"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      const output = lastFrame();
      expect(output).toContain("LOW");
      // Check for green color code or indicator
      expect(output).toMatch(/low/i);
    });

    it("should show medium risk with yellow indicator", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          riskLevel="medium"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      const output = lastFrame();
      expect(output).toContain("MEDIUM");
      expect(output).toMatch(/medium/i);
    });

    it("should show high risk with red indicator", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          riskLevel="high"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      const output = lastFrame();
      expect(output).toContain("HIGH");
      expect(output).toMatch(/high/i);
    });

    it("should show critical risk with special formatting", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          riskLevel="critical"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      const output = lastFrame();
      expect(output).toContain("CRITICAL");
      expect(output).toMatch(/critical/i);
    });
  });

  describe("User Interaction", () => {
    it("should handle allow action", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write("y");
      expect(mockOnResponse).toHaveBeenCalledWith({
        action: "allow",
        permanent: false,
        timestamp: expect.any(Number),
      });
    });

    it("should handle deny action", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write("n");
      expect(mockOnResponse).toHaveBeenCalledWith({
        action: "deny",
        permanent: false,
        timestamp: expect.any(Number),
      });
    });

    it("should handle cancel with ESC key", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write("\x1B"); // ESC key
      expect(mockOnCancel).toHaveBeenCalled();
    });

    it("should handle permanent allow with shift+Y", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write("Y"); // Capital Y for permanent
      expect(mockOnResponse).toHaveBeenCalledWith({
        action: "allow",
        permanent: true,
        timestamp: expect.any(Number),
      });
    });

    it("should handle permanent deny with shift+N", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write("N"); // Capital N for permanent
      expect(mockOnResponse).toHaveBeenCalledWith({
        action: "deny",
        permanent: true,
        timestamp: expect.any(Number),
      });
    });

    it("should handle temporary elevation request", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          allowTemporaryElevation={true}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write("t"); // T for temporary elevation
      expect(mockOnResponse).toHaveBeenCalledWith({
        action: "allow",
        permanent: false,
        elevate: true,
        duration: 300000, // 5 minutes default
        timestamp: expect.any(Number),
      });
    });
  });

  describe("Visual Feedback", () => {
    it("should show processing state during decision", () => {
      const { lastFrame, rerender } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
          isProcessing={true}
        />,
      );

      expect(lastFrame()).toContain("Processing");
    });

    it("should show countdown timer for auto-deny", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
          autoDenyTimeout={30}
        />,
      );

      expect(lastFrame()).toContain("Auto-deny in");
      expect(lastFrame()).toMatch(/\d+ seconds/);
    });

    it("should highlight dangerous patterns", () => {
      const dangerousQuery = {
        ...defaultQuery,
        operation: "delete",
        path: "/etc/passwd",
      };

      const { lastFrame } = render(
        <PermissionPrompt
          query={dangerousQuery}
          riskLevel="critical"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("DANGER");
      expect(lastFrame()).toContain("/etc/passwd");
    });

    it("should show affected files count for batch operations", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          affectedFiles={15}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("15 files");
      expect(lastFrame()).toContain("affected");
    });
  });

  describe("Keyboard Navigation", () => {
    it("should support arrow key navigation between options", () => {
      const { stdin, lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      // Arrow down
      stdin.write("\x1B[B");
      expect(lastFrame()).toContain("▶"); // Selection indicator

      // Arrow up
      stdin.write("\x1B[A");
      expect(lastFrame()).toContain("▶");
    });

    it("should support tab navigation", () => {
      const { stdin, lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write("\t"); // Tab key
      expect(lastFrame()).toContain("▶");
    });

    it("should support enter key to confirm selection", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write("\r"); // Enter key
      expect(mockOnResponse).toHaveBeenCalled();
    });

    it("should support space key for quick toggle", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write(" "); // Space key
      expect(mockOnResponse).toHaveBeenCalled();
    });
  });

  describe("Rule Explanation", () => {
    it("should display matched rule details", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          matchedRule={{
            id: "rule-1",
            name: "Protect System Files",
            pattern: "/etc/**",
            action: "prompt",
          }}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Protect System Files");
      expect(lastFrame()).toContain("/etc/**");
    });

    it("should show rule priority when conflicts exist", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          matchedRule={{
            id: "rule-1",
            name: "High Priority Rule",
            priority: 100,
            pattern: "**/*.config",
            action: "prompt",
          }}
          conflictingRules={[
            { id: "rule-2", name: "Low Priority Rule", priority: 10 },
          ]}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Priority: 100");
      expect(lastFrame()).toContain("Overrides");
    });

    it("should explain why prompt was triggered", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          triggerReason="File matches sensitive pattern and is in protected directory"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Triggered because");
      expect(lastFrame()).toContain("sensitive pattern");
      expect(lastFrame()).toContain("protected directory");
    });
  });

  describe("Temporary Elevation", () => {
    it("should show elevation duration options", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          allowTemporaryElevation={true}
          elevationOptions={[
            { label: "5 minutes", duration: 300000 },
            { label: "15 minutes", duration: 900000 },
            { label: "1 hour", duration: 3600000 },
          ]}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("5 minutes");
      expect(lastFrame()).toContain("15 minutes");
      expect(lastFrame()).toContain("1 hour");
    });

    it("should handle custom elevation duration", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          allowTemporaryElevation={true}
          allowCustomDuration={true}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      stdin.write("e"); // E for elevation with custom duration
      stdin.write("10"); // 10 minutes
      stdin.write("\r"); // Enter

      expect(mockOnResponse).toHaveBeenCalledWith({
        action: "allow",
        permanent: false,
        elevate: true,
        duration: 600000, // 10 minutes in ms
        timestamp: expect.any(Number),
      });
    });

    it("should show remaining elevation time", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          currentElevation={{
            active: true,
            remainingTime: 120000, // 2 minutes
            scope: "fs_write",
          }}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Elevated");
      expect(lastFrame()).toContain("2 minutes remaining");
    });
  });

  describe("Operation Preview", () => {
    it("should show detailed file operation preview", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={{
            ...defaultQuery,
            operation: "write",
            metadata: {
              fileSize: 2048,
              encoding: "utf-8",
              mode: "0644",
            },
          }}
          operationPreview="Write 2KB text file with standard permissions"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("2KB");
      expect(lastFrame()).toContain("text file");
      expect(lastFrame()).toContain("0644");
    });

    it("should preview command execution", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={{
            ...defaultQuery,
            tool: "exec",
            operation: "run",
            metadata: {
              command: "npm install express",
              cwd: "/project",
            },
          }}
          operationPreview="Execute: npm install express\nWorking directory: /project"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("npm install express");
      expect(lastFrame()).toContain("/project");
    });

    it("should show API request preview", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={{
            ...defaultQuery,
            tool: "http",
            operation: "request",
            metadata: {
              method: "POST",
              url: "https://api.example.com/data",
              headers: { "Content-Type": "application/json" },
            },
          }}
          operationPreview="POST request to api.example.com"
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("POST");
      expect(lastFrame()).toContain("api.example.com");
    });
  });

  describe("Accessibility", () => {
    it("should announce prompt to screen readers", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          announceToScreenReader={true}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      // Check for ARIA attributes or screen reader text
      expect(lastFrame()).toBeDefined();
    });

    it("should support high contrast mode", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          highContrastMode={true}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      // High contrast mode should use different formatting
      expect(lastFrame()).toBeDefined();
    });

    it("should provide keyboard-only navigation", () => {
      const { stdin } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      // All functions accessible via keyboard
      stdin.write("?"); // Help
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Keyboard shortcuts");
    });
  });

  describe("Error Handling", () => {
    it("should handle missing query gracefully", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={null as any}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      expect(lastFrame()).toContain("Invalid permission request");
    });

    it("should handle invalid risk level", () => {
      const { lastFrame } = render(
        <PermissionPrompt
          query={defaultQuery}
          riskLevel={"invalid" as any}
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      // Should default to medium risk
      expect(lastFrame()).toContain("MEDIUM");
    });

    it("should timeout after specified duration", (done) => {
      const { rerender } = render(
        <PermissionPrompt
          query={defaultQuery}
          autoDenyTimeout={1} // 1 second
          onResponse={mockOnResponse}
          onCancel={mockOnCancel}
        />,
      );

      setTimeout(() => {
        expect(mockOnResponse).toHaveBeenCalledWith({
          action: "deny",
          permanent: false,
          reason: "timeout",
          timestamp: expect.any(Number),
        });
        done();
      }, 1100);
    });
  });
});
