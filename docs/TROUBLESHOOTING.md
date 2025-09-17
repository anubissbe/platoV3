# Troubleshooting Guide

Comprehensive troubleshooting guide for Plato TUI issues, errors, and common problems.

## 🚨 Quick Diagnostics

### First Steps

When experiencing issues, always start with these diagnostic commands:

```bash
# Check system health
/doctor

# Verify current status
/status

# Check debug logs
/debug logs

# Test basic functionality
/help
```

## 🔧 Common Issues

### Authentication Problems

#### Issue: Cannot Login / Authentication Fails

**Symptoms:**
- `/login` command fails
- "Authentication failed" errors
- "Invalid credentials" messages

**Solutions:**

1. **Clear existing credentials:**
   ```bash
   /logout
   rm -rf ~/.config/plato/credentials.json
   /login
   ```

2. **Check network connectivity:**
   ```bash
   curl -f https://api.github.com
   curl -f https://gitlab.com/api/v4/user
   ```

3. **Verify system time:**
   ```bash
   # Ensure system time is synchronized
   sudo timedatectl set-ntp true
   ```

4. **Debug authentication flow:**
   ```bash
   DEBUG=plato:auth npm run dev
   ```

#### Issue: Token Expired / Invalid

**Symptoms:**
- "Token expired" errors
- Intermittent authentication failures
- API calls return 401 errors

**Solutions:**

1. **Refresh credentials:**
   ```bash
   /logout
   /login
   ```

2. **Check token validity:**
   ```bash
   # For Copilot tokens
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://api.githubcopilot.com/user

   # For GitLab tokens
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://gitlab.com/api/v4/user
   ```

### Command Issues

#### Issue: Commands Not Recognized

**Symptoms:**
- Commands are sent to AI instead of being executed
- "Command not found" errors
- Slash commands don't work

**Solutions:**

1. **Verify command router:**
   ```bash
   # Check if router is working
   /help

   # If help doesn't work, router may be broken
   npm run build
   npm run dev
   ```

2. **Check command registration:**
   ```bash
   # Verify command exists
   grep -n "name.*your-command" src/slash/commands.ts
   ```

3. **Debug command parsing:**
   ```bash
   DEBUG=plato:commands npm run dev
   ```

#### Issue: Command Execution Fails

**Symptoms:**
- Commands are recognized but fail to execute
- "Command failed" errors
- Partial execution or hanging

**Solutions:**

1. **Check command implementation:**
   ```bash
   # Look for execute handler
   grep -A 10 "name.*your-command" src/slash/commands.ts
   ```

2. **Check permissions:**
   ```bash
   /permissions
   /permissions review
   ```

3. **Run with debug logging:**
   ```bash
   DEBUG=plato:* npm run dev
   ```

### File Operation Issues

#### Issue: Cannot Edit Files

**Symptoms:**
- `/edit` commands fail
- "Permission denied" errors
- Files not being modified

**Solutions:**

1. **Check file permissions:**
   ```bash
   ls -la target-file.js
   chmod 644 target-file.js  # If needed
   ```

2. **Verify Git repository:**
   ```bash
   git status
   # If not in git repo:
   git init
   ```

3. **Test with simple file:**
   ```bash
   touch test.txt
   /edit test.txt
   ```

#### Issue: Search Not Working

**Symptoms:**
- `/search` returns no results
- Search hangs or times out
- Pattern matching fails

**Solutions:**

1. **Test basic search:**
   ```bash
   /search console.log
   ```

2. **Check file patterns:**
   ```bash
   # Don't use quotes in patterns
   /search import        # ✅ Correct
   /search "import"      # ❌ May not work
   ```

3. **Verify file access:**
   ```bash
   /browse
   ls -la
   ```

### Memory and Performance Issues

#### Issue: High Memory Usage

**Symptoms:**
- Slow response times
- System becoming unresponsive
- Out of memory errors

**Solutions:**

1. **Check memory usage:**
   ```bash
   /context
   top -p $(pgrep node)
   ```

2. **Compact conversation history:**
   ```bash
   /compact
   /memory clear
   ```

