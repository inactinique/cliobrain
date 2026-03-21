import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSourcesStore } from '../../stores/sourcesStore';
import { FileText, BookOpen, Camera, FolderOpen, Plus, Upload } from 'lucide-react';

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
      {/* Sub-tabs */}
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
        {activeTab === 'documents' && (
          <>
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-sm" style={{ color: 'var(--text-muted)' }}>
                <Upload size={32} className="mb-2 opacity-40" />
                <p>{t('sources.noDocuments')}</p>
                <button onClick={handleAddDocument} className="btn-primary mt-2 flex items-center gap-1 text-xs">
                  <Plus size={14} />
                  {t('sources.addDocuments')}
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <button onClick={handleAddDocument} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded" style={{ color: 'var(--color-accent)' }}>
                  <Plus size={14} />
                  {t('sources.addDocuments')}
                </button>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start gap-2 px-2 py-2 rounded cursor-pointer transition-colors"
                    style={{ borderRadius: 'var(--radius-sm)' }}
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
            )}
          </>
        )}

        {activeTab === 'zotero' && (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
            Zotero - {t('settings.zotero')}
          </div>
        )}
        {activeTab === 'tropy' && (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
            Tropy - {t('settings.tropy')}
          </div>
        )}
        {activeTab === 'folders' && (
          <div className="flex flex-col items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
            <FolderOpen size={32} className="mb-2 opacity-40" />
            <button
              onClick={async () => {
                const result = await window.electron.dialog.openDirectory();
                if (result.success && result.data) await window.electron.folder.addWatch(result.data);
              }}
              className="btn-primary mt-2 flex items-center gap-1 text-xs"
            >
              <Plus size={14} />
              {t('sources.addFolder')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
