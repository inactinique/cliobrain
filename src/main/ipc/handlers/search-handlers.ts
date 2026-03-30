import { ipcMain } from 'electron';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupSearchHandlers() {
  ipcMain.handle('search:query', async (_event, query: string, options?: any) => {
    try {
      if (!documentService.isInitialized) return successResponse([]);
      const results = await documentService.search(query, options);
      return successResponse(results);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('search:entities', async (_event, query: string, type?: string) => {
    try {
      if (!documentService.store) return successResponse([]);

      const db = (documentService.store as any).db;
      if (!db) return successResponse([]);

      const queryLower = `%${query.toLowerCase()}%`;
      let entities: any[];

      if (type) {
        const stmt = db.prepare(
          'SELECT e.*, (SELECT COUNT(*) FROM entity_mentions em WHERE em.entity_id = e.id) AS mention_count ' +
          'FROM entities e WHERE (LOWER(e.name) LIKE ? OR LOWER(e.normalized_name) LIKE ?) AND e.type = ? ' +
          'ORDER BY mention_count DESC LIMIT 50'
        );
        entities = stmt.all(queryLower, queryLower, type);
      } else {
        const stmt = db.prepare(
          'SELECT e.*, (SELECT COUNT(*) FROM entity_mentions em WHERE em.entity_id = e.id) AS mention_count ' +
          'FROM entities e WHERE LOWER(e.name) LIKE ? OR LOWER(e.normalized_name) LIKE ? ' +
          'ORDER BY mention_count DESC LIMIT 50'
        );
        entities = stmt.all(queryLower, queryLower);
      }

      return successResponse(entities);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('search:similar', async (_event, documentId: string, topK?: number) => {
    try {
      if (!documentService.isInitialized || !documentService.ollama || !documentService.hnsw) {
        return successResponse([]);
      }

      const k = topK || 10;

      // Get the document's chunks and their embeddings
      const db = (documentService.store as any)?.db;
      if (!db) return successResponse([]);

      const chunkRows = db.prepare(
        'SELECT content, embedding FROM chunks WHERE document_id = ? LIMIT 5'
      ).all(documentId) as Array<{ content: string; embedding: Buffer | null }>;

      if (chunkRows.length === 0) return successResponse([]);

      // Average the embeddings of the first few chunks as a document vector
      const embeddings = chunkRows
        .filter(r => r.embedding)
        .map(r => new Float32Array(r.embedding!.buffer, r.embedding!.byteOffset, r.embedding!.byteLength / 4));

      if (embeddings.length === 0) return successResponse([]);

      const avgEmbedding = new Float32Array(768);
      for (const emb of embeddings) {
        for (let i = 0; i < 768; i++) avgEmbedding[i] += emb[i];
      }
      for (let i = 0; i < 768; i++) avgEmbedding[i] /= embeddings.length;

      // Search HNSW, then deduplicate by document
      const results = documentService.hnsw.search(avgEmbedding, k * 3);
      const seen = new Set<string>();
      seen.add(documentId); // Exclude the source document
      const similar = results.filter(r => {
        if (seen.has(r.chunk.documentId)) return false;
        seen.add(r.chunk.documentId);
        return true;
      }).slice(0, k);

      return successResponse(similar);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
