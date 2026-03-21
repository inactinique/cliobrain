import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from './components/Layout/MainLayout';
import { useWorkspaceStore } from './stores/workspaceStore';

function App() {
  const { i18n } = useTranslation();
  const { loadRecent } = useWorkspaceStore();

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  // Listen for menu shortcuts
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.ipcRenderer) return;

    const handlers: Record<string, () => void> = {
      'menu:open-settings': () => {
        // TODO: Open settings modal
        console.log('Open settings');
      },
      'menu:new-session': () => {
        // TODO: Create new chat session
        console.log('New session');
      },
      'menu:about': () => {
        // TODO: Open about modal
        console.log('About');
      },
    };

    Object.entries(handlers).forEach(([channel, handler]) => {
      electron.ipcRenderer.on(channel, handler);
    });

    return () => {
      Object.entries(handlers).forEach(([channel, handler]) => {
        electron.ipcRenderer.removeListener(channel, handler);
      });
    };
  }, []);

  return (
    <div className="h-full w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <MainLayout />
    </div>
  );
}

export default App;
