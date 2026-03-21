/**
 * Note types for ClioBrain
 */

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  linkedDocumentIds: string[];
  linkedEntityIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteChunk {
  id: string;
  noteId: string;
  content: string;
  chunkIndex: number;
  embedding?: Float32Array;
}
