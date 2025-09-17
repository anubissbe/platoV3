# Implementation Roadmap: Claude Code Parity

## Quick Start Implementation Guide

This roadmap provides specific, actionable code changes to implement the FIXPLAN.md

---

## Day 1: Fix Critical Command Processing

### Task 1.1: Fix Command Interception in CLI Mode

**File**: `src/cli.ts`
**Line**: ~140 (in the CLI prompt loop)

```typescript
// CURRENT (broken):
const response = await provider.complete(session, prompt);

// FIXED:
import { processSlashCommand } from './commands/processor.js';

if (prompt.startsWith('/')) {
  const result = await processSlashCommand(prompt, session, provider);
  if (result.handled) {
    console.log(result.output);
    continue;
  }
}
const response = await provider.complete(session, prompt);
```

### Task 1.2: Create Command Processor

**New File**: `src/commands/processor.ts`

```typescript
import { SLASH_MAP } from '../slash/commands.js';
import * as handlers from './handlers/index.js';

export interface CommandResult {
  handled: boolean;
  output: string;
  error?: Error;
}

export async function processSlashCommand(
  input: string,
  session: any,
  provider: any
): Promise<CommandResult> {
  const [cmdName, ...args] = input.split(' ');
  const command = SLASH_MAP.get(cmdName);

  if (!command) {
    return {
      handled: false,
      output: `Unknown command: ${cmdName}`
    };
  }

  try {
    const handler = handlers[cmdName.slice(1)]; // Remove '/'
    if (!handler) {
      return {
        handled: true,
        output: `Command ${cmdName} not yet implemented`
      };
    }

    const result = await handler.execute(args, session, provider);
    return { handled: true, output: result };
  } catch (error) {
    return {
      handled: true,
      output: `Error: ${error.message}`,
      error
    };
  }
}
```

---

## Day 2: Implement Core File Commands

### Task 2.1: Create `/edit` Command

**New File**: `src/commands/handlers/edit.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import { diffLines } from 'diff';

export async function execute(args: string[]): Promise<string> {
  const [filePath, ...contentParts] = args;

  if (!filePath) {
    return 'Usage: /edit <file> [content]';
  }

  const fullPath = path.resolve(process.cwd(), filePath);

  try {
    // Check if file exists
    const exists = await fs.access(fullPath).then(() => true).catch(() => false);

    if (!exists) {
      return `File not found: ${filePath}`;
    }

    // Read current content
    const currentContent = await fs.readFile(fullPath, 'utf-8');

    // If no new content provided, show current content
    if (contentParts.length === 0) {
      return `Current content of ${filePath}:\n\`\`\`\n${currentContent}\n\`\`\``;
    }

    // Apply edit
    const newContent = contentParts.join(' ');
    await fs.writeFile(fullPath, newContent, 'utf-8');

    // Show diff
    const diff = diffLines(currentContent, newContent);
    let diffOutput = `Edited ${filePath}:\n`;

    diff.forEach(part => {
      const prefix = part.added ? '+' : part.removed ? '-' : ' ';
      diffOutput += prefix + part.value;
    });

    return diffOutput;
  } catch (error) {
    return `Error editing file: ${error.message}`;
  }
}
```

### Task 2.2: Create `/search` Command

**New File**: `src/commands/handlers/search.ts`

```typescript
import { glob } from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';

