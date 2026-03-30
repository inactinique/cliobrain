/**
 * MCP Tool: explore_graph
 *
 * Navigate the knowledge graph built from entities, documents, and wikilinks.
 * Supports neighbor traversal, community detection, and path finding.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KnowledgeGraphBuilder } from '../../core/graph/KnowledgeGraphBuilder.js';
import type { McpServices } from '../services.js';
import type { McpLogger } from '../logger.js';

export function registerExploreGraph(server: McpServer, services: McpServices, logger: McpLogger): void {
  server.tool(
    'explore_graph',
    'Navigate the knowledge graph of entities, documents, and concepts. Find neighbors, communities, or paths between entities.',
    {
      entity: z.string().describe('Entity or concept name to explore'),
      depth: z.number().min(1).max(5).optional().default(1).describe('Traversal depth: 1 = direct neighbors, 2 = neighbors of neighbors (max 5)'),
      maxNodes: z.number().min(1).max(100).optional().default(20).describe('Maximum nodes to return (max 100)'),
      mode: z.enum(['neighbors', 'community', 'path']).optional().default('neighbors').describe('Exploration mode'),
      target: z.string().optional().describe('Target entity for "path" mode'),
    },
    async ({ entity, depth, maxNodes, mode, target }) => {
      try {
        // Build graph from current data
        const graphBuilder = new KnowledgeGraphBuilder(services.vectorStore);
        const graphData = graphBuilder.build();

        const entityLower = entity.toLowerCase();

        // Find the starting node
        const startNode = graphData.nodes.find(
          n => n.label.toLowerCase() === entityLower ||
               n.id.toLowerCase().includes(entityLower)
        );

        if (!startNode) {
          // Try partial match
          const partial = graphData.nodes.filter(
            n => n.label.toLowerCase().includes(entityLower)
          ).slice(0, 5);

          if (partial.length === 0) {
            return {
              content: [{ type: 'text' as const, text: `Entity "${entity}" not found in the knowledge graph.` }],
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                message: `Exact match not found for "${entity}". Did you mean one of these?`,
                suggestions: partial.map(n => ({ id: n.id, label: n.label, type: n.type, entityType: n.entityType })),
              }, null, 2),
            }],
          };
        }

        let result: any;

        if (mode === 'neighbors') {
          result = getNeighbors(startNode.id, graphData, depth, maxNodes);
        } else if (mode === 'community') {
          result = getCommunity(startNode, graphData, maxNodes);
        } else if (mode === 'path') {
          if (!target) {
            return {
              content: [{ type: 'text' as const, text: 'The "target" parameter is required for path mode.' }],
              isError: true,
            };
          }
          const targetLower = target.toLowerCase();
          const targetNode = graphData.nodes.find(
            n => n.label.toLowerCase() === targetLower ||
                 n.id.toLowerCase().includes(targetLower)
          );
          if (!targetNode) {
            return {
              content: [{ type: 'text' as const, text: `Target entity "${target}" not found in the knowledge graph.` }],
            };
          }
          result = findPath(startNode.id, targetNode.id, graphData);
        }

        // Log access
        logger.log({
          type: 'tool',
          name: 'explore_graph',
          input: { entity, depth, maxNodes, mode, target },
          outputSummary: {
            itemCount: result?.nodes?.length || 0,
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

/** Build lookup indexes for O(1) node and edge access */
function buildGraphIndex(graph: any) {
  const nodeById = new Map<string, any>();
  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
  }

  const edgesByNode = new Map<string, any[]>();
  for (const edge of graph.edges) {
    let sourceList = edgesByNode.get(edge.source);
    if (!sourceList) {
      sourceList = [];
      edgesByNode.set(edge.source, sourceList);
    }
    sourceList.push(edge);

    let targetList = edgesByNode.get(edge.target);
    if (!targetList) {
      targetList = [];
      edgesByNode.set(edge.target, targetList);
    }
    targetList.push(edge);
  }

  return { nodeById, edgesByNode };
}

/** BFS neighbor traversal */
function getNeighbors(startId: string, graph: any, depth: number, maxNodes: number) {
  const { nodeById, edgesByNode } = buildGraphIndex(graph);
  const visited = new Set<string>([startId]);
  const queue: Array<{ id: string; level: number }> = [{ id: startId, level: 0 }];
  const resultNodes: any[] = [];
  const resultEdges: any[] = [];

  while (queue.length > 0 && resultNodes.length < maxNodes) {
    const { id, level } = queue.shift()!;

    const node = nodeById.get(id);
    if (node) resultNodes.push(node);

    if (level >= depth) continue;

    // Find connected edges via adjacency list
    const connectedEdges = edgesByNode.get(id) || [];

    for (const edge of connectedEdges) {
      const neighborId = edge.source === id ? edge.target : edge.source;
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({ id: neighborId, level: level + 1 });
        resultEdges.push(edge);
      }
    }
  }

  return { nodes: resultNodes, edges: resultEdges };
}

/** Get all nodes in the same Louvain community */
function getCommunity(startNode: any, graph: any, maxNodes: number) {
  if (startNode.community === undefined) {
    return { nodes: [startNode], edges: [], communities: {} };
  }

  const communityId = startNode.community;
  const communityNodes = graph.nodes
    .filter((n: any) => n.community === communityId)
    .slice(0, maxNodes);

  const nodeIds = new Set(communityNodes.map((n: any) => n.id));
  const communityEdges = graph.edges.filter(
    (e: any) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  return {
    communityId,
    nodes: communityNodes,
    edges: communityEdges,
  };
}

/** BFS shortest path */
function findPath(startId: string, targetId: string, graph: any) {
  const { nodeById, edgesByNode } = buildGraphIndex(graph);
  const visited = new Set<string>([startId]);
  const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;

    if (id === targetId) {
      const pathNodes = path.map((pid: string) => nodeById.get(pid)).filter(Boolean);
      const pathEdges: any[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const adjacentEdges = edgesByNode.get(path[i]) || [];
        const edge = adjacentEdges.find(
          (e: any) => (e.source === path[i] && e.target === path[i + 1]) ||
                      (e.source === path[i + 1] && e.target === path[i])
        );
        if (edge) pathEdges.push(edge);
      }
      return { found: true, pathLength: path.length - 1, nodes: pathNodes, edges: pathEdges };
    }

    // Find connected edges via adjacency list
    const connectedEdges = edgesByNode.get(id) || [];

    for (const edge of connectedEdges) {
      const neighborId = edge.source === id ? edge.target : edge.source;
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({ id: neighborId, path: [...path, neighborId] });
      }
    }
  }

  return { found: false, message: `No path found between the two entities.` };
}
