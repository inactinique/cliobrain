/**
 * MCP Resource: cliobrain://workspace/recent
 *
 * The 20 most recently added or modified documents,
 * with title, type, date, and a short excerpt.
 * Lets the model know what's "fresh" in the researcher's thinking.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerWorkspaceRecent(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.resource(
    'workspace-recent',
    'cliobrain://workspace/recent',
    { description: 'The 20 most recently added or modified documents in the corpus, with title, type, date, and excerpt.' },
    async (uri) => {
      const db = services.vectorStore.database;

      // Get recent documents
      const recentDocs = db.prepare(
        'SELECT id, title, source_type, file_path, indexed_at, file_modified_at, author, year ' +
        'FROM documents ORDER BY COALESCE(file_modified_at, indexed_at) DESC LIMIT 20'
      ).all() as any[];

      // Get first chunk for each document as excerpt
      const excerptStmt = db.prepare(
        'SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC LIMIT 1'
      );

      const results = recentDocs.map((doc: any) => {
        const firstChunk = excerptStmt.get(doc.id) as any;
        const excerpt = firstChunk?.content
          ? firstChunk.content.substring(0, 300).replace(/\s+/g, ' ').trim()
          : null;

        return {
          title: doc.title,
          sourceType: doc.source_type,
          author: doc.author,
          year: doc.year,
          modifiedAt: doc.file_modified_at || doc.indexed_at,
          excerpt,
        };
      });

      logger.log({
        type: 'resource',
        name: 'cliobrain://workspace/recent',
        input: {},
        outputSummary: { itemCount: results.length },
      });

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(results, null, 2),
          mimeType: 'application/json',
        }],
      };
    }
  );
}
