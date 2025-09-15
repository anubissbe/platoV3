# Spec Tasks

## Tasks

- [ ] 1. Fix Command Processing System
  - [ ] 1.1 Write tests for command interception in CLI mode
  - [ ] 1.2 Implement command interceptor in src/cli.ts
  - [ ] 1.3 Create command router in src/commands/router.ts
  - [ ] 1.4 Fix command detection in src/tui/keyboard-handler.tsx
  - [ ] 1.5 Update src/slash/commands.ts to use new router
  - [ ] 1.6 Add error handling and user feedback
  - [ ] 1.7 Test command processing in both CLI and TUI modes
  - [ ] 1.8 Verify all existing slash commands work correctly

- [ ] 2. Implement Core Claude Commands
  - [ ] 2.1 Write tests for /edit, /search, /run, /test commands
  - [ ] 2.2 Create /edit command with file editing capabilities
  - [ ] 2.3 Implement /search command with regex and file filtering
  - [ ] 2.4 Add /run command for shell execution
  - [ ] 2.5 Build /test command with framework detection
  - [ ] 2.6 Implement /git command for version control
  - [ ] 2.7 Create /browse command for file navigation
  - [ ] 2.8 Verify all new commands pass tests

- [ ] 3. Enable Direct File System Access
  - [ ] 3.1 Write tests for direct file operations
  - [ ] 3.2 Create src/tools/filesystem.ts for file operations
  - [ ] 3.3 Implement file watcher in src/tools/file-watcher.ts
  - [ ] 3.4 Add filesystem permissions system
  - [ ] 3.5 Modify orchestrator for direct file access
  - [ ] 3.6 Ensure backward compatibility with patch system
  - [ ] 3.7 Verify all file operations work correctly

- [ ] 4. Fix Help System and Add Autocomplete
  - [ ] 4.1 Write tests for help command and autocomplete
  - [ ] 4.2 Fix /help command to show actual command list
  - [ ] 4.3 Implement command autocomplete component
  - [ ] 4.4 Add fuzzy matching for command suggestions
  - [ ] 4.5 Create argument hints for each command
  - [ ] 4.6 Integrate with keyboard handler
  - [ ] 4.7 Add command history navigation
  - [ ] 4.8 Verify help and autocomplete features work

- [ ] 5. Integration Testing and Documentation
  - [ ] 5.1 Write comprehensive integration tests
  - [ ] 5.2 Test all commands in both CLI and TUI modes
  - [ ] 5.3 Verify Claude Code parity for core features
  - [ ] 5.4 Update README with new commands
  - [ ] 5.5 Create user documentation for new features
  - [ ] 5.6 Performance testing (<100ms command response)
  - [ ] 5.7 Final validation of all requirements
  - [ ] 5.8 Verify all tests pass