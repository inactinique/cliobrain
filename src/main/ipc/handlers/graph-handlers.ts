import { ipcMain } from 'electron';
import { KnowledgeGraphBuilder } from '../../../../backend/core/graph/KnowledgeGraphBuilder.js';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupGraphHandlers() {
  ipcMain.handle('graph:get-data', async (_event, options?: any) => {
    try {
      if (!documentService.store) return successResponse({ nodes: [], edges: [] });
      const builder = new KnowledgeGraphBuilder(documentService.store);
      const data = builder.build(options);
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('graph:get-statistics', async () => {
    try {
      if (!documentService.store) {
        return successResponse({ entities: 0, relations: 0, communities: 0, documents: 0 });
      }
      const builder = new KnowledgeGraphBuilder(documentService.store);
      return successResponse(builder.getStatistics());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('graph:get-entity-details', async (_event, entityId: string) => {
    try {
      if (!documentService.store) return successResponse(null);
      const db = (documentService.store as any).db;

      const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(entityId);
      if (!entity) return successResponse(null);

      const mentions = db.prepare(`
        SELECT em.*, c.content as chunk_content, d.title as document_title
        FROM entity_mentions em
        JOIN chunks c ON em.chunk_id = c.id
        JOIN documents d ON em.document_id = d.id
        WHERE em.entity_id = ?
      `).all(entityId);

      return successResponse({
        entity: {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          normalizedName: entity.normalized_name,
          aliases: entity.aliases_json ? JSON.parse(entity.aliases_json) : [],
        },
        mentions: mentions.map((m: any) => ({
          documentTitle: m.document_title,
          context: m.context || m.chunk_content?.substring(0, 200),
          documentId: m.document_id,
        })),
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('graph:get-communities', async () => {
    try {
      if (!documentService.store) return successResponse([]);
      const builder = new KnowledgeGraphBuilder(documentService.store);
      const data = builder.build();

      // Group nodes by community
      const communityMap = new Map<number, any[]>();
      for (const node of data.nodes) {
        if (node.community !== undefined) {
          if (!communityMap.has(node.community)) communityMap.set(node.community, []);
          communityMap.get(node.community)!.push(node);
        }
      }

      const communities = Array.from(communityMap.entries()).map(([id, nodes]) => ({
        id,
        nodeCount: nodes.length,
        topNodes: nodes.slice(0, 5).map(n => ({ id: n.id, label: n.label, type: n.type })),
      }));

      return successResponse(communities);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
