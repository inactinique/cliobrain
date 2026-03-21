import { ipcMain } from 'electron';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupTropyHandlers() {
  ipcMain.handle('tropy:open-project', async (_event, tpyPath: string) => {
    try {
      // TODO: Wire to tropy-service
      console.log('[Tropy] Open project:', tpyPath);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('tropy:sync', async (_event, options: any) => {
    try {
      return successResponse({ synced: 0 });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('tropy:get-all-sources', async () => {
    try {
      return successResponse([]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('tropy:get-statistics', async () => {
    try {
      return successResponse({ totalSources: 0, withTranscription: 0, withOCR: 0 });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
