import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Brain, Plus, X, Trash2 } from 'lucide-react';

export function WelcomeScreen() {
  const { t } = useTranslation();
  const { workspaces, load, create, deleteWorkspace, loadWorkspaces, isLoading } = useWorkspaceStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await create(name);
    setNewName('');
    setShowCreate(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
      <div className="max-w-md w-full p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'var(--bg-card)' }}
          >
            <Brain className="w-8 h-8" style={{ color: 'var(--color-accent)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>ClioBrain</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {t('app.tagline')}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3 mb-8">
          {showCreate ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('workspace.name')}
                className="input w-full"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={isLoading || !newName.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40">
                  <Plus size={16} />
                  {t('workspace.create')}
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-secondary">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowCreate(true)} className="btn-primary w-full flex items-center gap-3 py-3 justify-center">
              <Plus size={18} />
              {t('workspace.new')}
            </button>
          )}
        </div>

        {/* All workspaces */}
        {workspaces.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              {t('workspace.recent')}
            </h3>
            <div className="space-y-1">
              {workspaces.map((ws) => (
                <div
                  key={ws.path}
                  className="group flex items-center gap-3 px-3 py-2 rounded text-left transition-colors cursor-pointer"
                  style={{ borderRadius: 'var(--radius-md)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => !isLoading && load(ws.path)}
                >
                  <Brain size={16} style={{ color: 'var(--color-accent)' }} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ws.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {ws.documentCount != null ? `${ws.documentCount} docs` : ''}
                      {ws.documentCount != null && ws.vaultNoteCount != null ? ' · ' : ''}
                      {ws.vaultNoteCount != null ? `${ws.vaultNoteCount} notes` : ''}
                      {!ws.documentCount && !ws.vaultNoteCount ? new Date(ws.lastOpenedAt).toLocaleDateString() : ''}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (window.confirm(t('common.confirmDelete'))) deleteWorkspace(ws.path); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
