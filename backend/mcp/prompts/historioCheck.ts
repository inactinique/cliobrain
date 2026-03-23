/**
 * MCP Prompt: historiographical_check
 *
 * Confronts a working hypothesis against the research corpus.
 * Classifies evidence as supporting, contradicting, or nuancing the hypothesis.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { contextCompressor } from '../../core/rag/ContextCompressor.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerHistorioCheck(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.prompt(
    'historiographical_check',
    'Confront a working hypothesis against the research corpus',
    {
      hypothesis: z.string().describe('The hypothesis to test against the corpus'),
      strictness: z.enum(['exploratory', 'strict']).optional()
        .describe('Search mode: exploratory (broad) or strict (focus on contradictions). Default: exploratory'),
    },
    async ({ hypothesis, strictness }) => {
      // Search the corpus for relevant evidence
      let corpusEvidence = 'No relevant evidence found in the corpus.';
      try {
        const queryEmbedding = await services.ollamaClient.generateEmbedding(hypothesis);

        // Broader search for exploratory mode
        const k = strictness === 'strict' ? 10 : 20;
        const results = services.hybridSearch.search(queryEmbedding, hypothesis, k);
        // Enrich with full document metadata
        for (const r of results) {
          const fullDoc = services.vectorStore.getDocument(r.chunk.documentId);
          if (fullDoc) r.document = fullDoc;
        }
        const { compressed } = contextCompressor.compress(results);

        if (compressed.length > 0) {
          corpusEvidence = compressed.map((r, i) =>
            `[${i + 1}] (${r.document.sourceType}) ${r.document.title || r.document.filePath}` +
            (r.document.author ? ` — ${r.document.author}` : '') +
            (r.document.year ? ` (${r.document.year})` : '') +
            `\n${r.chunk.content}`
          ).join('\n\n---\n\n');
        }
      } catch { /* Ollama might not be running */ }

      const strictnessInstruction = strictness === 'strict'
        ? 'Focus primarily on finding contradictions and weaknesses in the hypothesis. Be adversarial.'
        : 'Search broadly for all types of evidence: supporting, contradicting, and nuancing.';

      logger.log({
        type: 'prompt',
        name: 'historiographical_check',
        input: { hypothesis, strictness },
        outputSummary: { totalChars: corpusEvidence.length },
      });

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text:
`The user submits the following hypothesis: **${hypothesis}**

${strictnessInstruction}

## Elements from the corpus that may be relevant

${corpusEvidence}

## Instructions

1. Classify the elements found into three categories:
   - **Supporting**: elements that support the hypothesis
   - **Contradicting**: elements that contradict or weaken the hypothesis
   - **Nuancing**: elements that invite reformulation or qualification

2. Identify **gaps**: what types of sources are missing from the corpus to properly test this hypothesis?

3. If the sources invite nuance, **suggest reformulations** of the hypothesis that would better fit the available evidence.

4. Be explicit about the strength of each piece of evidence — a passing mention is not the same as a sustained argument.

5. Respond in the same language as the hypothesis.`,
            },
          },
        ],
      };
    }
  );
}
