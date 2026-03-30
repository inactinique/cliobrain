/**
 * VaultService - Manages the Obsidian vault lifecycle
 *
 * Owns the VaultReader, VaultIndexer, and wires them to the
 * vector store, HNSW, and BM25 indexes.
 */

import { BrowserWindow } from 'electron';
import { ObsidianVaultReader } from '../../../backend/core/obsidian/ObsidianVaultReader.js';
import { ObsidianVaultIndexer } from '../../../backend/core/obsidian/ObsidianVaultIndexer.js';
import { ObsidianExporter } from '../../../backend/core/obsidian/ObsidianExporter.js';
import { ObsidianMarkdownParser } from '../../../backend/core/obsidian/ObsidianMarkdownParser.js';
import type { VectorStore } from '../../../backend/core/vector-store/VectorStore.js';
import type { HNSWVectorStore } from '../../../backend/core/vector-store/HNSWVectorStore.js';
import type { BM25Index } from '../../../backend/core/search/BM25Index.js';
import type { OllamaClient } from '../../../backend/core/llm/OllamaClient.js';
import type { VaultFileEntry } from '../../../backend/types/vault.js';

export class VaultService {
  private reader: ObsidianVaultReader | null = null;
  private indexer: ObsidianVaultIndexer | null = null;
  private exporter: ObsidianExporter | null = null;
  private parser = new ObsidianMarkdownParser();

  /** Pending debounce timers keyed by absolute file path */
  private pendingIndexTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Debounce delay in ms before a file change triggers indexing */
  private static readonly INDEX_DEBOUNCE_MS = 300;

  get isConnected(): boolean {
    return this.reader !== null;
  }

  get vaultReader(): ObsidianVaultReader | null {
    return this.reader;
  }

  get vaultExporter(): ObsidianExporter | null {
    return this.exporter;
  }

  get markdownParser(): ObsidianMarkdownParser {
    return this.parser;
  }

  async connect(
    vaultPath: string,
    vectorStore: VectorStore,
    hnswStore: HNSWVectorStore,
    bm25Index: BM25Index,
    ollamaClient: OllamaClient
  ): Promise<{ vaultName: string; fileCount: number }> {
    await this.disconnect();

    this.reader = new ObsidianVaultReader(vaultPath);
    this.exporter = new ObsidianExporter(vaultPath);
    this.indexer = new ObsidianVaultIndexer(
      this.reader, vectorStore, hnswStore, bm25Index, ollamaClient
    );

    const entries = await this.reader.scan();
    await this.reader.watch();

    // Setup auto-reindex on file changes (debounced to avoid race conditions
    // when many files change at once, e.g. git pull or batch save)
    this.reader.on('file-added', (entry) => {
      console.log(`[VaultService] File added: ${entry.relativePath}`);
      this.scheduleIndex(entry);
    });

    this.reader.on('file-changed', (entry) => {
      console.log(`[VaultService] File changed: ${entry.relativePath}`);
      this.scheduleIndex(entry);
    });

    return {
      vaultName: this.reader.getVaultName(),
      fileCount: entries.length,
    };
  }

  /**
   * Debounce indexing for a given file. If the same file fires multiple
   * events within INDEX_DEBOUNCE_MS, only the last one triggers indexNote.
   * This prevents parallel embeddings, duplicate chunks, and HNSW races
   * during batch operations (git pull, mass saves, etc.).
   */
  private scheduleIndex(entry: VaultFileEntry): void {
    const key = entry.absolutePath;

    // Clear any previously scheduled indexing for this file
    const existing = this.pendingIndexTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pendingIndexTimers.delete(key);
      this.indexer?.indexNote(entry).catch(e =>
        console.error('[VaultService] Auto-index failed:', e)
      );
    }, VaultService.INDEX_DEBOUNCE_MS);

    this.pendingIndexTimers.set(key, timer);
  }

  /** Cancel all pending debounce timers (used on disconnect). */
  private clearPendingTimers(): void {
    for (const timer of this.pendingIndexTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingIndexTimers.clear();
  }

  async disconnect(): Promise<void> {
    this.clearPendingTimers();
    if (this.reader) {
      await this.reader.destroy();
      this.reader = null;
    }
    this.indexer = null;
    this.exporter = null;
  }

  async indexAll(options?: { force?: boolean }): Promise<{ indexed: number; skipped: number }> {
    if (!this.indexer) throw new Error('No vault connected');

    return this.indexer.indexAll({
      force: options?.force,
      onProgress: (progress) => {
        // Send progress to renderer
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send('vault:indexing-progress', progress);
        }
      },
    });
  }
}

export const vaultService = new VaultService();
