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
