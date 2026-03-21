import { ipcMain } from 'electron';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupSearchHandlers() {
  ipcMain.handle('search:query', async (_event, query: string, options?: any) => {
    try {
      // TODO: Wire to document-service hybrid search
      console.log('[Search] Query:', query);
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('search:entities', async (_event, query: string, type?: string) => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('search:similar', async (_event, documentId: string, topK?: number) => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