3. **Restart with memory limits:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=2048" npm run dev
   ```

#### Issue: Slow Performance

**Symptoms:**
- Commands take long to execute
- TUI updates are laggy
- High CPU usage

**Solutions:**

1. **Check performance metrics:**
   ```bash
   /debug performance
   npm run perf:benchmark
   ```

2. **Disable unnecessary features:**
   ```bash
   /mouse off
   /debug off
   ```

3. **Clear caches:**
   ```bash
   rm -rf .plato/cache
   rm -rf node_modules/.cache
   ```

### MCP Integration Issues

#### Issue: MCP Server Connection Fails

**Symptoms:**
- Cannot connect to MCP servers
- "Server unreachable" errors
- Tool calls timeout

**Solutions:**

1. **Test server connectivity:**
   ```bash
   curl -f http://localhost:8719/health
   ```

2. **Check server status:**
   ```bash
   /mcp list
   /mcp test server-name
   ```

3. **Debug MCP bridge:**
   ```bash
   DEBUG=plato:mcp npm run dev
   ```

4. **Restart MCP server:**
   ```bash
   # Start mock server for testing
   npx tsx scripts/mock-mcp.ts
   ```

#### Issue: Tools Not Working

**Symptoms:**
- Tool calls fail or timeout
- "Tool not found" errors
- Permission denied for tools

**Solutions:**

1. **List available tools:**
   ```bash
   /mcp tools
   ```

2. **Check tool permissions:**
   ```bash
   /permissions
   /permissions default tool_name allow
   ```

3. **Test individual tools:**
   ```bash
   # In AI conversation, test with simple tool call:
   { "tool_call": { "server": "test", "name": "echo", "input": {"message": "hello"} } }
   ```

### TUI Display Issues

#### Issue: Display Corruption

**Symptoms:**
- Text appears garbled
- Layout is broken
- Colors are wrong

**Solutions:**

1. **Reset terminal:**
   ```bash
   reset
   clear
   npm run dev
   ```

2. **Check terminal capabilities:**
   ```bash
   /terminal-setup
   echo $TERM
   ```

3. **Force compatible mode:**
   ```bash
   PLATO_STATIC_TUI=1 npm run dev
   ```

#### Issue: Mouse Support Problems

**Symptoms:**
- Mouse clicks don't work
- Copy/paste issues
- Selection problems

**Solutions:**

1. **Toggle mouse mode:**
   ```bash
   /mouse toggle
   /mouse off
   /mouse on
   ```

2. **Use paste mode:**
   ```bash
   /paste 10  # Disable input for 10 seconds
   ```

3. **Check terminal mouse support:**
   ```bash
   # Test if terminal supports mouse
   printf '\033[?1000h'  # Enable mouse
   printf '\033[?1000l'  # Disable mouse
   ```

### Configuration Issues

#### Issue: Settings Not Persisted

**Symptoms:**
- Configuration resets on restart
- Settings changes don't take effect
- "Cannot save config" errors

**Solutions:**

1. **Check config directory permissions:**
   ```bash
   ls -la ~/.config/plato/
   mkdir -p ~/.config/plato/
   chmod 755 ~/.config/plato/
   ```

2. **Verify config file:**
   ```bash
   cat ~/.config/plato/config.json
   ```

3. **Reset configuration:**
   ```bash
   rm -rf ~/.config/plato/
   rm -rf .plato/
   npm run dev
   ```

## 🐛 Error Messages

### Common Error Codes

#### `ENOENT: no such file or directory`

**Cause:** File or directory doesn't exist

**Solution:**
```bash
# Check if file exists
ls -la path/to/file
# Create directory if needed
mkdir -p path/to/directory
```

#### `EACCES: permission denied`

**Cause:** Insufficient file permissions

**Solution:**
```bash
# Fix file permissions
chmod 644 filename
# Fix directory permissions
chmod 755 dirname
```

#### `EADDRINUSE: address already in use`

**Cause:** Port is already occupied

**Solution:**
```bash
# Find process using port
lsof -i :3000
# Kill process if needed
kill -9 PID
```

#### `MODULE_NOT_FOUND`

**Cause:** Missing dependencies

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors

#### `Cannot find module` errors

**Solution:**
```bash
# Clean build and reinstall
npm run clean
npm install
npm run build
```

#### `Type errors` in development

**Solution:**
```bash
# Check types
npm run typecheck
# Fix imports
npm run lint --fix
```

## 🔍 Debugging Tools

### Debug Modes

Enable different debug levels:

```bash
# All debug information
DEBUG=plato:* npm run dev

