/**
 * Comprehensive MCP Server Integration Testing
 * Testing all MCP server functionality: attachment, tool-calls, permissions, concurrent operations
 */

import { Orchestrator } from '../../runtime/orchestrator';
import { McpHub } from '../../integrations/mcp';
import { loadConfig, saveConfig } from '../../config';
import { PermissionManager } from '../../tools/permissions';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import http from 'http';

jest.mock('../../config');
jest.mock('fs/promises');

describe('Task 2: MCP Server Integration Testing', () => {
  let orchestrator: Orchestrator;
  let mcpHub: McpHub;
  let permissionManager: PermissionManager;
  let mockMcpServer: http.Server;
  const TEST_PORT = 8719;
  const TEST_SERVER_URL = `http://localhost:${TEST_PORT}`;

  beforeAll(async () => {
    // Start mock MCP server
    mockMcpServer = await startMockMcpServer(TEST_PORT);
  });

  afterAll(async () => {
    // Stop mock MCP server
    if (mockMcpServer) {
      await new Promise<void>((resolve) => {
        mockMcpServer.close(() => resolve());
      });
    }
  });

  beforeEach(() => {
    orchestrator = new Orchestrator();
    mcpHub = new McpHub();
    permissionManager = new PermissionManager();
    jest.clearAllMocks();
  });

  describe('✅ 2.1 MCP Server Attachment/Detachment', () => {
    test('should attach MCP server successfully', async () => {
      const serverName = 'test-server';
      
      // Attach server
      const result = await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      expect(result).toBeTruthy();
      expect(mcpHub.getAttachedServers()).toContain(serverName);
      
      // Verify server is reachable
      const tools = await mcpHub.listTools(serverName);
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
    });

    test('should detach MCP server successfully', async () => {
      const serverName = 'test-server';
      
      // Attach first
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      expect(mcpHub.getAttachedServers()).toContain(serverName);
      
      // Detach server
      await mcpHub.detachServer(serverName);
      expect(mcpHub.getAttachedServers()).not.toContain(serverName);
      
      // Verify server is no longer accessible
      await expect(mcpHub.listTools(serverName)).rejects.toThrow();
    });

    test('should persist attached servers across sessions', async () => {
      const serverName = 'persistent-server';
      const configPath = '.plato/mcp-servers.json';
      
      // Mock file operations
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        servers: {
          [serverName]: { url: TEST_SERVER_URL }
        }
      }));
      
      // Create new hub instance
      const newHub = new McpHub();
      await newHub.loadServers();
      
      expect(newHub.getAttachedServers()).toContain(serverName);
    });

    test('should handle server connection failures gracefully', async () => {
      const serverName = 'unreachable-server';
      const badUrl = 'http://localhost:99999'; // Non-existent port
      
      await expect(mcpHub.attachServer(serverName, badUrl))
        .rejects.toThrow();
      
      expect(mcpHub.getAttachedServers()).not.toContain(serverName);
    });
  });

  describe('✅ 2.2 Tool-Call Bridge JSON Parsing', () => {
    test('should parse valid tool-call JSON blocks', () => {
      const validJson = '{"tool_call": {"server": "test", "name": "read_file", "input": {"path": "/test.txt"}}}';
      
      const parsed = mcpHub.parseToolCall(validJson);
      
      expect(parsed).toEqual({
        server: 'test',
        name: 'read_file',
        input: { path: '/test.txt' }
      });
    });

    test('should handle nested JSON in tool calls', () => {
      const nestedJson = {
        tool_call: {
          server: 'complex',
          name: 'process',
          input: {
            data: {
              nested: {
                deeply: {
                  value: 'test'
                }
              }
            },
            options: ['opt1', 'opt2']
          }
        }
      };
      
      const parsed = mcpHub.parseToolCall(JSON.stringify(nestedJson));
      
      expect(parsed.input.data.nested.deeply.value).toBe('test');
      expect(parsed.input.options).toEqual(['opt1', 'opt2']);
    });

    test('should reject malformed tool-call JSON', () => {
      const malformedCases = [
        '{"tool_call": {}}', // Missing required fields
        '{"server": "test"}', // Wrong structure
        '{invalid json}', // Invalid JSON
        '{"tool_call": {"server": "test"}}', // Missing name
      ];
      
      malformedCases.forEach(malformed => {
        expect(() => mcpHub.parseToolCall(malformed)).toThrow();
      });
    });

    test('should extract tool-call blocks from streaming text', () => {
      const streamText = `
        Here's some text before the tool call.
        {"tool_call": {"server": "test", "name": "tool1", "input": {}}}
        Some text in between.
        {"tool_call": {"server": "test", "name": "tool2", "input": {"param": "value"}}}
        Text after the tool calls.
      `;
      
      const toolCalls = mcpHub.extractToolCalls(streamText);
      
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].name).toBe('tool1');
      expect(toolCalls[1].name).toBe('tool2');
      expect(toolCalls[1].input.param).toBe('value');
    });
  });

  describe('✅ 2.3 MCP Server Communication', () => {
    test('should execute tool calls successfully', async () => {
      const serverName = 'test-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      const toolCall = {
        server: serverName,
        name: 'echo',
        input: { message: 'Hello MCP!' }
      };
      
      const result = await mcpHub.executeTool(toolCall);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.output).toContain('Hello MCP!');
    });

    test('should handle tool execution errors', async () => {
      const serverName = 'test-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      const toolCall = {
        server: serverName,
        name: 'error_tool',
        input: { trigger: 'error' }
      };
      
      const result = await mcpHub.executeTool(toolCall);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should timeout long-running tools', async () => {
      const serverName = 'test-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      const toolCall = {
        server: serverName,
        name: 'slow_tool',
        input: { delay: 10000 } // 10 second delay
      };
      
      const startTime = Date.now();
      const result = await mcpHub.executeTool(toolCall, { timeout: 1000 }); // 1 second timeout
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(2000); // Should timeout within 2 seconds
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('✅ 2.4 Permission System', () => {
    test('should enforce tool execution permissions', async () => {
      const serverName = 'test-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      // Set restrictive permissions
      permissionManager.setPermission(serverName, 'dangerous_tool', 'deny');
      
      const toolCall = {
        server: serverName,
        name: 'dangerous_tool',
        input: {}
      };
      
      await expect(mcpHub.executeTool(toolCall, { checkPermissions: true }))
        .rejects.toThrow('Permission denied');
    });

    test('should allow permitted tools', async () => {
      const serverName = 'test-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      // Set allow permission
      permissionManager.setPermission(serverName, 'safe_tool', 'allow');
      
      const toolCall = {
        server: serverName,
        name: 'safe_tool',
        input: {}
      };
      
      const result = await mcpHub.executeTool(toolCall, { checkPermissions: true });
      expect(result.success).toBe(true);
    });

    test('should prompt for permission when set to ask', async () => {
      const serverName = 'test-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      // Set ask permission
      permissionManager.setPermission(serverName, 'ask_tool', 'ask');
      
      const toolCall = {
        server: serverName,
        name: 'ask_tool',
        input: {}
      };
      
      // Mock user approval
      const mockPrompt = jest.fn().mockResolvedValue(true);
      mcpHub.setPromptHandler(mockPrompt);
      
      const result = await mcpHub.executeTool(toolCall, { checkPermissions: true });
      
      expect(mockPrompt).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('✅ 2.5 Concurrent MCP Operations', () => {
    test('should handle concurrent tool executions', async () => {
      const serverName = 'test-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      const toolCalls = Array.from({ length: 10 }, (_, i) => ({
        server: serverName,
        name: 'concurrent_tool',
        input: { id: i }
      }));
      
      const startTime = Date.now();
      const results = await Promise.all(
        toolCalls.map(call => mcpHub.executeTool(call))
      );
      const duration = Date.now() - startTime;
      
      // All should succeed
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.output).toContain(`id: ${i}`);
      });
      
      // Should execute concurrently (faster than sequential)
      expect(duration).toBeLessThan(2000); // Assuming each takes ~100ms
    });

    test('should handle concurrent server attachments', async () => {
      const serverNames = Array.from({ length: 5 }, (_, i) => `server-${i}`);
      
      const attachPromises = serverNames.map(name =>
        mcpHub.attachServer(name, TEST_SERVER_URL)
      );
      
      const results = await Promise.all(attachPromises);
      
      results.forEach(result => expect(result).toBeTruthy());
      serverNames.forEach(name => {
        expect(mcpHub.getAttachedServers()).toContain(name);
      });
    });

    test('should maintain isolation between concurrent operations', async () => {
      const server1 = 'isolated-1';
      const server2 = 'isolated-2';
      
      await Promise.all([
        mcpHub.attachServer(server1, TEST_SERVER_URL),
        mcpHub.attachServer(server2, TEST_SERVER_URL)
      ]);
      
      const [result1, result2] = await Promise.all([
        mcpHub.executeTool({
          server: server1,
          name: 'isolated_tool',
          input: { value: 'from-server-1' }
        }),
        mcpHub.executeTool({
          server: server2,
          name: 'isolated_tool',
          input: { value: 'from-server-2' }
        })
      ]);
      
      expect(result1.output).toContain('from-server-1');
      expect(result2.output).toContain('from-server-2');
      expect(result1.output).not.toContain('from-server-2');
      expect(result2.output).not.toContain('from-server-1');
    });
  });

  describe('✅ 2.6 Error Recovery', () => {
    test('should retry failed tool executions', async () => {
      const serverName = 'test-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      let attemptCount = 0;
      const mockExecute = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient error');
        }
        return { success: true, output: 'Success after retry' };
      });
      
      mcpHub.setExecutor(mockExecute);
      
      const result = await mcpHub.executeTool({
        server: serverName,
        name: 'retry_tool',
        input: {}
      }, { retries: 3 });
      
      expect(attemptCount).toBe(3);
      expect(result.success).toBe(true);
    });

    test('should reconnect to server after connection loss', async () => {
      const serverName = 'reconnect-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      // Simulate connection loss
      mcpHub.simulateDisconnect(serverName);
      
      // Should auto-reconnect on next tool call
      const result = await mcpHub.executeTool({
        server: serverName,
        name: 'test_tool',
        input: {}
      });
      
      expect(result.success).toBe(true);
      expect(mcpHub.isConnected(serverName)).toBe(true);
    });

    test('should handle server crash gracefully', async () => {
      const serverName = 'crash-server';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      // Stop the mock server to simulate crash
      await new Promise<void>((resolve) => {
        mockMcpServer.close(() => resolve());
      });
      
      const result = await mcpHub.executeTool({
        server: serverName,
        name: 'test_tool',
        input: {}
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('connection');
      
      // Restart mock server
      mockMcpServer = await startMockMcpServer(TEST_PORT);
    });
  });

  describe('✅ 2.7 Mock MCP Server', () => {
    test('mock server should respond to tool listing', async () => {
      const response = await fetch(`${TEST_SERVER_URL}/tools`);
      const tools = await response.json();
      
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('description');
    });

    test('mock server should execute tools', async () => {
      const response = await fetch(`${TEST_SERVER_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'test_tool',
          input: { param: 'value' }
        })
      });
      
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });

    test('mock server should handle errors properly', async () => {
      const response = await fetch(`${TEST_SERVER_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'error_tool',
          input: { trigger: 'error' }
        })
      });
      
      const result = await response.json();
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('✅ 2.8 Integration Verification', () => {
    test('should complete full MCP workflow', async () => {
      // 1. Attach server
      const serverName = 'workflow-test';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      // 2. List available tools
      const tools = await mcpHub.listTools(serverName);
      expect(tools.length).toBeGreaterThan(0);
      
      // 3. Check permissions
      permissionManager.setPermission(serverName, tools[0].name, 'allow');
      
      // 4. Execute tool
      const result = await mcpHub.executeTool({
        server: serverName,
        name: tools[0].name,
        input: { test: 'data' }
      }, { checkPermissions: true });
      
      expect(result.success).toBe(true);
      
      // 5. Detach server
      await mcpHub.detachServer(serverName);
      expect(mcpHub.getAttachedServers()).not.toContain(serverName);
    });

    test('should integrate with orchestrator for tool-call processing', async () => {
      const serverName = 'orchestrator-test';
      await mcpHub.attachServer(serverName, TEST_SERVER_URL);
      
      orchestrator.setMcpHub(mcpHub);
      
      const message = `
        I'll read that file for you.
        {"tool_call": {"server": "${serverName}", "name": "read_file", "input": {"path": "/test.txt"}}}
      `;
      
      const processedMessage = await orchestrator.processMessage(message);
      
      expect(processedMessage).toContain('Tool executed');
      expect(processedMessage).toContain('/test.txt');
    });
  });
});

