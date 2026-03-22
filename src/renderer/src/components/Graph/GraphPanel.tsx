import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../../stores/graphStore';
import { GraphVisualization } from './GraphVisualization';
import { Network, RefreshCw } from 'lucide-react';

export function GraphPanel() {
  const { t } = useTranslation();
  const { nodes, edges, isLoading, selectedNodeId, loadGraph, selectNode } = useGraphStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => { loadGraph(); }, [loadGraph]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
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
      <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
        <RefreshCw size={16} className="animate-spin mr-2" />
        {t('app.loading')}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4" style={{ color: 'var(--text-muted)' }}>
        <Network size={32} className="mb-2 opacity-40" />
        <p className="text-sm">{t('graph.noData')}</p>
      </div>
    );
  }

  const entityCount = nodes.filter(n => n.type === 'entity').length;
  const docCount = nodes.filter(n => n.type === 'document' || n.type === 'note').length;

  return (
    <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
      {/* Stats bar */}
      <div className="shrink-0 px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {t('graph.entities')}: {entityCount} | Docs: {docCount} | {t('graph.relations')}: {edges.length}
        </div>
        <button
          onClick={() => loadGraph()}
          className="p-1 transition-colors"
          style={{ color: 'var(--text-muted)' }}
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

      {/* Graph canvas — takes all remaining space */}
      <div
        ref={containerRef}
        className="flex-1 relative"
        style={{ minHeight: 0, background: '#0a0a0a' }}
      >
        {dimensions.width > 0 && dimensions.height > 0 && (
          <div className="absolute inset-0">
            <GraphVisualization
              nodes={nodes}
              edges={edges}
              width={dimensions.width}
              height={dimensions.height}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNodeId}
            />
          </div>
        )}
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
    <div className="shrink-0 px-3 py-2 flex items-center justify-between" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
      <div className="min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{node.label}</div>
        <div className="text-xs" style={{ color: 'var(--color-accent)' }}>
          {typeLabels[node.type] || node.type}
          {node.community !== undefined && ` · Communauté ${node.community}`}
        </div>
      </div>
      <button onClick={onClose} className="text-xs shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>✕</button>
    </div>
  );
}
