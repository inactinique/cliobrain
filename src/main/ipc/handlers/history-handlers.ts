import { ipcMain } from 'electron';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupHistoryHandlers() {
  ipcMain.handle('history:get-sessions', async () => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('history:get-events', async (_event, sessionId: string) => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('history:get-chat-history', async (_event, sessionId: string) => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('history:get-statistics', async () => {
    try {
      return successResponse({ totalSessions: 0, totalMessages: 0, totalEvents: 0 });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('history:search-events', async (_event, filters: any) => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
