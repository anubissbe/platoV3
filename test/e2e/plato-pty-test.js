#!/usr/bin/env node

/**
 * PTY-based E2E test for Plato TUI
 * This script launches Plato in a PTY and interacts with it
 */

import { spawn } from "node-pty";
import { promisify } from "util";
const sleep = promisify(setTimeout);

class PlatoTUITester {
  constructor(options = {}) {
    this.options = {
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      timeout: options.timeout || 10000,
      debug: options.debug || false,
    };
    this.pty = null;
    this.output = "";
    this.listeners = [];
  }

  /**
   * Start Plato TUI
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.pty = spawn("./bin/plato", [], {
        name: "xterm-256color",
        cols: this.options.cols,
        rows: this.options.rows,
        cwd: this.options.cwd,
        env: { ...this.options.env, TERM: "xterm-256color" },
      });

      this.pty.onData((data) => {
        this.output += data;
        if (this.options.debug) {
          process.stdout.write(data);
        }

        // Notify listeners
        this.listeners.forEach((listener) => listener(data));
      });

      // Wait for initial render
      setTimeout(() => {
        if (
          this.output.includes("Welcome to Plato") ||
          this.output.includes("plato |")
        ) {
          resolve();
        } else {
          reject(new Error("Plato did not start properly"));
        }
      }, 2000);
    });
  }

  /**
   * Send input to the TUI
   */
  async sendInput(text) {
    if (!this.pty) throw new Error("Plato not started");
    this.pty.write(text);
    await sleep(100); // Small delay for processing
  }

  /**
   * Send a key sequence
   */
  async sendKey(key) {
    const keys = {
      up: "\x1b[A",
      down: "\x1b[B",
      left: "\x1b[D",
      right: "\x1b[C",
      enter: "\r",
      escape: "\x1b",
      tab: "\t",
      backspace: "\x7f",
      "ctrl-c": "\x03",
      "ctrl-d": "\x04",
      "ctrl-u": "\x15",
      "ctrl-k": "\x0b",
    };

    const sequence = keys[key.toLowerCase()] || key;
    await this.sendInput(sequence);
  }

  /**
   * Wait for specific text to appear in output
   */
  async waitForText(text, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (this.output.includes(text)) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for text: "${text}"`));
      }, timeout);

      const listener = (data) => {
        if (this.output.includes(text)) {
          clearTimeout(timer);
          const index = this.listeners.indexOf(listener);
          if (index > -1) this.listeners.splice(index, 1);
          resolve();
        }
      };

      this.listeners.push(listener);
    });
  }

  /**
   * Get the current screen content
   */
  getScreen() {
    // Extract the last screen worth of content
    const lines = this.output.split("\n");
    return lines.slice(-this.options.rows).join("\n");
  }

  /**
   * Clear captured output
   */
  clearOutput() {
    this.output = "";
  }

  /**
   * Stop Plato TUI
   */
  async stop() {
    if (this.pty) {
      this.pty.kill();
      this.pty = null;
    }
  }

  /**
   * Take a snapshot of the current screen
   */
  snapshot(name) {
    const screen = this.getScreen();
    console.log(`\n=== Snapshot: ${name} ===`);
    console.log(screen);
    console.log("=== End Snapshot ===\n");
    return screen;
  }
}

// Test scenarios
async function runTests() {
  const tester = new PlatoTUITester({ debug: process.env.DEBUG === "true" });

  try {
    console.log("Starting Plato TUI tests...\n");

    // Test 1: Start and verify initial state
    console.log("Test 1: Starting Plato...");
    await tester.start();
    console.log("✓ Plato started successfully");

    // Test 2: Send a message
    console.log("\nTest 2: Sending a message...");
    await tester.sendInput("Hello, Plato!");
    await tester.sendKey("enter");
    await sleep(1000);

    // Check if message appears in conversation
    if (tester.output.includes("Hello, Plato!")) {
      console.log("✓ Message sent successfully");
    } else {
      console.log("✗ Message not found in output");
    }

    // Test 3: Navigate with arrow keys
    console.log("\nTest 3: Testing navigation...");
    await tester.sendKey("up");
    await sleep(200);
    await tester.sendKey("down");
    await sleep(200);
    console.log("✓ Navigation keys sent");

    // Test 4: Test slash command
    console.log("\nTest 4: Testing slash command...");
    await tester.sendInput("/help");
    await tester.sendKey("enter");
    await sleep(500);

    if (
      tester.output.includes("Available commands") ||
      tester.output.includes("help")
    ) {
      console.log("✓ Slash command processed");
    } else {
      console.log("✗ Slash command response not found");
    }

    // Test 5: Test escape key
    console.log("\nTest 5: Testing escape key...");
    await tester.sendInput("Test message");
    await tester.sendKey("escape");
    await sleep(200);
    console.log("✓ Escape key sent");

    // Test 6: Multi-line input
    console.log("\nTest 6: Testing multi-line input...");
    await tester.sendKey("ctrl-m"); // Toggle multi-line mode if supported
    await tester.sendInput("Line 1");
    await tester.sendKey("enter");
    await tester.sendInput("Line 2");
    await tester.sendKey("ctrl-d"); // Send multi-line message
    await sleep(500);
    console.log("✓ Multi-line input test completed");

    // Final snapshot
    const finalScreen = tester.snapshot("Final State");

    // Verify final state contains expected elements
    const hasStatusLine = finalScreen.includes("plato");
    const hasConversation =
      finalScreen.includes("You") || finalScreen.includes("assistant");

    console.log("\n=== Test Summary ===");
    console.log(`Status line present: ${hasStatusLine ? "✓" : "✗"}`);
    console.log(`Conversation visible: ${hasConversation ? "✓" : "✗"}`);

    // Clean exit
    console.log("\nSending exit command...");
    await tester.sendKey("ctrl-c");
    await sleep(500);
  } catch (error) {
    console.error("Test failed:", error.message);
    process.exit(1);
  } finally {
    await tester.stop();
    console.log("\nTests completed");
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { PlatoTUITester, runTests };
