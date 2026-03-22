/**
 * VectorStore - SQLite persistence layer for ClioBrain
 *
 * Stores documents, chunks with embeddings, vault notes, vault links,
 * entities, conversation sessions, and watched folders.
 */

import Database from 'better-sqlite3';
import type { Document, DocumentChunk, ChunkWithEmbedding, SearchResult, VectorStoreStatistics } from '../../types/document.js';

export class VectorStore {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = DELETE');
    this.db.pragma('foreign_keys = ON');
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      -- Core document storage
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        year TEXT,
        source_type TEXT NOT NULL DEFAULT 'file',
        source_ref TEXT,
        file_format TEXT,
        page_count INTEGER,
        language TEXT,
        summary TEXT,
        summary_embedding BLOB,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        file_hash TEXT,
        file_modified_at TEXT
      );

      -- Document chunks with embeddings
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        page_number INTEGER,
        chunk_index INTEGER NOT NULL,
        start_position INTEGER NOT NULL DEFAULT 0,
        end_position INTEGER NOT NULL DEFAULT 0,
        section_title TEXT,
        section_type TEXT,
        embedding BLOB,
        content_hash TEXT,
        source_type TEXT NOT NULL DEFAULT 'document',
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      -- Obsidian vault notes
      CREATE TABLE IF NOT EXISTS vault_notes (
        id TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        frontmatter_json TEXT,
        tags_json TEXT,
        wikilinks_json TEXT,
        file_hash TEXT,
        file_mtime INTEGER,
        indexed_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Vault wikilinks (for backlinks graph)
      CREATE TABLE IF NOT EXISTS vault_links (
        source_note_id TEXT NOT NULL,
        target_relative_path TEXT NOT NULL,
        target_note_id TEXT,
        display_text TEXT,
        FOREIGN KEY (source_note_id) REFERENCES vault_notes(id) ON DELETE CASCADE
      );

      -- Named entities
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        aliases_json TEXT,
        created_at TEXT NOT NULL
      );

      -- Entity mentions in chunks
      CREATE TABLE IF NOT EXISTS entity_mentions (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        context TEXT,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
      );

      -- Conversation sessions
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT
      );

      -- Conversation messages
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sources_json TEXT,
        tool_calls_json TEXT,
        rag_explanation_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES conversation_sessions(id) ON DELETE CASCADE
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON chunks(source_type);
      CREATE INDEX IF NOT EXISTS idx_vault_notes_path ON vault_notes(relative_path);
      CREATE INDEX IF NOT EXISTS idx_vault_links_source ON vault_links(source_note_id);
      CREATE INDEX IF NOT EXISTS idx_vault_links_target ON vault_links(target_relative_path);
      CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity ON entity_mentions(entity_id);
      CREATE INDEX IF NOT EXISTS idx_entity_mentions_chunk ON entity_mentions(chunk_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON conversation_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);
      CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_normalized ON entities(normalized_name);
    `);
  }

  // ── Document CRUD ──────────────────────────────────────────────

  addDocument(doc: Document): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents
        (id, file_path, title, author, year, source_type, source_ref, file_format,
         page_count, language, summary, metadata_json, created_at, indexed_at, file_hash, file_modified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      doc.id, doc.filePath, doc.title, doc.author || null, doc.year || null,
      doc.sourceType, doc.sourceRef || null, doc.fileFormat,
      doc.pageCount || null, doc.language || null, doc.summary || null,
      JSON.stringify(doc.metadata || {}),
      doc.createdAt, doc.indexedAt, doc.fileHash || null, doc.fileModifiedAt || null
    );
  }

  deleteDocument(id: string): void {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  }

  getDocument(id: string): Document | null {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToDocument(row);
  }

  getAllDocuments(): Document[] {
    const rows = this.db.prepare('SELECT * FROM documents ORDER BY indexed_at DESC').all() as any[];
    return rows.map(r => this.rowToDocument(r));
  }

  getDocumentByHash(fileHash: string): Document | null {
    const row = this.db.prepare('SELECT * FROM documents WHERE file_hash = ?').get(fileHash) as any;
    if (!row) return null;
    return this.rowToDocument(row);
  }

  // ── Chunk CRUD ─────────────────────────────────────────────────

  addChunks(chunks: ChunkWithEmbedding[], sourceType: string = 'document'): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks
        (id, document_id, content, page_number, chunk_index, start_position, end_position,
         section_title, section_type, embedding, content_hash, source_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: ChunkWithEmbedding[]) => {
      for (const item of items) {
        const embeddingBuffer = Buffer.from(item.embedding.buffer, item.embedding.byteOffset, item.embedding.byteLength);
        stmt.run(
          item.chunk.id, item.chunk.documentId, item.chunk.content,
          item.chunk.pageNumber || null, item.chunk.chunkIndex,
          item.chunk.startPosition, item.chunk.endPosition,
          item.chunk.sectionTitle || null, item.chunk.sectionType || null,
          embeddingBuffer, null, sourceType
        );
      }
    });

    insertMany(chunks);
  }

  getChunksForDocument(documentId: string): DocumentChunk[] {
    const rows = this.db.prepare(
      'SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index'
    ).all(documentId) as any[];
    return rows.map(r => this.rowToChunk(r));
  }

  deleteChunksForDocument(documentId: string): void {
    this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
  }

  // ── Embedding retrieval ────────────────────────────────────────

  getAllChunksWithEmbeddings(sourceTypeFilter?: string[]): ChunkWithEmbedding[] {
    let query = 'SELECT c.*, d.title as doc_title FROM chunks c LEFT JOIN documents d ON c.document_id = d.id WHERE c.embedding IS NOT NULL';
    const params: any[] = [];

    if (sourceTypeFilter && sourceTypeFilter.length > 0) {
      const placeholders = sourceTypeFilter.map(() => '?').join(',');
      query += ` AND c.source_type IN (${placeholders})`;
      params.push(...sourceTypeFilter);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows
      .map(r => {
        const embedding = this.bufferToFloat32Array(r.embedding);
        if (!embedding) return null;
        return { chunk: this.rowToChunk(r), embedding };
      })
      .filter((x): x is ChunkWithEmbedding => x !== null);
  }

  getEmbeddingDimension(): number | null {
    const row = this.db.prepare(
      'SELECT embedding FROM chunks WHERE embedding IS NOT NULL LIMIT 1'
    ).get() as any;
    if (!row?.embedding) return null;
    const arr = this.bufferToFloat32Array(row.embedding);
    return arr ? arr.length : null;
  }

  // ── Brute-force cosine search (fallback when HNSW unavailable) ─

  searchBruteForce(queryEmbedding: Float32Array, limit: number = 10, documentIds?: string[]): SearchResult[] {
    let query = `
      SELECT c.*, d.* FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.embedding IS NOT NULL
    `;
    const params: any[] = [];

    if (documentIds && documentIds.length > 0) {
      const placeholders = documentIds.map(() => '?').join(',');
      query += ` AND c.document_id IN (${placeholders})`;
      params.push(...documentIds);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    const results: SearchResult[] = [];

    for (const row of rows) {
      const embedding = this.bufferToFloat32Array(row.embedding);
      if (!embedding) continue;
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      results.push({
        chunk: this.rowToChunk(row),
        document: this.rowToDocument(row),
        similarity,
        sourceType: row.source_type === 'obsidian-note' ? 'note' : 'document',
      });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  // ── Vault Notes ────────────────────────────────────────────────

  addVaultNote(note: {
    id: string;
    relativePath: string;
    title: string;
    frontmatter: Record<string, unknown>;
    tags: string[];
    wikilinks: any[];
    fileHash: string;
    fileMtime: number;
  }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO vault_notes
        (id, relative_path, title, frontmatter_json, tags_json, wikilinks_json,
         file_hash, file_mtime, indexed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      note.id, note.relativePath, note.title,
      JSON.stringify(note.frontmatter), JSON.stringify(note.tags),
      JSON.stringify(note.wikilinks),
      note.fileHash, note.fileMtime,
      new Date().toISOString(), new Date().toISOString()
    );
  }

  getVaultNote(relativePath: string): any | null {
    return this.db.prepare('SELECT * FROM vault_notes WHERE relative_path = ?').get(relativePath);
  }

  getVaultNoteByHash(fileHash: string): any | null {
    return this.db.prepare('SELECT * FROM vault_notes WHERE file_hash = ?').get(fileHash);
  }

  deleteVaultNote(id: string): void {
    this.db.prepare('DELETE FROM vault_notes WHERE id = ?').run(id);
    // Chunks with this document_id will cascade
  }

  addVaultLinks(noteId: string, links: Array<{ target: string; displayText?: string }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO vault_links (source_note_id, target_relative_path, display_text)
      VALUES (?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: any[]) => {
      for (const link of items) {
        stmt.run(noteId, link.target, link.displayText || null);
      }
    });
    // Clear old links first
    this.db.prepare('DELETE FROM vault_links WHERE source_note_id = ?').run(noteId);
    insertMany(links);
  }

  // ── Sessions ───────────────────────────────────────────────────

  createSession(id: string, title?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO conversation_sessions (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, title || null, now, now);
  }

  addMessage(msg: { id: string; sessionId: string; role: string; content: string; sources?: any; toolCalls?: any; ragExplanation?: any }): void {
    this.db.prepare(`
      INSERT INTO conversation_messages
        (id, session_id, role, content, sources_json, tool_calls_json, rag_explanation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id, msg.sessionId, msg.role, msg.content,
      msg.sources ? JSON.stringify(msg.sources) : null,
      msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
      msg.ragExplanation ? JSON.stringify(msg.ragExplanation) : null,
      new Date().toISOString()
    );
  }

  getSessions(): any[] {
    return this.db.prepare(
      'SELECT * FROM conversation_sessions ORDER BY updated_at DESC'
    ).all();
  }

  getSessionMessages(sessionId: string): any[] {
    return this.db.prepare(
      'SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY created_at ASC'
    ).all(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.db.prepare('DELETE FROM conversation_sessions WHERE id = ?').run(sessionId);
  }

  // ── Statistics ─────────────────────────────────────────────────

  getStatistics(): VectorStoreStatistics {
    const docCount = (this.db.prepare('SELECT COUNT(*) as c FROM documents').get() as any).c;
    const chunkCount = (this.db.prepare('SELECT COUNT(*) as c FROM chunks').get() as any).c;
    const embCount = (this.db.prepare('SELECT COUNT(*) as c FROM chunks WHERE embedding IS NOT NULL').get() as any).c;
    const noteCount = (this.db.prepare('SELECT COUNT(*) as c FROM vault_notes').get() as any).c;
    const entityCount = (this.db.prepare('SELECT COUNT(*) as c FROM entities').get() as any).c;

    return {
      documentCount: docCount,
      chunkCount: chunkCount,
      embeddingCount: embCount,
      noteCount: noteCount,
      entityCount: entityCount,
      databasePath: this.dbPath,
    };
  }

  // ── Purge ──────────────────────────────────────────────────────

  purgeAll(): void {
    this.db.exec(`
      DELETE FROM conversation_messages;
      DELETE FROM conversation_sessions;
      DELETE FROM entity_mentions;
      DELETE FROM entities;
      DELETE FROM vault_links;
      DELETE FROM vault_notes;
      DELETE FROM chunks;
      DELETE FROM documents;
    `);
  }

  close(): void {
    this.db.close();
  }

  // ── Helpers ────────────────────────────────────────────────────

  private rowToDocument(row: any): Document {
    return {
      id: row.id,
      filePath: row.file_path,
      title: row.title,
      author: row.author || undefined,
      year: row.year || undefined,
      sourceType: row.source_type,
      sourceRef: row.source_ref || undefined,
      fileFormat: row.file_format,
      pageCount: row.page_count || undefined,
      language: row.language || undefined,
      summary: row.summary || undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
      createdAt: row.created_at,
      indexedAt: row.indexed_at,
      fileHash: row.file_hash || undefined,
      fileModifiedAt: row.file_modified_at || undefined,
    };
  }

  private rowToChunk(row: any): DocumentChunk {
    return {
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      pageNumber: row.page_number || undefined,
      chunkIndex: row.chunk_index,
      startPosition: row.start_position,
      endPosition: row.end_position,
      sectionTitle: row.section_title || undefined,
      sectionType: row.section_type || undefined,
    };
  }

  private bufferToFloat32Array(buffer: Buffer | null): Float32Array | null {
    if (!buffer || buffer.length === 0) return null;
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}
