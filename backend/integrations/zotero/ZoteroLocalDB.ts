/**
 * ZoteroLocalDB - Read Zotero's local SQLite database
 *
 * Uses copy-on-read pattern to avoid lock conflicts with running Zotero.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface ZoteroItem {
  itemID: number;
  key: string;
  itemType: string;
  title: string;
  creators: ZoteroCreator[];
  date?: string;
  abstractNote?: string;
  fields: Record<string, string>;
  tags: string[];
  collectionKeys: string[];
  attachments: ZoteroAttachment[];
}

export interface ZoteroCreator {
  firstName: string;
  lastName: string;
  creatorType: string;
}

export interface ZoteroAttachment {
  key: string;
  contentType: string;
  path?: string;
  linkMode: number;
}

export interface ZoteroCollection {
  key: string;
  name: string;
  parentKey?: string;
}

export class ZoteroLocalDB {
  private db: Database.Database | null = null;
  private tempDbPath: string = '';
  private dataDirectory: string;

  constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  /**
   * Open the database (copy-on-read to avoid lock conflicts)
   */
  open(): void {
    const dbPath = path.join(this.dataDirectory, 'zotero.sqlite');
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Zotero database not found at ${dbPath}`);
    }

    // Copy to temp file
    const tmpDir = os.tmpdir();
    const tempName = `cliobrain-zotero-${Date.now()}.sqlite`;
    this.tempDbPath = path.join(tmpDir, tempName);
    fs.copyFileSync(dbPath, this.tempDbPath);

    // Copy WAL file if present
    const walPath = dbPath + '-wal';
    if (fs.existsSync(walPath)) {
      fs.copyFileSync(walPath, this.tempDbPath + '-wal');
    }

    this.db = new Database(this.tempDbPath, { readonly: true });
  }

  /**
   * Close and cleanup temp files
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    for (const ext of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(this.tempDbPath + ext); } catch { /* ignore */ }
    }
  }

  /**
   * List available libraries
   */
  listLibraries(): Array<{ libraryID: number; type: string; name: string }> {
    if (!this.db) throw new Error('Database not open');

    return this.db.prepare(`
      SELECT l.libraryID, l.type, COALESCE(g.name, 'My Library') as name
      FROM libraries l
      LEFT JOIN groups g ON l.libraryID = g.libraryID
      WHERE l.type IN ('user', 'group')
      ORDER BY l.type ASC, name ASC
    `).all() as any[];
  }

  /**
   * List collections in a library
   */
  listCollections(libraryID?: number): ZoteroCollection[] {
    if (!this.db) throw new Error('Database not open');

    let query = `
      SELECT c.collectionName as name, c.key, pc.key as parentKey
      FROM collections c
      LEFT JOIN collections pc ON c.parentCollectionID = pc.collectionID
    `;
    const params: any[] = [];

    if (libraryID !== undefined) {
      query += ' WHERE c.libraryID = ?';
      params.push(libraryID);
    }

    query += ' ORDER BY c.collectionName ASC';

    return (this.db.prepare(query).all(...params) as any[]).map(r => ({
      key: r.key,
      name: r.name,
      parentKey: r.parentKey || undefined,
    }));
  }

  /**
   * Get items in a collection (or all items in a library)
   */
  getItems(options: { collectionKey?: string; libraryID?: number }): ZoteroItem[] {
    if (!this.db) throw new Error('Database not open');

    // Get item IDs
    let query: string;
    const params: any[] = [];

    if (options.collectionKey) {
      query = `
        SELECT DISTINCT i.itemID, i.key, i.dateAdded, i.dateModified, it.typeName as itemType
        FROM items i
        JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
        JOIN collectionItems ci ON i.itemID = ci.itemID
        JOIN collections c ON ci.collectionID = c.collectionID
        WHERE c.key = ?
          AND it.typeName NOT IN ('attachment', 'note')
          AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        ORDER BY i.dateAdded DESC
      `;
      params.push(options.collectionKey);
    } else {
      query = `
        SELECT DISTINCT i.itemID, i.key, i.dateAdded, i.dateModified, it.typeName as itemType
        FROM items i
        JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
        WHERE it.typeName NOT IN ('attachment', 'note')
          AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        ${options.libraryID !== undefined ? 'AND i.libraryID = ?' : ''}
        ORDER BY i.dateAdded DESC
      `;
      if (options.libraryID !== undefined) params.push(options.libraryID);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    if (rows.length === 0) return [];

    const itemIDs = rows.map(r => r.itemID);
    const itemMap = new Map(rows.map(r => [r.itemID, r]));

    // Batch fetch fields, creators, tags, collections
    const fields = this.batchFetchFields(itemIDs);
    const creators = this.batchFetchCreators(itemIDs);
    const tags = this.batchFetchTags(itemIDs);
    const collections = this.batchFetchCollections(itemIDs);

    return rows.map(row => {
      const itemFields = fields.get(row.itemID) || {};
      return {
        itemID: row.itemID,
        key: row.key,
        itemType: row.itemType,
        title: itemFields.title || 'Untitled',
        creators: creators.get(row.itemID) || [],
        date: itemFields.date,
        abstractNote: itemFields.abstractNote,
        fields: itemFields,
        tags: tags.get(row.itemID) || [],
        collectionKeys: collections.get(row.itemID) || [],
        attachments: this.getAttachments(row.itemID),
      };
    });
  }

  /**
   * Get PDF attachment path for an item
   */
  getPDFPath(item: ZoteroItem): string | null {
    for (const att of item.attachments) {
      if (att.contentType === 'application/pdf' && att.path) {
        // Zotero stores paths as "storage:filename.pdf"
        if (att.path.startsWith('storage:')) {
          const filename = att.path.replace('storage:', '');
          return path.join(this.dataDirectory, 'storage', att.key, filename);
        }
        // Linked file — absolute path
        return att.path;
      }
    }
    return null;
  }

  // ── Batch queries ──────────────────────────────────────────────

  private batchFetchFields(itemIDs: number[]): Map<number, Record<string, string>> {
    const result = new Map<number, Record<string, string>>();
    const chunkSize = 500;

    for (let i = 0; i < itemIDs.length; i += chunkSize) {
      const chunk = itemIDs.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');

      const rows = this.db!.prepare(`
        SELECT id.itemID, f.fieldName, idv.value
        FROM itemData id
        JOIN fields f ON id.fieldID = f.fieldID
        JOIN itemDataValues idv ON id.valueID = idv.valueID
        WHERE id.itemID IN (${placeholders})
      `).all(...chunk) as any[];

      for (const row of rows) {
        if (!result.has(row.itemID)) result.set(row.itemID, {});
        result.get(row.itemID)![row.fieldName] = row.value;
      }
    }

    return result;
  }

  private batchFetchCreators(itemIDs: number[]): Map<number, ZoteroCreator[]> {
    const result = new Map<number, ZoteroCreator[]>();
    const chunkSize = 500;

    for (let i = 0; i < itemIDs.length; i += chunkSize) {
      const chunk = itemIDs.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');

      const rows = this.db!.prepare(`
        SELECT ic.itemID, c.firstName, c.lastName, ct.creatorType
        FROM itemCreators ic
        JOIN creators c ON ic.creatorID = c.creatorID
        JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
        WHERE ic.itemID IN (${placeholders})
        ORDER BY ic.itemID, ic.orderIndex
      `).all(...chunk) as any[];

      for (const row of rows) {
        if (!result.has(row.itemID)) result.set(row.itemID, []);
        result.get(row.itemID)!.push({
          firstName: row.firstName || '',
          lastName: row.lastName || '',
          creatorType: row.creatorType,
        });
      }
    }

    return result;
  }

  private batchFetchTags(itemIDs: number[]): Map<number, string[]> {
    const result = new Map<number, string[]>();
    const chunkSize = 500;

    for (let i = 0; i < itemIDs.length; i += chunkSize) {
      const chunk = itemIDs.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');

      const rows = this.db!.prepare(`
        SELECT it.itemID, t.name
        FROM itemTags it
        JOIN tags t ON it.tagID = t.tagID
        WHERE it.itemID IN (${placeholders})
      `).all(...chunk) as any[];

      for (const row of rows) {
        if (!result.has(row.itemID)) result.set(row.itemID, []);
        result.get(row.itemID)!.push(row.name);
      }
    }

    return result;
  }

  private batchFetchCollections(itemIDs: number[]): Map<number, string[]> {
    const result = new Map<number, string[]>();
    const chunkSize = 500;

    for (let i = 0; i < itemIDs.length; i += chunkSize) {
      const chunk = itemIDs.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');

      const rows = this.db!.prepare(`
        SELECT ci.itemID, c.key
        FROM collectionItems ci
        JOIN collections c ON ci.collectionID = c.collectionID
        WHERE ci.itemID IN (${placeholders})
      `).all(...chunk) as any[];

      for (const row of rows) {
        if (!result.has(row.itemID)) result.set(row.itemID, []);
        result.get(row.itemID)!.push(row.key);
      }
    }

    return result;
  }

  /** Get collection names by their keys */
  getCollectionNames(keys: string[]): Map<string, string> {
    if (!this.db || keys.length === 0) return new Map();
    const placeholders = keys.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT key, collectionName as name FROM collections WHERE key IN (${placeholders})
    `).all(...keys) as any[];
    return new Map(rows.map((r: any) => [r.key, r.name]));
  }

  /** Get library info (name, type) for a given item key */
  getLibraryForItem(itemKey: string): { libraryID: number; type: string; name: string } | null {
    if (!this.db) return null;
    const row = this.db.prepare(`
      SELECT l.libraryID, l.type, COALESCE(g.name, 'My Library') as name
      FROM items i
      JOIN libraries l ON i.libraryID = l.libraryID
      LEFT JOIN groups g ON l.libraryID = g.libraryID
      WHERE i.key = ?
    `).get(itemKey) as any;
    return row || null;
  }

  private getAttachments(parentItemID: number): ZoteroAttachment[] {
    const rows = this.db!.prepare(`
      SELECT i.key, ia.contentType, ia.path, ia.linkMode
      FROM items i
      JOIN itemAttachments ia ON i.itemID = ia.itemID
      JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
      WHERE ia.parentItemID = ?
        AND it.typeName = 'attachment'
    `).all(parentItemID) as any[];

    return rows.map(r => ({
      key: r.key,
      contentType: r.contentType || '',
      path: r.path || undefined,
      linkMode: r.linkMode,
    }));
  }
}
