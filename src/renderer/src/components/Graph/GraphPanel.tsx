import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../../stores/graphStore';
import { GraphVisualization } from './GraphVisualization';
import { Network, RefreshCw, AlertCircle, Sparkles, Square } from 'lucide-react';

interface NERProgress {
  isRunning: boolean;
  currentDocument?: string;
  documentsTotal: number;
  documentsProcessed: number;
  chunksTotal: number;
  chunksProcessed: number;
  entitiesFound: number;
}

export function GraphPanel() {
  const { t } = useTranslation();
  const { nodes, edges, isLoading, error, selectedNodeId, loadGraph, selectNode } = useGraphStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [nerProgress, setNerProgress] = useState<NERProgress | null>(null);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Listen for NER progress events
  useEffect(() => {
    const unsub = window.electron.ner.onProgress((progress: NERProgress) => {
      setNerProgress(progress);
      // Reload graph when NER finishes to show new entities
      if (!progress.isRunning && progress.documentsProcessed > 0) {
        loadGraph();
      }
    });
    // Also fetch initial progress
    window.electron.ner.getProgress().then((r: any) => {
      if (r.success) setNerProgress(r.data);
    });
    return () => { unsub?.(); };
  }, [loadGraph]);

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
      <div className="h-full flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-4" style={{ color: 'var(--text-muted)' }}>
          <Network size={32} className="mb-2 opacity-40" />
          <p className="text-sm mb-3">{t('graph.noData')}</p>
          {!nerProgress?.isRunning && (
            <button onClick={() => window.electron.ner.start()} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Sparkles size={14} />
              {t('ner.start')}
            </button>
          )}
        </div>
        <NERStatusBar progress={nerProgress} t={t} />
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
          {t('graph.entities')}: {entityCount} | {t('graph.docs')}: {docCount} | {t('graph.relations')}: {edges.length}
        </div>
        <button
          onClick={() => loadGraph()}
          className="p-1 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title={t('graph.refresh')}
          aria-label={t('graph.refresh')}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <AlertCircle size={14} className="shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

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

      {/* NER status bar */}
      <NERStatusBar progress={nerProgress} t={t} />
    </div>
  );
}

function NERStatusBar({ progress, t }: { progress: NERProgress | null; t: any }) {
  const isRunning = progress?.isRunning ?? false;
  const pct = progress && progress.documentsTotal > 0
    ? Math.round((progress.documentsProcessed / progress.documentsTotal) * 100)
    : 0;

  const handleStart = () => { window.electron.ner.start(); };
  const handleStop = () => { window.electron.ner.stop(); };

  return (
    <div className="shrink-0 px-3 py-1.5 flex items-center gap-2 text-xs" style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-panel)' }}>
      {isRunning ? (
        <>
          <Sparkles size={12} className="animate-pulse shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between" style={{ color: 'var(--text-tertiary)' }}>
              <span className="truncate">{progress?.currentDocument || t('ner.running')}</span>
              <span className="shrink-0 ml-1">{pct}%</span>
            </div>
            <div className="w-full h-1 rounded mt-0.5" style={{ background: 'var(--bg-input)' }}>
              <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: 'var(--color-accent)' }} />
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              {t('ner.progress', { processed: progress?.documentsProcessed || 0, total: progress?.documentsTotal || 0 })}
              {' · '}{t('ner.entities', { count: progress?.entitiesFound || 0 })}
            </div>
          </div>
          <button onClick={handleStop} className="p-1 shrink-0" style={{ color: 'var(--text-muted)' }} aria-label={t('ner.stop')} title={t('ner.stop')}>
            <Square size={12} />
          </button>
        </>
      ) : (
        <>
          <Sparkles size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
          <span className="flex-1" style={{ color: 'var(--text-muted)' }}>
            {progress && progress.documentsProcessed > 0
              ? `${t('ner.done')} · ${t('ner.entities', { count: progress.entitiesFound })}`
              : t('ner.idle')}
          </span>
          <button onClick={handleStart} className="btn-primary text-[10px] px-2 py-0.5" aria-label={t('ner.start')}>
            {t('ner.start')}
          </button>
        </>
      )}
    </div>
  );
}

function SelectedNodeInfo({ node, onClose }: { node: any; onClose: () => void }) {
  const { t } = useTranslation();
  if (!node) return null;

  const typeLabels: Record<string, string> = {
    document: t('graph.document'),
    note: t('graph.obsidianNote'),
    entity: node.entityType || t('graph.entity'),
  };

  return (
    <div className="shrink-0 px-3 py-2 flex items-center justify-between" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
      <div className="min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{node.label}</div>
        <div className="text-xs" style={{ color: 'var(--color-accent)' }}>
          {typeLabels[node.type] || node.type}
          {node.community !== undefined && ` · ${t('graph.community')} ${node.community}`}
        </div>
      </div>
      <button onClick={onClose} className="text-xs shrink-0 ml-2" style={{ color: 'var(--text-muted)' }} aria-label={t('graph.closeDetail')}>✕</button>
    </div>
  );
}
