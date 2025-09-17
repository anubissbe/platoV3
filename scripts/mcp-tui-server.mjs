#!/usr/bin/env node
// Minimal MCP-compatible HTTP server exposing tools to run Plato and Claude TUIs via a PTY
// Endpoints used by src/integrations/mcp.ts:
//  - HEAD /                                  -> 200 OK (health)
//  - GET  /tools or /.well-known/mcp/tools  -> [{ id,name,description,input_schema }]
//  - POST /tools/:tool or /.well-known/mcp/tools/:tool with { input } JSON

import http from "http";
import url from "url";
import os from "os";
import process from "process";
import path from "path";
import pty from "node-pty";
import { exec as execCb } from "node:child_process";

const PORT = process.env.MCP_PORT ? Number(process.env.MCP_PORT) : 8719;
const HOST = process.env.MCP_HOST || "127.0.0.1";
const CWD = process.cwd();
const ENTRY_PLATO = path.resolve(CWD, "dist/cli.js");

const tools = {
  shell_exec: {
    name: "shell_exec",
    description: "Execute a whitelisted shell command",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["command"],
    },
    handler: async ({ command, cwd = CWD }) => {
      const allowed = [
        "git",
        "node",
        "npm",
        "pnpm",
        "tsx",
        "jest",
        "cat",
        "ls",
        "pwd",
        "echo",
        "./bin/plato",
        "pnpm test",
        "pnpm build",
        "claude",
      ];
      const ok = allowed.some(
        (a) => command === a || command.startsWith(a + " "),
      );
      if (!ok) throw new Error(`Command not allowed: ${command}`);
      const result = await runPtyOnce(command, { cwd, timeout: 10 });
      return result;
    },
  },
  run_plato_pty: {
    name: "run_plato_pty",
    description: "Run Plato TUI and optionally send one line of input",
    input_schema: {
      type: "object",
      properties: {
        input: { type: "string" },
        timeout: { type: "number" },
        cwd: { type: "string" },
      },
    },
    handler: async ({ input = "", timeout = 10, cwd = CWD }) => {
      const cmd = "node";
      const args = [ENTRY_PLATO];
      const env = {
        ...process.env,
        TERM: "xterm-256color",
        PLATO_FORCE_TUI: "true",
        PLATO_STATIC_TUI: "1",
        PLATO_QUIET_TUI: "1",
        PLATO_PARITY_MODE: "1",
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || "test-token",
      };
      return runPtyProgram(cmd, args, { cwd, env, input, timeout });
    },
  },
  run_claude_pty: {
    name: "run_claude_pty",
    description: "Run Claude Code TUI and optionally send one line of input",
    input_schema: {
      type: "object",
      properties: {
        input: { type: "string" },
        timeout: { type: "number" },
        cwd: { type: "string" },
      },
    },
    handler: async ({ input = "", timeout = 10, cwd = CWD }) => {
      // Prefer installed claude, otherwise use npx (may download on first run)
      const useNpx = process.env.USE_NPX_CLAUDE === "1";
      const cmd = useNpx ? "npx" : "claude";
      const args = useNpx ? ["-y", "@anthropic-ai/claude-code"] : [];
      const env = { ...process.env, TERM: "xterm-256color" };
      return runPtyProgram(cmd, args, { cwd, env, input, timeout });
    },
  },
  start_plato_tmux: {
    name: "start_plato_tmux",
    description: "Start a persistent Plato TUI in a tmux session",
    input_schema: {
      type: "object",
      properties: {
        session: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["session"],
    },
    handler: async ({ session, cwd = CWD }) => {
      await tmuxStart(session, `node ${ENTRY_PLATO}`, {
        cwd,
        env: {
          PLATO_FORCE_TUI: "true",
          PLATO_STATIC_TUI: "1",
          PLATO_QUIET_TUI: "1",
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || "test-token",
        },
      });
      return { ok: true, session };
    },
  },
  start_claude_tmux: {
    name: "start_claude_tmux",
    description: "Start a persistent Claude Code TUI in a tmux session",
    input_schema: {
      type: "object",
      properties: {
        session: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["session"],
    },
    handler: async ({ session, cwd = CWD }) => {
      await tmuxStart(session, `claude`, { cwd });
      return { ok: true, session };
    },
  },
  tmux_send: {
    name: "tmux_send",
    description: "Send keys to a tmux session (adds Enter by default)",
    input_schema: {
      type: "object",
      properties: {
        session: { type: "string" },
        keys: { type: "string" },
        enter: { type: "boolean" },
      },
      required: ["session", "keys"],
    },
    handler: async ({ session, keys, enter = true }) => {
      await tmuxSend(session, keys, enter);
      return { ok: true };
    },
  },
  tmux_capture: {
    name: "tmux_capture",
    description: "Capture recent output from a tmux session",
    input_schema: {
      type: "object",
      properties: {
        session: { type: "string" },
        lines: { type: "number" },
      },
      required: ["session"],
    },
    handler: async ({ session, lines = 200 }) => {
      const output = await tmuxCapture(session, lines);
      return { output };
    },
  },
  accept_trust: {
    name: "accept_trust",
    description: "Detect and accept workspace trust prompt in a tmux session",
    input_schema: {
      type: "object",
      properties: {
        session: { type: "string" },
        retries: { type: "number" },
        delayMs: { type: "number" },
        preference: { type: "string" }, // 'claude' | 'plato' | undefined
      },
      required: ["session"],
    },
    handler: async ({ session, retries = 6, delayMs = 400, preference }) => {
      let attempts = 0;
      let accepted = false;
      let last = "";
      while (attempts < retries) {
        attempts++;
        last = await tmuxCapture(session, 400);
        const hasTrust =
          /Do you trust the files in this folder\?/i.test(last) ||
          /Enter to confirm · Esc to exit/i.test(last);
        if (!hasTrust) break;
        // Decide sequence: Claude often needs '1' + Enter; Plato typically Enter
        const useClaudeFlow =
          preference === "claude" ||
          /Claude Code may read, write, or execute files/i.test(last);
        if (useClaudeFlow) {
          await tmuxSend(session, "1", true);
          await sleep(delayMs);
          await tmuxSend(session, "", true);
        } else {
          await tmuxSend(session, "", true);
        }
        await sleep(delayMs);
        // Re-check
        last = await tmuxCapture(session, 400);
        const stillThere =
          /Do you trust the files in this folder\?/i.test(last) ||
          /Enter to confirm · Esc to exit/i.test(last);
        if (!stillThere) {
          accepted = true;
          break;
        }
      }
      return { accepted, attempts, snippet: last.slice(-800) };
    },
  },
};

function listTools() {
  return Object.values(tools).map((t) => ({
    id: t.name,
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

function runPtyOnce(command, { cwd = CWD, timeout = 10 }) {
  const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
  const args =
    os.platform() === "win32"
      ? ["-NoLogo", "-NoProfile", "-Command", command]
      : ["-lc", command];
  return runPtyProgram(shell, args, { cwd, input: "", timeout });
}

function runPtyProgram(
  file,
  args = [],
  { cwd = CWD, env = process.env, input = "", timeout = 10 },
) {
  return new Promise((resolve) => {
    const p = pty.spawn(file, args, { cols: 120, rows: 30, cwd, env });
    let out = "";
    const maxLen = 200_000; // 200 KB cap
    const timer = setTimeout(() => {
      try {
        p.kill();
      } catch {}
      resolve({ output: out, timedOut: true });
    }, timeout * 1000);
    p.onData((d) => {
      out += d;
      if (out.length > maxLen) out = out.slice(out.length - maxLen);
    });
    p.onExit(() => {
      clearTimeout(timer);
      resolve({ output: out, timedOut: false });
    });
    if (input)
      setTimeout(() => {
        p.write(input);
      }, 750);
  });
}

async function tmuxStart(session, command, { cwd = CWD, env = {} } = {}) {
  // Check if session exists
  const exists = await execSafe(`tmux has-session -t ${session}`)
    .then(() => true)
    .catch(() => false);
  if (exists) return;
  const envPairs = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const cmd = `cd ${shellEscape(cwd)} && ${envPairs} ${command}`.trim();
  await execSafe(
    `tmux new-session -d -s ${session} '${cmd.replace(/'/g, "'\\''")}'`,
  );
}

async function tmuxSend(session, keys, enter = true) {
  const k = keys.replace(/'/g, "'\\''");
  await execSafe(`tmux send-keys -t ${session} '${k}' ${enter ? "Enter" : ""}`);
}

async function tmuxCapture(session, lines = 200) {
  const { stdout } = await execSafe(
    `tmux capture-pane -t ${session} -p -S -${Math.max(10, lines)}`,
  );
  return stdout;
}

function execSafe(cmd) {
  return new Promise((resolve, reject) => {
    execCb(cmd, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function shellEscape(s) {
  return s.replace(/'/g, "'\\''");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url || "/");
  if (req.method === "HEAD" && pathname === "/") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (
    req.method === "GET" &&
    (pathname === "/tools" || pathname === "/.well-known/mcp/tools")
  ) {
    return sendJSON(res, 200, listTools());
  }

  const m = pathname?.match(/^\/(?:\.well-known\/mcp\/)?tools\/([^/]+)$/);
  if (req.method === "POST" && m) {
    const toolName = decodeURIComponent(m[1]);
    const tool = tools[toolName];
    if (!tool)
      return sendJSON(res, 404, { error: `No such tool: ${toolName}` });
    try {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        let input = {};
        try {
          input =
            JSON.parse(Buffer.concat(chunks).toString() || "{}").input || {};
        } catch {}
        const result = await tool.handler(input);
        sendJSON(res, 200, result);
      });
    } catch (e) {
      return sendJSON(res, 500, { error: String(e?.message || e) });
    }
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, HOST, () => {
  console.log(`MCP TUI server listening on http://${HOST}:${PORT}`);
  console.log(`Tools: ${Object.keys(tools).join(", ")}`);
});