export async function execute(args: string[]): Promise<string> {
  const [pattern, ...options] = args;

  if (!pattern) {
    return 'Usage: /search <pattern> [--file-pattern=*.ts] [--max=10]';
  }

  const filePattern = options.find(o => o.startsWith('--file-pattern='))?.split('=')[1] || '**/*';
  const maxResults = parseInt(options.find(o => o.startsWith('--max='))?.split('=')[1] || '10');

  try {
    // Find files
    const files = await glob(filePattern, {
      ignore: ['node_modules/**', '.git/**'],
      cwd: process.cwd()
    });

    const results = [];
    const regex = new RegExp(pattern, 'gi');

    // Search in files
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (regex.test(line)) {
          results.push({
            file,
            line: index + 1,
            content: line.trim()
          });

          if (results.length >= maxResults) return;
        }
      });

      if (results.length >= maxResults) break;
    }

    // Format results
    if (results.length === 0) {
      return `No matches found for "${pattern}"`;
    }

    let output = `Found ${results.length} matches for "${pattern}":\n\n`;
    results.forEach(r => {
      output += `${r.file}:${r.line}\n  ${r.content}\n\n`;
    });

    return output;
  } catch (error) {
    return `Search error: ${error.message}`;
  }
}
```

---

## Day 3: Implement `/run` and `/test` Commands

### Task 3.1: Create `/run` Command

**New File**: `src/commands/handlers/run.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function execute(args: string[]): Promise<string> {
  const command = args.join(' ');

  if (!command) {
    return 'Usage: /run <command>';
  }

  // Safety check
  const dangerousCommands = ['rm -rf', 'format', 'del /f'];
  if (dangerousCommands.some(cmd => command.includes(cmd))) {
    return '⚠️ Dangerous command blocked for safety';
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    let output = '';
    if (stdout) output += `Output:\n${stdout}\n`;
    if (stderr) output += `Errors:\n${stderr}\n`;

    return output || 'Command completed with no output';
  } catch (error) {
    return `Command failed: ${error.message}`;
  }
}
```

### Task 3.2: Create `/test` Command

**New File**: `src/commands/handlers/test.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export async function execute(args: string[]): Promise<string> {
  const [testFile] = args;

  try {
    // Detect test runner
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    let testCommand = '';

    // Check for test script
    if (packageJson.scripts?.test) {
      testCommand = 'npm test';
    } else if (packageJson.devDependencies?.jest) {
      testCommand = 'npx jest';
    } else if (packageJson.devDependencies?.mocha) {
      testCommand = 'npx mocha';
    } else if (packageJson.devDependencies?.vitest) {
      testCommand = 'npx vitest run';
    } else {
      return 'No test runner detected. Install jest, mocha, or vitest.';
    }

    // Add specific test file if provided
    if (testFile) {
      testCommand += ` ${testFile}`;
    }

    const { stdout, stderr } = await execAsync(testCommand, {
      cwd: process.cwd(),
      timeout: 60000, // 1 minute timeout
      maxBuffer: 1024 * 1024 * 10
    });

    return `Test Results:\n${stdout}${stderr ? `\n\nWarnings:\n${stderr}` : ''}`;
  } catch (error) {
    return `Test execution failed: ${error.message}`;
  }
}
```

---

## Day 4: Fix `/help` and `/status` Commands

### Task 4.1: Fix `/help` Command

**New File**: `src/commands/handlers/help.ts`

```typescript
import { SLASH_COMMANDS } from '../../slash/commands.js';

export async function execute(args: string[]): Promise<string> {
  const [specific] = args;

  if (specific) {
    const cmd = SLASH_COMMANDS.find(c => c.name === `/${specific}` || c.name === specific);
    if (cmd) {
      return `${cmd.name}\n${cmd.summary}\n\nUsage: ${getUsage(cmd.name)}`;
    }
    return `Command not found: ${specific}`;
  }

  // Group commands by category
  const categories = {
    'File Operations': ['/edit', '/search', '/browse'],
    'Execution': ['/run', '/test'],
    'Version Control': ['/git'],
    'System': ['/help', '/status', '/doctor', '/model'],
    'Session': ['/memory', '/resume', '/export'],
    'Configuration': ['/permissions', '/settings', '/output-style'],
    'MCP': ['/mcp', '/agents'],
    'Authentication': ['/login', '/logout'],
    'Other': []
  };

  // Categorize commands
  const categorized = new Set();
  SLASH_COMMANDS.forEach(cmd => {
    let added = false;
    for (const [category, cmds] of Object.entries(categories)) {
      if (cmds.includes(cmd.name)) {
        categorized.add(cmd.name);
        added = true;
        break;
      }
    }
    if (!added && cmd.name) {
      categories.Other.push(cmd.name);
      categorized.add(cmd.name);
    }
  });

  // Build output
  let output = '📚 **Available Commands**\n\n';

  for (const [category, cmds] of Object.entries(categories)) {
    if (cmds.length === 0) continue;

    output += `**${category}**\n`;
    cmds.forEach(cmdName => {
      const cmd = SLASH_COMMANDS.find(c => c.name === cmdName);
      if (cmd) {
        output += `  ${cmd.name.padEnd(20)} - ${cmd.summary}\n`;
      }
    });
    output += '\n';
  }

  output += '\nUse `/help <command>` for detailed information about a specific command.';

  return output;
}

function getUsage(command: string): string {
  const usages = {
    '/edit': '/edit <file> [new content]',
    '/search': '/search <pattern> [--file-pattern=*.ts] [--max=10]',
    '/run': '/run <command>',
    '/test': '/test [test-file]',
    '/git': '/git <operation> [args]',
    '/model': '/model [list|set <model>]',
    '/mcp': '/mcp [attach|detach|list|tools] [args]'
  };

  return usages[command] || command;
}
```

### Task 4.2: Fix `/status` Command

**New File**: `src/commands/handlers/status.ts`

```typescript
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from '../../config/index.js';

