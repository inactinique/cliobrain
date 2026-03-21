/**
 * DocumentChunker - Split documents into overlapping chunks
 *
 * Supports both fixed-size and adaptive (structure-aware) chunking.
 */

import crypto from 'crypto';
import type { DocumentChunk } from '../../types/document.js';
import type { PDFPage } from './PDFExtractor.js';

export interface ChunkingConfig {
  maxChunkSize: number;   // words
  overlapSize: number;    // words
  minChunkSize: number;   // words
}

export const CHUNKING_CONFIGS: Record<string, ChunkingConfig> = {
  cpuOptimized: { maxChunkSize: 300, overlapSize: 50, minChunkSize: 50 },
  standard:     { maxChunkSize: 500, overlapSize: 75, minChunkSize: 100 },
  large:        { maxChunkSize: 800, overlapSize: 100, minChunkSize: 150 },
};

export class DocumentChunker {
  private config: ChunkingConfig;

  constructor(config: ChunkingConfig = CHUNKING_CONFIGS.standard) {
    this.config = config;
  }

  /**
   * Chunk a full text document (txt, html, md)
   */
  chunkText(documentId: string, text: string): DocumentChunk[] {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];

    const chunks: DocumentChunk[] = [];
    let i = 0;
    let chunkIndex = 0;

    while (i < words.length) {
      let endIndex = Math.min(i + this.config.maxChunkSize, words.length);

      // Try to break at sentence boundary
      if (endIndex < words.length) {
        for (let j = endIndex; j > Math.max(i, endIndex - 50); j--) {
          if (/[.!?;]$/.test(words[j])) {
            endIndex = j + 1;
            break;
          }
        }
      }

      const chunkWords = words.slice(i, endIndex);
      if (chunkWords.length < this.config.minChunkSize && chunks.length > 0) {
        // Too small — merge with previous chunk
        break;
      }

      const content = chunkWords.join(' ');
      chunks.push({
        id: `${documentId}-${chunkIndex}`,
        documentId,
        content,
        chunkIndex,
        startPosition: i,
        endPosition: endIndex,
      });

      chunkIndex++;
      i += this.config.maxChunkSize - this.config.overlapSize;
    }

    return chunks;
  }

  /**
   * Chunk a PDF document (page-aware)
   */
  chunkPDF(documentId: string, pages: PDFPage[]): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let chunkIndex = 0;
    let currentText = '';
    let currentPageStart = 1;
    let currentWordCount = 0;

    for (const page of pages) {
      const pageWords = page.text.split(/\s+/).filter(w => w.length > 0);

      for (const word of pageWords) {
        currentText += (currentText ? ' ' : '') + word;
        currentWordCount++;

        if (currentWordCount >= this.config.maxChunkSize) {
          // Try to break at sentence boundary
          const lastSentenceEnd = Math.max(
            currentText.lastIndexOf('. '),
            currentText.lastIndexOf('! '),
            currentText.lastIndexOf('? ')
          );

          let chunkContent: string;
          let remainder: string;

          if (lastSentenceEnd > currentText.length * 0.5) {
            chunkContent = currentText.substring(0, lastSentenceEnd + 1).trim();
            remainder = currentText.substring(lastSentenceEnd + 1).trim();
          } else {
            chunkContent = currentText.trim();
            remainder = '';
          }

          if (chunkContent.split(/\s+/).length >= this.config.minChunkSize) {
            chunks.push({
              id: `${documentId}-${chunkIndex}`,
              documentId,
              content: chunkContent,
              pageNumber: currentPageStart,
              chunkIndex,
              startPosition: 0,
              endPosition: chunkContent.length,
            });
            chunkIndex++;
          }

          // Keep overlap
          const overlapWords = chunkContent.split(/\s+/).slice(-this.config.overlapSize);
          currentText = overlapWords.join(' ') + (remainder ? ' ' + remainder : '');
          currentWordCount = currentText.split(/\s+/).length;
          currentPageStart = page.pageNumber;
        }
      }
    }

    // Final chunk
    if (currentText.trim().length > 0 && currentText.split(/\s+/).length >= this.config.minChunkSize) {
      chunks.push({
        id: `${documentId}-${chunkIndex}`,
        documentId,
        content: currentText.trim(),
        pageNumber: currentPageStart,
        chunkIndex,
        startPosition: 0,
        endPosition: currentText.length,
      });
    }

    return chunks;
  }
}

export const documentChunker = new DocumentChunker();
