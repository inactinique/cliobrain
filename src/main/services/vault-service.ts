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

export class VaultService {
  private reader: ObsidianVaultReader | null = null;
  private indexer: ObsidianVaultIndexer | null = null;
  private exporter: ObsidianExporter | null = null;
  private parser = new ObsidianMarkdownParser();

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

    // Setup auto-reindex on file changes
    this.reader.on('file-added', (entry) => {
      console.log(`[VaultService] File added: ${entry.relativePath}`);
      this.indexer?.indexNote(entry).catch(e =>
        console.error('[VaultService] Auto-index failed:', e)
      );
    });

    this.reader.on('file-changed', (entry) => {
      console.log(`[VaultService] File changed: ${entry.relativePath}`);
      this.indexer?.indexNote(entry).catch(e =>
        console.error('[VaultService] Auto-reindex failed:', e)
      );
    });

    return {
      vaultName: this.reader.getVaultName(),
      fileCount: entries.length,
    };
  }

  async disconnect(): Promise<void> {
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
