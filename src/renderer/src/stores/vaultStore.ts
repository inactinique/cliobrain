import { create } from 'zustand';

interface VaultNoteSummary {
  id: string;
  relativePath: string;
  title: string;
  tags: string[];
  wikilinksCount: number;
  backlinksCount: number;
  modifiedAt: string;
  snippet?: string;
}

interface VaultNoteDetail extends VaultNoteSummary {
  frontmatter: Record<string, unknown>;
  wikilinks: Array<{ target: string; displayText?: string; heading?: string }>;
  backlinks: Array<{ relativePath: string; title: string }>;
  body: string;
}

interface VaultTreeNode {
  name: string;
  type: 'folder' | 'file';
  relativePath: string;
  children?: VaultTreeNode[];
}

interface TagEntry {
  tag: string;
  count: number;
}

interface VaultState {
  // Connection
  vaultPath: string | null;
  vaultName: string | null;
  isConnected: boolean;
  isIndexing: boolean;
  indexingProgress: { current: number; total: number; currentFile?: string } | null;
  fileCount: number;

  // Content
  notes: VaultNoteSummary[];
  tree: VaultTreeNode[];
  tags: TagEntry[];
  selectedNotePath: string | null;
  selectedNoteDetail: VaultNoteDetail | null;

  // Search
  searchQuery: string;
  searchResults: VaultNoteSummary[];

  // View
  viewMode: 'tree' | 'list' | 'tags';
  error: string | null;

  // Actions
  connect: (vaultPath: string) => Promise<void>;
  disconnect: () => Promise<void>;
  loadTree: () => Promise<void>;
  loadNotes: (options?: { tag?: string; search?: string }) => Promise<void>;
  loadTags: () => Promise<void>;
  selectNote: (relativePath: string | null) => Promise<void>;
  search: (query: string) => Promise<void>;
  openInObsidian: (relativePath: string) => Promise<void>;
  reindex: (options?: { force?: boolean }) => Promise<void>;
  exportMessage: (options: any) => Promise<string | null>;
  exportConversation: (messages: any[], options?: any) => Promise<string | null>;
  setViewMode: (mode: 'tree' | 'list' | 'tags') => void;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vaultPath: null,
  vaultName: null,
  isConnected: false,
  isIndexing: false,
  indexingProgress: null,
  fileCount: 0,
  notes: [],
  tree: [],
  tags: [],
  selectedNotePath: null,
  selectedNoteDetail: null,
  searchQuery: '',
  searchResults: [],
  viewMode: 'tree',
  error: null,

  connect: async (vaultPath: string) => {
    set({ error: null });
    try {
      const result = await window.electron.vault.connect(vaultPath);
      if (result.success) {
        set({
          vaultPath,
          vaultName: result.data.vaultName,
          isConnected: true,
          fileCount: result.data.fileCount,
        });
        // Load tree and tags after connecting
        await get().loadTree();
        await get().loadTags();
      } else {
        set({ error: result.error });
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },

  disconnect: async () => {
    try {
      await window.electron.vault.disconnect();
      set({
        vaultPath: null,
        vaultName: null,
        isConnected: false,
        fileCount: 0,
        notes: [],
        tree: [],
        tags: [],
        selectedNotePath: null,
        selectedNoteDetail: null,
        searchQuery: '',
        searchResults: [],
      });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  loadTree: async () => {
    try {
      const result = await window.electron.vault.getTree();
      if (result.success) {
        set({ tree: result.data || [] });
      }
    } catch (error) {
      console.error('Failed to load vault tree:', error);
    }
  },

  loadNotes: async (options) => {
    try {
      const result = await window.electron.vault.getNotes(options);
      if (result.success) {
        set({ notes: result.data || [] });
      }
    } catch (error) {
      console.error('Failed to load vault notes:', error);
    }
  },

  loadTags: async () => {
    try {
      const result = await window.electron.vault.getTags();
      if (result.success) {
        set({ tags: result.data || [] });
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  },

  selectNote: async (relativePath) => {
    if (!relativePath) {
      set({ selectedNotePath: null, selectedNoteDetail: null });
      return;
    }

    set({ selectedNotePath: relativePath });
    try {
      const result = await window.electron.vault.getNoteDetail(relativePath);
      if (result.success) {
        set({ selectedNoteDetail: result.data });
      }
    } catch (error) {
      console.error('Failed to load note detail:', error);
    }
  },

  search: async (query: string) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const result = await window.electron.vault.search(query);
      if (result.success) {
        set({ searchResults: result.data || [] });
      }
    } catch (error) {
      console.error('Failed to search vault:', error);
    }
  },

  openInObsidian: async (relativePath: string) => {
    try {
      await window.electron.vault.openInObsidian(relativePath);
    } catch (error) {
      console.error('Failed to open in Obsidian:', error);
    }
  },

  reindex: async (options) => {
    set({ isIndexing: true });
    try {
      await window.electron.vault.index(options);
      set({ isIndexing: false });
      // Reload data after indexing
      await get().loadTree();
      await get().loadTags();
    } catch (error) {
      set({ isIndexing: false, error: String(error) });
    }
  },

  exportMessage: async (options) => {
    try {
      const result = await window.electron.vault.exportMessage(options);
      if (result.success) {
        // Refresh tree to show the new file
        await get().loadTree();
        return result.data.relativePath;
      }
      return null;
    } catch {
      return null;
    }
  },

  exportConversation: async (messages, options) => {
    try {
      const result = await window.electron.vault.exportConversation(messages, options);
      if (result.success) {
        await get().loadTree();
        return result.data.relativePath;
      }
      return null;
    } catch {
      return null;
    }
  },

  setViewMode: (mode) => set({ viewMode: mode }),
}));
