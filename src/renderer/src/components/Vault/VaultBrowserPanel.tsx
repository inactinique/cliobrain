import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVaultStore } from '../../stores/vaultStore';
import { VaultTreeView } from './VaultTreeView';
import { VaultNotePreview } from './VaultNotePreview';
import {
  FolderTree,
  List,
  Tags,
  Search,
  ExternalLink,
  RefreshCw,
  FolderOpen,
  Unplug,
  AlertCircle,
} from 'lucide-react';

export function VaultBrowserPanel() {
  const { t } = useTranslation();
  const {
    isConnected,
    vaultName,
    fileCount,
    viewMode,
    setViewMode,
    tree,
    notes,
    tags,
    searchQuery,
    searchResults,
    selectedNotePath,
    selectedNoteDetail,
    connect,
    disconnect,
    loadNotes,
    selectNote,
    search,
    openInObsidian,
    reindex,
    isIndexing,
    error,
  } = useVaultStore();

  const [localSearch, setLocalSearch] = useState('');

  // Load notes list when switching to list view
  useEffect(() => {
    if (isConnected && viewMode === 'list' && notes.length === 0) {
      loadNotes();
    }
  }, [isConnected, viewMode, notes.length, loadNotes]);

  const handleConnect = async () => {
    const result = await window.electron.dialog.openDirectory();
    if (result.success && result.data) {
      await connect(result.data);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    search(localSearch);
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm p-4" style={{ color: 'var(--text-muted)' }}>
        <FolderOpen size={32} className="mb-3 opacity-50" />
        <p className="mb-1">{t('vault.notConnected')}</p>
        <button
          onClick={handleConnect}
          className="btn-primary mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs"
        >
          <FolderOpen size={14} />
          {t('vault.connect')}
        </button>
      </div>
    );
  }

  // Note detail view
  if (selectedNoteDetail) {
    return (
      <VaultNotePreview
        note={selectedNoteDetail}
        onBack={() => selectNote(null)}
        onOpenInObsidian={() => openInObsidian(selectedNoteDetail.relativePath)}
        onNavigate={(path) => selectNote(path)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 mx-2 mt-2 px-2 py-1.5 rounded text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <AlertCircle size={14} className="shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Header */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-xs font-medium truncate">{vaultName}</span>
            <span className="text-xs text-gray-400">({fileCount})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => reindex()}
              disabled={isIndexing}
              className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50"
              title={t('vault.reindex')}
              aria-label={t('vault.reindex')}
            >
              <RefreshCw size={14} className={isIndexing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => disconnect()}
              className="p-1 text-gray-400 hover:text-red-500"
              title={t('vault.disconnect')}
              aria-label={t('vault.disconnect')}
            >
              <Unplug size={14} />
            </button>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={t('common.search')}
            className="w-full pl-7 pr-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </form>

        {/* View mode tabs */}
        <div className="flex gap-1 mt-2">
          <ViewButton active={viewMode === 'tree'} onClick={() => setViewMode('tree')} icon={<FolderTree size={14} />} label={t('vault.viewTree')} />
          <ViewButton active={viewMode === 'list'} onClick={() => setViewMode('list')} icon={<List size={14} />} label={t('vault.viewList')} />
          <ViewButton active={viewMode === 'tags'} onClick={() => setViewMode('tags')} icon={<Tags size={14} />} label={t('vault.viewTags')} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Search results */}
        {searchQuery && searchResults.length > 0 ? (
          <div className="p-2 space-y-1">
            <div className="text-xs text-gray-400 px-1 mb-1">
              {searchResults.length} {t('vault.results')}
            </div>
            {searchResults.map((note) => (
              <NoteListItem
                key={note.relativePath}
                note={note}
                onSelect={() => selectNote(note.relativePath)}
              />
            ))}
          </div>
        ) : searchQuery ? (
          <div className="p-4 text-center text-xs text-gray-400">
            {t('vault.noResults')}
          </div>
        ) : viewMode === 'tree' ? (
          <VaultTreeView
            tree={tree}
            onSelectNote={(path) => selectNote(path)}
          />
        ) : viewMode === 'list' ? (
          <div className="p-2 space-y-1">
            {notes.map((note) => (
              <NoteListItem
                key={note.relativePath}
                note={note}
                onSelect={() => selectNote(note.relativePath)}
              />
            ))}
          </div>
        ) : viewMode === 'tags' ? (
          <div className="p-2 flex flex-wrap gap-1">
            {tags.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => { setLocalSearch(`#${tag}`); search(tag); }}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs hover:bg-purple-200 dark:hover:bg-purple-900/50"
              >
                #{tag}
                <span className="text-purple-400 text-[10px]">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label?: string }) {
  return (
    <button
      onClick={onClick}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
      }`}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
    </button>
  );
}

function NoteListItem({ note, onSelect }: { note: any; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      <div className="text-xs font-medium truncate">{note.title}</div>
      {note.tags.length > 0 && (
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {note.tags.slice(0, 3).map((tag: string) => (
            <span key={tag} className="text-[10px] text-purple-500">#{tag}</span>
          ))}
        </div>
      )}
      {note.snippet && (
        <div className="text-[11px] text-gray-400 truncate mt-0.5">{note.snippet}</div>
      )}
    </button>
  );
}
