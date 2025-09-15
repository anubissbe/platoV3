/**
 * ToolExecutor Tests - Comprehensive test suite for native/MCP tool routing
 * Tests the core service that coordinates between native tools and MCP fallback
 */

import { ToolExecutor, NativeToolExecutor } from "../tool-executor.js";
import { ReadTool } from "../read-tool.js";
import { WriteTool } from "../write-tool.js";
import { BashTool } from "../bash-tool.js";
import {
  ToolCall,
  BaseToolResponse,
  ToolError,
  ErrorClass,
  ToolEvent,
  ToolCapability,
  ToolConfig,
} from "../types.js";
import { jest } from "@jest/globals";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

// Mock MCP integration
jest.mock("../../../integrations/mcp.js");

describe("ToolExecutor Interface", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tool-executor-test-"));
  });

  afterAll(async () => {
    try {
      await (typeof (fs as any).rm === "function" ? (fs as any).rm : fs.rmdir)(
        tempDir,
        { recursive: true },
      );
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Base ToolExecutor Interface", () => {
    it("should define the correct interface methods", () => {
      // This is a type-checking test - if it compiles, the interface is correct
      const checkInterface = (executor: ToolExecutor) => {
        expect(typeof executor.execute).toBe("function");
        expect(typeof executor.stream).toBe("function");
        expect(typeof executor.cancel).toBe("function");
        expect(typeof executor.getCapabilities).toBe("function");
      };

      // Type checking passes if this doesn't cause compilation errors
      expect(checkInterface).toBeDefined();
    });
  });

  describe("NativeToolExecutor", () => {
    let toolExecutor: NativeToolExecutor;
    let mockMCPBridge: any;

    beforeEach(async () => {
      // Mock MCP bridge
      mockMCPBridge = {
        execute: jest.fn(),
        stream: jest.fn(),
        cancel: jest.fn(),
        getCapabilities: jest.fn(),
      };

      const config: ToolConfig = {
        forceMCP: false,
        timeout: 30000,
        maxConcurrency: 10,
        workspaceRoot: tempDir,
      };

      toolExecutor = new NativeToolExecutor(config, mockMCPBridge);
    });

    describe("Tool Registration", () => {
      it("should register native tools correctly", () => {
        const readTool = new ReadTool(tempDir);
        toolExecutor.registerTool("read", readTool);

        const capabilities = toolExecutor.getCapabilities();
        const readCapability = capabilities.find((c) => c.name === "read");

        expect(readCapability).toBeDefined();
        expect(readCapability?.name).toBe("read");
        expect(readCapability?.description).toContain("file reading");
        expect(readCapability?.streaming).toBe(true);
      });

      it("should register multiple tools", () => {
        const readTool = new ReadTool(tempDir);
        const writeTool = new WriteTool(tempDir);
        const bashTool = new BashTool(tempDir);

        toolExecutor.registerTool("read", readTool);
        toolExecutor.registerTool("write", writeTool);
        toolExecutor.registerTool("bash", bashTool);

        const capabilities = toolExecutor.getCapabilities();

        expect(capabilities).toHaveLength(3);
        expect(capabilities.map((c) => c.name)).toEqual(
          expect.arrayContaining(["read", "write", "bash"]),
        );
      });

      it("should prevent duplicate tool registration", () => {
        const readTool1 = new ReadTool(tempDir);
        const readTool2 = new ReadTool(tempDir);

        toolExecutor.registerTool("read", readTool1);

        expect(() => {
          toolExecutor.registerTool("read", readTool2);
        }).toThrow('Tool "read" is already registered');
      });

      it("should allow tool unregistration", () => {
        const readTool = new ReadTool(tempDir);
        toolExecutor.registerTool("read", readTool);

        expect(toolExecutor.getCapabilities()).toHaveLength(1);

        toolExecutor.unregisterTool("read");

        expect(toolExecutor.getCapabilities()).toHaveLength(0);
      });
    });

    describe("Native Tool Execution", () => {
      beforeEach(() => {
        const readTool = new ReadTool(tempDir);
        toolExecutor.registerTool("read", readTool);
      });

      it("should execute native tools when available", async () => {
        // Create test file
        const testFile = path.join(tempDir, "test.txt");
        await fs.writeFile(testFile, "Hello World");

        const toolCall: ToolCall = {
          name: "read",
          arguments: { path: testFile },
        };

        const result = await toolExecutor.execute(toolCall);

        expect(result.success).toBe(true);
        expect((result as any).content?.trim()).toBe("Hello World");
        expect(mockMCPBridge.execute).not.toHaveBeenCalled();
      });

      it("should handle native tool errors properly", async () => {
        const toolCall: ToolCall = {
          name: "read",
          arguments: { path: "/nonexistent/file.txt" },
        };

        await expect(toolExecutor.execute(toolCall)).rejects.toThrow();
        expect(mockMCPBridge.execute).not.toHaveBeenCalled();
      });

      it("should support streaming for native tools", async () => {
        // Create test file
        const testFile = path.join(tempDir, "test.txt");
        await fs.writeFile(testFile, "Hello\nStreaming\nWorld");

        const toolCall: ToolCall = {
          name: "read",
          arguments: { path: testFile },
        };

        const events: ToolEvent[] = [];
        const stream = toolExecutor.stream(toolCall);

        for await (const event of stream) {
          events.push(event);
        }

        expect(events.length).toBeGreaterThan(0);
        expect(events[0].type).toBe("metadata");
        expect(events[events.length - 1].type).toBe("complete");
        expect(mockMCPBridge.stream).not.toHaveBeenCalled();
      });
    });

    describe("MCP Fallback Logic", () => {
      beforeEach(() => {
        mockMCPBridge.execute.mockResolvedValue({
          success: true,
          content: "MCP result",
        });

        mockMCPBridge.stream.mockImplementation(async function* () {
          yield {
            type: "complete",
            data: { success: true, content: "MCP streaming result" },
            timestamp: Date.now(),
            sequence: 0,
          };
        });
      });

      it("should fall back to MCP for unknown tools", async () => {
        const toolCall: ToolCall = {
          name: "unknown_tool",
          arguments: { param: "value" },
        };

        const result = await toolExecutor.execute(toolCall);

        expect(mockMCPBridge.execute).toHaveBeenCalledWith(toolCall);
        expect(result.success).toBe(true);
        expect((result as any).content).toBe("MCP result");
      });

      it("should use MCP when forceMCP config is enabled", async () => {
        const readTool = new ReadTool(tempDir);
        toolExecutor.registerTool("read", readTool);

        // Enable force MCP mode
        const configWithForceMCP: ToolConfig = {
          forceMCP: true,
          timeout: 30000,
          maxConcurrency: 10,
          workspaceRoot: tempDir,
        };

        const forceMCPExecutor = new NativeToolExecutor(
          configWithForceMCP,
          mockMCPBridge,
        );
        forceMCPExecutor.registerTool("read", readTool);

        const toolCall: ToolCall = {
          name: "read",
          arguments: { path: "test.txt" },
        };

        await forceMCPExecutor.execute(toolCall);

        expect(mockMCPBridge.execute).toHaveBeenCalledWith(toolCall);
      });

      it("should support streaming fallback to MCP", async () => {
        const toolCall: ToolCall = {
          name: "unknown_streaming_tool",
          arguments: { param: "value" },
        };

        const events: ToolEvent[] = [];
        const stream = toolExecutor.stream(toolCall);

        for await (const event of stream) {
          events.push(event);
        }

        expect(mockMCPBridge.stream).toHaveBeenCalledWith(toolCall);
        expect(events.length).toBe(1);
        expect(events[0].type).toBe("complete");
        expect((events[0] as any).data.content).toBe("MCP streaming result");
      });

      it("should handle MCP bridge errors gracefully", async () => {
        mockMCPBridge.execute.mockRejectedValue(
          new Error("MCP connection failed"),
        );

        const toolCall: ToolCall = {
          name: "unknown_tool",
          arguments: { param: "value" },
        };

        await expect(toolExecutor.execute(toolCall)).rejects.toThrow(
          "MCP connection failed",
        );
      });
    });

    describe("Tool Capability Discovery", () => {
      it("should return capabilities for registered native tools", () => {
        const readTool = new ReadTool(tempDir);
        const writeTool = new WriteTool(tempDir);

        toolExecutor.registerTool("read", readTool);
        toolExecutor.registerTool("write", writeTool);

        const capabilities = toolExecutor.getCapabilities();

        expect(capabilities).toHaveLength(2);

        const readCapability = capabilities.find((c) => c.name === "read");
        expect(readCapability).toMatchObject({
          name: "read",
          version: expect.stringMatching(/^\d+\.\d+$/),
          description: expect.stringContaining("file reading"),
          streaming: true,
          arguments: expect.objectContaining({
            path: expect.any(Object),
            encoding: expect.any(Object),
          }),
        });

        const writeCapability = capabilities.find((c) => c.name === "write");
        expect(writeCapability).toMatchObject({
          name: "write",
          version: expect.stringMatching(/^\d+\.\d+$/),
          description: expect.stringContaining("file writing"),
          streaming: false,
          arguments: expect.objectContaining({
            path: expect.any(Object),
            content: expect.any(Object),
          }),
        });
      });

      it("should include MCP capabilities when bridge is available", () => {
        mockMCPBridge.getCapabilities.mockReturnValue([
          {
            name: "mcp_tool",
            version: "1.0",
            description: "MCP tool example",
            streaming: false,
            arguments: { param: { type: "string", required: true } },
          },
        ]);

        const capabilities = toolExecutor.getCapabilities();

        const mcpCapability = capabilities.find((c) => c.name === "mcp_tool");
        expect(mcpCapability).toBeDefined();
        expect(mcpCapability?.description).toBe("MCP tool example");
      });
    });

    describe("Process Lifecycle Management", () => {
      it("should support cancellation for native tools", async () => {
        const bashTool = new BashTool(tempDir);
        toolExecutor.registerTool("bash", bashTool);

        const toolCall: ToolCall = {
          name: "bash",
          arguments: {
            command: "sleep 10", // Long-running command
          },
        };

        // Start execution in background
        const executionPromise = toolExecutor.execute(toolCall);

        // Cancel after a short delay
        setTimeout(() => {
          toolExecutor.cancel("bash-execution-id");
        }, 100);

        await expect(executionPromise).rejects.toThrow();
      });

      it("should support cancellation fallback to MCP", async () => {
        mockMCPBridge.cancel.mockResolvedValue(undefined);

        await toolExecutor.cancel("mcp-execution-id");

        expect(mockMCPBridge.cancel).toHaveBeenCalledWith("mcp-execution-id");
      });
    });

    describe("Configuration and Resource Management", () => {
      it("should respect timeout configuration", async () => {
        const shortTimeoutConfig: ToolConfig = {
          forceMCP: false,
          timeout: 100, // Very short timeout
          maxConcurrency: 10,
          workspaceRoot: tempDir,
        };

        const shortTimeoutExecutor = new NativeToolExecutor(
          shortTimeoutConfig,
          mockMCPBridge,
        );
        const bashTool = new BashTool(tempDir);
        shortTimeoutExecutor.registerTool("bash", bashTool);

        const toolCall: ToolCall = {
          name: "bash",
          arguments: {
            command: "sleep 1",
            timeout: 50, // Even shorter timeout
          },
        };

        await expect(shortTimeoutExecutor.execute(toolCall)).rejects.toThrow();
      });

      it("should respect concurrency limits", async () => {
        const lowConcurrencyConfig: ToolConfig = {
          forceMCP: false,
          timeout: 30000,
          maxConcurrency: 1, // Only one concurrent execution
          workspaceRoot: tempDir,
        };

        const limitedExecutor = new NativeToolExecutor(
          lowConcurrencyConfig,
          mockMCPBridge,
        );
        const bashTool = new BashTool(tempDir);
        limitedExecutor.registerTool("bash", bashTool);

        const toolCall1: ToolCall = {
          name: "bash",
          arguments: { command: "sleep 0.5" },
        };

        const toolCall2: ToolCall = {
          name: "bash",
          arguments: { command: 'echo "second"' },
        };

        // Start both executions
        const execution1 = limitedExecutor.execute(toolCall1);
        const execution2 = limitedExecutor.execute(toolCall2);

        // Both should complete, but the second should wait for the first
        const results = await Promise.all([execution1, execution2]);

        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(true);
      });

      it("should validate workspace root configuration", () => {
        const invalidConfig: ToolConfig = {
          forceMCP: false,
          timeout: 30000,
          maxConcurrency: 10,
          workspaceRoot: "/nonexistent/directory",
        };

        expect(() => {
          new NativeToolExecutor(invalidConfig, mockMCPBridge);
        }).toThrow("Invalid workspace root");
      });
    });

    describe("Schema Validation", () => {
      it("should validate tool call arguments against schemas", async () => {
        const readTool = new ReadTool(tempDir);
        toolExecutor.registerTool("read", readTool);

        // Invalid arguments - missing required path
        const invalidToolCall: ToolCall = {
          name: "read",
          arguments: {}, // Missing path
        };

        await expect(toolExecutor.execute(invalidToolCall)).rejects.toThrow(
          expect.objectContaining({
            errorClass: ErrorClass.VALIDATION,
          }),
        );
      });

      it("should validate tool call format", async () => {
        const invalidToolCall: any = {
          name: "read",
          // Missing arguments property
        };

        await expect(toolExecutor.execute(invalidToolCall)).rejects.toThrow(
          "Invalid tool call format",
        );
      });

      it("should validate tool names", async () => {
        const invalidToolCall: ToolCall = {
          name: "", // Empty name
          arguments: { path: "test.txt" },
        };

        await expect(toolExecutor.execute(invalidToolCall)).rejects.toThrow(
          "Tool name cannot be empty",
        );
      });
    });

    describe("Error Handling and Classification", () => {
      it("should classify errors correctly", async () => {
        const readTool = new ReadTool(tempDir);
        toolExecutor.registerTool("read", readTool);

        // Test different error types
        const testCases = [
          {
            args: { path: "/nonexistent/file.txt" },
            expectedClass: ErrorClass.PERMANENT,
            description: "File not found",
          },
          {
            args: { path: "/root/restricted.txt" },
            expectedClass: ErrorClass.PERMISSION,
            description: "Permission denied",
          },
          {
            args: { path: "test.txt", startLine: -1 },
            expectedClass: ErrorClass.VALIDATION,
            description: "Invalid arguments",
          },
        ];

        for (const testCase of testCases) {
          try {
            await toolExecutor.execute({
              name: "read",
              arguments: testCase.args,
            });
            fail(`Expected error for ${testCase.description}`);
          } catch (error) {
            expect(error).toBeInstanceOf(ToolError);
            expect((error as ToolError).errorClass).toBe(
              testCase.expectedClass,
            );
          }
        }
      });

      it("should preserve error context in fallback", async () => {
        const mcpError = new ToolError(
          ErrorClass.TRANSIENT,
          "MCP_CONNECTION_ERROR",
          "Failed to connect to MCP server",
          { serverId: "test-server" },
        );

        mockMCPBridge.execute.mockRejectedValue(mcpError);

        const toolCall: ToolCall = {
          name: "unknown_tool",
          arguments: { param: "value" },
        };

        try {
          await toolExecutor.execute(toolCall);
          fail("Expected MCP error to be thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          expect((error as ToolError).errorClass).toBe(ErrorClass.TRANSIENT);
          expect((error as ToolError).code).toBe("MCP_CONNECTION_ERROR");
          expect((error as ToolError).details?.serverId).toBe("test-server");
        }
      });
    });

    describe("Telemetry and Monitoring", () => {
      it("should emit telemetry events for native tool execution", async () => {
        const readTool = new ReadTool(tempDir);
        toolExecutor.registerTool("read", readTool);

        const telemetryEvents: any[] = [];
        toolExecutor.on("telemetry", (event) => {
          telemetryEvents.push(event);
        });

        // Create test file
        const testFile = path.join(tempDir, "test.txt");
        await fs.writeFile(testFile, "Hello World");

        const toolCall: ToolCall = {
          name: "read",
          arguments: { path: testFile },
        };

        await toolExecutor.execute(toolCall);

        expect(telemetryEvents.length).toBeGreaterThan(0);

        const executionEvent = telemetryEvents.find((e) => e.tool === "read");
        expect(executionEvent).toBeDefined();
        expect(executionEvent.success).toBe(true);
        expect(executionEvent.duration).toBeGreaterThan(0);
        expect(executionEvent.bytesRead).toBeGreaterThan(0);
      });

      it("should track performance metrics", async () => {
        const bashTool = new BashTool(tempDir);
        toolExecutor.registerTool("bash", bashTool);

        const toolCall: ToolCall = {
          name: "bash",
          arguments: { command: 'echo "Performance test"' },
        };

        const result = await toolExecutor.execute(toolCall);

        expect(result.success).toBe(true);
        expect((result as any).metrics).toBeDefined();
        expect((result as any).metrics.duration).toBeGreaterThan(0);
        expect((result as any).metrics.executionTime).toBeGreaterThan(0);
      });
    });
  });
});
