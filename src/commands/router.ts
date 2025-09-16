/**
 * Central command routing system for slash commands
 * Ensures commands are processed and not sent to AI
 */

import { Session } from "../core/session.js";
import { SlashCommand, SLASH_COMMANDS } from "../slash/commands.js";
import pc from "picocolors";

export interface CommandResult {
  handled: boolean;
  command?: string;
  args?: string[];
  output?: string;
  error?: string;
  requiresConfirmation?: boolean;
}

/**
 * Parse a slash command string into command and arguments
 * Properly handles quoted strings to preserve spaces within quotes
 */
export function parseCommand(input: string): { command: string; args: string[] } | null {
  // Trim first to handle leading whitespace
  const trimmed = input.trim();

  // Check if input starts with slash
  if (!trimmed.startsWith("/")) {
    return null;
  }

  // Handle escaped slashes
  if (trimmed.startsWith("\\/")) {
    return null;
  }

  // Remove leading slash and trim again
  const commandPart = trimmed.slice(1).trim();
  if (!commandPart) {
    return null;
  }

  // Parse command and arguments with proper quote handling
  const { command, args } = parseQuotedArguments(commandPart);

  return { command: command.toLowerCase(), args };
}

/**
 * Parse a string into command and arguments, respecting quoted strings
 * Handles both single and double quotes, removes quotes from final values
 */
function parseQuotedArguments(input: string): { command: string; args: string[] } {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let i = 0;
  let isIsolatedQuote = false; // Track if quote starts at word boundary

  while (i < input.length) {
    const char = input[i];

    if (!inQuotes && (char === '"' || char === "'")) {
      // Start of quoted string
      inQuotes = true;
      quoteChar = char;
      // Check if this is an isolated quote (starts at word boundary or after space)
      isIsolatedQuote = current.length === 0;
    } else if (inQuotes && char === quoteChar) {
      // End of quoted string - check if next char is escaped
      if (i + 1 < input.length && input[i + 1] === quoteChar) {
        // Escaped quote - add the quote character and skip next
        current += char;
        i++; // Skip the next quote
      } else {
        // End of quoted string
        inQuotes = false;

        // Check if this is an isolated empty quote pair
        if (isIsolatedQuote && current.length === 0) {
          // For isolated empty quotes like 'search "" file.txt', push empty string
          const nextCharIdx = i + 1;
          const nextIsSpaceOrEnd = nextCharIdx >= input.length || /\s/.test(input[nextCharIdx]);

          if (nextIsSpaceOrEnd) {
            result.push('');
          }
        }

        quoteChar = '';
        isIsolatedQuote = false;
      }
    } else if (!inQuotes && /\s/.test(char)) {
      // Whitespace outside quotes - end current argument
      if (current.length > 0) {
        result.push(current);
        current = '';
      }
    } else {
      // Regular character
      current += char;
    }

    i++;
  }

  // Add final argument if any content or if we're still in quotes
  if (current.length > 0 || inQuotes) {
    result.push(current);
  }

  // Handle empty result
  if (result.length === 0) {
    return { command: '', args: [] };
  }

  const [command, ...args] = result;
  return { command, args };
}

/**
 * Find a command in the registry, with fuzzy matching for typos
 */
function findCommand(commandName: string): SlashCommand | undefined {
  // First try exact match
  const exact = SLASH_COMMANDS.find(cmd => cmd.name === commandName);
  if (exact) return exact;

  // Try aliases
  const byAlias = SLASH_COMMANDS.find(cmd =>
    false
  );
  if (byAlias) return byAlias;

  return undefined;
}

/**
 * Suggest similar commands for typos
 */
