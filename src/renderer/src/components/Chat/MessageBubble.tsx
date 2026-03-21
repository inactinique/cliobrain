import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVaultStore } from '../../stores/vaultStore';
import { User, Bot, FileText, Download, Check } from 'lucide-react';

interface Source {
  documentId: string;
  documentTitle: string;
  author?: string;
  year?: string;
  pageNumber?: number;
  chunkContent: string;
  similarity: number;
  sourceType: 'document' | 'note';
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Source[];
  createdAt: string;
}

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const { t } = useTranslation();
  const { isConnected, exportMessage } = useVaultStore();
  const [exported, setExported] = useState(false);
  const isUser = message.role === 'user';

  const handleExport = async () => {
    const result = await exportMessage({
      assistantMessage: message.content,
      sources: message.sources?.map(s => ({
        documentTitle: s.documentTitle,
        author: s.author,
        year: s.year,
        pageNumber: s.pageNumber,
      })),
    });
    if (result) setExported(true);
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
            : 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400'
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Content */}
      <div className={`max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div
          className={`inline-block px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-blue-600 text-white rounded-br-md'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md'
          }`}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>

          {/* Streaming indicator */}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-purple-500 animate-pulse ml-0.5" />
          )}
        </div>

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('chat.sources')} ({message.sources.length})
            </div>
            {message.sources.map((source, i) => (
              <SourceCard key={i} source={source} />
            ))}
          </div>
        )}

        {/* Export to Obsidian button (assistant messages only) */}
        {!isUser && !isStreaming && isConnected && (
          <button
            onClick={handleExport}
            disabled={exported}
            className={`mt-1.5 flex items-center gap-1 text-[11px] transition-colors ${
              exported
                ? 'text-green-500'
                : 'text-gray-400 hover:text-purple-600 dark:hover:text-purple-400'
            }`}
          >
            {exported ? <Check size={12} /> : <Download size={12} />}
            {exported ? t('vault.exportSuccess') : t('vault.exportToVault')}
          </button>
        )}
      </div>
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs">
      <FileText size={14} className="shrink-0 mt-0.5 text-gray-400" />
      <div className="min-w-0">
        <div className="font-medium truncate">{source.documentTitle}</div>
        {(source.author || source.year) && (
          <div className="text-gray-500 dark:text-gray-400">
            {source.author}{source.year ? ` (${source.year})` : ''}
            {source.pageNumber ? ` - ${t('chat.page')} ${source.pageNumber}` : ''}
          </div>
        )}
        <div className="text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
          {source.chunkContent}
        </div>
      </div>
    </div>
  );
}
