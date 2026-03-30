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
        const db = services.vectorStore.database;
        if (!db) {
          return {
            content: [{ type: 'text' as const, text: 'Database not available.' }],
            isError: true,
          };
        }

        // Search entities in the database
        const entityLower = entity.toLowerCase();
        let entities: any[];

        if (entityType) {
          entities = db.prepare(
            'SELECT * FROM entities WHERE (LOWER(name) LIKE ? OR LOWER(normalized_name) LIKE ?) AND type = ?'
          ).all(`%${entityLower}%`, `%${entityLower}%`, entityType);
        } else {
          entities = db.prepare(
            'SELECT * FROM entities WHERE LOWER(name) LIKE ? OR LOWER(normalized_name) LIKE ?'
          ).all(`%${entityLower}%`, `%${entityLower}%`);
        }

        if (entities.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No entity matching "${entity}" found in the corpus.` }],
          };
        }

        // Get mentions for each entity
        const mentionsStmt = db.prepare(
          'SELECT em.*, c.content AS chunk_content, c.document_id, d.title AS doc_title, d.source_type ' +
          'FROM entity_mentions em ' +
          'LEFT JOIN chunks c ON em.chunk_id = c.id ' +
          'LEFT JOIN documents d ON c.document_id = d.id ' +
          'WHERE em.entity_id = ?'
        );

        const entityResults = entities.map((ent: any) => {
          const mentions = mentionsStmt.all(ent.id) as any[];

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

        // Get associated tags from both Obsidian vault_notes and document metadata
        const tagSet = new Set<string>();
        const noteTagsStmt = db.prepare(
          'SELECT tags_json FROM vault_notes WHERE relative_path IN (SELECT file_path FROM documents WHERE title = ?)'
        );
        const docMetaStmt = db.prepare(
          'SELECT metadata_json FROM documents WHERE title = ?'
        );
        for (const ent of entityResults) {
          for (const doc of ent.documents) {
            // Obsidian tags
            const noteRow = noteTagsStmt.get(doc.title) as any;
            if (noteRow?.tags_json) {
              try {
                const noteTags = JSON.parse(noteRow.tags_json);
                noteTags.forEach((t: string) => tagSet.add(t));
              } catch { /* Invalid JSON */ }
            }
            // Zotero/other document metadata tags
            const metaRow = docMetaStmt.get(doc.title) as any;
            if (metaRow?.metadata_json) {
              try {
                const meta = JSON.parse(metaRow.metadata_json);
                if (Array.isArray(meta.tags)) {
                  meta.tags.forEach((t: string) => tagSet.add(t));
                }
              } catch { /* Invalid JSON */ }
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
