/**
 * Configuration types for ClioBrain
 */

export interface LLMConfig {
  backend: 'ollama';
  ollamaURL: string;
  ollamaEmbeddingModel: string;
  ollamaChatModel: string;
  generationProvider: 'ollama' | 'auto';
  embeddingProvider: 'ollama' | 'auto';
}

export interface RAGConfig {
  topK: number;
  similarityThreshold: number;
  useHybridSearch: boolean;
  useAdaptiveChunking: boolean;
  useHNSWIndex: boolean;
  enableContextCompression: boolean;
  systemPromptLanguage: 'fr' | 'en' | 'de';
  customSystemPrompt?: string;
  useCustomSystemPrompt: boolean;
  numCtx?: number;
  enableAgent: boolean;
  maxAgentIterations: number;
  enableQualityFiltering: boolean;
  enableDeduplication: boolean;
  enablePreprocessing: boolean;
  customChunkingEnabled?: boolean;
  customMaxChunkSize?: number;
  customMinChunkSize?: number;
  customOverlapSize?: number;
}

export interface ZoteroConfig {
  mode: 'local';
  dataDirectory: string;
  libraryID?: number;
}

export interface TropyConfig {
  projectPath?: string;
  performOCR: boolean;
  ocrLanguage: string;
}

export interface FolderConfig {
  watchedFolders: Array<{
    path: string;
    recursive: boolean;
    maxDepth: number;
    enabled: boolean;
  }>;
}

export interface AppConfig {
  llm: LLMConfig;
  rag: RAGConfig;
  zotero?: ZoteroConfig;
  tropy?: TropyConfig;
  folders?: FolderConfig;
  recentWorkspaces: string[];
  language: 'fr' | 'en' | 'de';
  theme: 'light' | 'dark' | 'system';
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  backend: 'ollama',
  ollamaURL: 'http://127.0.0.1:11434',
  ollamaEmbeddingModel: 'nomic-embed-text',
  ollamaChatModel: 'gemma2:2b',
  generationProvider: 'ollama',
  embeddingProvider: 'ollama',
};

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  topK: 10,
  similarityThreshold: 0.12,
  useHybridSearch: true,
  useAdaptiveChunking: true,
  useHNSWIndex: true,
  enableContextCompression: true,
  systemPromptLanguage: 'fr',
  useCustomSystemPrompt: false,
  enableAgent: true,
  maxAgentIterations: 5,
  enableQualityFiltering: true,
  enableDeduplication: true,
  enablePreprocessing: true,
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  llm: DEFAULT_LLM_CONFIG,
  rag: DEFAULT_RAG_CONFIG,
  recentWorkspaces: [],
  language: 'fr',
  theme: 'system',
};
