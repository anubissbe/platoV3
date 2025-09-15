# Task Completion Workflow

## Required Steps When Task is Completed

### 1. Code Quality Checks

```bash
# Type checking (MUST pass)
npm run typecheck

# Linting (MUST pass)
npm run lint

# Code formatting
npm run fmt
```

### 2. Testing Requirements

```bash
# Run relevant tests based on changes
npm run test:unit                  # For isolated component changes
npm run test:integration           # For system integration changes
npm run test:reliable              # Stable test suite
npm run test:comprehensive         # Full test suite for major changes

# Generate coverage report for significant changes
npm run test:coverage
```

### 3. Build Verification

```bash
# Ensure TypeScript builds successfully
npm run build

# Verify built application works
npm run start --help
```

### 4. Performance Checks (for performance-related changes)

```bash
# Run performance benchmarks
npm run perf:benchmark

# Check for performance regressions
npm run perf:monitor
```

### 5. Documentation Updates

- Update CLAUDE.md if architecture changes
- Update README.md if user-facing features change
- Add/update JSDoc comments for new APIs
- Update CONTRIBUTING.md if development workflow changes

### 6. Git Workflow

```bash
# Stage changes
git add .

# Commit with conventional commit format
git commit -m "feat: add new feature description"
# or
git commit -m "fix: resolve issue description"
# or
git commit -m "refactor: improve code structure"

# Push to feature branch
git push origin feature/branch-name
```

### 7. Pre-Merge Checklist

- [ ] All tests pass (`npm run test:reliable`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code is formatted (`npm run fmt`)
- [ ] Build succeeds (`npm run build`)
- [ ] No breaking changes to existing APIs
- [ ] Documentation updated as needed
- [ ] Performance benchmarks acceptable (if applicable)

### 8. Quality Standards

- **Test Coverage**: Maintain >90% coverage for new code
- **Performance**: <50ms input latency, 60fps scrolling for TUI
- **Accessibility**: Maintain WCAG 2.1 AA compliance
- **Memory Usage**: <50MB idle, efficient memory management

### 9. Special Considerations

- **TUI Changes**: Test across different terminal environments (WSL, Docker, CI)
- **AI Integration**: Verify Copilot authentication and API compatibility
- **MCP Integration**: Test tool-call bridge functionality
- **Patch System**: Verify Git operations work correctly

### 10. Verification Scripts

Run these diagnostic scripts to verify functionality:

```bash
npx tsx scripts/self-check.ts     # Self-diagnostics
npx tsx scripts/smoke.ts          # Smoke tests
npx tsx scripts/test-bridge.ts    # MCP bridge testing
```

## Failure Handling

If any step fails:

1. Fix the underlying issue
2. Re-run the failed step
3. Continue with remaining steps
4. Document any issues in commit message or merge request
