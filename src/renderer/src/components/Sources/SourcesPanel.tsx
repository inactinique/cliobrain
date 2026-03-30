import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSourcesStore } from '../../stores/sourcesStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { FileText, BookOpen, Camera, FolderOpen, Plus, Upload, RefreshCw, Library, AlertCircle, Search } from 'lucide-react';

export function SourcesPanel() {
  const { t } = useTranslation();
  const { documents, activeTab, setActiveTab, loadDocuments, error, isLoading } = useSourcesStore();
  const currentWorkspace = useWorkspaceStore(s => s.current);

  // Reload documents when the workspace changes
  useEffect(() => { loadDocuments(); }, [currentWorkspace, loadDocuments]);

  const handleAddDocument = async () => {
    const result = await window.electron.dialog.openFile({
      filters: [{ name: 'Documents', extensions: ['pdf', 'txt', 'html', 'htm', 'md', 'docx'] }],
      multiple: true,
    });
    if (result.success && result.data) {
      for (const filePath of result.data) await window.electron.document.ingest(filePath);
      loadDocuments();
    }
  };

  const tabs = [
    { id: 'documents' as const, label: t('sources.documents'), icon: <FileText size={14} /> },
    { id: 'zotero' as const, label: t('sources.zotero'), icon: <BookOpen size={14} /> },
    { id: 'tropy' as const, label: t('sources.tropy'), icon: <Camera size={14} /> },
    { id: 'folders' as const, label: t('sources.folders'), icon: <FolderOpen size={14} /> },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex px-2 pt-2 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
            style={{
              background: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--text-tertiary)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 mx-2 mt-1 px-2 py-1.5 rounded text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <AlertCircle size={14} className="shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {/* All tabs stay mounted to preserve state; only the active one is visible */}
        <div style={{ display: activeTab === 'documents' ? 'contents' : 'none' }}>
          <DocumentsTab documents={documents} onAdd={handleAddDocument} isLoading={isLoading} />
        </div>
        <div className={activeTab === 'zotero' ? 'h-full' : 'hidden'}>
          <ZoteroTab />
        </div>
        <div style={{ display: activeTab === 'tropy' ? 'contents' : 'none' }}>
          <TropyTab />
        </div>
        <div style={{ display: activeTab === 'folders' ? 'contents' : 'none' }}>
          <FoldersTab />
        </div>
      </div>
    </div>
  );
}

// ── Documents Tab ────────────────────────────────────────────────

function DocumentsTab({ documents, onAdd, isLoading }: { documents: any[]; onAdd: () => void; isLoading?: boolean }) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-muted)' }}>
        <RefreshCw size={16} className="animate-spin mr-2" />
        {t('app.loading')}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm" style={{ color: 'var(--text-muted)' }}>
        <Upload size={32} className="mb-2 opacity-40" />
        <p>{t('sources.noDocuments')}</p>
        <button onClick={onAdd} className="btn-primary mt-2 flex items-center gap-1 text-xs">
          <Plus size={14} />
          {t('sources.addDocuments')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button onClick={onAdd} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded" style={{ color: 'var(--color-accent)' }}>
        <Plus size={14} />
        {t('sources.addDocuments')}
      </button>
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-start gap-2 px-2 py-2 rounded cursor-pointer transition-colors"
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <FileText size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
          <div className="min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{doc.title}</div>
            {doc.author && (
              <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {doc.author}{doc.year ? ` (${doc.year})` : ''}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Zotero Tab ───────────────────────────────────────────────────

// Build a tree from flat collections with parentKey
interface CollectionNode {
  key: string;
  name: string;
  parentKey?: string;
  children: CollectionNode[];
}

function buildCollectionTree(flat: Array<{ key: string; name: string; parentKey?: string }>): CollectionNode[] {
  const map = new Map<string, CollectionNode>();
  const roots: CollectionNode[] = [];

  // Create nodes
  for (const col of flat) {
    map.set(col.key, { ...col, children: [] });
  }

  // Build tree
  for (const node of map.values()) {
    if (node.parentKey && map.has(node.parentKey)) {
      map.get(node.parentKey)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort alphabetically at each level
  const sortNodes = (nodes: CollectionNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  return roots;
}

function CollectionTreeItem({
  node,
  depth,
  selectedKeys,
  onToggle,
}: {
  node: CollectionNode;
  depth: number;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedKeys.has(node.key);

  return (
    <>
      <div
        className="flex items-center gap-1 py-1 rounded text-xs cursor-pointer transition-colors"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className="w-4 h-4 flex items-center justify-center shrink-0"
          style={{ color: 'var(--text-muted)', visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {expanded ? '▾' : '▸'}
        </button>

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(node.key)}
          className="accent-blue-600 shrink-0"
        />

        {/* Collection name */}
        <BookOpen size={11} className="shrink-0" style={{ color: 'var(--color-accent)' }} />
        <span
          className="truncate"
          style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          onClick={() => onToggle(node.key)}
        >
          {node.name}
        </span>
      </div>

      {/* Children */}
      {expanded && node.children.map(child => (
        <CollectionTreeItem
          key={child.key}
          node={child}
          depth={depth + 1}
          selectedKeys={selectedKeys}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

/** Collect all collection keys from a tree (node + all descendants) */
function collectAllKeys(nodes: CollectionNode[]): string[] {
  const keys: string[] = [];
  const walk = (list: CollectionNode[]) => {
    for (const n of list) {
      keys.push(n.key);
      walk(n.children);
    }
  };
  walk(nodes);
  return keys;
}

/** Filter a collection tree: keep nodes whose name matches (case-insensitive) or that have matching descendants */
function filterCollectionTree(nodes: CollectionNode[], query: string): CollectionNode[] {
  const q = query.toLowerCase();
  const filter = (list: CollectionNode[]): CollectionNode[] => {
    const result: CollectionNode[] = [];
    for (const node of list) {
      const filteredChildren = filter(node.children);
      if (node.name.toLowerCase().includes(q) || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
    return result;
  };
  return filter(nodes);
}

interface ZoteroLibrary {
  libraryID: number;
  type: 'user' | 'group';
  name: string;
  collections: CollectionNode[];
}

function ZoteroTab() {
  const { t } = useTranslation();
  const [libraries, setLibraries] = useState<ZoteroLibrary[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [zoteroError, setZoteroError] = useState<string | null>(null);
  const [dataDirectory, setDataDirectory] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState('');

  useEffect(() => {
    loadZoteroConfig();
  }, []);

  const loadZoteroConfig = async () => {
    const wsResult = await window.electron.workspace.getConfig();
    if (wsResult.success && wsResult.data?.zotero?.dataDirectory) {
      const dir = wsResult.data.zotero.dataDirectory;
      setDataDirectory(dir);
      setIsConfigured(true);
      const saved = wsResult.data.zotero.selectedCollections || [];
      setSelectedKeys(new Set(saved));
      loadLibrariesAndCollections(dir);
    }
  };

  const loadLibrariesAndCollections = async (dir: string) => {
    setIsLoading(true);
    setZoteroError(null);
    try {
      // 1. Load all libraries (personal + groups)
      const libResult = await window.electron.zotero.listLibraries(dir);
      if (!libResult.success) {
        setZoteroError(libResult.error || 'Failed to load libraries');
        setIsLoading(false);
        return;
      }

      const rawLibs: Array<{ libraryID: number; type: string; name: string }> = libResult.data || [];

      // 2. For each library, load its collections
      const loadedLibraries: ZoteroLibrary[] = [];
      for (const lib of rawLibs) {
        const colResult = await window.electron.zotero.listCollections({
          dataDirectory: dir,
          libraryID: lib.libraryID,
        });
        const collections = colResult.success
          ? buildCollectionTree(colResult.data || [])
          : [];

        loadedLibraries.push({
          libraryID: lib.libraryID,
          type: lib.type as 'user' | 'group',
          name: lib.name,
          collections,
        });
      }

      // 3. Sort: personal library first, then groups alphabetically
      loadedLibraries.sort((a, b) => {
        if (a.type === 'user' && b.type !== 'user') return -1;
        if (a.type !== 'user' && b.type === 'user') return 1;
        return a.name.localeCompare(b.name, 'fr');
      });

      setLibraries(loadedLibraries);
    } catch (e) {
      console.error('[ZoteroTab] Failed to load libraries:', e);
      setZoteroError(String(e));
    }
    setIsLoading(false);
  };

  const handleToggle = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      window.electron.workspace.updateConfig({
        zotero: { dataDirectory, selectedCollections: Array.from(next) },
      });
      return next;
    });
  };

  const handleToggleGroup = (collections: CollectionNode[]) => {
    const allKeys = collectAllKeys(collections);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      const allSelected = allKeys.every(k => next.has(k));
      if (allSelected) {
        // Unselect all
        for (const k of allKeys) next.delete(k);
      } else {
        // Select all
        for (const k of allKeys) next.add(k);
      }
      window.electron.workspace.updateConfig({
        zotero: { dataDirectory, selectedCollections: Array.from(next) },
      });
      return next;
    });
  };

  const handleSyncSelected = async () => {
    if (!dataDirectory || selectedKeys.size === 0) return;
    setIsSyncing(true);
    setZoteroError(null);
    try {
      for (const key of selectedKeys) {
        await window.electron.zotero.sync({ dataDirectory, collectionKey: key });
      }
    } catch (e) {
      console.error('[ZoteroTab] Sync failed:', e);
      setZoteroError(String(e));
    }
    setIsSyncing(false);
  };

  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
        <BookOpen size={32} className="mb-2 opacity-40" />
        <p>{t('sources.zoteroNotConfigured')}</p>
        <p className="mt-1 text-center">{t('sources.zoteroConfigHint')}</p>
      </div>
    );
  }

  // Separate personal library and groups, apply search filter
  const userLib = libraries.find(l => l.type === 'user');
  const groupLibs = libraries.filter(l => l.type === 'group');

  const filteredUserCollections = userLib
    ? (filterQuery ? filterCollectionTree(userLib.collections, filterQuery) : userLib.collections)
    : [];
  const filteredGroups = groupLibs.map(g => ({
    ...g,
    collections: filterQuery ? filterCollectionTree(g.collections, filterQuery) : g.collections,
  })).filter(g => {
    // Keep groups that match the filter in name or have matching collections
    if (!filterQuery) return true;
    return g.name.toLowerCase().includes(filterQuery.toLowerCase()) || g.collections.length > 0;
  });

  return (
    <div className="space-y-1">
      {zoteroError && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <AlertCircle size={14} className="shrink-0" />
          <span className="truncate">{zoteroError}</span>
        </div>
      )}

      {/* Search filter */}
      <div className="px-1 relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          value={filterQuery}
          onChange={e => setFilterQuery(e.target.value)}
          placeholder={t('sources.zoteroFilterPlaceholder')}
          className="w-full pl-6 pr-2 py-1 text-xs input"
          style={{ borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {selectedKeys.size > 0
            ? t('sources.zoteroCollectionsSelected', { count: selectedKeys.size })
            : t('sources.zoteroSelectHint')}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => loadLibrariesAndCollections(dataDirectory)}
            className="p-1 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title={t('sources.refresh')}
            aria-label={t('sources.refresh')}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleSyncSelected}
            disabled={isSyncing || selectedKeys.size === 0}
            className="btn-primary text-xs px-2 py-1 flex items-center gap-1 disabled:opacity-40"
          >
            <Library size={12} />
            {isSyncing ? t('sources.syncing') : t('sources.syncCount', { count: selectedKeys.size })}
          </button>
        </div>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        {/* Personal library */}
        {userLib && filteredUserCollections.length > 0 && (
          <div>
            <div className="flex items-center gap-1 px-2 py-1">
              <input
                type="checkbox"
                checked={userLib.collections.length > 0 && collectAllKeys(userLib.collections).every(k => selectedKeys.has(k))}
                onChange={() => handleToggleGroup(userLib.collections)}
                className="accent-blue-600 shrink-0"
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {t('sources.zoteroMyLibrary')}
              </span>
            </div>
            {filteredUserCollections.map(node => (
              <CollectionTreeItem key={node.key} node={node} depth={0} selectedKeys={selectedKeys} onToggle={handleToggle} />
            ))}
          </div>
        )}

        {/* Groups */}
        {filteredGroups.length > 0 && (
          <div className="mt-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {t('sources.zoteroGroups')}
            </div>
            {filteredGroups.map(group => {
              const allGroupKeys = collectAllKeys(group.collections);
              const allGroupSelected = allGroupKeys.length > 0 && allGroupKeys.every(k => selectedKeys.has(k));
              return (
                <div key={group.libraryID}>
                  <div
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <input
                      type="checkbox"
                      checked={allGroupSelected}
                      onChange={() => handleToggleGroup(group.collections)}
                      className="accent-blue-600 shrink-0"
                    />
                    <BookOpen size={11} style={{ color: 'var(--color-accent)' }} />
                    {group.name}
                  </div>
                  {group.collections.map(node => (
                    <CollectionTreeItem key={node.key} node={node} depth={1} selectedKeys={selectedKeys} onToggle={handleToggle} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tropy Tab ────────────────────────────────────────────────────

function TropyTab() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
      <Camera size={32} className="mb-2 opacity-40" />
      <p>{t('sources.tropyNotConfigured')}</p>
      <p className="mt-1 text-center">{t('sources.tropyConfigHint')}</p>
    </div>
  );
}

// ── Folders Tab ──────────────────────────────────────────────────

function FoldersTab() {
  const { t } = useTranslation();
  const [watched, setWatched] = useState<string[]>([]);

  useEffect(() => {
    window.electron.folder.listWatched().then(r => {
      if (r.success) setWatched(r.data || []);
    });
  }, []);

  return (
    <div className="space-y-1">
      {watched.map((p) => (
        <div key={p} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ background: 'var(--bg-card)' }}>
          <FolderOpen size={12} style={{ color: 'var(--color-accent)' }} />
          <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{p}</span>
        </div>
      ))}
      <button
        onClick={async () => {
          const result = await window.electron.dialog.openDirectory();
          if (result.success && result.data) {
            await window.electron.folder.addWatch(result.data);
            setWatched(prev => [...prev, result.data]);
          }
        }}
        className="w-full flex items-center justify-center gap-1 py-2 rounded text-xs"
        style={{ border: '1px dashed var(--border-color)', color: 'var(--text-muted)' }}
      >
        <Plus size={14} />
        {t('sources.addFolder')}
      </button>
    </div>
  );
}