function suggestSimilarCommands(commandName: string): string[] {
  const suggestions: string[] = [];

  // Simple Levenshtein distance check
  for (const cmd of SLASH_COMMANDS) {
    if (cmd.name.includes(commandName) || commandName.includes(cmd.name)) {
      suggestions.push(cmd.name);
    } else if (Math.abs(cmd.name.length - commandName.length) <= 2) {
      // Check if it's a likely typo (1-2 character difference)
      let differences = 0;
      const shorter = cmd.name.length < commandName.length ? cmd.name : commandName;
      const longer = cmd.name.length >= commandName.length ? cmd.name : commandName;

      for (let i = 0; i < shorter.length; i++) {
        if (shorter[i] !== longer[i]) differences++;
      }

      if (differences <= 2) {
        suggestions.push(cmd.name);
      }
    }
  }

  return suggestions.slice(0, 3); // Return top 3 suggestions
}

/**
 * Process a slash command
 * Returns a result indicating if the command was handled
 */
export async function processSlashCommand(
  input: string,
  session: Session,
  provider?: any
): Promise<CommandResult> {
  // Parse the command
  const parsed = parseCommand(input);

  // Not a slash command
  if (!parsed) {
    return { handled: false };
  }

  // Find the command in registry
  const command = findCommand(parsed.command);

  if (!command) {
    // Command not found - provide helpful error
    const suggestions = suggestSimilarCommands(parsed.command);
    let errorMessage = `Unknown command: /${parsed.command}`;

    if (suggestions.length > 0) {
      errorMessage += `\nDid you mean: ${suggestions.map(s => `/${s}`).join(", ")}?`;
    }

    errorMessage += `\nType /help for a list of available commands.`;

    return {
      handled: true,
      command: parsed.command,
      args: parsed.args,
      error: errorMessage,
      output: pc.red(errorMessage)
    };
  }

  // Execute the command
  try {
    // Check if command requires arguments
    if (command.requiresArgs && parsed.args.length === 0) {
      const desc = command.description || command.summary || "";
      const usageMessage = `Usage: /${command.name} ${command.usage || "<args>"}${desc ? `\n${desc}` : ""}`;
      return {
        handled: true,
        command: parsed.command,
        args: parsed.args,
        output: pc.yellow(usageMessage)
      };
    }

    // Execute the command handler
    if (command.execute) {
      const result = await command.execute(parsed.args, session, provider);
      return {
        handled: true,
        command: parsed.command,
        args: parsed.args,
        output: result.output,
        error: result.error,
        requiresConfirmation: undefined
      };
    } else {
      // Command exists but no handler implemented yet
      const desc = command.description || command.summary || "";
      const output = `Command /${command.name} is recognized but not yet implemented.${desc ? `\n${desc}` : ""}`;
      return {
        handled: true,
        command: parsed.command,
        args: parsed.args,
        output: pc.yellow(output)
      };
    }
  } catch (error) {
    // Error executing command
    const errorMessage = `Error executing /${parsed.command}: ${error instanceof Error ? error.message : String(error)}`;
    return {
      handled: true,
      command: parsed.command,
      args: parsed.args,
      error: errorMessage,
      output: pc.red(errorMessage)
    };
  }
}

/**
 * Get list of all available commands for help display
 */
export function getAvailableCommands(): string {
  const categories: Record<string, SlashCommand[]> = {};

  // Group commands by category
  for (const cmd of SLASH_COMMANDS) {
    const category = cmd.category || "Other";
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(cmd);
  }

  // Build help text
  let helpText = pc.bold("Available Commands:\n\n");

  for (const [category, commands] of Object.entries(categories)) {
    helpText += pc.cyan(`${category}:\n`);

    for (const cmd of commands.sort((a, b) => a.name.localeCompare(b.name))) {
      const aliases = "";
      const desc = cmd.description || cmd.summary || "No description available";
      helpText += `  ${pc.green(`/${cmd.name}`)}${aliases} - ${desc}\n`;

      if (cmd.usage) {
        helpText += pc.dim(`    Usage: /${cmd.name} ${cmd.usage}\n`);
      }
    }

    helpText += "\n";
  }

  return helpText;
}