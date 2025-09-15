#!/usr/bin/env bash
set -euo pipefail

MCP_URL=${MCP_URL:-"http://127.0.0.1:8720"}
WAIT_SECS=${WAIT_SECS:-2}

# Build command list dynamically from src/slash/commands.ts; fallback to a core set
if cmds_json=$(node -e "const fs=require('fs');const s=fs.readFileSync('src/slash/commands.ts','utf8');const a=[...s.matchAll(/name:\s*'([^']+)'/g)].map(m=>m[1]);console.log(JSON.stringify(a))" 2>/dev/null); then
  mapfile -t cmds < <(node -e "const a=${cmds_json};a.forEach(c=>console.log(c))")
else
  cmds=("/help" "/status" "/apply-mode" "/statusline" "/output-style" "/mcp" "/permissions" "/memory")
fi

say() { printf "[parity] %s\n" "$*"; }

need_curl() { command -v curl >/dev/null 2>&1 || { echo "curl required"; exit 1; }; }
need_tmux() { command -v tmux >/dev/null 2>&1 || { echo "tmux required"; exit 1; }; }

ensure_mcp() {
  if curl -fsS -o /dev/null -X HEAD "$MCP_URL/"; then
    say "MCP server detected at $MCP_URL"
    return 0
  fi
  say "Starting local MCP server on ${MCP_URL#http://}"...
  MCP_PORT=$(echo "$MCP_URL" | sed -E 's#.*/:([0-9]+)$#\1#;t; s#.*:(.*)$#\1#')
  MCP_PORT=${MCP_PORT:-8720}
  MCP_HOST=$(echo "$MCP_URL" | sed -E 's#http://([^:/]+).*#\1#')
  MCP_HOST=${MCP_HOST:-127.0.0.1}
  MCP_HOST=$MCP_HOST MCP_PORT=$MCP_PORT node scripts/mcp-tui-server.mjs >/tmp/mcp-tui-server.log 2>&1 &
  MCP_PID=$!
  sleep 1
  if ! curl -fsS -o /dev/null -X HEAD "$MCP_URL/"; then
    echo "Failed to start MCP server (see /tmp/mcp-tui-server.log)" >&2
    exit 1
  fi
  trap 'kill $MCP_PID >/dev/null 2>&1 || true' EXIT
}

tool_post() {
  local tool="$1" json="$2"
  curl -fsS "$MCP_URL/tools/$tool" \
    -H 'content-type: application/json' \
    --data-binary "{\"input\":$json}"
}

# Accept trust modal and wait until it disappears
accept_and_wait() {
  local session="$1" pref="$2" max_tries="${3:-8}" delay="${4:-0.4}"
  local i=0
  while (( i < max_tries )); do
    i=$((i+1))
    # compute integer milliseconds from floating delay (e.g., 0.4 -> 400)
    local delay_ms
    delay_ms=$(awk -v d="$delay" 'BEGIN{printf("%d", d*1000)}')
    tool_post accept_trust "{\"session\":\"$session\",\"retries\":2,\"delayMs\":$delay_ms,\"preference\":\"$pref\"}" >/dev/null || true
    # capture raw JSON and check for modal markers
    local raw
    raw=$(tool_post tmux_capture "{\"session\":\"$session\",\"lines\":200}" || true)
    if ! echo "$raw" | grep -q "Do you trust the files in this folder?" && ! echo "$raw" | grep -q "Enter to confirm · Esc to exit"; then
      return 0
    fi
    sleep "$delay"
  done
  return 0
}

