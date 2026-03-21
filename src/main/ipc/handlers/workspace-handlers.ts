import { ipcMain, dialog, BrowserWindow } from 'electron';
import { workspaceManager } from '../../services/workspace-manager.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupWorkspaceHandlers() {
  ipcMain.handle('workspace:create', async (_event, data: { dirPath: string; name: string; language?: string }) => {
    try {
      const metadata = await workspaceManager.create(data.dirPath, data.name, data.language as any || 'fr');
      return successResponse(metadata);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('workspace:load', async (_event, dirPath: string) => {
    try {
      const metadata = await workspaceManager.load(dirPath);
      return successResponse(metadata);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('workspace:close', async () => {
    try {
      workspaceManager.close();
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('workspace:get-recent', async () => {
    try {
      return successResponse(workspaceManager.getRecent());
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
}
