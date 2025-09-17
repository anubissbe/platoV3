import { RuntimeOrchestrator } from "../../runtime/orchestrator";
import { ProfileManager } from "../ProfileManager";
import { PermissionManager } from "../PermissionManager";
import { AuditLogger } from "../AuditLogger";
import { PermissionQuery, Profile, PermissionAction } from "../types";

// Mock filesystem for testing
jest.mock("fs/promises");
jest.mock("../../integrations/mcp");

describe("System Integration Tests", () => {
  let orchestrator: RuntimeOrchestrator;
  let profileManager: ProfileManager;
  let permissionManager: PermissionManager;
  let auditLogger: AuditLogger;

  beforeEach(async () => {
    // Initialize core components
    profileManager = new ProfileManager();
    auditLogger = new AuditLogger({
      logDirectory: ".plato/audit-test",
      maxFileSize: 1024 * 1024,
      maxArchiveFiles: 5,
    });

    permissionManager = new PermissionManager({
      profileManager,
      auditLogger,
      configPath: ".plato/permissions-test.yml",
    });

    orchestrator = new RuntimeOrchestrator();

    // Setup test profile
    const testProfile: Profile = {
      name: "test",
      description: "Test profile",
      activation: { branch_pattern: "test/*" },
      defaults: {
        fs_write: "prompt",
        fs_read: "allow",
        shell_execute: "deny",
        network_request: "allow",
      },
      rules: [],
      isActive: true,
    };

    await profileManager.createProfile(testProfile);
    await profileManager.switchProfile("test");
  });

  afterEach(async () => {
    await permissionManager.cleanup?.();
    await auditLogger.cleanup?.();
    await profileManager.cleanup?.();
  });

  describe("RuntimeOrchestrator Integration", () => {
    it("should integrate permission manager with orchestrator", async () => {
      // Test that orchestrator can use permission manager
      const query: PermissionQuery = {
        tool: "fs_write",
        path: "/test/file.txt",
        action: "write",
        context: {
          user_id: "test-user",
          session_id: "test-session",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      const result = await permissionManager.checkPermission(query);

      expect(result).toBeDefined();
      expect(result.action).toBeOneOf(["allow", "deny", "prompt"]);
      expect(result.query).toEqual(query);
    });

    it("should handle permission denials in orchestrator", async () => {
      // Test orchestrator behavior when permissions are denied
      const restrictiveQuery: PermissionQuery = {
        tool: "shell_execute",
        path: "/bin/rm",
        action: "execute",
        arguments: ["-rf", "/"],
        context: {
          user_id: "test-user",
          session_id: "test-session",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      const result = await permissionManager.checkPermission(restrictiveQuery);

      expect(result.action).toBe("deny");
      expect(result.reason).toContain("safety");
    });

    it("should audit orchestrator tool calls", async () => {
      const query: PermissionQuery = {
        tool: "fs_read",
        path: "/test/config.json",
        action: "read",
        context: {
          user_id: "test-user",
          session_id: "test-session",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      await permissionManager.checkPermission(query);

      // Verify audit log entry was created
      const entries = await auditLogger.search({
        tool: "fs_read",
        limit: 1,
      });

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].tool).toBe("fs_read");
      expect(entries[0].path).toBe("/test/config.json");
    });
  });

  describe("MCP Bridge Integration", () => {
    it("should enforce permissions on MCP tool calls", async () => {
      // Test MCP server tool call permissions
      const mcpQuery: PermissionQuery = {
        tool: "mcp_tool",
        server: "test-server",
        action: "call",
        arguments: { method: "dangerous_operation" },
        context: {
          user_id: "test-user",
          session_id: "test-session",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      const result = await permissionManager.checkPermission(mcpQuery);

      expect(result).toBeDefined();
      expect(["allow", "deny", "prompt"]).toContain(result.action);
    });

    it("should handle per-server permission controls", async () => {
      // Test server-specific permissions
      const serverQuery: PermissionQuery = {
        tool: "mcp_server_access",
        server: "restricted-server",
        action: "connect",
        context: {
          user_id: "test-user",
          session_id: "test-session",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      const result = await permissionManager.checkPermission(serverQuery);

      expect(result).toBeDefined();
      expect(result.query.server).toBe("restricted-server");
    });

    it("should audit MCP server interactions", async () => {
      const mcpQuery: PermissionQuery = {
        tool: "mcp_call",
        server: "audit-test-server",
        action: "execute",
        context: {
          user_id: "test-user",
          session_id: "test-session",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      await permissionManager.checkPermission(mcpQuery);

      // Verify MCP audit logging
      const entries = await auditLogger.search({
        server: "audit-test-server",
        limit: 1,
      });

      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe("Configuration System Integration", () => {
    it("should load profiles from config system", async () => {
      // Test config integration
      const profiles = profileManager.getAllProfiles();
      expect(profiles.length).toBeGreaterThan(0);

      const testProfile = profiles.find((p) => p.name === "test");
      expect(testProfile).toBeDefined();
      expect(testProfile?.isActive).toBe(true);
    });

    it("should persist permission changes to config", async () => {
      // Test config persistence
      const newProfile: Profile = {
        name: "integration-test",
        description: "Integration test profile",
        activation: { environment_var: "NODE_ENV=test" },
        defaults: {
          fs_write: "allow",
          fs_read: "allow",
          shell_execute: "prompt",
          network_request: "deny",
        },
        rules: [],
        isActive: false,
      };

      await profileManager.createProfile(newProfile);

      // Verify profile was saved
      const savedProfiles = profileManager.getAllProfiles();
      const savedProfile = savedProfiles.find(
        (p) => p.name === "integration-test",
      );

      expect(savedProfile).toBeDefined();
      expect(savedProfile?.defaults.network_request).toBe("deny");
    });

    it("should handle config reload without restart", async () => {
      // Test hot reload capability
      const initialProfiles = profileManager.getAllProfiles();
      const initialCount = initialProfiles.length;

      // Simulate config change
      await profileManager.reloadConfiguration();

      const reloadedProfiles = profileManager.getAllProfiles();
      expect(reloadedProfiles.length).toBe(initialCount);
    });
  });

  describe("Git Integration", () => {
    it("should provide gitignore-based suggestions", async () => {
      // Test Git integration for path suggestions
      const gitQuery: PermissionQuery = {
        tool: "fs_write",
        path: "node_modules/package/file.js",
        action: "write",
        context: {
          user_id: "test-user",
          session_id: "test-session",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      const result = await permissionManager.checkPermission(gitQuery);

      // Should suggest denial for node_modules writes
      expect(result.action).toBeOneOf(["deny", "prompt"]);
      if (result.action === "prompt") {
        expect(result.suggestion).toContain("node_modules");
      }
    });

    it("should handle branch-based profile activation", async () => {
      // Test branch pattern matching
      const currentProfile = profileManager.getCurrentProfile();
      expect(currentProfile?.name).toBe("test");

      // Verify activation pattern
      expect(currentProfile?.activation.branch_pattern).toBe("test/*");
    });
  });

  describe("Slash Command Integration", () => {
    it("should respect permissions for slash commands", async () => {
      // Test slash command permission enforcement
      const commandQuery: PermissionQuery = {
        tool: "slash_command",
        action: "execute",
        arguments: { command: "dangerous_operation" },
        context: {
          user_id: "test-user",
          session_id: "test-session",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      const result = await permissionManager.checkPermission(commandQuery);

      expect(result).toBeDefined();
      expect(["allow", "deny", "prompt"]).toContain(result.action);
    });
  });

  describe("Migration and Compatibility", () => {
    it("should migrate existing permission rules", async () => {
      // Test rule migration from old format
      const legacyRules = [
        { pattern: "*.js", action: "allow" as PermissionAction },
        { pattern: "/etc/*", action: "deny" as PermissionAction },
      ];

      // Simulate migration
      for (const rule of legacyRules) {
        await profileManager.addRule("test", rule);
      }

      const profile = profileManager.getCurrentProfile();
      expect(profile?.rules.length).toBeGreaterThanOrEqual(2);
    });

    it("should maintain backward compatibility", async () => {
      // Test backward compatibility with existing permissions
      const compatQuery: PermissionQuery = {
        tool: "legacy_tool",
        action: "execute",
        context: {
          user_id: "test-user",
          session_id: "test-session",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      const result = await permissionManager.checkPermission(compatQuery);

      expect(result).toBeDefined();
      expect(result.action).toBeOneOf(["allow", "deny", "prompt"]);
    });
  });

  describe("End-to-End Integration", () => {
    it("should handle complete permission workflow", async () => {
      // Test full workflow from query to audit
      const workflowQuery: PermissionQuery = {
        tool: "fs_write",
        path: "/test/integration.txt",
        action: "write",
        arguments: { content: "test content" },
        context: {
          user_id: "integration-test",
          session_id: "workflow-test",
          timestamp: new Date(),
          workspace_path: "/test",
        },
      };

      // 1. Check permission
      const permission = await permissionManager.checkPermission(workflowQuery);
      expect(permission).toBeDefined();

      // 2. Verify audit entry
      const auditEntries = await auditLogger.search({
        session_id: "workflow-test",
        limit: 1,
      });
      expect(auditEntries.length).toBeGreaterThan(0);

      // 3. Check statistics
      const stats = await auditLogger.getStatistics();
      expect(stats.totalEntries).toBeGreaterThan(0);
    });

    it("should handle performance under load", async () => {
      // Test performance with multiple concurrent requests
      const queries: PermissionQuery[] = Array.from({ length: 10 }, (_, i) => ({
        tool: "fs_read",
        path: `/test/file${i}.txt`,
        action: "read",
        context: {
          user_id: "perf-test",
          session_id: `perf-${i}`,
          timestamp: new Date(),
          workspace_path: "/test",
        },
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        queries.map((query) => permissionManager.checkPermission(query)),
      );
      const endTime = Date.now();

      expect(results.length).toBe(10);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1s

      results.forEach((result) => {
        expect(["allow", "deny", "prompt"]).toContain(result.action);
      });
    });
  });
});

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}

expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be one of [${expected.join(", ")}]`
          : `expected ${received} to be one of [${expected.join(", ")}]`,
    };
  },
});