main() {
  need_curl; need_tmux; ensure_mcp
  OUTDIR=$(mktemp -d "parity-XXXXXX")
  WORKDIR="${WORKDIR:-$PWD/.plato/parity-work}"
  mkdir -p "$WORKDIR" "$OUTDIR/plato" "$OUTDIR/claude" "$OUTDIR/diff"
  # Initialize a README marker in the stable workspace for clarity
  if [ ! -f "$WORKDIR/.parity-readme" ]; then
    printf "Stable workspace for TUI parity runs.\n" > "$WORKDIR/.parity-readme"
  fi
  say "Artifacts: $OUTDIR"

  idx=0
  for c in "${cmds[@]}"; do
    idx=$((idx+1))
    say "Testing command: $c"
    # Start persistent sessions via tmux so we can accept trust prompts
    sid_p="pl-$idx"; sid_c="cl-$idx"
    tool_post start_plato_tmux  "{\"session\":\"$sid_p\",\"cwd\":\"$WORKDIR\"}" >/dev/null
    tool_post start_claude_tmux "{\"session\":\"$sid_c\",\"cwd\":\"$WORKDIR\"}" >/dev/null
    sleep 0.5
    # Accept trust prompts with server-side detection and polling
    accept_and_wait "$sid_p" plato 8 0.4
    accept_and_wait "$sid_c" claude 8 0.4
    # Send the command
    tool_post tmux_send "{\"session\":\"$sid_p\",\"keys\":\"$c\"}" >/dev/null || true
    tool_post tmux_send "{\"session\":\"$sid_c\",\"keys\":\"$c\"}" >/dev/null || true
    sleep "$WAIT_SECS"
    tool_post tmux_capture "{\"session\":\"$sid_p\",\"lines\":400}" | sed 's/.*\"output\":\"//; s/\"}.*/\n/' | sed 's/\\n/\n/g; s/\\t/\t/g' > "$OUTDIR/plato/$idx.txt" || true
    tool_post tmux_capture "{\"session\":\"$sid_c\",\"lines\":400}" | sed 's/.*\"output\":\"//; s/\"}.*/\n/' | sed 's/\\n/\n/g; s/\\t/\t/g' > "$OUTDIR/claude/$idx.txt" || true
    tmux kill-session -t "$sid_p" >/dev/null 2>&1 || true
    tmux kill-session -t "$sid_c" >/dev/null 2>&1 || true
    # normalize noisy fields
    for f in "$OUTDIR/plato/$idx.txt" "$OUTDIR/claude/$idx.txt"; do
      sed -i -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}[^ ]*/<DATE>/g; s/[0-9]+(\.[0-9]+)?ms/<LATENCY>/g; s/[A-Fa-f0-9]{6,}/<HEX>/g' "$f" || true
    done
    # diff
    diff -u "$OUTDIR/claude/$idx.txt" "$OUTDIR/plato/$idx.txt" > "$OUTDIR/diff/$idx.diff" || true
  done

  # Also test plain usage message flow (say hello)
  say "Testing usage: hello"
  sid_p="pl-hello"; sid_c="cl-hello"
  tool_post start_plato_tmux  "{\"session\":\"$sid_p\",\"cwd\":\"$WORKDIR\"}" >/dev/null
  tool_post start_claude_tmux "{\"session\":\"$sid_c\",\"cwd\":\"$WORKDIR\"}" >/dev/null
  sleep 0.5
  # trust accept again for the hello run, in case
  accept_and_wait "$sid_p" plato 8 0.4
  accept_and_wait "$sid_c" claude 8 0.4
  tool_post tmux_send "{\"session\":\"$sid_p\",\"keys\":\"hello\",\"enter\":true}" >/dev/null || true
  tool_post tmux_send "{\"session\":\"$sid_c\",\"keys\":\"hello\",\"enter\":true}" >/dev/null || true
  sleep "$WAIT_SECS"
  tool_post tmux_capture "{\"session\":\"$sid_p\",\"lines\":400}" | sed 's/.*\"output\":\"//; s/\"}.*/\n/' | sed 's/\\n/\n/g; s/\\t/\t/g' > "$OUTDIR/plato/hello.txt" || true
  tool_post tmux_capture "{\"session\":\"$sid_c\",\"lines\":400}" | sed 's/.*\"output\":\"//; s/\"}.*/\n/' | sed 's/\\n/\n/g; s/\\t/\t/g' > "$OUTDIR/claude/hello.txt" || true
  sed -i -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}[^ ]*/<DATE>/g; s/[0-9]+(\.[0-9]+)?ms/<LATENCY>/g; s/[A-Fa-f0-9]{6,}/<HEX>/g' "$OUTDIR/plato/hello.txt" "$OUTDIR/claude/hello.txt" || true
  diff -u "$OUTDIR/claude/hello.txt" "$OUTDIR/plato/hello.txt" > "$OUTDIR/diff/hello.diff" || true

  say "Summary:"
  i=0
  for c in "${cmds[@]}"; do
    i=$((i+1))
    if [[ -s "$OUTDIR/diff/$i.diff" ]]; then
      echo "  [$i] $c — DIFF (see $OUTDIR/diff/$i.diff)"
    else
      echo "  [$i] $c — OK (no diff)"
    fi
  done
}

main "$@"
