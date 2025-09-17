#!/usr/bin/env node

/**
 * MCP Server wrapper for Plato TUI
 * Provides MCP interface to interact with Plato
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// Global Plato process
let platoProcess = null;
let platoOutput = '';
let platoReady = false;

// Create MCP server
const server = new Server(
  {
    name: 'plato-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Available tools
const TOOLS = [
  {
    name: 'start_plato',
    description: 'Start the Plato TUI application',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'send_command',
    description: 'Send a command or message to Plato',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command or message to send',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'get_output',
    description: 'Get the current output from Plato',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'stop_plato',
    description: 'Stop the Plato TUI application',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'take_snapshot',
    description: 'Take a snapshot of the current Plato session',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Optional filename for the snapshot',
        },
      },
    },
  },
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'start_plato': {
        if (platoProcess) {
          return {
            content: [
              {
                type: 'text',
                text: 'Plato is already running',
              },
            ],
          };
        }

        platoOutput = '';
        platoReady = false;

        // Start Plato with forced CLI mode for easier interaction
        platoProcess = spawn('npm', ['run', 'dev', '--', '--cli'], {
          env: {
            ...process.env,
            PLATO_FORCE_CLI: 'true',
          },
        });

        platoProcess.stdout.on('data', (data) => {
          const text = data.toString();
          platoOutput += text;
          if (text.includes('You:') || text.includes('interactive mode')) {
            platoReady = true;
          }
        });

        platoProcess.stderr.on('data', (data) => {
          platoOutput += `[ERROR] ${data.toString()}`;
        });

        platoProcess.on('close', (code) => {
          platoOutput += `\n[Process exited with code ${code}]`;
          platoProcess = null;
          platoReady = false;
        });

        // Wait for Plato to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));

        return {
          content: [
            {
              type: 'text',
              text: `Plato started successfully. Ready: ${platoReady}\nInitial output:\n${platoOutput.slice(-500)}`,
            },
          ],
        };
      }

      case 'send_command': {
        if (!platoProcess) {
          return {
            content: [
              {
                type: 'text',
                text: 'Plato is not running. Start it first with start_plato',
              },
            ],
            isError: true,
          };
        }

        const command = args.command;
        platoProcess.stdin.write(command + '\n');

        // Wait for response
        await new Promise(resolve => setTimeout(resolve, 1000));

        return {
          content: [
            {
              type: 'text',
              text: `Sent command: ${command}\nLatest output:\n${platoOutput.slice(-1000)}`,
            },
          ],
        };
      }

      case 'get_output': {
        return {
          content: [
            {
              type: 'text',
              text: platoOutput || 'No output yet. Start Plato first.',
            },
          ],
        };
      }

      case 'stop_plato': {
        if (!platoProcess) {
          return {
            content: [
              {
                type: 'text',
                text: 'Plato is not running',
              },
            ],
          };
        }

        platoProcess.kill();
        platoProcess = null;
        platoReady = false;

        return {
          content: [
            {
              type: 'text',
              text: 'Plato stopped successfully',
            },
          ],
        };
      }

      case 'take_snapshot': {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = args.filename || `plato-snapshot-${timestamp}.txt`;
        const filepath = path.join(process.cwd(), filename);

        await fs.writeFile(filepath, platoOutput);

        return {
          content: [
            {
              type: 'text',
              text: `Snapshot saved to ${filename}\nContent length: ${platoOutput.length} characters`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Plato MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});