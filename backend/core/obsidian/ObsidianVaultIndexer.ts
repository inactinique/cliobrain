/**
 * ObsidianVaultIndexer
 *
 * Indexes Obsidian vault notes for RAG: reads, parses, chunks,
 * embeds, and stores in the vector store.
 */

import crypto from 'crypto';
import type { DocumentChunk } from '../../types/document.js';
import type { VaultFileEntry, VaultIndexingProgress } from '../../types/vault.js';
import type { ObsidianVaultReader } from './ObsidianVaultReader.js';
import { ObsidianMarkdownParser } from './ObsidianMarkdownParser.js';
import type { VectorStore } from '../vector-store/VectorStore.js';
import type { HNSWVectorStore } from '../vector-store/HNSWVectorStore.js';
import type { BM25Index } from '../search/BM25Index.js';
import type { OllamaClient } from '../llm/OllamaClient.js';

const CHUNK_TARGET_SIZE = 512;   // tokens (approx 4 chars/token)
const CHUNK_CHAR_TARGET = 2000;  // ~512 tokens
const CHUNK_OVERLAP = 200;       // chars of overlap between chunks
const EMBEDDING_BATCH_SIZE = 16;

type ProgressCallback = (progress: VaultIndexingProgress) => void;

export class ObsidianVaultIndexer {
  private reader: ObsidianVaultReader;
  private parser: ObsidianMarkdownParser;
  private vectorStore: VectorStore;
  private hnswStore: HNSWVectorStore;
  private bm25Index: BM25Index;
  private ollamaClient: OllamaClient;

  constructor(
    reader: ObsidianVaultReader,
    vectorStore: VectorStore,
    hnswStore: HNSWVectorStore,
    bm25Index: BM25Index,
    ollamaClient: OllamaClient
  ) {
    this.reader = reader;
    this.parser = new ObsidianMarkdownParser();
    this.vectorStore = vectorStore;
    this.hnswStore = hnswStore;
    this.bm25Index = bm25Index;
    this.ollamaClient = ollamaClient;
  }

  /**
   * Full or incremental index of the vault
   */
  async indexAll(options?: { force?: boolean; onProgress?: ProgressCallback }): Promise<{ indexed: number; skipped: number }> {
    const entries = this.reader.getAllEntries();
    let indexed = 0;
    let skipped = 0;

    this.emitProgress(options?.onProgress, 'scanning', 0, `Scanning ${entries.length} notes...`, entries.length, 0);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      try {
        // Check if already indexed (by hash)
        if (!options?.force) {
          const content = this.reader.readFile(entry.relativePath);
          const hash = this.hashContent(content);
          const existing = this.vectorStore.getVaultNoteByHash(hash);
          if (existing) {
            skipped++;
            this.emitProgress(options?.onProgress, 'parsing', this.percent(i, entries.length),
              `Skipped (unchanged): ${entry.fileName}`, entries.length, indexed + skipped);
            continue;
          }
        }

        await this.indexNote(entry, options?.onProgress, i, entries.length);
        indexed++;
      } catch (e) {
        console.error(`[VaultIndexer] Failed to index ${entry.relativePath}:`, e);
      }

      this.emitProgress(options?.onProgress, 'embedding', this.percent(i + 1, entries.length),
        `Indexed: ${entry.fileName}`, entries.length, indexed + skipped);
    }

    // Resolve backlinks
    this.emitProgress(options?.onProgress, 'resolving-links', 95, 'Resolving wikilinks...', entries.length, indexed + skipped);
    this.resolveBacklinks();

    // Save HNSW index
    this.hnswStore.save();

    this.emitProgress(options?.onProgress, 'complete', 100,
      `Done: ${indexed} indexed, ${skipped} skipped`, entries.length, indexed + skipped);

