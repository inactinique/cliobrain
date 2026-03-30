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

  // Healthcheck: verify Ollama is reachable
  try {
    const models = await ollamaClient.listModels();
    console.error(`[ClioBrain MCP] Ollama OK — ${models.length} models available`);
  } catch (e) {
    console.error(`[ClioBrain MCP] WARNING: Ollama not reachable at ${config.app.llm.ollamaURL}. Semantic search will fail.`);
  }

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

  // --- Hot-reload: watch for index changes from Electron ---
  // When the Electron app ingests documents, it saves the HNSW index to disk.
  // We watch the metadata file and reload indexes when it changes.
  const metaWatchPath = metaPath;
  let reloadDebounce: ReturnType<typeof setTimeout> | null = null;

  let isReloading = false;
  const reloadIndexes = async () => {
    if (isReloading) return; // Prevent concurrent reloads
    isReloading = true;

    try {
      console.error('[ClioBrain MCP] Index change detected, reloading...');

      // Read fresh chunks from SQLite first, before clearing anything
      const freshChunks = vectorStore.getAllChunksWithEmbeddings();

      // Only clear and rebuild if we got data (fallback: keep old indexes on failure)
      hnswStore.clear();
      await hnswStore.initialize();

      bm25Index.clear();
      if (freshChunks.length > 0) {
        hnswStore.addChunks(freshChunks.map(c => ({ chunk: c.chunk, embedding: c.embedding })));
        bm25Index.addChunks(freshChunks.map(c => ({ chunk: c.chunk })));
      }

      console.error(`[ClioBrain MCP] Reloaded: HNSW=${hnswStore.size} vectors, BM25=${freshChunks.length} chunks`);
    } catch (err) {
      console.error('[ClioBrain MCP] Index reload failed (keeping previous indexes):', err);
    } finally {
      isReloading = false;
    }
  };

  // Watch for HNSW metadata changes (debounced to avoid rapid reloads)
  const watchers: fs.FSWatcher[] = [];
  if (fs.existsSync(metaWatchPath)) {
    const metaWatcher = fs.watch(metaWatchPath, () => {
      if (reloadDebounce) clearTimeout(reloadDebounce);
      reloadDebounce = setTimeout(reloadIndexes, 2000);
    });
    watchers.push(metaWatcher);
    console.error(`[ClioBrain MCP] Watching ${path.basename(metaWatchPath)} for index updates`);
  }

  // Also watch the database file for new documents (covers cases where HNSW isn't rebuilt yet)
  const dbWatchPath = dbPath;
  let dbReloadDebounce: ReturnType<typeof setTimeout> | null = null;
  if (fs.existsSync(dbWatchPath)) {
    const dbWatcher = fs.watch(dbWatchPath, () => {
      if (dbReloadDebounce) clearTimeout(dbReloadDebounce);
      dbReloadDebounce = setTimeout(reloadIndexes, 5000);
    });
    watchers.push(dbWatcher);
  }

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[ClioBrain MCP] Server running (stdio). Waiting for requests...`);

  // Graceful shutdown
  const shutdown = () => {
    console.error('[ClioBrain MCP] Shutting down...');
    // Close file watchers to avoid leaking file descriptors
    for (const w of watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
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
