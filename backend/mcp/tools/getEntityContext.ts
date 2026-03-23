/**
 * MCP Tool: get_entity_context
 *
 * Full context for a named entity (person, place, concept, event):
 * occurrence count, documents mentioning it, related entities from the graph, tags.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KnowledgeGraphBuilder } from '../../core/graph/KnowledgeGraphBuilder.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerGetEntityContext(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.tool(
    'get_entity_context',
    'Get full context for a named entity (person, location, concept, event, organization): occurrence count, source documents, related entities, and associated tags.',
    {
      entity: z.string().describe('Entity name to look up'),
      entityType: z.enum(['PERSON', 'LOCATION', 'CONCEPT', 'EVENT', 'ORGANIZATION', 'DATE'])
        .optional().describe('Entity type filter (optional)'),
    },
    async ({ entity, entityType }) => {
      try {
        const db = services.vectorStore as any;

        // Search entities in the database
        const entityLower = entity.toLowerCase();
        let entitiesStmt;
        let entities: any[];

        if (entityType) {
          entitiesStmt = db.db?.prepare?.(
            'SELECT * FROM entities WHERE (LOWER(name) LIKE ? OR LOWER(normalized_name) LIKE ?) AND type = ?'
          );
          entities = entitiesStmt?.all(`%${entityLower}%`, `%${entityLower}%`, entityType) || [];
        } else {
          entitiesStmt = db.db?.prepare?.(
            'SELECT * FROM entities WHERE LOWER(name) LIKE ? OR LOWER(normalized_name) LIKE ?'
          );
          entities = entitiesStmt?.all(`%${entityLower}%`, `%${entityLower}%`) || [];
        }

        if (entities.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No entity matching "${entity}" found in the corpus.` }],
          };
        }

        // Get mentions for each entity
        const mentionsStmt = db.db?.prepare?.(
          'SELECT em.*, c.content AS chunk_content, c.document_id, d.title AS doc_title, d.source_type ' +
          'FROM entity_mentions em ' +
          'LEFT JOIN chunks c ON em.chunk_id = c.id ' +
          'LEFT JOIN documents d ON c.document_id = d.id ' +
          'WHERE em.entity_id = ?'
        );

        const entityResults = entities.map((ent: any) => {
          const mentions = mentionsStmt?.all(ent.id) || [];

          // Deduplicate documents
          const docMap = new Map<string, any>();
          for (const m of mentions) {
            if (m.document_id && !docMap.has(m.document_id)) {
              docMap.set(m.document_id, {
                title: m.doc_title,
                sourceType: m.source_type,
                excerpt: m.chunk_content?.substring(0, 200),
              });
            }
          }

          return {
            name: ent.name,
            type: ent.type,
            occurrences: mentions.length,
            documents: Array.from(docMap.values()),
          };
        });

        // Get related entities from the knowledge graph
        let relatedEntities: any[] = [];
        try {
          const graphBuilder = new KnowledgeGraphBuilder(services.vectorStore);
          const graphData = graphBuilder.build();

          const entityIds = entities.map((e: any) => `entity:${e.id}`);
          const neighbors = new Map<string, { label: string; type: string; edgeType: string; weight: number }>();

          for (const edge of graphData.edges) {
            for (const eid of entityIds) {
              const neighborId = edge.source === eid ? edge.target :
                                 edge.target === eid ? edge.source : null;
              if (neighborId && !entityIds.includes(neighborId)) {
                const node = graphData.nodes.find(n => n.id === neighborId);
                if (node && !neighbors.has(neighborId)) {
                  neighbors.set(neighborId, {
                    label: node.label,
                    type: node.entityType || node.type,
                    edgeType: edge.type,
                    weight: edge.weight,
                  });
                }
              }
            }
          }

          relatedEntities = Array.from(neighbors.values())
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 15);
        } catch {
          // Graph might not be available
        }

        // Get associated tags
        const tagSet = new Set<string>();
        for (const ent of entityResults) {
          for (const doc of ent.documents) {
            // Check if the document has tags in vault_notes
            const noteStmt = db.db?.prepare?.(
              'SELECT tags_json FROM vault_notes WHERE id IN (SELECT id FROM documents WHERE title = ?)'
            );
            const noteRow = noteStmt?.get(doc.title);
            if (noteRow?.tags_json) {
              try {
                const noteTags = JSON.parse(noteRow.tags_json);
                noteTags.forEach((t: string) => tagSet.add(t));
              } catch { /* ignore */ }
            }
          }
        }

        const result = {
          entities: entityResults,
          relatedEntities,
          tags: Array.from(tagSet),
        };

        // Log access
        logger.log({
          type: 'tool',
          name: 'get_entity_context',
          input: { entity, entityType },
          outputSummary: {
            itemCount: entityResults.length,
            totalChars: JSON.stringify(result).length,
          },
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
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
