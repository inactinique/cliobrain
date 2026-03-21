import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../../stores/graphStore';
import { GraphVisualization } from './GraphVisualization';
import { Network, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export function GraphPanel() {
  const { t } = useTranslation();
  const { nodes, edges, isLoading, selectedNodeId, loadGraph, selectNode } = useGraphStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height: 400 });

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    selectNode(node.id === selectedNodeId ? null : node.id);
  }, [selectNode, selectedNodeId]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        <RefreshCw size={16} className="animate-spin mr-2" />
        {t('app.loading')}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm p-4">
        <Network size={32} className="mb-2 opacity-50" />
        <p>{t('graph.noData')}</p>
        <p className="text-xs mt-1 text-center">
          {t('graph.entities')}: 0 | {t('graph.relations')}: 0
        </p>
      </div>
    );
  }

  // Count by type
  const entityCount = nodes.filter(n => n.type === 'entity').length;
  const docCount = nodes.filter(n => n.type === 'document' || n.type === 'note').length;

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {t('graph.entities')}: {entityCount} | Docs: {docCount} | {t('graph.relations')}: {edges.length}
        </div>
        <button
          onClick={() => loadGraph()}
          className="p-1 text-gray-400 hover:text-blue-600"
          title={t('vault.reindex')}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Selected node info */}
      {selectedNodeId && (
        <SelectedNodeInfo
          node={nodes.find(n => n.id === selectedNodeId)}
          onClose={() => selectNode(null)}
        />
      )}

      {/* Graph canvas */}
      <div ref={containerRef} className="flex-1 bg-gray-950">
        <GraphVisualization
          nodes={nodes}
          edges={edges}
          width={dimensions.width}
          height={dimensions.height}
          onNodeClick={handleNodeClick}
          selectedNodeId={selectedNodeId}
        />
      </div>
    </div>
  );
}

function SelectedNodeInfo({ node, onClose }: { node: any; onClose: () => void }) {
  if (!node) return null;

  const typeLabels: Record<string, string> = {
    document: 'Document',
    note: 'Note Obsidian',
    entity: node.entityType || 'Entité',
  };

  return (
    <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">{node.label}</div>
        <div className="text-[10px] text-blue-600 dark:text-blue-400">
          {typeLabels[node.type] || node.type}
          {node.community !== undefined && ` · Communauté ${node.community}`}
        </div>
      </div>
      <button onClick={onClose} className="text-xs text-blue-500 hover:text-blue-700 shrink-0 ml-2">
        ✕
      </button>
    </div>
  );
}
