import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore';
import { History, MessageSquare } from 'lucide-react';

export function HistoryPanel() {
  const { t } = useTranslation();
  const { sessions, loadSessions, loadSession } = useChatStore();

  useEffect(() => { loadSessions(); }, [loadSessions]);

  if (sessions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4" style={{ color: 'var(--text-muted)' }}>
        <History size={32} className="mb-2 opacity-40" />
        <p className="text-sm">{t('history.noSessions')}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2 space-y-1">
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => loadSession(session.id)}
          className="w-full text-left flex items-start gap-2 px-2 py-2 rounded transition-colors"
          style={{ borderRadius: 'var(--radius-sm)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <MessageSquare size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
          <div className="min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {session.title || `Session ${session.id.slice(0, 8)}`}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(session.createdAt).toLocaleDateString()}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
