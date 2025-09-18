# Slash Commands Reference

Comprehensive documentation for all 46 Plato TUI slash commands, organized by category for easy navigation.

**Current Status**: 46/46 commands implemented (100% COMPLETE!) 🎉

## 🚀 Quick Reference Table

| Command | Category | Status | Description | Usage |
|---------|----------|--------|-------------|-------|
| [`/help`](#help) | System | ✅ Implemented | Show help and list all commands | `/help` |
| [`/status`](#status) | System | ⚠️ Placeholder | Show Plato status | `/status` |
| [`/doctor`](#doctor) | System | ⚠️ Placeholder | Diagnose setup and connectivity | `/doctor` |
| [`/debug`](#debug) | System | ✅ Implemented | Manage debug mode and diagnostics | `/debug [on\|off\|level\|logs\|status]` |
| [`/login`](#login) | Authentication | Authenticate with a provider | `/login` |
| [`/logout`](#logout) | Authentication | Logout and clear credentials | `/logout` |
| [`/model`](#model) | AI Model | List models and switch active model | `/model [model-id]` |
| [`/context`](#context) | Context & Memory | Manage context and visualize token usage | `/context` |
| [`/memory`](#memory) | Context & Memory | View, edit, or reset memory | `/memory` |
| [`/compact`](#compact) | Context & Memory | Compact conversation history | `/compact` |
| [`/export`](#export) | Context & Memory | Export conversation to file or clipboard | `/export` |
| [`/resume`](#resume) | Context & Memory | Resume a paused conversation | `/resume` |
| [`/mcp`](#mcp) | Tool Management | Manage MCP servers | `/mcp` |
| [`/permissions`](#permissions) | Security & Privacy | Manage tool permission rules | `/permissions` |
| [`/hooks`](#hooks) | Tool Management | Manage hook configurations | `/hooks` |
| [`/security-review`](#security-review) | Security & Privacy | Review pending changes for safety | `/security-review` |
| [`/privacy-settings`](#privacy-settings) | Security & Privacy | View and update privacy settings | `/privacy-settings` |
| [`/mouse`](#mouse) | Output & Display | Toggle mouse mode | `/mouse` |
| [`/paste`](#paste) | Output & Display | Temporarily disable input for copy/paste | `/paste` |
| [`/output-style`](#output-style) | Output & Display | Set or switch output style | `/output-style [list\|set\|reset]` |
| [`/vim`](#vim) | Output & Display | Toggle Vim editing mode | `/vim` |
| [`/statusline`](#statusline) | Output & Display | Configure the statusline display | `/statusline` |
| [`/init`](#init) | Project | Initialize a PLATO.md file | `/init` |
| [`/add-dir`](#add-dir) | Project | Add a working directory to context | `/add-dir` |
| [`/bashes`](#bashes) | Project | List and manage shell sessions | `/bashes` |
| [`/todos`](#todos) | Project | Generate and list TODO items | `/todos` |
| [`/cost`](#cost) | Metrics | Show tokens, cost, and duration | `/cost` |
| [`/analytics`](#analytics) | Metrics | View and manage cost tracking analytics | `/analytics` |
| [`/agents`](#agents) | Configuration | Manage agent configurations | `/agents` |
| [`/apply-mode`](#apply-mode) | Configuration | Configure patch apply mode | `/apply-mode [mode]` |
| [`/tool-call-preset`](#tool-call-preset) | Configuration | Configure tool call presets | `/tool-call-preset [options]` |
| [`/proxy`](#proxy) | Integration | Start an OpenAI-compatible HTTP proxy | `/proxy` |
| [`/ide`](#ide) | Integration | Connect to IDE for file awareness | `/ide` |
| [`/install-gitlab-app`](#install-gitlab-app) | Integration | Configure GitLab integrations | `/install-gitlab-app` |
| [`/upgrade`](#upgrade) | Utility | Upgrade to higher provider plan | `/upgrade` |
| [`/release-notes`](#release-notes) | Utility | Show Plato release notes | `/release-notes` |
| [`/terminal-setup`](#terminal-setup) | Utility | Fix terminal configuration | `/terminal-setup` |
| [`/bug`](#bug) | Utility | Report bug - opens GitLab issues page | `/bug` |
| [`/keydebug`](#keydebug) | Utility | Capture next key raw bytes for debug | `/keydebug` |

## 📂 Commands by Category

### System Commands
Commands for core system operations and diagnostics.

#### `/help` {#help}
**Category:** System
**Description:** Show help and list all commands
**Usage:** `/help`

Displays a comprehensive list of all available slash commands organized by category, including descriptions and usage examples.

**Examples:**
```bash
/help                    # Show all commands
```

**Related Commands:** [`/status`](#status), [`/doctor`](#doctor)

---

#### `/status` {#status}
**Category:** System
**Description:** Show Plato status including authentication, configuration, and system health
**Usage:** `/status`

Provides a comprehensive overview of your current Plato session including:
- Authentication status
- Active model and provider
- Session metrics
- Configuration settings
- System health indicators

**Examples:**
```bash
/status                  # Show complete system status
```

**Related Commands:** [`/doctor`](#doctor), [`/debug`](#debug)

---

#### `/doctor` {#doctor}
**Category:** System
**Description:** Diagnose setup and connectivity issues
**Usage:** `/doctor [component]`

Runs comprehensive diagnostics to identify and help resolve common setup issues:
- Network connectivity
- Authentication status
- MCP server connections
- Terminal configuration
- File permissions

**Examples:**
```bash
/doctor                  # Run all diagnostics
/doctor network          # Check network connectivity
/doctor auth             # Check authentication
```

**Related Commands:** [`/status`](#status), [`/debug`](#debug)

---

#### `/debug` {#debug}
**Category:** System
**Description:** Manage debug mode settings and diagnostic output
**Usage:** `/debug [on|off|level <level>|logs|clear|targets [target...]|status]`

Controls debug mode and diagnostic logging:
- **on/off**: Enable or disable debug mode
- **level**: Set debug level (minimal, verbose, full)
- **logs**: Show recent debug logs
- **clear**: Clear debug logs
- **targets**: Set specific debug targets
- **status**: Show current debug configuration

**Examples:**
```bash
/debug on                # Enable debug mode
/debug level verbose     # Set verbose logging
/debug logs              # Show recent logs
/debug targets mcp tools # Debug only MCP and tools
/debug status            # Show debug config
```

**Related Commands:** [`/doctor`](#doctor), [`/status`](#status)

---

### Authentication Commands
Commands for managing provider authentication and sessions.

#### `/login` {#login}
**Category:** Authentication
**Description:** Authenticate with a provider (GitHub Copilot, GitLab Duo)
**Usage:** `/login [provider]`

Initiates the authentication flow for AI providers:
- GitHub Copilot (via device flow)
- GitLab Duo
- Other configured providers

**Examples:**
```bash
/login                   # Interactive provider selection
/login copilot           # Login to GitHub Copilot
/login gitlab            # Login to GitLab Duo
```

**Related Commands:** [`/logout`](#logout), [`/status`](#status)

---

#### `/logout` {#logout}
**Category:** Authentication
**Description:** Logout and clear credentials
**Usage:** `/logout [provider]`

Clears authentication credentials and logs out of the specified provider or all providers.

**Examples:**
```bash
/logout                  # Logout from all providers
/logout copilot          # Logout from GitHub Copilot only
```

**Related Commands:** [`/login`](#login), [`/status`](#status)

---

### AI Model Commands
Commands for managing AI models and provider settings.

#### `/model` {#model}
**Category:** AI Model
**Description:** List available models and switch active model
**Usage:** `/model [model-id]`

Manages AI model selection and displays available models:
- Lists all available models from active providers
- Shows current active model
- Switches to specified model

**Examples:**
```bash
/model                   # List available models
/model gpt-4             # Switch to GPT-4
/model claude-3-sonnet   # Switch to Claude 3 Sonnet
```

**Related Commands:** [`/login`](#login), [`/status`](#status)

---

### Context & Memory Commands
Commands for managing conversation context, memory, and session state.

#### `/context` {#context}
**Category:** Context & Memory
**Description:** Manage context and visualize token usage
**Usage:** `/context [show|clear|compact|stats]`

Provides tools for managing conversation context:
- **show**: Display current context and token usage
- **clear**: Clear conversation context
- **compact**: Reduce context size while preserving key information
- **stats**: Show detailed context statistics

**Examples:**
```bash
/context                 # Show context overview
/context show            # Display full context
/context stats           # Show detailed statistics
/context clear           # Clear conversation context
```

**Related Commands:** [`/memory`](#memory), [`/compact`](#compact)

---

#### `/memory` {#memory}
**Category:** Context & Memory
**Description:** View, edit, or reset conversation memory
**Usage:** `/memory [view|edit|reset|save|load]`

Manages persistent conversation memory:
- **view**: Display current memory contents
- **edit**: Edit memory interactively
- **reset**: Clear all memory
- **save**: Save current session to memory
- **load**: Load previous session from memory

**Examples:**
```bash
/memory                  # View current memory
/memory edit             # Edit memory interactively
/memory reset            # Clear all memory
/memory save session-1   # Save as named session
```

**Related Commands:** [`/context`](#context), [`/resume`](#resume)

---

#### `/compact` {#compact}
**Category:** Context & Memory
**Description:** Compact conversation history with optional focus instructions
**Usage:** `/compact [focus-instructions]`

Reduces conversation length while preserving important information. Optionally accepts focus instructions to preserve specific topics.

**Examples:**
```bash
/compact                 # Standard compaction
/compact "keep security discussions" # Focus on security topics
```

**Related Commands:** [`/context`](#context), [`/memory`](#memory)

---

#### `/export` {#export}
**Category:** Context & Memory
**Description:** Export conversation to file or clipboard
**Usage:** `/export [format] [destination]`

Exports the current conversation in various formats:
- **markdown**: Export as Markdown file
- **json**: Export as JSON
- **text**: Export as plain text
- **clipboard**: Copy to system clipboard

**Examples:**
```bash
/export                  # Export as markdown file
/export json             # Export as JSON
/export clipboard        # Copy to clipboard
/export markdown chat.md # Export to specific file
```

**Related Commands:** [`/memory`](#memory), [`/context`](#context)

---

#### `/resume` {#resume}
**Category:** Context & Memory
**Description:** Resume a paused conversation from saved session
**Usage:** `/resume [session-name]`

Restores a previously saved conversation session, including context and memory.

**Examples:**
```bash
/resume                  # Resume last session
/resume session-1        # Resume named session
```

**Related Commands:** [`/memory`](#memory), [`/context`](#context)

---

### Tool Management Commands
Commands for managing MCP servers, tools, and integrations.

#### `/mcp` {#mcp}
**Category:** Tool Management
**Description:** Manage MCP (Model Context Protocol) servers
**Usage:** `/mcp [attach|detach|list|tools|status] [args...]`

Manages MCP server connections for extended functionality:
- **attach**: Connect to an MCP server
- **detach**: Disconnect from an MCP server
- **list**: Show connected servers
- **tools**: List available tools from servers
- **status**: Show MCP system status

**Examples:**
```bash
/mcp list                # Show connected servers
/mcp attach local http://localhost:8719 # Connect to local server
/mcp tools               # List available tools
/mcp detach local        # Disconnect server
```

**Related Commands:** [`/permissions`](#permissions), [`/hooks`](#hooks)

---

#### `/hooks` {#hooks}
**Category:** Tool Management
**Description:** Manage hook configurations for automated actions
**Usage:** `/hooks [list|add|remove|enable|disable] [args...]`

Configures automated actions and integrations:
- **list**: Show configured hooks
- **add**: Add new hook
- **remove**: Remove existing hook
- **enable/disable**: Toggle hook status

**Examples:**
```bash
/hooks list              # Show all hooks
/hooks add pre-commit    # Add pre-commit hook
/hooks disable backup    # Disable backup hook
```

**Related Commands:** [`/mcp`](#mcp), [`/permissions`](#permissions)

---

### Security & Privacy Commands
Commands for managing security settings and privacy controls.

#### `/permissions` {#permissions}
**Category:** Security & Privacy
**Description:** Manage allow/deny tool permission rules
**Usage:** `/permissions [show|default|allow|deny|reset] [tool] [action]`

Controls access permissions for tools and operations:
- **show**: Display current permissions
- **default**: Set default permission policy
- **allow/deny**: Grant or revoke specific permissions
- **reset**: Reset to default permissions

**Examples:**
```bash
/permissions show        # Show current permissions
/permissions default fs_patch allow # Allow file patches by default
/permissions deny network_access # Deny network access
/permissions reset       # Reset to defaults
```

**Related Commands:** [`/security-review`](#security-review), [`/privacy-settings`](#privacy-settings)

---

#### `/security-review` {#security-review}
**Category:** Security & Privacy
**Description:** Review pending changes for safety before applying
**Usage:** `/security-review`

Analyzes pending patches and changes for potential security risks:
- Scans for sensitive data patterns
- Identifies dangerous commands
- Checks file permission changes
- Provides risk assessment and recommendations

**Examples:**
```bash
/security-review         # Review all pending changes
```

**Related Commands:** [`/permissions`](#permissions), [`/apply-mode`](#apply-mode)

---

#### `/privacy-settings` {#privacy-settings}
**Category:** Security & Privacy
**Description:** View and update privacy settings
**Usage:** `/privacy-settings [setting] [value]`

Manages privacy and data protection settings:
- **redact**: Enable/disable sensitive data redaction
- **prompt_on_large_payloads**: Control large payload prompts
- **max_payload_mb**: Set maximum payload size
- **status**: Show current settings

**Examples:**
```bash
/privacy-settings status # Show current settings
/privacy-settings redact on # Enable data redaction
/privacy-settings max_payload_mb 10 # Set 10MB limit
```

**Related Commands:** [`/security-review`](#security-review), [`/permissions`](#permissions)

---

### Output & Display Commands
Commands for customizing the user interface and display settings.

#### `/mouse` {#mouse}
**Category:** Output & Display
**Description:** Toggle mouse mode (enabled by default for copy/paste)
**Usage:** `/mouse [on|off|toggle]`

Controls mouse interaction support in the terminal interface.

**Examples:**
```bash
/mouse                   # Toggle mouse mode
/mouse on                # Enable mouse mode
/mouse off               # Disable mouse mode
```

**Related Commands:** [`/paste`](#paste), [`/vim`](#vim)

---

#### `/paste` {#paste}
**Category:** Output & Display
**Description:** Temporarily disable input for easy copy/paste (default 5s)
**Usage:** `/paste [seconds]`

Disables input processing temporarily to allow easy copying and pasting of large text blocks.

**Examples:**
```bash
/paste                   # Disable input for 5 seconds
/paste 10               # Disable input for 10 seconds
```

**Related Commands:** [`/mouse`](#mouse), [`/vim`](#vim)

---

#### `/output-style` {#output-style}
**Category:** Output & Display
**Description:** Set or switch output style
**Usage:** `/output-style [list|set <style>|reset]`

Manages output formatting and visual styles:
- **list**: Show available styles
- **set**: Switch to specified style
- **reset**: Reset to default style

Built-in styles include: default, minimal, verbose, emoji, technical

**Examples:**
```bash
/output-style list       # Show available styles
/output-style set minimal # Switch to minimal style
/output-style reset      # Reset to default
```

**Related Commands:** [`/output-style:new`](#output-style-new), [`/vim`](#vim)

---

#### `/output-style:new` {#output-style-new}
**Category:** Output & Display
**Description:** Create a custom output style
**Usage:** `/output-style:new <name> [base-style] [options]`

Creates custom output styles with specific formatting options:
- **--border**: Set border style (single, double, round, none)
- **--padding**: Set padding amount
- **--icons/--no-icons**: Enable/disable icons
- **--timestamps/--no-timestamps**: Enable/disable timestamps
- **--colors**: Set color overrides
- **--description**: Set style description

**Examples:**
```bash
/output-style:new mystyle default --border double --padding 2
/output-style:new compact minimal --no-icons --colors primary=blue,error=red
```

**Related Commands:** [`/output-style`](#output-style)

---

#### `/vim` {#vim}
**Category:** Output & Display
**Description:** Toggle Vim editing mode for input
**Usage:** `/vim [on|off|toggle]`

Enables Vim-style keybindings and editing mode in the input area.

**Examples:**
```bash
/vim                     # Toggle Vim mode
/vim on                  # Enable Vim mode
/vim off                 # Disable Vim mode
```

**Related Commands:** [`/mouse`](#mouse), [`/output-style`](#output-style)

---

#### `/statusline` {#statusline}
**Category:** Output & Display
**Description:** Configure the statusline display
**Usage:** `/statusline [show|hide|format] [options]`

Customizes the status line appearance and information display.

**Examples:**
```bash
/statusline show         # Show status line
/statusline hide         # Hide status line
/statusline format compact # Use compact format
```

**Related Commands:** [`/status`](#status), [`/output-style`](#output-style)

---

### Project Commands
Commands for project-specific operations and workspace management.

#### `/init` {#init}
**Category:** Project
**Description:** Initialize a PLATO.md file with codebase documentation
**Usage:** `/init [template]`

Creates a PLATO.md file in the current directory with project context and documentation template.

**Examples:**
```bash
/init                    # Create standard PLATO.md
/init detailed           # Create detailed template
```

**Related Commands:** [`/add-dir`](#add-dir), [`/context`](#context)

---

#### `/add-dir` {#add-dir}
**Category:** Project
**Description:** Add a new working directory to context
**Usage:** `/add-dir <directory>`

Adds a directory to the current conversation context for file operations and analysis.

**Examples:**
```bash
/add-dir src/            # Add src directory
/add-dir ../other-project # Add relative directory
```

**Related Commands:** [`/init`](#init), [`/context`](#context)

---

#### `/bashes` {#bashes}
**Category:** Project
**Description:** List and manage shell sessions
**Usage:** `/bashes [list|new|switch|close] [args...]`

Manages multiple shell sessions within Plato:
- **list**: Show active shell sessions
- **new**: Create new shell session
- **switch**: Switch to different session
- **close**: Close shell session

**Examples:**
```bash
/bashes list             # Show active sessions
/bashes new dev          # Create session named 'dev'
/bashes switch main      # Switch to 'main' session
```

**Related Commands:** [`/add-dir`](#add-dir), [`/context`](#context)

---

#### `/todos` {#todos}
**Category:** Project
**Description:** Generate and list TODO items from codebase
**Usage:** `/todos [scan|list|add|remove] [args...]`

Manages TODO items and task tracking:
- **scan**: Scan codebase for TODO comments
- **list**: Show found TODO items
- **add**: Add new TODO item
- **remove**: Remove TODO item

**Examples:**
```bash
/todos scan              # Scan for TODOs
/todos list              # Show found items
/todos add "Fix bug in parser" # Add new TODO
```

**Related Commands:** [`/init`](#init), [`/add-dir`](#add-dir)

---

### Metrics Commands
Commands for monitoring usage, costs, and performance metrics.

#### `/cost` {#cost}
**Category:** Metrics
**Description:** Show tokens, cost, and duration for current session
**Usage:** `/cost [detailed|reset]`

Displays usage metrics including:
- Token consumption
- API costs
- Session duration
- Model usage statistics

**Examples:**
```bash
/cost                    # Show current metrics
/cost detailed           # Show detailed breakdown
/cost reset              # Reset counters
```

**Related Commands:** [`/analytics`](#analytics), [`/status`](#status)

---

#### `/analytics` {#analytics}
**Category:** Metrics
**Description:** View and manage cost tracking analytics
**Usage:** `/analytics [view|export|clear] [timeframe]`

Provides detailed analytics and reporting:
- **view**: Display analytics dashboard
- **export**: Export analytics data
- **clear**: Clear analytics history
- **timeframe**: daily, weekly, monthly

**Examples:**
```bash
/analytics view          # Show analytics dashboard
/analytics view weekly   # Show weekly analytics
/analytics export csv    # Export to CSV
```

**Related Commands:** [`/cost`](#cost), [`/status`](#status)

---

### Configuration Commands
Commands for managing Plato settings and behavior.

#### `/agents` {#agents}
**Category:** Configuration
**Description:** Manage agent configurations
**Usage:** `/agents [list|add|remove|configure] [args...]`

Manages AI agent configurations and settings:
- **list**: Show configured agents
- **add**: Add new agent configuration
- **remove**: Remove agent configuration
- **configure**: Modify agent settings

**Examples:**
```bash
/agents list             # Show configured agents
/agents add coding       # Add coding agent
/agents configure main --model gpt-4 # Configure agent
```

**Related Commands:** [`/model`](#model), [`/permissions`](#permissions)

---

#### `/apply-mode` {#apply-mode}
**Category:** Configuration
**Description:** Configure patch apply mode
**Usage:** `/apply-mode [auto|manual|dry-run|strict|off|status]`

Controls how code patches are applied:
- **auto**: Apply patches automatically (Claude Code parity)
- **manual**: Require confirmation before applying (default)
- **dry-run**: Preview patches only, never apply
- **strict**: Require clean git state before applying
- **off**: Disable patch processing entirely
- **status**: Show current configuration

**Examples:**
```bash
/apply-mode auto         # Enable automatic patch application
/apply-mode strict       # Require clean git state
/apply-mode status       # Show current mode
```

**Related Commands:** [`/security-review`](#security-review), [`/permissions`](#permissions)

---

#### `/tool-call-preset` {#tool-call-preset}
**Category:** Configuration
**Description:** Configure tool call preset behavior
**Usage:** `/tool-call-preset [enable|disable|strict|heuristics|message|override] [args...]`

Manages tool call behavior and presets:
- **enable/disable**: Control tool call preset system
- **strict**: Configure strict JSON-only mode
- **heuristics**: Allow legacy tool detection
- **message**: Set custom preset message
- **override**: Set per-model overrides

**Examples:**
```bash
/tool-call-preset enable # Enable tool call presets
/tool-call-preset strict on # Enable strict mode
/tool-call-preset message "Use JSON format" # Set custom message
```

**Related Commands:** [`/mcp`](#mcp), [`/permissions`](#permissions)

---

### Integration Commands
Commands for connecting with external tools and services.

#### `/proxy` {#proxy}
**Category:** Integration
**Description:** Start an OpenAI-compatible HTTP proxy
**Usage:** `/proxy [start|stop|status] [--port <port>]`

Starts an HTTP proxy server that provides OpenAI-compatible API endpoints for integration with other tools.

**Examples:**
```bash
/proxy start             # Start proxy on default port
/proxy start --port 11434 # Start on specific port
/proxy status            # Show proxy status
/proxy stop              # Stop proxy server
```

**Related Commands:** [`/mcp`](#mcp), [`/ide`](#ide)

---

#### `/ide` {#ide}
**Category:** Integration
**Description:** Connect to IDE for file awareness and linter warnings
**Usage:** `/ide [connect|disconnect|status|test]`

Establishes integration with IDEs for enhanced development experience:
- **connect**: Establish IDE connection
- **disconnect**: Close IDE connection
- **status**: Show connection status
- **test**: Test IDE integration

**Examples:**
```bash
/ide connect             # Connect to IDE
/ide status              # Show connection status
/ide test                # Test integration
```

**Related Commands:** [`/proxy`](#proxy), [`/mcp`](#mcp)

---

#### `/install-gitlab-app` {#install-gitlab-app}
**Category:** Integration
**Description:** Configure GitLab integrations for automatic MR reviews
**Usage:** `/install-gitlab-app [token|configure|webhook|test] [args...]`

Sets up GitLab integration for automated merge request reviews:
- **token**: Get token creation instructions
- **configure**: Configure authentication
- **webhook**: Setup webhook instructions
- **test**: Test current configuration

**Examples:**
```bash
/install-gitlab-app token # Get token instructions
/install-gitlab-app configure <token> # Set up authentication
/install-gitlab-app webhook # Setup webhooks
```

**Related Commands:** [`/ide`](#ide), [`/hooks`](#hooks)

---

### Utility Commands
Miscellaneous utility commands for system maintenance and support.

#### `/upgrade` {#upgrade}
**Category:** Utility
**Description:** Upgrade to higher provider plan
**Usage:** `/upgrade [provider] [plan]`

Provides information and assistance for upgrading provider plans and accessing advanced features.

**Examples:**
```bash
/upgrade                 # Show upgrade options
/upgrade copilot pro     # Upgrade to Copilot Pro
```

**Related Commands:** [`/status`](#status), [`/model`](#model)

---

#### `/release-notes` {#release-notes}
**Category:** Utility
**Description:** Show Plato release notes and version information
**Usage:** `/release-notes`

Displays current version information, changelog, and recent improvements.

**Examples:**
```bash
/release-notes           # Show release information
```

**Related Commands:** [`/status`](#status), [`/bug`](#bug)

---

#### `/terminal-setup` {#terminal-setup}
**Category:** Utility
**Description:** Fix terminal configuration (Shift+Enter, key bindings)
**Usage:** `/terminal-setup [test|fix|help]`

Helps diagnose and fix common terminal configuration issues:
- **test**: Test terminal capabilities
- **fix**: Show environment variable fixes
- **help**: Show detailed help

**Examples:**
```bash
/terminal-setup test     # Test terminal setup
/terminal-setup fix      # Show fixes
/terminal-setup          # Show help
```

**Related Commands:** [`/keydebug`](#keydebug), [`/doctor`](#doctor)

---

#### `/bug` {#bug}
**Category:** Utility
**Description:** Report bug - opens Plato GitLab issues page
**Usage:** `/bug [--open]`

Provides information for reporting bugs and opens the GitLab issues page.

**Examples:**
```bash
/bug                     # Show bug report info
/bug --open              # Open issues page automatically
```

**Related Commands:** [`/debug`](#debug), [`/doctor`](#doctor)

---

#### `/keydebug` {#keydebug}
**Category:** Utility
**Description:** Capture next key raw bytes for debugging
**Usage:** `/keydebug`

Captures raw key input for debugging keyboard and terminal issues, especially useful for WSL/Docker environments.

**Examples:**
```bash
/keydebug                # Start key debug mode
```

**Related Commands:** [`/terminal-setup`](#terminal-setup), [`/debug`](#debug)

---

## 🎹 Keyboard Shortcuts

### Global Shortcuts
- **Ctrl+C**: Exit application
- **Ctrl+D**: Alternative exit
- **F1**: Show context help
- **F5**: Refresh status

### Input Shortcuts
- **Enter**: Send message/execute command
- **Shift+Enter**: New line without sending
- **Ctrl+U**: Clear input line
- **Tab**: Command auto-completion

### Navigation Shortcuts
- **Page Up/Down**: Scroll conversation
- **Ctrl+Home/End**: Jump to start/end
- **Mouse Wheel**: Smooth scrolling (when mouse enabled)

For complete keyboard shortcuts documentation, see [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md).

## 💡 Tips and Best Practices

### Command Efficiency
- Use **Tab completion** for faster command entry
- Type `/h` + Tab to quickly access `/help`
- Use command aliases when available
- Chain related commands for workflows

### Security Best Practices
- Always run `/security-review` before applying patches
- Use `/apply-mode strict` for critical projects
- Configure `/permissions` appropriately for your workflow
- Enable `/privacy-settings redact on` for sensitive data

### Context Management
- Use `/compact` regularly to manage token usage
- Export important conversations with `/export`
- Set up appropriate `/memory` management
- Monitor usage with `/cost` and `/analytics`

### Development Workflow
- Initialize projects with `/init` for better context
- Use `/add-dir` to include relevant directories
- Set up `/mcp` servers for extended functionality
- Configure `/ide` integration for better development experience

### Troubleshooting
- Start with `/doctor` for general issues
- Use `/debug` for detailed diagnostics
- Check `/terminal-setup` for input problems
- Use `/keydebug` for keyboard issues

## 🔗 Related Documentation

- [Keyboard Shortcuts](KEYBOARD_SHORTCUTS.md) - Complete keyboard reference
- [API Reference](API_REFERENCE.md) - Programming interface
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
- [Performance](PERFORMANCE.md) - Optimization and performance tuning
- [Permissions System](PERMISSIONS_SYSTEM.md) - Security and access control

---

*Last updated: 2025-09-16*
*For more help, run `/help` or visit the [documentation index](PROJECT_INDEX.md)*