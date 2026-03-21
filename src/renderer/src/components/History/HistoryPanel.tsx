import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore';
import { History, MessageSquare } from 'lucide-react';

export function HistoryPanel() {
  const { t } = useTranslation();
  const { sessions, loadSessions, loadSession } = useChatStore();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  if (sessions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm p-4">
        <History size={32} className="mb-2 opacity-50" />
        <p>{t('history.noSessions')}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2 space-y-1">
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => loadSession(session.id)}
          className="w-full text-left flex items-start gap-2 px-2 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <MessageSquare size={14} className="shrink-0 mt-0.5 text-gray-400" />
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">
              {session.title || `Session ${session.id.slice(0, 8)}`}
            </div>
            <div className="text-xs text-gray-400">
              {new Date(session.createdAt).toLocaleDateString()}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
