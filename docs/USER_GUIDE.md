# User Guide

Complete guide to using Plato TUI - your AI-powered terminal coding assistant.

## 🚀 Getting Started

### Welcome to Plato!

Plato is an advanced terminal-based AI assistant that brings Claude Code-style functionality to your command line with enhanced features, visual interface, and powerful integrations.

### First Time Setup

#### 1. Start Plato
```bash
# Development mode
npm run dev

# Production mode
npm start

# Direct CLI mode
npx tsx src/cli.ts
```

#### 2. Initial Authentication
```bash
# Start the TUI and run:
/login

# Follow the device flow authentication process
# 1. Visit the provided URL
# 2. Enter the device code
# 3. Authorize Plato to access your AI provider
```

#### 3. Verify Setup
```bash
# Check system status
/doctor

# View current configuration
/status

# Test your setup
/help
```

## 🎯 Core Concepts

### Slash Commands
Plato uses slash commands (starting with `/`) for system operations:
- **System commands**: `/status`, `/help`, `/doctor`
- **AI model commands**: `/model`, `/login`, `/logout`
- **File operations**: `/edit`, `/create`, `/search`
- **Memory management**: `/memory`, `/compact`, `/export`

### Chat Interface
- Type naturally to interact with the AI
- Commands are processed immediately
- Conversations are automatically saved
- Use `/resume` to restore previous sessions

### Tool Integration
- MCP (Model Context Protocol) servers extend functionality
- Native file operations work seamlessly
- Git integration for version control
- Real-time security scanning

## 📚 Essential Commands

### System Management

#### `/help` - Get Help
```bash
# Show all available commands
/help

# Get help for a specific command
/help memory
```

#### `/status` - Check System Status
```bash
# View current status
/status

# Shows:
# - Authentication status
# - Active AI model
# - Memory usage
# - Connected MCP servers
```

#### `/doctor` - System Diagnostics
```bash
# Run comprehensive diagnostics
/doctor

# Checks:
# - Node.js and npm versions
# - Git availability
# - Authentication status
# - MCP server connectivity
# - File permissions
```

### Authentication & Models

#### `/login` - Authenticate
```bash
# Start authentication flow
/login

# Supports:
# - GitHub Copilot
# - GitLab Duo
# - OpenAI (via API key)
```

#### `/logout` - Clear Credentials
```bash
# Logout and clear all credentials
/logout
```

#### `/model` - Switch AI Models
```bash
# List available models
/model

# Switch to a specific model
/model gpt-4
/model claude-3-sonnet
/model copilot
```

### File Operations

#### `/edit` - Edit Files
```bash
# Edit a specific file
/edit src/main.ts

# Edit multiple files matching a pattern
/edit "*.js"

# Edit with line numbers
/edit src/main.ts:10-20
```

#### `/create` - Create Files
```bash
# Create a new file
/create newfile.js

# Create a directory
/create newdir/

# Create with initial content
/create readme.md "# My Project"
```

#### `/search` - Search Codebase
```bash
# Search for text
/search "function getName"

# Search with file type filter
/search "import" --type=js

# Case-sensitive search
/search "API_KEY" --case-sensitive
```

#### `/browse` - Navigate Files
```bash
# List current directory
/browse

# Browse specific directory
/browse src/

# Show file details
/browse src/main.ts
```

### Memory & Context

#### `/memory` - Manage Conversation Memory
```bash
# View memory status
/memory

# Save current conversation
/memory save "project-analysis"

# Load saved conversation
/memory load "project-analysis"

# Clear memory
/memory clear
```

#### `/context` - Token Usage
```bash
# Show context information
/context

# Shows:
# - Current token usage
# - Available context window
# - Memory consumption
# - Optimization suggestions
```

#### `/compact` - Optimize History
```bash
# Compact conversation history
/compact

# Compact with focus on specific topics
/compact --focus="authentication,database"

# Preview compaction without applying
/compact --dry-run
```

#### `/export` - Export Conversations
```bash
# Export to file
/export conversation.md

# Export to clipboard
/export --clipboard

# Export specific format
/export --format=json
```

### Tool Management

#### `/mcp` - MCP Server Management
```bash
# List connected servers
/mcp list

# Connect to an MCP server
/mcp attach myserver http://localhost:8000

# Disconnect from server
/mcp detach myserver

# List available tools
/mcp tools

# Test server connection
/mcp test myserver
```

#### `/permissions` - Security Permissions
```bash
# View current permissions
/permissions

# Allow file system patches
/permissions default fs_patch allow

# Deny network access
/permissions default network deny

# Review pending permissions
/permissions review
```

## 🔧 Customization

### Output Styles

#### `/output-style` - Change Output Formatting
```bash
# List available styles
/output-style list

# Switch to minimal style
/output-style minimal

# Use technical style for detailed output
/output-style technical

# Create custom style
/output-style:new mystyle
```

#### Available Styles:
- **default**: Balanced formatting with colors
- **minimal**: Clean, compact output
- **technical**: Detailed technical information
- **emoji**: Enhanced with emojis and icons
- **verbose**: Maximum detail and context

### Custom Commands

Create custom commands in `.plato/commands/`:

```json
{
  "name": "deploy",
  "description": "Deploy application to staging",
  "script": "npm run build && docker build -t myapp .",
  "category": "Development"
}
```

