# Spec Tasks

## Tasks

- [ ] 1. Fix Command Processing System
  - [x] 1.1 Write tests for command interception in CLI mode
  - [x] 1.2 Implement command interceptor in src/cli.ts
  - [x] 1.3 Create command router in src/commands/router.ts
  - [x] 1.4 Fix command detection in src/tui/keyboard-handler.tsx
  - [x] 1.5 Update src/slash/commands.ts to use new router
  - [x] 1.6 Add error handling and user feedback
  - [x] 1.7 Test command processing in both CLI and TUI modes
  - [ ] 1.8 Verify all existing slash commands work correctly (some test failures remain)

- [ ] 2. Implement Core Claude Commands
  - [x] 2.1 Write tests for /edit, /search, /run, /test commands
  - [x] 2.2 Create /edit command with file editing capabilities (native tools implemented)
  - [x] 2.3 Implement /search command with regex and file filtering (native tools implemented)
  - [ ] 2.4 Add /run command for shell execution (not in slash commands registry)
  - [ ] 2.5 Build /test command with framework detection (not in slash commands registry)
  - [ ] 2.6 Implement /git command for version control (not in slash commands registry)
  - [ ] 2.7 Create /browse command for file navigation (not in slash commands registry)
  - [ ] 2.8 Verify all new commands pass tests (commands not exposed in UI)

- [x] 3. Enable Direct File System Access
  - [x] 3.1 Write tests for direct file operations
  - [x] 3.2 Create src/tools/filesystem.ts for file operations
  - [x] 3.3 Implement file watcher in src/tools/file-watcher.ts
  - [x] 3.4 Add filesystem permissions system
  - [x] 3.5 Modify orchestrator for direct file access
  - [x] 3.6 Ensure backward compatibility with patch system
  - [x] 3.7 Verify all file operations work correctly

- [ ] 4. Fix Help System and Add Autocomplete
  - [x] 4.1 Write tests for help command and autocomplete
  - [x] 4.2 Fix /help command to show actual command list (basic implementation exists)
  - [ ] 4.3 Implement command autocomplete component (not found)
  - [ ] 4.4 Add fuzzy matching for command suggestions (partial in router)
  - [ ] 4.5 Create argument hints for each command (not implemented)
  - [ ] 4.6 Integrate with keyboard handler (not implemented)
  - [ ] 4.7 Add command history navigation (not implemented)
  - [ ] 4.8 Verify help and autocomplete features work (incomplete)

- [ ] 5. Integration Testing and Documentation
  - [x] 5.1 Write comprehensive integration tests (103 test files exist)
  - [ ] 5.2 Test all commands in both CLI and TUI modes (core commands missing from UI)
  - [ ] 5.3 Verify Claude Code parity for core features (core commands not exposed)
  - [ ] 5.4 Update README with new commands (commands not available to users)
  - [ ] 5.5 Create user documentation for new features (commands not accessible)
  - [x] 5.6 Performance testing (<100ms command response) (native tools tested)
  - [ ] 5.7 Final validation of all requirements (core commands not in slash registry)
  - [ ] 5.8 Verify all tests pass (12 test suites failing)

## Current Status Summary

**Foundation Complete**: Native tools for file operations, command parsing, and routing infrastructure are implemented with comprehensive testing (264 passing tests across 103 test files).

**Critical Gap**: Core Claude commands (`/edit`, `/search`, `/run`, `/test`, `/git`, `/browse`) exist as sophisticated native tools but are **not exposed in the slash commands registry**, making them inaccessible to users.

**Next Priority**: Bridge the gap between native tool implementations and user-accessible slash commands to achieve Claude Code parity.