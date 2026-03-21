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
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          background: isUser ? 'var(--color-accent)' : 'var(--bg-card)',
          color: isUser ? '#ffffff' : 'var(--text-secondary)',
        }}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Content */}
      <div className={`max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div
          className="inline-block px-4 py-2.5 text-sm leading-relaxed"
          style={{
            background: isUser ? 'var(--color-accent)' : 'var(--bg-card)',
            color: isUser ? '#ffffff' : 'var(--text-primary)',
            border: isUser ? 'none' : '1px solid var(--border-color)',
            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          }}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-0.5 animate-pulse" style={{ background: 'var(--color-accent)' }} />
          )}
        </div>

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {t('chat.sources')} ({message.sources.length})
            </div>
            {message.sources.map((source, i) => (
              <SourceCard key={i} source={source} />
            ))}
          </div>
        )}

        {/* Export to Obsidian */}
        {!isUser && !isStreaming && isConnected && (
          <button
            onClick={handleExport}
            disabled={exported}
            className="mt-1.5 flex items-center gap-1 text-xs transition-colors"
            style={{ color: exported ? 'var(--color-success)' : 'var(--text-muted)' }}
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
    <div
      className="flex items-start gap-2 p-2 rounded text-xs"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <FileText size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
      <div className="min-w-0">
        <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{source.documentTitle}</div>
        {(source.author || source.year) && (
          <div style={{ color: 'var(--text-tertiary)' }}>
            {source.author}{source.year ? ` (${source.year})` : ''}
            {source.pageNumber ? ` - ${t('chat.page')} ${source.pageNumber}` : ''}
          </div>
        )}
        <div className="line-clamp-2 mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {source.chunkContent}
        </div>
      </div>
    </div>
  );
}
