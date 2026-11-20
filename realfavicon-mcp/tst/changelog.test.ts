import { test, expect, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerChangelog } from '../src/tools/changelog.ts';

// The feed as the API served it on 2026-11-19: the 16 entries with their real keys, versions,
// dates, importance and relevance. The description and updateOrNot prose is stubbed.
type Entry = { version: string; date: string; description: string; importance: string; updateOrNot: string; relevance: { automatedUpdate: boolean; manualUpdate: boolean } };
const FEED = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures/change-log.json'), 'utf8')) as Entry[];

// The client checks results against the advertised output schema only once it has listed the
// tools, so every client here does that first, as a real host does.
async function makeClient(): Promise<Client> {
  const server = new McpServer({ name: 't', version: '0.0.0' });
  registerChangelog(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '0.0.0' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  await client.listTools();
  return client;
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Serves `body` as the feed and records the URLs requested.
function serveFeed(body: unknown, status = 200): string[] {
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requested.push(input instanceof URL ? input.toString() : String(input));
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return requested;
}

function textOf(r: unknown): string {
  return (r as { content: Array<{ type: string; text: string }> }).content[0]!.text;
}

type Result = { up_to_date: boolean; count: number; changes: Entry[] };

// 1. Empty array → up_to_date
test('empty array response sets up_to_date=true and count=0', async () => {
  serveFeed([]);

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Result;
  expect(sc.up_to_date).toBe(true);
  expect(sc.count).toBe(0);
  expect(sc.changes).toEqual([]);
});

// 2. The whole feed, in the shape the API sends, passes the advertised output schema.
test('the full feed is returned unchanged and matches the output schema', async () => {
  serveFeed(FEED);

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Result;
  expect(sc.up_to_date).toBe(false);
  expect(sc.count).toBe(16);
  expect(sc.changes).toEqual(FEED);
  expect(sc.changes[0]!.updateOrNot).toBe(FEED[0]!.updateOrNot);
  expect(sc.changes[0]!.relevance).toEqual({ automatedUpdate: true, manualUpdate: false });
});

// 3. `since` keeps the entries after that version, comparing versions as numbers.
test('since returns only the entries after that version', async () => {
  const client = await makeClient();

  for (const [since, expected] of [
    ['0.15', ['0.16']],
    ['0.8', ['0.9', '0.10', '0.11', '0.12', '0.13', '0.14', '0.15', '0.16']],
    ['0.9', ['0.10', '0.11', '0.12', '0.13', '0.14', '0.15', '0.16']],
    ['0.1', FEED.slice(1).map(e => e.version)],
  ] as const) {
    serveFeed(FEED);
    const r = await client.callTool({ name: 'realfavicon_changelog', arguments: { since } });

    expect(r.isError).toBeFalsy();
    const sc = r.structuredContent as Result;
    expect(sc.changes.map(e => e.version)).toEqual([...expected]);
    expect(sc.count).toBe(expected.length);
    expect(sc.up_to_date).toBe(false);
  }
});

test('since the last version in the feed is up to date', async () => {
  serveFeed(FEED);

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_changelog', arguments: { since: '0.16' } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Result;
  expect(sc.up_to_date).toBe(true);
  expect(sc.count).toBe(0);
});

// 4. A version the feed does not hold is an error, never "up to date".
test('a since that is not a version in the feed is an error naming the versions', async () => {
  const client = await makeClient();

  for (const since of ['0.8.3', '1.0', 'abc', '0.9.0']) {
    serveFeed(FEED);
    const r = await client.callTool({ name: 'realfavicon_changelog', arguments: { since } });

    expect(r.isError).toBe(true);
    expect(r.structuredContent).toBeUndefined();
    expect(textOf(r)).toContain(`"${since}"`);
    expect(textOf(r)).toContain('0.1, 0.2');
    expect(textOf(r)).toContain('0.16');
  }
});

// 5a. The whole feed is requested: `since` is applied here, not by the API.
test('format is sent to the API and since is not', async () => {
  const requested = serveFeed(FEED);

  const client = await makeClient();
  await client.callTool({ name: 'realfavicon_changelog', arguments: { since: '0.12', format: 'html' } });

  expect(requested.length).toBe(1);
  expect(requested[0]).toContain('format=html');
  expect(requested[0]).not.toContain('since');
});

// 5b. Default format is markdown when omitted
test('format defaults to markdown when not supplied', async () => {
  const requested = serveFeed([]);

  const client = await makeClient();
  await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(requested[0]).toContain('format=markdown');
});

// 6. Non-2xx → isError
test('HTTP 500 response returns isError=true', async () => {
  serveFeed('Internal Server Error', 500);

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(r.isError).toBe(true);
});

// 7. Non-array body → isError
test('non-array JSON body returns isError=true', async () => {
  serveFeed({});

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_changelog', arguments: {} });

  expect(r.isError).toBe(true);
});
