/**
 * MCP Service Container
 *
 * Holds references to all initialized ClioBrain services.
 * Built in cli.ts without Electron dependencies, then passed to tools.
 */

import type { VectorStore } from '../core/vector-store/VectorStore.js';
import type { HNSWVectorStore } from '../core/vector-store/HNSWVectorStore.js';
import type { BM25Index } from '../core/search/BM25Index.js';
import type { HybridSearch } from '../core/search/HybridSearch.js';
import type { OllamaClient } from '../core/llm/OllamaClient.js';
import type { McpConfig } from './config.js';

export interface McpServices {
  vectorStore: VectorStore;
  hnswStore: HNSWVectorStore;
  bm25Index: BM25Index;
  hybridSearch: HybridSearch;
  ollamaClient: OllamaClient;
  config: McpConfig;
}

/**
 * Simple concurrency guard for expensive MCP operations.
 * MCP stdio is inherently serial, but this protects against
 * rapid sequential requests that pile up async work.
 */
export class ConcurrencyGuard {
  private active = 0;
  constructor(private maxConcurrent: number = 5) {}

  get isBusy(): boolean {
    return this.active >= this.maxConcurrent;
  }

  acquire(): boolean {
    if (this.active >= this.maxConcurrent) return false;
    this.active++;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.acquire()) {
      throw new Error('Too many concurrent requests. Please retry.');
    }
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
