import { create } from 'zustand';
import { useSourcesStore } from './sourcesStore';

interface WorkspaceMetadata {
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
  documentCount?: number;
  vaultNoteCount?: number;
}

interface WorkspaceState {
  isLoaded: boolean;
  current: WorkspaceMetadata | null;
  workspaces: WorkspaceMetadata[];
  isLoading: boolean;
  error: string | null;

  loadWorkspaces: () => Promise<void>;
  create: (name: string, language?: string) => Promise<void>;
  load: (wsDir: string) => Promise<void>;
  close: () => Promise<void>;
  deleteWorkspace: (wsDir: string) => Promise<void>;

  // Backward compat aliases
  recentWorkspaces: WorkspaceMetadata[];
  loadRecent: () => Promise<void>;
  removeRecent: (wsDir: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  isLoaded: false,
  current: null,
  workspaces: [],
  isLoading: false,
  error: null,

  // Alias
  get recentWorkspaces() { return get().workspaces; },

  loadWorkspaces: async () => {
    try {
      const result = await window.electron.workspace.list();
      if (result.success) {
        set({ workspaces: result.data || [] });
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  },

  // Alias
  loadRecent: async () => {
    return get().loadWorkspaces();
  },

  create: async (name: string, language?: string) => {
    set({ isLoading: true, error: null });
    try {
      useSourcesStore.getState().reset();
      const result = await window.electron.workspace.create({ name, language });
      if (result.success) {
        set({ current: result.data, isLoaded: true, isLoading: false });
      } else {
        set({ error: result.error, isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  load: async (wsDir: string) => {
    set({ isLoading: true, error: null });
    try {
      useSourcesStore.getState().reset();
      const result = await window.electron.workspace.load(wsDir);
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

  deleteWorkspace: async (wsDir: string) => {
    try {
      await window.electron.workspace.delete(wsDir);
      set(state => ({
        workspaces: state.workspaces.filter(ws => ws.path !== wsDir),
      }));
    } catch (error) {
      console.error('Failed to delete workspace:', error);
    }
  },

  // Alias
  removeRecent: async (wsDir: string) => {
    return get().deleteWorkspace(wsDir);
  },
}));
