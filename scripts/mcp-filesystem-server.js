#!/usr/bin/env node

/**
 * MCP Filesystem Server for testing Plato
 * Provides filesystem access capabilities through Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create server instance
const server = new Server(
  {
    name: 'filesystem-server',
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
    name: 'read_file',
    description: 'Read the contents of a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to read',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write contents to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List contents of a directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the directory to list',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a new directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the directory to create',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to delete',
        },
      },
      required: ['path'],
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
      case 'read_file': {
        const content = await fs.readFile(args.path, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      }

      case 'write_file': {
        await fs.writeFile(args.path, args.content, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: `Successfully wrote to ${args.path}`,
            },
          ],
        };
      }

      case 'list_directory': {
        const items = await fs.readdir(args.path, { withFileTypes: true });
        const listing = items.map(item => {
          const type = item.isDirectory() ? 'dir' : 'file';
          return `[${type}] ${item.name}`;
        }).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: listing,
            },
          ],
        };
      }

      case 'create_directory': {
        await fs.mkdir(args.path, { recursive: true });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully created directory ${args.path}`,
            },
          ],
        };
      }

      case 'delete_file': {
        await fs.unlink(args.path);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted ${args.path}`,
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
  console.error('MCP Filesystem Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});