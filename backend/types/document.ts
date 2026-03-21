/**
 * Document and chunk types for ClioBrain
 */

export interface Document {
  id: string;
  filePath: string;
  title: string;
  author?: string;
  year?: string;
  sourceType: 'file' | 'zotero' | 'tropy' | 'folder';
  sourceRef?: string;
  fileFormat: 'pdf' | 'txt' | 'html' | 'md' | 'docx';
  pageCount?: number;
  language?: string;
  summary?: string;
  summaryEmbedding?: Float32Array;
  metadata: Record<string, unknown>;
  createdAt: string;
  indexedAt: string;
  fileHash?: string;
  fileModifiedAt?: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  pageNumber?: number;
  chunkIndex: number;
  startPosition: number;
  endPosition: number;
  sectionTitle?: string;
  sectionType?: string;
}

export interface ChunkWithEmbedding {
  chunk: DocumentChunk;
  embedding: Float32Array;
}

export interface SearchResult {
  chunk: DocumentChunk;
  document: Document;
  similarity: number;
  sourceType?: 'document' | 'note';
  denseScore?: number;
  sparseScore?: number;
  denseRank?: number | null;
  sparseRank?: number | null;
}

export interface SearchOptions {
  topK?: number;
  similarityThreshold?: number;
  sourceFilter?: ('file' | 'zotero' | 'tropy' | 'folder' | 'note')[];
  documentIds?: string[];
  collectionKeys?: string[];
  useHybridSearch?: boolean;
}

export interface VectorStoreStatistics {
  documentCount: number;
  chunkCount: number;
  embeddingCount: number;
  noteCount: number;
  entityCount: number;
  databasePath: string;
}

export interface IndexingProgress {
  stage: 'extracting' | 'preprocessing' | 'chunking' | 'embedding' | 'indexing' | 'analyzing' | 'complete' | 'error';
  progress: number;
  message: string;
  documentTitle?: string;
}
