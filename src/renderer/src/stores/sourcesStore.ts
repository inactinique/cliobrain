import { create } from 'zustand';

interface DocumentItem {
  id: string;
  title: string;
  author?: string;
  year?: string;
  sourceType: string;
  fileFormat: string;
  pageCount?: number;
  indexedAt: string;
}

interface SourcesState {
  documents: DocumentItem[];
  isLoading: boolean;
  error: string | null;
  activeTab: 'documents' | 'zotero' | 'tropy' | 'folders';

  setActiveTab: (tab: SourcesState['activeTab']) => void;
  loadDocuments: () => Promise<void>;
  ingestDocument: (filePath: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
}

export const useSourcesStore = create<SourcesState>((set) => ({
  documents: [],
  isLoading: false,
  error: null,
  activeTab: 'documents',

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadDocuments: async () => {
    set({ isLoading: true });
    try {
      const result = await window.electron.document.getAll();
      if (result.success) {
        set({ documents: result.data || [], isLoading: false });
      } else {
        set({ error: result.error, isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  ingestDocument: async (filePath: string) => {
    try {
      await window.electron.document.ingest(filePath);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  deleteDocument: async (id: string) => {
    try {
      await window.electron.document.delete(id);
      set(state => ({
        documents: state.documents.filter(d => d.id !== id),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));
