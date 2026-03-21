/**
 * IPC handlers for Obsidian vault integration
 *
 * Uses vaultService for lifecycle management and documentService for indexing.
 */

import { ipcMain, shell } from 'electron';
import { vaultService } from '../../services/vault-service.js';
import { documentService } from '../../services/document-service.js';
import { workspaceManager } from '../../services/workspace-manager.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupVaultHandlers() {
  ipcMain.handle('vault:connect', async (_event, vaultPath: string) => {
    try {
      if (!documentService.isInitialized) {
        return errorResponse('No workspace loaded. Open a workspace first.');
      }

      const result = await vaultService.connect(
        vaultPath,
        documentService.store!,
        documentService.hnsw!,
        documentService.bm25!,
        documentService.ollama!
      );

      // Save vault path to workspace config
      workspaceManager.updateConfig({
        obsidian: { vaultPath },
      });

      console.log(`[Vault] Connected to ${vaultPath} (${result.fileCount} notes)`);
      return successResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:disconnect', async () => {
    try {
      await vaultService.disconnect();
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:get-tree', async () => {
    try {
      const reader = vaultService.vaultReader;
      if (!reader) return errorResponse('No vault connected');
      return successResponse(reader.getTree());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:get-notes', async (_event, options?: { tag?: string; search?: string }) => {
    try {
      const reader = vaultService.vaultReader;
      if (!reader) return errorResponse('No vault connected');

      const parser = vaultService.markdownParser;
      const entries = reader.getAllEntries();
      const notes = entries.map(entry => {
        try {
          const content = reader.readFile(entry.relativePath);
          const parsed = parser.parse(entry.relativePath, content);
          return {
            id: entry.relativePath,
            relativePath: entry.relativePath,
            title: parsed.title,
            tags: parsed.tags,
            wikilinksCount: parsed.wikilinks.length,
            backlinksCount: 0,
            modifiedAt: new Date(entry.mtime).toISOString(),
            indexedAt: new Date().toISOString(),
            snippet: parser.generateSnippet(parsed.body),
          };
        } catch {
          return null;
        }
      }).filter(Boolean) as any[];

      let filtered = notes;
      if (options?.tag) {
        const tagLower = options.tag.toLowerCase();
        filtered = filtered.filter(n => n.tags.some((t: string) => t.toLowerCase() === tagLower));
      }
      if (options?.search) {
        const q = options.search.toLowerCase();
        filtered = filtered.filter(n =>
          n.title.toLowerCase().includes(q) ||
          n.snippet?.toLowerCase().includes(q) ||
          n.tags.some((t: string) => t.toLowerCase().includes(q))
        );
      }

      return successResponse(filtered);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:get-note-detail', async (_event, relativePath: string) => {
    try {
      const reader = vaultService.vaultReader;
      if (!reader) return errorResponse('No vault connected');

      const parser = vaultService.markdownParser;
      const content = reader.readFile(relativePath);
      const parsed = parser.parse(relativePath, content);

      // Compute backlinks
      const targetName = relativePath.replace(/\.md$/i, '');
      const entries = reader.getAllEntries();
      const backlinks: Array<{ relativePath: string; title: string }> = [];

      for (const entry of entries) {
        if (entry.relativePath === relativePath) continue;
        try {
          const otherContent = reader.readFile(entry.relativePath);
          const otherParsed = parser.parse(entry.relativePath, otherContent);
          const linksToThis = otherParsed.wikilinks.some(
            wl => wl.target === targetName ||
                  wl.target === parsed.title ||
                  wl.target.endsWith('/' + targetName.split('/').pop())
          );
          if (linksToThis) {
            backlinks.push({ relativePath: entry.relativePath, title: otherParsed.title });
          }
        } catch { /* skip */ }
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
      const reader = vaultService.vaultReader;
      if (!reader) return errorResponse('No vault connected');

      const parser = vaultService.markdownParser;
      const queryLower = query.toLowerCase();
      const entries = reader.getAllEntries();
      const results: any[] = [];

      for (const entry of entries) {
        try {
          const content = reader.readFile(entry.relativePath);
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
            });
          }
        } catch { /* skip */ }
      }

      return successResponse(results);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:get-tags', async () => {
    try {
      const reader = vaultService.vaultReader;
      if (!reader) return errorResponse('No vault connected');

      const parser = vaultService.markdownParser;
      const tagCounts = new Map<string, number>();

      for (const entry of reader.getAllEntries()) {
        try {
          const content = reader.readFile(entry.relativePath);
          const parsed = parser.parse(entry.relativePath, content);
          for (const tag of parsed.tags) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          }
        } catch { /* skip */ }
      }

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
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:index', async (_event, options?: { force?: boolean }) => {
    try {
      if (!vaultService.isConnected) return errorResponse('No vault connected');
      const result = await vaultService.indexAll(options);
      return successResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:export-message', async (_event, options: any) => {
    try {
      const exporter = vaultService.vaultExporter;
      if (!exporter) return errorResponse('No vault connected');
      const relativePath = exporter.exportMessage(options);
      return successResponse({ relativePath });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:export-conversation', async (_event, messages: any[], options?: any) => {
    try {
      const exporter = vaultService.vaultExporter;
      if (!exporter) return errorResponse('No vault connected');
      const relativePath = exporter.exportConversation(messages, options);
      return successResponse({ relativePath });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('vault:open-in-obsidian', async (_event, relativePath: string) => {
    try {
      const reader = vaultService.vaultReader;
      if (!reader) return errorResponse('No vault connected');
      const vaultName = reader.getVaultName();
      const encodedFile = encodeURIComponent(relativePath.replace(/\.md$/i, ''));
      const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodedFile}`;
      await shell.openExternal(uri);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
