# Troubleshooting Guide

Comprehensive solutions for common issues encountered while using Plato.

## 🔧 Quick Diagnostics

### Health Check
Run the built-in diagnostics first:
```bash
npm run dev
# Then in Plato:
/doctor
```

The `/doctor` command checks:
- ✅ Node.js version compatibility
- ✅ Dependencies installation
- ✅ Terminal capabilities
- ✅ Authentication status
- ✅ Performance metrics
- ✅ File permissions

## 🚨 Common Issues

### 1. Application Won't Start

#### Symptoms
- `npm run dev` fails with errors
- Terminal shows compilation errors
- Application exits immediately

#### Solutions

**Check Node.js Version**:
```bash
node --version  # Should be 18.0 or higher
npm --version   # Should be 8.0 or higher
```

**Clean Installation**:
```bash
rm -rf node_modules package-lock.json
npm ci
npm run build
npm run dev
```

**Permission Issues**:
```bash
# Linux/macOS
chmod +x ./bin/plato
sudo chown -R $USER:$USER .

# Windows (PowerShell as Administrator)
icacls . /reset /t
```

**TypeScript Compilation Errors**:
```bash
npm run typecheck  # Check for type errors
npm run lint       # Check for linting issues
npm run fmt        # Auto-fix formatting
```

### 2. Authentication Problems

#### Symptoms
- Cannot login to Copilot
- "Authentication failed" messages
- Expired token errors

#### Solutions

**Copilot Authentication**:
```bash
# In Plato TUI:
/logout
/login
# Follow device flow instructions
```

**Clear Cached Credentials**:
```bash
# Remove stored credentials
rm -rf ~/.config/plato/credentials.json
rm -rf .plato/session.json

# Or use the command:
/logout --clear-cache
```

**Check Network Connectivity**:
```bash
# Test GitHub API access
curl -I https://api.github.com
# Test Copilot endpoint
curl -I https://copilot-proxy.githubusercontent.com
```

**Firewall/Proxy Issues**:
```bash
# Set proxy if needed
export HTTPS_PROXY=http://proxy.company.com:8080
export HTTP_PROXY=http://proxy.company.com:8080

# Or in Plato config:
/config set proxy.https "http://proxy.company.com:8080"
```

### 3. Terminal Display Issues

#### Symptoms
- Broken characters or formatting
- Colors not displaying correctly
- Layout appears corrupted

#### Solutions

**Terminal Compatibility**:
```bash
echo $TERM          # Check terminal type
echo $COLORTERM     # Check color support

# Recommended terminal settings:
export TERM=xterm-256color
export COLORTERM=truecolor
```

**Font Issues**:
- Ensure terminal uses a monospace font
- Install a modern terminal font (JetBrains Mono, Fira Code, etc.)
- Set font size between 12-16pt for optimal display

**Terminal Size**:
```bash
# Minimum recommended: 80x24
tput cols  # Should be >= 80
tput lines # Should be >= 24

# Resize if needed
resize
```

**Windows Terminal Specific**:
```json
// In Windows Terminal settings.json
{
  "profiles": {
    "defaults": {
      "fontFace": "Cascadia Code",
      "fontSize": 12,
      "colorScheme": "Campbell"
    }
  }
}
```

### 4. Performance Issues

#### Symptoms
- Slow response times
- High CPU usage
- Memory consumption warnings
- Laggy scrolling

#### Solutions

**Memory Optimization**:
```bash
# In Plato:
/compact         # Compress conversation history
/memory clear    # Clear old memory data
/config set memory.maxSize 100  # Limit memory size (MB)
```

**Performance Monitoring**:
```bash
# Check system resources
htop  # Linux/macOS
tasklist  # Windows

# In Plato:
/status          # Show current performance
/benchmark       # Run performance tests
```

