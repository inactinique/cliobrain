/**
 * Entity and knowledge graph types for ClioBrain
 */

export type EntityType = 'PERSON' | 'LOCATION' | 'DATE' | 'ORGANIZATION' | 'EVENT' | 'CONCEPT';

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  normalizedName: string;
  aliases: string[];
  createdAt: string;
}

export interface EntityMention {
  id: string;
  entityId: string;
  chunkId: string;
  documentId: string;
  context?: string;
  startPosition?: number;
  endPosition?: number;
}

export interface EntityRelation {
  entity1Id: string;
  entity2Id: string;
  relationType: string;
  weight: number;
  sourceIds: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  communities?: Record<string, number>;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'document' | 'entity' | 'note';
  entityType?: EntityType;
  metadata?: Record<string, unknown>;
  community?: number;
  size?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'citation' | 'similarity' | 'co-occurrence' | 'mention' | 'link';
  weight: number;
}
