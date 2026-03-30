import { create } from 'zustand';
import { useSourcesStore } from './sourcesStore';
import { useChatStore } from './chatStore';

interface WorkspaceMetadata {
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
}

interface WorkspaceState {
  isLoaded: boolean;
  current: WorkspaceMetadata | null;
  recentWorkspaces: WorkspaceMetadata[];
  isLoading: boolean;
  error: string | null;

  loadRecent: () => Promise<void>;
  removeRecent: (dirPath: string) => Promise<void>;
  create: (dirPath: string, name: string, language?: string) => Promise<void>;
  load: (dirPath: string) => Promise<void>;
  close: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  isLoaded: false,
  current: null,
  recentWorkspaces: [],
  isLoading: false,
  error: null,

  loadRecent: async () => {
    try {
      const result = await window.electron.workspace.getRecent();
      if (result.success) {
        set({ recentWorkspaces: result.data || [] });
      }
    } catch (error) {
      console.error('Failed to load recent workspaces:', error);
    }
  },

  removeRecent: async (dirPath: string) => {
    try {
      await window.electron.workspace.removeRecent(dirPath);
      set(state => ({
        recentWorkspaces: state.recentWorkspaces.filter(ws => ws.path !== dirPath),
      }));
    } catch (error) {
      console.error('Failed to remove recent workspace:', error);
    }
  },

  create: async (dirPath: string, name: string, language?: string) => {
    set({ isLoading: true, error: null });
    try {
      // Reset all data stores before loading new workspace
      useSourcesStore.getState().reset();
      const result = await window.electron.workspace.create({ dirPath, name, language });
      if (result.success) {
        set({ current: result.data, isLoaded: true, isLoading: false });
      } else {
        set({ error: result.error, isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  load: async (dirPath: string) => {
    set({ isLoading: true, error: null });
    try {
      // Reset all data stores before loading new workspace
      useSourcesStore.getState().reset();
      const result = await window.electron.workspace.load(dirPath);
      if (result.success) {
        set({ current: result.data, isLoaded: true, isLoading: false });
      } else {
        set({ error: result.error, isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  close: async () => {
    try {
      await window.electron.workspace.close();
      set({ current: null, isLoaded: false });
    } catch (error) {
      console.error('Failed to close workspace:', error);
    }
  },
}));