**Node.js Optimization**:
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Enable V8 optimizations
export NODE_OPTIONS="--optimize-for-size"
```

**Large Conversation Handling**:
```bash
# In Plato:
/memory save conversation-backup  # Backup before cleanup
/compact --aggressive            # Aggressive compression
/session new                     # Start fresh session
```

### 5. Mouse and Scrolling Issues

#### Symptoms
- Mouse wheel doesn't work
- Cannot select text
- Scrolling is choppy

#### Solutions

**Enable Mouse Support**:
```bash
# In Plato:
/mouse on
/config set mouse.enabled true
```

**Terminal Mouse Support**:
```bash
# Check if terminal supports mouse
echo -e "\e[?1000h"  # Enable mouse reporting
# Move mouse and see if it generates output
echo -e "\e[?1000l"  # Disable mouse reporting
```

**WSL Mouse Issues**:
```bash
# In WSL, ensure Windows Terminal is updated
# Enable mouse in WSL terminal:
echo 'set mouse=a' >> ~/.vimrc  # For vim users
```

**Smooth Scrolling**:
```bash
# In Plato:
/config set scroll.smooth true
/config set scroll.sensitivity 3
```

### 6. MCP Tool Integration Issues

#### Symptoms
- Tools not responding
- "Server unavailable" errors
- Tool commands timing out

#### Solutions

**Check MCP Server Status**:
```bash
# In Plato:
/mcp status
/mcp list
```

**Restart MCP Servers**:
```bash
# In Plato:
/mcp detach <server-name>
/mcp attach <server-name> <url>
```

**Network Connectivity**:
```bash
# Test MCP server connectivity
curl -f http://localhost:8080/health  # Replace with your MCP server URL
telnet localhost 8080  # Test port connectivity
```

**Tool Permissions**:
```bash
# In Plato:
/permissions list
/permissions default fs_patch allow
/permissions default exec allow
```

### 7. Session and Memory Issues

#### Symptoms
- Sessions won't save/load
- Memory data corrupted
- "Cannot restore session" errors

#### Solutions

**Session Recovery**:
```bash
# Check session files
ls -la .plato/
cat .plato/session.json  # Verify session format

# Manual session cleanup
rm .plato/session.json
/session new
```

**Memory Directory Issues**:
```bash
# Fix memory directory permissions
chmod -R 755 .plato/memory/
chown -R $USER:$USER .plato/

# Rebuild memory index
/memory rebuild
```

**Corrupted Memory Data**:
```bash
# Backup and reset memory
mv .plato/memory .plato/memory.backup
mkdir .plato/memory
/memory init
```

## 🔍 Advanced Diagnostics

### Debug Mode
```bash
# Enable debug logging
DEBUG=plato:* npm run dev

# Or within Plato:
/config set debug.enabled true
/config set debug.level verbose
```

### Log Analysis
```bash
# Check log files
tail -f .plato/logs/plato.log
grep -E "(ERROR|WARN)" .plato/logs/plato.log

# System logs (Linux)
journalctl -u plato --follow
```

### Network Debugging
```bash
# Monitor network traffic
netstat -an | grep :8080  # Check MCP server ports
lsof -i :8080             # Check port usage

# DNS resolution
nslookup api.github.com
dig copilot-proxy.githubusercontent.com
```

### Performance Profiling
```bash
# Node.js profiling
node --prof npm run dev
node --prof-process isolate-*.log > profile.txt

# Memory usage
node --inspect npm run dev
# Open chrome://inspect in Chrome
```

## 🏥 Emergency Recovery

### Complete Reset
```bash
# Backup important data
cp -r .plato .plato.backup

# Reset everything
rm -rf .plato/
rm -rf node_modules/
npm ci
npm run build
npm run dev
```

### Factory Defaults
```bash
# In Plato:
/reset --factory
# Confirm: yes

# Or manually:
rm -rf ~/.config/plato/
rm -rf .plato/
```

### Data Recovery
```bash
# Restore from backup
cp -r .plato.backup/* .plato/

# Partial recovery
cp .plato.backup/memory/* .plato/memory/
cp .plato.backup/session.json .plato/
```

## 📱 Platform-Specific Issues

### Windows Issues
- **Antivirus blocking**: Add Plato directory to exclusions
- **PowerShell execution policy**: `Set-ExecutionPolicy RemoteSigned`
- **Path issues**: Use full paths, avoid spaces in directory names

### macOS Issues
- **Gatekeeper warnings**: `xattr -d com.apple.quarantine plato`
- **Terminal permissions**: Grant terminal full disk access in Security & Privacy
- **Homebrew conflicts**: Use `npx` instead of global npm install

### Linux Issues
- **Package manager conflicts**: Use Node Version Manager (nvm)
- **Permission denied**: Check file ownership and execute permissions
- **Display issues**: Ensure X11 forwarding for SSH sessions

### WSL Issues
- **Slow file I/O**: Store project in WSL filesystem, not Windows mount
- **Network access**: Configure WSL networking for MCP servers
- **Terminal compatibility**: Use Windows Terminal or WSL2

## 🆘 Getting Help

### Self-Help Resources
1. **Built-in Help**: `/help <topic>`
2. **Documentation**: Check `docs/` directory
3. **Configuration**: `/config list` to see all settings

### Reporting Issues
When reporting bugs, include:
```bash
# System information
/doctor > system-info.txt

# Configuration
/config export > config.txt

# Recent logs
tail -n 100 .plato/logs/plato.log > recent-logs.txt
```

### Community Support
- **Issue Tracker**: Report bugs and feature requests
- **Wiki**: Community-maintained documentation
- **Discussions**: Ask questions and share tips

---

*Last updated: 2025-09-11*  
*For immediate help, run `/doctor` or `/help troubleshooting`*