/**
 * MCP Tool: search_documents
 *
 * Hybrid search (HNSW dense + BM25 sparse, RRF fusion) across the entire indexed corpus.
 * Applies 3-level context compression to keep results concise.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { contextCompressor } from '../../core/rag/ContextCompressor.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerSearchDocuments(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.tool(
    'search_documents',
    'Search the indexed research corpus using hybrid semantic + keyword search. Returns relevant text chunks with source metadata.',
    {
      query: z.string().describe('Natural language search query'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Maximum number of results (default: 20, max: 100)'),
      sourceTypes: z.array(
        z.enum(['file', 'zotero', 'tropy', 'folder', 'obsidian-note'])
      ).optional().describe('Filter by source type'),
      minScore: z.number().min(0).max(1).optional().default(0.0).describe('Minimum relevance score 0-1 (default: 0, no filtering)'),
    },
    async ({ query, limit, sourceTypes, minScore }) => {
      try {
        // Generate query embedding
        const queryEmbedding = await services.ollamaClient.generateEmbedding(query);

        // Run hybrid search
        let results = services.hybridSearch.search(queryEmbedding, query, limit * 2);

        // Enrich results with full document metadata from SQLite.
        // The HNSW index may have incomplete document data (missing sourceType, title, etc.)
        // Filter out results where the parent document no longer exists (orphaned chunks).
        results = results.filter(r => {
          const fullDoc = services.vectorStore.getDocument(r.chunk.documentId);
          if (fullDoc) {
            r.document = fullDoc;
            return true;
          }
          return false;
        });

        // Filter by source type
        if (sourceTypes && sourceTypes.length > 0) {
          results = results.filter(r => sourceTypes.includes(r.document.sourceType as any));
        }

        // Filter by min score
        results = results.filter(r => r.similarity >= minScore);

        // Compress context
        const { compressed } = contextCompressor.compress(results);

        // Limit results
        const finalResults = compressed.slice(0, limit);

        // Format output
        const items = finalResults.map(r => ({
          content: r.chunk.content,
          source: r.document.title || r.document.filePath,
          sourceType: r.document.sourceType,
          score: Math.round(r.similarity * 1000) / 1000,
          metadata: {
            author: r.document.author,
            year: r.document.year,
            language: r.document.language,
            section: r.chunk.sectionTitle,
            page: r.chunk.pageNumber,
            tags: r.document.metadata?.tags,
            collections: r.document.metadata?.collections,
            library: r.document.metadata?.libraryName,
          },
        }));

        // Log access
        logger.log({
          type: 'tool',
          name: 'search_documents',
          input: { query, limit, sourceTypes, minScore },
          outputSummary: {
            itemCount: items.length,
            totalChars: items.reduce((sum, i) => sum + i.content.length, 0),
          },
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(items, null, 2),
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
