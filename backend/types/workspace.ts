/**
 * Workspace types for ClioBrain
 */

export interface WorkspaceConfig {
  name: string;
  createdAt: string;
  language: 'fr' | 'en' | 'de';
  zotero?: {
    dataDirectory: string;
    libraryID?: number;
  };
  tropy?: {
    projectPath: string;
    performOCR: boolean;
    ocrLanguage: string;
  };
  watchedFolders: Array<{
    path: string;
    recursive: boolean;
    maxDepth: number;
    enabled: boolean;
  }>;
  obsidian?: {
    vaultPath: string;
    exportSubfolder?: string;
    autoIndex?: boolean;
  };
}

export interface WorkspaceMetadata {
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
  documentCount?: number;
  vaultNoteCount?: number;
}
