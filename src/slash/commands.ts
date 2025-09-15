export interface SlashCommand {
  name: string;
  description?: string;  // Made optional for backward compatibility
  summary?: string;
  category?: string;
  aliases?: string[];
  usage?: string;
  requiresArgs?: boolean;
  execute?: (args: string[], session: any, provider?: any) => Promise<{
    output?: string;
    error?: string;
    requiresConfirmation?: boolean;
  }>;
}

// Export both for backward compatibility
export const SLASH_COMMANDS: SlashCommand[] = [

  {
    name: "help",
    description: "Show help and list all commands",
    summary: "Show help and list all commands",
    category: "System",
    execute: async () => {
      const { getAvailableCommands } = await import("../commands/router.js");
      return { output: getAvailableCommands() };
    }
  },
  {
    name: "status",
    description: "Show Plato status",
    summary: "Show Plato status",
    category: "System"
  },
  {
    name: "statusline",
    description: "Configure the statusline display",
    summary: "Configure the statusline display",
    category: "UI"
  },
  {
    name: "init",
    description: "Initialize a PLATO.md file with codebase documentation",
    summary: "Initialize a PLATO.md file with codebase documentation",
    category: "Project"
  },
  {
    name: "agents",
    description: "Manage agent configurations",
    summary: "Manage agent configurations",
    category: "Configuration"
  },
  {
    name: "permissions",
    description: "Manage allow/deny tool permission rules",
    summary: "Manage allow/deny tool permission rules",
    category: "Security"
  },
  {
    name: "model",
    description: "List models and switch active model",
    summary: "List models and switch active model",
    category: "AI",
    usage: "[model-id]"
  },
  {
    name: "mouse",
    description: "Toggle mouse mode (enabled by default for copy/paste)",
    summary: "Toggle mouse mode (enabled by default for copy/paste)",
    category: "UI"
  },
  {
    name: "paste",
    description: "Temporarily disable input for easy copy/paste (default 5s)",
    summary: "Temporarily disable input for easy copy/paste (default 5s)",
    category: "UI"
  },
  {
    name: "context",
    description: "Manage context and visualize token usage",
    summary: "Manage context and visualize token usage",
    category: "Session"
  },
  {
    name: "add-dir",
    description: "Add a new working directory to context",
    summary: "Add a new working directory to context",
    category: "Project"
  },
  {
    name: "bashes",
    description: "List and manage shell sessions",
    summary: "List and manage shell sessions",
    category: "Project"
  },
  {
    name: "memory",
    description: "View, edit, or reset memory",
    summary: "View, edit, or reset memory",
    category: "Session"
  },
  {
    name: "output-style",
    description: "Set or switch output style",
    summary: "Set or switch output style",
    category: "UI"
  },
  {
    name: "output-style:new",
    description: "Create a custom output style",
    summary: "Create a custom output style",
    category: "General"
  },
  {
    name: "cost",
    description: "Show tokens, cost, and duration",
    summary: "Show tokens, cost, and duration",
    category: "Metrics"
  },
  {
    name: "analytics",
    description: "View and manage cost tracking analytics",
    summary: "View and manage cost tracking analytics",
    category: "Metrics"
  },
  {
    name: "doctor",
    description: "Diagnose setup and connectivity",
    summary: "Diagnose setup and connectivity",
    category: "System"
  },
  {
    name: "compact",
    description: "Compact conversation history with optional focus instructions",
    summary: "Compact conversation history with optional focus instructions",
    category: "Session"
  },
  {
    name: "export",
    description: "Export conversation to file or clipboard",
    summary: "Export conversation to file or clipboard",
    category: "Session"
  },
  {
    name: "mcp",
    description: "Manage MCP servers",
    summary: "Manage MCP servers",
    category: "Integration"
  },
  {
    name: "login",
    description: "Authenticate with a provider",
    summary: "Authenticate with a provider",
    category: "Security"
  },
  {
    name: "logout",
    description: "Logout and clear credentials",
    summary: "Logout and clear credentials",
    category: "Security"
  },
  {
    name: "hooks",
    description: "Manage hook configurations",
    summary: "Manage hook configurations",
    category: "Integration"
  },
  {
    name: "security-review",
    description: "Review pending changes for safety",
    summary: "Review pending changes for safety",
    category: "Security"
  },
  {
    name: "todos",
    description: "Generate and list TODO items",
    summary: "Generate and list TODO items",
    category: "Project"
  },
  {
    name: "vim",
    description: "Toggle Vim editing mode",
    summary: "Toggle Vim editing mode",
    category: "UI"
  },
  {
    name: "proxy",
    description: "Start an OpenAI-compatible HTTP proxy",
    summary: "Start an OpenAI-compatible HTTP proxy",
    category: "Integration"
  },
  {
    name: "upgrade",
    description: "Upgrade to higher provider plan",
    summary: "Upgrade to higher provider plan",
    category: "Utility"
  },
  {
    name: "resume",
    description: "Resume a paused conversation",
    summary: "Resume a paused conversation",
    category: "Session"
  },
  {
    name: "privacy-settings",
    description: "View and update privacy settings",
    summary: "View and update privacy settings",
    category: "Security"
  },
  {
    name: "release-notes",
    description: "Show Plato release notes",
    summary: "Show Plato release notes",
    category: "Utility"
  },
  {
    name: "keydebug",
    description: "Capture next key raw bytes (debug)",
    summary: "Capture next key raw bytes (debug)",
    category: "UI"
  },
  {
    name: "apply-mode",
    description: "Auto-apply patches: [auto|off]",
    summary: "Auto-apply patches: [auto|off]",
    category: "Utility"
  },
  {
    name: "ide",
    description: "Connect to IDE for file awareness and linter warnings",
    summary: "Connect to IDE for file awareness and linter warnings",
    category: "Integration"
  },
  {
    name: "install-gitlab-app",
    description: "Configure GitLab integrations for automatic MR reviews",
    summary: "Configure GitLab integrations for automatic MR reviews",
    category: "Integration"
  },
  {
    name: "terminal-setup",
    description: "Fix terminal configuration (Shift+Enter, key bindings)",
    summary: "Fix terminal configuration (Shift+Enter, key bindings)",
    category: "Utility"
  },
  {
    name: "bug",
    description: "Report bug - opens Plato GitLab issues page",
    summary: "Report bug - opens Plato GitLab issues page",
    category: "Utility"
  },
];

export const SLASH_MAP = new Map(
  SLASH_COMMANDS.map((c) => [c.name, c] as const),
);


// Export for router
export const slashCommands = SLASH_COMMANDS;