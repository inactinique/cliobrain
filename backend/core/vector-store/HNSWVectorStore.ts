/**
 * HNSWVectorStore - Approximate Nearest Neighbor search via hnswlib-node
 *
 * Wraps hnswlib-node for fast similarity search with persistence,
 * corruption detection, and atomic writes.
 */

import fs from 'fs';
import path from 'path';
import type { DocumentChunk, SearchResult, Document } from '../../types/document.js';

// hnswlib-node types
let HierarchicalNSW: any;

const HNSW_M = 16;
const HNSW_EF_CONSTRUCTION = 100;
const HNSW_EF_SEARCH = 50;
const DEFAULT_MAX_ELEMENTS = 100_000;

interface ChunkData {
  chunk: DocumentChunk;
  document?: Partial<Document>;
}

export class HNSWVectorStore {
  private index: any = null;
  private dimension: number;
  private maxElements: number;
  private currentSize: number = 0;
  private indexPath: string;
  private metaPath: string;
  private chunkIdMap: Map<number, string> = new Map();  // label -> chunkId
  private chunkDataMap: Map<string, ChunkData> = new Map();  // chunkId -> data
  private initialized = false;

  constructor(indexPath: string, dimension: number = 768, maxElements: number = DEFAULT_MAX_ELEMENTS) {
    this.indexPath = indexPath;
    this.metaPath = indexPath.replace(/\.index$/, '.meta.json');
    this.dimension = dimension;
    this.maxElements = maxElements;
  }

  async initialize(): Promise<{ success: boolean; loaded: boolean; corrupted: boolean }> {
    try {
      const hnswlib = await import('hnswlib-node');
      HierarchicalNSW = hnswlib.default?.HierarchicalNSW || hnswlib.HierarchicalNSW;

      if (fs.existsSync(this.indexPath) && this.validateIndexFile()) {
        try {
          this.index = new HierarchicalNSW('cosine', this.dimension);
          this.index.readIndexSync(this.indexPath);
          this.index.setEf(HNSW_EF_SEARCH);
          this.loadMetadata();
          this.initialized = true;
          console.log(`[HNSW] Loaded index with ${this.currentSize} vectors`);
          return { success: true, loaded: true, corrupted: false };
        } catch (e) {
          console.warn('[HNSW] Failed to load index, creating new one:', e);
          this.cleanup();
        }
      }

      // Create new index
      this.index = new HierarchicalNSW('cosine', this.dimension);
      this.index.initIndex(this.maxElements, HNSW_M, HNSW_EF_CONSTRUCTION);
      this.index.setEf(HNSW_EF_SEARCH);
      this.currentSize = 0;
      this.chunkIdMap.clear();
      this.chunkDataMap.clear();
      this.initialized = true;

      console.log(`[HNSW] Created new index (dim=${this.dimension})`);
      return { success: true, loaded: false, corrupted: fs.existsSync(this.indexPath) };
    } catch (error) {
      console.error('[HNSW] Initialization failed:', error);
      return { success: false, loaded: false, corrupted: false };
    }
  }

  private validateIndexFile(): boolean {
    try {
      const stat = fs.statSync(this.indexPath);
      return stat.size > 1024; // Minimum viable index size
    } catch {
      return false;
    }
  }

  private cleanup(): void {
    try {
      if (fs.existsSync(this.indexPath)) fs.unlinkSync(this.indexPath);
      if (fs.existsSync(this.metaPath)) fs.unlinkSync(this.metaPath);
    } catch { /* ignore */ }
    this.chunkIdMap.clear();
    this.chunkDataMap.clear();
    this.currentSize = 0;
  }

