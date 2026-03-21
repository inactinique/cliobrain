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
    newSession,
    loadSessions,
    appendStreamChunk,
    finishStream,
    setStreamError,
  } = useChatStore();

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Setup streaming listeners
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

    return () => {
      unsubStream?.();
      unsubDone?.();
      unsubError?.();
    };
  }, [appendStreamChunk, finishStream, setStreamError]);

  // Auto-create session if none exists
  const ensureSession = async () => {
    if (!currentSessionId) {
      await newSession();
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Session selector bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <SessionSelector />
        <button
          onClick={() => newSession()}
          className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title={t('chat.newSession')}
        >
          <MessageSquarePlus size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
        />
      </div>

      {/* Input */}
      <MessageInput onBeforeSend={ensureSession} />
    </div>
  );
}
