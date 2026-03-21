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
      // TODO: Full rebuild from DB
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
