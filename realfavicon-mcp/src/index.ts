#! /usr/bin/env bun

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerGenerateFavicon } from './tools/generate.js';
import { registerCheckFavicon } from './tools/check.js';
import { registerChangelog } from './tools/changelog.js';

const server = new McpServer({ name: 'realfavicon-mcp', version: '0.2.0' });

registerGenerateFavicon(server);
registerCheckFavicon(server);
registerChangelog(server);

await server.connect(new StdioServerTransport());
