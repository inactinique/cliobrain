/**
 * Conversation and chat types for ClioBrain
 */

export interface ConversationSession {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  sources?: ChatSource[];
  toolCalls?: AgentToolCall[];
  ragExplanation?: RAGExplanation;
  createdAt: string;
}

export interface ChatSource {
  documentId: string;
  documentTitle: string;
  author?: string;
  year?: string;
  pageNumber?: number;
  chunkContent: string;
  similarity: number;
  sourceType: 'document' | 'note';
}

export interface AgentToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  result: string;
  durationMs: number;
}

export interface RAGExplanation {
  search: {
    query: string;
    totalResults: number;
    searchDurationMs: number;
    cacheHit: boolean;
    documents: Array<{
      title: string;
      similarity: number;
      sourceType: string;
      chunkCount: number;
    }>;
  };
  compression?: {
    enabled: boolean;
    originalChunks: number;
    finalChunks: number;
    reductionPercent: number;
  };
  agent?: {
    iterations: number;
    toolsUsed: string[];
    totalDurationMs: number;
  };
  llm: {
    provider: string;
    model: string;
    contextWindow: number;
    temperature: number;
  };
  timing: {
    searchMs: number;
    compressionMs?: number;
    agentMs?: number;
    generationMs: number;
    totalMs: number;
  };
}

export interface ChatStreamEvent {
  type: 'token' | 'source' | 'tool-call' | 'thinking' | 'done' | 'error';
  data: string;
}
