import { ipcMain } from 'electron';
import { configManager } from '../../services/config-manager.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupConfigHandlers() {
  ipcMain.handle('config:get', async (_event, key: string) => {
    try {
      return successResponse(configManager.get(key));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('config:set', async (_event, key: string, value: unknown) => {
    try {
      configManager.set(key, value);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('config:get-all', async () => {
    try {
      return successResponse(configManager.getAll());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('ollama:list-models', async () => {
    try {
      const config = configManager.getAll();
      const url = config.llm?.ollamaURL || 'http://127.0.0.1:11434';
      const response = await fetch(`${url}/api/tags`);
      const data = await response.json() as { models?: any[] };
      return successResponse((data.models || []).map((m: any) => m.name as string));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('ollama:check-availability', async () => {
    try {
      const config = configManager.getAll();
      const url = config.llm?.ollamaURL || 'http://127.0.0.1:11434';
      const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return successResponse(response.ok);
    } catch {
      return successResponse(false);
    }
  });
}
