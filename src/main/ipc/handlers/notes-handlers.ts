import { ipcMain } from 'electron';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupNotesHandlers() {
  ipcMain.handle('notes:create', async (_event, data: any) => {
    try {
      // TODO: Wire to notes-service
      console.log('[Notes] Create:', data.title);
      return successResponse({
        id: crypto.randomUUID(),
        title: data.title,
        content: data.content || '',
        tags: data.tags || [],
        linkedDocumentIds: [],
        linkedEntityIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('notes:update', async (_event, noteId: string, data: any) => {
    try {
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('notes:delete', async (_event, noteId: string) => {
    try {
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('notes:get-all', async () => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('notes:get', async (_event, noteId: string) => {
    try {
      return successResponse(null);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('notes:search', async (_event, query: string) => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
