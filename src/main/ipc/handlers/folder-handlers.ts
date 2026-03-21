import { ipcMain } from 'electron';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupFolderHandlers() {
  ipcMain.handle('folder:add-watch', async (_event, folderPath: string, options?: any) => {
    try {
      // TODO: Wire to folder-watcher-service
      console.log('[Folder] Add watch:', folderPath);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('folder:remove-watch', async (_event, folderPath: string) => {
    try {
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('folder:list-watched', async () => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('folder:rescan', async (_event, folderPath: string) => {
    try {
      return successResponse({ scanned: 0 });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
