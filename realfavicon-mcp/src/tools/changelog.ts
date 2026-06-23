import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerChangelog(server: McpServer): void {
  server.registerTool(
    'realfavicon_changelog',
    {
      title: 'Get changelog',
      description: 'Fetch the RealFaviconGenerator change-log; optionally filter to changes after a given version.',
      inputSchema: {
        since: z.string().optional().describe('Existing RFG version (e.g. "0.8.3"); returns only changes after it.'),
        format: z.enum(['html', 'markdown']).default('markdown').describe('Output format for description fields. Default markdown.'),
      },
      outputSchema: {
        up_to_date: z.boolean(),
        count: z.number(),
        changes: z.array(z.object({
          version: z.string().optional(),
          date: z.string().optional(),
          description: z.string().optional(),
          importance: z.string().optional(),
          update_or_not: z.string().optional(),
          relevance: z.object({
            automated_update: z.boolean().optional(),
            manual_update: z.boolean().optional(),
          }).optional(),
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
        if (since) u.searchParams.set('since', since);

        const res = await fetch(u);
        if (!res.ok) throw new Error(`change-log request failed (${res.status})`);

        const changes = await res.json();
        if (!Array.isArray(changes)) throw new Error('unexpected change-log response (not an array)');

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
