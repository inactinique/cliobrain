import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  ArrowLeft,
  ExternalLink,
  Link2,
  Tag,
  ArrowUpRight,
} from 'lucide-react';

interface WikiLink {
  target: string;
  displayText?: string;
  heading?: string;
}

interface VaultNoteDetail {
  relativePath: string;
  title: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  wikilinks: WikiLink[];
  backlinks: Array<{ relativePath: string; title: string }>;
  body: string;
  wikilinksCount: number;
  backlinksCount: number;
}

interface VaultNotePreviewProps {
  note: VaultNoteDetail;
  onBack: () => void;
  onOpenInObsidian: () => void;
  onNavigate: (relativePath: string) => void;
}

export function VaultNotePreview({ note, onBack, onOpenInObsidian, onNavigate }: VaultNotePreviewProps) {
  const { t } = useTranslation();

  // Render markdown to HTML, replacing wikilinks with clickable spans
  const renderedHtml = useMemo(() => {
    // Replace [[wikilinks]] with HTML before markdown rendering
    let processed = note.body.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_match, target, display) => {
        const text = display || target;
        return `<a class="vault-wikilink" data-target="${target.trim()}">${text.trim()}</a>`;
      }
    );

    const rawHtml = marked.parse(processed, { async: false }) as string;
    return DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['data-target'],
    });
  }, [note.body]);

  // Handle clicks on wikilinks in the rendered content
  const handleContentClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.vault-wikilink');
    if (target) {
      e.preventDefault();
      const linkTarget = target.getAttribute('data-target');
      if (linkTarget) {
        // Try to find the file: target.md or target
        const candidates = [
          `${linkTarget}.md`,
          linkTarget,
        ];
        // For now, navigate with .md appended
        onNavigate(`${linkTarget}.md`);
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ArrowLeft size={14} />
            {t('common.close')}
          </button>
          <button
            onClick={onOpenInObsidian}
            className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700"
          >
            <ExternalLink size={14} />
            {t('vault.openInObsidian')}
          </button>
        </div>
        <h3 className="text-sm font-semibold">{note.title}</h3>
        <div className="text-[11px] text-gray-400 truncate">{note.relativePath}</div>

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-[10px]"
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Rendered content */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 prose prose-sm dark:prose-invert max-w-none
          prose-headings:text-sm prose-p:text-xs prose-li:text-xs
          [&_.vault-wikilink]:text-purple-600 [&_.vault-wikilink]:dark:text-purple-400
          [&_.vault-wikilink]:underline [&_.vault-wikilink]:cursor-pointer
          [&_.vault-wikilink]:decoration-dotted"
        onClick={handleContentClick}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />

      {/* Backlinks & Outgoing links */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 max-h-40 overflow-y-auto">
        {note.backlinks.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              {t('vault.backlinks')} ({note.backlinks.length})
            </div>
            {note.backlinks.map((bl) => (
              <button
                key={bl.relativePath}
                onClick={() => onNavigate(bl.relativePath)}
                className="flex items-center gap-1 w-full text-xs text-left py-0.5 text-purple-600 dark:text-purple-400 hover:underline"
              >
                <ArrowUpRight size={12} />
                {bl.title}
              </button>
            ))}
          </div>
        )}

        {note.wikilinks.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              {t('vault.outgoingLinks')} ({note.wikilinks.length})
            </div>
            {note.wikilinks.slice(0, 10).map((wl, i) => (
              <button
                key={i}
                onClick={() => onNavigate(`${wl.target}.md`)}
                className="flex items-center gap-1 w-full text-xs text-left py-0.5 text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Link2 size={12} />
                {wl.displayText || wl.target}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