  addChunks(chunks: Array<{ chunk: DocumentChunk; embedding: Float32Array; document?: Partial<Document> }>): number {
    if (!this.initialized || !this.index) return 0;

    let added = 0;
    for (const item of chunks) {
      if (item.embedding.length !== this.dimension) {
        console.warn(`[HNSW] Skipping chunk ${item.chunk.id}: wrong dimension ${item.embedding.length}`);
        continue;
      }

      // Check for NaN/Infinity
      let valid = true;
      for (let i = 0; i < item.embedding.length; i++) {
        if (!isFinite(item.embedding[i])) { valid = false; break; }
      }
      if (!valid) continue;

      const label = this.currentSize;
      try {
        this.index.addPoint(Array.from(item.embedding), label);
        this.chunkIdMap.set(label, item.chunk.id);
        this.chunkDataMap.set(item.chunk.id, {
          chunk: item.chunk,
          document: item.document,
        });
        this.currentSize++;
        added++;
      } catch (e) {
        console.warn(`[HNSW] Failed to add chunk ${item.chunk.id}:`, e);
      }
    }

    return added;
  }

  search(queryEmbedding: Float32Array, k: number = 10, documentIds?: string[]): SearchResult[] {
    if (!this.initialized || !this.index || this.currentSize === 0) return [];

    const searchK = Math.min(k * 2, this.currentSize);
    this.index.setEf(Math.max(HNSW_EF_SEARCH, searchK * 2));

    const result = this.index.searchKnn(Array.from(queryEmbedding), searchK);
    const results: SearchResult[] = [];

    for (let i = 0; i < result.neighbors.length; i++) {
      const label = result.neighbors[i];
      const distance = result.distances[i];
      const similarity = 1 - distance;
      const chunkId = this.chunkIdMap.get(label);
      if (!chunkId) continue;

      const data = this.chunkDataMap.get(chunkId);
      if (!data) continue;

      // Filter by document IDs if specified
      if (documentIds && documentIds.length > 0) {
        if (!documentIds.includes(data.chunk.documentId)) continue;
      }

      results.push({
        chunk: data.chunk,
        document: (data.document || { id: data.chunk.documentId, title: '', filePath: '', sourceType: 'file', fileFormat: 'pdf', metadata: {}, createdAt: '', indexedAt: '' }) as Document,
        similarity,
        denseScore: similarity,
      });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
  }

  save(): void {
    if (!this.initialized || !this.index) return;

    // Atomic write: write to .tmp then rename
    const tmpPath = this.indexPath + '.tmp';
    try {
      this.index.writeIndexSync(tmpPath);
      fs.renameSync(tmpPath, this.indexPath);
    } catch (e) {
      // Clean up tmp on failure
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      throw e;
    }

    // Save metadata
    const metadata = {
      version: 1,
      dimension: this.dimension,
      currentSize: this.currentSize,
      savedAt: new Date().toISOString(),
      chunkIdMap: Array.from(this.chunkIdMap.entries()),
      chunkDataMap: Array.from(this.chunkDataMap.entries()),
    };
    fs.writeFileSync(this.metaPath, JSON.stringify(metadata), 'utf-8');
    console.log(`[HNSW] Saved index (${this.currentSize} vectors)`);
  }

  private loadMetadata(): void {
    if (!fs.existsSync(this.metaPath)) return;

    try {
      const raw = fs.readFileSync(this.metaPath, 'utf-8');
      const metadata = JSON.parse(raw);

      if (metadata.dimension !== this.dimension) {
        console.warn(`[HNSW] Dimension mismatch: index=${metadata.dimension}, expected=${this.dimension}`);
        return;
      }

      this.currentSize = metadata.currentSize || 0;
      this.chunkIdMap = new Map(metadata.chunkIdMap || []);
      this.chunkDataMap = new Map(metadata.chunkDataMap || []);
    } catch (e) {
      console.warn('[HNSW] Failed to load metadata:', e);
    }
  }

  get size(): number {
    return this.currentSize;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  clear(): void {
    this.cleanup();
    if (this.initialized && HierarchicalNSW) {
      this.index = new HierarchicalNSW('cosine', this.dimension);
      this.index.initIndex(this.maxElements, HNSW_M, HNSW_EF_CONSTRUCTION);
      this.index.setEf(HNSW_EF_SEARCH);
    }
  }
}
