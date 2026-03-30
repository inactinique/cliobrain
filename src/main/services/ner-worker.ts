/**
 * NERBackgroundWorker - Runs entity extraction in the background
 *
 * After documents are ingested (chunk + embed + store), this worker
 * processes chunks through NER via Ollama WITHOUT blocking the UI.
 * Progress is emitted as IPC events.
 */

import { BrowserWindow } from 'electron';
import { NERService } from '../../../backend/core/ner/NERService.js';
import type { VectorStore } from '../../../backend/core/vector-store/VectorStore.js';
import type { OllamaClient } from '../../../backend/core/llm/OllamaClient.js';
import type { Entity, EntityMention } from '../../../backend/types/entity.js';

export interface NERProgress {
  isRunning: boolean;
  currentDocument?: string;
  documentsTotal: number;
  documentsProcessed: number;
  chunksTotal: number;
  chunksProcessed: number;
  entitiesFound: number;
}

export class NERBackgroundWorker {
  private vectorStore: VectorStore | null = null;
  private ollamaClient: OllamaClient | null = null;
  private nerService: NERService | null = null;
  private isRunning = false;
  private shouldStop = false;
  private progress: NERProgress = {
    isRunning: false,
    documentsTotal: 0,
    documentsProcessed: 0,
    chunksTotal: 0,
    chunksProcessed: 0,
    entitiesFound: 0,
  };

  initialize(vectorStore: VectorStore, ollamaClient: OllamaClient, language: string = 'fr'): void {
    this.vectorStore = vectorStore;
    this.ollamaClient = ollamaClient;
    this.nerService = new NERService(ollamaClient, language);
  }

  get running(): boolean {
    return this.isRunning;
  }

  getProgress(): NERProgress {
    return { ...this.progress };
  }

  /**
   * Start processing all documents that haven't been NER-processed yet.
   * Runs in the background — returns immediately.
   */
  start(): void {
    if (this.isRunning || !this.vectorStore || !this.nerService) return;

    this.shouldStop = false;
    this.isRunning = true;
    this.progress.isRunning = true;

    // Run async without blocking
    this.processAll().catch(e => {
      console.error('[NER] Background processing failed:', e);
    }).finally(() => {
      this.isRunning = false;
      this.progress.isRunning = false;
      this.emitProgress();
    });
  }

  stop(): void {
    this.shouldStop = true;
  }

  close(): void {
    this.stop();
    this.vectorStore = null;
    this.ollamaClient = null;
    this.nerService = null;
  }

  private async processAll(): Promise<void> {
    if (!this.vectorStore || !this.nerService) return;

    // Get documents that haven't been processed for NER
    const unprocessed = this.vectorStore.getDocumentsWithoutNER();
    if (unprocessed.length === 0) {
      console.log('[NER] All documents already processed');
      return;
    }

    console.log(`[NER] Starting background NER for ${unprocessed.length} documents`);

    this.progress.documentsTotal = unprocessed.length;
    this.progress.documentsProcessed = 0;
    this.progress.entitiesFound = 0;
    this.emitProgress();

    for (const doc of unprocessed) {
      if (this.shouldStop) {
        console.log('[NER] Stopped by user');
        break;
      }

      this.progress.currentDocument = doc.title;
      this.emitProgress();

      try {
        await this.processDocument(doc.id, doc.title);
      } catch (e) {
        console.error(`[NER] Failed to process "${doc.title}":`, e);
      }

      this.progress.documentsProcessed++;
      this.emitProgress();
    }

    console.log(`[NER] Done. ${this.progress.entitiesFound} entities found across ${this.progress.documentsProcessed} documents`);
  }

  private async processDocument(documentId: string, title: string): Promise<void> {
    if (!this.vectorStore || !this.nerService) return;

    const rawChunks = this.vectorStore.getChunksForDocument(documentId);
    this.progress.chunksTotal = rawChunks.length;
    this.progress.chunksProcessed = 0;

    const allEntities: Entity[] = [];
    const allMentions: EntityMention[] = [];

    for (const chunk of rawChunks) {
      if (this.shouldStop) break;

      try {
        const { entities, mentions } = await this.nerService.extractEntities(
          chunk.content, chunk.id, documentId
        );

        allEntities.push(...entities);
        allMentions.push(...mentions);
        this.progress.entitiesFound += entities.length;
      } catch (e) {
        // Individual chunk failure is non-critical — continue
        console.error(`[NER] Chunk ${chunk.id} failed:`, e);
      }

      this.progress.chunksProcessed++;

      // Emit progress every 3 chunks to avoid flooding IPC
      if (this.progress.chunksProcessed % 3 === 0) {
        this.emitProgress();
      }
    }

    // Batch-insert all entities and mentions for this document
    if (allEntities.length > 0) {
      this.vectorStore.addEntitiesBatch(allEntities, allMentions);
      console.log(`[NER] "${title}": ${allEntities.length} entities, ${allMentions.length} mentions`);
    }
  }

  private emitProgress(): void {
    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('ner:progress', this.progress);
      }
    } catch {
      // Window may not be available
    }
  }
}

export const nerWorker = new NERBackgroundWorker();
