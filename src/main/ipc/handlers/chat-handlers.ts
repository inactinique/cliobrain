import { ipcMain } from 'electron';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupChatHandlers() {
  ipcMain.handle('chat:send', async (_event, message: string, options?: any) => {
    try {
      // TODO: Wire to chat-service when implemented
      console.log('[Chat] Message:', message);
      return successResponse({ messageId: 'todo', content: '' });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('chat:cancel', async () => {
    try {
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('chat:new-session', async (_event, title?: string) => {
    try {
      return successResponse({
        id: crypto.randomUUID(),
        title: title || 'Nouvelle conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('chat:load-session', async (_event, sessionId: string) => {
    try {
      return successResponse({ sessionId, messages: [] });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('chat:list-sessions', async () => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('chat:delete-session', async (_event, sessionId: string) => {
    try {
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