// Helper function to start mock MCP server
async function startMockMcpServer(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      
      if (req.url === '/tools' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify([
          { name: 'echo', description: 'Echo input' },
          { name: 'read_file', description: 'Read file contents' },
          { name: 'test_tool', description: 'Test tool' },
          { name: 'concurrent_tool', description: 'Concurrent test' },
          { name: 'slow_tool', description: 'Slow operation' },
          { name: 'error_tool', description: 'Error test' },
          { name: 'dangerous_tool', description: 'Requires permission' },
          { name: 'safe_tool', description: 'Safe operation' },
          { name: 'ask_tool', description: 'Prompts for permission' },
          { name: 'isolated_tool', description: 'Isolation test' },
          { name: 'retry_tool', description: 'Retry test' }
        ]));
      } else if (req.url === '/execute' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          const { tool, input } = JSON.parse(body);
          
          // Simulate different tool behaviors
          if (tool === 'error_tool') {
            res.writeHead(200);
            res.end(JSON.stringify({
              success: false,
              error: 'Simulated error'
            }));
          } else if (tool === 'slow_tool') {
            setTimeout(() => {
              res.writeHead(200);
              res.end(JSON.stringify({
                success: true,
                output: 'Slow operation complete'
              }));
            }, input.delay || 1000);
          } else if (tool === 'echo') {
            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              output: `Echo: ${input.message}`
            }));
          } else if (tool === 'concurrent_tool') {
            setTimeout(() => {
              res.writeHead(200);
              res.end(JSON.stringify({
                success: true,
                output: `Concurrent result for id: ${input.id}`
              }));
            }, 100);
          } else if (tool === 'isolated_tool') {
            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              output: `Isolated: ${input.value}`
            }));
          } else {
            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              output: `Executed ${tool} with input: ${JSON.stringify(input)}`
            }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(port, () => {
      resolve(server);
    });
  });
}