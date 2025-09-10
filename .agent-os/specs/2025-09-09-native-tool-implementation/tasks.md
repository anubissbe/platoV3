# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2025-09-09-native-tool-implementation/spec.md

> Created: 2025-09-10
> Status: Ready for Implementation
> Current Progress: 81% (34/42 tests passing) → Target: 95% (40/42 tests passing)

## Priority 1: Critical EditTool Compatibility Issues

### Task 1.1: Fix EditTool Diff Generation and Response Format
**Status**: 🔄 High Priority  
**Impact**: Fixes 2 failing tests - critical for edit operations  
**Test Coverage**: `EditTool Parity` test group

**Subtasks**:
- [ ] Implement proper diff generation using unified diff format (`@@ -start,count +start,count @@`)
- [ ] Add `diffGenerationTime` metric tracking to EditTool execution
- [ ] Fix `linesModified` array tracking - should contain actual modified line numbers, not empty array
- [ ] Ensure `diff` field is populated with generated diff content, not `undefined`
- [ ] Update EditTool metrics to include all required timing fields

**Expected Changes**:
```typescript
// Current response missing these fields:
{
  diff: undefined,                    // Should contain unified diff
  linesModified: [],                  // Should contain [1] for modified line
  metrics: {
    diffGenerationTime: undefined     // Should track diff timing
  }
}
```

**Validation**:
```bash
npm test -- --testNamePattern="should match Claude Code response format for successful edit"
npm test -- --testNamePattern="should handle pattern not found like Claude Code"
```

### Task 1.2: Fix EditTool Error Handling and Classification
**Status**: 🔄 High Priority  
**Impact**: Improves error compatibility and user experience

**Subtasks**:
- [ ] Ensure EditTool throws `ToolError` instances instead of raw `ReferenceError`
- [ ] Implement proper error classification for pattern-not-found scenarios
- [ ] Set correct `errorClass` as `VALIDATION` for pattern not found errors
- [ ] Use error code `PATTERN_NOT_FOUND` consistently with Claude Code

**Expected Fix**:
```typescript
// Pattern not found should throw ToolError, not ReferenceError
throw new ToolError('PATTERN_NOT_FOUND', 'Pattern not found in file', ErrorClass.VALIDATION);
```

## Priority 2: Response Format and Metadata Alignment

### Task 2.1: Fix ListTool Response Format Consistency
**Status**: 🔄 Medium Priority  
**Impact**: Fixes 1 failing test - directory listing compatibility

**Subtasks**:
- [ ] Review ListTool response structure against Claude Code reference format
- [ ] Ensure all required fields are present and correctly formatted
- [ ] Fix field count discrepancies in directory listing responses
- [ ] Validate `totalFiles`, `totalDirectories`, and directory structure metadata

**Validation**:
```bash
npm test -- --testNamePattern="should match Claude Code response format for directory listing"
```

### Task 2.2: Fix ReadTool Path Resolution and Metrics
**Status**: 🔄 Medium Priority  
**Impact**: Fixes 1 failing test - path handling consistency

**Subtasks**:
- [ ] Normalize `resolvedPath` output to match expected workspace paths
- [ ] Adjust metrics duration to match expected ranges (Claude Code shows ~42ms baseline)
- [ ] Ensure consistent path resolution behavior across different test environments
- [ ] Validate that relative paths resolve consistently

**Expected Fix**:
```typescript
// Current: resolvedPath: "/tmp/tmp/parity-test-388fws7zu/test.txt"
// Expected: resolvedPath: "/workspace/test.txt" (or normalized equivalent)
```

## Priority 3: BashTool Working Directory and Validation

### Task 3.1: Fix BashTool Working Directory Handling
**Status**: 🔄 Medium Priority  
**Impact**: Fixes 1 failing test - command execution compatibility

**Subtasks**:
- [ ] Review BashTool working directory validation logic
- [ ] Ensure compatibility with Claude Code's cwd handling behavior
- [ ] Fix absolute path requirement validation to match Claude Code expectations
- [ ] Allow relative working directories when appropriate

**Current Issue**:
```bash
# BashTool currently throws INVALID_CWD error for relative paths
# Claude Code may accept relative paths in certain contexts
```

**Validation**:
```bash
npm test -- --testNamePattern="should handle working directory like Claude Code"
```

## Priority 4: Error Message and Classification Compatibility

### Task 4.1: Fix Error Classification System
**Status**: 🔄 Medium Priority  
**Impact**: Fixes 1 failing test - error handling consistency

**Subtasks**:
- [ ] Review ErrorClassifier mapping of error codes to error classes
- [ ] Fix permission-related errors to use correct classification
- [ ] Ensure path traversal errors use `validation` class instead of `permission` class
- [ ] Update error message formats to match Claude Code patterns

