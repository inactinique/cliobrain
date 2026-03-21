import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore';
import { Send, Square } from 'lucide-react';

interface MessageInputProps {
  onBeforeSend?: () => Promise<void>;
}

export function MessageInput({ onBeforeSend }: MessageInputProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, cancelStream, isStreaming } = useChatStore();

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    if (onBeforeSend) await onBeforeSend();
    setInput('');
    await sendMessage(trimmed);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, isStreaming, onBeforeSend, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  return (
    <div className="px-4 py-3" style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border-color)' }}>
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.placeholder')}
          rows={1}
          disabled={isStreaming}
          className="input flex-1 resize-none max-h-[200px]"
          style={{ borderRadius: 'var(--radius-xl)' }}
        />
        {isStreaming ? (
          <button onClick={() => cancelStream()} className="btn-danger p-2" style={{ borderRadius: 'var(--radius-xl)' }}>
            <Square size={18} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="btn-primary p-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderRadius: 'var(--radius-xl)' }}
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
