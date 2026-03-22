import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { existsSync } from 'fs';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupFilesystemHandlers() {
  ipcMain.handle('dialog:open-file', async (_event, options: any) => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return errorResponse('No focused window');
      const result = await dialog.showOpenDialog(win, {
        filters: options?.filters || [
          { name: 'Documents', extensions: ['pdf', 'txt', 'html', 'htm', 'md', 'docx'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile', ...(options?.multiple ? ['multiSelections' as const] : [])],
      });
      return successResponse(result.canceled ? null : result.filePaths);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('dialog:open-directory', async (_event, options?: any) => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return errorResponse('No focused window');

      const properties: any[] = ['openDirectory', 'createDirectory'];
      // On macOS, treatPackageAsDirectory allows selecting .tropy, .app-like bundles
      if (options?.treatPackageAsDirectory) {
        properties.push('treatPackageAsDirectory');
      }

      const result = await dialog.showOpenDialog(win, {
        properties,
        message: options?.message,
      });
      return successResponse(result.canceled ? null : result.filePaths[0]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('dialog:save-file', async (_event, options: any) => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return errorResponse('No focused window');
      const result = await dialog.showSaveDialog(win, options || {});
      return successResponse(result.canceled ? null : result.filePath);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('fs:exists', async (_event, filePath: string) => {
    try {
      return successResponse(existsSync(filePath));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('shell:open-path', async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
