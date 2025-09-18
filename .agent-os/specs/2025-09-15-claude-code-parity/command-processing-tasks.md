# Spec Tasks - Command Processing System Fix

## Tasks

- [ ] 1. Fix Command Processing System
  - [ ] 1.1 Write tests for command interception
  - [ ] 1.2 Implement CLI command interceptor
  - [ ] 1.3 Create command router module
  - [ ] 1.4 Fix TUI command detection
  - [ ] 1.5 Update slash command registry
  - [ ] 1.6 Add error handling
  - [ ] 1.7 Integration testing
  - [ ] 1.8 Verify all tests pass

## Detailed Subtask Breakdown

### 1.1 Write tests for command interception
- Create test file: `src/__tests__/command-processing.test.ts`
- Test that slash commands are NOT sent to AI
- Test command parsing and argument extraction
- Test both CLI and TUI mode behaviors

### 1.2 Implement CLI command interceptor
- Modify `src/cli.ts` to intercept commands before AI processing
- Add check for commands starting with "/"
- Route to command processor instead of AI

### 1.3 Create command router module
- Create new file: `src/commands/router.ts`
- Implement command parsing logic
- Add command dispatch mechanism
- Support for command arguments

### 1.4 Fix TUI command detection
- Update `src/tui/keyboard-handler.tsx`
- Ensure slash commands trigger command processing
- Prevent commands from entering chat stream

### 1.5 Update slash command registry
- Modify `src/slash/commands.ts`
- Integrate with new router
- Ensure all 38+ commands are registered

### 1.6 Add error handling
- Implement user-friendly error messages
- Add command validation
- Provide helpful feedback for invalid commands

### 1.7 Integration testing
- Test all existing Plato commands
- Verify `/help`, `/status`, `/model` work correctly
- Test in both CLI and TUI modes

### 1.8 Verify all tests pass
- Run full test suite
- Ensure no regressions
- Validate command processing works as expected