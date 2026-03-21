/**
 * Configuration manager using electron-store
 * Handles persistent app-level settings
 */

import type { AppConfig } from '../../../backend/types/config.js';
import { DEFAULT_APP_CONFIG } from '../../../backend/types/config.js';

let store: any = null;

class ConfigManager {
  private initialized = false;

  async init() {
    if (this.initialized) return;

    // electron-store is ESM-only, must be dynamically imported
    const ElectronStore = (await import('electron-store')).default;
    store = new ElectronStore({
      name: 'cliobrain-config',
      defaults: DEFAULT_APP_CONFIG,
    });

    this.initialized = true;
    console.log('[ConfigManager] Initialized with store path:', store.path);
  }

  get(key: string): any {
    if (!store) return undefined;
    return store.get(key);
  }

  set(key: string, value: any): void {
    if (!store) return;
    store.set(key, value);
  }

  getAll(): AppConfig {
    if (!store) return DEFAULT_APP_CONFIG;
    return store.store as AppConfig;
  }

  reset(): void {
    if (!store) return;
    store.clear();
  }

  getStorePath(): string {
    return store?.path || '';
  }
}

export const configManager = new ConfigManager();
