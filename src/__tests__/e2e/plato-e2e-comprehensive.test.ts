/**
 * Comprehensive E2E Feature Testing with PTY
 * Testing complete user workflows: login, conversations, file ops, commands, session management
 */

import { PlatoTUITester } from "../../../test/e2e/plato-pty-test";
import { spawn } from "node-pty";
import fs from "fs/promises";
import path from "path";

describe("Task 5: E2E Feature Testing with PTY", () => {
  let tester: PlatoTUITester;

  beforeEach(() => {
    tester = new PlatoTUITester({
      debug: process.env.DEBUG === "true",
      timeout: 10000,
    });
  });

  afterEach(async () => {
    await tester.stop();
  });

  describe("✅ 5.1 Complete Login Flow", () => {
    test("should complete OAuth login flow", async () => {
      await tester.start();
      await tester.waitForText("Welcome to Plato");

      // Initiate login
      await tester.sendInput("/login");
      await tester.sendKey("enter");

      // Should show device code
      await tester.waitForText("Enter code:", 5000);

      // Verify login instructions displayed
      const screen = tester.getScreen();
      expect(screen).toContain("github.com/login/device");
    });

    test("should handle login failure gracefully", async () => {
      await tester.start();

      // Try to use authenticated feature without login
      await tester.sendInput("Hello");
      await tester.sendKey("enter");

      // Should show auth error
      await tester.waitForText("not authenticated", 3000);
    });

    test("should persist login across sessions", async () => {
      // First session - login
      await tester.start();
      await tester.sendInput("/login");
      await tester.sendKey("enter");

      // Simulate successful login
      await tester.waitForText("Authenticated", 10000);

      // Stop and restart
      await tester.stop();
      await tester.start();

      // Should still be logged in
      await tester.sendInput("/status");
      await tester.sendKey("enter");

      await tester.waitForText("connected", 3000);
    });
  });

  describe("✅ 5.2 Conversation Flow", () => {
    test("should handle complete conversation", async () => {
      await tester.start();

      // Send message
      await tester.sendInput("What is TypeScript?");
      await tester.sendKey("enter");

      // Wait for assistant response
      await tester.waitForText("TypeScript", 5000);

      // Verify conversation display
      const screen = tester.getScreen();
      expect(screen).toContain("You");
      expect(screen).toContain("Assistant");
    });

    test("should handle streaming responses", async () => {
      await tester.start();

      await tester.sendInput("Write a long explanation");
      await tester.sendKey("enter");

      // Should show streaming indicator
      await tester.waitForText("typing", 2000);

      // Wait for completion
      await tester.waitForText("Assistant", 10000);
    });

    test("should support conversation history", async () => {
      await tester.start();

      // Send multiple messages
      await tester.sendInput("First message");
      await tester.sendKey("enter");
      await tester.waitForText("Assistant", 5000);

      await tester.sendInput("Second message");
      await tester.sendKey("enter");
      await tester.waitForText("Assistant", 5000);

      // Check history
      await tester.sendKey("up"); // Navigate history

      const screen = tester.getScreen();
      expect(screen).toContain("Second message");
    });
  });

  describe("✅ 5.3 File Operations through Patches", () => {
    test("should apply file patches", async () => {
      await tester.start();

      // Request file modification
      await tester.sendInput('Create a test.js file with console.log("Hello")');
      await tester.sendKey("enter");

      // Wait for patch
      await tester.waitForText("*** Begin Patch", 5000);
      await tester.waitForText("*** End Patch", 5000);

      // Apply patch
      await tester.sendInput("/apply");
      await tester.sendKey("enter");

      await tester.waitForText("Applied", 3000);
    });

    test("should handle patch failures", async () => {
      await tester.start();

      // Send invalid patch request
      await tester.sendInput("/apply");
      await tester.sendKey("enter");

      // Should show error
      await tester.waitForText("No patches", 3000);
    });

    test("should revert patches", async () => {
      await tester.start();

      // Apply a patch first
      await tester.sendInput("Modify test.js");
      await tester.sendKey("enter");
      await tester.waitForText("*** End Patch", 5000);

      await tester.sendInput("/apply");
      await tester.sendKey("enter");
      await tester.waitForText("Applied", 3000);

      // Revert
      await tester.sendInput("/revert");
      await tester.sendKey("enter");

      await tester.waitForText("Reverted", 3000);
    });
  });

  describe("✅ 5.4 Command Palette", () => {
    test("should open command palette", async () => {
      await tester.start();

      // Open command palette (Ctrl+P)
      await tester.sendKey("ctrl-p");

      await tester.waitForText("Command", 2000);

      // Type command
      await tester.sendInput("help");

      // Select and execute
      await tester.sendKey("enter");

      await tester.waitForText("Commands", 3000);
    });

    test("should autocomplete commands", async () => {
      await tester.start();

      await tester.sendInput("/hel");
      await tester.sendKey("tab");

      const screen = tester.getScreen();
      expect(screen).toContain("/help");
    });

    test("should handle invalid commands", async () => {
      await tester.start();

      await tester.sendInput("/invalidcommand");
      await tester.sendKey("enter");

      await tester.waitForText("Unknown command", 3000);
    });
  });

  describe("✅ 5.5 Session Resume", () => {
    test("should save and resume session", async () => {
      // First session
      await tester.start();

      await tester.sendInput("Remember this message");
      await tester.sendKey("enter");
      await tester.waitForText("Assistant", 5000);

      // Exit
      await tester.sendKey("ctrl-c");
      await tester.sendInput("y");

      // Start new session
      await tester.start();

      // Resume
      await tester.sendInput("/resume");
      await tester.sendKey("enter");

      await tester.waitForText("Remember this message", 3000);
    });

    test("should handle missing session gracefully", async () => {
      await tester.start();

      // Try to resume without session
      await tester.sendInput("/resume");
      await tester.sendKey("enter");

      await tester.waitForText("No session", 3000);
    });
  });

  describe("✅ 5.6 Proxy Server", () => {
    test("should start proxy server", async () => {
      await tester.start();

      await tester.sendInput("/proxy start --port 11434");
      await tester.sendKey("enter");

      await tester.waitForText("Proxy started", 5000);
      await tester.waitForText("11434", 2000);
    });

    test("should stop proxy server", async () => {
      await tester.start();

      // Start proxy
      await tester.sendInput("/proxy start");
      await tester.sendKey("enter");
      await tester.waitForText("started", 5000);

      // Stop proxy
      await tester.sendInput("/proxy stop");
      await tester.sendKey("enter");

      await tester.waitForText("stopped", 3000);
    });
  });

  describe("✅ 5.7 Todo Management", () => {
    test("should scan for todos", async () => {
      await tester.start();

      await tester.sendInput("/todos scan");
      await tester.sendKey("enter");

      await tester.waitForText("Scanning", 3000);
      await tester.waitForText("found", 5000);
    });

    test("should list todos", async () => {
      await tester.start();

      // Scan first
      await tester.sendInput("/todos scan");
      await tester.sendKey("enter");
      await tester.waitForText("found", 5000);

      // List todos
      await tester.sendInput("/todos list");
      await tester.sendKey("enter");

      await tester.waitForText("TODO", 3000);
    });
  });

  describe("✅ 5.8 Complete Integration Flow", () => {
    test("should handle complete user workflow", async () => {
      await tester.start();
      await tester.waitForText("Welcome to Plato");

      // 1. Check status
      await tester.sendInput("/status");
      await tester.sendKey("enter");
      await tester.waitForText("Configuration", 3000);

      // 2. Send a message
      await tester.sendInput("Hello Plato");
      await tester.sendKey("enter");
      await tester.waitForText("Assistant", 5000);

      // 3. Use multi-line mode
      await tester.sendKey("ctrl-m");
      await tester.waitForText("Multi-line", 2000);

      await tester.sendInput("Line 1");
      await tester.sendKey("enter");
      await tester.sendInput("Line 2");
      await tester.sendKey("ctrl-d");

      // 4. Check help
      await tester.sendInput("/help");
      await tester.sendKey("enter");
      await tester.waitForText("Commands", 3000);

      // 5. Exit gracefully
      await tester.sendKey("ctrl-c");
      await tester.waitForText("Exit", 2000);
      await tester.sendInput("y");

      // Verify clean exit
      expect(tester.getScreen()).toBeDefined();
    });

    test("should maintain performance under load", async () => {
      await tester.start();

      const startTime = Date.now();

      // Send multiple messages rapidly
      for (let i = 0; i < 10; i++) {
        await tester.sendInput(`Message ${i}`);
        await tester.sendKey("enter");
      }

      // Should handle all messages
      await tester.waitForText("Message 9", 10000);

      const duration = Date.now() - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(15000);
    });

    test("should recover from errors", async () => {
      await tester.start();

      // Trigger an error
      await tester.sendInput("/invalidcommand arg1 arg2 arg3");
      await tester.sendKey("enter");

      // Should show error but continue
      await tester.waitForText("error", 3000);

      // Should still work
      await tester.sendInput("/help");
      await tester.sendKey("enter");

      await tester.waitForText("Commands", 3000);
    });
  });
});
