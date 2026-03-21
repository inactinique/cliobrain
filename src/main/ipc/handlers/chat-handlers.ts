/**
 * IPC handlers for chat and RAG
 */

import { ipcMain } from 'electron';
import { chatService } from '../../services/chat-service.js';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupChatHandlers() {
  ipcMain.handle('chat:send', async (_event, message: string, options?: any) => {
    try {
      // Fire and forget — response comes via streaming events
      chatService.send(message, options).catch(e =>
        console.error('[Chat] Send error:', e)
      );
      return successResponse({ started: true });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('chat:cancel', async () => {
    try {
      chatService.cancel();
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('chat:new-session', async (_event, title?: string) => {
    try {
      const id = crypto.randomUUID();
      if (documentService.store) {
        documentService.store.createSession(id, title);
      }
      return successResponse({
        id,
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
      if (!documentService.store) return successResponse({ sessionId, messages: [] });
      const messages = documentService.store.getSessionMessages(sessionId);
      return successResponse({
        sessionId,
        messages: messages.map((m: any) => ({
          id: m.id,
          sessionId: m.session_id,
          role: m.role,
          content: m.content,
          sources: m.sources_json ? JSON.parse(m.sources_json) : undefined,
          createdAt: m.created_at,
        })),
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('chat:list-sessions', async () => {
    try {
      if (!documentService.store) return successResponse([]);
      const sessions = documentService.store.getSessions();
      return successResponse(sessions.map((s: any) => ({
        id: s.id,
        title: s.title,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('chat:delete-session', async (_event, sessionId: string) => {
    try {
      if (documentService.store) {
        documentService.store.deleteSession(sessionId);
      }
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
