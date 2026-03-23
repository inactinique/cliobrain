/**
 * MCP Tool: search_obsidian
 *
 * Structural search in the Obsidian vault: by tags, wikilinks, frontmatter, or free text.
 * Uses the indexed vault notes from the VectorStore.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerSearchObsidian(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.tool(
    'search_obsidian',
    'Search Obsidian vault notes by tags, wikilinks, frontmatter, or free text.',
    {
      query: z.string().optional().describe('Free text search in note content'),
      tags: z.array(z.string()).optional().describe('Filter by #tags'),
      linkedTo: z.string().optional().describe('Find notes linked to this note via [[wikilinks]]'),
      frontmatterKey: z.string().optional().describe('Frontmatter key to search'),
      frontmatterValue: z.string().optional().describe('Frontmatter value to match'),
      limit: z.number().optional().default(20).describe('Maximum results (default: 20)'),
    },
    async ({ query, tags, linkedTo, frontmatterKey, frontmatterValue, limit }) => {
      try {
        // Get all vault notes from the database
        const db = services.vectorStore as any;
        const stmt = db.db?.prepare?.(
          'SELECT id, relative_path, title, frontmatter_json, tags_json, wikilinks_json, file_hash, file_mtime FROM vault_notes'
        );

        if (!stmt) {
          return {
            content: [{ type: 'text' as const, text: 'No Obsidian vault is indexed in this workspace.' }],
          };
        }

        let notes: any[] = stmt.all();

        // Parse JSON fields
        notes = notes.map(n => ({
          ...n,
          tags: safeParseJSON(n.tags_json, []),
          wikilinks: safeParseJSON(n.wikilinks_json, []),
          frontmatter: safeParseJSON(n.frontmatter_json, {}),
        }));

        // Filter by tags
        if (tags && tags.length > 0) {
          const tagsLower = tags.map(t => t.toLowerCase().replace(/^#/, ''));
          notes = notes.filter(n =>
            n.tags.some((t: string) => tagsLower.includes(t.toLowerCase().replace(/^#/, '')))
          );
        }

        // Filter by wikilinks (notes that link TO a specific note)
        if (linkedTo) {
          const targetLower = linkedTo.toLowerCase();
          notes = notes.filter(n =>
            n.wikilinks.some((w: any) => {
              const linkTarget = typeof w === 'string' ? w : w.target;
              return linkTarget?.toLowerCase().includes(targetLower);
            })
          );
        }

        // Filter by frontmatter
        if (frontmatterKey) {
          notes = notes.filter(n => {
            const value = n.frontmatter?.[frontmatterKey];
            if (value === undefined) return false;
            if (!frontmatterValue) return true;
            return String(value).toLowerCase().includes(frontmatterValue.toLowerCase());
          });
        }

        // Filter by free text (search in indexed chunks)
        if (query) {
          const queryLower = query.toLowerCase();
          // First, try matching in titles and tags
          const titleMatches = new Set(
            notes
              .filter(n => n.title?.toLowerCase().includes(queryLower))
              .map(n => n.id)
          );

          // Then search in content via the search pipeline
          const queryEmbedding = await services.ollamaClient.generateEmbedding(query);
          const searchResults = services.hybridSearch.search(queryEmbedding, query, limit * 3);
          // Enrich with full document metadata (HNSW may have incomplete data)
          for (const r of searchResults) {
            const fullDoc = services.vectorStore.getDocument(r.chunk.documentId);
            if (fullDoc) r.document = fullDoc;
          }
          const noteDocIds = new Set(
            searchResults
              .filter(r => r.document.sourceType === 'obsidian-note')
              .map(r => r.document.id)
          );

          // Combine both match sources
          notes = notes.filter(n => titleMatches.has(n.id) || noteDocIds.has(n.id));
        }

        // Format results
        const results = notes.slice(0, limit).map(n => ({
          title: n.title,
          path: n.relative_path,
          tags: n.tags,
          wikilinks: n.wikilinks.map((w: any) => typeof w === 'string' ? w : w.target).slice(0, 10),
          frontmatter: n.frontmatter,
        }));

        // Log access
        logger.log({
          type: 'tool',
          name: 'search_obsidian',
          input: { query, tags, linkedTo, frontmatterKey, frontmatterValue, limit },
          outputSummary: {
            itemCount: results.length,
            totalChars: JSON.stringify(results).length,
          },
        });

        return {
          content: [{
            type: 'text' as const,
            text: results.length > 0
              ? JSON.stringify(results, null, 2)
              : 'No matching Obsidian notes found.',
          }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}

function safeParseJSON(json: string | null, fallback: any): any {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
