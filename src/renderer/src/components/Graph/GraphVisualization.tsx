import { useCallback, useRef, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

interface GraphNode {
  id: string;
  label: string;
  type: 'document' | 'entity' | 'note';
  entityType?: string;
  community?: number;
  size?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface GraphVisualizationProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  selectedNodeId?: string | null;
}

// Color palettes
const NODE_COLORS: Record<string, string> = {
  document: '#3b82f6',  // blue
  note: '#8b5cf6',      // purple
  entity: '#f59e0b',    // amber
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  PERSON: '#ef4444',       // red
  LOCATION: '#22c55e',     // green
  DATE: '#06b6d4',         // cyan
  ORGANIZATION: '#f97316', // orange
  EVENT: '#ec4899',        // pink
  CONCEPT: '#a855f7',      // purple
};

const EDGE_COLORS: Record<string, string> = {
  'co-occurrence': '#94a3b8',
  'mention': '#cbd5e1',
  'link': '#8b5cf6',
  'similarity': '#3b82f6',
};

const COMMUNITY_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

export function GraphVisualization({
  nodes,
  edges,
  width,
  height,
  onNodeClick,
  selectedNodeId,
}: GraphVisualizationProps) {
  const fgRef = useRef<any>();

  const graphData = useMemo(() => ({
    nodes: nodes.map(n => ({ ...n })),
    links: edges.map(e => ({ ...e })),
  }), [nodes, edges]);

  const getNodeColor = useCallback((node: any) => {
    if (node.id === selectedNodeId) return '#ffffff';
    if (node.community !== undefined) {
      return COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length];
    }
    if (node.type === 'entity' && node.entityType) {
      return ENTITY_TYPE_COLORS[node.entityType] || NODE_COLORS.entity;
    }
    return NODE_COLORS[node.type] || '#6b7280';
  }, [selectedNodeId]);

  const getNodeSize = useCallback((node: any) => {
    if (node.id === selectedNodeId) return (node.size || 2) * 2;
    return node.size || 2;
  }, [selectedNodeId]);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.label || '';
    const fontSize = Math.max(10 / globalScale, 1.5);
    const nodeSize = getNodeSize(node);
    const color = getNodeColor(node);

    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    if (node.id === selectedNodeId) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Draw label (only if zoomed enough)
    if (globalScale > 1.5 || node.id === selectedNodeId) {
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(label, node.x, node.y + nodeSize + 1);
    }
  }, [getNodeColor, getNodeSize, selectedNodeId]);

  const handleNodeClick = useCallback((node: any) => {
    onNodeClick?.(node as GraphNode);

    // Zoom to node
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 400);
      fgRef.current.zoom(3, 400);
    }
  }, [onNodeClick]);

  if (nodes.length === 0) return null;

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={graphData}
      width={width}
      height={height}
      nodeCanvasObject={nodeCanvasObject}
      nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
        const size = getNodeSize(node);
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      }}
      linkColor={(link: any) => EDGE_COLORS[link.type] || '#475569'}
      linkWidth={(link: any) => Math.max(0.5, Math.min(link.weight || 1, 3))}
      linkDirectionalParticles={0}
      onNodeClick={handleNodeClick}
      backgroundColor="transparent"
      cooldownTicks={100}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
    />
  );
}
