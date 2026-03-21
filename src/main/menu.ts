import { BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';
import { getTranslation, getCurrentLanguage } from './i18n.js';

export function setupApplicationMenu(mainWindow: BrowserWindow) {
  const t = (key: string) => getTranslation(key);

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'ClioBrain',
      submenu: [
        {
          label: t('menu.about'),
          click: () => mainWindow.webContents.send('menu:about'),
        },
        { type: 'separator' },
        {
          label: t('menu.settings'),
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu:open-settings'),
        },
        { type: 'separator' },
        { role: 'quit', label: t('menu.quit') },
      ],
    },
    {
      label: t('menu.workspace'),
      submenu: [
        {
          label: t('menu.newWorkspace'),
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:new-workspace'),
        },
        {
          label: t('menu.openWorkspace'),
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu:open-workspace'),
        },
      ],
    },
    {
      label: t('menu.chat'),
      submenu: [
        {
          label: t('menu.newSession'),
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow.webContents.send('menu:new-session'),
        },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.about'),
          click: () => mainWindow.webContents.send('menu:about'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
