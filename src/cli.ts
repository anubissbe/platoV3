#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import prompts from "prompts";
import pc from "picocolors";
import { loadConfig } from "./config/index.js";
import { Session } from "./core/session.js";
import { CopilotProvider } from "./core/provider/copilot.js";
import { runTui } from "./tui/app.js";
import { processSlashCommand } from "./commands/router.js";

// Enhanced terminal capability detection
function isTerminalCapable(): boolean {
  return (
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    process.stdin.setRawMode !== undefined
  );
}

function getTerminalEnvironment() {
  const isWSL =
    process.env.WSL_DISTRO_NAME !== undefined ||
    process.env.WSLENV !== undefined ||
    (process.platform === "linux" && process.env.PATH?.includes("/mnt/c"));
  const isDocker =
    process.env.container !== undefined ||
    process.env.DOCKER_CONTAINER !== undefined;
  const isCI = process.env.CI !== undefined;

  return { isWSL, isDocker, isCI };
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("plato")
    .usage("$0 [options] [prompt]")
    .option("print", {
      alias: "p",
      type: "boolean",
      describe: "Print response and exit",
      default: false,
    })
    .option("cli", {
      type: "boolean",
      describe: "Use basic CLI prompts instead of rich TUI interface",
      default: false,
    })
    .option("model", {
      type: "string",
      describe: "Model id (GitHub Models)",
      default: undefined,
    })
    .option("output-format", {
      choices: ["text", "json"] as const,
      default: "text" as const,
      describe: "Output format for --print",
    })
    .help()
    .parse();

  const cfg = loadConfig();
  if (!cfg.githubToken) {
    console.error(
      pc.red(
        "Missing GITHUB_TOKEN. Set it in your environment (requires Copilot subscription).",
      ),
    );
    process.exit(1);
  }

  const provider = new CopilotProvider({
    endpoint: cfg.endpoint,
    token: cfg.githubToken,
  });
  const session = new Session(
    "You are a helpful coding assistant. Be concise and accurate.",
  );

  const promptArg = (argv._[0] as string) || "";

  // Default to TUI unless --cli flag is used or terminal capabilities are limited
  if (!argv.cli && !argv.print && !promptArg) {
    const env = getTerminalEnvironment();
    const forceTUI = process.env.PLATO_FORCE_TUI === "true";

    if (isTerminalCapable() || forceTUI) {
      try {
        // Reduce flicker in TUI by quieting animations/logging
        process.env.PLATO_TUI = "1";
        const env = getTerminalEnvironment();
        const isWindowsTerminal =
          !!process.env.WT_SESSION || process.platform === "win32" || env.isWSL;
        if (isWindowsTerminal) {
          // Enable static mode across Windows Terminal profiles
          process.env.PLATO_STATIC_TUI = process.env.PLATO_STATIC_TUI || "1";
        }
        if (process.env.PLATO_STATIC_TUI === "1") {
          process.env.PLATO_QUIET_TUI = "1";
        } else {
          process.env.PLATO_QUIET_TUI = process.env.PLATO_QUIET_TUI || "1";
        }
        await runTui();
        return;
      } catch (error) {
        console.error(
          pc.yellow("⚠️  TUI failed to launch, falling back to basic CLI"),
        );
        console.error(
          pc.dim(
            `Error: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        console.error(
          pc.dim("Use --cli flag to skip TUI and go directly to basic CLI\n"),
        );
        // Fall through to basic CLI
      }
    } else {
      // Provide environment-specific guidance when terminal capabilities are limited
      console.error(
        pc.yellow("⚠️  TUI unavailable - terminal capabilities limited"),
      );
      if (env.isWSL) {
        console.error(
          pc.dim("🐧 WSL detected: Try Windows Terminal or use --cli flag"),
        );
      } else if (env.isDocker) {
        console.error(
          pc.dim(
            "🐳 Docker detected: Ensure container runs with -it flags or use --cli",
          ),
        );
      } else if (env.isCI) {
        console.error(
          pc.dim("🔧 CI detected: Use --print flag for non-interactive usage"),
        );
      }
      console.error(pc.dim("Using basic CLI interface...\n"));
      // Fall through to basic CLI
    }
  }

  if (argv.print || promptArg) {
    const prompt = promptArg || (await askOnce());
    session.user(prompt);
    const text = await provider.chat(session.getMessages(), {
      model: argv.model || cfg.defaultModel,
    });
    if (argv["output-format"] === "json") {
      process.stdout.write(JSON.stringify({ content: text }) + "\n");
    } else {
      process.stdout.write(text + "\n");
    }
    return;
  }

  console.log(pc.dim("Plato (Copilot) interactive mode. Ctrl+C to exit."));

  // REPL loop
  while (true) {
    const input = await askOnce();
    if (!input.trim()) continue;

    // Check if this is a slash command
    const commandResult = await processSlashCommand(input, session, provider);

    if (commandResult.handled) {
      // Command was processed, display result
      if (commandResult.output) {
        console.log(commandResult.output);
      }
      continue; // Skip AI processing
    }

    // Not a command, send to AI
    session.user(input);
    const spinner = startSpinner("Thinking");
    try {
      const reply = await provider.chat(session.getMessages(), {
        model: argv.model || cfg.defaultModel,
      });
      stopSpinner(spinner);
      session.assistant(reply);
      console.log(pc.cyan("Assistant:"));
      console.log(reply);
    } catch (e: any) {
      stopSpinner(spinner);
      console.error(pc.red(e?.message || String(e)));
    }
  }
}

async function askOnce(): Promise<string> {
  // Check if we're in a limited terminal environment (WSL, Docker, etc.)
  const env = getTerminalEnvironment();
  const isLimitedTerminal =
    env.isWSL ||
    env.isDocker ||
    env.isCI ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY;

  if (isLimitedTerminal) {
    // Use simple readline for limited environments to avoid flickering
    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(pc.green("You: "), (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  } else {
    // Use advanced prompts for full terminal environments
    const res = await prompts({
      type: "text",
      name: "value",
      message: pc.green("You:"),
    });
    return res.value ?? "";
  }
}

function startSpinner(label: string) {
  // Check if we're in a limited terminal environment
  const env = getTerminalEnvironment();
  const isLimitedTerminal =
    env.isWSL ||
    env.isDocker ||
    env.isCI ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY;

  if (isLimitedTerminal) {
    // Simple static spinner for limited terminals
    process.stdout.write(pc.dim(`${label}..`));
    return null; // No interval for limited terminals
  } else {
    // Animated spinner for full terminals
    const interval = setInterval(() => {
      process.stdout.write(pc.dim("."));
    }, 300);
    process.stdout.write(pc.dim(`${label}`));
    return interval;
  }
}

function stopSpinner(interval: NodeJS.Timeout | null) {
  if (interval) {
    clearInterval(interval);
  }
  process.stdout.write("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
