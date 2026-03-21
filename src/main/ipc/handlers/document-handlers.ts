import { ipcMain } from 'electron';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupDocumentHandlers() {
  ipcMain.handle('document:ingest', async (_event, filePath: string) => {
    try {
      // TODO: Wire to document-service when implemented
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
      console.log('[Documents] Delete:', documentId);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:get-all', async () => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:get-document', async (_event, documentId: string) => {
    try {
      return successResponse(null);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:get-statistics', async () => {
    try {
      return successResponse({
        documentCount: 0,
        chunkCount: 0,
        embeddingCount: 0,
        noteCount: 0,
        entityCount: 0,
        databasePath: '',
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:purge', async () => {
    try {
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('document:rebuild-index', async () => {
    try {
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