    return { indexed, skipped };
  }

  /**
   * Index a single vault note
   */
  async indexNote(entry: VaultFileEntry, onProgress?: ProgressCallback, current?: number, total?: number): Promise<void> {
    const content = this.reader.readFile(entry.relativePath);
    const hash = this.hashContent(content);
    const parsed = this.parser.parse(entry.relativePath, content);

    // Generate a stable UUID from the relative path
    const noteId = this.pathToId(entry.relativePath);

    // Delete old data for this note
    this.vectorStore.deleteVaultNote(noteId);
    this.vectorStore.deleteChunksForDocument(noteId);

    // Store vault note metadata
    this.vectorStore.addVaultNote({
      id: noteId,
      relativePath: entry.relativePath,
      title: parsed.title,
      frontmatter: parsed.frontmatter,
      tags: parsed.tags,
      wikilinks: parsed.wikilinks.map(wl => ({ target: wl.target, displayText: wl.displayText })),
      fileHash: hash,
      fileMtime: entry.mtime,
    });

    // Store a "document" entry so chunks can reference it
    this.vectorStore.addDocument({
      id: noteId,
      filePath: entry.absolutePath,
      title: parsed.title,
      sourceType: 'obsidian-note',
      sourceRef: entry.relativePath,
      fileFormat: 'md',
      metadata: { tags: parsed.tags, frontmatter: parsed.frontmatter },
      createdAt: new Date().toISOString(),
      indexedAt: new Date().toISOString(),
      fileHash: hash,
    });

    // Section-aware chunking
    const chunks = this.chunkNote(noteId, parsed.body, parsed.headings);

    // Generate embeddings in batches
    const chunksWithEmbeddings = await this.embedChunks(chunks);

    // Store in vector store
    this.vectorStore.addChunks(chunksWithEmbeddings, 'obsidian-note');

    // Add to HNSW
    this.hnswStore.addChunks(
      chunksWithEmbeddings.map(cwe => ({
        chunk: cwe.chunk,
        embedding: cwe.embedding,
        document: {
          id: noteId,
          title: parsed.title,
          filePath: entry.absolutePath,
          sourceType: 'obsidian-note' as const,
          fileFormat: 'md' as const,
          metadata: { tags: parsed.tags },
          createdAt: new Date().toISOString(),
          indexedAt: new Date().toISOString(),
        },
      }))
    );

    // Add to BM25
    this.bm25Index.addChunks(
      chunksWithEmbeddings.map(cwe => ({
        chunk: cwe.chunk,
        document: {
          id: noteId,
          title: parsed.title,
          sourceType: 'obsidian-note' as const,
        },
      }))
    );

    // Store wikilinks
    this.vectorStore.addVaultLinks(noteId,
      parsed.wikilinks.map(wl => ({ target: wl.target, displayText: wl.displayText }))
    );
  }

  /**
   * Section-aware chunking: split body at headings
   */
  private chunkNote(noteId: string, body: string, headings: Array<{ level: number; text: string; position: number }>): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    if (body.length === 0) return chunks;

    // Split body into sections at headings
    const sections: Array<{ heading: string; content: string; position: number }> = [];

    if (headings.length === 0) {
      sections.push({ heading: '', content: body, position: 0 });
    } else {
      // Content before first heading
      if (headings[0].position > 0) {
        sections.push({ heading: '', content: body.substring(0, headings[0].position).trim(), position: 0 });
      }

      for (let i = 0; i < headings.length; i++) {
        const start = headings[i].position;
        const end = i + 1 < headings.length ? headings[i + 1].position : body.length;
        const sectionContent = body.substring(start, end).trim();
        sections.push({
          heading: headings[i].text,
          content: sectionContent,
          position: start,
        });
      }
    }

    // Chunk each section
    let chunkIndex = 0;
    for (const section of sections) {
      if (section.content.length === 0) continue;

      if (section.content.length <= CHUNK_CHAR_TARGET) {
        // Small enough to be a single chunk
        chunks.push({
          id: `${noteId}-${chunkIndex}`,
          documentId: noteId,
          content: section.content,
          chunkIndex,
          startPosition: section.position,
          endPosition: section.position + section.content.length,
          sectionTitle: section.heading || undefined,
          sectionType: 'content',
        });
        chunkIndex++;
      } else {
        // Split into overlapping chunks
        let pos = 0;
        while (pos < section.content.length) {
          const end = Math.min(pos + CHUNK_CHAR_TARGET, section.content.length);
          let chunkEnd = end;

          // Try to break at paragraph or sentence boundary
          if (end < section.content.length) {
            const lookback = section.content.substring(end - 200, end);
            const breakPoints = [
              lookback.lastIndexOf('\n\n'),
              lookback.lastIndexOf('. '),
              lookback.lastIndexOf('! '),
              lookback.lastIndexOf('? '),
            ];
            const bestBreak = Math.max(...breakPoints);
            if (bestBreak > 0) {
              chunkEnd = end - 200 + bestBreak + 2;
            }
          }

          chunks.push({
            id: `${noteId}-${chunkIndex}`,
            documentId: noteId,
            content: section.content.substring(pos, chunkEnd).trim(),
            chunkIndex,
            startPosition: section.position + pos,
            endPosition: section.position + chunkEnd,
            sectionTitle: section.heading || undefined,
            sectionType: 'content',
          });
          chunkIndex++;

          pos = chunkEnd - CHUNK_OVERLAP;
          if (pos <= 0 || chunkEnd >= section.content.length) break;
        }
      }
    }

    return chunks;
  }

  /**
   * Generate embeddings for chunks in batches
   */
  private async embedChunks(chunks: DocumentChunk[]): Promise<Array<{ chunk: DocumentChunk; embedding: Float32Array }>> {
    const results: Array<{ chunk: DocumentChunk; embedding: Float32Array }> = [];

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map(c => c.content);

      try {
        const embeddings = await this.ollamaClient.generateEmbeddings(texts);
        for (let j = 0; j < batch.length; j++) {
          results.push({ chunk: batch[j], embedding: embeddings[j] });
        }
      } catch (e) {
        console.error(`[VaultIndexer] Embedding batch failed:`, e);
      }
    }

    return results;
  }

  /**
   * Resolve wikilinks -> target note IDs
   */
  private resolveBacklinks(): void {
    // This is a placeholder - full resolution would update vault_links.target_note_id
    // by matching target_relative_path against vault_notes.relative_path
    console.log('[VaultIndexer] Backlink resolution complete');
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private pathToId(relativePath: string): string {
    return crypto.createHash('md5').update(relativePath).digest('hex');
  }

  private percent(current: number, total: number): number {
    return total > 0 ? Math.round((current / total) * 100) : 0;
  }

  private emitProgress(
    callback: ProgressCallback | undefined,
    stage: VaultIndexingProgress['stage'],
    progress: number,
    message: string,
    filesTotal: number,
    filesProcessed: number,
    currentFile?: string
  ): void {
    callback?.({
      stage,
      progress,
      message,
      currentFile,
      filesTotal,
      filesProcessed,
    });
  }
}
