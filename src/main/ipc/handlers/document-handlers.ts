import { ipcMain } from 'electron';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupDocumentHandlers() {
  ipcMain.handle('document:ingest', async (_event, filePath: string) => {
    try {
      // TODO: Wire to full document ingestion pipeline (Phase 4)
      console.log('[Documents] Ingest:', filePath);
      return successResponse({ id: 'todo', filePath });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:ingest-folder', async (_event, dirPath: string) => {
    try {
      console.log('[Documents] Ingest folder:', dirPath);
      return successResponse({ count: 0 });
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
      }
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:rebuild-index', async () => {
    try {
      // TODO: Rebuild HNSW + BM25 from DB
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
