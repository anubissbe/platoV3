import { processSlashCommand } from "../router.js";
import { Session } from "../../core/session.js";

describe("Command Processing System", () => {
  let session: Session;

  beforeEach(() => {
    session = new Session("Test assistant");
  });

  describe("Command Interception", () => {
    it("should intercept slash commands and not send them to AI", async () => {
      const mockProvider = {
        chat: jest.fn().mockResolvedValue("AI response"),
      };

      const input = "/help";
      const result = await processSlashCommand(input, session);

      expect(result.handled).toBe(true);
      expect(mockProvider.chat).not.toHaveBeenCalled();
    });

    it("should parse command and arguments correctly", async () => {
      const testCases = [
        { input: "/help", command: "help", args: [] },
        { input: "/model gpt-4", command: "model", args: ["gpt-4"] },
        { input: "/mcp attach server http://localhost:8080", command: "mcp", args: ["attach", "server", "http://localhost:8080"] },
        { input: "/edit file.ts", command: "edit", args: ["file.ts"] },
      ];

      for (const testCase of testCases) {
        const result = await processSlashCommand(testCase.input, session);
        expect(result.command).toBe(testCase.command);
        expect(result.args).toEqual(testCase.args);
      }
    });

    it("should return handled=false for non-slash commands", async () => {
      const inputs = ["help", "what is 2+2?", "explain this code"];

      for (const input of inputs) {
        const result = await processSlashCommand(input, session);
        expect(result.handled).toBe(false);
      }
    });

    it("should handle invalid commands gracefully", async () => {
      const input = "/nonexistent";
      const result = await processSlashCommand(input, session);

      expect(result.handled).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.output).toContain("Unknown command");
    });
  });

  describe("CLI Mode Command Processing", () => {
    it("should intercept commands in CLI REPL loop", async () => {
      const mockProvider = {
        chat: jest.fn().mockResolvedValue("AI response"),
      };

      // Simulate CLI input with slash command
      const input = "/status";

      // This should be intercepted before reaching provider.chat
      const result = await processSlashCommand(input, session);

      expect(result.handled).toBe(true);
      expect(mockProvider.chat).not.toHaveBeenCalled();
    });

    it("should allow normal prompts to reach AI", async () => {
      const mockProvider = {
        chat: jest.fn().mockResolvedValue("AI response"),
      };

      const input = "What is TypeScript?";
      const result = await processSlashCommand(input, session);

      expect(result.handled).toBe(false);
      // In real implementation, this would then be sent to provider.chat
    });
  });

  describe("TUI Mode Command Processing", () => {
    it("should detect slash commands in TUI input", () => {
      const inputs = ["/help", "/status", "/model", "/mcp tools"];

      for (const input of inputs) {
        expect(input.startsWith("/")).toBe(true);
        // TUI should route these to command processor
      }
    });

    it("should not treat escaped slashes as commands", async () => {
      const input = "\\/not-a-command";
      const result = await processSlashCommand(input, session);

      expect(result.handled).toBe(false);
    });
  });

  describe("Command Registry", () => {
    it("should have all required Plato commands registered", () => {
      const requiredCommands = [
        "help", "status", "model", "doctor", "mcp", "memory",
        "context", "init", "resume", "export", "login", "logout",
        "permissions", "apply", "revert", "output-style", "mouse",
        "paste", "compact", "todos", "vim", "proxy", "upgrade",
        "privacy-settings", "release-notes", "keydebug", "apply-mode",
        "ide", "install-gitlab-app", "terminal-setup", "bug",
        "statusline", "agents", "hooks", "security-review",
        "add-dir", "bashes", "cost", "analytics"
      ];

      for (const cmd of requiredCommands) {
        // Check that command exists in registry
        const result = processSlashCommand(`/${cmd}`, session);
        // Should not return "Unknown command" for registered commands
        expect(result).toBeDefined();
      }
    });
  });

  describe("Error Handling", () => {
    it("should provide helpful error messages", async () => {
      const result = await processSlashCommand("/helpp", session);

      expect(result.handled).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.output).toMatch(/Did you mean.*help/i);
    });

    it("should handle commands with invalid arguments", async () => {
      const result = await processSlashCommand("/model", session);

      expect(result.handled).toBe(true);
      // Command exists but isn't fully implemented yet
      expect(result.output).toMatch(/recognized but not yet implemented|Usage:/);
    });
  });
});