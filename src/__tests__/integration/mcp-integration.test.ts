/**
 * MCP Integration Tests
 * Comprehensive test suite for MCP server integration functionality
 */

import {
  attachServer,
  detachServer,
  listServers,
  listTools,
  callTool,
  health,
  cleanupMCPPermissionSystem,
} from "../../integrations/mcp.js";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import http from "http";
import { AddressInfo } from "net";

describe("MCP Integration Tests", () => {
  let tempDir: string;
  let mockServer: http.Server;
  let serverPort: number;
  let serverUrl: string;

  beforeAll(async () => {
    // Create temporary directory for test configuration
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "plato-mcp-test-"));
    process.chdir(tempDir);

    // Create .plato directory structure
    await fs.mkdir(".plato", { recursive: true });
    await fs.mkdir(".plato/audit", { recursive: true });
    await fs.mkdir(".plato/audit/mcp", { recursive: true });

    // Create default permission configuration for MCP operations
    const permissionsConfig = {
      permissions: {
        profiles: {
          default: {
            name: "default",
            description: "Default profile for MCP operations",
            defaults: {
              mcp_operation: "allow",
              fs_patch: "allow",
            },
            rules: [],
            context: {
              always: true,
            },
          },
        },
      },
    };

    await fs.writeFile(
      path.join(".plato", "config.yaml"),
      `permissions:\n  profiles:\n    default:\n      name: default\n      description: Default profile for MCP operations\n      defaults:\n        mcp_operation: allow\n        fs_patch: allow\n      rules: []\n      context:\n        always: true\n`,
    );

    // Setup mock MCP server
    mockServer = await createMockMCPServer();
    serverPort = (mockServer.address() as AddressInfo).port;
    serverUrl = `http://localhost:${serverPort}`;
  });

  afterAll(async () => {
    // Cleanup mock server
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    }

    // Cleanup MCP permission system
    await cleanupMCPPermissionSystem();

    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clear any existing servers
    const existingServers = await listServers();
    for (const server of existingServers) {
      await detachServer(server.id).catch(() => {}); // Ignore errors
    }
  });

  describe("Server Management", () => {
    it("should attach an MCP server", async () => {
      await attachServer("test-server", serverUrl);

      const servers = await listServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]).toEqual({
        id: "test-server",
        url: serverUrl,
      });
    });

    it("should prevent duplicate server attachment", async () => {
      await attachServer("test-server", serverUrl);

      await expect(attachServer("test-server", serverUrl)).rejects.toThrow(
        "mcp server exists: test-server",
      );
    });

    it("should detach an MCP server", async () => {
      await attachServer("test-server", serverUrl);
      await detachServer("test-server");

      const servers = await listServers();
      expect(servers).toHaveLength(0);
    });

    it("should list multiple servers", async () => {
      await attachServer("server1", serverUrl);
      await attachServer("server2", `${serverUrl}/alt`);

      const servers = await listServers();
      expect(servers).toHaveLength(2);
      expect(servers.map((s) => s.id).sort()).toEqual(["server1", "server2"]);
    });
  });

  describe("Server Health Monitoring", () => {
    it("should check health of all servers", async () => {
      await attachServer("test-server", serverUrl);

      const healthResults = await health();
      expect(healthResults).toHaveLength(1);
      expect(healthResults[0]).toEqual({
        id: "test-server",
        ok: true,
        status: 200,
      });
    });

    it("should check health of specific server", async () => {
      await attachServer("test-server", serverUrl);

      const healthResults = await health("test-server");
      expect(healthResults).toHaveLength(1);
      expect(healthResults[0].id).toBe("test-server");
      expect(healthResults[0].ok).toBe(true);
    });

    it("should report unhealthy server", async () => {
      await attachServer("bad-server", "http://localhost:99999");

      const healthResults = await health("bad-server");
      expect(healthResults).toHaveLength(1);
      expect(healthResults[0]).toEqual({
        id: "bad-server",
        ok: false,
      });
    });
  });

  describe("Tool Discovery", () => {
    it("should list tools from server", async () => {
      await attachServer("test-server", serverUrl);

      const toolsList = await listTools("test-server");
      expect(toolsList).toHaveLength(1);
      expect(toolsList[0]).toEqual({
        server: "test-server",
        tools: [
          {
            name: "echo",
            description: "Echo input",
            input_schema: {
              type: "object",
              properties: {
                text: { type: "string" },
              },
            },
          },
          {
            name: "sum",
            description: "Sum numbers",
            input_schema: {
              type: "object",
              properties: {
                a: { type: "number" },
                b: { type: "number" },
              },
            },
          },
        ],
      });
    });

    it("should list tools from all servers when no server specified", async () => {
      await attachServer("server1", serverUrl);
      await attachServer("server2", serverUrl);

      const toolsList = await listTools();
      expect(toolsList).toHaveLength(2);
      expect(toolsList.map((t) => t.server).sort()).toEqual([
        "server1",
        "server2",
      ]);
    });

    it("should handle server with no tools gracefully", async () => {
      // Create a server that returns empty tools
      const emptyServer = http.createServer((req, res) => {
        if (
          req.method === "GET" &&
          (req.url === "/tools" || req.url === "/.well-known/mcp/tools")
        ) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ tools: [] }));
          return;
        }
        res.writeHead(404);
        res.end();
      });

      await new Promise<void>((resolve, reject) => {
        emptyServer.listen(0, () => {
          resolve();
        });
        emptyServer.on("error", reject);
      });

      const emptyPort = (emptyServer.address() as AddressInfo).port;
      const emptyUrl = `http://localhost:${emptyPort}`;

      try {
        await attachServer("empty-server", emptyUrl);

        const toolsList = await listTools("empty-server");
        expect(toolsList).toHaveLength(1);
        expect(toolsList[0]).toEqual({
          server: "empty-server",
          tools: [],
        });
      } finally {
        emptyServer.close();
      }
    });
  });

  describe("Tool Execution", () => {
    beforeEach(async () => {
      await attachServer("test-server", serverUrl);
    });

    it("should execute echo tool", async () => {
      const result = await callTool("test-server", "echo", {
        text: "hello world",
      });

      expect(result).toEqual({
        ok: true,
        output: { text: "hello world" },
      });
    });

    it("should execute sum tool", async () => {
      const result = await callTool("test-server", "sum", { a: 5, b: 3 });

      expect(result).toEqual({
        ok: true,
        result: 8,
      });
    });

    it("should handle tool execution errors", async () => {
      await expect(
        callTool("test-server", "nonexistent", {}),
      ).rejects.toThrow();
    });

    it("should handle nonexistent server", async () => {
      await expect(
        callTool("nonexistent-server", "echo", { text: "test" }),
      ).rejects.toThrow("no mcp server: nonexistent-server");
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should retry on retryable errors", async () => {
      let attemptCount = 0;
      const flakyServer = http.createServer((req, res) => {
        if (
          req.method === "GET" &&
          (req.url === "/tools" || req.url === "/.well-known/mcp/tools")
        ) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              tools: [
                { name: "flaky", description: "Flaky tool", input_schema: {} },
              ],
            }),
          );
          return;
        }

        if (req.method === "POST" && req.url === "/tools/flaky") {
          attemptCount++;
          if (attemptCount < 3) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Bad Gateway" }));
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, result: "success" }));
          }
          return;
        }

        res.writeHead(404);
        res.end();
      });

      await new Promise<void>((resolve, reject) => {
        flakyServer.listen(0, () => {
          resolve();
        });
        flakyServer.on("error", reject);
      });

      const flakyPort = (flakyServer.address() as AddressInfo).port;
      const flakyUrl = `http://localhost:${flakyPort}`;

      try {
        await attachServer("flaky-server", flakyUrl);

        const result = await callTool("flaky-server", "flaky", {});
        expect(result).toEqual({
          ok: true,
          result: "success",
        });
        expect(attemptCount).toBe(3);
      } finally {
        flakyServer.close();
      }
    });

    it("should not retry on non-retryable errors", async () => {
      const unauthorizedServer = http.createServer((req, res) => {
        if (
          req.method === "GET" &&
          (req.url === "/tools" || req.url === "/.well-known/mcp/tools")
        ) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              tools: [
                {
                  name: "unauthorized",
                  description: "Unauthorized tool",
                  input_schema: {},
                },
              ],
            }),
          );
          return;
        }

        if (req.method === "POST") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        res.writeHead(404);
        res.end();
      });

      await new Promise<void>((resolve, reject) => {
        unauthorizedServer.listen(0, () => {
          resolve();
        });
        unauthorizedServer.on("error", reject);
      });

      const unauthorizedPort = (unauthorizedServer.address() as AddressInfo)
        .port;
      const unauthorizedUrl = `http://localhost:${unauthorizedPort}`;

      try {
        await attachServer("unauthorized-server", unauthorizedUrl);

        await expect(
          callTool("unauthorized-server", "unauthorized", {}),
        ).rejects.toThrow("Tool call failed: 401 Unauthorized");
      } finally {
        unauthorizedServer.close();
      }
    });
  });

  describe("MCP Protocol Compliance", () => {
    it("should support standard MCP endpoint formats", async () => {
      await attachServer("test-server", serverUrl);

      // Both /tools and /.well-known/mcp/tools should work
      const toolsList = await listTools("test-server");
      expect(toolsList[0].tools).toHaveLength(2);
    });

    it("should handle proper JSON serialization", async () => {
      await attachServer("test-server", serverUrl);

      const complexInput = {
        text: "hello",
        nested: {
          array: [1, 2, 3],
          object: { key: "value" },
        },
      };

      const result = await callTool("test-server", "echo", complexInput);
      expect(result.output).toEqual(complexInput);
    });
  });
});

/**
 * Create a mock MCP server for testing
 */
async function createMockMCPServer(): Promise<http.Server> {
  const tools = [
    {
      id: "echo",
      name: "echo",
      description: "Echo input",
      input_schema: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
      },
    },
    {
      id: "sum",
      name: "sum",
      description: "Sum numbers",
      input_schema: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
      },
    },
  ];

  const server = http.createServer((req, res) => {
    const url = req.url || "/";

    // Handle CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (
      req.method === "GET" &&
      (url === "/tools" || url === "/.well-known/mcp/tools")
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tools: tools.map(({ id, ...rest }) => rest) }));
      return;
    }

    if (req.method === "POST" && url.startsWith("/tools/")) {
      const toolName = decodeURIComponent(url.split("/").pop() || "");
      let body = "";

      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          const input = payload.input || payload || {};

          if (toolName === "echo") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, output: input }));
            return;
          }

          if (toolName === "sum") {
            const result = Number(input.a || 0) + Number(input.b || 0);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, result }));
            return;
          }

          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Tool not found" }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
      return;
    }

    // HEAD request for health checks
    if (req.method === "HEAD") {
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      resolve(server);
    });
    server.on("error", reject);
  });
}
