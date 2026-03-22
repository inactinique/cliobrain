/**
 * TropyReader - Read Tropy's local SQLite database
 *
 * Supports both .tropy packages (directories) and .tpy files.
 * Reads items, metadata (Dublin Core URIs), tags, notes, transcriptions, and photos.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface TropyItem {
  id: number;
  template?: string;
  metadata: Record<string, string>;
  tags: string[];
  notes: TropyNote[];
  transcriptions: TropyTranscription[];
  photos: TropyPhoto[];
}

export interface TropyNote {
  noteId: number;
  text: string;
  language: string;
  state?: string;
}

export interface TropyTranscription {
  transcriptionId: number;
  text: string;
  status: number;
}

export interface TropyPhoto {
  id: number;
  itemId: number;
  filePath: string;
  filename: string;
  mimetype: string;
  protocol: string;
  page: number;
}

export class TropyReader {
  private db: Database.Database | null = null;
  private projectPath: string;
  private basePath: string = '';

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Open the Tropy project database
   * Supports: .tropy directory (package), .tpy file, or directory containing project.tpy
   */
  open(): void {
    let tpyPath: string;

    const stats = fs.statSync(this.projectPath);

    if (stats.isDirectory()) {
      // .tropy package or directory containing project.tpy
      const candidate = path.join(this.projectPath, 'project.tpy');
      if (fs.existsSync(candidate)) {
        tpyPath = candidate;
        this.basePath = this.projectPath;
      } else {
        throw new Error(`No project.tpy found in ${this.projectPath}`);
      }
    } else if (this.projectPath.endsWith('.tpy')) {
      tpyPath = this.projectPath;
      this.basePath = path.dirname(this.projectPath);
    } else {
      throw new Error(`Unsupported Tropy project format: ${this.projectPath}`);
    }

    if (!fs.existsSync(tpyPath)) {
      throw new Error(`Tropy database not found at ${tpyPath}`);
    }

    this.db = new Database(tpyPath, { readonly: true });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getProjectName(): string {
    if (!this.db) throw new Error('Database not open');
    const row = this.db.prepare('SELECT name FROM project LIMIT 1').get() as any;
    return row?.name || path.basename(this.projectPath, '.tropy');
  }

  getItemCount(): number {
    if (!this.db) throw new Error('Database not open');
    const row = this.db.prepare('SELECT COUNT(*) as count FROM items').get() as any;
    return row?.count || 0;
  }

  /**
   * Get all items with metadata, tags, notes, transcriptions, and photos
   */
  getAllItems(): TropyItem[] {
    if (!this.db) throw new Error('Database not open');

    // Get items (exclude trashed)
    const items = this.db.prepare(`
      SELECT i.id, s.template, s.type
      FROM items i
      JOIN subjects s ON i.id = s.id
      WHERE i.id NOT IN (SELECT id FROM trash)
    `).all() as any[];

    return items.map(row => ({
      id: row.id,
      template: row.template || undefined,
      metadata: this.getItemMetadata(row.id),
      tags: this.getItemTags(row.id),
      notes: this.getItemNotes(row.id),
      transcriptions: this.getItemTranscriptions(row.id),
      photos: this.getItemPhotos(row.id),
    }));
  }

  getAllTags(): string[] {
    if (!this.db) throw new Error('Database not open');
    const rows = this.db.prepare('SELECT name FROM tags ORDER BY name').all() as any[];
    return rows.map(r => r.name);
  }

  /**
   * Extract text content from an item (metadata + notes + transcriptions)
   */
  getItemText(item: TropyItem): string {
    const parts: string[] = [];

    // Title from metadata (Dublin Core URIs)
    const title = item.metadata['http://purl.org/dc/elements/1.1/title']
      || item.metadata['http://purl.org/dc/terms/title']
      || item.metadata['title'];
    if (title) parts.push(title);

    // Description
    const desc = item.metadata['http://purl.org/dc/elements/1.1/description']
      || item.metadata['http://purl.org/dc/terms/description']
      || item.metadata['description'];
    if (desc) parts.push(desc);

    // Date
    const date = item.metadata['http://purl.org/dc/elements/1.1/date']
      || item.metadata['http://purl.org/dc/terms/date']
      || item.metadata['date'];
    if (date) parts.push(`Date: ${date}`);

    // Other metadata
    for (const [key, value] of Object.entries(item.metadata)) {
      if (!key.includes('title') && !key.includes('description') && !key.includes('date')) {
        const shortKey = key.split('/').pop() || key;
        parts.push(`${shortKey}: ${value}`);
      }
    }

    // Notes (strip HTML)
    for (const note of item.notes) {
      const text = this.stripHTML(note.text);
      if (text) parts.push(text);
    }

    // Transcriptions
    for (const tx of item.transcriptions) {
      if (tx.text) {
        const text = this.stripHTML(tx.text);
        if (text) parts.push(text);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Get the short title for display
   */
  getItemTitle(item: TropyItem): string {
    return item.metadata['http://purl.org/dc/elements/1.1/title']
      || item.metadata['http://purl.org/dc/terms/title']
      || item.metadata['title']
      || `Item ${item.id}`;
  }

  // ── Private helpers ────────────────────────────────────────────

  private getItemMetadata(itemId: number): Record<string, string> {
    const rows = this.db!.prepare(`
      SELECT m.property, mv.text as value
      FROM metadata m
      JOIN metadata_values mv ON m.value_id = mv.value_id
      WHERE m.id = ?
    `).all(itemId) as any[];

    const metadata: Record<string, string> = {};
    for (const row of rows) {
      if (row.value) metadata[row.property] = String(row.value);
    }
    return metadata;
  }

  private getItemTags(itemId: number): string[] {
    const rows = this.db!.prepare(`
      SELECT t.name
      FROM tags t
      JOIN taggings tg ON t.tag_id = tg.tag_id
      WHERE tg.id = ?
    `).all(itemId) as any[];

    return rows.map(r => r.name);
  }

  private getItemNotes(itemId: number): TropyNote[] {
    const rows = this.db!.prepare(`
      SELECT note_id, text, state, language
      FROM notes
      WHERE id = ? AND deleted IS NULL
    `).all(itemId) as any[];

    return rows.map(r => ({
      noteId: r.note_id,
      text: r.text || '',
      language: r.language || 'en',
      state: r.state || undefined,
    }));
  }

  private getItemTranscriptions(itemId: number): TropyTranscription[] {
    // Transcriptions are linked to photos (images), not directly to items
    // Get all photo IDs for this item, then get their transcriptions
    const photoIds = this.db!.prepare(
      'SELECT id FROM photos WHERE item_id = ?'
    ).all(itemId) as any[];

    if (photoIds.length === 0) return [];

    const placeholders = photoIds.map(() => '?').join(',');
    const ids = photoIds.map((p: any) => p.id);

    const rows = this.db!.prepare(`
      SELECT transcription_id, text, status
      FROM transcriptions
      WHERE id IN (${placeholders}) AND deleted IS NULL AND text IS NOT NULL
    `).all(...ids) as any[];

    return rows.map(r => ({
      transcriptionId: r.transcription_id,
      text: r.text || '',
      status: r.status,
    }));
  }

  private getItemPhotos(itemId: number): TropyPhoto[] {
    const rows = this.db!.prepare(`
      SELECT id, path, protocol, mimetype, filename, page
      FROM photos
      WHERE item_id = ?
      ORDER BY position
    `).all(itemId) as any[];

    return rows.map(r => {
      let filePath = r.path || '';
      // Resolve relative paths against project base
      if (filePath && !path.isAbsolute(filePath) && r.protocol === 'file') {
        filePath = path.join(this.basePath, filePath);
      }

      return {
        id: r.id,
        itemId,
        filePath,
        filename: r.filename || '',
        mimetype: r.mimetype || '',
        protocol: r.protocol || 'file',
        page: r.page || 0,
      };
    });
  }

  private stripHTML(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
