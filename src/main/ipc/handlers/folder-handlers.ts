import { ipcMain } from 'electron';
import { folderWatcher } from '../../../../backend/integrations/folders/FolderWatcher.js';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

let watcherInitialized = false;

// Ingestion queue to prevent memory exhaustion
const ingestionQueue: string[] = [];
let isProcessingQueue = false;
let processTimeout: ReturnType<typeof setTimeout> | null = null;
const MAX_QUEUE_SIZE = 200;
const BATCH_SAVE_INTERVAL = 10; // Save HNSW every N files

async function processQueue() {
  if (isProcessingQueue || ingestionQueue.length === 0) return;
  isProcessingQueue = true;

  let processed = 0;
  while (ingestionQueue.length > 0) {
    const filePath = ingestionQueue.shift()!;
    try {
      await documentService.ingestFile(filePath, {
        sourceType: 'folder',
      });
      processed++;
      // Batch-save HNSW instead of every file
      if (processed % BATCH_SAVE_INTERVAL === 0 && documentService.hnsw) {
        documentService.hnsw.save();
      }
    } catch {
      // Duplicates or errors — skip silently
    }
  }

  // Final save
  if (processed > 0 && documentService.hnsw) {
    documentService.hnsw.save();
    console.log(`[FolderWatcher] Queue processed: ${processed} files`);
  }

  isProcessingQueue = false;
}

function ensureWatcherCallbacks() {
  if (watcherInitialized) return;
  watcherInitialized = true;

  folderWatcher.onEvent((event) => {
    if (!documentService.isInitialized) return;
    if (event.type !== 'added' && event.type !== 'changed') return;

    // Add to queue instead of immediate ingestion
    if (ingestionQueue.length < MAX_QUEUE_SIZE) {
      ingestionQueue.push(event.filePath);
      // Debounce queue processing (wait 2s for more events)
      if (processTimeout) clearTimeout(processTimeout);
      processTimeout = setTimeout(() => {
        processTimeout = null;
        processQueue();
      }, 2000);
    }
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
