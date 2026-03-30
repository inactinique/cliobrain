import { ipcMain } from 'electron';
import { workspaceManager } from '../../services/workspace-manager.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupWorkspaceHandlers() {
  ipcMain.handle('workspace:create', async (_event, data: { name: string; language?: string }) => {
    try {
      const metadata = await workspaceManager.create(data.name, (data.language as any) || 'fr');
      return successResponse(metadata);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('workspace:load', async (_event, wsDir: string) => {
    try {
      const metadata = await workspaceManager.load(wsDir);
      return successResponse(metadata);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('workspace:close', async () => {
    try {
      await workspaceManager.close();
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('workspace:list', async () => {
    try {
      return successResponse(workspaceManager.list());
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Keep old channel as alias for backward compat
  ipcMain.handle('workspace:get-recent', async () => {
    try {
      return successResponse(workspaceManager.list());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('workspace:get-config', async () => {
    try {
      return successResponse(workspaceManager.config);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('workspace:update-config', async (_event, updates: any) => {
    try {
      workspaceManager.updateConfig(updates);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('workspace:delete', async (_event, wsDir: string) => {
    try {
      workspaceManager.deleteWorkspace(wsDir);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Keep old channel as alias
  ipcMain.handle('workspace:remove-recent', async (_event, wsDir: string) => {
    try {
      workspaceManager.deleteWorkspace(wsDir);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
