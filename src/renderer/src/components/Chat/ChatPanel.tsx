import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { SessionSelector } from './SessionSelector';
import { MessageSquarePlus } from 'lucide-react';

export function ChatPanel() {
  const { t } = useTranslation();
  const {
    currentSessionId,
    messages,
    isStreaming,
    streamingContent,
    error,
    newSession,
    loadSessions,
    appendStreamChunk,
    finishStream,
    setStreamError,
  } = useChatStore();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const unsubStream = window.electron.chat.onStream((chunk) => {
      appendStreamChunk(chunk);
    });
    const unsubDone = window.electron.chat.onStreamDone((result) => {
      finishStream(result);
    });
    const unsubError = window.electron.chat.onStreamError((error) => {
      setStreamError(error?.error || 'Unknown error');
    });
    return () => { unsubStream?.(); unsubDone?.(); unsubError?.(); };
  }, [appendStreamChunk, finishStream, setStreamError]);

  const ensureSession = async () => {
    if (!currentSessionId) await newSession();
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-app)' }}>
      {/* Session bar */}
      <div className="flex items-center justify-between px-4 py-2" style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)' }}>
        <SessionSelector />
        <button
          onClick={() => newSession()}
          className="p-1.5 transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
          title={t('chat.newSession')}
          aria-label={t('chat.newSession')}
        >
          <MessageSquarePlus size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <MessageList messages={messages} isStreaming={isStreaming} streamingContent={streamingContent} error={error} />
      </div>

      <MessageInput onBeforeSend={ensureSession} />
    </div>
  );
}
