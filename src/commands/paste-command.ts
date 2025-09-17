/**
 * Paste Command Implementation
 * Implements the /paste slash command for managing paste mode in the TUI
 */

import {
  getPasteSettingsManager,
  type PasteSettings,
} from "../config/paste-settings.js";
import type { CommandExecutionResult } from "./types.js";

/**
 * Paste command arguments
 */
export interface PasteCommandArgs {
  /** Timeout duration in seconds */
  timeout?: number;
  /** Action to perform */
  action?: "on" | "off" | "toggle" | "status" | "config" | "reset" | "help";
  /** Setting key for config action */
  setting?: keyof PasteSettings;
  /** Value for setting (for config action) */
  value?: string | number | boolean;
  /** Show detailed information */
  verbose?: boolean;
}

/**
 * Parse paste command arguments
 */
export function parsePasteCommandArgs(args: string[]): PasteCommandArgs {
  const parsed: PasteCommandArgs = {};

  // No arguments defaults to toggle with default timeout
  if (args.length === 0) {
    parsed.action = "toggle";
    return parsed;
  }

  const [firstArg, ...remaining] = args;

  // Handle simple actions
  const simpleActions = [
    "on",
    "off",
    "toggle",
    "status",
    "config",
    "reset",
    "help",
  ];

  if (simpleActions.includes(firstArg)) {
    parsed.action = firstArg as any;

    // Handle config action with setting and value
    if (firstArg === "config" && remaining.length >= 2) {
      parsed.setting = remaining[0] as keyof PasteSettings;
      const valueStr = remaining[1];

      // Try to parse value as number or boolean
      if (valueStr === "true") {
        parsed.value = true;
      } else if (valueStr === "false") {
        parsed.value = false;
      } else if (!isNaN(Number(valueStr))) {
        parsed.value = Number(valueStr);
      } else {
        parsed.value = valueStr;
      }
    }

    return parsed;
  }

  // Try to parse first argument as timeout duration
  const timeoutValue = Number(firstArg);
  if (!isNaN(timeoutValue) && timeoutValue > 0) {
    parsed.timeout = timeoutValue;
    parsed.action = "on";
  } else {
    // Invalid first argument, show help
    parsed.action = "help";
  }

  return parsed;
}

/**
 * Format paste settings for display
 */
function formatPasteSettings(settings: PasteSettings): string {
  const lines = [
    "📋 Paste Mode Configuration:",
    "─".repeat(30),
    "• Default Timeout: " + settings.defaultTimeout + "s",
    "• Currently Active: " + (settings.isActive ? "Yes" : "No"),
    "• Current Timeout: " + settings.currentTimeout + "s",
    "• Show Countdown: " + (settings.showCountdown ? "Yes" : "No"),
    "• Auto Clear: " + (settings.autoClear ? "Yes" : "No"),
  ];

  if (settings.isActive) {
    lines.push("", "⚠️  Paste mode is currently ACTIVE");
    lines.push("   Input processing is temporarily disabled");
  }

  return lines.join("\n");
}

/**
 * Execute paste command
 */
export async function executePasteCommand(
  args: string[]
): Promise<CommandExecutionResult> {
  try {
    const parsed = parsePasteCommandArgs(args);
    const manager = getPasteSettingsManager();

    switch (parsed.action) {
      case "help":
        return {
          success: true,
          output: [
            "📋 Paste Command Usage:",
            "",
            "Basic Usage:",
            "  /paste           - Toggle paste mode with default timeout",
            "  /paste 10        - Enable paste mode for 10 seconds",
            "  /paste on        - Enable paste mode with default timeout",
            "  /paste off       - Disable paste mode",
            "",
            "Status & Configuration:",
            "  /paste status    - Show current paste mode status",
            "  /paste config    - Show current configuration",
            "  /paste reset     - Reset to default settings",
            "",
            "Configuration Options:",
            "  /paste config defaultTimeout 10  - Set default timeout to 10s",
            "  /paste config showCountdown true - Enable countdown display",
            "  /paste config autoClear false    - Disable auto-clear",
            "",
            "About Paste Mode:",
            "Paste mode temporarily disables input processing to allow easy",
            "clipboard pasting without interference from keyboard handlers.",
            "It automatically disables after the specified timeout.",
          ].join("\n"),
        };

      case "status":
        const currentSettings = manager.getSettings();
        return {
          success: true,
          output: formatPasteSettings(currentSettings),
        };

      case "config":
        if (parsed.setting && parsed.value !== undefined) {
          // Update specific setting
          const updateObj: Partial<PasteSettings> = {};
          updateObj[parsed.setting] = parsed.value as any;

          manager.updateSettings(updateObj);

          return {
            success: true,
            output: "✅ Updated " + String(parsed.setting) + " to " + String(parsed.value) + "\n\n" + formatPasteSettings(manager.getSettings()),
          };
        } else {
          // Show current configuration
          return {
            success: true,
            output: formatPasteSettings(manager.getSettings()),
          };
        }

      case "reset":
        const resetSettings = manager.resetSettings();
        return {
          success: true,
          output: "✅ Paste settings reset to defaults\n\n" + formatPasteSettings(resetSettings),
        };

      case "on":
        const activatedSettings = manager.activatePasteMode(parsed.timeout);
        const timeoutMsg = parsed.timeout ?
          " for " + parsed.timeout + " seconds" :
          " for " + activatedSettings.defaultTimeout + " seconds (default)";

        return {
          success: true,
          output: "✅ Paste mode enabled" + timeoutMsg + "\n\n" +
                 "📋 Input processing is now disabled for easy clipboard pasting.\n" +
                 "   Mode will automatically disable after timeout.",
        };

      case "off":
        manager.deactivatePasteMode();
        return {
          success: true,
          output: "✅ Paste mode disabled\n\n📋 Input processing has been re-enabled.",
        };

      case "toggle":
      default:
        const toggledSettings = manager.togglePasteMode(parsed.timeout);

        if (toggledSettings.isActive) {
          const timeoutMsg = parsed.timeout ?
            " for " + parsed.timeout + " seconds" :
            " for " + toggledSettings.defaultTimeout + " seconds (default)";

          return {
            success: true,
            output: "✅ Paste mode enabled" + timeoutMsg + "\n\n" +
                   "📋 Input processing is now disabled for easy clipboard pasting.\n" +
                   "   Mode will automatically disable after timeout.",
          };
        } else {
          return {
            success: true,
            output: "✅ Paste mode disabled\n\n📋 Input processing has been re-enabled.",
          };
        }
    }
  } catch (error) {
    return {
      success: false,
      error: "Paste command failed: " + (error instanceof Error ? error.message : String(error)),
    };
  }
}