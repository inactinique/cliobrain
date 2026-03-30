import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore';
import { MessageSquare } from 'lucide-react';

export function SessionSelector() {
  const { t } = useTranslation();
  const { sessions, currentSessionId, loadSession } = useChatStore();

  return (
    <div className="flex items-center gap-2">
      <MessageSquare size={16} style={{ color: 'var(--text-muted)' }} />
      {sessions.length === 0 ? (
        <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {t('chat.newSession')}
        </span>
      ) : (
        <select
          value={currentSessionId || ''}
          onChange={(e) => { if (e.target.value) loadSession(e.target.value); }}
          className="text-sm bg-transparent border-none focus:outline-none cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
          aria-label={t('chat.newSession')}
        >
          {!currentSessionId && <option value="">{t('chat.newSession')}</option>}
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title || `Session ${s.id.slice(0, 8)}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
