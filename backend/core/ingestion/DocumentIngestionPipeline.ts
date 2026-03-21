/**
 * DocumentIngestionPipeline - Orchestrates the full document ingestion flow
 *
 * extract → chunk → embed → store (SQLite + HNSW + BM25)
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pdfExtractor } from './PDFExtractor.js';
import { textExtractor, TextExtractor } from './TextExtractor.js';
import { documentChunker } from './DocumentChunker.js';
import type { Document, DocumentChunk, IndexingProgress } from '../../types/document.js';
import type { VectorStore } from '../vector-store/VectorStore.js';
import type { HNSWVectorStore } from '../vector-store/HNSWVectorStore.js';
import type { BM25Index } from '../search/BM25Index.js';
import type { OllamaClient } from '../llm/OllamaClient.js';

const EMBEDDING_BATCH_SIZE = 16;

type ProgressCallback = (progress: IndexingProgress) => void;

export class DocumentIngestionPipeline {
  private vectorStore: VectorStore;
  private hnswStore: HNSWVectorStore;
  private bm25Index: BM25Index;
  private ollamaClient: OllamaClient;

  constructor(
    vectorStore: VectorStore,
    hnswStore: HNSWVectorStore,
    bm25Index: BM25Index,
    ollamaClient: OllamaClient
  ) {
    this.vectorStore = vectorStore;
    this.hnswStore = hnswStore;
    this.bm25Index = bm25Index;
    this.ollamaClient = ollamaClient;
  }

  /**
   * Ingest a single file
   */
  async ingestFile(
    filePath: string,
    options?: {
      sourceType?: Document['sourceType'];
      sourceRef?: string;
      onProgress?: ProgressCallback;
    }
  ): Promise<Document> {
    const absPath = path.resolve(filePath);
    const ext = path.extname(absPath).toLowerCase();
    const fileName = path.basename(absPath, ext);

    // Check for duplicates by file hash
    const fileBuffer = fs.readFileSync(absPath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const existing = this.vectorStore.getDocumentByHash(fileHash);
    if (existing) {
      console.log(`[Ingestion] Skipping duplicate: ${fileName}`);
      return existing;
    }

    const documentId = crypto.randomUUID();
    options?.onProgress?.({ stage: 'extracting', progress: 10, message: `Extracting: ${fileName}` });

    // Extract text
    let fullText: string;
    let pageCount: number | undefined;
    let chunks: DocumentChunk[];
    const metadata: Record<string, string> = {};

    if (ext === '.pdf') {
      const result = await pdfExtractor.extract(absPath);
      fullText = result.fullText;
      pageCount = result.pageCount;
      Object.assign(metadata, result.metadata);
      options?.onProgress?.({ stage: 'chunking', progress: 30, message: `Chunking: ${fileName}` });
      chunks = documentChunker.chunkPDF(documentId, result.pages);
    } else if (TextExtractor.isSupported(absPath)) {
      const result = await textExtractor.extract(absPath);
      fullText = result.text;
      Object.assign(metadata, result.metadata);
      options?.onProgress?.({ stage: 'chunking', progress: 30, message: `Chunking: ${fileName}` });
      chunks = documentChunker.chunkText(documentId, fullText);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }

    if (chunks.length === 0) {
      throw new Error(`No text content extracted from ${fileName}`);
    }

    // Create document record
    const doc: Document = {
      id: documentId,
      filePath: absPath,
      title: metadata.title || fileName,
      author: metadata.author,
      sourceType: options?.sourceType || 'file',
      sourceRef: options?.sourceRef,
      fileFormat: ext.replace('.', '') as Document['fileFormat'],
      pageCount,
      metadata,
      createdAt: new Date().toISOString(),
      indexedAt: new Date().toISOString(),
      fileHash,
    };

    this.vectorStore.addDocument(doc);

    // Generate embeddings in batches
    options?.onProgress?.({ stage: 'embedding', progress: 50, message: `Embedding ${chunks.length} chunks...` });

    const chunksWithEmbeddings: Array<{ chunk: DocumentChunk; embedding: Float32Array }> = [];

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map(c => c.content);

      try {
        const embeddings = await this.ollamaClient.generateEmbeddings(texts);
        for (let j = 0; j < batch.length; j++) {
          chunksWithEmbeddings.push({ chunk: batch[j], embedding: embeddings[j] });
        }
      } catch (e) {
        console.error(`[Ingestion] Embedding batch failed:`, e);
      }

      const pct = 50 + Math.round((i / chunks.length) * 40);
      options?.onProgress?.({ stage: 'embedding', progress: pct, message: `Embedding: ${i + batch.length}/${chunks.length}` });
    }

    // Store in vector store
    options?.onProgress?.({ stage: 'indexing', progress: 90, message: 'Indexing...' });

    this.vectorStore.addChunks(chunksWithEmbeddings, 'document');

    // Add to HNSW
    this.hnswStore.addChunks(
      chunksWithEmbeddings.map(cwe => ({
        chunk: cwe.chunk,
        embedding: cwe.embedding,
        document: doc,
      }))
    );
    this.hnswStore.save();

    // Add to BM25
    this.bm25Index.addChunks(
      chunksWithEmbeddings.map(cwe => ({ chunk: cwe.chunk, document: doc }))
    );

    options?.onProgress?.({ stage: 'complete', progress: 100, message: `Done: ${fileName}`, documentTitle: doc.title });

    console.log(`[Ingestion] Indexed ${fileName}: ${chunks.length} chunks`);
    return doc;
  }

  /**
   * Ingest all supported files in a directory
   */
  async ingestFolder(
    dirPath: string,
    options?: { recursive?: boolean; onProgress?: ProgressCallback }
  ): Promise<{ ingested: number; skipped: number; errors: number }> {
    const files = this.scanDirectory(dirPath, options?.recursive !== false);
    let ingested = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < files.length; i++) {
      try {
        await this.ingestFile(files[i], {
          sourceType: 'folder',
          sourceRef: dirPath,
          onProgress: options?.onProgress,
        });
        ingested++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('duplicate')) {
          skipped++;
        } else {
          errors++;
          console.error(`[Ingestion] Failed: ${files[i]}:`, e);
        }
      }
    }

    return { ingested, skipped, errors };
  }

  /**
   * Scan a directory for supported files
   */
  private scanDirectory(dirPath: string, recursive: boolean): string[] {
    const supported = ['.pdf', '.txt', '.md', '.html', '.htm'];
    const results: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && recursive) {
        results.push(...this.scanDirectory(fullPath, true));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (supported.includes(ext)) {
          results.push(fullPath);
        }
      }
    }

    return results;
  }
}
