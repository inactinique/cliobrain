import { useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { ChatPanel } from '../Chat/ChatPanel';
import { SourcesPanel } from '../Sources/SourcesPanel';
import { NotesPanel } from '../Notes/NotesPanel';
import { GraphPanel } from '../Graph/GraphPanel';
import { HistoryPanel } from '../History/HistoryPanel';
import { WelcomeScreen } from './WelcomeScreen';
import {
  BookOpen,
  StickyNote,
  Network,
  History,
} from 'lucide-react';

type LeftTab = 'sources' | 'notes';
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
      {/* Left Panel: Sources / Notes */}
      <Panel defaultSize={25} minSize={15} maxSize={40}>
        <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <TabButton
              active={leftTab === 'sources'}
              onClick={() => setLeftTab('sources')}
              icon={<BookOpen size={16} />}
              label={t('sources.title')}
            />
            <TabButton
              active={leftTab === 'notes'}
              onClick={() => setLeftTab('notes')}
              icon={<StickyNote size={16} />}
              label={t('notes.title')}
            />
          </div>
          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {leftTab === 'sources' && <SourcesPanel />}
            {leftTab === 'notes' && <NotesPanel />}
          </div>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 transition-colors cursor-col-resize" />

      {/* Center Panel: Chat (primary) */}
      <Panel defaultSize={50} minSize={30}>
        <ChatPanel />
      </Panel>

      <PanelResizeHandle className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 transition-colors cursor-col-resize" />

      {/* Right Panel: Graph / History */}
      <Panel defaultSize={25} minSize={15} maxSize={40}>
        <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
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
          {/* Tab content */}
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
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
