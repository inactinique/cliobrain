import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from './components/Layout/MainLayout';
import { SettingsModal } from './components/Config/SettingsModal';
import { AboutModal } from './components/About/AboutModal';
import { useWorkspaceStore } from './stores/workspaceStore';
import { useChatStore } from './stores/chatStore';

function App() {
  const { i18n } = useTranslation();
  const { loadRecent } = useWorkspaceStore();
  const { newSession } = useChatStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // Load config and apply theme on mount
  useEffect(() => {
    loadRecent();
    applyTheme();
  }, [loadRecent]);

  const applyTheme = async () => {
    try {
      const result = await window.electron.config.get('theme');
      const theme = result.success ? result.data : 'system';
      updateThemeClass(theme);
    } catch { /* ignore */ }
  };

  // Listen for menu shortcuts
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.ipcRenderer) return;

    const handlers: Record<string, () => void> = {
      'menu:open-settings': () => setShowSettings(true),
      'menu:new-session': () => newSession(),
      'menu:about': () => setShowAbout(true),
    };

    Object.entries(handlers).forEach(([channel, handler]) => {
      electron.ipcRenderer.on(channel, handler);
    });

    return () => {
      Object.entries(handlers).forEach(([channel, handler]) => {
        electron.ipcRenderer.removeListener(channel, handler);
      });
    };
  }, [newSession]);

  // Keyboard shortcut: Cmd/Ctrl+, for settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(s => !s);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-full w-full" style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <MainLayout />
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
}

function updateThemeClass(theme: string) {
  const body = document.body;
  body.classList.remove('theme-light');
  if (theme === 'light') {
    body.classList.add('theme-light');
  } else if (theme === 'system') {
    if (!window.matchMedia('(prefers-color-scheme: dark)').matches) {
      body.classList.add('theme-light');
    }
  }
  // Dark is default (no class needed, :root has dark values)
}

export default App;
