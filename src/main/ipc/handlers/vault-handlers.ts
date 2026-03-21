/**
 * IPC handlers for Obsidian vault integration
 */

import { ipcMain, shell } from 'electron';
import { ObsidianVaultReader } from '../../../../backend/core/obsidian/ObsidianVaultReader.js';
import { ObsidianMarkdownParser } from '../../../../backend/core/obsidian/ObsidianMarkdownParser.js';
import { ObsidianExporter } from '../../../../backend/core/obsidian/ObsidianExporter.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

let vaultReader: ObsidianVaultReader | null = null;
const parser = new ObsidianMarkdownParser();
let exporter: ObsidianExporter | null = null;

export function setupVaultHandlers() {
  ipcMain.handle('vault:connect', async (_event, vaultPath: string) => {
    try {
      // Cleanup previous reader
      if (vaultReader) {
        await vaultReader.destroy();
      }

      vaultReader = new ObsidianVaultReader(vaultPath);
      exporter = new ObsidianExporter(vaultPath);

      const entries = await vaultReader.scan();
      await vaultReader.watch();

      console.log(`[Vault] Connected to ${vaultPath} (${entries.length} notes)`);
      return successResponse({
        vaultPath,
        vaultName: vaultReader.getVaultName(),
        fileCount: entries.length,
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:disconnect', async () => {
    try {
      if (vaultReader) {
        await vaultReader.destroy();
        vaultReader = null;
        exporter = null;
      }
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:get-tree', async () => {
    try {
      if (!vaultReader) return errorResponse('No vault connected');
      return successResponse(vaultReader.getTree());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:get-notes', async (_event, options?: { tag?: string; search?: string }) => {
    try {
      if (!vaultReader) return errorResponse('No vault connected');

      const entries = vaultReader.getAllEntries();
      const notes = entries.map(entry => {
        try {
          const content = vaultReader!.readFile(entry.relativePath);
          const parsed = parser.parse(entry.relativePath, content);
          return {
            id: entry.relativePath, // Use relative path as ID for now
            relativePath: entry.relativePath,
            title: parsed.title,
            tags: parsed.tags,
            wikilinksCount: parsed.wikilinks.length,
            backlinksCount: 0, // Computed during full indexing
            modifiedAt: new Date(entry.mtime).toISOString(),
            indexedAt: new Date().toISOString(),
            snippet: parser.generateSnippet(parsed.body),
          };
        } catch {
          return null;
        }
      }).filter(Boolean);

      // Apply filters
      let filtered = notes as any[];

      if (options?.tag) {
        const tagLower = options.tag.toLowerCase();
        filtered = filtered.filter((n: any) =>
          n.tags.some((t: string) => t.toLowerCase() === tagLower)
        );
      }

      if (options?.search) {
        const searchLower = options.search.toLowerCase();
        filtered = filtered.filter((n: any) =>
          n.title.toLowerCase().includes(searchLower) ||
          n.snippet?.toLowerCase().includes(searchLower) ||
          n.tags.some((t: string) => t.toLowerCase().includes(searchLower))
        );
      }

      return successResponse(filtered);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:get-note-detail', async (_event, relativePath: string) => {
    try {
      if (!vaultReader) return errorResponse('No vault connected');

      const content = vaultReader.readFile(relativePath);
      const parsed = parser.parse(relativePath, content);

      // Compute backlinks (notes that link to this note)
      const targetName = relativePath.replace(/\.md$/i, '');
      const entries = vaultReader.getAllEntries();
      const backlinks: Array<{ relativePath: string; title: string }> = [];

      for (const entry of entries) {
        if (entry.relativePath === relativePath) continue;
        try {
          const otherContent = vaultReader.readFile(entry.relativePath);
          const otherParsed = parser.parse(entry.relativePath, otherContent);
          const linksToThis = otherParsed.wikilinks.some(
            wl => wl.target === targetName ||
                  wl.target === parsed.title ||
                  wl.target.endsWith('/' + targetName.split('/').pop())
          );
          if (linksToThis) {
            backlinks.push({
              relativePath: entry.relativePath,
              title: otherParsed.title,
            });
          }
        } catch {
          // Skip unreadable files
        }
      }

      return successResponse({
        id: relativePath,
        relativePath: parsed.relativePath,
        title: parsed.title,
        tags: parsed.tags,
        wikilinksCount: parsed.wikilinks.length,
        backlinksCount: backlinks.length,
        modifiedAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
        frontmatter: parsed.frontmatter,
        wikilinks: parsed.wikilinks,
        backlinks,
        body: parsed.body,
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:search', async (_event, query: string) => {
    try {
      if (!vaultReader) return errorResponse('No vault connected');

      const queryLower = query.toLowerCase();
      const entries = vaultReader.getAllEntries();
      const results: any[] = [];

      for (const entry of entries) {
        try {
          const content = vaultReader.readFile(entry.relativePath);
          const parsed = parser.parse(entry.relativePath, content);

          const titleMatch = parsed.title.toLowerCase().includes(queryLower);
          const bodyMatch = parsed.body.toLowerCase().includes(queryLower);
          const tagMatch = parsed.tags.some(t => t.toLowerCase().includes(queryLower));

          if (titleMatch || bodyMatch || tagMatch) {
            results.push({
              id: entry.relativePath,
              relativePath: entry.relativePath,
              title: parsed.title,
              tags: parsed.tags,
              wikilinksCount: parsed.wikilinks.length,
              backlinksCount: 0,
              modifiedAt: new Date(entry.mtime).toISOString(),
              indexedAt: new Date().toISOString(),
              snippet: parser.generateSnippet(parsed.body),
              matchType: titleMatch ? 'title' : tagMatch ? 'tag' : 'content',
            });
          }
        } catch {
          // Skip unreadable files
        }
      }

      return successResponse(results);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:get-tags', async () => {
    try {
      if (!vaultReader) return errorResponse('No vault connected');

      const tagCounts = new Map<string, number>();
      const entries = vaultReader.getAllEntries();

      for (const entry of entries) {
        try {
          const content = vaultReader.readFile(entry.relativePath);
          const parsed = parser.parse(entry.relativePath, content);
          for (const tag of parsed.tags) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          }
        } catch {
          // Skip
        }
      }

      // Convert to sorted array
      const tags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);

      return successResponse(tags);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:get-backlinks', async (_event, relativePath: string) => {
    try {
      if (!vaultReader) return errorResponse('No vault connected');
      // Same logic as in get-note-detail — delegate there
      // For optimization, this could be cached during indexing
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:index', async (_event, options?: { force?: boolean }) => {
    try {
      // TODO: Wire to ObsidianVaultIndexer when implemented (Phase 2D)
      console.log('[Vault] Index requested', options);
      return successResponse({ indexed: 0 });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:export-message', async (_event, options: any) => {
    try {
      if (!exporter) return errorResponse('No vault connected');
      const relativePath = exporter.exportMessage(options);
      return successResponse({ relativePath });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:export-conversation', async (_event, messages: any[], options?: any) => {
    try {
      if (!exporter) return errorResponse('No vault connected');
      const relativePath = exporter.exportConversation(messages, options);
      return successResponse({ relativePath });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:open-in-obsidian', async (_event, relativePath: string) => {
    try {
      if (!vaultReader) return errorResponse('No vault connected');
      const vaultName = vaultReader.getVaultName();
      const encodedFile = encodeURIComponent(relativePath.replace(/\.md$/i, ''));
      const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodedFile}`;
      await shell.openExternal(uri);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
