import { ipcMain } from 'electron';
import { folderWatcher } from '../../../../backend/integrations/folders/FolderWatcher.js';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

let watcherInitialized = false;

function ensureWatcherCallbacks() {
  if (watcherInitialized) return;
  watcherInitialized = true;

  folderWatcher.onEvent(async (event) => {
    if (!documentService.isInitialized) return;

    if (event.type === 'added' || event.type === 'changed') {
      try {
        await documentService.ingestFile(event.filePath, {
          sourceType: 'folder',
          sourceRef: event.folderPath,
        });
        console.log(`[FolderWatcher] Ingested: ${event.filePath}`);
      } catch (e) {
        // Duplicates are expected
      }
    }
    // TODO: Handle 'deleted' events (remove from index)
  });
}

export function setupFolderHandlers() {
  ipcMain.handle('folder:add-watch', async (_event, folderPath: string, options?: any) => {
    try {
      ensureWatcherCallbacks();
      await folderWatcher.addFolder(folderPath, options);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('folder:remove-watch', async (_event, folderPath: string) => {
    try {
      await folderWatcher.removeFolder(folderPath);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('folder:list-watched', async () => {
    try {
      return successResponse(folderWatcher.getWatchedFolders());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('folder:rescan', async (_event, folderPath: string) => {
    try {
      if (!documentService.isInitialized) return errorResponse('No workspace loaded');
      const result = await documentService.ingestFolder(folderPath);
      return successResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
