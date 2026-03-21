import { useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { ChatPanel } from '../Chat/ChatPanel';
import { SourcesPanel } from '../Sources/SourcesPanel';
import { VaultBrowserPanel } from '../Vault/VaultBrowserPanel';
import { GraphPanel } from '../Graph/GraphPanel';
import { HistoryPanel } from '../History/HistoryPanel';
import { WelcomeScreen } from './WelcomeScreen';
import {
  BookOpen,
  Vault,
  Network,
  History,
} from 'lucide-react';

type LeftTab = 'sources' | 'vault';
type RightTab = 'graph' | 'history';

export function MainLayout() {
  const { t } = useTranslation();
  const { isLoaded } = useWorkspaceStore();
  const [leftTab, setLeftTab] = useState<LeftTab>('sources');
  const [rightTab, setRightTab] = useState<RightTab>('graph');

  if (!isLoaded) {
    return <WelcomeScreen />;
  }

  return (
    <PanelGroup direction="horizontal" className="h-full">
      {/* Left Panel: Sources / Vault */}
      <Panel defaultSize={25} minSize={15} maxSize={40}>
        <div className="h-full flex flex-col" style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border-color)' }}>
          <div className="flex" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <TabButton
              active={leftTab === 'sources'}
              onClick={() => setLeftTab('sources')}
              icon={<BookOpen size={16} />}
              label={t('sources.title')}
            />
            <TabButton
              active={leftTab === 'vault'}
              onClick={() => setLeftTab('vault')}
              icon={<Vault size={16} />}
              label={t('vault.title')}
            />
          </div>
          <div className="flex-1 overflow-hidden">
            {leftTab === 'sources' && <SourcesPanel />}
            {leftTab === 'vault' && <VaultBrowserPanel />}
          </div>
        </div>
      </Panel>

      <PanelResizeHandle />

      {/* Center Panel: Chat (primary) */}
      <Panel defaultSize={50} minSize={30}>
        <ChatPanel />
      </Panel>

      <PanelResizeHandle />

      {/* Right Panel: Graph / History */}
      <Panel defaultSize={25} minSize={15} maxSize={40}>
        <div className="h-full flex flex-col" style={{ background: 'var(--bg-panel)', borderLeft: '1px solid var(--border-color)' }}>
          <div className="flex" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <TabButton
              active={rightTab === 'graph'}
              onClick={() => setRightTab('graph')}
              icon={<Network size={16} />}
              label={t('graph.title')}
            />
            <TabButton
              active={rightTab === 'history'}
              onClick={() => setRightTab('history')}
              icon={<History size={16} />}
              label={t('history.title')}
            />
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab === 'graph' && <GraphPanel />}
            {rightTab === 'history' && <HistoryPanel />}
          </div>
        </div>
      </Panel>
    </PanelGroup>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
      style={{
        color: active ? 'var(--color-accent)' : 'var(--text-tertiary)',
        borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
