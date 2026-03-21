/**
 * ContextCompressor - Intelligent context window optimization
 *
 * Three-level compression strategy based on total context size:
 * 1. Light (< 15k chars): no compression, pass through
 * 2. Medium (15k-30k chars): deduplicate similar chunks
 * 3. Aggressive (> 30k chars): dedup + sentence extraction + top-k
 */

import type { SearchResult } from '../../types/document.js';

const LIGHT_THRESHOLD = 15_000;
const MEDIUM_THRESHOLD = 30_000;
const DEDUP_SIMILARITY_THRESHOLD = 0.85;

export class ContextCompressor {
  /**
   * Compress search results to fit within the context window
   */
  compress(results: SearchResult[], maxChars: number = 25_000): {
    compressed: SearchResult[];
    stats: { original: number; final: number; reductionPercent: number; level: string };
  } {
    const totalChars = results.reduce((sum, r) => sum + r.chunk.content.length, 0);

    let compressed: SearchResult[];
    let level: string;

    if (totalChars <= LIGHT_THRESHOLD) {
      compressed = results;
      level = 'none';
    } else if (totalChars <= MEDIUM_THRESHOLD) {
      compressed = this.deduplicateChunks(results);
      level = 'medium';
    } else {
      compressed = this.aggressiveCompress(results, maxChars);
      level = 'aggressive';
    }

    const finalChars = compressed.reduce((sum, r) => sum + r.chunk.content.length, 0);
    const reductionPercent = totalChars > 0
      ? Math.round((1 - finalChars / totalChars) * 100)
      : 0;

    return {
      compressed,
      stats: {
        original: results.length,
        final: compressed.length,
        reductionPercent,
        level,
      },
    };
  }

  /**
   * Medium compression: remove near-duplicate chunks
   */
  private deduplicateChunks(results: SearchResult[]): SearchResult[] {
    const kept: SearchResult[] = [];

    for (const result of results) {
      const isDuplicate = kept.some(existing =>
        this.jaccardSimilarity(existing.chunk.content, result.chunk.content) > DEDUP_SIMILARITY_THRESHOLD
      );
      if (!isDuplicate) {
        kept.push(result);
      }
    }

    return kept;
  }

  /**
   * Aggressive compression: dedup + truncate long chunks + limit count
   */
  private aggressiveCompress(results: SearchResult[], maxChars: number): SearchResult[] {
    // First pass: deduplicate
    const deduped = this.deduplicateChunks(results);

    // Second pass: extract key sentences from long chunks
    const processed = deduped.map(r => {
      if (r.chunk.content.length > 800) {
        return {
          ...r,
          chunk: {
            ...r.chunk,
            content: this.extractKeySentences(r.chunk.content, 500),
          },
        };
      }
      return r;
    });

    // Third pass: take top results until we hit maxChars
    const selected: SearchResult[] = [];
    let totalChars = 0;

    for (const result of processed) {
      if (totalChars + result.chunk.content.length > maxChars) {
        // Try to fit a truncated version
        const remaining = maxChars - totalChars;
        if (remaining > 200) {
          selected.push({
            ...result,
            chunk: {
              ...result.chunk,
              content: result.chunk.content.substring(0, remaining) + '...',
            },
          });
        }
        break;
      }
      selected.push(result);
      totalChars += result.chunk.content.length;
    }

    return selected;
  }

  /**
   * Extract the most important sentences from a text
   */
  private extractKeySentences(text: string, maxLength: number): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    if (sentences.length <= 3) {
      return text.substring(0, maxLength);
    }

    // Score sentences by position (first and last are important) and length
    const scored = sentences.map((s, i) => ({
      sentence: s.trim(),
      score: (i === 0 ? 3 : i === sentences.length - 1 ? 2 : 1) +
             (s.length > 50 ? 1 : 0), // Prefer longer sentences
    }));

    scored.sort((a, b) => b.score - a.score);

    // Take top sentences until maxLength
    const selected: string[] = [];
    let currentLength = 0;

    for (const item of scored) {
      if (currentLength + item.sentence.length > maxLength) break;
      selected.push(item.sentence);
      currentLength += item.sentence.length;
    }

    // Re-sort by original position
    return selected.join(' ');
  }

  /**
   * Jaccard similarity between two texts (word-level)
   */
  private jaccardSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}

export const contextCompressor = new ContextCompressor();