## 🎨 Advanced Features

### Multi-Panel Interface

The TUI provides multiple panels for enhanced productivity:

- **Main Chat** (60-70% width): Primary conversation
- **Status Panel** (30-40% width): Real-time metrics
- **Info Panel**: Context and tool outputs

#### Keyboard Navigation:
- `Ctrl+1/2/3`: Switch between panels
- `F1`: Toggle status panel
- `F2`: Expand input area
- `F3`: Switch layout modes

### Accessibility Features

Plato is designed with accessibility in mind:

- **Full keyboard navigation**
- **Screen reader support**
- **High contrast themes**
- **Customizable font sizes**
- **Focus indicators**

#### Accessibility Commands:
```bash
# Enable high contrast mode
/output-style high-contrast

# Adjust font size
/font-size large

# Enable screen reader mode
/accessibility screen-reader on
```

### Performance Features

#### `/mouse` - Mouse Support
```bash
# Toggle mouse mode
/mouse toggle

# Enable mouse support
/mouse on

# Disable mouse support
/mouse off
```

#### `/paste` - Paste Mode
```bash
# Enter paste mode for 10 seconds
/paste 10

# Quick paste mode (5 seconds)
/paste
```

## 🔒 Security & Privacy

### Security Review

#### `/security-review` - Review Changes
```bash
# Review pending changes
/security-review

# Shows:
# - File modifications
# - Potential security issues
# - Recommendations
```

### Privacy Settings

#### `/privacy-settings` - Configure Privacy
```bash
# View privacy settings
/privacy-settings

# Disable telemetry
/privacy-settings telemetry off

# Configure data retention
/privacy-settings retention 30days
```

## 🚀 Productivity Workflows

### Daily Development Workflow

```bash
# 1. Start your day
/resume                    # Restore yesterday's session
/status                    # Check system status

# 2. Review changes
/git status               # Check git status
/security-review          # Review pending changes

# 3. Work on features
/search "TODO"            # Find pending tasks
/edit src/feature.ts      # Edit files
/test                     # Run tests

# 4. End of day
/memory save "day-end"    # Save progress
/export daily-log.md      # Export conversation
```

### Project Analysis Workflow

```bash
# 1. Load project context
/browse                   # Navigate project structure
/search "import"          # Understand dependencies

# 2. Deep analysis
/mcp attach analyzer http://localhost:8001
Ask: "Analyze the project architecture"

# 3. Document findings
/create analysis.md
/export --format=markdown
```

### Debugging Workflow

```bash
# 1. Enable debug mode
/debug on

# 2. Search for issues
/search "error\|exception"
/git log --oneline -10

# 3. Analyze problems
Ask: "Help me debug this error: [paste error]"

# 4. Apply fixes
/edit problematic-file.js
/test                     # Verify fixes
```

## 📋 Best Practices

### Efficient Command Usage

1. **Use tab completion** for command names and file paths
2. **Chain related commands** in your workflow
3. **Save important conversations** with descriptive names
4. **Regular memory management** to keep context clean
5. **Export logs** for important sessions

### Memory Management

```bash
# Daily memory maintenance
/compact                  # Compress old conversations
/memory clean            # Remove temporary data
/export important-session.md  # Archive key discussions
```

### Security Practices

```bash
# Regular security checks
/security-review         # Review all changes
/permissions review      # Check tool permissions
/privacy-settings        # Verify privacy configuration
```

## 🐛 Common Issues & Solutions

### Authentication Problems

**Issue:** Login fails
```bash
# Solutions:
/logout                  # Clear credentials
/login                   # Try again
/doctor                  # Check system status
```

### Memory Issues

**Issue:** Context window full
```bash
# Solutions:
/compact                 # Compress history
/memory clear           # Start fresh
/context                # Check usage
```

### Performance Issues

**Issue:** Slow response times
```bash
# Solutions:
/debug performance      # Enable performance logging
/compact               # Free up memory
/mcp detach slow-server # Disconnect slow servers
```

## 🔗 Integration Examples

### Git Integration

```bash
# Git workflow commands
/git status
/git add .
/git commit -m "feature: add user authentication"
/git push origin feature/auth
```

### MCP Server Setup

```bash
# Connect to a local development server
/mcp attach devtools http://localhost:8080

# Use specialized tools
Ask: "Use the devtools to analyze performance"

# Manage multiple servers
/mcp list
/mcp detach unused-server
```

### IDE Integration

```bash
# Setup IDE integration
/ide setup vscode
/ide setup vim
/ide setup emacs
```

## 📚 Learning Resources

- **Interactive Tutorial**: Type `/help tutorial` for guided learning
- **Command Reference**: `/help commands` for complete command list
- **Video Tutorials**: Available in `docs/VIDEO_TUTORIALS.md`
- **API Reference**: `docs/API_REFERENCE.md`

## 🆘 Getting Help

- **In-app help**: `/help`
- **System diagnostics**: `/doctor`
- **Bug reporting**: `/bug report "describe issue"`
- **Community support**: Available through project repository

---

**Tips for Success:**
1. Start with `/doctor` to verify your setup
2. Use `/status` regularly to monitor system health
3. Save important conversations with `/memory save`
4. Experiment with different output styles
5. Enable security review for important changes

**Happy coding with Plato!** 🚀