/**
 * BM25Index - Keyword-based retrieval using BM25 scoring
 *
 * Uses the natural library for TF-IDF and implements BM25 ranking
 * for sparse retrieval in the hybrid search pipeline.
 */

import natural from 'natural';
import type { DocumentChunk, SearchResult, Document } from '../../types/document.js';

const K1 = 1.5;  // TF saturation parameter
const B = 0.75;   // Length normalization parameter

interface ChunkEntry {
  chunk: DocumentChunk;
  document?: Partial<Document>;
  terms: Map<string, number>;  // term -> frequency
  length: number;              // total term count
}

export class BM25Index {
  private entries: ChunkEntry[] = [];
  private idfCache: Map<string, number> = new Map();
  private avgDocLength: number = 0;
  private isDirty: boolean = true;

  addChunks(chunks: Array<{ chunk: DocumentChunk; document?: Partial<Document> }>): void {
    for (const item of chunks) {
      const processed = this.preprocess(item.chunk.content);
      const terms = this.tokenize(processed);
      const termFreq = new Map<string, number>();

      for (const term of terms) {
        termFreq.set(term, (termFreq.get(term) || 0) + 1);
      }

      this.entries.push({
        chunk: item.chunk,
        document: item.document,
        terms: termFreq,
        length: terms.length,
      });
    }

    this.isDirty = true;
  }

  search(query: string, k: number = 10): SearchResult[] {
    if (this.entries.length === 0) return [];
    if (this.isDirty) this.updateCache();

    const processed = this.preprocess(query);
    const queryTerms = this.tokenize(processed).filter(t => t.length > 0);
    if (queryTerms.length === 0) return [];

    const results: SearchResult[] = [];

    for (const entry of this.entries) {
      let score = 0;

      for (const term of queryTerms) {
        const tf = entry.terms.get(term) || 0;
        if (tf === 0) continue;

        const idf = this.idfCache.get(term) || 0;
        const numerator = tf * (K1 + 1);
        const denominator = tf + K1 * (1 - B + B * entry.length / this.avgDocLength);
        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        results.push({
          chunk: entry.chunk,
          document: (entry.document || {
            id: entry.chunk.documentId, title: '', filePath: '',
            sourceType: 'file', fileFormat: 'pdf', metadata: {},
            createdAt: '', indexedAt: '',
          }) as Document,
          similarity: score,
          sparseScore: score,
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
  }

  private updateCache(): void {
    const N = this.entries.length;
    if (N === 0) return;

    // Calculate document frequency for each term
    const termDocFreq = new Map<string, number>();
    let totalLength = 0;

    for (const entry of this.entries) {
      totalLength += entry.length;
      for (const term of entry.terms.keys()) {
        termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
      }
    }

    this.avgDocLength = totalLength / N;

    // Calculate IDF for each term
    this.idfCache.clear();
    for (const [term, df] of termDocFreq.entries()) {
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      this.idfCache.set(term, idf);
    }

    this.isDirty = false;
  }

  private preprocess(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-zà-ÿ0-9\s-]/g, ' ')  // Keep accented chars
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenize(text: string): string[] {
    return text.split(/\s+/).filter(t => t.length > 1);
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.idfCache.clear();
    this.avgDocLength = 0;
    this.isDirty = true;
  }
}
