#!/usr/bin/env node

/**
 * Interactive Plato runner using node-pty
 * This creates a pseudo-terminal to run Plato and interact with it
 */

import pty from 'node-pty';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a pseudo-terminal
const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

console.log('Starting Plato in interactive mode...\n');

// Create PTY process
const ptyProcess = pty.spawn('npm', ['run', 'dev'], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    PLATO_FORCE_TUI: 'true',
    PLATO_STATIC_TUI: '1',
    TERM: 'xterm-256color',
  },
});

// Capture output
let output = '';
const outputFile = path.join(__dirname, '..', 'plato-session.log');

ptyProcess.onData((data) => {
  output += data;
  process.stdout.write(data);

  // Save to file
  fs.appendFile(outputFile, data).catch(console.error);
});

// Handle exit
ptyProcess.onExit(({ exitCode, signal }) => {
  console.log(`\nPlato exited with code ${exitCode} and signal ${signal}`);
  process.exit(exitCode);
});

// Function to send commands
const sendCommand = (command) => {
  console.log(`\n>>> Sending: ${command}`);
  ptyProcess.write(command + '\r');
};

// Function to take a snapshot
const takeSnapshot = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotFile = path.join(__dirname, '..', `plato-snapshot-${timestamp}.txt`);
  await fs.writeFile(snapshotFile, output);
  console.log(`\n>>> Snapshot saved to ${snapshotFile}`);
  return snapshotFile;
};

// Interactive command sequence
setTimeout(() => {
  console.log('\n>>> Waiting for TUI to load...');

  setTimeout(async () => {
    // Send /help command
    sendCommand('/help');

    setTimeout(async () => {
      // Take a snapshot
      const snapshot1 = await takeSnapshot();

      // Send /status command
      sendCommand('/status');

      setTimeout(async () => {
        // Take another snapshot
        const snapshot2 = await takeSnapshot();

        // Send a test message
        sendCommand('What is React?');

        setTimeout(async () => {
          // Take final snapshot
          const snapshot3 = await takeSnapshot();

          // Exit
          console.log('\n>>> Sending exit signal...');
          ptyProcess.kill();
        }, 5000);
      }, 3000);
    }, 3000);
  }, 3000);
}, 2000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n>>> Interrupted, killing PTY process...');
  ptyProcess.kill();
  process.exit(0);
});

console.log('PTY process started. Waiting for commands...');