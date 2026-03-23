/**
 * MCP Prompt: serendipity
 *
 * Brainstorming template that discovers unexpected connections in the research corpus.
 * Combines semantic search results with the knowledge graph to spark new ideas.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { contextCompressor } from '../../core/rag/ContextCompressor.js';
import { KnowledgeGraphBuilder } from '../../core/graph/KnowledgeGraphBuilder.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerSerendipity(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.prompt(
    'serendipity',
    'Discover unexpected connections in the research corpus around a theme',
    {
      theme: z.string().describe('The starting theme or research question'),
      scope: z.enum(['corpus_only', 'corpus_and_beyond']).optional()
        .describe('Search scope: corpus only, or also use general knowledge (default: corpus_and_beyond)'),
    },
    async ({ theme, scope }) => {
      // Search the corpus for relevant chunks
      let searchContext = 'No results found in the corpus for this theme.';
      try {
        const queryEmbedding = await services.ollamaClient.generateEmbedding(theme);
        const results = services.hybridSearch.search(queryEmbedding, theme, 15);
        // Enrich with full document metadata
        for (const r of results) {
          const fullDoc = services.vectorStore.getDocument(r.chunk.documentId);
          if (fullDoc) r.document = fullDoc;
        }
        const { compressed } = contextCompressor.compress(results);

        if (compressed.length > 0) {
          searchContext = compressed.map((r, i) =>
            `[${i + 1}] (${r.document.sourceType}) ${r.document.title || r.document.filePath}\n${r.chunk.content}`
          ).join('\n\n---\n\n');
        }
      } catch { /* Ollama might not be running */ }

      // Build conceptual map from the graph
      let graphContext = 'Knowledge graph not available.';
      try {
        const graphBuilder = new KnowledgeGraphBuilder(services.vectorStore);
        const graphData = graphBuilder.build();
        const themeLower = theme.toLowerCase();

        // Find nodes related to the theme
        const relatedNodes = graphData.nodes
          .filter(n => n.label.toLowerCase().includes(themeLower))
          .slice(0, 5);

        if (relatedNodes.length > 0) {
          const neighborIds = new Set<string>();
          for (const node of relatedNodes) {
            for (const edge of graphData.edges) {
              if (edge.source === node.id) neighborIds.add(edge.target);
              if (edge.target === node.id) neighborIds.add(edge.source);
            }
          }
          const neighbors = graphData.nodes
            .filter(n => neighborIds.has(n.id))
            .slice(0, 15);

          graphContext = 'Related entities and concepts:\n' +
            [...relatedNodes, ...neighbors]
              .map(n => `- ${n.label} (${n.entityType || n.type}${n.community !== undefined ? `, community ${n.community}` : ''})`)
              .join('\n');
        }
      } catch { /* graph might fail */ }

      const scopeInstruction = scope === 'corpus_only'
        ? 'Base your connections ONLY on the elements found in the corpus below. Do not use external knowledge.'
        : 'You may cross-reference elements from the corpus with your general knowledge to propose broader connections.';

      logger.log({
        type: 'prompt',
        name: 'serendipity',
        input: { theme, scope },
        outputSummary: { totalChars: searchContext.length + graphContext.length },
      });

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text:
`You are a brainstorming partner for a historian.
Your goal is to produce unexpected and fruitful connections — not summaries.

${scopeInstruction}

The user is working on the theme: **${theme}**

## Relevant elements from the research corpus

${searchContext}

## Conceptual map around this theme

${graphContext}

## Instructions

1. Identify non-obvious connections between elements in the corpus.
2. Propose at least one connection with a field or concept outside the corpus.
3. Formulate questions the historian may not have asked yet.
4. Be speculative but rigorous — each suggestion must be arguable.
5. Respond in the same language as the theme.`,
            },
          },
        ],
      };
    }
  );
}
