/**
 * FolderWatcher - Monitor directories for document changes using chokidar
 */

import path from 'path';
import type { FSWatcher } from 'chokidar';

const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md', '.html', '.htm'];

export interface FolderWatchEvent {
  type: 'added' | 'changed' | 'deleted';
  filePath: string;
  folderPath: string;
}

type WatchCallback = (event: FolderWatchEvent) => void;

export class FolderWatcher {
  private watchers: Map<string, FSWatcher> = new Map();
  private callbacks: WatchCallback[] = [];

  onEvent(callback: WatchCallback): void {
    this.callbacks.push(callback);
  }

  async addFolder(folderPath: string, options?: { recursive?: boolean; maxDepth?: number }): Promise<void> {
    if (this.watchers.has(folderPath)) return;

    const chokidar = await import('chokidar');
    const depth = options?.maxDepth ?? 3;
    const pattern = options?.recursive !== false
      ? `${folderPath}/**/*`
      : `${folderPath}/*`;

    const watcher = chokidar.watch(pattern, {
      ignored: /(^|[/\\])\./,
      persistent: true,
      ignoreInitial: true,
      depth,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    watcher.on('add', (filePath: string) => {
      if (this.isSupportedFile(filePath)) {
        this.emit({ type: 'added', filePath, folderPath });
      }
    });

    watcher.on('change', (filePath: string) => {
      if (this.isSupportedFile(filePath)) {
        this.emit({ type: 'changed', filePath, folderPath });
      }
    });

    watcher.on('unlink', (filePath: string) => {
      if (this.isSupportedFile(filePath)) {
        this.emit({ type: 'deleted', filePath, folderPath });
      }
    });

    this.watchers.set(folderPath, watcher);
    console.log(`[FolderWatcher] Watching: ${folderPath} (depth=${depth})`);
  }

  async removeFolder(folderPath: string): Promise<void> {
    const watcher = this.watchers.get(folderPath);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(folderPath);
      console.log(`[FolderWatcher] Stopped watching: ${folderPath}`);
    }
  }

  getWatchedFolders(): string[] {
    return Array.from(this.watchers.keys());
  }

  async closeAll(): Promise<void> {
    for (const [folderPath, watcher] of this.watchers) {
      await watcher.close();
    }
    this.watchers.clear();
  }

  private isSupportedFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  private emit(event: FolderWatchEvent): void {
    for (const cb of this.callbacks) {
      try {
        cb(event);
      } catch (e) {
        console.error('[FolderWatcher] Callback error:', e);
      }
    }
  }
}

export const folderWatcher = new FolderWatcher();
