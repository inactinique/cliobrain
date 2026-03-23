import { contextBridge, ipcRenderer } from 'electron';

// Security: Whitelist of IPC channels allowed through the generic ipcRenderer bridge
const ALLOWED_RECEIVE_CHANNELS: string[] = [
  // Menu shortcuts
  'menu:new-workspace', 'menu:open-workspace', 'menu:open-settings',
  'menu:new-session', 'menu:about',
  // Chat streaming
  'chat:stream', 'chat:stream-done', 'chat:stream-error',
  // Indexing progress
  'document:indexing-progress',
  // Vault indexing progress
  'vault:indexing-progress',
  // Zotero/Tropy sync progress
  'zotero:sync-progress', 'tropy:sync-progress', 'tropy:file-changed',
  // Language sync
  'language-changed',
];

const ALLOWED_SEND_CHANNELS: string[] = [
  'language-changed',
];

const api = {
  // Workspace management
  workspace: {
    create: (data: { dirPath: string; name: string; language?: string }) =>
      ipcRenderer.invoke('workspace:create', data),
    load: (dirPath: string) => ipcRenderer.invoke('workspace:load', dirPath),
    close: () => ipcRenderer.invoke('workspace:close'),
    getRecent: () => ipcRenderer.invoke('workspace:get-recent'),
    getConfig: () => ipcRenderer.invoke('workspace:get-config'),
    updateConfig: (updates: any) => ipcRenderer.invoke('workspace:update-config', updates),
  },

  // Documents
  document: {
    ingest: (filePath: string) => ipcRenderer.invoke('document:ingest', filePath),
    ingestFolder: (dirPath: string) => ipcRenderer.invoke('document:ingest-folder', dirPath),
    delete: (documentId: string) => ipcRenderer.invoke('document:delete', documentId),
    getAll: () => ipcRenderer.invoke('document:get-all'),
    getDocument: (documentId: string) => ipcRenderer.invoke('document:get-document', documentId),
    getStatistics: () => ipcRenderer.invoke('document:get-statistics'),
    purge: () => ipcRenderer.invoke('document:purge'),
    rebuildIndex: () => ipcRenderer.invoke('document:rebuild-index'),
    onIndexingProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('document:indexing-progress', listener);
      return () => ipcRenderer.removeListener('document:indexing-progress', listener);
    },
  },

  // Search
  search: {
    query: (query: string, options?: any) => ipcRenderer.invoke('search:query', query, options),
    entities: (query: string, type?: string) => ipcRenderer.invoke('search:entities', query, type),
    similar: (documentId: string, topK?: number) => ipcRenderer.invoke('search:similar', documentId, topK),
  },

  // Chat
  chat: {
    send: (message: string, options?: any) => ipcRenderer.invoke('chat:send', message, options),
    cancel: () => ipcRenderer.invoke('chat:cancel'),
    newSession: (title?: string) => ipcRenderer.invoke('chat:new-session', title),
    loadSession: (sessionId: string) => ipcRenderer.invoke('chat:load-session', sessionId),
    listSessions: () => ipcRenderer.invoke('chat:list-sessions'),
    deleteSession: (sessionId: string) => ipcRenderer.invoke('chat:delete-session', sessionId),
    onStream: (callback: (chunk: string) => void) => {
      const listener = (_event: any, chunk: string) => callback(chunk);
      ipcRenderer.on('chat:stream', listener);
      return () => ipcRenderer.removeListener('chat:stream', listener);
    },
    onStreamDone: (callback: (result: any) => void) => {
      const listener = (_event: any, result: any) => callback(result);
      ipcRenderer.on('chat:stream-done', listener);
      return () => ipcRenderer.removeListener('chat:stream-done', listener);
    },
    onStreamError: (callback: (error: any) => void) => {
      const listener = (_event: any, error: any) => callback(error);
      ipcRenderer.on('chat:stream-error', listener);
      return () => ipcRenderer.removeListener('chat:stream-error', listener);
    },
  },

  // Zotero
  zotero: {
    testConnection: (options: { dataDirectory: string; libraryID?: number }) =>
      ipcRenderer.invoke('zotero:test-connection', options),
    listLibraries: (dataDirectory: string) =>
      ipcRenderer.invoke('zotero:list-libraries', dataDirectory),
    listCollections: (options: { dataDirectory: string; libraryID?: number }) =>
      ipcRenderer.invoke('zotero:list-collections', options),
    sync: (options: { dataDirectory: string; libraryID?: number; collectionKey?: string }) =>
      ipcRenderer.invoke('zotero:sync', options),
    checkUpdates: (options: { dataDirectory: string; libraryID?: number }) =>
      ipcRenderer.invoke('zotero:check-updates', options),
    onSyncProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('zotero:sync-progress', listener);
      return () => ipcRenderer.removeListener('zotero:sync-progress', listener);
    },
  },

  // Tropy
  tropy: {
    openProject: (tpyPath: string) => ipcRenderer.invoke('tropy:open-project', tpyPath),
    sync: (options: { performOCR: boolean; ocrLanguage: string; forceReindex?: boolean }) =>
      ipcRenderer.invoke('tropy:sync', options),
    getAllSources: () => ipcRenderer.invoke('tropy:get-all-sources'),
    getStatistics: () => ipcRenderer.invoke('tropy:get-statistics'),
    onSyncProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('tropy:sync-progress', listener);
      return () => ipcRenderer.removeListener('tropy:sync-progress', listener);
    },
  },

  // Watched folders
  folder: {
    addWatch: (folderPath: string, options?: { recursive?: boolean; maxDepth?: number }) =>
      ipcRenderer.invoke('folder:add-watch', folderPath, options),
    removeWatch: (folderPath: string) => ipcRenderer.invoke('folder:remove-watch', folderPath),
    listWatched: () => ipcRenderer.invoke('folder:list-watched'),
    rescan: (folderPath: string) => ipcRenderer.invoke('folder:rescan', folderPath),
  },

  // Obsidian Vault
  vault: {
    connect: (vaultPath: string) => ipcRenderer.invoke('vault:connect', vaultPath),
    disconnect: () => ipcRenderer.invoke('vault:disconnect'),
    getTree: () => ipcRenderer.invoke('vault:get-tree'),
    getNotes: (options?: { tag?: string; search?: string }) =>
      ipcRenderer.invoke('vault:get-notes', options),
    getNoteDetail: (relativePath: string) =>
      ipcRenderer.invoke('vault:get-note-detail', relativePath),
    search: (query: string) => ipcRenderer.invoke('vault:search', query),
    getTags: () => ipcRenderer.invoke('vault:get-tags'),
    getBacklinks: (relativePath: string) =>
      ipcRenderer.invoke('vault:get-backlinks', relativePath),
    index: (options?: { force?: boolean }) =>
      ipcRenderer.invoke('vault:index', options),
    exportMessage: (options: any) =>
      ipcRenderer.invoke('vault:export-message', options),
    exportConversation: (messages: any[], options?: any) =>
      ipcRenderer.invoke('vault:export-conversation', messages, options),
    openInObsidian: (relativePath: string) =>
      ipcRenderer.invoke('vault:open-in-obsidian', relativePath),
    onIndexingProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('vault:indexing-progress', listener);
      return () => ipcRenderer.removeListener('vault:indexing-progress', listener);
    },
  },

  // Knowledge graph
  graph: {
    getData: (options?: any) => ipcRenderer.invoke('graph:get-data', options),
    getStatistics: () => ipcRenderer.invoke('graph:get-statistics'),
    getEntityDetails: (entityId: string) => ipcRenderer.invoke('graph:get-entity-details', entityId),
    getCommunities: () => ipcRenderer.invoke('graph:get-communities'),
  },

  // History
  history: {
    getSessions: () => ipcRenderer.invoke('history:get-sessions'),
    getEvents: (sessionId: string) => ipcRenderer.invoke('history:get-events', sessionId),
    getChatHistory: (sessionId: string) => ipcRenderer.invoke('history:get-chat-history', sessionId),
    getStatistics: () => ipcRenderer.invoke('history:get-statistics'),
    searchEvents: (filters: any) => ipcRenderer.invoke('history:search-events', filters),
  },

  // Configuration
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('config:set', key, value),
    getAll: () => ipcRenderer.invoke('config:get-all'),
  },

  // Ollama
  ollama: {
    listModels: () => ipcRenderer.invoke('ollama:list-models'),
    checkAvailability: () => ipcRenderer.invoke('ollama:check-availability'),
  },

  // Dialogs
  dialog: {
    openFile: (options: any) => ipcRenderer.invoke('dialog:open-file', options),
    openDirectory: (options?: { treatPackageAsDirectory?: boolean; message?: string }) =>
      ipcRenderer.invoke('dialog:open-directory', options),
    saveFile: (options: any) => ipcRenderer.invoke('dialog:save-file', options),
  },

  // File system
  fs: {
    exists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    openPath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  },

  // MCP server control
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:get-status'),
    getLogs: (limit?: number) => ipcRenderer.invoke('mcp:get-logs', limit),
    getClaudeDesktopConfig: () => ipcRenderer.invoke('mcp:get-claude-desktop-config'),
    getClaudeCodeConfig: () => ipcRenderer.invoke('mcp:get-claude-code-config'),
  },

  // Generic IPC (filtered by whitelist)
  ipcRenderer: {
    on: (channel: string, listener: (...args: any[]) => void) => {
      if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
        ipcRenderer.on(channel, listener);
      } else {
        console.warn(`[Preload] Blocked ipcRenderer.on() for unauthorized channel: ${channel}`);
      }
    },
    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
        ipcRenderer.removeListener(channel, listener);
      }
    },
    send: (channel: string, ...args: any[]) => {
      if (ALLOWED_SEND_CHANNELS.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      } else {
        console.warn(`[Preload] Blocked ipcRenderer.send() for unauthorized channel: ${channel}`);
      }
    },
  },
};

contextBridge.exposeInMainWorld('electron', api);

export type ElectronAPI = typeof api;
