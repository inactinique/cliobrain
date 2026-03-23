/**
 * ClioBrain MCP CLI entry point
 *
 * Standalone Node.js process that serves the ClioBrain corpus via MCP (stdio).
 * Launched by Claude Desktop, Claude Code, or any MCP-compatible client.
 *
 * Usage:
 *   node dist/backend/mcp/cli.js --workspace /path/to/workspace
 */

// CRITICAL: Redirect console.log to stderr BEFORE any imports.
// MCP stdio transport uses stdout for JSON-RPC — any stray console.log
// from backend libraries (HNSW, SQLite, etc.) would corrupt the protocol.
const originalLog = console.log;
console.log = (...args: any[]) => console.error(...args);

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadMcpConfig } from './config.js';
import { createMcpServer } from './server.js';

// --- Services (initialized without Electron) ---
import { VectorStore } from '../core/vector-store/VectorStore.js';
import { HNSWVectorStore } from '../core/vector-store/HNSWVectorStore.js';
import { BM25Index } from '../core/search/BM25Index.js';
import { HybridSearch } from '../core/search/HybridSearch.js';
import { OllamaClient } from '../core/llm/OllamaClient.js';
import type { McpServices } from './services.js';
import path from 'path';
import fs from 'fs';

// Parse --workspace argument
function parseArgs(): { workspacePath: string } {
  const args = process.argv.slice(2);
  const wsIndex = args.indexOf('--workspace');

  if (wsIndex === -1 || wsIndex + 1 >= args.length) {
    console.error('Usage: node cli.js --workspace /path/to/workspace');
    process.exit(1);
  }

  return { workspacePath: args[wsIndex + 1] };
}

async function main() {
  const { workspacePath } = parseArgs();

  // Load configuration (resolves paths, reads workspace.json)
  const config = loadMcpConfig(workspacePath);
  console.error(`[ClioBrain MCP] Starting for workspace: ${config.workspace.name}`);

  // Initialize core services (same as DocumentService.initialize but without Electron)
  const dbPath = path.join(config.dataDir, 'brain.db');
  const hnswPath = path.join(config.dataDir, 'hnsw.index');

  const vectorStore = new VectorStore(dbPath);
  const hnswStore = new HNSWVectorStore(hnswPath, 768);
  const hnswResult = await hnswStore.initialize();
  console.error(`[ClioBrain MCP] HNSW: loaded=${hnswResult.loaded}, size=${hnswStore.size}`);

  const bm25Index = new BM25Index();

  // Load BM25 from existing chunks
  const chunks = vectorStore.getAllChunksWithEmbeddings();
  if (chunks.length > 0) {
    bm25Index.addChunks(chunks.map(c => ({ chunk: c.chunk })));
    console.error(`[ClioBrain MCP] BM25: ${chunks.length} chunks loaded`);
  }

  // Rebuild HNSW if index is missing, or if metadata is missing (vectors exist but no chunk mappings).
  // The metadata file (.meta.json) maps vector labels to chunk data.
  // Without it, HNSW finds nearest neighbors but can't resolve them to chunks → empty results.
  const metaPath = hnswPath.replace(/\.index$/, '.meta.json');
  const hasMetadata = fs.existsSync(metaPath);
  const needsRebuild = !hnswResult.loaded || !hasMetadata;

  if (needsRebuild && chunks.length > 0) {
    console.error(`[ClioBrain MCP] HNSW needs rebuild (loaded=${hnswResult.loaded}, hasMetadata=${hasMetadata})`);
    hnswStore.clear();
    await hnswStore.initialize();
    hnswStore.addChunks(chunks.map(c => ({ chunk: c.chunk, embedding: c.embedding })));
    hnswStore.save();
    console.error(`[ClioBrain MCP] HNSW rebuilt with ${chunks.length} chunks + metadata saved`);
  }

  // Initialize Hybrid Search
  const hybridSearch = new HybridSearch(hnswStore, bm25Index);

  // Initialize Ollama client
  const ollamaClient = new OllamaClient({
    baseURL: config.app.llm.ollamaURL,
    embeddingModel: config.app.llm.ollamaEmbeddingModel,
    chatModel: config.app.llm.ollamaChatModel,
  });

  // Build service container
  const services: McpServices = {
    vectorStore,
    hnswStore,
    bm25Index,
    hybridSearch,
    ollamaClient,
    config,
  };

  // Create MCP server with all tools
  const { server, logger } = createMcpServer(config, services);

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[ClioBrain MCP] Server running (stdio). Waiting for requests...`);

  // Graceful shutdown
  const shutdown = () => {
    console.error('[ClioBrain MCP] Shutting down...');
    logger.close();
    hnswStore.save();
    vectorStore.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[ClioBrain MCP] Fatal error:', err);
  process.exit(1);
});
