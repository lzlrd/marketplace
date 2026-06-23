import { test, expect, afterEach } from 'bun:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerChangelog } from '../src/tools/changelog.ts';

// Realistic changelog entry shape matching the RFG API.
const ENTRY_A = {
  version: '0.9.0',
  date: '2024-01-15',
  description: 'Added something useful.',
  importance: 'high',
  update_or_not: 'update',
  relevance: { automated_update: true, manual_update: false },
};
const ENTRY_B = {
  version: '0.8.9',
  date: '2023-12-01',
  description: 'Fixed a bug.',
  importance: 'low',
  update_or_not: 'no_update',
  relevance: { automated_update: false, manual_update: false },
};

async function makeClient(): Promise<Client> {
  const server = new McpServer({ name: 't', version: '0.0.0' });
  registerChangelog(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '0.0.0' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// 1. Empty array → up_to_date
test('empty array response sets up_to_date=true and count=0', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
  ) as unknown as typeof fetch;

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Record<string, unknown>;
  expect(sc.up_to_date).toBe(true);
  expect(sc.count).toBe(0);
  expect(sc.changes).toEqual([]);
});

// 2. Non-empty array → not up_to_date, fields pass through unchanged
test('two-entry response sets up_to_date=false and passes fields through', async () => {
  const payload = [ENTRY_A, ENTRY_B];
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  ) as unknown as typeof fetch;

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Record<string, unknown>;
  expect(sc.up_to_date).toBe(false);
  expect(sc.count).toBe(2);
  const changes = sc.changes as typeof payload;
  expect(changes.length).toBe(2);
  expect(changes[0].version).toBe(ENTRY_A.version);
  expect(changes[0].date).toBe(ENTRY_A.date);
  expect(changes[0].relevance).toEqual(ENTRY_A.relevance);
});

// 3a. `since` and `format=html` appear in the request URL
test('since and format params are included in the request URL', async () => {
  let capturedUrl = '';
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    capturedUrl = input instanceof URL ? input.toString() : String(input);
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const client = await makeClient();
  await client.callTool({ name: 'realfavicon_changelog', arguments: { since: '0.8.3', format: 'html' } });

  expect(capturedUrl).toContain('since=0.8.3');
  expect(capturedUrl).toContain('format=html');
});

// 3b. Default format is markdown when omitted
test('format defaults to markdown when not supplied', async () => {
  let capturedUrl = '';
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    capturedUrl = input instanceof URL ? input.toString() : String(input);
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const client = await makeClient();
  await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(capturedUrl).toContain('format=markdown');
});

// 4. Non-2xx → isError
test('HTTP 500 response returns isError=true', async () => {
  globalThis.fetch = (async () =>
    new Response('Internal Server Error', { status: 500 })
  ) as unknown as typeof fetch;

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(r.isError).toBe(true);
});

// 5. Non-array body → isError
test('non-array JSON body returns isError=true', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
  ) as unknown as typeof fetch;

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(r.isError).toBe(true);
});