# Specific categories
DEBUG=plato:commands npm run dev      # Command execution
DEBUG=plato:auth npm run dev          # Authentication
DEBUG=plato:mcp npm run dev           # MCP integration
DEBUG=plato:memory npm run dev        # Memory management
DEBUG=plato:tui npm run dev           # TUI rendering
```

### Performance Profiling

```bash
# CPU profiling
npx clinic doctor -- node dist/cli.js

# Memory profiling
npx clinic heapprofiler -- node dist/cli.js

# Flame graph
npx clinic flame -- node dist/cli.js
```

### Log Analysis

```bash
# View application logs
tail -f ~/.plato/logs/application.log

# Filter for errors
grep ERROR ~/.plato/logs/application.log

# Filter for specific component
grep "MCP" ~/.plato/logs/application.log
```

## 🧪 Testing and Validation

### Test Your Fix

After implementing a solution:

```bash
# Run comprehensive tests
npm run test:comprehensive

# Specific test categories
npm run test:unit
npm run test:integration
npm run test:e2e

# Performance validation
npm run perf:benchmark

# Security check
npm audit
```

### Smoke Tests

Quick validation tests:

```bash
# Basic functionality
npx tsx scripts/smoke.ts

# MCP integration
npx tsx scripts/test-bridge.ts

# Self-check diagnostics
npx tsx scripts/self-check.ts
```

## 📊 System Information

### Gather Diagnostic Information

When reporting issues, include this information:

```bash
# System info
node --version
npm --version
git --version
echo $TERM
uname -a

# Plato status
/status
/doctor

# Configuration
cat ~/.config/plato/config.json

# Recent logs
tail -50 ~/.plato/logs/application.log
```

### Environment Check

```bash
# Check environment variables
env | grep PLATO

# Check file permissions
ls -la ~/.config/plato/
ls -la .plato/

# Check network connectivity
curl -f https://api.github.com/user
ping -c 3 github.com
```

## 🆘 Getting Help

### Self-Help Resources

1. **Built-in diagnostics:**
   ```bash
   /doctor          # System health check
   /debug status    # Debug information
   /help            # Command reference
   ```

2. **Documentation:**
   - [User Guide](./USER_GUIDE.md)
   - [Developer Documentation](./DEVELOPER.md)
   - [API Reference](./API_REFERENCE.md)

3. **Testing tools:**
   ```bash
   npm run test:watch    # Interactive testing
   npx tsx scripts/      # Diagnostic scripts
   ```

### Bug Reporting

Use the built-in bug reporting:

```bash
/bug report "Describe your issue here"
```

Or create a detailed issue with:

1. **Problem description**
2. **Steps to reproduce**
3. **Expected vs actual behavior**
4. **System information** (see above)
5. **Diagnostic logs**
6. **Configuration files**

### Emergency Recovery

If Plato is completely broken:

```bash
# Nuclear option - complete reset
rm -rf ~/.config/plato/
rm -rf .plato/
rm -rf node_modules/
npm install
npm run build
npm run dev
```

## 📋 FAQ

### Q: Why is my command going to AI instead of executing?

**A:** The command router isn't intercepting it. Check if the command starts with `/` and is registered in `src/slash/commands.ts`.

### Q: Why can't I edit files?

**A:** Check file permissions and ensure you're in a Git repository. Run `git init` if needed.

### Q: Why is performance so slow?

**A:** Try `/compact` to reduce memory usage, disable debug mode with `/debug off`, and check CPU usage.

### Q: Why won't MCP servers connect?

**A:** Verify the server is running, check the URL, and test connectivity with `curl`.

### Q: Why do I get authentication errors?

**A:** Clear credentials with `/logout` and re-authenticate with `/login`.

---

**Remember:** When in doubt, try `/doctor` first - it catches many common issues automatically!