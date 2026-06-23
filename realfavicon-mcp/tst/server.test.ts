import { test, expect } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EXPECTED_TOOLS = ['realfavicon_changelog', 'realfavicon_check', 'realfavicon_generate'];

test('server lists exactly the three tools', async () => {
  const transport = new StdioClientTransport({ command: 'bun', args: ['run', 'src/index.ts'] });
  const client = new Client({ name: 'c', version: '0.0.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();

  expect(names).toEqual(EXPECTED_TOOLS);
  expect(tools.length).toBe(3);

  // hardening: each tool must carry a non-empty description and an inputSchema
  for (const tool of tools) {
    expect(typeof tool.description).toBe('string');
    expect((tool.description as string).length).toBeGreaterThan(0);
    expect(tool.inputSchema).toBeDefined();
    expect(typeof tool.inputSchema).toBe('object');
  }

  await client.close();
});
