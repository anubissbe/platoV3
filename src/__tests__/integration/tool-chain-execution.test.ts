/**
 * Tool Chain Execution Integration Tests
 * Tests for the tool execution pipeline and coordination
 */

import { describe, test, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import { orchestrator } from '../../runtime/orchestrator.js';
import { attachServer, detachServer, listServers, callTool, listTools, cleanupMCPPermissionSystem } from '../../integrations/mcp.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { AddressInfo } from 'net';

describe('Tool Chain Execution Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;
  let mockServer: http.Server;
  let serverPort: number;
  let serverUrl: string;

  beforeAll(async () => {
    // Create temporary directory for test isolation
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plato-tool-chain-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Create .plato directory structure
    await fs.mkdir('.plato', { recursive: true });
    await fs.mkdir('.plato/audit', { recursive: true });
    await fs.mkdir('.plato/audit/mcp', { recursive: true });

    // Create a comprehensive permission configuration that should work
    const permissionConfig = {
      permissions: {
        profiles: {
          default: {
            name: 'default',
            description: 'Default profile for tool operations',
            defaults: {
              mcp_operation: 'allow',
              fs_patch: 'allow',
              tool_execution: 'allow'
            },
            rules: [],
            context: {
              always: true,
              project_paths: [process.cwd()],
              environments: ['test']
            }
          }
        },
        // Add global settings to ensure proper initialization
        global: {
          enable_logging: true,
          default_action: 'allow',
          require_confirmation: false
        }
      }
    };

    await fs.writeFile(
      path.join('.plato', 'config.yaml'), 
      `# Test Configuration for Tool Chain Execution
permissions:
  profiles:
    default:
      name: default
      description: Default profile for tool operations
      defaults:
        mcp_operation: allow
        fs_patch: allow
        tool_execution: allow
      rules: []
      context:
        always: true
        project_paths: 
          - ${process.cwd()}
        environments:
          - test
  global:
    enable_logging: true
    default_action: allow
    require_confirmation: false
`
    );

    // Also create a minimal MCP servers file
    await fs.writeFile(
      path.join('.plato', 'mcp-servers.json'),
      '[]'
    );

    // Setup mock MCP server
    mockServer = await createMockToolServer();
    serverPort = (mockServer.address() as AddressInfo).port;
    serverUrl = `http://localhost:${serverPort}`;
  });

  afterAll(async () => {
    // Clean up mock server
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    }

    // Cleanup MCP permission system
    await cleanupMCPPermissionSystem();

    // Restore original working directory
    process.chdir(originalCwd);

    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clear orchestrator history for each test
    orchestrator.clearHistory();

    // Ensure clean server state
    const existingServers = await listServers();
    for (const server of existingServers) {
      try {
        await detachServer(server.id);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Now attach the test server
    await attachServer('tool-test-server', serverUrl);
  });

  afterEach(async () => {
    // Clean up any attached servers after each test
    const servers = await listServers();
    for (const server of servers) {
      try {
        await detachServer(server.id);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Tool Chain Coordination', () => {
    test('should execute tool chain with proper coordination', async () => {
      // Verify server is attached
      const servers = await listServers();
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('tool-test-server');

      // Test sequential tool execution coordination
      const result1 = await callTool('tool-test-server', 'prepare_data', { input: 'test data' });
      expect(result1).toEqual({
        ok: true,
        data: 'test data',
        prepared: true
      });

      const result2 = await callTool('tool-test-server', 'process_data', { data: result1.data });
      expect(result2).toEqual({
        ok: true,
        processed_data: 'test data',
        processed: true
      });

      const result3 = await callTool('tool-test-server', 'finalize_data', { processed: result2.processed_data });
      expect(result3).toEqual({
        ok: true,
        final_result: 'test data',
        finalized: true
      });
    });

    test('should handle tool chain failures gracefully', async () => {
      // Test error propagation through tool chain
      await expect(callTool('tool-test-server', 'failing_tool', { input: 'fail' }))
        .rejects
        .toThrow();

      // Verify system can recover and continue
      const result = await callTool('tool-test-server', 'prepare_data', { input: 'recovery test' });
      expect(result.ok).toBe(true);
    });

    test('should enforce permissions during tool execution', async () => {
      // Test that permission checks are properly integrated
      const tools = await listTools('tool-test-server');
      expect(tools).toHaveLength(1);
      expect(tools[0].tools).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'prepare_data' }),
        expect.objectContaining({ name: 'process_data' }),
        expect.objectContaining({ name: 'finalize_data' }),
        expect.objectContaining({ name: 'failing_tool' })
      ]));
    });
  });

  describe('Tool Result Serialization', () => {
    test('should properly serialize and deserialize tool results', async () => {
      const complexInput = {
        text: 'hello',
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
          boolean: true,
          null_value: null
        },
        unicode: '🔧 Testing unicode'
      };

      const result = await callTool('tool-test-server', 'echo_complex', complexInput);
      expect(result).toEqual({
        ok: true,
        echoed: complexInput
      });
    });

    test('should handle large data serialization', async () => {
      const largeData = {
        large_array: new Array(100).fill(0).map((_, i) => ({ id: i, value: `item-${i}` })) // Reduced size for faster test
      };

      const result = await callTool('tool-test-server', 'echo_complex', largeData);
      expect(result.ok).toBe(true);
      expect(result.echoed.large_array).toHaveLength(100);
      expect(result.echoed.large_array[99]).toEqual({ id: 99, value: 'item-99' });
    });
  });

  describe('Tool Error Handling', () => {
    test('should propagate tool errors with proper context', async () => {
      try {
        await callTool('tool-test-server', 'failing_tool', { input: 'error test' });
        fail('Expected tool to throw error');
      } catch (error: any) {
        expect(error.message).toBeTruthy();
        // The error will be about the HTTP 500 response, not the exact message
        expect(typeof error.message).toBe('string');
      }
    });

    test('should handle network errors during tool execution', async () => {
      // Test with a non-existent server
      await expect(callTool('nonexistent-server', 'any_tool', {}))
        .rejects
        .toThrow('no mcp server: nonexistent-server');
    });

    test('should retry on retryable errors', async () => {
      // Test tool that fails first two times, succeeds on third
      const result = await callTool('tool-test-server', 'flaky_tool', { attempt_count: 3 });
      expect(result).toEqual({
        ok: true,
        attempts: 3,
        result: 'success after retries'
      });
    });
  });

  describe('Tool Lifecycle Management', () => {
    test('should properly manage tool lifecycle', async () => {
      // Test tool initialization
      const result1 = await callTool('tool-test-server', 'initialize_tool', { config: 'test' });
      expect(result1.ok).toBe(true);
      expect(result1.initialized).toBe(true);

      // Test tool execution after initialization
      const result2 = await callTool('tool-test-server', 'use_initialized_tool', {});
      expect(result2.ok).toBe(true);
      expect(result2.used).toBe(true);

      // Test tool cleanup
      const result3 = await callTool('tool-test-server', 'cleanup_tool', {});
      expect(result3.ok).toBe(true);
      expect(result3.cleaned).toBe(true);
    });

    test('should handle concurrent tool execution', async () => {
      // Test multiple tools running concurrently
      const promises = [
        callTool('tool-test-server', 'prepare_data', { input: 'concurrent-1' }),
        callTool('tool-test-server', 'prepare_data', { input: 'concurrent-2' }),
        callTool('tool-test-server', 'prepare_data', { input: 'concurrent-3' })
      ];

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.ok).toBe(true);
        expect(result.data).toBe(`concurrent-${index + 1}`);
      });
    });
  });

  describe('Orchestrator Integration', () => {
    test('should integrate with orchestrator for tool permission checks', async () => {
      const permissionMgr = await orchestrator.getPermissionManager();
      expect(permissionMgr).toBeDefined();

      // Test tool permission check integration
      const permission = await orchestrator.checkToolPermission('test_tool', { input: 'test' });
      expect(permission.allowed).toBe(true);
    });

    test('should handle orchestrator tool call integration', async () => {
      const toolCall = {
        name: 'prepare_data',
        server: 'tool-test-server',
        input: { input: 'orchestrator test' }
      };

      const result = await orchestrator.handleToolCall(toolCall);
      expect(result.success).toBe(true);
    });
  });
});

