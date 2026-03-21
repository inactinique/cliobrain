import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageBubble } from './MessageBubble';
import { Brain } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: any[];
  createdAt: string;
}

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
}

export function MessageList({ messages, isStreaming, streamingContent }: MessageListProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8" style={{ color: 'var(--text-muted)' }}>
        <Brain size={48} className="mb-4 opacity-40" />
        <p className="text-sm text-center">{t('chat.noMessages')}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {isStreaming && (
        <MessageBubble
          message={{ id: 'streaming', role: 'assistant', content: streamingContent || t('chat.thinking'), createdAt: new Date().toISOString() }}
          isStreaming
        />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
