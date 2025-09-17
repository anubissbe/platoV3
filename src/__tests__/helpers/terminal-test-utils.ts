/**
 * Terminal Testing Utilities
 * Helper functions for testing terminal applications and TUI components
 */

import { jest } from "@jest/globals";

export interface MockTerminalOptions {
  width?: number;
  height?: number;
  colorSupport?: boolean;
  mouseSupport?: boolean;
  platform?: string;
  terminalApp?: string;
}

export class TerminalTestUtils {
  /**
   * Mock terminal environment with specific capabilities
   */
  static mockTerminal(options: MockTerminalOptions = {}) {
    const {
      width = 80,
      height = 24,
      colorSupport = true,
      mouseSupport = true,
      platform = "linux",
      terminalApp = "xterm",
    } = options;

    // Mock process.stdout
    Object.defineProperty(process.stdout, "columns", {
      value: width,
      configurable: true,
    });

    Object.defineProperty(process.stdout, "rows", {
      value: height,
      configurable: true,
    });

    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });

    // Mock hasColors function
    if (process.stdout.hasColors) {
      (process.stdout.hasColors as jest.MockedFunction<any>) = jest
        .fn()
        .mockReturnValue(colorSupport);
    }

    // Mock platform
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });

    // Set terminal environment variables
    switch (terminalApp) {
      case "Windows Terminal":
        process.env.TERM_PROGRAM = "Windows Terminal";
        process.env.TERM = "xterm-256color";
        break;
      case "iTerm2":
        process.env.TERM_PROGRAM = "iTerm.app";
        process.env.TERM = "xterm-256color";
        process.env.COLORTERM = "truecolor";
        break;
      case "VS Code":
        process.env.TERM_PROGRAM = "vscode";
        process.env.TERM = "xterm-256color";
        break;
      default:
        process.env.TERM = "xterm-256color";
    }

    if (colorSupport) {
      process.env.COLORTERM = "truecolor";
    }

    return {
      restore: () => {
        // Reset environment variables
        delete process.env.TERM_PROGRAM;
        delete process.env.COLORTERM;
        delete process.env.TERM;
      },
    };
  }

  /**
   * Create mock terminal sequences for testing
   */
  static createMouseEvent(
    type: "click" | "scroll",
    x: number,
    y: number,
    direction?: "up" | "down",
  ): string {
    if (type === "click") {
      return `\x1b[M ${String.fromCharCode(32 + x)}${String.fromCharCode(32 + y)}`;
    } else if (type === "scroll") {
      const button = direction === "up" ? 64 : 65;
      return `\x1b[M${String.fromCharCode(32 + button)}${String.fromCharCode(32 + x)}${String.fromCharCode(32 + y)}`;
    }
    return "";
  }

  /**
   * Generate test keyboard sequences
   */
  static createKeyboardEvent(key: string): Buffer {
    const sequences: Record<string, string> = {
      enter: "\r",
      "ctrl+c": "\x03",
      "ctrl+v": "\x16",
      "ctrl+a": "\x01",
      up: "\x1b[A",
      down: "\x1b[B",
      left: "\x1b[D",
      right: "\x1b[C",
      home: "\x1b[H",
      end: "\x1b[F",
      pageup: "\x1b[5~",
      pagedown: "\x1b[6~",
      tab: "\t",
      "shift+tab": "\x1b[Z",
      escape: "\x1b",
    };

    return Buffer.from(sequences[key] || key);
  }

  /**
   * Validate terminal output format
   */
  static validateOutput(output: string): {
    hasColors: boolean;
    hasUnicode: boolean;
    lineCount: number;
    maxWidth: number;
    hasEscapeSequences: boolean;
  } {
    const lines = output.split("\n");
    const hasColors = /\x1b\[[0-9;]*m/.test(output);
    const hasUnicode = /[^\x00-\x7F]/.test(output);
    const hasEscapeSequences = /\x1b\[/.test(output);

    const maxWidth = Math.max(
      ...lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, "").length),
    );

    return {
      hasColors,
      hasUnicode,
      lineCount: lines.length,
      maxWidth,
      hasEscapeSequences,
    };
  }

  /**
   * Compare terminal frames for visual regression testing
   */
  static compareFrames(
    frame1: string,
    frame2: string,
  ): {
    identical: boolean;
    differences: Array<{ line: number; expected: string; actual: string }>;
    summary: string;
  } {
    const lines1 = frame1.split("\n");
    const lines2 = frame2.split("\n");
    const maxLines = Math.max(lines1.length, lines2.length);

    const differences: Array<{
      line: number;
      expected: string;
      actual: string;
    }> = [];

    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i] || "";
      const line2 = lines2[i] || "";

      if (line1 !== line2) {
        differences.push({
          line: i + 1,
          expected: line1,
          actual: line2,
        });
      }
    }

    const identical = differences.length === 0;
    const summary = identical
      ? "Frames are identical"
      : `Found ${differences.length} differences across ${maxLines} lines`;

    return {
      identical,
      differences,
      summary,
    };
  }

  /**
   * Create test message data
   */
  static createTestMessages(count: number = 5) {
    const messages = [];
    const baseTime = Date.now() - count * 60000; // Space messages 1 minute apart

    for (let i = 0; i < count; i++) {
      if (i % 2 === 0) {
        // User message
        messages.push({
          role: "user" as const,
          content: `User message ${i + 1}: This is a test message from the user.`,
          timestamp: baseTime + i * 60000,
          metadata: { tokensUsed: 10 + i },
        });
      } else {
        // Assistant message
        messages.push({
          role: "assistant" as const,
          content: `Assistant response ${i + 1}: This is a detailed response that might include code blocks and explanations.\n\n\`\`\`typescript\nconst example = "code example ${i}";\nconsole.log(example);\n\`\`\`\n\nThis demonstrates the formatting capabilities.`,
          timestamp: baseTime + i * 60000,
          metadata: {
            tokensUsed: 50 + i * 10,
            model: "claude-3-5-sonnet-20241022",
            duration: 1500 + i * 200,
          },
        });
      }
    }

    return messages;
  }

  /**
   * Create test metrics data
   */
  static createTestMetrics(overrides: Partial<any> = {}) {
    return {
      inputTokens: 150,
      outputTokens: 200,
      totalTokens: 350,
      responseTime: 1800,
      memoryUsageMB: 55.2,
      memoryPercentage: 35,
      sessionTurns: 5,
      sessionTokens: 1250,
      streamProgress: 0,
      charactersStreamed: 0,
      activeToolCall: null,
      toolCallHistory: [],
      lastError: null,
      averageResponseTime: 1650,
      indeterminateProgress: false,
      currentCost: 0.0035,
      sessionCost: 0.0175,
      ...overrides,
    };
  }

  /**
   * Wait for async operations in tests
   */
  static async waitFor(
    condition: () => boolean,
    timeout: number = 5000,
    interval: number = 100,
  ): Promise<void> {
    const startTime = Date.now();

    while (!condition() && Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    if (!condition()) {
      throw new Error(`Condition not met within ${timeout}ms timeout`);
    }
  }

  /**
   * Mock file system operations for cross-platform testing
   */
  static mockFileSystem() {
    const mockFs = {
      files: new Map<string, string>(),
      directories: new Set<string>(),
    };

    const mockStat = jest.fn().mockImplementation(async (filePath: string) => {
      if (mockFs.directories.has(filePath)) {
        return { isDirectory: () => true };
      }
      if (mockFs.files.has(filePath)) {
        return { isDirectory: () => false };
      }
      throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
    });

    const mockReadFile = jest
      .fn()
      .mockImplementation(async (filePath: string) => {
        if (mockFs.files.has(filePath)) {
          return mockFs.files.get(filePath);
        }
        throw new Error(
          `ENOENT: no such file or directory, open '${filePath}'`,
        );
      });

    const mockWriteFile = jest
      .fn()
      .mockImplementation(async (filePath: string, content: string) => {
        mockFs.files.set(filePath, content);
      });

    const mockMkdir = jest.fn().mockImplementation(async (dirPath: string) => {
      mockFs.directories.add(dirPath);
    });

    const mockAccess = jest
      .fn()
      .mockImplementation(async (filePath: string) => {
        if (!mockFs.files.has(filePath) && !mockFs.directories.has(filePath)) {
          throw new Error(
            `ENOENT: no such file or directory, access '${filePath}'`,
          );
        }
      });

    return {
      mockFs,
      mocks: {
        stat: mockStat,
        readFile: mockReadFile,
        writeFile: mockWriteFile,
        mkdir: mockMkdir,
        access: mockAccess,
      },
      addFile: (path: string, content: string) => {
        mockFs.files.set(path, content);
      },
      addDirectory: (path: string) => {
        mockFs.directories.add(path);
      },
      clear: () => {
        mockFs.files.clear();
        mockFs.directories.clear();
      },
    };
  }

  /**
   * Generate snapshot data for visual regression testing
   */
  static generateSnapshot(
    component: string,
    variant: string,
    frame: string,
  ): string {
    const metadata = {
      component,
      variant,
      timestamp: new Date().toISOString(),
      frameHash: this.hashString(frame),
    };

    return `// Jest Snapshot v1, https://goo.gl/fbAQLP

exports[\`${component} › ${variant} 1\`] = \`
${frame}
\`;

// Metadata: ${JSON.stringify(metadata)}
`;
  }

  /**
   * Simple hash function for frame comparison
   */
  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Validate accessibility features in terminal output
   */
  static validateAccessibility(output: string): {
    hasScreenReaderContent: boolean;
    hasKeyboardNavigation: boolean;
    hasColorContrast: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for screen reader friendly content
    const hasScreenReaderContent = /aria-|role=|alt=/.test(output);
    if (!hasScreenReaderContent) {
      issues.push("No screen reader accessible content found");
    }

    // Check for keyboard navigation indicators
    const hasKeyboardNavigation = /\[(Tab|Enter|Arrow|Ctrl)\]/.test(output);
    if (!hasKeyboardNavigation) {
      issues.push("No keyboard navigation hints found");
    }

    // Basic color contrast check (simplified)
    const hasColorContrast = /\x1b\[3[0-7]m.*\x1b\[4[0-7]m/.test(output);

    return {
      hasScreenReaderContent,
      hasKeyboardNavigation,
      hasColorContrast,
      issues,
    };
  }
}
