// Console filter must be imported first to filter logs in production
import '../shared/console-filter.js';

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { setupIPCHandlers } from './ipc/index.js';
import { configManager } from './services/config-manager.js';
import { setupApplicationMenu } from './menu.js';
import { loadMenuTranslations, setLanguage } from './i18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow() {
  const preloadPath = path.join(__dirname, '../../preload/index.js');
  console.log('[ClioBrain] __dirname:', __dirname);
  console.log('[ClioBrain] Preload path:', preloadPath);
  console.log('[ClioBrain] Preload exists:', existsSync(preloadPath));

  const iconPath = path.join(__dirname, '../../../build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  const debugEnabled = process.env.CLIOBRAIN_DEBUG === '1' || process.env.DEBUG === '1';

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../../dist/renderer/index.html'));
    if (debugEnabled) {
      mainWindow.webContents.openDevTools();
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupApplicationMenu(mainWindow);
}

app.whenReady().then(async () => {
  console.log('[ClioBrain] Initializing configManager...');
  await configManager.init();
  console.log('[ClioBrain] configManager initialized');

  loadMenuTranslations();

  const savedLanguage = configManager.get('language');
  if (savedLanguage && ['fr', 'en', 'de'].includes(savedLanguage)) {
    setLanguage(savedLanguage);
  }

  ipcMain.on('language-changed', (_event, language: 'fr' | 'en' | 'de') => {
    setLanguage(language);
    if (mainWindow) {
      setupApplicationMenu(mainWindow);
    }
  });

  setupIPCHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
