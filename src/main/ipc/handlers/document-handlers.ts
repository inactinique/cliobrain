import { ipcMain, BrowserWindow } from 'electron';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupDocumentHandlers() {
  ipcMain.handle('document:ingest', async (_event, filePath: string) => {
    try {
      if (!documentService.isInitialized) return errorResponse('No workspace loaded');

      const win = BrowserWindow.getAllWindows()[0];
      const doc = await documentService.ingestFile(filePath, {
        onProgress: (progress) => {
          win?.webContents.send('document:indexing-progress', progress);
        },
      });
      // Save HNSW after single-file ingestion via UI
      documentService.pipeline?.saveIndex();
      return successResponse(doc);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:ingest-folder', async (_event, dirPath: string) => {
    try {
      if (!documentService.isInitialized) return errorResponse('No workspace loaded');

      const win = BrowserWindow.getAllWindows()[0];
      const result = await documentService.ingestFolder(dirPath, {
        onProgress: (progress) => {
          win?.webContents.send('document:indexing-progress', progress);
        },
      });
      return successResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:delete', async (_event, documentId: string) => {
    try {
      if (documentService.store) {
        documentService.store.deleteDocument(documentId);
      }
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:get-all', async () => {
    try {
      if (!documentService.store) return successResponse([]);
      return successResponse(documentService.store.getAllDocuments());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:get-document', async (_event, documentId: string) => {
    try {
      if (!documentService.store) return successResponse(null);
      return successResponse(documentService.store.getDocument(documentId));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:get-statistics', async () => {
    try {
      return successResponse(documentService.getStatistics() || {
        documentCount: 0, chunkCount: 0, embeddingCount: 0,
        noteCount: 0, entityCount: 0, databasePath: '',
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:purge', async () => {
    try {
      if (documentService.store) {
        documentService.store.purgeAll();
        documentService.hnsw?.clear();
        documentService.bm25?.clear();
      }
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:rebuild-index', async () => {
    try {
      if (!documentService.isInitialized || !documentService.store || !documentService.hnsw || !documentService.bm25) {
        return errorResponse('No workspace loaded');
      }

      const win = BrowserWindow.getAllWindows()[0];

      // Clear existing in-memory indexes
      documentService.hnsw.clear();
      await documentService.hnsw.initialize();
      documentService.bm25.clear();

      // Load all chunks with embeddings from SQLite
      const chunks = documentService.store.getAllChunksWithEmbeddings();

      if (chunks.length > 0) {
        // Rebuild HNSW
        documentService.hnsw.addChunks(chunks.map(c => ({
          chunk: c.chunk,
          embedding: c.embedding,
        })));

        // Rebuild BM25
        documentService.bm25.addChunks(chunks.map(c => ({ chunk: c.chunk })));

        // Save HNSW to disk
        documentService.hnsw.save();
      }

      win?.webContents.send('document:indexing-progress', {
        phase: 'complete',
        current: chunks.length,
        total: chunks.length,
      });

      console.log(`[DocumentHandlers] Rebuilt indexes with ${chunks.length} chunks`);
      return successResponse({ chunksReindexed: chunks.length });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // ── NER background processing ──

  ipcMain.handle('ner:start', async () => {
    try {
      documentService.startNER();
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('ner:stop', async () => {
    try {
      const { nerWorker } = await import('../../services/ner-worker.js');
      nerWorker.stop();
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('ner:get-progress', async () => {
    try {
      const { nerWorker } = await import('../../services/ner-worker.js');
      return successResponse(nerWorker.getProgress());
    } catch (error) {
      return errorResponse(error);
    }
  });
}