export async function execute(args: string[]): Promise<string> {
  const config = loadConfig();

  // Gather status information
  const status = {
    system: {
      platform: process.platform,
      node: process.version,
      memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB`,
      uptime: formatUptime(process.uptime())
    },
    authentication: {
      provider: config.provider || 'copilot',
      authenticated: !!config.githubToken,
      model: config.model || 'default'
    },
    session: {
      workingDir: process.cwd(),
      sessionFile: await checkFile('.plato/session.json'),
      memoryDir: await checkFile('.plato/memory/'),
      configFile: await checkFile('.plato/config.json')
    },
    mcp: {
      servers: await getMcpServers(),
      connected: 0
    }
  };

  // Format output
  let output = '📊 **Plato Status**\n\n';

  output += '**System**\n';
  output += `  Platform: ${status.system.platform}\n`;
  output += `  Node: ${status.system.node}\n`;
  output += `  Memory: ${status.system.memory}\n`;
  output += `  Uptime: ${status.system.uptime}\n\n`;

  output += '**Authentication**\n';
  output += `  Provider: ${status.authentication.provider}\n`;
  output += `  Status: ${status.authentication.authenticated ? '✅ Authenticated' : '❌ Not authenticated'}\n`;
  output += `  Model: ${status.authentication.model}\n\n`;

  output += '**Session**\n';
  output += `  Working Dir: ${status.session.workingDir}\n`;
  output += `  Session: ${status.session.sessionFile ? '✅' : '❌'} .plato/session.json\n`;
  output += `  Memory: ${status.session.memoryDir ? '✅' : '❌'} .plato/memory/\n`;
  output += `  Config: ${status.session.configFile ? '✅' : '❌'} .plato/config.json\n\n`;

  output += '**MCP Servers**\n';
  if (status.mcp.servers.length === 0) {
    output += '  No servers attached\n';
  } else {
    status.mcp.servers.forEach(server => {
      output += `  ${server.name}: ${server.url} (${server.status})\n`;
    });
  }

  return output;
}

async function checkFile(filepath: string): Promise<boolean> {
  try {
    await fs.access(path.join(process.cwd(), filepath));
    return true;
  } catch {
    return false;
  }
}

async function getMcpServers(): Promise<any[]> {
  try {
    const serversFile = path.join(process.cwd(), '.plato/mcp-servers.json');
    const data = await fs.readFile(serversFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}
```

---

## Day 5: Implement Direct File System Access

### Task 5.1: Create File System Abstraction

**New File**: `src/tools/filesystem.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

export class FileSystem {
  private basePath: string;
  private permissions: Map<string, boolean>;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
    this.permissions = new Map();
  }

  async read(filepath: string): Promise<string> {
    const fullPath = this.resolvePath(filepath);
    await this.checkPermission(fullPath, 'read');
    return fs.readFile(fullPath, 'utf-8');
  }

  async write(filepath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filepath);
    await this.checkPermission(fullPath, 'write');

    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async append(filepath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filepath);
    await this.checkPermission(fullPath, 'write');
    await fs.appendFile(fullPath, content, 'utf-8');
  }

  async delete(filepath: string): Promise<void> {
    const fullPath = this.resolvePath(filepath);
    await this.checkPermission(fullPath, 'delete');
    await fs.unlink(fullPath);
  }

  async exists(filepath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filepath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async list(dirpath: string): Promise<string[]> {
    const fullPath = this.resolvePath(dirpath);
    await this.checkPermission(fullPath, 'read');
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    return entries.map(entry => {
      const prefix = entry.isDirectory() ? '[DIR] ' : '[FILE]';
      return `${prefix} ${entry.name}`;
    });
  }

  async copy(source: string, dest: string): Promise<void> {
    const sourcePath = this.resolvePath(source);
    const destPath = this.resolvePath(dest);

    await this.checkPermission(sourcePath, 'read');
    await this.checkPermission(destPath, 'write');

    const sourceStream = createReadStream(sourcePath);
    const destStream = createWriteStream(destPath);
    await pipeline(sourceStream, destStream);
  }

  async move(source: string, dest: string): Promise<void> {
    const sourcePath = this.resolvePath(source);
    const destPath = this.resolvePath(dest);

    await this.checkPermission(sourcePath, 'delete');
    await this.checkPermission(destPath, 'write');

    await fs.rename(sourcePath, destPath);
  }

  async getStats(filepath: string): Promise<any> {
    const fullPath = this.resolvePath(filepath);
    const stats = await fs.stat(fullPath);

    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      permissions: stats.mode
    };
  }

  private resolvePath(filepath: string): string {
    // Prevent path traversal attacks
    const resolved = path.resolve(this.basePath, filepath);
    if (!resolved.startsWith(this.basePath)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  private async checkPermission(filepath: string, operation: string): Promise<void> {
    // Check if path is in allowed directories
    const allowedDirs = [this.basePath];
    const isAllowed = allowedDirs.some(dir => filepath.startsWith(dir));

    if (!isAllowed) {
      throw new Error(`Permission denied: ${operation} on ${filepath}`);
    }

    // Additional permission checks can be added here
    // For example, checking against a permission configuration file
  }
}

// Export singleton instance
export const fileSystem = new FileSystem();
```

---

## Day 6: Add Command Autocomplete

### Task 6.1: Create Autocomplete Component

**New File**: `src/tui/components/Autocomplete.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { SLASH_COMMANDS } from '../../slash/commands.js';

interface AutocompleteProps {
  input: string;
  onSelect: (command: string) => void;
}

export function Autocomplete({ input, onSelect }: AutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!input.startsWith('/')) {
      setSuggestions([]);
      return;
    }

    const search = input.toLowerCase();
    const matches = SLASH_COMMANDS
      .filter(cmd => cmd.name.toLowerCase().startsWith(search))
      .map(cmd => cmd.name)
      .slice(0, 5);

    setSuggestions(matches);
    setSelectedIndex(0);
  }, [input]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {suggestions.map((suggestion, index) => (
        <Box key={suggestion}>
          <Text color={index === selectedIndex ? 'green' : 'gray'}>
            {index === selectedIndex ? '▶ ' : '  '}
            {suggestion}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

---

## Day 7: Create Handler Index

### Task 7.1: Create Command Handler Index

**New File**: `src/commands/handlers/index.ts`

```typescript
// Import all command handlers
import * as help from './help.js';
import * as status from './status.js';
import * as edit from './edit.js';
import * as search from './search.js';
import * as run from './run.js';
import * as test from './test.js';
import * as model from './model.js';
import * as mcp from './mcp.js';
import * as memory from './memory.js';
import * as doctor from './doctor.js';
import * as git from './git.js';
import * as browse from './browse.js';
import * as login from './login.js';
import * as logout from './logout.js';

// Export all handlers
export {
  help,
  status,
  edit,
  search,
  run,
  test,
  model,
  mcp,
  memory,
  doctor,
  git,
  browse,
  login,
  logout
};

// Add more as implemented...
```

---

## Testing Strategy

### Unit Tests for Each Command

**File**: `src/__tests__/commands/edit.test.ts`

```typescript
import { execute } from '../../commands/handlers/edit';
import fs from 'fs/promises';

jest.mock('fs/promises');

describe('/edit command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should show usage when no arguments', async () => {
    const result = await execute([]);
    expect(result).toContain('Usage: /edit');
  });

  test('should read file when no content provided', async () => {
    (fs.readFile as jest.Mock).mockResolvedValue('file content');
    (fs.access as jest.Mock).mockResolvedValue(undefined);

    const result = await execute(['test.txt']);
    expect(result).toContain('file content');
  });

  test('should write new content to file', async () => {
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockResolvedValue('old content');
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

    const result = await execute(['test.txt', 'new', 'content']);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test.txt'),
      'new content',
      'utf-8'
    );
  });
});
```

---

## Integration Points

### Update Package.json Scripts

```json
{
  "scripts": {
    "test:commands": "jest src/__tests__/commands",
    "build:commands": "tsc --module esnext --outDir dist/commands src/commands/**/*.ts",
    "dev:commands": "tsx watch src/commands/test-runner.ts"
  }
}
```

### Update tsconfig.json

```json
{
  "compilerOptions": {
    "paths": {
      "@commands/*": ["src/commands/*"],
      "@tools/*": ["src/tools/*"],
      "@tui/*": ["src/tui/*"]
    }
  }
}
```

---

## Deployment Checklist

### Before Each Phase
- [ ] Run existing tests to ensure no regression
- [ ] Create feature branch for changes
- [ ] Document new commands in README
- [ ] Update CLAUDE.md with new capabilities

### After Each Phase
- [ ] Run full test suite
- [ ] Test all commands manually
- [ ] Update documentation
- [ ] Create PR with detailed description
- [ ] Get code review
- [ ] Merge to main

---

## Success Validation

### Command Testing Script

**File**: `scripts/test-all-commands.js`

```javascript
#!/usr/bin/env node

const commands = [
  { cmd: '/help', expected: 'Available Commands' },
  { cmd: '/status', expected: 'Plato Status' },
  { cmd: '/edit test.txt', expected: 'content' },
  { cmd: '/search TODO', expected: 'matches' },
  { cmd: '/run echo hello', expected: 'hello' },
  { cmd: '/test', expected: 'Test Results' }
];

async function testCommand(command) {
  // Implementation to test each command
  console.log(`Testing ${command.cmd}...`);
  // Run command and check output
}

async function runTests() {
  for (const cmd of commands) {
    await testCommand(cmd);
  }
}

runTests();
```

---

This implementation roadmap provides specific, actionable code that can be implemented immediately to achieve Claude Code parity. Each task is self-contained and can be completed independently, allowing for parallel development.