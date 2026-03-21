/**
 * DocumentService - Manages the document ingestion and search pipeline
 *
 * Owns the VectorStore, HNSW index, BM25 index, HybridSearch, and OllamaClient.
 * Initialized per-workspace when a workspace is loaded.
 */

import path from 'path';
import { VectorStore } from '../../../backend/core/vector-store/VectorStore.js';
import { HNSWVectorStore } from '../../../backend/core/vector-store/HNSWVectorStore.js';
import { BM25Index } from '../../../backend/core/search/BM25Index.js';
import { HybridSearch } from '../../../backend/core/search/HybridSearch.js';
import { OllamaClient } from '../../../backend/core/llm/OllamaClient.js';
import { configManager } from './config-manager.js';
import type { SearchResult, SearchOptions, VectorStoreStatistics } from '../../../backend/types/document.js';

class DocumentService {
  private vectorStore: VectorStore | null = null;
  private hnswStore: HNSWVectorStore | null = null;
  private bm25Index: BM25Index | null = null;
  private hybridSearch: HybridSearch | null = null;
  private ollamaClient: OllamaClient | null = null;
  private workspaceDataDir: string | null = null;

  get isInitialized(): boolean {
    return this.vectorStore !== null;
  }

  get store(): VectorStore | null {
    return this.vectorStore;
  }

  get hnsw(): HNSWVectorStore | null {
    return this.hnswStore;
  }

  get bm25(): BM25Index | null {
    return this.bm25Index;
  }

  get ollama(): OllamaClient | null {
    return this.ollamaClient;
  }

  async initialize(dataDir: string): Promise<void> {
    this.workspaceDataDir = dataDir;

    const config = configManager.getAll();

    // Initialize SQLite store
    const dbPath = path.join(dataDir, 'brain.db');
    this.vectorStore = new VectorStore(dbPath);

    // Initialize HNSW
    const hnswPath = path.join(dataDir, 'hnsw.index');
    this.hnswStore = new HNSWVectorStore(hnswPath, 768);
    const hnswResult = await this.hnswStore.initialize();
    console.log(`[DocumentService] HNSW init: loaded=${hnswResult.loaded}, size=${this.hnswStore.size}`);

    // Initialize BM25
    this.bm25Index = new BM25Index();

    // Initialize Hybrid Search
    this.hybridSearch = new HybridSearch(this.hnswStore, this.bm25Index);

    // Initialize Ollama client
    this.ollamaClient = new OllamaClient({
      baseURL: config.llm?.ollamaURL || 'http://127.0.0.1:11434',
      embeddingModel: config.llm?.ollamaEmbeddingModel || 'nomic-embed-text',
      chatModel: config.llm?.ollamaChatModel || 'gemma2:2b',
    });

    // Load existing chunks into BM25 and HNSW if HNSW was freshly created
    if (!hnswResult.loaded) {
      await this.rebuildInMemoryIndexes();
    } else {
      // Just load BM25 from existing chunks
      this.loadBM25FromDB();
    }

    console.log(`[DocumentService] Initialized at ${dataDir}`);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.ollamaClient || !this.hybridSearch) return [];

    const topK = options?.topK || 10;
    const useHybrid = options?.useHybridSearch !== false;

    // Generate query embedding
    const queryEmbedding = await this.ollamaClient.generateEmbedding(query);

    if (useHybrid && this.hybridSearch) {
      return this.hybridSearch.search(queryEmbedding, query, topK, options?.documentIds);
    }

    // Fallback to HNSW-only
    if (this.hnswStore) {
      return this.hnswStore.search(queryEmbedding, topK, options?.documentIds);
    }

    // Fallback to brute force
    if (this.vectorStore) {
      return this.vectorStore.searchBruteForce(queryEmbedding, topK, options?.documentIds);
    }

    return [];
  }

  getStatistics(): VectorStoreStatistics | null {
    return this.vectorStore?.getStatistics() || null;
  }

  private loadBM25FromDB(): void {
    if (!this.vectorStore || !this.bm25Index) return;

    const chunks = this.vectorStore.getAllChunksWithEmbeddings();
    this.bm25Index.addChunks(chunks.map(c => ({ chunk: c.chunk })));
    console.log(`[DocumentService] Loaded ${chunks.length} chunks into BM25`);
  }

  private async rebuildInMemoryIndexes(): Promise<void> {
    if (!this.vectorStore || !this.hnswStore || !this.bm25Index) return;

    const chunks = this.vectorStore.getAllChunksWithEmbeddings();
    if (chunks.length === 0) return;

    // Add to HNSW
    this.hnswStore.addChunks(chunks.map(c => ({
      chunk: c.chunk,
      embedding: c.embedding,
    })));

    // Add to BM25
    this.bm25Index.addChunks(chunks.map(c => ({ chunk: c.chunk })));

    // Save HNSW
    this.hnswStore.save();

    console.log(`[DocumentService] Rebuilt indexes with ${chunks.length} chunks`);
  }

  close(): void {
    if (this.vectorStore) {
      this.hnswStore?.save();
      this.vectorStore.close();
    }
    this.vectorStore = null;
    this.hnswStore = null;
    this.bm25Index = null;
    this.hybridSearch = null;
    this.ollamaClient = null;
    this.workspaceDataDir = null;
  }
}

export const documentService = new DocumentService();
