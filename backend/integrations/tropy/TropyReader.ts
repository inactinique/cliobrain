/**
 * TropyReader - Read Tropy's local SQLite database
 *
 * Supports both .tropy packages (directories) and .tpy files.
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
  photos: TropyPhoto[];
}

export interface TropyNote {
  noteId: number;
  text: string;
  state?: string;
}

export interface TropyPhoto {
  id: number;
  itemId: number;
  filePath: string;
  filename: string;
  mimetype?: string;
  width?: number;
  height?: number;
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
   */
  open(): void {
    let tpyPath: string;

    const stats = fs.statSync(this.projectPath);
    if (stats.isDirectory() && this.projectPath.endsWith('.tropy')) {
      // .tropy package: folder with project.tpy inside
      tpyPath = path.join(this.projectPath, 'project.tpy');
      this.basePath = this.projectPath;
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

  /**
   * Get project name
   */
  getProjectName(): string {
    if (!this.db) throw new Error('Database not open');
    const row = this.db.prepare('SELECT name FROM project LIMIT 1').get() as any;
    return row?.name || 'Unknown';
  }

  /**
   * Get all items with metadata, tags, notes, and photos
   */
  getAllItems(): TropyItem[] {
    if (!this.db) throw new Error('Database not open');

    // Get items
    const items = this.db.prepare(`
      SELECT i.id, s.template, s.type
      FROM items i
      LEFT JOIN subjects s ON i.id = s.id
    `).all() as any[];

    return items.map(row => {
      const metadata = this.getItemMetadata(row.id);
      const tags = this.getItemTags(row.id);
      const notes = this.getItemNotes(row.id);
      const photos = this.getItemPhotos(row.id);

      return {
        id: row.id,
        template: row.template || undefined,
        metadata,
        tags,
        notes,
        photos,
      };
    });
  }

  /**
   * Get item count
   */
  getItemCount(): number {
    if (!this.db) throw new Error('Database not open');
    const row = this.db.prepare('SELECT COUNT(*) as count FROM items').get() as any;
    return row?.count || 0;
  }

  /**
   * Get all tags
   */
  getAllTags(): string[] {
    if (!this.db) throw new Error('Database not open');
    const rows = this.db.prepare('SELECT name FROM tags ORDER BY name').all() as any[];
    return rows.map(r => r.name);
  }

  /**
   * Extract text content from an item (metadata + notes)
   */
  getItemText(item: TropyItem): string {
    const parts: string[] = [];

    // Title from metadata
    const title = item.metadata.title || item.metadata['dc:title'] || item.metadata['dcterms:title'];
    if (title) parts.push(title);

    // Description
    const desc = item.metadata.description || item.metadata['dc:description'] || item.metadata['dcterms:description'];
    if (desc) parts.push(desc);

    // Notes (strip HTML)
    for (const note of item.notes) {
      const text = note.text
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) parts.push(text);
    }

    return parts.join('\n\n');
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
      if (row.value) metadata[row.property] = row.value;
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
      SELECT note_id, text, state
      FROM notes
      WHERE id = ? AND deleted IS NULL
    `).all(itemId) as any[];

    return rows.map(r => ({
      noteId: r.note_id,
      text: r.text || '',
      state: r.state || undefined,
    }));
  }

  private getItemPhotos(itemId: number): TropyPhoto[] {
    const rows = this.db!.prepare(`
      SELECT p.id, p.path, p.filename, p.mimetype, i.width, i.height
      FROM photos p
      LEFT JOIN images i ON p.id = i.id
      WHERE p.item_id = ?
      ORDER BY p.position
    `).all(itemId) as any[];

    return rows.map(r => {
      let filePath = r.path || '';
      // Resolve relative paths against project base
      if (filePath && !path.isAbsolute(filePath)) {
        filePath = path.join(this.basePath, filePath);
      }

      return {
        id: r.id,
        itemId,
        filePath,
        filename: r.filename || '',
        mimetype: r.mimetype || undefined,
        width: r.width || undefined,
        height: r.height || undefined,
      };
    });
  }
}