**Current Issue**:
```typescript
// Current: errorClass = "permission" for path traversal
// Expected: errorClass = "validation" for path traversal
```

### Task 4.2: Fix Error Message Format Compatibility
**Status**: 🔄 Medium Priority  
**Impact**: Fixes 1 failing test - error message consistency

**Subtasks**:
- [ ] Update error messages to match Claude Code format expectations
- [ ] Change "Path traversal not allowed" to "Permission denied" or "not permitted" format
- [ ] Ensure error message patterns match regex expectations in tests
- [ ] Maintain security while improving message compatibility

**Expected Fix**:
```typescript
// Current: "Path traversal not allowed"
// Expected: Match pattern /Permission denied|not permitted/i
```

## Priority 5: Streaming Event Sequence and Format

### Task 5.1: Fix Streaming Event Sequence Numbering
**Status**: 🔄 Low Priority  
**Impact**: Fixes 1 failing test - streaming compatibility

**Subtasks**:
- [ ] Review streaming event generation in BashTool and other streaming tools
- [ ] Fix event sequence numbering to start from 0 or 1 consistently with Claude Code
- [ ] Ensure event sequence increments properly without gaps
- [ ] Validate streaming event format matches Claude Code exactly

**Current Issue**:
```typescript
// Current: event.sequence = 3 (when index = 0)
// Expected: event.sequence = 1 (or 0, depending on Claude Code behavior)
```

**Validation**:
```bash
npm test -- --testNamePattern="should match Claude Code streaming event format"
```

## Implementation Strategy

### Phase 1: High-Impact Fixes (Target: 90% test pass rate)
1. **EditTool fixes** (Tasks 1.1, 1.2) - Addresses 2 failing tests
2. **Error classification** (Task 4.1) - Addresses 1 failing test
3. **Working directory handling** (Task 3.1) - Addresses 1 failing test

### Phase 2: Response Format Alignment (Target: 95% test pass rate)
1. **ListTool response format** (Task 2.1) - Addresses 1 failing test
2. **ReadTool path resolution** (Task 2.2) - Addresses 1 failing test
3. **Error message format** (Task 4.2) - Addresses 1 failing test

### Phase 3: Streaming and Polish (Target: >95% test pass rate)
1. **Streaming sequence numbering** (Task 5.1) - Addresses 1 failing test
2. **Final validation and edge case handling**

## Testing Approach

### Test-First Development
For each task, follow this pattern:
1. **Understand Failure**: Run specific failing test to understand exact discrepancy
2. **Examine Reference**: Review Claude Code expected behavior from test reference data
3. **Implement Fix**: Make minimal changes to align behavior
4. **Validate Fix**: Ensure test passes and no regressions in other tests
5. **Integration Test**: Run full parity test suite to verify no side effects

### Validation Commands per Task
```bash
# Full parity test suite
npm test -- src/tools/native/__tests__/claude-code-parity.test.ts

# Specific failing tests
npm test -- --testNamePattern="EditTool.*should match Claude Code"
npm test -- --testNamePattern="should handle pattern not found like Claude Code"  
npm test -- --testNamePattern="should match Claude Code response format for directory listing"
npm test -- --testNamePattern="should handle working directory like Claude Code"
npm test -- --testNamePattern="should format all errors with Claude Code-compatible structure"
npm test -- --testNamePattern="should produce identical error messages"
npm test -- --testNamePattern="should match Claude Code streaming event format"
```

## Success Criteria

### Quantitative Goals
- **Test Pass Rate**: Improve from 81% (34/42) to 95% (40/42) 
- **Critical Tool Functions**: 100% EditTool compatibility (currently failing)
- **Error Handling**: 100% error classification compatibility
- **Performance**: Maintain <100ms tool execution latency

### Qualitative Goals  
- **Wire Compatibility**: Identical response formats to Claude Code
- **Error Consistency**: Error messages and classifications match Claude Code behavior
- **Streaming Compatibility**: Event sequence and format exactly match Claude Code
- **Path Handling**: Consistent path resolution and working directory behavior

## Risk Assessment

### Low Risk Tasks
- Error message format changes (Task 4.2)
- Streaming sequence numbering (Task 5.1)  
- ReadTool path resolution (Task 2.2)

### Medium Risk Tasks
- EditTool diff generation (Task 1.1) - Complex algorithm implementation
- BashTool working directory validation (Task 3.1) - Security implications
- Error classification changes (Task 4.1) - Affects multiple tools

### High Risk Tasks  
- EditTool error handling (Task 1.2) - Major refactoring of error flow

### Mitigation Strategies
- **Incremental Testing**: Validate each change against both new and existing tests
- **Rollback Plan**: Git commits per subtask for easy rollback if regressions occur
- **Security Review**: Extra validation for any changes to path handling or working directory logic
- **Performance Monitoring**: Ensure changes don't impact tool execution latency targets