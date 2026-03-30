import { ipcMain, BrowserWindow } from 'electron';
import { ZoteroLocalDB } from '../../../../backend/integrations/zotero/ZoteroLocalDB.js';
import { documentService } from '../../services/document-service.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupZoteroHandlers() {
  ipcMain.handle('zotero:test-connection', async (_event, options: { dataDirectory: string }) => {
    try {
      const zotero = new ZoteroLocalDB(options.dataDirectory);
      zotero.open();
      const libraries = zotero.listLibraries();
      zotero.close();
      return successResponse({ connected: true, libraries });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('zotero:list-libraries', async (_event, dataDirectory: string) => {
    try {
      const zotero = new ZoteroLocalDB(dataDirectory);
      zotero.open();
      const libraries = zotero.listLibraries();
      zotero.close();
      return successResponse(libraries);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('zotero:list-collections', async (_event, options: { dataDirectory: string; libraryID?: number }) => {
    try {
      const zotero = new ZoteroLocalDB(options.dataDirectory);
      zotero.open();
      const collections = zotero.listCollections(options.libraryID);
      zotero.close();
      return successResponse(collections);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('zotero:sync', async (_event, options: { dataDirectory: string; libraryID?: number; collectionKey?: string }) => {
    try {
      if (!documentService.isInitialized) return errorResponse('No workspace loaded');

      const zotero = new ZoteroLocalDB(options.dataDirectory);
      zotero.open();

      const items = zotero.getItems({
        collectionKey: options.collectionKey,
        libraryID: options.libraryID,
      });

      // Pre-fetch collection names for all items' collection keys
      const allCollectionKeys = new Set<string>();
      for (const item of items) {
        for (const key of item.collectionKeys) allCollectionKeys.add(key);
      }
      const collectionNames = zotero.getCollectionNames(Array.from(allCollectionKeys));

      const win = BrowserWindow.getAllWindows()[0];
      let synced = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const pdfPath = zotero.getPDFPath(item);

        win?.webContents.send('zotero:sync-progress', {
          current: i + 1,
          total: items.length,
          title: item.title,
        });

        if (pdfPath) {
          // Resolve collection names and library info for this item
          const itemCollections = item.collectionKeys.map(k => collectionNames.get(k) || k);
          const libraryInfo = zotero.getLibraryForItem(item.key);

          try {
            await documentService.ingestFile(pdfPath, {
              sourceType: 'zotero',
              sourceRef: item.key,
              metadata: {
                creators: item.creators,
                tags: item.tags,
                collections: itemCollections,
                collectionKeys: item.collectionKeys,
                libraryName: libraryInfo?.name,
                libraryType: libraryInfo?.type,
                itemType: item.itemType,
                abstractNote: item.abstractNote,
                date: item.date,
                DOI: item.fields?.DOI,
                url: item.fields?.url,
              },
            });
            synced++;
          } catch (e) {
            // Skip duplicates and errors
            console.error(`[Zotero] Skipped "${item.title}":`, e instanceof Error ? e.message : e);
          }
        }
      }

      zotero.close();
      return successResponse({ synced, total: items.length });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('zotero:check-updates', async (_event, options: { dataDirectory: string; libraryID?: number }) => {
    try {
      const zotero = new ZoteroLocalDB(options.dataDirectory);
      zotero.open();
      const items = zotero.getItems({ libraryID: options.libraryID });
      zotero.close();
      return successResponse({ itemCount: items.length, hasUpdates: items.length > 0 });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
