#!/usr/bin/env node

/**
 * Script to capture Plato TUI output for visualization
 * This creates a simulated environment to show the TUI interface
 */

import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import path from 'path';

// Run Plato with specific environment variables to capture output
const env = {
  ...process.env,
  PLATO_QUIET_TUI: '0',
  PLATO_STATIC_TUI: '1',
  TERM: 'xterm-256color',
  COLUMNS: '80',
  LINES: '24',
};

// Create a log file to capture output
const logFile = createWriteStream('plato-tui-output.log');

console.log('Starting Plato TUI capture...\n');
console.log('Environment settings:');
console.log('- Terminal: xterm-256color');
console.log('- Columns: 80');
console.log('- Lines: 24\n');

// Spawn the Plato process
const plato = spawn('npm', ['run', 'dev'], {
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Capture stdout
plato.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);
  logFile.write(output);
});

// Capture stderr
plato.stderr.on('data', (data) => {
  const output = data.toString();
  process.stderr.write(output);
  logFile.write(output);
});

// Send initial commands after a delay
setTimeout(() => {
  console.log('\n--- Sending /help command ---\n');
  plato.stdin.write('/help\n');

  setTimeout(() => {
    console.log('\n--- Sending /status command ---\n');
    plato.stdin.write('/status\n');

    setTimeout(() => {
      console.log('\n--- Sending exit command ---\n');
      plato.stdin.write('\x03'); // Ctrl+C

      setTimeout(() => {
        process.exit(0);
      }, 1000);
    }, 2000);
  }, 2000);
}, 2000);

plato.on('close', (code) => {
  console.log(`\nPlato exited with code ${code}`);
  logFile.end();
});