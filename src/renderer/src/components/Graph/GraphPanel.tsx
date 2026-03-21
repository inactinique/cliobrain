import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../../stores/graphStore';
import { Network } from 'lucide-react';

export function GraphPanel() {
  const { t } = useTranslation();
  const { nodes, edges, isLoading, loadGraph } = useGraphStore();

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
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

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500">
        {t('graph.entities')}: {nodes.length} | {t('graph.relations')}: {edges.length}
      </div>

      {/* Graph visualization placeholder - will be replaced with react-force-graph-2d */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-400 text-xs">
          <Network size={48} className="mx-auto mb-2 opacity-30" />
          <p>Graphe de connaissances</p>
          <p className="mt-1">{nodes.length} noeuds, {edges.length} liens</p>
        </div>
      </div>
    </div>
  );
}
