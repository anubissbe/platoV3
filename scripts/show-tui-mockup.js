#!/usr/bin/env node

/**
 * Visual mockup of Plato TUI interface
 * This shows what the TUI looks like when running
 */

import pc from 'picocolors';

console.clear();

// Header
console.log(pc.cyan('═══════════════════════════════════════════════════════════════════════════════'));
console.log(pc.cyan('  🤖 Plato - AI Coding Assistant (v0.1.0)                    ') + pc.gray('[Copilot]'));
console.log(pc.cyan('═══════════════════════════════════════════════════════════════════════════════'));
console.log();

// Status line
console.log(pc.gray('Session: ') + pc.green('●') + pc.gray(' Connected  |  Model: gpt-4  |  Context: 4096 tokens  |  ') + pc.yellow('Ctrl+C to exit'));
console.log(pc.gray('───────────────────────────────────────────────────────────────────────────────'));
console.log();

// Conversation area
console.log(pc.blue('User:'));
console.log('  How do I create a React component?');
console.log();

console.log(pc.green('Assistant:'));
console.log('  To create a React component, you have two main options:');
console.log();
console.log('  1. ' + pc.yellow('Function Component') + ' (recommended):');
console.log(pc.gray('  ```jsx'));
console.log('  function MyComponent(props) {');
console.log('    return <div>Hello, {props.name}!</div>;');
console.log('  }');
console.log(pc.gray('  ```'));
console.log();
console.log('  2. ' + pc.yellow('Class Component:'));
console.log(pc.gray('  ```jsx'));
console.log('  class MyComponent extends React.Component {');
console.log('    render() {');
console.log('      return <div>Hello, {this.props.name}!</div>;');
console.log('    }');
console.log('  }');
console.log(pc.gray('  ```'));
console.log();

// Input area
console.log(pc.gray('───────────────────────────────────────────────────────────────────────────────'));
console.log(pc.cyan('You: ') + pc.white('|'));
console.log();

// Footer with commands
console.log(pc.gray('───────────────────────────────────────────────────────────────────────────────'));
console.log(pc.gray('Commands: ') +
  pc.yellow('/help') + ' ' +
  pc.yellow('/model') + ' ' +
  pc.yellow('/status') + ' ' +
  pc.yellow('/mcp') + ' ' +
  pc.yellow('/memory') + ' ' +
  pc.yellow('/compact') + ' ' +
  pc.gray('| Mouse: ') + pc.green('ON') + ' ' +
  pc.gray('| Mode: ') + pc.green('Chat'));
console.log(pc.gray('═══════════════════════════════════════════════════════════════════════════════'));

console.log('\n\n' + pc.gray('This is a mockup of the Plato TUI interface.'));
console.log(pc.gray('The actual TUI is interactive with:'));
console.log(pc.gray('- Real-time streaming responses'));
console.log(pc.gray('- Syntax highlighting'));
console.log(pc.gray('- Multi-panel layouts'));
console.log(pc.gray('- Mouse support for copy/paste'));
console.log(pc.gray('- Command palette (Ctrl+K)'));
console.log(pc.gray('- Session persistence'));