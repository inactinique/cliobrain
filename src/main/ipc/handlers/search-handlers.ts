import { ipcMain } from 'electron';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupSearchHandlers() {
  ipcMain.handle('search:query', async (_event, query: string, options?: any) => {
    try {
      if (!documentService.isInitialized) return successResponse([]);
      const results = await documentService.search(query, options);
      return successResponse(results);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('search:entities', async (_event, query: string, type?: string) => {
    try {
      // TODO: Entity search via knowledge graph
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('search:similar', async (_event, documentId: string, topK?: number) => {
    try {
      // TODO: Document similarity search
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
