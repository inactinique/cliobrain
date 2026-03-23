import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Server,
  Copy,
  Check,
  ScrollText,
  Clock,
  Search,
  Network,
  BookOpen,
  FileText,
  Sparkles,
} from 'lucide-react';

interface McpStatus {
  available: boolean;
  reason?: string;
  workspacePath?: string;
  logPath?: string;
  logExists?: boolean;
  logEntryCount?: number;
  lastAccess?: string;
}

interface McpLogEntry {
  timestamp: string;
  type: 'tool' | 'resource' | 'prompt';
  name: string;
  input: Record<string, unknown>;
  outputSummary: {
    itemCount?: number;
    totalChars?: number;
  };
}

const TOOL_ICONS: Record<string, typeof Search> = {
  search_documents: Search,
  explore_graph: Network,
  search_zotero: BookOpen,
  search_obsidian: FileText,
  get_entity_context: Sparkles,
};

export function McpPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [logs, setLogs] = useState<McpLogEntry[]>([]);
  const [copiedConfig, setCopiedConfig] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    const res = await window.electron.mcp.getStatus();
    if (res.success) {
      setStatus(res.data);
      if (res.data.logExists) {
        const logsRes = await window.electron.mcp.getLogs(30);
        if (logsRes.success) setLogs(logsRes.data);
      }
    }
  }

  async function copyConfig(type: 'desktop' | 'code') {
    const res = type === 'desktop'
      ? await window.electron.mcp.getClaudeDesktopConfig()
      : await window.electron.mcp.getClaudeCodeConfig();

    if (res.success) {
      await navigator.clipboard.writeText(res.data);
      setCopiedConfig(type);
      setTimeout(() => setCopiedConfig(null), 2000);
    }
  }

  function formatTimestamp(ts: string) {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  if (!status) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {t('app.loading')}
      </div>
    );
  }

  if (!status.available) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <Server size={20} style={{ marginBottom: 8, opacity: 0.5 }} />
        <p>{t('mcp.noWorkspace')}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with status */}
      <div className="p-3 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <Server size={14} style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('mcp.title')}
          </span>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {status.logEntryCount || 0} {t('mcp.interactions')}
          {status.lastAccess && (
            <> · {t('mcp.lastAccess')} {formatTimestamp(status.lastAccess)}</>
          )}
        </div>
      </div>

      {/* Config buttons */}
      <div className="p-3 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {t('mcp.copyConfig')}
        </span>
        <div className="flex gap-2">
          <ConfigButton
            label="Claude Desktop"
            copied={copiedConfig === 'desktop'}
            onClick={() => copyConfig('desktop')}
          />
          <ConfigButton
            label="Claude Code"
            copied={copiedConfig === 'code'}
            onClick={() => copyConfig('code')}
          />
        </div>
      </div>

      {/* Access logs */}
      <div className="flex-1 overflow-auto p-2">
        <div className="flex items-center gap-1.5 px-1 py-1.5">
          <ScrollText size={12} style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {t('mcp.accessLog')}
          </span>
        </div>

        {logs.length === 0 ? (
          <p className="text-xs px-1 py-2" style={{ color: 'var(--text-tertiary)' }}>
            {t('mcp.noLogs')}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {logs.map((entry, i) => {
              const Icon = TOOL_ICONS[entry.name] || Server;
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 px-2 py-1.5 rounded text-xs"
                  style={{ background: 'var(--bg-card)' }}
                >
                  <Icon size={12} style={{ color: 'var(--text-tertiary)', marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {entry.name}
                      </span>
                      <span
                        className="px-1 rounded"
                        style={{
                          fontSize: 10,
                          background: 'var(--bg-panel)',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {entry.type}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-tertiary)' }}>
                      <Clock size={10} className="inline mr-1" />
                      {formatTimestamp(entry.timestamp)}
                      {entry.outputSummary?.itemCount !== undefined && (
                        <> · {entry.outputSummary.itemCount} items</>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigButton({
  label,
  copied,
  onClick,
}: {
  label: string;
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-colors"
      style={{
        background: 'var(--bg-card)',
        color: copied ? 'var(--color-accent)' : 'var(--text-secondary)',
        border: '1px solid var(--border-color)',
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {label}
    </button>
  );
}
