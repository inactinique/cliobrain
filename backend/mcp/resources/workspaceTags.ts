/**
 * MCP Resource: cliobrain://workspace/tags
 *
 * All tags and concepts in the corpus with frequencies,
 * sorted by descending count. Lets the model understand the conceptual universe.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerWorkspaceTags(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.resource(
    'workspace-tags',
    'cliobrain://workspace/tags',
    { description: 'Tags and concepts in the research corpus with frequencies, sorted by importance.' },
    async (uri) => {
      const db = services.vectorStore.database;
      const tags: Array<{ tag: string; count: number; type: string }> = [];

      // Obsidian tags from vault_notes
      const tagCounts = new Map<string, number>();
      for (const row of db.prepare('SELECT tags_json FROM vault_notes WHERE tags_json IS NOT NULL').all() as any[]) {
        try {
          const noteTags: string[] = JSON.parse(row.tags_json);
          for (const t of noteTags) {
            tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
          }
        } catch { /* skip malformed */ }
      }
      for (const [tag, count] of tagCounts) {
        tags.push({ tag, count, type: 'obsidian' });
      }

      // NER entities as concept tags
      for (const row of db.prepare(
        'SELECT name, type, COUNT(*) as mention_count FROM entities e ' +
        'LEFT JOIN entity_mentions em ON e.id = em.entity_id ' +
        'GROUP BY e.id ORDER BY mention_count DESC LIMIT 100'
      ).all() as any[]) {
        tags.push({ tag: row.name, count: row.mention_count, type: `ner:${row.type}` });
      }

      // Sort by frequency descending
      tags.sort((a, b) => b.count - a.count);

      logger.log({
        type: 'resource',
        name: 'cliobrain://workspace/tags',
        input: {},
        outputSummary: { itemCount: tags.length },
      });

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(tags, null, 2),
          mimeType: 'application/json',
        }],
      };
    }
  );
}