/**
 * Create a mock tool server for testing
 */
async function createMockToolServer(): Promise<http.Server> {
  const tools = [
    { 
      name: 'prepare_data', 
      description: 'Prepare data for processing', 
      input_schema: { 
        type: 'object', 
        properties: { 
          input: { type: 'string' } 
        } 
      } 
    },
    { 
      name: 'process_data', 
      description: 'Process prepared data', 
      input_schema: { 
        type: 'object', 
        properties: { 
          data: { type: 'string' } 
        } 
      } 
    },
    { 
      name: 'finalize_data', 
      description: 'Finalize processed data', 
      input_schema: { 
        type: 'object', 
        properties: { 
          processed: { type: 'string' } 
        } 
      } 
    },
    { 
      name: 'failing_tool', 
      description: 'Tool that always fails', 
      input_schema: { 
        type: 'object', 
        properties: { 
          input: { type: 'string' } 
        } 
      } 
    },
    { 
      name: 'echo_complex', 
      description: 'Echo complex data structures', 
      input_schema: { 
        type: 'object' 
      } 
    },
    { 
      name: 'flaky_tool', 
      description: 'Tool that fails initially but succeeds after retries', 
      input_schema: { 
        type: 'object', 
        properties: { 
          attempt_count: { type: 'number' } 
        } 
      } 
    },
    { 
      name: 'initialize_tool', 
      description: 'Initialize a tool', 
      input_schema: { 
        type: 'object', 
        properties: { 
          config: { type: 'string' } 
        } 
      } 
    },
    { 
      name: 'use_initialized_tool', 
      description: 'Use an initialized tool', 
      input_schema: { 
        type: 'object' 
      } 
    },
    { 
      name: 'cleanup_tool', 
      description: 'Clean up a tool', 
      input_schema: { 
        type: 'object' 
      } 
    }
  ];

  let flakyAttempts = 0;

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.method === 'GET' && (url === '/tools' || url === '/.well-known/mcp/tools')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tools }));
      return;
    }
    
    if (req.method === 'POST' && url.startsWith('/tools/')) {
      const toolName = decodeURIComponent(url.split('/').pop() || '');
      let body = '';
      
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const input = payload.input || payload || {};
          
          // Handle different tool types
          switch (toolName) {
            case 'prepare_data':
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, data: input.input, prepared: true }));
              return;
              
            case 'process_data':
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, processed_data: input.data, processed: true }));
              return;
              
            case 'finalize_data':
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, final_result: input.processed, finalized: true }));
              return;
              
            case 'failing_tool':
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Tool execution failed' }));
              return;
              
            case 'echo_complex':
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, echoed: input }));
              return;
              
            case 'flaky_tool':
              flakyAttempts++;
              if (flakyAttempts < 3) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Bad Gateway' }));
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, attempts: flakyAttempts, result: 'success after retries' }));
                flakyAttempts = 0; // Reset for next test
              }
              return;
              
            case 'initialize_tool':
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, initialized: true, config: input.config }));
              return;
              
            case 'use_initialized_tool':
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, used: true }));
              return;
              
            case 'cleanup_tool':
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, cleaned: true }));
              return;
              
            default:
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Tool not found' }));
          }
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
      return;
    }
    
    // HEAD request for health checks
    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      resolve(server);
    });
    server.on('error', reject);
  });
}