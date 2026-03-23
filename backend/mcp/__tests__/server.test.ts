import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createMcpServer } from '../server.js';
import type { McpConfig } from '../config.js';
import type { McpServices } from '../services.js';

// Minimal mock services
function createMockServices(config: McpConfig): McpServices {
  return {
    vectorStore: {
      getStatistics: () => ({ documentCount: 10, chunkCount: 100, embeddingCount: 100, noteCount: 5, entityCount: 20, databasePath: '/tmp/test.db' }),
      getAllDocuments: () => [],
      close: () => {},
    } as any,
    hnswStore: {
      search: () => [],
      size: 100,
      save: () => {},
    } as any,
    bm25Index: {
      search: () => [],
    } as any,
    hybridSearch: {
      search: () => [],
    } as any,
    ollamaClient: {
      generateEmbedding: vi.fn().mockResolvedValue(new Float32Array(768)),
    } as any,
    config,
  };
}

function createTestConfig(): { config: McpConfig; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cliobrain-server-test-'));
  const clioDir = path.join(tmpDir, '.cliobrain');
  fs.mkdirSync(clioDir);

  const config: McpConfig = {
    workspacePath: tmpDir,
    configDir: clioDir,
    dataDir: path.join(tmpDir, 'data'),
    workspace: { name: 'test', createdAt: '', language: 'fr', watchedFolders: [] },
    app: {
      llm: { backend: 'ollama', ollamaURL: 'http://127.0.0.1:11434', ollamaEmbeddingModel: 'nomic-embed-text', ollamaChatModel: 'gemma2:2b', generationProvider: 'ollama', embeddingProvider: 'ollama' },
      rag: { topK: 10, similarityThreshold: 0.12, useHybridSearch: true, useAdaptiveChunking: true, useHNSWIndex: true, enableContextCompression: true, systemPromptLanguage: 'fr', useCustomSystemPrompt: false, enableAgent: true, maxAgentIterations: 5, enableQualityFiltering: true, enableDeduplication: true, enablePreprocessing: true },
      recentWorkspaces: [],
      language: 'fr',
      theme: 'system',
    },
    logPath: path.join(clioDir, 'mcp-access.jsonl'),
  };

  fs.mkdirSync(config.dataDir, { recursive: true });

  return {
    config,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true }),
  };
}

describe('createMcpServer', () => {
  it('creates a server with logger', () => {
    const { config, cleanup } = createTestConfig();
    try {
      const services = createMockServices(config);
      const { server, logger } = createMcpServer(config, services);

      expect(server).toBeDefined();
      expect(logger).toBeDefined();

      logger.close();
    } finally {
      cleanup();
    }
  });

  it('creates the log file on startup', () => {
    const { config, cleanup } = createTestConfig();
    try {
      const services = createMockServices(config);
      const { logger } = createMcpServer(config, services);

      // Log something to trigger file creation
      logger.log({ type: 'tool', name: 'test', input: {}, outputSummary: {} });
      logger.close();

      expect(fs.existsSync(config.logPath)).toBe(true);
    } finally {
      cleanup();
    }
  });
});
