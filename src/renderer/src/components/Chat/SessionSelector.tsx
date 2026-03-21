import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore';
import { MessageSquare } from 'lucide-react';

export function SessionSelector() {
  const { t } = useTranslation();
  const { sessions, currentSessionId, loadSession } = useChatStore();

  const currentSession = sessions.find(s => s.id === currentSessionId);

  return (
    <div className="flex items-center gap-2">
      <MessageSquare size={16} className="text-gray-400" />
      {sessions.length === 0 ? (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t('chat.newSession')}
        </span>
      ) : (
        <select
          value={currentSessionId || ''}
          onChange={(e) => {
            if (e.target.value) loadSession(e.target.value);
          }}
          className="text-sm bg-transparent border-none focus:outline-none text-gray-700 dark:text-gray-300 cursor-pointer"
        >
          {!currentSessionId && (
            <option value="">{t('chat.newSession')}</option>
          )}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title || `Session ${session.id.slice(0, 8)}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
