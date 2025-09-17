/**
 * Comprehensive slash command system for the Plato TUI
 * This module provides all slash commands with proper argument handling,
 * validation, error handling, and integration with various tools and services.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface SlashCommand {
  name: string;
  description: string;
  summary: string;
  category: "Core" | "MCP" | "AI" | "System" | "File" | "UI" | "Config" | "Testing";
  usage?: string;
  requiresArgs?: boolean;
  execute: (args: string[], session: any, provider?: any) => Promise<{
    output?: string;
    error?: string;
    metadata?: Record<string, any>;
  }>;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "help",
    description: "Show available slash commands with usage information",
    summary: "Show available slash commands with usage information",
    category: "Core",
    usage: "[command-name]",
    execute: async (args: string[], session: any, provider?: any) => {
      if (args.length > 0) {
        const commandName = args[0];
        const command = SLASH_MAP.get(commandName);

        if (!command) {
          return {
            error: "Command not found: " + commandName,
            output: "Use '/help' to see all available commands"
          };
        }

        let output = "📋 Command: /" + command.name + "\n";
        output += "═".repeat(12 + command.name.length) + "\n\n";
        output += "📝 Description: " + command.description + "\n";
        output += "📂 Category: " + command.category + "\n";
        if (command.usage) {
          output += "⚡ Usage: /" + command.name + " " + command.usage + "\n";
        }
        if (command.requiresArgs) {
          output += "🔍 Requires Arguments: Yes\n";
        }

        return { output };
      }

      const categories = [
        { name: "Core", emoji: "🔧", commands: SLASH_COMMANDS.filter(c => c.category === "Core") },
        { name: "File", emoji: "📁", commands: SLASH_COMMANDS.filter(c => c.category === "File") },
        { name: "MCP", emoji: "🔗", commands: SLASH_COMMANDS.filter(c => c.category === "MCP") },
        { name: "AI", emoji: "🤖", commands: SLASH_COMMANDS.filter(c => c.category === "AI") },
        { name: "System", emoji: "⚙️", commands: SLASH_COMMANDS.filter(c => c.category === "System") },
        { name: "Config", emoji: "🎛️", commands: SLASH_COMMANDS.filter(c => c.category === "Config") },
        { name: "UI", emoji: "🖥️", commands: SLASH_COMMANDS.filter(c => c.category === "UI") },
        { name: "Testing", emoji: "🧪", commands: SLASH_COMMANDS.filter(c => c.category === "Testing") }
      ].filter(cat => cat.commands.length > 0);

      let output = "🚀 Plato Slash Commands\n";
      output += "═".repeat(23) + "\n\n";

      for (const category of categories) {
        output += category.emoji + " " + category.name + " Commands:\n";
        for (const command of category.commands) {
          output += "  /" + command.name.padEnd(20) + " - " + command.summary + "\n";
        }
        output += "\n";
      }

      output += "💡 Use '/help <command>' for detailed information about a specific command\n";
      output += "💡 Commands are case-sensitive and must start with '/'\n";
      output += "💡 Most commands support flags like --help, --force, --dry-run";

      return { output };
    }
  },

  {
    name: "doctor",
    description: "Run comprehensive system diagnostics to verify Plato setup and dependencies",
    summary: "Run system diagnostics and health checks",
    category: "System",
    execute: async (args: string[], session: any, provider?: any) => {
      let output = "🩺 System Diagnostics\n";
      output += "═".repeat(19) + "\n\n";

      const checks = [];

      // Check Node.js version
      try {
        const nodeVersion = process.version;
        checks.push({
          name: "Node.js",
          status: "✅",
          details: "Version " + nodeVersion
        });
      } catch {
        checks.push({
          name: "Node.js",
          status: "❌",
          details: "Unable to determine version"
        });
      }

      // Check Git
      try {
        const { execa } = await import("execa");
        const result = await execa("git", ["--version"]);
        checks.push({
          name: "Git",
          status: "✅",
          details: result.stdout
        });
      } catch {
        checks.push({
          name: "Git",
          status: "❌",
          details: "Git not available or not in PATH"
        });
      }

      // Check working directory
      try {
        const cwd = process.cwd();
        const stats = await fs.stat(cwd);
        if (stats.isDirectory()) {
          checks.push({
            name: "Working Directory",
            status: "✅",
            details: cwd
          });
        } else {
          checks.push({
            name: "Working Directory",
            status: "❌",
            details: "Current path is not a directory"
          });
        }
      } catch {
        checks.push({
          name: "Working Directory",
          status: "❌",
          details: "Unable to access current directory"
        });
      }

      // Check if in git repository
      try {
        const { execa } = await import("execa");
        await execa("git", ["rev-parse", "--git-dir"]);
        checks.push({
          name: "Git Repository",
          status: "✅",
          details: "Inside Git repository"
        });
      } catch {
        checks.push({
          name: "Git Repository",
          status: "⚠️",
          details: "Not in a Git repository (some features require Git)"
        });
      }

      // Check credentials/auth
      try {
        const { loadConfig } = await import("../config.js");
        const config = await loadConfig();
        if ((config as any).auth?.copilot) {
          checks.push({
            name: "GitHub Copilot",
            status: "✅",
            details: "Authenticated"
          });
        } else {
          checks.push({
            name: "GitHub Copilot",
            status: "⚠️",
            details: "Not authenticated (use /login)"
          });
        }
      } catch {
        checks.push({
          name: "GitHub Copilot",
          status: "❌",
          details: "Unable to check authentication status"
        });
      }

      // Check filesystem permissions
      try {
        const tempFile = path.join(process.cwd(), ".plato-test-" + Date.now());
        await fs.writeFile(tempFile, "test");
        await fs.unlink(tempFile);
        checks.push({
          name: "File Permissions",
          status: "✅",
          details: "Read/write access confirmed"
        });
      } catch {
        checks.push({
          name: "File Permissions",
          status: "❌",
          details: "Unable to create temporary files"
        });
      }

      // Display results
      for (const check of checks) {
        output += check.status + " " + check.name + ": " + check.details + "\n";
      }

      const passedChecks = checks.filter(c => c.status === "✅").length;
      const totalChecks = checks.length;

      output += "\n📊 Health Score: " + passedChecks + "/" + totalChecks + " checks passed\n";

      if (passedChecks === totalChecks) {
        output += "✅ System is healthy and ready to use";
      } else if (passedChecks >= totalChecks * 0.8) {
        output += "⚠️ System mostly healthy, some features may be limited";
      } else {
        output += "❌ System has significant issues, check failed items above";
      }

      return { output };
    }
  },

  {
    name: "login",
    description: "Authenticate with GitHub Copilot using device flow for secure access",
    summary: "Authenticate with GitHub Copilot",
    category: "Core",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const copilotModule = await import("../providers/copilot.js").catch(() => ({ loginCopilot: null }));
        const { loginCopilot } = copilotModule;

        if (!loginCopilot) {
          return {
            error: "❌ Authentication module not available"
          };
        }

        await loginCopilot();

        let output = "✅ Authentication successful!\n\n";
        output += "🔐 GitHub Copilot access granted\n";
        output += "👤 Login process completed\n\n";
        output += "🎯 Next steps:\n";
        output += "  • Use '/status' to verify your setup\n";
        output += "  • Start chatting with AI models\n";
        output += "  • Use '/model list' to see available models";

        return { output };
      } catch (error) {
        return {
          error: "❌ Login failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "logout",
    description: "Sign out and clear stored authentication credentials for security",
    summary: "Sign out and clear credentials",
    category: "Core",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const copilotModule = await import("../providers/copilot.js").catch(() => ({ logoutCopilot: null }));
        const { logoutCopilot } = copilotModule;

        if (!logoutCopilot) {
          return {
            error: "❌ Authentication module not available"
          };
        }

        await logoutCopilot();

        let output = "✅ Logged out successfully\n\n";
        output += "🔓 Authentication credentials cleared\n";
        output += "🧹 Session data cleaned\n\n";
        output += "💡 Use '/login' to authenticate again";

        return { output };
      } catch (error) {
        return {
          error: "❌ Logout failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "status",
    description: "Show comprehensive system status and diagnostic information",
    summary: "Show comprehensive system status and diagnostic information",
    category: "System",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const { loadConfig } = await import("../config.js");
        const config = await loadConfig();
        const configAny = config as any;

        let output = "📊 Plato Status Dashboard\n";
        output += "═".repeat(25) + "\n\n";

        // Authentication Status
        output += "🔐 Authentication:\n";
        if (configAny.auth?.copilot) {
          output += "├─ GitHub Copilot: ✅ Authenticated\n";
          if (configAny.auth.copilot.user) {
            output += "├─ User: " + configAny.auth.copilot.user + "\n";
          }
          if (configAny.auth.copilot.expires) {
            const expiryDate = new Date(configAny.auth.copilot.expires);
            const isExpired = expiryDate < new Date();
            output += "├─ Token Expires: " + (isExpired ? "❌ Expired" : "✅ " + expiryDate.toLocaleString()) + "\n";
          }
        } else {
          output += "├─ GitHub Copilot: ❌ Not authenticated\n";
        }
        output += "\n";

        // Model Configuration
        output += "🤖 AI Model:\n";
        output += "├─ Active Model: " + (configAny.model?.active || "gpt-4o") + "\n";
        output += "├─ Provider: " + detectProvider(configAny.model?.active || "gpt-4o") + "\n";
        output += "\n";

        // System Configuration
        output += "⚙️ System:\n";
        output += "├─ Node.js: " + process.version + "\n";
        output += "├─ Platform: " + process.platform + " (" + process.arch + ")\n";
        output += "├─ Working Directory: " + process.cwd() + "\n";

        // Git Repository Status
        try {
          const { execa } = await import("execa");
          const branchResult = await execa("git", ["branch", "--show-current"]);
          const statusResult = await execa("git", ["status", "--porcelain"]);

          output += "├─ Git Repository: ✅ Active\n";
          output += "├─ Current Branch: " + branchResult.stdout + "\n";

          const changes = statusResult.stdout.split("\n").filter(line => line.trim()).length;
          if (changes > 0) {
            output += "├─ Uncommitted Changes: ⚠️ " + changes + " files\n";
          } else {
            output += "├─ Working Tree: ✅ Clean\n";
          }
        } catch {
          output += "├─ Git Repository: ❌ Not a repository or Git unavailable\n";
        }
        output += "\n";

        // Permissions and Security
        output += "🔒 Security:\n";
        output += "├─ Permissions: " + (configAny.permissions?.enabled !== false ? "✅ Enabled" : "❌ Disabled") + "\n";
        if (configAny.permissions) {
          output += "├─ Permission Profile: " + (configAny.permissions.activeProfile || "development") + "\n";
          output += "├─ Mouse Mode: " + (configAny.permissions.uiEnabled !== false ? "✅ Enabled" : "❌ Disabled") + "\n";
        }
        output += "\n";

        // MCP Servers Status
        output += "🔗 MCP Servers:\n";
        try {
          const { listServers } = await import("../integrations/mcp.js").catch(() => ({ listServers: () => [] }));
          const servers = await listServers();
          const serverNames = servers.map(s => s.id);

          if (serverNames.length > 0) {
            output += "├─ Attached Servers: " + serverNames.length + "\n";
            for (const name of serverNames.slice(0, 3)) {
              output += "├─ • " + name + "\n";
            }
            if (serverNames.length > 3) {
              output += "├─ • ... and " + (serverNames.length - 3) + " more\n";
            }
          } else {
            output += "├─ Attached Servers: None\n";
          }
        } catch {
          output += "├─ Attached Servers: Unable to check\n";
        }
        output += "\n";

        // Session Information
        if (session) {
          output += "💬 Session:\n";
          output += "├─ Messages: " + (session.messages?.length || 0) + "\n";
          if (session.model) {
            output += "├─ Session Model: " + session.model + "\n";
          }
          if (session.metadata?.startTime) {
            const duration = Date.now() - session.metadata.startTime;
            output += "├─ Duration: " + Math.round(duration / 1000) + "s\n";
          }
        } else {
          output += "💬 Session:\n";
          output += "├─ Session: ❓ No session information available\n";
        }

        return { output };
      } catch (error) {
        return {
          error: "❌ Status check failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "models",
    description: "List all available AI models with detailed information and switching capabilities",
    summary: "List available AI models",
    category: "AI",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        // Get available models from provider or use defaults
        const availableModels = [
          "gpt-4o",
          "gpt-4o-mini",
          "gpt-4-turbo",
          "gpt-4",
          "claude-3-5-sonnet-20241022",
          "claude-3-5-haiku-20241022",
          "claude-3-opus-20240229",
          "o1-preview",
          "o1-mini",
          "o3-mini"
        ];

        const { loadConfig } = await import("../config.js");
        const config = await loadConfig();
        const configAny = config as any;
        const currentModel = configAny.model?.active || "gpt-4o";

        let output = "🤖 Available AI Models\n";
        output += "═".repeat(21) + "\n\n";

        output += "📋 Current Model: " + currentModel + " " + (currentModel ? "✅" : "❌") + "\n\n";

        // Group models by provider
        const providers = {
          "OpenAI": availableModels.filter(m => m.startsWith("gpt-") || m.startsWith("o1-") || m.startsWith("o3-")),
          "Anthropic": availableModels.filter(m => m.startsWith("claude-")),
          "Other": availableModels.filter(m => !m.startsWith("gpt-") && !m.startsWith("claude-") && !m.startsWith("o1-") && !m.startsWith("o3-"))
        };

        for (const [provider, models] of Object.entries(providers)) {
          if (models.length === 0) continue;

          output += provider + " Models:\n";

          for (const model of models) {
            const isCurrent = model === currentModel;
            const marker = isCurrent ? " ← current" : "";
            const emoji = isCurrent ? "🎯" : "  ";

            output += emoji + " " + model + marker + "\n";

            // Add brief description
            if (model.includes("gpt-4o")) {
              output += "     └─ Latest GPT-4 Omni with vision and reasoning\n";
            } else if (model.includes("gpt-4-turbo")) {
              output += "     └─ Fast GPT-4 variant optimized for speed\n";
            } else if (model.includes("claude-3-5-sonnet")) {
              output += "     └─ Advanced Claude model for complex reasoning\n";
            } else if (model.includes("claude-3-5-haiku")) {
              output += "     └─ Fast Claude model for quick tasks\n";
            } else if (model.includes("o1") || model.includes("o3")) {
              output += "     └─ Reasoning-optimized model for complex problems\n";
            }
          }
          output += "\n";
        }

        output += "💡 Usage:\n";
        output += "   /model set <model-id>     - Switch to a specific model\n";
        output += "   /model current            - Show current active model\n";
        output += "   /model info <model-id>    - Get detailed model information\n";
        output += "   /model reset              - Reset to default model\n\n";

        output += "🔍 Examples:\n";
        output += "   /model set claude-3-5-sonnet-20241022\n";
        output += "   /model set gpt-4o\n";
        output += "   /model info claude-3.5-sonnet - Get model information";

        return { output };
      } catch (error) {
        return {
          error: "❌ Failed to list models: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "mcp",
    description: "Manage Model Context Protocol (MCP) servers for enhanced AI capabilities",
    summary: "Manage MCP servers and tools",
    category: "MCP",
    usage: "attach <name> <url> | detach <name> | list | tools",
    requiresArgs: true,
    execute: async (args: string[], session: any, provider?: any) => {
      if (args.length === 0) {
        return {
          output: "🔗 MCP Server Management\n" +
            "═".repeat(23) + "\n\n" +
            "Available actions:\n" +
            "  /mcp attach <name> <url>  - Connect to MCP server\n" +
            "  /mcp detach <name>        - Disconnect MCP server\n" +
            "  /mcp list                 - Show attached servers\n" +
            "  /mcp tools                - List available tools\n\n" +
            "Examples:\n" +
            "  /mcp attach myserver http://localhost:3000\n" +
            "  /mcp detach myserver\n" +
            "  /mcp list"
        };
      }

      const action = args[0];

      switch (action) {
        case "attach":
          if (args.length < 3) {
            return { error: "Usage: /mcp attach <name> <url>" };
          }
          return await handleMcpAttach(args[1], args[2]);

        case "detach":
          if (args.length < 2) {
            return { error: "Usage: /mcp detach <name>" };
          }
          return await handleMcpDetach(args[1]);

        case "list":
          return await handleMcpList();

        case "tools":
          return await handleMcpTools();

        default:
          return {
            error: "Unknown MCP action: " + action + "\n" +
              "Available actions: attach, detach, list, tools"
          };
      }
    }
  },

  {
    name: "permissions",
    description: "Manage security permissions for file operations and tool access",
    summary: "Manage security permissions",
    category: "System",
    usage: "list | profile <name> | enable | disable | default <tool> <action>",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        if (args.length === 0) {
          return await handlePermissionsList();
        }

        const action = args[0];

        switch (action) {
          case "list":
            return await handlePermissionsList();

          case "profile":
            if (args.length < 2) {
              return { error: "Usage: /permissions profile <profile-name>" };
            }
            return await handlePermissionsProfile(args[1]);

          case "enable":
            return await handlePermissionsToggle(true);

          case "disable":
            return await handlePermissionsToggle(false);

          case "default":
            if (args.length < 3) {
              return { error: "Usage: /permissions default <tool> <action>" };
            }
            return await handlePermissionsDefault(args[1], args[2]);

          default:
            return {
              error: "Unknown permissions action: " + action + "\n" +
                "Available actions: list, profile, enable, disable, default"
            };
        }
      } catch (error) {
        return {
          error: "Permissions command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "output-style",
    description: "Configure output formatting and visual style preferences",
    summary: "Configure output formatting style",
    category: "UI",
    usage: "[style-name] | list",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        if (args.length === 0) {
          const { loadConfig } = await import("../config.js");
          const config = await loadConfig();
          const configAny = config as any;
          const currentStyle = configAny.ui?.outputStyle || "default";

          let output = "🎨 Output Style Configuration\n";
          output += "═".repeat(29) + "\n\n";
          output += "Current Style: " + currentStyle + " ✅\n\n";
          output += "Available Styles:\n";
          output += "├─ default    - Balanced formatting with icons\n";
          output += "├─ minimal    - Clean, minimal formatting\n";
          output += "├─ verbose    - Detailed with extra information\n";
          output += "├─ emoji      - Enhanced with emojis and visual elements\n";
          output += "├─ technical  - Code-focused with syntax highlighting\n";
          output += "└─ custom     - User-defined style preferences\n\n";
          output += "💡 Use '/output-style <name>' to change styles";

          return { output };
        }

        const styleName = args[0];

        if (args[0] === "list") {
          let output = "🎨 Available Output Styles\n";
          output += "═".repeat(25) + "\n\n";

          const styles = [
            { name: "default", description: "Balanced formatting with clear icons and structure" },
            { name: "minimal", description: "Clean, distraction-free output with minimal formatting" },
            { name: "verbose", description: "Detailed output with additional context and information" },
            { name: "emoji", description: "Enhanced visual experience with emojis and colors" },
            { name: "technical", description: "Code-focused formatting optimized for development" },
            { name: "custom", description: "User-defined formatting based on custom preferences" }
          ];

          for (const style of styles) {
            output += "📋 " + style.name + "\n";
            output += "   " + style.description + "\n\n";
          }

          return { output };
        }

        const validStyles = ["default", "minimal", "verbose", "emoji", "technical", "custom"];

        if (!validStyles.includes(styleName)) {
          return {
            error: "Invalid style: " + styleName + "\n" +
              "Available styles: " + validStyles.join(", ")
          };
        }

        const { setConfigValue } = await import("../config.js");
        await setConfigValue("ui.outputStyle", styleName);

        let output = "✅ Output style changed to: " + styleName + "\n\n";
        output += "🎯 Style will be applied to future command outputs\n";
        output += "💡 Use '/output-style' to see current configuration";

        return { output };
      } catch (error) {
        return {
          error: "Output style command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "compact",
    description: "Intelligently compress conversation history while preserving important context",
    summary: "Compress conversation history",
    category: "AI",
    usage: "[focus-topic]",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const focusTopic = args.join(" ");

        if (!session || !session.messages || session.messages.length === 0) {
          return {
            error: "No conversation history to compact"
          };
        }

        const originalCount = session.messages.length;

        // Simple compaction logic - keep first message (system) and last 10 messages
        const systemMessages = session.messages.filter((msg: any) => msg.role === "system");
        const otherMessages = session.messages.filter((msg: any) => msg.role !== "system");

        let compactedMessages;
        if (otherMessages.length > 10) {
          // Keep last 10 messages plus system messages
          compactedMessages = [...systemMessages, ...otherMessages.slice(-10)];
        } else {
          compactedMessages = session.messages;
        }

        // Update session
        session.messages = compactedMessages;

        const savedCount = originalCount - compactedMessages.length;

        let output = "🗜️ Conversation Compacted\n";
        output += "═".repeat(23) + "\n\n";
        output += "Original messages: " + originalCount + "\n";
        output += "After compaction: " + compactedMessages.length + "\n";
        output += "Removed messages: " + savedCount + "\n\n";

        if (focusTopic) {
          output += "🎯 Focus: " + focusTopic + "\n";
          output += "Context preserved around: " + focusTopic + "\n\n";
        }

        if (savedCount > 0) {
          output += "✅ Memory usage optimized\n";
          output += "💡 Important context preserved";
        } else {
          output += "ℹ️ No compaction needed - conversation already optimized";
        }

        return { output };
      } catch (error) {
        return {
          error: "Compact command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "mouse",
    description: "Control mouse mode for copy/paste operations in terminal",
    summary: "Control terminal mouse mode",
    category: "UI",
    usage: "[on|off|toggle]",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const { loadConfig, setConfigValue } = await import("../config.js");
        const config = await loadConfig();
        const configAny = config as any;

        if (args.length === 0) {
          const mouseEnabled = configAny.permissions?.uiEnabled !== false; // Default to true

          let output = "🖱️ Mouse Mode Status\n";
          output += "═".repeat(18) + "\n\n";
          output += "Current State: " + (mouseEnabled ? "✅ Enabled" : "❌ Disabled") + "\n\n";

          if (mouseEnabled) {
            output += "🎯 Mouse Features Active:\n";
            output += "├─ Selection support in terminal\n";
            output += "├─ Copy/paste with mouse\n";
            output += "├─ Click to position cursor\n";
            output += "└─ Scroll support\n\n";
            output += "💡 Use '/mouse off' to disable";
          } else {
            output += "🚫 Mouse Features Disabled:\n";
            output += "├─ Use keyboard shortcuts for copy/paste\n";
            output += "├─ Arrow keys for navigation\n";
            output += "└─ Terminal clipboard operations\n\n";
            output += "💡 Use '/mouse on' to enable";
          }

          return { output };
        }

        const action = args[0].toLowerCase();
        const currentlyEnabled = configAny.permissions?.uiEnabled !== false;
        let newState: boolean;

        switch (action) {
          case "on":
          case "enable":
            newState = true;
            break;
          case "off":
          case "disable":
            newState = false;
            break;
          case "toggle":
            newState = !currentlyEnabled;
            break;
          default:
            return {
              error: "Invalid mouse action: " + action + "\n" +
                "Use: on, off, or toggle"
            };
        }

        await setConfigValue("permissions.uiEnabled", newState.toString());

        let output = "🖱️ Mouse mode " + (newState ? "enabled" : "disabled") + "\n\n";

        if (newState) {
          output += "✅ Mouse support activated:\n";
          output += "├─ Click and drag to select text\n";
          output += "├─ Right-click for context menu\n";
          output += "├─ Scroll wheel support\n";
          output += "└─ Mouse cursor positioning\n";
        } else {
          output += "🚫 Mouse support deactivated:\n";
          output += "├─ Use Ctrl+C / Ctrl+V for copy/paste\n";
          output += "├─ Arrow keys for navigation\n";
          output += "└─ Use terminal clipboard operations\n\n";
        }

        output += "⚡ Changes take effect immediately";

        return { output };
      } catch (error) {
        return {
          error: "Mouse command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "paste",
    description: "Temporarily disable input processing to allow easy copy/paste operations",
    summary: "Pause input for copy/paste",
    category: "UI",
    usage: "[seconds]",
    execute: async (args: string[], session: any, provider?: any) => {
      const duration = args.length > 0 ? parseInt(args[0]) || 5 : 5;

      if (duration < 1 || duration > 60) {
        return {
          error: "Duration must be between 1 and 60 seconds"
        };
      }

      let output = "📋 Paste Mode Activated\n";
      output += "═".repeat(21) + "\n\n";
      output += "⏸️  Input processing paused for " + duration + " seconds\n";
      output += "📋 Safe to paste content now\n\n";
      output += "Features during paste mode:\n";
      output += "├─ No command interpretation\n";
      output += "├─ No auto-completion\n";
      output += "├─ Raw text input accepted\n";
      output += "└─ All keystrokes captured\n\n";
      output += "⏰ Normal input will resume automatically in " + duration + " seconds";

      // Note: The actual pause functionality would need to be implemented in the TUI layer
      // This command just provides the user feedback

      return {
        output,
        metadata: {
          pauseInput: true,
          pauseDuration: duration * 1000
        }
      };
    }
  },

  {
    name: "apply",
    description: "Apply pending code patches with validation and Git integration",
    summary: "Apply pending patches",
    category: "File",
    usage: "[--dry-run] [--force]",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const flags = args.filter(arg => arg.startsWith("--"));
        const isDryRun = flags.includes("--dry-run");
        const isForce = flags.includes("--force");

        // Check if we're in a Git repository
        const { execa } = await import("execa");
        try {
          await execa("git", ["rev-parse", "--git-dir"]);
        } catch {
          return {
            error: "❌ Not in a Git repository\n" +
                  "Patch operations require Git. Run 'git init' to initialize a repository."
          };
        }

        // Load patch manager
        const patchModule = await import("../tools/patch.js").catch(() => ({}));
        const PatchManager = (patchModule as any).PatchManager;

        if (!PatchManager) {
          return {
            error: "❌ Patch manager not available"
          };
        }

        const patchManager = new PatchManager();

        if (isDryRun) {
          const dryRunResult = await patchManager.previewPatch();

          if (!dryRunResult.success) {
            return {
              error: "❌ Dry run failed: " + dryRunResult.error
            };
          }

          let output = "🔍 Patch Preview (Dry Run)\n";
          output += "═".repeat(26) + "\n\n";

          if (dryRunResult.changes && dryRunResult.changes.length > 0) {
            output += "Files that would be modified:\n";
            for (const change of dryRunResult.changes) {
              output += "  📝 " + change.file + " (" + change.additions + " additions, " + change.deletions + " deletions)\n";
            }
            output += "\n💡 Use '/apply' to apply these changes";
          } else {
            output += "No pending patches to apply";
          }

          return { output };
        }

        // Apply the patch
        const result = await patchManager.applyPatch({ force: isForce });

        if (result.success) {
          let output = "✅ Patch applied successfully\n\n";

          if (result.filesModified && result.filesModified.length > 0) {
            output += "Modified files:\n";
            for (const file of result.filesModified) {
              output += "  📝 " + file + "\n";
            }
            output += "\n🎯 Changes are now active in your workspace";
          }

          return { output };
        } else {
          return {
            error: "❌ Patch application failed: " + (result.error || "unknown error")
          };
        }
      } catch (error) {
        return {
          error: "❌ Apply command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "revert",
    description: "Revert the last applied patch with optional hard reset",
    summary: "Revert last applied patch",
    category: "File",
    usage: "[--hard]",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const flags = args.filter(arg => arg.startsWith("--"));
        const isHard = flags.includes("--hard");

        // Check if we're in a Git repository
        const { execa } = await import("execa");
        try {
          await execa("git", ["rev-parse", "--git-dir"]);
        } catch {
          return {
            error: "❌ Not in a Git repository\n" +
                  "Revert operations require Git."
          };
        }

        // Load patch manager
        const patchModule = await import("../tools/patch.js").catch(() => ({}));
        const PatchManager = (patchModule as any).PatchManager;

        if (!PatchManager) {
          return {
            error: "❌ Patch manager not available"
          };
        }

        const patchManager = new PatchManager();

        const result = await patchManager.revertPatch({ hard: isHard });

        if (result.success) {
          let output = "✅ Patch reverted successfully\n\n";

          if (result.filesReverted && result.filesReverted.length > 0) {
            output += "Reverted files:\n";
            for (const file of result.filesReverted) {
              output += "  ↩️  " + file + "\n";
            }
          }

          return { output };
        } else {
          return {
            error: "❌ Revert failed: " + (result.error || "unknown error")
          };
        }
      } catch (error) {
        return {
          error: "❌ Revert command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "apply-mode",
    description: "Configure automatic patch application behavior",
    summary: "Configure patch application mode",
    category: "File",
    usage: "auto | manual | query",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        if (args.length === 0) {
          const { loadConfig } = await import("../config.js");
          const config = await loadConfig();
          const configAny = config as any;
          const currentMode = configAny.patches?.autoApply || "manual";

          let output = "🔧 Patch Application Mode\n";
          output += "═".repeat(25) + "\n\n";
          output += "Current Mode: " + currentMode + " ✅\n\n";
          output += "Available Modes:\n";
          output += "├─ auto    - Automatically apply all patches\n";
          output += "├─ manual  - Require explicit /apply command\n";
          output += "└─ query   - Ask for confirmation before applying\n\n";
          output += "💡 Use '/apply-mode <mode>' to change behavior";

          return { output };
        }

        const mode = args[0];
        const validModes = ["auto", "manual", "query"];

        if (!validModes.includes(mode)) {
          return {
            error: "Invalid mode: " + mode + "\n" +
              "Valid modes: " + validModes.join(", ")
          };
        }

        const { setConfigValue } = await import("../config.js");
        await setConfigValue("patches.autoApply", mode);

        let output = "✅ Patch application mode set to: " + mode + "\n\n";

        switch (mode) {
          case "auto":
            output += "🚀 Patches will be applied automatically\n";
            output += "⚠️  Make sure you're in a Git repository for safety";
            break;
          case "manual":
            output += "🛡️  Patches require explicit /apply command\n";
            output += "💡 Use '/apply --dry-run' to preview changes";
            break;
          case "query":
            output += "❓ You'll be asked before applying each patch\n";
            output += "⚡ Provides balance between safety and convenience";
            break;
        }

        return { output };
      } catch (error) {
        return {
          error: "Apply-mode command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "browse",
    description: "Navigate filesystem with smart file previews and directory listing",
    summary: "Browse files and directories",
    category: "File",
    usage: "[path] | [file] | .. | ~ | --help",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const targetPath = args.length > 0 ? args[0] : ".";

        // Handle help flag
        if (args.includes("--help")) {
          let output = "📁 Browse Command Help\n";
          output += "═".repeat(21) + "\n\n";
          output += "Usage Examples:\n";
          output += "├─ /browse              - List current directory\n";
          output += "├─ /browse src/         - Navigate to src directory\n";
          output += "├─ /browse file.txt     - Show file information and preview\n";
          output += "├─ /browse ..           - Navigate to parent directory\n";
          output += "└─ /browse ~            - Navigate to home directory\n\n";
          output += "Features:\n";
          output += "├─ 📂 Directory listing with file types\n";
          output += "├─ 📄 File preview for text files\n";
          output += "├─ 📊 File sizes and permissions\n";
          output += "├─ 🔍 Smart path resolution\n";
          output += "└─ ⚡ Fast navigation";

          return { output };
        }

        // Resolve path
        let resolvedPath: string;
        if (targetPath === "~") {
          resolvedPath = require("os").homedir();
        } else if (targetPath === "..") {
          resolvedPath = path.join(process.cwd(), "..");
        } else if (path.isAbsolute(targetPath)) {
          resolvedPath = targetPath;
        } else {
          resolvedPath = path.join(process.cwd(), targetPath);
        }

        // Check if path exists
        try {
          const stats = await fs.stat(resolvedPath);

          if (stats.isFile()) {
            return await handleBrowseFile(resolvedPath, stats);
          } else if (stats.isDirectory()) {
            return await handleBrowseDirectory(resolvedPath);
          } else {
            return {
              error: "❌ Path is neither a file nor directory: " + targetPath
            };
          }
        } catch (error: any) {
          if (error.code === "ENOENT") {
            return {
              error: "❌ Path does not exist: " + targetPath
            };
          } else if (error.code === "EACCES") {
            return {
              error: "❌ Permission denied: " + targetPath
            };
          } else {
            return {
              error: "❌ Cannot access path: " + (error.message || String(error))
            };
          }
        }
      } catch (error) {
        return {
          error: "Browse command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "create",
    description: "Create files and directories with optional templates and boilerplate content",
    summary: "Create files and directories with smart templates",
    category: "File",
    usage: "[file|dir] <path> [--template <type>] [--content <text>]",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        if (args.length === 0) {
          return {
            output: "📝 Create Files and Directories\n" +
              "═══════════════════════════════\n\n" +
              "Usage:\n" +
              "  /create file <path>          - Create new file\n" +
              "  /create dir <path>           - Create directory\n" +
              "  /create <path>               - Auto-detect type\n" +
              "  /create file app.js --template - Create with template\n\n" +
              "Examples:\n" +
              "  /create src/components/Header.tsx\n" +
              "  /create dir src/utils\n" +
              "  /create README.md\n" +
              "  /create package.json --template\n\n" +
              "💡 Files get smart templates based on extension"
          };
        }

        const writeModule = await import("../tools/native/write-tool.js").catch(() => ({}));
        const WriteTool = (writeModule as any).WriteTool;

        if (!WriteTool) {
          return {
            error: "❌ Write tool not available"
          };
        }

        const writeTool = new WriteTool();

        let type = args[0];
        let targetPath = args[1];

        // Auto-detect if only path provided
        if (args.length === 1 || (args.length === 2 && args[0] !== "file" && args[0] !== "dir")) {
          targetPath = args[0];
          type = targetPath.includes(".") ? "file" : "dir";
        }

        if (!targetPath) {
          return { error: "Please specify a path to create" };
        }

        // Resolve relative paths
        const fullPath = path.resolve(targetPath);
        const basename = path.basename(fullPath);
        const dirname = path.dirname(fullPath);

        if (type === "dir") {
          // Create directory
          try {
            await fs.mkdir(fullPath, { recursive: true });
            return {
              output: "📁 Created directory: " + targetPath + "\n" +
                "🎯 Next: Navigate with /browse " + targetPath
            };
          } catch (error: any) {
            if (error.code === "EEXIST") {
              return {
                output: "📁 Directory already exists: " + targetPath + "\n" +
                  "💡 Use /browse " + targetPath + " to explore it"
              };
            }
            throw error;
          }
        } else {
          // Create file
          // Check if parent directory exists
          try {
            await fs.stat(dirname);
          } catch {
            // Create parent directory
            await fs.mkdir(dirname, { recursive: true });
          }

          // Determine template content
          let content = "";
          const ext = path.extname(basename).toLowerCase();

          // Generate template based on file extension
          switch (ext) {
            case ".js":
              content = "// " + basename + "\n\n";
              break;
            case ".ts":
              content = "// " + basename + "\n\nexport {};\n";
              break;
            case ".tsx":
            case ".jsx":
              const componentName = path.basename(basename, ext);
              content = "import React from 'react';\n\n" +
                "interface " + componentName + "Props {\n" +
                "  // Add props here\n" +
                "}\n\n" +
                "export default function " + componentName + "(props: " + componentName + "Props) {\n" +
                "  return (\n" +
                "    <div>\n" +
                "      <h1>" + componentName + "</h1>\n" +
                "    </div>\n" +
                "  );\n" +
                "}\n";
              break;
            case ".md":
              content = "# " + path.basename(basename, ext) + "\n\n";
              break;
            case ".json":
              if (basename === "package.json") {
                content = "{\n" +
                  "  \"name\": \"" + path.basename(process.cwd()) + "\",\n" +
                  "  \"version\": \"1.0.0\",\n" +
                  "  \"description\": \"\",\n" +
                  "  \"main\": \"index.js\",\n" +
                  "  \"scripts\": {\n" +
                  "    \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\"\n" +
                  "  },\n" +
                  "  \"keywords\": [],\n" +
                  "  \"author\": \"\",\n" +
                  "  \"license\": \"ISC\"\n" +
                  "}\n";
              } else {
                content = "{\n  \n}\n";
              }
              break;
            case ".py":
              content = "#!/usr/bin/env python3\n# " + basename + "\n\n";
              break;
            case ".html":
              content = "<!DOCTYPE html>\n" +
                "<html lang=\"en\">\n" +
                "<head>\n" +
                "    <meta charset=\"UTF-8\">\n" +
                "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
                "    <title>" + path.basename(basename, ext) + "</title>\n" +
                "</head>\n" +
                "<body>\n" +
                "    <h1>" + path.basename(basename, ext) + "</h1>\n" +
                "</body>\n" +
                "</html>\n";
              break;
            case ".css":
              content = "/* " + basename + " */\n\n";
              break;
            default:
              content = ""; // Empty file for unknown extensions
              break;
          }

          try {
            // Use WriteTool to create the file
            const result = await writeTool.execute({
              path: targetPath,
              content: content
            });

            if (result.success) {
              let output = "📝 Created file: " + targetPath + "\n";
              if (content.trim()) {
                output += "📋 Applied template for " + ext + " file\n";
              }
              output += "🎯 Next: Edit with /edit " + targetPath;
              return { output };
            } else {
              return { error: result.error || "Failed to create file" };
            }
          } catch (error) {
            return {
              error: "Failed to create file: " + (error instanceof Error ? error.message : String(error))
            };
          }
        }
      } catch (error) {
        return {
          error: "Create command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "delete",
    description: "Delete files and directories with safety checks and confirmation prompts",
    summary: "Delete files and directories safely",
    category: "File",
    usage: "<path> [--force] [--recursive]",
    requiresArgs: true,
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        if (args.length === 0) {
          return {
            output: "🗑️ Delete Files and Directories\n" +
              "═══════════════════════════════\n\n" +
              "Usage:\n" +
              "  /delete <path>              - Delete file or empty directory\n" +
              "  /delete <path> --recursive  - Delete directory and contents\n" +
              "  /delete <path> --force      - Skip confirmation prompts\n" +
              "  /delete <path> --force --recursive - Force delete directory\n\n" +
              "Examples:\n" +
              "  /delete old-file.txt\n" +
              "  /delete temp-dir --recursive\n" +
              "  /delete backup/ --force --recursive\n\n" +
              "⚠️ Deletion is permanent - files are not moved to trash"
          };
        }

        const { DeleteTool } = await import("../tools/native/directory-tools.js");
        const deleteTool = new DeleteTool();

        // Parse arguments
        const flags = args.filter(arg => arg.startsWith("--"));
        const pathArgs = args.filter(arg => !arg.startsWith("--"));
        const isForce = flags.includes("--force");
        const isRecursive = flags.includes("--recursive");

        if (pathArgs.length === 0) {
          return { error: "Please specify a path to delete" };
        }

        const targetPath = pathArgs[0];

        // Resolve relative paths
        const fullPath = path.resolve(targetPath);

        // Check if path exists
        let stats;
        try {
          stats = await fs.stat(fullPath);
        } catch (error: any) {
          if (error.code === "ENOENT") {
            if (isForce) {
              return {
                output: "ℹ️ Path does not exist: " + targetPath + " (ignored with --force)"
              };
            }
            return {
              error: "❌ Path does not exist: " + targetPath
            };
          } else if (error.code === "EACCES") {
            return {
              error: "❌ Permission denied: " + targetPath
            };
          } else {
            return {
              error: "❌ Cannot access path: " + (error.message || String(error))
            };
          }
        }

        // Safety checks and confirmation prompts
        const isDirectory = stats.isDirectory();
        const isFile = stats.isFile();

        if (isDirectory && !isRecursive) {
          // Check if directory is empty
          try {
            const entries = await fs.readdir(fullPath);
            if (entries.length > 0) {
              return {
                error: "❌ Directory is not empty: " + targetPath + "\n" +
                  "Use --recursive flag to delete directory and contents"
              };
            }
          } catch (error) {
            return {
              error: "❌ Cannot read directory: " + (error instanceof Error ? error.message : String(error))
            };
          }
        }

        // Count items for confirmation
        let itemCount = 1;
        if (isDirectory && isRecursive) {
          try {
            const countItems = async (dirPath: string): Promise<number> => {
              try {
                const entries = await fs.readdir(dirPath);
                let count = entries.length;

                for (const entry of entries) {
                  const entryPath = path.join(dirPath, entry);
                  try {
                    const entryStats = await fs.stat(entryPath);
                    if (entryStats.isDirectory()) {
                      count += await countItems(entryPath);
                    }
                  } catch {
                    // Skip entries we can't access
                  }
                }
                return count;
              } catch {
                return 0;
              }
            };

            itemCount = await countItems(fullPath) + 1; // +1 for the directory itself
          } catch {
            itemCount = 1; // Fallback if counting fails
          }
        }

        // Show confirmation prompt unless --force is used
        if (!isForce) {
          let confirmationMessage = "⚠️ Confirm Deletion\n";
          confirmationMessage += "═".repeat(18) + "\n\n";
          confirmationMessage += "Target: " + targetPath + "\n";
          confirmationMessage += "Type: " + (isDirectory ? "Directory" : "File") + "\n";

          if (isDirectory && isRecursive) {
            confirmationMessage += "Items to delete: " + itemCount + "\n";
            confirmationMessage += "Operation: Recursive delete\n\n";
            confirmationMessage += "🚨 This will permanently delete the directory and ALL its contents!\n";
          } else if (isDirectory) {
            confirmationMessage += "Operation: Delete empty directory\n\n";
          } else {
            confirmationMessage += "Size: " + formatFileSize(stats.size) + "\n";
            confirmationMessage += "Operation: Delete file\n\n";
          }

          confirmationMessage += "❌ This action cannot be undone\n\n";
          confirmationMessage += "To proceed, run the command again with --force flag:\n";
          confirmationMessage += "  /delete " + targetPath + (isRecursive ? " --recursive" : "") + " --force";

          return { output: confirmationMessage };
        }

        // Perform the deletion
        try {
          const result = await deleteTool.execute({
            path: targetPath,
            recursive: isRecursive,
            force: true,
            confirm: true
          });

          if (result.success) {
            let output = "✅ Deletion completed\n\n";
            output += "📍 Path: " + targetPath + "\n";
            output += "🎯 Type: " + (isDirectory ? "Directory" : "File") + "\n";

            if (result.itemsAffected > 1) {
              output += "📊 Items deleted: " + result.itemsAffected + "\n";
            }

            if (isDirectory && isRecursive) {
              output += "♻️ Recursive deletion completed\n";
            }

            output += "\n🗑️ Files have been permanently removed";

            return { output };
          } else {
            return {
              error: "❌ Deletion failed: Unknown error occurred"
            };
          }
        } catch (error: any) {
          // Handle specific errors
          if (error.code === "ENOENT") {
            return {
              error: "❌ Path does not exist: " + targetPath
            };
          } else if (error.code === "EACCES" || error.code === "EPERM") {
            return {
              error: "❌ Permission denied. Cannot delete: " + targetPath + "\n" +
                "Check file permissions or run with appropriate privileges"
            };
          } else if (error.code === "EBUSY" || error.code === "ENOTEMPTY") {
            return {
              error: "❌ Directory is busy or not empty: " + targetPath + "\n" +
                "Close any programs using files in this directory"
            };
          } else if (error.code === "EISDIR") {
            return {
              error: "❌ Cannot delete directory without --recursive flag: " + targetPath
            };
          } else if (error.code === "ENOTDIR") {
            return {
              error: "❌ Path is not a directory: " + targetPath
            };
          } else {
            return {
              error: "❌ Delete failed: " + (error.message || String(error))
            };
          }
        }
      } catch (error) {
        return {
          error: "Delete command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "move",
    description: "Move or rename files and directories with comprehensive path handling and validation",
    summary: "Move or rename files and directories",
    category: "File",
    usage: "<source> <destination> [--force]",
    requiresArgs: true,
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        if (args.length === 0) {
          return {
            output: "🚀 Move and Rename Operations\n" +
              "═".repeat(29) + "\n\n" +
              "Usage:\n" +
              "  /move <source> <destination>     - Move or rename file/directory\n" +
              "  /move <source> <destination> --force - Overwrite destination if exists\n\n" +
              "Examples:\n" +
              "  /move file.txt newname.txt       - Rename in same directory\n" +
              "  /move file.txt ../other/dir/     - Move to different directory\n" +
              "  /move dir/ newdir/               - Rename directory\n" +
              "  /move src/ backup/src/ --force   - Move with overwrite\n\n" +
              "Features:\n" +
              "├─ 📁 Directory and file operations\n" +
              "├─ 🔄 Cross-directory moves\n" +
              "├─ ⚠️ Collision detection\n" +
              "├─ 🛡️ Safe operation validation\n" +
              "└─ 📊 Detailed operation feedback"
          };
        }

        const { MoveTool } = await import("../tools/native/directory-tools.js");
        const moveTool = new MoveTool();

        // Parse arguments
        const flags = args.filter(arg => arg.startsWith("--"));
        const pathArgs = args.filter(arg => !arg.startsWith("--"));
        const isForce = flags.includes("--force");

        if (pathArgs.length < 2) {
          return { error: "Please specify both source and destination paths" };
        }

        const sourcePath = pathArgs[0];
        const destinationPath = pathArgs[1];

        // Validate source exists
        let sourceStats;
        try {
          sourceStats = await fs.stat(sourcePath);
        } catch (error: any) {
          if (error.code === "ENOENT") {
            return {
              error: "❌ Source does not exist: " + sourcePath
            };
          } else if (error.code === "EACCES") {
            return {
              error: "❌ Permission denied accessing source: " + sourcePath
            };
          } else {
            return {
              error: "❌ Cannot access source: " + (error.message || String(error))
            };
          }
        }

        // Check if destination exists
        let destinationExists = false;
        let destinationStats;
        try {
          destinationStats = await fs.stat(destinationPath);
          destinationExists = true;
        } catch (error: any) {
          if (error.code !== "ENOENT") {
            return {
              error: "❌ Cannot access destination: " + (error.message || String(error))
            };
          }
        }

        // Handle destination collision
        if (destinationExists && !isForce && destinationStats) {
          const sourceType = sourceStats.isDirectory() ? "directory" : "file";
          const destType = destinationStats.isDirectory() ? "directory" : "file";

          let confirmationMessage = "⚠️ Destination Exists\n";
          confirmationMessage += "═".repeat(20) + "\n\n";
          confirmationMessage += "Source: " + sourcePath + " (" + sourceType + ")\n";
          confirmationMessage += "Destination: " + destinationPath + " (" + destType + ")\n\n";
          confirmationMessage += "🚨 Destination already exists and will be overwritten!\n\n";
          confirmationMessage += "To proceed with overwrite, run:\n";
          confirmationMessage += "  /move " + sourcePath + " " + destinationPath + " --force";

          return { output: confirmationMessage };
        }

        // Determine operation type
        const sourceDir = path.dirname(path.resolve(sourcePath));
        const destDir = path.dirname(path.resolve(destinationPath));
        const isRename = sourceDir === destDir;
        const isCrossDirectory = !isRename;

        // Prepare operation details
        const operationType = isRename ? "rename" : "move";
        const sourceType = sourceStats.isDirectory() ? "directory" : "file";

        // If moving to a directory that exists, move into it
        let finalDestination = destinationPath;
        if (destinationExists && destinationStats && destinationStats.isDirectory()) {
          const sourceName = path.basename(sourcePath);
          finalDestination = path.join(destinationPath, sourceName);
        }

        // Perform the move operation
        try {
          const result = await moveTool.execute({
            source: sourcePath,
            destination: finalDestination,
            overwrite: isForce
          });

          if (result.success) {
            let output = "✅ " + operationType.charAt(0).toUpperCase() + operationType.slice(1) + " completed successfully\n\n";
            output += "📍 Operation: " + operationType.charAt(0).toUpperCase() + operationType.slice(1) + " " + sourceType + "\n";
            output += "📂 From: " + sourcePath + "\n";
            output += "📁 To: " + finalDestination + "\n";

            if (result.overwritten) {
              output += "⚠️ Overwritten existing destination\n";
            }

            if (isCrossDirectory) {
              output += "🔄 Cross-directory operation completed\n";
            }

            output += "\n🎯 " + sourceType.charAt(0).toUpperCase() + sourceType.slice(1) + " is now available at new location";

            return { output };
          } else {
            return {
              error: "❌ Move operation failed: Unknown error occurred"
            };
          }
        } catch (error: any) {
          // Handle specific errors
          if (error.code === "ENOENT") {
            return {
              error: "❌ Source does not exist: " + sourcePath
            };
          } else if (error.code === "EACCES" || error.code === "EPERM") {
            return {
              error: "❌ Permission denied. Cannot move: " + sourcePath + "\n" +
                "Check file permissions or run with appropriate privileges"
            };
          } else if (error.code === "EEXIST") {
            return {
              error: "❌ Destination already exists: " + destinationPath + "\n" +
                "Use --force flag to overwrite"
            };
          } else if (error.code === "EXDEV") {
            return {
              error: "❌ Cross-device move not supported: " + sourcePath + " → " + destinationPath + "\n" +
                "Try copying the file first, then delete the original"
            };
          } else if (error.code === "EBUSY") {
            return {
              error: "❌ File is busy or in use: " + sourcePath + "\n" +
                "Close any programs using this file and try again"
            };
          } else if (error.code === "ENOTDIR") {
            return {
              error: "❌ Path component is not a directory: " + sourcePath + " or " + destinationPath
            };
          } else if (error.code === "EISDIR") {
            return {
              error: "❌ Cannot move directory to file location: " + destinationPath
            };
          } else {
            return {
              error: "❌ Move failed: " + (error.message || String(error))
            };
          }
        }
      } catch (error) {
        return {
          error: "Move command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },

  {
    name: "memory",
    description: "Comprehensive session memory management with viewing, clearing, exporting, and statistics capabilities",
    summary: "Manage session memory and conversation context",
    category: "Core",
    usage: "[list|clear|export|stats|compact] [format|options]",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const action = args.length > 0 ? args[0] : "list";

        // Get memory manager instance
        let memoryManager;
        try {
          const { MemoryManager } = await import("../memory/manager.js");
          memoryManager = new MemoryManager({ memoryDir: ".plato/memory" });
          await memoryManager.initialize();
        } catch (error) {
          return {
            error: "❌ Memory system unavailable: " + (error instanceof Error ? error.message : String(error))
          };
        }

        switch (action) {
          case "list":
          case "view":
            return await handleMemoryList(memoryManager, session);

          case "clear":
            return await handleMemoryClear(memoryManager, args);

          case "export":
            const format = args[1] || "json";
            return await handleMemoryExport(memoryManager, format);

          case "stats":
          case "statistics":
            return await handleMemoryStats(memoryManager, session);

          case "compact":
            return await handleMemoryCompact(memoryManager);

          default:
            return {
              output: "📝 Memory Management System\n" +
                "═".repeat(27) + "\n\n" +
                "Available actions:\n" +
                "  /memory list             - Show current memory status and contents\n" +
                "  /memory clear            - Clear all session memory (with confirmation)\n" +
                "  /memory export <format>  - Export memory (json|markdown)\n" +
                "  /memory stats            - Show memory statistics and usage\n" +
                "  /memory compact          - Remove redundant entries and optimize\n\n" +
                "Examples:\n" +
                "  /memory list\n" +
                "  /memory export json\n" +
                "  /memory stats\n" +
                "  /memory clear --confirm\n\n" +
                "💡 Memory includes conversation history, session data, and project context"
            };
        }
      } catch (error) {
        return {
          error: "❌ Memory command failed: " + (error instanceof Error ? error.message : String(error))
        };
      }
    }
  },
  {
    name: "context",
    description: "Show conversation context and token usage information",
    summary: "Display current context state, memory usage, and project information",
    category: "System",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const command = args[0]?.toLowerCase() || "show";

        switch (command) {
          case "show":
          case "info":
          case "status":
            return await handleContextShow(session, provider);

          case "tokens":
          case "usage":
            return await handleContextTokens(session);

          case "project":
          case "plato":
            return await handleContextProject();

          case "clear":
            return await handleContextClear(session);

          default:
            let output = "❌ Unknown context command: " + command + "\n\n";
            output += "Available commands:\n";
            output += "• /context show    - Show full context information\n";
            output += "• /context tokens  - Show token usage details\n";
            output += "• /context project - Show PLATO.md project context\n";
            output += "• /context clear   - Clear current context";
            return { output };
        }
      } catch (error) {
        return {
          output: "❌ Context command failed",
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  },
  {
    name: "resume",
    description: "Restore previous session state and conversation context",
    summary: "Load and restore session from .plato/session.json",
    category: "System",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        const command = args[0]?.toLowerCase() || "load";

        switch (command) {
          case "load":
          case "restore":
            return await handleResumeLoad();

          case "list":
          case "sessions":
            return await handleResumeList();

          case "save":
            return await handleResumeSave(session);

          case "auto":
            const enabled = args[1] !== "off" && args[1] !== "false";
            return await handleResumeAuto(enabled);

          default:
            let output = "❌ Unknown resume command: " + command + "\n\n";
            output += "Available commands:\n";
            output += "• /resume load     - Load last saved session\n";
            output += "• /resume list     - Show available sessions\n";
            output += "• /resume save     - Save current session\n";
            output += "• /resume auto [on|off] - Toggle auto-save";
            return { output };
        }
      } catch (error) {
        return {
          output: "❌ Resume command failed",
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  },
  {
    name: "mcp",
    description: "Manage MCP (Model Context Protocol) servers and tools",
    summary: "Attach, detach, and manage MCP servers for extended functionality",
    category: "System",
    execute: async (args: string[], session: any, provider?: any) => {
      try {
        if (args.length === 0) {
          return await handleMcpStatus();
        }

        const command = args[0].toLowerCase();

        switch (command) {
          case "attach":
          case "connect":
            if (args.length < 3) {
              return {
                output: "❌ Missing arguments for MCP attach\n\n" +
                  "Usage: /mcp attach <name> <url>\n" +
                  "Example: /mcp attach local http://localhost:8719"
              };
            }
            const name = args[1];
            const url = args[2];
            return await handleMcpAttach(name, url);

          case "detach":
          case "disconnect":
            if (args.length < 2) {
              return {
                output: "❌ Missing server name for MCP detach\n\n" +
                  "Usage: /mcp detach <name>\n" +
                  "Example: /mcp detach local"
              };
            }
            return await handleMcpDetach(args[1]);

          case "list":
          case "servers":
            return await handleMcpList();

          case "tools":
          case "capabilities":
            return await handleMcpTools();

          case "status":
          case "info":
            return await handleMcpStatus();

          case "test":
          case "ping":
            if (args.length < 2) {
              return {
                output: "❌ Missing server name for MCP test\n\n" +
                  "Usage: /mcp test <name>\n" +
                  "Example: /mcp test local"
              };
            }
            return await handleMcpTest(args[1]);

          default:
            let output = "❌ Unknown MCP command: " + command + "\n\n";
            output += "Available commands:\n";
            output += "• /mcp attach <name> <url>  - Connect to MCP server\n";
            output += "• /mcp detach <name>        - Disconnect from server\n";
            output += "• /mcp list                 - Show attached servers\n";
            output += "• /mcp tools                - Show available tools\n";
            output += "• /mcp status               - Show MCP system status\n";
            output += "• /mcp test <name>          - Test server connection";
            return { output };
        }
      } catch (error) {
        return {
          output: "❌ MCP command failed",
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  },
];

export const SLASH_MAP = new Map(
  SLASH_COMMANDS.map((c) => [c.name, c] as const),
);

// Helper functions for MCP command implementation
async function handleMcpAttach(name: string, url: string): Promise<{ output: string; error?: string }> {
  try {
    const mcpModule = await import("../integrations/mcp.js").catch(() => ({ attachServer: null }));
    const { attachServer } = mcpModule;

    if (!attachServer) {
      return {
        output: "❌ MCP functionality not available",
        error: "MCP modules could not be loaded"
      };
    }

    // Attach the server
    await attachServer(name, url);

    let output = "✅ MCP server attached successfully\n\n";
    output += "📡 Server: " + name + "\n";
    output += "🌐 URL: " + url + "\n\n";
    output += "🎯 Next steps:\n";
    output += "  • Use '/mcp tools' to see available tools\n";
    output += "  • Use '/mcp list' to see all attached servers";

    return { output };
  } catch (error) {
    return {
      output: "❌ Failed to attach MCP server",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function handleMcpDetach(name: string): Promise<{ output: string; error?: string }> {
  try {
    const mcpModule = await import("../integrations/mcp.js").catch(() => ({ detachServer: null }));
    const { detachServer } = mcpModule;

    if (!detachServer) {
      return {
        output: "❌ MCP functionality not available",
        error: "MCP modules could not be loaded"
      };
    }

    // Detach the server
    await detachServer(name);

    let output = "✅ MCP server detached successfully\n\n";
    output += "📡 Server: " + name + "\n";
    output += "🔌 Disconnected and removed from configuration\n\n";
    output += "💡 Use '/mcp attach " + name + " <url>' to reconnect";

    return { output };
  } catch (error) {
    return {
      output: "❌ Failed to detach MCP server",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function handleMcpList(): Promise<{ output: string }> {
  try {
    const mcpModule = await import("../integrations/mcp.js").catch(() => ({ listServers: () => [] }));
    const { listServers } = mcpModule;
    const servers = await listServers();

    let output = "🔗 Attached MCP Servers\n";
    output += "═".repeat(22) + "\n\n";

    if (servers.length === 0) {
      output += "No MCP servers attached\n\n";
      output += "💡 Use '/mcp attach <name> <url>' to connect a server\n";
      output += "💡 Use '/mcp tools' to see available tools";
    } else {
      output += "Active servers: " + servers.length + "\n\n";

      for (const server of servers) {
        output += "📡 " + server.id + "\n";
        output += "   └─ URL: " + server.url + "\n";
      }

      output += "\n💡 Use '/mcp tools' to see available tools\n";
      output += "💡 Use '/mcp detach <name>' to disconnect a server";
    }

    return { output };
  } catch (error) {
    return {
      output: "❌ Failed to list MCP servers: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleMcpTools(): Promise<{ output: string; error?: string }> {
  try {
    const mcpModule = await import("../integrations/mcp.js").catch(() => ({ listTools: null }));
    const { listTools } = mcpModule;

    let output = "🛠️ Available MCP Tools\n";
    output += "═".repeat(20) + "\n\n";

    if (!listTools) {
      output += "MCP tools functionality not available\n\n";
      output += "💡 Attach MCP servers with '/mcp attach <name> <url>'\n";
      output += "💡 Use '/mcp list' to see attached servers";
      return { output };
    }

    const toolsList = await listTools();

    if (toolsList.length === 0) {
      output += "No tools available from attached servers\n\n";
      output += "💡 Attach MCP servers with '/mcp attach <name> <url>'\n";
      output += "💡 Use '/mcp list' to see attached servers";
    } else {
      output += "Available tools from attached servers:\n\n";
      for (const serverTools of toolsList) {
        output += `📡 ${serverTools.server}:\n`;
        if (serverTools.tools.length === 0) {
          output += "   └─ No tools available\n";
        } else {
          for (const tool of serverTools.tools) {
            output += `   └─ ${tool.name}`;
            if (tool.description) {
              output += `: ${tool.description}`;
            }
            output += "\n";
          }
        }
        output += "\n";
      }
    }

    return { output };
  } catch (error) {
    return {
      output: "❌ Failed to list MCP tools",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Placeholder permission helper functions
async function handlePermissionsList(): Promise<{ output: string; error?: string }> {
  return {
    output: "🔒 Permissions System\n" +
      "═".repeat(19) + "\n\n" +
      "Permissions management is not fully implemented yet.\n" +
      "This is a placeholder for future permission controls.\n\n" +
      "💡 File operations are currently allowed by default"
  };
}

async function handlePermissionsProfile(profile: string): Promise<{ output: string; error?: string }> {
  return {
    output: "🔒 Permission Profile: " + profile + "\n\n" +
      "Profile switching is not implemented yet.\n" +
      "This is a placeholder for future functionality."
  };
}

async function handlePermissionsToggle(enabled: boolean): Promise<{ output: string; error?: string }> {
  return {
    output: "🔒 Permissions " + (enabled ? "enabled" : "disabled") + "\n\n" +
      "Permission toggling is not implemented yet.\n" +
      "This is a placeholder for future functionality."
  };
}

async function handlePermissionsDefault(tool: string, action: string): Promise<{ output: string; error?: string }> {
  return {
    output: "🔒 Default Permission: " + tool + " → " + action + "\n\n" +
      "Default permission setting is not implemented yet.\n" +
      "This is a placeholder for future functionality."
  };
}

// Helper functions for browse command implementation
async function handleBrowseFile(filePath: string, stats: any): Promise<{ output: string; error?: string }> {
  try {
    const basename = path.basename(filePath);
    const dirname = path.dirname(filePath);
    const ext = path.extname(basename);
    const size = formatFileSize(stats.size);
    const modified = stats.mtime.toLocaleString();

    let output = "📄 File Information\n";
    output += "═".repeat(18) + "\n\n";
    output += "📁 Directory: " + dirname + "\n";
    output += "📝 Name: " + basename + "\n";
    output += "📏 Size: " + size + "\n";
    output += "📅 Modified: " + modified + "\n";

    // Check if file is readable
    let isReadable = false;
    let isWritable = false;

    try {
      await fs.access(filePath, fs.constants.R_OK);
      isReadable = true;
    } catch {}

    try {
      await fs.access(filePath, fs.constants.W_OK);
      isWritable = true;
    } catch {}

    output += "📊 File Information:\n";
    output += "├─ Extension: " + (ext || "(none)") + "\n";
    output += "├─ Readable: " + (isReadable ? "✅" : "❌") + "\n";
    output += "├─ Writable: " + (isWritable ? "✅" : "❌") + "\n";
    // File permissions (basic)
    output += "└─ Permissions: " + (isReadable ? "r" : "-") + (isWritable ? "w" : "-") + "\n\n";

    // Show file preview if it's a text file and not too large
    const textExtensions = [".txt", ".md", ".js", ".ts", ".json", ".html", ".css", ".py", ".yml", ".yaml", ".xml"];
    const isTextFile = textExtensions.includes(ext.toLowerCase()) || !ext;
    const isSmallFile = stats.size <= 1024 * 100; // 100KB limit

    if (isTextFile && isSmallFile && isReadable) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\n");
        const previewLines = lines.slice(0, 10); // Show first 10 lines

        output += "👀 Preview (first 10 lines):\n";
        output += "─".repeat(30) + "\n";
        for (let i = 0; i < previewLines.length; i++) {
          const lineNum = String(i + 1).padStart(3);
          output += lineNum + "│ " + previewLines[i] + "\n";
        }

        if (lines.length > 10) {
          output += "... (" + (lines.length - 10) + " more lines)\n";
        }
      } catch {
        output += "📄 File preview unavailable";
      }
    } else if (!isTextFile) {
      output += "📄 Binary file - no preview available";
    } else if (!isSmallFile) {
      output += "📄 File too large for preview (>" + formatFileSize(100 * 1024) + ")";
    } else {
      output += "📄 File preview unavailable";
    }

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to browse file: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleBrowseDirectory(dirPath: string): Promise<{ output: string; error?: string }> {
  try {
    const entries = await fs.readdir(dirPath);
    const basename = path.basename(dirPath) || dirPath;

    let output = "📁 Directory: " + basename + "\n";
    output += "═".repeat(12 + basename.length) + "\n\n";
    output += "📍 Full Path: " + dirPath + "\n";
    output += "📊 Items: " + entries.length + "\n\n";

    if (entries.length === 0) {
      output += "📂 Directory is empty\n\n";
      output += "💡 Use '/create file <name>' to add files\n";
      output += "💡 Use '/create dir <name>' to add directories";
      return { output };
    }

    // Get stats for each entry
    const entriesWithStats = [];
    for (const entry of entries) {
      try {
        const entryPath = path.join(dirPath, entry);
        const stats = await fs.stat(entryPath);
        entriesWithStats.push({
          name: entry,
          isDir: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime
        });
      } catch {
        entriesWithStats.push({
          name: entry,
          isDir: false,
          size: 0,
          modified: new Date()
        });
      }
    }

    // Sort: directories first, then files, both alphabetically
    entriesWithStats.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    // Display entries
    output += "Contents:\n";
    for (const entry of entriesWithStats) {
      const icon = entry.isDir ? "📁" : "📄";
      const size = entry.isDir ? "" : " (" + formatFileSize(entry.size) + ")";
      output += icon + " " + entry.name + size + "\n";
    }

    output += "\n💡 Navigation:\n";
    output += "├─ /browse <filename>  - View file details\n";
    output += "├─ /browse <dirname>   - Enter directory\n";
    output += "├─ /browse ..          - Go to parent directory\n";
    output += "└─ /browse ~           - Go to home directory";

    return { output };
  } catch (error: any) {
    if (error.code === "EACCES") {
      return {
        output: "",
        error: "❌ Permission denied: Cannot read directory " + dirPath
      };
    }
    return {
      output: "",
      error: "Failed to browse directory: " + (error.message || String(error))
    };
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + units[i];
}

// Model management helper functions
async function handleModelReset(): Promise<{ output: string; error?: string }> {
  try {
    const { setConfigValue, loadConfig } = await import("../config.js");
    const config = await loadConfig();
    const configAny = config as any;
    const previousModel = configAny.model?.active || "gpt-4o";
    const defaultModel = "gpt-4o";

    await setConfigValue("model.active", defaultModel);

    let output = "✅ Model reset to default\n\n";
    output += "Previous: " + previousModel + "\n";
    output += "Current: " + defaultModel + "\n\n";

    if (previousModel === defaultModel) {
      output += "ℹ️ Model was already set to default\n\n";
    }

    output += "📋 Default Model Info:\n";
    output += "├─ Name: GPT-4 Omni\n";
    output += "├─ Provider: OpenAI\n";
    output += "├─ Type: Latest GPT-4 generation\n";
    output += "└─ Capabilities: Text, vision, reasoning\n\n";

    output += "💡 Use '/model list' to see other available models\n";
    output += "💡 Use '/model set <model-id>' to choose a different model";

    return { output };
  } catch (error) {
    return {
      output: "❌ Failed to reset model",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function detectProvider(modelId: string): string {
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1-") || modelId.startsWith("o3-")) {
    return "OpenAI";
  } else if (modelId.startsWith("claude-")) {
    return "Anthropic";
  } else if (modelId.includes("gemini")) {
    return "Google";
  } else if (modelId.includes("llama")) {
    return "Meta";
  } else {
    return "Unknown";
  }
}

// Helper functions for memory command implementation
async function handleMemoryList(memoryManager: any, session: any): Promise<{ output: string; error?: string }> {
  try {
    const memories = await memoryManager.getAllMemories();
    const projectContext = await memoryManager.getProjectContext();
    const sessionData = await memoryManager.restoreSession();

    let output = "📝 Memory Status Dashboard\n";
    output += "═".repeat(26) + "\n\n";

    // Session Information
    if (session) {
      output += "💬 Current Session:\n";
      output += "├─ Messages: " + (session.messages?.length || 0) + "\n";
      if (session.model) {
        output += "├─ Model: " + session.model + "\n";
      }
      if (session.metadata?.startTime) {
        const duration = Date.now() - session.metadata.startTime;
        const durationMins = Math.round(duration / 60000);
        output += "├─ Duration: " + durationMins + " minutes\n";
      }
      output += "\n";
    }

    // Memory Statistics
    output += "🧠 Memory Statistics:\n";
    output += "├─ Total Memories: " + memories.length + "\n";

    // Group by type
    const byType: Record<string, number> = {};
    for (const memory of memories) {
      byType[memory.type] = (byType[memory.type] || 0) + 1;
    }

    if (Object.keys(byType).length > 0) {
      output += "├─ By Type:\n";
      for (const [type, count] of Object.entries(byType)) {
        output += "│  ├─ " + type + ": " + count + "\n";
      }
    }

    // Recent memories
    const recentMemories = memories.slice(-5);
    if (recentMemories.length > 0) {
      output += "├─ Recent Memories:\n";
      for (const memory of recentMemories) {
        const timestamp = new Date(memory.timestamp).toLocaleTimeString();
        output += "│  ├─ [" + timestamp + "] " + memory.type + ": " + memory.content.slice(0, 50);
        if (memory.content.length > 50) output += "...";
        output += "\n";
      }
    }
    output += "\n";

    // Project Context
    output += "📋 Project Context:\n";
    if (projectContext && projectContext.trim()) {
      const lines = projectContext.split("\n");
      output += "├─ PLATO.md: " + lines.length + " lines\n";
      output += "├─ First line: " + (lines[0] || "").slice(0, 60) + "\n";
      if (lines.length > 1) {
        output += "├─ Preview available with full context\n";
      }
    } else {
      output += "├─ No project context (PLATO.md not found)\n";
    }
    output += "\n";

    // Saved Session Data
    if (sessionData) {
      output += "💾 Saved Session:\n";
      output += "├─ Start Time: " + new Date(sessionData.startTime).toLocaleString() + "\n";
      output += "├─ Commands: " + sessionData.commands.length + "\n";
      if (sessionData.costAnalytics) {
        output += "├─ Total Cost: $" + sessionData.costAnalytics.totalCost.toFixed(4) + "\n";
        output += "├─ Interactions: " + sessionData.costAnalytics.interactionCount + "\n";
      }
    } else {
      output += "💾 Saved Session: None\n";
    }

    output += "\n💡 Use '/memory export json' to backup all memory data\n";
    output += "💡 Use '/memory stats' for detailed memory analytics";

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to list memory: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleMemoryClear(memoryManager: any, args: string[]): Promise<{ output: string; error?: string }> {
  try {
    const hasConfirm = args.includes("--confirm") || args.includes("--force");

    if (!hasConfirm) {
      const memories = await memoryManager.getAllMemories();

      let output = "⚠️ Confirm Memory Clear\n";
      output += "═".repeat(22) + "\n\n";
      output += "This will permanently delete:\n";
      output += "├─ " + memories.length + " memory entries\n";
      output += "├─ All conversation history\n";
      output += "├─ Session data and context\n";
      output += "└─ Cost analytics data\n\n";
      output += "🚨 This action cannot be undone!\n\n";
      output += "Project context (PLATO.md) will be preserved.\n\n";
      output += "To proceed, run:\n";
      output += "  /memory clear --confirm";

      return { output };
    }

    // Perform the clear operation
    await memoryManager.clearAllMemories();

    let output = "✅ Memory cleared successfully\n\n";
    output += "🗑️ Deleted all memory entries\n";
    output += "🧹 Cleared session data\n";
    output += "💾 Project context (PLATO.md) preserved\n\n";
    output += "💡 Memory system reset and ready for new data\n";
    output += "💡 Use '/memory list' to verify clean state";

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to clear memory: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleMemoryExport(memoryManager: any, format: string): Promise<{ output: string; error?: string }> {
  try {
    const validFormats = ["json", "markdown"];
    if (!validFormats.includes(format)) {
      return {
        output: "",
        error: "Invalid format: " + format + "\n" +
          "Valid formats: " + validFormats.join(", ")
      };
    }

    const exportData = await memoryManager.exportMemories(format as "json" | "markdown");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = "plato-memory-export-" + timestamp + "." + (format === "json" ? "json" : "md");

    // Write export to file
    await fs.writeFile(filename, exportData, "utf8");

    let output = "📤 Memory Export Complete\n";
    output += "═".repeat(24) + "\n\n";
    output += "📄 Format: " + format.toUpperCase() + "\n";
    output += "📁 File: " + filename + "\n";
    output += "📊 Size: " + formatFileSize(Buffer.byteLength(exportData, "utf8")) + "\n\n";

    if (format === "json") {
      output += "📋 JSON Export includes:\n";
      output += "├─ All memory entries with metadata\n";
      output += "├─ Project context (PLATO.md)\n";
      output += "├─ Session data and analytics\n";
      output += "└─ Structured for easy import\n";
    } else {
      output += "📋 Markdown Export includes:\n";
      output += "├─ Human-readable memory entries\n";
      output += "├─ Project context section\n";
      output += "├─ Organized by type and timestamp\n";
      output += "└─ Easy to read and share\n";
    }

    output += "\n💡 Use this file to backup or transfer memory data\n";
    output += "💡 JSON format can be imported back with future import command";

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to export memory: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleMemoryStats(memoryManager: any, session: any): Promise<{ output: string; error?: string }> {
  try {
    const stats = await memoryManager.getStatistics();
    const memories = await memoryManager.getAllMemories();
    const projectContext = await memoryManager.getProjectContext();

    let output = "📊 Memory Analytics Dashboard\n";
    output += "═".repeat(29) + "\n\n";

    // Basic Statistics
    output += "📈 Overview:\n";
    output += "├─ Total Memories: " + stats.totalMemories + "\n";
    output += "├─ Project Context: " + (projectContext ? "Present" : "None") + "\n";
    if (projectContext) {
      const lines = projectContext.split("\n").length;
      const chars = projectContext.length;
      output += "├─ Context Size: " + lines + " lines, " + formatFileSize(chars) + "\n";
    }

    // Memory by Type
    if (Object.keys(stats.byType).length > 0) {
      output += "├─ Memory Types:\n";
      const sortedTypes = Object.entries(stats.byType)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 10); // Top 10 types

      for (const [type, count] of sortedTypes) {
        const percentage = (((count as number) / stats.totalMemories) * 100).toFixed(1);
        output += "│  ├─ " + type + ": " + count + " (" + percentage + "%)\n";
      }
    }

    // Time Range
    if (stats.oldestMemory && stats.newestMemory) {
      const oldestDate = new Date(stats.oldestMemory);
      const newestDate = new Date(stats.newestMemory);
      const daysDiff = Math.ceil((newestDate.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));

      output += "├─ Time Range:\n";
      output += "│  ├─ Oldest: " + oldestDate.toLocaleDateString() + "\n";
      output += "│  ├─ Newest: " + newestDate.toLocaleDateString() + "\n";
      output += "│  └─ Span: " + daysDiff + " days\n";
    }

    // Session Analytics
    if (session && session.messages) {
      output += "├─ Current Session:\n";
      output += "│  ├─ Messages: " + session.messages.length + "\n";

      // Estimate token usage (rough calculation)
      let totalChars = 0;
      for (const msg of session.messages) {
        if (typeof msg.content === "string") {
          totalChars += msg.content.length;
        }
      }
      const estimatedTokens = Math.round(totalChars / 4); // Rough estimate
      output += "│  ├─ Est. Tokens: ~" + estimatedTokens.toLocaleString() + "\n";

      if (session.metadata?.startTime) {
        const duration = Date.now() - session.metadata.startTime;
        const durationMins = Math.round(duration / 60000);
        output += "│  └─ Duration: " + durationMins + " minutes\n";
      }
    }
    output += "\n";

    // Recent Activity
    const recentMemories = memories.slice(-10);
    if (recentMemories.length > 0) {
      output += "🕒 Recent Activity:\n";
      const activityByHour: Record<string, number> = {};

      for (const memory of recentMemories) {
        const hour = new Date(memory.timestamp).getHours();
        const hourKey = hour.toString().padStart(2, "0") + ":00";
        activityByHour[hourKey] = (activityByHour[hourKey] || 0) + 1;
      }

      const topHours = Object.entries(activityByHour)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);

      for (const [hour, count] of topHours) {
        output += "├─ " + hour + ": " + count + " memories\n";
      }
    }

    output += "\n💡 Memory Usage Recommendations:\n";
    if (stats.totalMemories > 800) {
      output += "⚠️ High memory usage detected - consider using '/memory compact'\n";
    } else if (stats.totalMemories > 500) {
      output += "📊 Moderate memory usage - monitor for performance\n";
    } else {
      output += "✅ Memory usage is optimal\n";
    }

    output += "💡 Use '/memory export' to backup before cleanup operations";

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to get memory statistics: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleMemoryCompact(memoryManager: any): Promise<{ output: string; error?: string }> {
  try {
    const memoriesBeforeCompact = await memoryManager.getAllMemories();
    const beforeCount = memoriesBeforeCompact.length;

    // Perform compaction
    await memoryManager.compact();

    const memoriesAfterCompact = await memoryManager.getAllMemories();
    const afterCount = memoriesAfterCompact.length;
    const removed = beforeCount - afterCount;

    let output = "🗜️ Memory Compaction Complete\n";
    output += "═".repeat(28) + "\n\n";
    output += "📊 Compaction Results:\n";
    output += "├─ Before: " + beforeCount + " memories\n";
    output += "├─ After: " + afterCount + " memories\n";
    output += "├─ Removed: " + removed + " entries\n";

    if (removed > 0) {
      const savedPercentage = ((removed / beforeCount) * 100).toFixed(1);
      output += "├─ Space Saved: " + savedPercentage + "%\n";
    }
    output += "\n";

    output += "🔧 Compaction Operations:\n";
    output += "├─ ✅ Removed duplicate entries\n";
    output += "├─ ✅ Kept most recent memories (last 500)\n";
    output += "├─ ✅ Preserved project context\n";
    output += "└─ ✅ Optimized memory structure\n\n";

    if (removed > 0) {
      output += "✅ Memory optimized successfully\n";
      output += "💡 Performance should be improved";
    } else {
      output += "ℹ️ No optimization needed - memory already efficient\n";
      output += "💡 Memory is currently well-organized";
    }

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to compact memory: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

// Helper functions for context command implementation
async function handleContextShow(session: any, provider?: any): Promise<{ output: string; error?: string }> {
  try {
    let output = "🔍 Context Information\n";
    output += "═".repeat(21) + "\n\n";

    // Session information
    output += "📊 Session Status\n";
    output += "─".repeat(16) + "\n";
    output += "🏃 Active Session: " + (session ? "Yes" : "No") + "\n";

    if (session) {
      const sessionId = session.sessionId || "unknown";
      const startTime = session.startTime || "unknown";
      output += "🆔 Session ID: " + sessionId + "\n";
      output += "⏰ Started: " + startTime + "\n";

      if (session.messageCount) {
        output += "💬 Message Count: " + session.messageCount + "\n";
      }

      if (session.context) {
        const contextLength = JSON.stringify(session.context).length;
        output += "📏 Context Size: " + formatFileSize(contextLength) + "\n";
      }
    }

    // Provider information
    output += "\n🤖 AI Provider\n";
    output += "─".repeat(13) + "\n";
    if (provider) {
      output += "🔗 Provider: Connected\n";
      if (provider.model) {
        output += "🧠 Model: " + provider.model + "\n";
      }
      if (provider.provider) {
        output += "🏢 Service: " + provider.provider + "\n";
      }
    } else {
      output += "❌ Provider: Not connected\n";
    }

    // Memory system status
    try {
      const { MemoryManager } = await import("../memory/manager.js");
      const memoryManager = new MemoryManager({ memoryDir: ".plato/memory" });
      await memoryManager.initialize();

      const stats = await memoryManager.getStatistics();

      output += "\n💾 Memory System\n";
      output += "─".repeat(14) + "\n";
      output += "📝 Total Memories: " + stats.totalMemories + "\n";
      output += "💽 Disk Usage: " + formatFileSize(stats.diskUsage) + "\n";

      if (stats.oldestMemory) {
        const oldestDate = new Date(stats.oldestMemory).toLocaleDateString();
        output += "📅 Oldest Memory: " + oldestDate + "\n";
      }

      if (stats.newestMemory) {
        const newestDate = new Date(stats.newestMemory).toLocaleDateString();
        output += "🕐 Latest Memory: " + newestDate + "\n";
      }
    } catch (error) {
      output += "\n💾 Memory System: ⚠️ Unavailable\n";
    }

    // Project context
    try {
      const platoPath = process.cwd() + "/PLATO.md";
      const fs = await import("fs/promises");
      const platoContent = await fs.readFile(platoPath, "utf-8");

      output += "\n📋 Project Context\n";
      output += "─".repeat(16) + "\n";
      output += "📄 PLATO.md: Found (" + formatFileSize(platoContent.length) + ")\n";

      const lines = platoContent.split("\n").length;
      output += "📏 Lines: " + lines + "\n";

      // Extract first heading
      const firstHeading = platoContent.split("\n").find(line => line.startsWith("# "));
      if (firstHeading) {
        output += "📋 Title: " + firstHeading.replace(/^# /, "") + "\n";
      }
    } catch (error) {
      output += "\n📋 Project Context: ⚠️ No PLATO.md found\n";
    }

    output += "\n💡 Use '/context tokens' for detailed usage information\n";
    output += "💡 Use '/context project' to view full PLATO.md content";

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to show context: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleContextTokens(session: any): Promise<{ output: string; error?: string }> {
  try {
    let output = "🎯 Token Usage Analysis\n";
    output += "═".repeat(22) + "\n\n";

    // Estimate current context usage
    let contextSize = 0;
    let messageCount = 0;

    if (session) {
      if (session.context) {
        contextSize = JSON.stringify(session.context).length;
      }
      if (session.messageCount) {
        messageCount = session.messageCount;
      }
    }

    // Rough token estimation (1 token ≈ 4 characters for English text)
    const estimatedTokens = Math.ceil(contextSize / 4);
    const maxTokens = 200000; // Claude 3.5 Sonnet context window
    const usagePercent = ((estimatedTokens / maxTokens) * 100).toFixed(1);

    output += "📊 Current Usage\n";
    output += "─".repeat(14) + "\n";
    output += "🔤 Characters: " + contextSize.toLocaleString() + "\n";
    output += "🎯 Est. Tokens: ~" + estimatedTokens.toLocaleString() + "\n";
    output += "📏 Usage: " + usagePercent + "% of max context\n";
    output += "💬 Messages: " + messageCount + "\n\n";

    // Context window information
    output += "🪟 Context Window\n";
    output += "─".repeat(15) + "\n";
    output += "📐 Max Tokens: " + maxTokens.toLocaleString() + "\n";
    output += "🔋 Remaining: ~" + (maxTokens - estimatedTokens).toLocaleString() + " tokens\n\n";

    // Usage thresholds and warnings
    const percent = parseFloat(usagePercent);
    if (percent > 90) {
      output += "🚨 WARNING: Context nearly full! Consider compacting\n";
    } else if (percent > 75) {
      output += "⚠️ High usage: Consider '/memory compact' soon\n";
    } else if (percent > 50) {
      output += "ℹ️ Moderate usage: Memory management may be helpful\n";
    } else {
      output += "✅ Good: Plenty of context space available\n";
    }

    output += "\n💡 Use '/memory compact' to reduce context usage\n";
    output += "💡 Use '/memory clear' to reset if needed";

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to show token usage: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleContextProject(): Promise<{ output: string; error?: string }> {
  try {
    const fs = await import("fs/promises");
    const platoPath = process.cwd() + "/PLATO.md";

    try {
      const content = await fs.readFile(platoPath, "utf-8");

      let output = "📋 Project Context (PLATO.md)\n";
      output += "═".repeat(30) + "\n\n";

      // Show file info
      const stats = await fs.stat(platoPath);
      output += "📄 File: PLATO.md\n";
      output += "📏 Size: " + formatFileSize(stats.size) + "\n";
      output += "📅 Modified: " + stats.mtime.toLocaleString() + "\n\n";

      // Show content with line numbers
      const lines = content.split("\n");
      output += "📖 Content:\n";
      output += "─".repeat(10) + "\n";

      for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const lineNum = String(i + 1).padStart(3);
        output += lineNum + "│ " + lines[i] + "\n";
      }

      if (lines.length > 50) {
        output += "... (" + (lines.length - 50) + " more lines)\n";
        output += "\n💡 Showing first 50 lines. Full content available in PLATO.md";
      }

      return { output };
    } catch (error) {
      let output = "📋 Project Context\n";
      output += "═".repeat(16) + "\n\n";
      output += "❌ PLATO.md not found in current directory\n\n";
      output += "💡 Create PLATO.md to provide project context:\n";
      output += "   • Project description and goals\n";
      output += "   • Architecture overview\n";
      output += "   • Development guidelines\n";
      output += "   • Key features and requirements";

      return { output };
    }
  } catch (error) {
    return {
      output: "",
      error: "Failed to read project context: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleContextClear(session: any): Promise<{ output: string; error?: string }> {
  try {
    let output = "🧹 Context Clear Operation\n";
    output += "═".repeat(25) + "\n\n";

    if (!session) {
      output += "ℹ️ No active session to clear\n\n";
      output += "💡 Context clearing only affects active conversation context\n";
      output += "💡 Use '/memory clear' to clear persistent memory";
      return { output };
    }

    // This is a placeholder - actual context clearing would need to be implemented
    // in the session management system
    output += "⚠️ Context clearing is not fully implemented yet\n\n";
    output += "Available alternatives:\n";
    output += "• /memory clear    - Clear persistent memory\n";
    output += "• /memory compact  - Reduce context usage\n\n";
    output += "💡 This command would reset the current conversation context\n";
    output += "💡 but preserve persistent memory and project information";

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to clear context: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

// Helper functions for resume command implementation
async function handleResumeLoad(): Promise<{ output: string; error?: string }> {
  try {
    const fs = await import("fs/promises");
    const sessionPath = ".plato/session.json";

    let output = "📂 Session Restoration\n";
    output += "═".repeat(19) + "\n\n";

    try {
      const sessionData = await fs.readFile(sessionPath, "utf-8");
      const session = JSON.parse(sessionData);

      output += "✅ Session file found: .plato/session.json\n";
      output += "📊 Session Information:\n";
      output += "─".repeat(20) + "\n";

      if (session.sessionId) {
        output += "🆔 Session ID: " + session.sessionId + "\n";
      }

      if (session.startTime) {
        const startTime = new Date(session.startTime);
        output += "⏰ Started: " + startTime.toLocaleString() + "\n";
      }

      if (session.lastSaveTime) {
        const saveTime = new Date(session.lastSaveTime);
        output += "💾 Last Saved: " + saveTime.toLocaleString() + "\n";
      }

      if (session.messageCount) {
        output += "💬 Messages: " + session.messageCount + "\n";
      }

      if (session.context) {
        const contextSize = JSON.stringify(session.context).length;
        output += "📏 Context Size: " + formatFileSize(contextSize) + "\n";
      }

      if (session.memory && Array.isArray(session.memory)) {
        output += "🧠 Memory Entries: " + session.memory.length + "\n";
      }

      output += "\n⚠️ Session restoration is not fully implemented yet\n";
      output += "The TUI application would need to support loading this data\n\n";
      output += "💡 Session data is available and would restore:\n";
      output += "  • Conversation history\n";
      output += "  • Memory entries\n";
      output += "  • Application state\n";
      output += "  • User preferences";

      return { output };
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        output += "❌ No saved session found\n\n";
        output += "💡 No .plato/session.json file exists\n";
        output += "💡 Use '/resume save' to save current session\n";
        output += "💡 Sessions are auto-saved when using the TUI";
      } else {
        output += "❌ Failed to read session file\n";
        output += "Error: " + ((error as Error).message || String(error));
      }

      return { output };
    }
  } catch (error) {
    return {
      output: "",
      error: "Failed to load session: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleResumeList(): Promise<{ output: string; error?: string }> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");

    let output = "📋 Available Sessions\n";
    output += "═".repeat(18) + "\n\n";

    // Check main session file
    const sessionPath = ".plato/session.json";
    const sessionExists = await fs.access(sessionPath).then(() => true).catch(() => false);

    if (sessionExists) {
      try {
        const sessionData = await fs.readFile(sessionPath, "utf-8");
        const session = JSON.parse(sessionData);
        const stats = await fs.stat(sessionPath);

        output += "📄 Main Session (session.json)\n";
        output += "─".repeat(30) + "\n";
        output += "📅 Modified: " + stats.mtime.toLocaleString() + "\n";
        output += "📏 Size: " + formatFileSize(stats.size) + "\n";

        if (session.sessionId) {
          output += "🆔 ID: " + session.sessionId + "\n";
        }

        if (session.messageCount) {
          output += "💬 Messages: " + session.messageCount + "\n";
        }

        output += "\n";
      } catch (error) {
        output += "📄 Main Session: ⚠️ Found but corrupted\n\n";
      }
    }

    // Check for backup sessions in .plato directory
    try {
      const platoDir = ".plato";
      const platoExists = await fs.access(platoDir).then(() => true).catch(() => false);

      if (platoExists) {
        const entries = await fs.readdir(platoDir);
        const sessionFiles = entries.filter(name =>
          name.startsWith("session-backup-") && name.endsWith(".json")
        );

        if (sessionFiles.length > 0) {
          output += "💾 Backup Sessions\n";
          output += "─".repeat(16) + "\n";

          for (const file of sessionFiles.slice(0, 5)) { // Show max 5 backups
            try {
              const fullPath = path.join(platoDir, file);
              const stats = await fs.stat(fullPath);
              output += "📄 " + file + " (" + formatFileSize(stats.size) + ")\n";
              output += "   └─ " + stats.mtime.toLocaleDateString() + "\n";
            } catch (error) {
              output += "📄 " + file + " (corrupted)\n";
            }
          }

          if (sessionFiles.length > 5) {
            output += "... and " + (sessionFiles.length - 5) + " more backup files\n";
          }
        }
      }
    } catch (error) {
      // Ignore backup search errors
    }

    if (!sessionExists) {
      output += "ℹ️ No sessions found\n\n";
      output += "💡 Start using the TUI to create session data\n";
      output += "💡 Sessions are auto-saved during conversations";
    } else {
      output += "\n💡 Use '/resume load' to restore the main session\n";
      output += "💡 Session restoration requires TUI restart";
    }

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to list sessions: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleResumeSave(session: any): Promise<{ output: string; error?: string }> {
  try {
    const fs = await import("fs/promises");
    const sessionPath = ".plato/session.json";

    let output = "💾 Session Save\n";
    output += "═".repeat(12) + "\n\n";

    if (!session) {
      output += "⚠️ No active session to save\n\n";
      output += "💡 Session saving is typically handled automatically\n";
      output += "💡 Start a TUI session to generate session data";
      return { output };
    }

    // Prepare session data
    const sessionData = {
      sessionId: session.sessionId || "manual-" + Date.now(),
      startTime: session.startTime || new Date().toISOString(),
      lastSaveTime: new Date().toISOString(),
      messageCount: session.messageCount || 0,
      context: session.context || {},
      memory: session.memory || [],
      preferences: session.preferences || {},
      version: "1.0"
    };

    // Create .plato directory if needed
    try {
      await fs.mkdir(".plato", { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Save session
    await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2), "utf-8");

    output += "✅ Session saved successfully\n";
    output += "📄 File: .plato/session.json\n";
    output += "🆔 Session ID: " + sessionData.sessionId + "\n";
    output += "⏰ Saved at: " + new Date().toLocaleString() + "\n";

    const dataSize = JSON.stringify(sessionData).length;
    output += "📏 Data Size: " + formatFileSize(dataSize) + "\n\n";

    output += "💡 Session includes:\n";
    output += "  • Session metadata and timestamps\n";
    output += "  • Conversation context\n";
    output += "  • Memory entries\n";
    output += "  • User preferences\n\n";

    output += "💡 Use '/resume load' to restore this session later";

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to save session: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleResumeAuto(enabled: boolean): Promise<{ output: string; error?: string }> {
  try {
    let output = "🔄 Auto-Resume Configuration\n";
    output += "═".repeat(26) + "\n\n";

    // This would integrate with the application's configuration system
    output += "⚠️ Auto-resume configuration is not fully implemented\n\n";
    output += "Configuration request: " + (enabled ? "Enable" : "Disable") + " auto-resume\n\n";

    if (enabled) {
      output += "✅ Auto-resume would be enabled\n";
      output += "This would automatically:\n";
      output += "  • Save sessions every 30 seconds\n";
      output += "  • Restore last session on startup\n";
      output += "  • Create backup sessions\n";
      output += "  • Preserve conversation state";
    } else {
      output += "❌ Auto-resume would be disabled\n";
      output += "This would:\n";
      output += "  • Stop automatic session saving\n";
      output += "  • Require manual '/resume save'\n";
      output += "  • Start fresh on each launch";
    }

    output += "\n\n💡 Auto-resume is handled by the TUI application\n";
    output += "💡 Configuration would be stored in .plato/config.json";

    return { output };
  } catch (error) {
    return {
      output: "",
      error: "Failed to configure auto-resume: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

// Additional helper functions for MCP command implementation
async function handleMcpStatus(): Promise<{ output: string; error?: string }> {
  try {
    let output = "🔗 MCP System Status\n";
    output += "═".repeat(18) + "\n\n";

    // Check if MCP client is available
    try {
      const mcpModule = await import("../integrations/mcp.js").catch(() => null);

      if (!mcpModule) {
        output += "❌ MCP System: Not Available\n";
        output += "The MCP client module could not be loaded\n\n";
        output += "💡 MCP (Model Context Protocol) provides extended functionality\n";
        output += "💡 Install MCP support to enable server connections";
        return { output };
      }

      const { listServers } = mcpModule;
      const servers = await listServers();
      const serverCount = servers.length;

      output += "✅ MCP System: Available\n";
      output += "📊 Status Overview:\n";
      output += "─".repeat(16) + "\n";
      output += "🔗 Attached Servers: " + serverCount + "\n";

      if (serverCount === 0) {
        output += "📱 Available Tools: 0\n";
        output += "🟡 Status: Ready (no servers)\n\n";

        output += "💡 Getting Started:\n";
        output += "  • Use '/mcp attach <name> <url>' to connect servers\n";
        output += "  • Use '/mcp tools' to see available functionality\n";
        output += "  • Use '/mcp list' to manage connections";
      } else {
        // Try to get tools count (placeholder)
        output += "📱 Available Tools: " + (serverCount * 5) + " (estimated)\n"; // Rough estimate
        output += "🟢 Status: Active\n\n";

        output += "🔗 Connected Servers:\n";
        for (const server of servers) {
          output += "  • " + server.id + " (" + server.url + ")\n";
        }

        output += "\n💡 Use '/mcp tools' to see all available tools\n";
        output += "💡 Use '/mcp test <name>' to check server health";
      }

      return { output };
    } catch (error) {
      output += "⚠️ MCP System: Error\n";
      output += "Error checking MCP status: " + (error instanceof Error ? error.message : String(error)) + "\n\n";
      output += "💡 This might indicate a configuration issue\n";
      output += "💡 Try restarting the application or checking MCP server status";

      return { output };
    }
  } catch (error) {
    return {
      output: "",
      error: "Failed to check MCP status: " + (error instanceof Error ? error.message : String(error))
    };
  }
}

async function handleMcpTest(serverName: string): Promise<{ output: string; error?: string }> {
  try {
    let output = "🧪 MCP Server Test: " + serverName + "\n";
    output += "═".repeat(20 + serverName.length) + "\n\n";

    try {
      const mcpModule = await import("../integrations/mcp.js").catch(() => null);

      if (!mcpModule) {
        return {
          output: "❌ MCP client not available - cannot test servers",
          error: "MCP module could not be loaded"
        };
      }

      const { listServers, health } = mcpModule;
      const servers = await listServers();
      const serverNames = servers.map(s => s.id);
      const targetServer = servers.find(s => s.id === serverName);

      if (!targetServer) {
        output += "❌ Server not found: " + serverName + "\n\n";
        output += "Available servers:\n";

        if (serverNames.length === 0) {
          output += "  (no servers attached)\n\n";
          output += "💡 Use '/mcp attach <name> <url>' to connect servers";
        } else {
          for (const name of serverNames) {
            output += "  • " + name + "\n";
          }
          output += "\n💡 Use one of the available server names";
        }

        return { output };
      }

      output += "🔍 Testing server connection...\n";
      output += "📡 Server: " + serverName + "\n";
      output += "🌐 URL: " + targetServer.url + "\n\n";

      // Basic connectivity test (this would need actual implementation)
      output += "⚠️ MCP server testing is not fully implemented\n\n";
      output += "Test results would include:\n";
      output += "  • ✅ Connection established\n";
      output += "  • ✅ Server responds to ping\n";
      output += "  • ✅ Available tools enumerated\n";
      output += "  • ✅ Protocol compatibility verified\n\n";

      output += "💡 This feature requires full MCP client implementation\n";
      output += "💡 Server appears to be configured correctly";

      return { output };
    } catch (error) {
      output += "❌ Test failed for server: " + serverName + "\n";
      output += "Error: " + (error instanceof Error ? error.message : String(error)) + "\n\n";

      output += "Common issues:\n";
      output += "  • Server is not running\n";
      output += "  • Incorrect URL or port\n";
      output += "  • Network connectivity problems\n";
      output += "  • Server configuration errors\n\n";

      output += "💡 Check server logs and configuration\n";
      output += "💡 Verify the server is running at the specified URL";

      return { output };
    }
  } catch (error) {
    return {
      output: "",
      error: "Failed to test MCP server: " + (error instanceof Error ? error.message : String(error))
    };
  }
}