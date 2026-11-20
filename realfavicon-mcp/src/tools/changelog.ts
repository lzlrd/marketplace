import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Compares two dotted versions number by number, so "0.10" sorts after "0.9".
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function registerChangelog(server: McpServer): void {
  server.registerTool(
    'realfavicon_changelog',
    {
      title: 'Get changelog',
      description: 'Fetch the RealFaviconGenerator API change-log; optionally filter to changes after a given version. The feed ends at version 0.16 (January 2018), so it says nothing about the current generator or about markup from realfavicon_generate.',
      inputSchema: {
        since: z.string().optional().describe('One of the 16 versions in the feed, "0.1" through "0.9" then "0.10" through "0.16" (e.g. "0.12"); returns only changes after it. Any other value, such as the npm package version "0.8.3", is an error that lists the versions.'),
        format: z.enum(['html', 'markdown']).default('markdown').describe('Output format for description fields. Default markdown.'),
      },
      outputSchema: {
        up_to_date: z.boolean().describe('True when the feed holds nothing after `since`. The feed ends in 2018, so this says nothing about current recommendations.'),
        count: z.number(),
        changes: z.array(z.object({
          version: z.string().optional(),
          date: z.string().optional(),
          description: z.string().optional(),
          importance: z.string().optional(),
          updateOrNot: z.string().optional(),
          relevance: z.object({
            automatedUpdate: z.boolean().optional(),
            manualUpdate: z.boolean().optional(),
          }).passthrough().optional(),
        }).passthrough()),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ since, format }) => {
      try {
        const u = new URL('https://realfavicongenerator.net/api/change-log');
        u.searchParams.set('format', format);

        // The whole feed is fetched and `since` applied here. The API answers a version it
        // does not know with an empty list, which reads the same as "nothing newer".
        const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`change-log request failed (${res.status})`);

        const feed = await res.json();
        if (!Array.isArray(feed)) throw new Error('unexpected change-log response (not an array)');

        let changes = feed;
        if (since) {
          const versions = feed.map(entry => entry?.version).filter(version => typeof version === 'string');
          if (!versions.includes(since)) {
            throw new Error(`since "${since}" is not a version in the change-log; its versions are ${versions.join(', ')}`);
          }
          changes = feed.filter(entry => typeof entry?.version === 'string' && compareVersions(entry.version, since) > 0);
        }

        const up_to_date = changes.length === 0;
        const count = changes.length;

        return {
          content: [{ type: 'text' as const, text: `${count} change-log entr${count === 1 ? 'y' : 'ies'}; up_to_date=${up_to_date}.` }],
          structuredContent: { up_to_date, count, changes },
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `realfavicon_changelog failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
