/**
 * ChatService - RAG chat orchestration with streaming
 *
 * Pipeline: query → embed → hybrid search → compress → generate (stream)
 * Supports both simple RAG and agent mode with tool-use.
 */

import crypto from 'crypto';
import { BrowserWindow } from 'electron';
import { documentService } from './document-service.js';
import { configManager } from './config-manager.js';
import { getChatSystemPrompt, buildRAGPrompt, type PromptLanguage } from '../../../backend/core/llm/SystemPrompts.js';
import { contextCompressor } from '../../../backend/core/rag/ContextCompressor.js';
import { AgentOrchestrator, type AgentTool } from '../../../backend/core/rag/AgentOrchestrator.js';
import type { SearchResult } from '../../../backend/types/document.js';
import type { ConversationMessage, ChatSource, RAGExplanation } from '../../../backend/types/conversation.js';

let abortController: AbortController | null = null;

class ChatService {
  /**
   * Send a message and stream the response
   */
  async send(
    message: string,
    options?: {
      sessionId?: string;
      useAgent?: boolean;
      topK?: number;
      sourceFilter?: string[];
    }
  ): Promise<void> {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No window available');
    if (!documentService.isInitialized || !documentService.ollama) {
      throw new Error('Document service not initialized');
    }

    const config = configManager.getAll();
    const language = (config.rag?.systemPromptLanguage || config.language || 'fr') as PromptLanguage;
    const useAgent = options?.useAgent ?? config.rag?.enableAgent ?? false;
    const topK = options?.topK ?? config.rag?.topK ?? 10;

    abortController = new AbortController();
    const startTime = Date.now();

    try {
      if (useAgent) {
        await this.sendWithAgent(message, language, topK, win, options);
      } else {
        await this.sendWithRAG(message, language, topK, win, options);
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        win.webContents.send('chat:stream-done', { content: '', cancelled: true });
      } else {
        win.webContents.send('chat:stream-error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      abortController = null;
    }
  }

  /**
   * Simple RAG pipeline: search → compress → stream
   */
  private async sendWithRAG(
    message: string,
    language: PromptLanguage,
    topK: number,
    win: BrowserWindow,
    options?: { sessionId?: string }
  ): Promise<void> {
    const searchStart = Date.now();

    // Search
    const results = await documentService.search(message, { topK });
    const searchMs = Date.now() - searchStart;

    // Compress context
    const { compressed, stats: compressionStats } = contextCompressor.compress(results);

    // Build prompt
    const sources = compressed.map(r => ({
      content: r.chunk.content,
      title: r.document.title,
      author: r.document.author,
      year: r.document.year,
      pageNumber: r.chunk.pageNumber,
      sourceType: r.document.sourceType,
    }));

    const systemPrompt = getChatSystemPrompt(language);
    const prompt = buildRAGPrompt(message, sources, language);

    // Stream response
    const genStart = Date.now();
    let fullContent = '';

    const stream = documentService.ollama!.generateResponseStream(
      prompt, systemPrompt, undefined, abortController?.signal
    );

    for await (const chunk of stream) {
      fullContent += chunk;
      win.webContents.send('chat:stream', chunk);
    }

    const genMs = Date.now() - genStart;

    // Build sources for the response
    const chatSources: ChatSource[] = compressed.map(r => ({
      documentId: r.document.id,
      documentTitle: r.document.title,
      author: r.document.author,
      year: r.document.year,
      pageNumber: r.chunk.pageNumber,
      chunkContent: r.chunk.content.substring(0, 200),
      similarity: r.similarity,
      sourceType: r.document.sourceType === 'obsidian-note' ? 'note' as const : 'document' as const,
    }));

    // Build RAG explanation
    const ragExplanation: RAGExplanation = {
      search: {
        query: message,
        totalResults: results.length,
        searchDurationMs: searchMs,
        cacheHit: false,
        documents: compressed.map(r => ({
          title: r.document.title,
          similarity: r.similarity,
          sourceType: r.document.sourceType,
          chunkCount: 1,
        })),
      },
      compression: {
        enabled: true,
        originalChunks: compressionStats.original,
        finalChunks: compressionStats.final,
        reductionPercent: compressionStats.reductionPercent,
      },
      llm: {
        provider: 'ollama',
        model: configManager.get('llm.ollamaChatModel') || 'gemma2:2b',
        contextWindow: 0,
        temperature: 0.1,
      },
      timing: {
        searchMs,
        compressionMs: 0,
        generationMs: genMs,
        totalMs: Date.now() - (Date.now() - searchMs - genMs),
      },
    };

    // Send completion
    win.webContents.send('chat:stream-done', {
      content: fullContent,
      sources: chatSources,
      ragExplanation,
    });

    // Persist messages to DB
    if (options?.sessionId && documentService.store) {
      documentService.store.addMessage({
        id: crypto.randomUUID(),
        sessionId: options.sessionId,
        role: 'user',
        content: message,
      });
      documentService.store.addMessage({
        id: crypto.randomUUID(),
        sessionId: options.sessionId,
        role: 'assistant',
        content: fullContent,
        sources: chatSources,
        ragExplanation,
      });
    }
  }

  /**
   * Agent mode: ReAct loop with tools
   */
  private async sendWithAgent(
    message: string,
    language: PromptLanguage,
    topK: number,
    win: BrowserWindow,
    options?: { sessionId?: string }
  ): Promise<void> {
    const agent = new AgentOrchestrator(documentService.ollama!, language);

    // Register tools
    agent.registerTool({
      name: 'search_documents',
      description: 'Search indexed documents and Obsidian notes',
      execute: async (args) => {
        const query = args.query as string || message;
        const results = await documentService.search(query, { topK });
        agent.addSources(results);

        return results.map((r, i) =>
          `[${i + 1}] ${r.document.title}${r.document.author ? ` - ${r.document.author}` : ''}${r.chunk.pageNumber ? ` (p. ${r.chunk.pageNumber})` : ''}\n${r.chunk.content.substring(0, 300)}`
        ).join('\n\n');
      },
    });

    agent.registerTool({
      name: 'get_document',
      description: 'Get full details of a document by ID',
      execute: async (args) => {
        const id = args.id as string;
        const doc = documentService.store?.getDocument(id);
        if (!doc) return 'Document not found';
        return `Title: ${doc.title}\nAuthor: ${doc.author || 'N/A'}\nYear: ${doc.year || 'N/A'}\nSummary: ${doc.summary || 'No summary'}`;
      },
    });

    // Run agent
    const result = await agent.run(message);

    // Stream the answer (word by word for a more natural feel)
    const words = result.answer.split(/(\s+)/);
    for (const word of words) {
      win.webContents.send('chat:stream', word);
      // Small delay for streaming effect
      await new Promise(resolve => setTimeout(resolve, 15));
    }

    // Build sources
    const chatSources: ChatSource[] = result.sources.map(r => ({
      documentId: r.document.id,
      documentTitle: r.document.title,
      author: r.document.author,
      year: r.document.year,
      pageNumber: r.chunk.pageNumber,
      chunkContent: r.chunk.content.substring(0, 200),
      similarity: r.similarity,
      sourceType: r.document.sourceType === 'obsidian-note' ? 'note' as const : 'document' as const,
    }));

    const ragExplanation = {
      agent: {
        iterations: result.iterations,
        toolsUsed: result.steps.filter(s => s.toolName).map(s => s.toolName!),
        totalDurationMs: result.totalDurationMs,
      },
    };

    win.webContents.send('chat:stream-done', {
      content: result.answer,
      sources: chatSources,
      ragExplanation,
    });

    // Persist messages to DB
    if (options?.sessionId && documentService.store) {
      documentService.store.addMessage({
        id: crypto.randomUUID(),
        sessionId: options.sessionId,
        role: 'user',
        content: message,
      });
      documentService.store.addMessage({
        id: crypto.randomUUID(),
        sessionId: options.sessionId,
        role: 'assistant',
        content: result.answer,
        sources: chatSources,
        ragExplanation,
      });
    }
  }

  /**
   * Cancel the current generation
   */
  cancel(): void {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }
}

export const chatService = new ChatService();
