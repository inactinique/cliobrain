import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSourcesStore } from '../../stores/sourcesStore';
import { FileText, BookOpen, Camera, FolderOpen, Plus, Upload, RefreshCw, Library } from 'lucide-react';

export function SourcesPanel() {
  const { t } = useTranslation();
  const { documents, activeTab, setActiveTab, loadDocuments } = useSourcesStore();

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

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

      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === 'documents' && <DocumentsTab documents={documents} onAdd={handleAddDocument} />}
        {activeTab === 'zotero' && <ZoteroTab />}
        {activeTab === 'tropy' && <TropyTab />}
        {activeTab === 'folders' && <FoldersTab />}
      </div>
    </div>
  );
}

// ── Documents Tab ────────────────────────────────────────────────

function DocumentsTab({ documents, onAdd }: { documents: any[]; onAdd: () => void }) {
  const { t } = useTranslation();

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

function ZoteroTab() {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<any[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataDirectory, setDataDirectory] = useState('');

  useEffect(() => {
    loadZoteroConfig();
  }, []);

  const loadZoteroConfig = async () => {
    const configResult = await window.electron.config.get('zotero');
    if (configResult.success && configResult.data?.dataDirectory) {
      const dir = configResult.data.dataDirectory;
      setDataDirectory(dir);
      setIsConfigured(true);
      loadCollections(dir);
    }
  };

  const loadCollections = async (dir: string) => {
    setIsLoading(true);
    try {
      const result = await window.electron.zotero.listCollections({ dataDirectory: dir });
      if (result.success) {
        setCollections(result.data || []);
      }
    } catch { /* ignore */ }
    setIsLoading(false);
  };

  const handleSync = async (collectionKey?: string) => {
    if (!dataDirectory) return;
    setIsSyncing(true);
    try {
      await window.electron.zotero.sync({
        dataDirectory,
        collectionKey,
      });
    } catch { /* ignore */ }
    setIsSyncing(false);
  };

  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
        <BookOpen size={32} className="mb-2 opacity-40" />
        <p>Zotero non configuré</p>
        <p className="mt-1 text-center">Configurez le chemin Zotero dans les paramètres (Cmd+,)</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {collections.length} collections
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => loadCollections(dataDirectory)}
            className="p-1 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Rafraîchir"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => handleSync()}
            disabled={isSyncing}
            className="btn-primary text-xs px-2 py-1 flex items-center gap-1"
          >
            <Library size={12} />
            {isSyncing ? 'Sync...' : 'Sync tout'}
          </button>
        </div>
      </div>

      {collections.map((col) => (
        <button
          key={col.key}
          onClick={() => handleSync(col.key)}
          className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors"
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <BookOpen size={12} style={{ color: 'var(--color-accent)' }} />
          <span style={{ color: 'var(--text-primary)' }}>{col.name}</span>
        </button>
      ))}
    </div>
  );
}

// ── Tropy Tab ────────────────────────────────────────────────────

function TropyTab() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
      <Camera size={32} className="mb-2 opacity-40" />
      <p>Tropy non configuré</p>
      <p className="mt-1 text-center">Configurez le projet Tropy dans les paramètres (Cmd+,)</p>
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
