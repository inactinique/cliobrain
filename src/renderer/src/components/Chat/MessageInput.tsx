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

    if (onBeforeSend) {
      await onBeforeSend();
    }

    setInput('');
    await sendMessage(trimmed);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, onBeforeSend, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  return (
    <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.placeholder')}
          rows={1}
          className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-[200px]"
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button
            onClick={() => cancelStream()}
            className="p-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"
            title="Stop"
          >
            <Square size={18} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={t('chat.send')}
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
