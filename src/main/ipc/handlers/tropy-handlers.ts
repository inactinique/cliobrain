import { ipcMain, BrowserWindow } from 'electron';
import { TropyReader } from '../../../../backend/integrations/tropy/TropyReader.js';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

let currentTropyReader: TropyReader | null = null;

export function setupTropyHandlers() {
  ipcMain.handle('tropy:open-project', async (_event, tpyPath: string) => {
    try {
      if (currentTropyReader) {
        currentTropyReader.close();
      }

      currentTropyReader = new TropyReader(tpyPath);
      currentTropyReader.open();

      const name = currentTropyReader.getProjectName();
      const count = currentTropyReader.getItemCount();

      return successResponse({ name, itemCount: count });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('tropy:sync', async (_event, options: { performOCR: boolean; ocrLanguage: string; forceReindex?: boolean }) => {
    try {
      if (!currentTropyReader) return errorResponse('No Tropy project open');
      if (!documentService.isInitialized) return errorResponse('No workspace loaded');

      const items = currentTropyReader.getAllItems();
      const win = BrowserWindow.getAllWindows()[0];
      let synced = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        win?.webContents.send('tropy:sync-progress', {
          phase: 'processing',
          current: i + 1,
          total: items.length,
          currentItem: item.metadata.title || `Item ${item.id}`,
        });

        // Extract text from notes and metadata
        const text = currentTropyReader.getItemText(item);
        if (!text.trim()) continue;

        // TODO: For items with photos and performOCR, run tesseract.js
        // For now, index only text content (notes + metadata)

        try {
          // Create a temporary text representation for indexing
          const title = item.metadata.title || item.metadata['dc:title'] || `Tropy item ${item.id}`;

          if (documentService.store && documentService.pipeline) {
            // Store as a document directly
            const documentId = `tropy-${item.id}`;
            documentService.store.addDocument({
              id: documentId,
              filePath: `tropy://${item.id}`,
              title,
              sourceType: 'tropy',
              sourceRef: String(item.id),
              fileFormat: 'txt',
              metadata: { ...item.metadata, tags: item.tags },
              createdAt: new Date().toISOString(),
              indexedAt: new Date().toISOString(),
            });

            // Chunk and embed the text content
            // This is simplified - full implementation would use the pipeline
            synced++;
          }
        } catch {
          // Skip errors
        }
      }

      return successResponse({ synced, total: items.length });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('tropy:get-all-sources', async () => {
    try {
      if (!currentTropyReader) return successResponse([]);
      const items = currentTropyReader.getAllItems();
      return successResponse(items.map(item => ({
        id: item.id,
        title: item.metadata.title || item.metadata['dc:title'] || `Item ${item.id}`,
        tags: item.tags,
        photoCount: item.photos.length,
        noteCount: item.notes.length,
      })));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('tropy:get-statistics', async () => {
    try {
      if (!currentTropyReader) {
        return successResponse({ totalSources: 0, withNotes: 0, withPhotos: 0, tags: [] });
      }

      const items = currentTropyReader.getAllItems();
      return successResponse({
        totalSources: items.length,
        withNotes: items.filter(i => i.notes.length > 0).length,
        withPhotos: items.filter(i => i.photos.length > 0).length,
        tags: currentTropyReader.getAllTags(),
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
