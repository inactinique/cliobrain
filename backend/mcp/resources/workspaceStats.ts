/**
 * MCP Resource: cliobrain://workspace/stats
 *
 * Overview statistics of the indexed workspace:
 * document counts by type, entities, chunks, last indexation date, languages.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerWorkspaceStats(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.resource(
    'workspace-stats',
    'cliobrain://workspace/stats',
    { description: 'Statistics about the indexed research corpus: document counts, entities, chunks, languages.' },
    async (uri) => {
      const stats = services.vectorStore.getStatistics();
      const db = services.vectorStore as any;

      // Count documents by source type
      const byTypeStmt = db.db?.prepare?.(
        'SELECT source_type, COUNT(*) as count FROM documents GROUP BY source_type'
      );
      const byType: Record<string, number> = {};
      for (const row of (byTypeStmt?.all() || [])) {
        byType[row.source_type] = row.count;
      }

      // Detect languages in corpus
      const langStmt = db.db?.prepare?.(
        'SELECT DISTINCT language FROM documents WHERE language IS NOT NULL'
      );
      const languages = (langStmt?.all() || []).map((r: any) => r.language);

      // Last indexation date
      const lastIndexStmt = db.db?.prepare?.(
        'SELECT MAX(indexed_at) as last FROM documents'
      );
      const lastIndexed = lastIndexStmt?.get()?.last || null;

      const result = {
        totalDocuments: stats?.documentCount || 0,
        documentsByType: byType,
        obsidianNotes: stats?.noteCount || 0,
        entities: stats?.entityCount || 0,
        chunks: stats?.chunkCount || 0,
        embeddings: stats?.embeddingCount || 0,
        lastIndexedAt: lastIndexed,
        languages,
        workspaceName: services.config.workspace.name,
      };

      logger.log({
        type: 'resource',
        name: 'cliobrain://workspace/stats',
        input: {},
        outputSummary: { totalChars: JSON.stringify(result).length },
      });

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(result, null, 2),
          mimeType: 'application/json',
        }],
      };
    }
  );
}
