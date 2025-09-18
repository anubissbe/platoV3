# Spec Tasks

## Tasks

- [ ] 1. Fix Provider and Session Initialization
  - [ ] 1.1 Write tests for provider initialization in TUI startup
  - [ ] 1.2 Implement CopilotProvider creation in keyboard-handler.tsx on startup
  - [ ] 1.3 Load configuration and credentials from ~/.config/plato/config.json
  - [ ] 1.4 Create Session with system prompt and pass to all components
  - [ ] 1.5 Update processSlashCommand to accept provider/session instead of null
  - [ ] 1.6 Connect session to memory manager for persistence
  - [ ] 1.7 Verify all tests pass and commands receive valid provider/session

- [ ] 2. Implement Core MCP Server Integration
  - [ ] 2.1 Write tests for MCPManager and server lifecycle
  - [ ] 2.2 Create MCPManager class with WebSocket connection handling
  - [ ] 2.3 Implement /mcp command suite (list, attach, detach, tools, restart)
  - [ ] 2.4 Add health monitoring with heartbeat and auto-reconnect
  - [ ] 2.5 Implement tool registration and permission system integration
  - [ ] 2.6 Create tool call format matching Claude Code exactly
  - [ ] 2.7 Add server persistence to .plato/mcp-servers.json
  - [ ] 2.8 Verify all tests pass and MCP servers connect properly

- [ ] 3. Integrate MessageBubble UI Components
  - [ ] 3.1 Write tests for MessageBubble rendering and interactions
  - [ ] 3.2 Replace current basic display with EnhancedConversationArea component
  - [ ] 3.3 Implement MessageBubble with proper formatting and metadata display
  - [ ] 3.4 Add tool call visualization matching Claude Code style
  - [ ] 3.5 Implement status line with exact Claude Code format
  - [ ] 3.6 Add multi-line input support with proper key handling
  - [ ] 3.7 Enable command completion with tab navigation
  - [ ] 3.8 Verify all tests pass and UI matches Claude Code exactly

- [ ] 4. Complete Slash Command Implementation
  - [ ] 4.1 Write tests for all 21 missing slash commands
  - [ ] 4.2 Implement authentication commands (/login, /logout with OAuth flow)
  - [ ] 4.3 Implement system commands (/status, /doctor with full diagnostics)
  - [ ] 4.4 Implement MCP commands with full protocol support
  - [ ] 4.5 Implement memory commands with persistence and stats
  - [ ] 4.6 Add command router integration for all new commands
  - [ ] 4.7 Verify all tests pass and commands work identically to Claude Code

- [ ] 5. Add Session and Memory Persistence
  - [ ] 5.1 Write tests for auto-save and session restoration
  - [ ] 5.2 Implement 30-second auto-save to .plato/session.json
  - [ ] 5.3 Add compression for sessions >1MB
  - [ ] 5.4 Implement session restoration on startup (<24h old)
  - [ ] 5.5 Add memory index and rotation system
  - [ ] 5.6 Implement permission persistence to .plato/permissions.json
  - [ ] 5.7 Add output styles system with built-in styles
  - [ ] 5.8 Verify all tests pass and persistence works across restarts