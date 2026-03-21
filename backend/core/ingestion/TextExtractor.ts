/**
 * TextExtractor - Extract text from non-PDF files (txt, html, md, docx)
 */

import fs from 'fs';
import path from 'path';

export interface TextExtractionResult {
  text: string;
  format: 'txt' | 'html' | 'md' | 'docx';
  metadata: Record<string, string>;
}

export class TextExtractor {
  /**
   * Extract text based on file extension
   */
  async extract(filePath: string): Promise<TextExtractionResult> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.txt':
        return this.extractTxt(filePath);
      case '.md':
      case '.markdown':
        return this.extractMarkdown(filePath);
      case '.html':
      case '.htm':
        return this.extractHTML(filePath);
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  private extractTxt(filePath: string): TextExtractionResult {
    const text = fs.readFileSync(filePath, 'utf-8');
    return { text, format: 'txt', metadata: {} };
  }

  private extractMarkdown(filePath: string): TextExtractionResult {
    const raw = fs.readFileSync(filePath, 'utf-8');

    // Strip YAML frontmatter
    let text = raw;
    const fmMatch = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    if (fmMatch) {
      text = raw.slice(fmMatch[0].length);
    }

    // Convert markdown to plain text (basic)
    text = text
      .replace(/^#{1,6}\s+/gm, '')               // headings
      .replace(/\*\*(.+?)\*\*/g, '$1')            // bold
      .replace(/\*(.+?)\*/g, '$1')                // italic
      .replace(/~~(.+?)~~/g, '$1')                // strikethrough
      .replace(/`(.+?)`/g, '$1')                  // inline code
      .replace(/```[\s\S]*?```/g, '')             // code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')    // links
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')     // images
      .replace(/^\s*[-*+]\s+/gm, '')              // list items
      .replace(/^\s*\d+\.\s+/gm, '')              // numbered lists
      .replace(/^\s*>\s+/gm, '')                  // blockquotes
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { text, format: 'md', metadata: {} };
  }

  private extractHTML(filePath: string): TextExtractionResult {
    const raw = fs.readFileSync(filePath, 'utf-8');

    // Strip HTML tags and decode entities
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')   // scripts
      .replace(/<style[\s\S]*?<\/style>/gi, '')      // styles
      .replace(/<[^>]+>/g, ' ')                      // all tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Try to extract title from <title>
    const metadata: Record<string, string> = {};
    const titleMatch = raw.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    return { text, format: 'html', metadata };
  }

  /**
   * Check if a file extension is supported
   */
  static isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.txt', '.md', '.markdown', '.html', '.htm'].includes(ext);
  }
}

export const textExtractor = new TextExtractor();
