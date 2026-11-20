import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EXPECTED_TOOLS = ['realfavicon_changelog', 'realfavicon_check', 'realfavicon_generate'];

// Paths come from this file's location, so the suite runs from any working directory.
const pluginRoot = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(pluginRoot, path), 'utf8');

async function connect(): Promise<Client> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(pluginRoot, 'src', 'index.ts')] });
  const client = new Client({ name: 'c', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

test('server lists exactly the three tools', async () => {
  const client = await connect();

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

test('every copy of the version is the same', async () => {
  const client = await connect();
  const reported = client.getServerVersion()?.version;
  await client.close();

  const plugin = (JSON.parse(read('.claude-plugin/plugin.json')) as { version: string }).version;
  const pkg = (JSON.parse(read('package.json')) as { version: string }).version;
  const skill = read('skills/favicons/SKILL.md').match(/^version: (.+)$/m)?.[1];

  expect(plugin).toMatch(/^\d+\.\d+\.\d+$/);
  expect(pkg).toBe(plugin);
  expect(skill).toBe(plugin);
  expect(reported).toBe(plugin);
});
