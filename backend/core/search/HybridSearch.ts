/**
 * HybridSearch - Reciprocal Rank Fusion of dense + sparse retrieval
 *
 * Combines HNSW vector search (dense) with BM25 keyword search (sparse)
 * using Reciprocal Rank Fusion (RRF) with exact keyword boosting.
 */

import type { SearchResult } from '../../types/document.js';
import type { HNSWVectorStore } from '../vector-store/HNSWVectorStore.js';
import type { BM25Index } from './BM25Index.js';

const RRF_K = 60;  // RRF constant (standard value)
const DEFAULT_DENSE_WEIGHT = 0.6;
const DEFAULT_SPARSE_WEIGHT = 0.4;
const EXACT_MATCH_BOOST = 2.0;

export class HybridSearch {
  private hnswStore: HNSWVectorStore;
  private bm25Index: BM25Index;
  private denseWeight: number = DEFAULT_DENSE_WEIGHT;
  private sparseWeight: number = DEFAULT_SPARSE_WEIGHT;

  constructor(hnswStore: HNSWVectorStore, bm25Index: BM25Index) {
    this.hnswStore = hnswStore;
    this.bm25Index = bm25Index;
  }

  setWeights(denseWeight: number, sparseWeight: number): void {
    this.denseWeight = denseWeight;
    this.sparseWeight = sparseWeight;
  }

  search(
    queryEmbedding: Float32Array,
    queryText: string,
    k: number = 10,
    documentIds?: string[]
  ): SearchResult[] {
    const candidateSize = Math.max(k * 5, 50);

    // Dense retrieval (HNSW)
    const denseResults = this.hnswStore.search(queryEmbedding, candidateSize, documentIds);

    // Sparse retrieval (BM25)
    const sparseResults = this.bm25Index.search(queryText, candidateSize);

    // Filter sparse results by documentIds if provided
    const filteredSparse = documentIds && documentIds.length > 0
      ? sparseResults.filter(r => documentIds.includes(r.chunk.documentId))
      : sparseResults;

    // Fuse via RRF
    return this.reciprocalRankFusion(denseResults, filteredSparse, queryText, k);
  }

  private reciprocalRankFusion(
    denseResults: SearchResult[],
    sparseResults: SearchResult[],
    queryText: string,
    k: number
  ): SearchResult[] {
    const scoreMap = new Map<string, {
      rrfScore: number;
      result: SearchResult;
      denseScore: number;
      sparseScore: number;
      denseRank: number | null;
      sparseRank: number | null;
    }>();

    // Accumulate dense scores
    for (let i = 0; i < denseResults.length; i++) {
      const result = denseResults[i];
      const chunkId = result.chunk.id;
      const rrfScore = this.denseWeight * (1 / (RRF_K + i + 1));

      const existing = scoreMap.get(chunkId);
      if (existing) {
        existing.rrfScore += rrfScore;
        existing.denseScore = result.similarity;
        existing.denseRank = i;
      } else {
        scoreMap.set(chunkId, {
          rrfScore,
          result,
          denseScore: result.similarity,
          sparseScore: 0,
          denseRank: i,
          sparseRank: null,
        });
      }
    }

    // Accumulate sparse scores
    for (let i = 0; i < sparseResults.length; i++) {
      const result = sparseResults[i];
      const chunkId = result.chunk.id;
      const rrfScore = this.sparseWeight * (1 / (RRF_K + i + 1));

      const existing = scoreMap.get(chunkId);
      if (existing) {
        existing.rrfScore += rrfScore;
        existing.sparseScore = result.similarity;
        existing.sparseRank = i;
      } else {
        scoreMap.set(chunkId, {
          rrfScore,
          result,
          denseScore: 0,
          sparseScore: result.similarity,
          denseRank: null,
          sparseRank: i,
        });
      }
    }

    // Exact keyword boosting
    const keywords = this.extractKeywords(queryText);
    if (keywords.length > 0) {
      for (const [_chunkId, entry] of scoreMap.entries()) {
        const contentLower = entry.result.chunk.content.toLowerCase();
        const hasExactMatch = keywords.some(kw => contentLower.includes(kw));
        if (hasExactMatch) {
          entry.rrfScore *= EXACT_MATCH_BOOST;
        }
      }
    }

    // Build final results sorted by RRF score
    const fused: SearchResult[] = Array.from(scoreMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, k)
      .map(entry => ({
        ...entry.result,
        similarity: entry.rrfScore,
        denseScore: entry.denseScore,
        sparseScore: entry.sparseScore,
        denseRank: entry.denseRank,
        sparseRank: entry.sparseRank,
      }));

    return fused;
  }

  /**
   * Extract meaningful keywords (>4 chars) for exact match boosting
   */
  private extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^a-zà-ÿ0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4);
  }
}
