import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Brain, FolderOpen, Plus } from 'lucide-react';

export function WelcomeScreen() {
  const { t } = useTranslation();
  const { recentWorkspaces, load, create, isLoading } = useWorkspaceStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    const result = await window.electron.dialog.openDirectory();
    if (result.success && result.data) {
      await create(result.data, newName || 'Mon espace de travail');
    }
  };

  const handleOpen = async () => {
    const result = await window.electron.dialog.openDirectory();
    if (result.success && result.data) {
      await load(result.data);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full p-8">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-2xl mb-4">
            <Brain className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            ClioBrain
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Brainstorming avec vos documents
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
                placeholder={t('workspace.name')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  <Plus size={16} />
                  {t('workspace.create')}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Plus size={18} />
                {t('workspace.new')}
              </button>
              <button
                onClick={handleOpen}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
              >
                <FolderOpen size={18} />
                {t('workspace.open')}
              </button>
            </>
          )}
        </div>

        {/* Recent workspaces */}
        {recentWorkspaces.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {t('workspace.recent')}
            </h3>
            <div className="space-y-1">
              {recentWorkspaces.map((ws) => (
                <button
                  key={ws.path}
                  onClick={() => load(ws.path)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <Brain size={16} className="text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{ws.name}</div>
                    <div className="text-xs text-gray-400 truncate">{ws.path}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
