/**
 * MCP Tool: search_zotero
 *
 * Search Zotero references. Two modes:
 * 1. If Zotero data directory is configured: queries the live Zotero SQLite database
 * 2. Fallback: searches Zotero documents already indexed in the ClioBrain corpus
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerSearchZotero(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.tool(
    'search_zotero',
    'Search Zotero bibliographic references. Filter by author, tags, year, or free text. Works with indexed Zotero documents in the corpus.',
    {
      query: z.string().optional().describe('Free text search across titles and content'),
      author: z.string().optional().describe('Filter by author name'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      year: z.number().optional().describe('Publication year'),
      limit: z.number().optional().default(20).describe('Maximum results (default: 20)'),
    },
    async ({ query, author, tags, year, limit }) => {
      try {
        // Try live Zotero database first
        const zoteroConfig = services.config.workspace.zotero;
        if (zoteroConfig?.dataDirectory) {
          return await searchLiveZotero(zoteroConfig, { query, author, tags, year, limit }, logger);
        }

        // Fallback: search indexed Zotero documents in the corpus
        return await searchIndexedZotero(services, { query, author, tags, year, limit }, logger);
      } catch (error: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Search through Zotero documents already indexed in ClioBrain's VectorStore.
 */
async function searchIndexedZotero(
  services: McpServices,
  filters: { query?: string; author?: string; tags?: string[]; year?: number; limit: number },
  logger: McpLogger,
) {
  const db = services.vectorStore as any;

  // Get all Zotero documents from the database
  let stmt = db.db?.prepare?.(
    "SELECT id, title, author, year, file_path, metadata_json, source_ref FROM documents WHERE source_type = 'zotero'"
  );
  let docs: any[] = stmt?.all() || [];

  if (docs.length === 0) {
    return {
      content: [{ type: 'text' as const, text: 'No Zotero references found in the indexed corpus.' }],
    };
  }

  // Parse metadata
  docs = docs.map(d => ({
    ...d,
    metadata: safeParseJSON(d.metadata_json, {}),
  }));

  // Filter by author
  if (filters.author) {
    const authorLower = filters.author.toLowerCase();
    docs = docs.filter(d =>
      d.author?.toLowerCase().includes(authorLower) ||
      d.metadata?.creators?.some((c: any) =>
        `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase().includes(authorLower)
      )
    );
  }

  // Filter by year
  if (filters.year) {
    const yearStr = String(filters.year);
    docs = docs.filter(d => d.year?.includes(yearStr));
  }

  // Filter by tags
  if (filters.tags && filters.tags.length > 0) {
    const tagsLower = filters.tags.map(t => t.toLowerCase());
    docs = docs.filter(d =>
      d.metadata?.tags?.some((t: string) => tagsLower.includes(t.toLowerCase()))
    );
  }

  // Filter by free text query
  if (filters.query) {
    const queryLower = filters.query.toLowerCase();
    // Search in title and metadata
    const titleMatches = docs.filter(d =>
      d.title?.toLowerCase().includes(queryLower) ||
      d.metadata?.abstractNote?.toLowerCase().includes(queryLower)
    );

    // Also search in chunk content via hybrid search
    let contentMatchIds = new Set<string>();
    try {
      const queryEmbedding = await services.ollamaClient.generateEmbedding(filters.query);
      const searchResults = services.hybridSearch.search(queryEmbedding, filters.query, filters.limit * 3);
      for (const r of searchResults) {
        const fullDoc = services.vectorStore.getDocument(r.chunk.documentId);
        if (fullDoc?.sourceType === 'zotero') {
          contentMatchIds.add(fullDoc.id);
        }
      }
    } catch {
      // Ollama might not be running — continue with title-only matches
    }

    const matchIds = new Set([
      ...titleMatches.map(d => d.id),
      ...contentMatchIds,
    ]);
    docs = docs.filter(d => matchIds.has(d.id));
  }

  // Get first chunk content as excerpt for each document
  const excerptStmt = db.db?.prepare?.(
    'SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC LIMIT 1'
  );

  const results = docs.slice(0, filters.limit).map(d => ({
    title: d.title,
    author: d.author,
    year: d.year,
    itemType: d.metadata?.itemType,
    abstract: d.metadata?.abstractNote?.substring(0, 500),
    tags: d.metadata?.tags,
    doi: d.metadata?.DOI,
    url: d.metadata?.url,
    excerpt: excerptStmt?.get(d.id)?.content?.substring(0, 300),
  }));

  logger.log({
    type: 'tool',
    name: 'search_zotero',
    input: filters,
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
        : 'No matching Zotero references found.',
    }],
  };
}

/**
 * Search the live Zotero SQLite database directly.
 */
async function searchLiveZotero(
  zoteroConfig: { dataDirectory: string; libraryID?: number },
  filters: { query?: string; author?: string; tags?: string[]; year?: number; limit: number },
  logger: McpLogger,
) {
  const { ZoteroLocalDB } = await import('../../integrations/zotero/ZoteroLocalDB.js');
  const db = new ZoteroLocalDB(zoteroConfig.dataDirectory);
  db.open();

  try {
    let items = db.getItems({ libraryID: zoteroConfig.libraryID });

    if (filters.author) {
      const authorLower = filters.author.toLowerCase();
      items = items.filter(item =>
        item.creators?.some((c: any) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(authorLower) ||
          c.lastName.toLowerCase().includes(authorLower)
        )
      );
    }

    if (filters.tags && filters.tags.length > 0) {
      const tagsLower = filters.tags.map(t => t.toLowerCase());
      items = items.filter(item =>
        item.tags?.some((t: string) => tagsLower.includes(t.toLowerCase()))
      );
    }

    if (filters.year) {
      const yearStr = String(filters.year);
      items = items.filter(item =>
        item.date?.includes(yearStr) || item.fields?.date?.includes(yearStr)
      );
    }

    if (filters.query) {
      const queryLower = filters.query.toLowerCase();
      items = items.filter(item => {
        const searchable = [
          item.title, item.abstractNote,
          ...(item.tags || []),
          ...Object.values(item.fields || {}),
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(queryLower);
      });
    }

    const results = items.slice(0, filters.limit).map(item => ({
      title: item.title,
      itemType: item.itemType,
      authors: item.creators?.map((c: any) => `${c.firstName || ''} ${c.lastName}`.trim()),
      year: item.date || item.fields?.date,
      abstract: item.abstractNote?.substring(0, 500),
      tags: item.tags,
      doi: item.fields?.DOI,
      url: item.fields?.url,
    }));

    logger.log({
      type: 'tool',
      name: 'search_zotero',
      input: filters,
      outputSummary: { itemCount: results.length, totalChars: JSON.stringify(results).length },
    });

    return {
      content: [{
        type: 'text' as const,
        text: results.length > 0
          ? JSON.stringify(results, null, 2)
          : 'No matching Zotero references found.',
      }],
    };
  } finally {
    db.close();
  }
}

function safeParseJSON(json: string | null, fallback: any): any {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}
