import { create } from 'zustand';

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface NotesState {
  notes: Note[];
  selectedNoteId: string | null;
  isLoading: boolean;
  error: string | null;

  loadNotes: () => Promise<void>;
  selectNote: (id: string | null) => void;
  createNote: (title: string, content?: string) => Promise<void>;
  updateNote: (id: string, data: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  selectedNoteId: null,
  isLoading: false,
  error: null,

  loadNotes: async () => {
    set({ isLoading: true });
    try {
      const result = await window.electron.notes.getAll();
      if (result.success) {
        set({ notes: result.data || [], isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  selectNote: (id) => set({ selectedNoteId: id }),

  createNote: async (title: string, content?: string) => {
    try {
      const result = await window.electron.notes.create({ title, content: content || '' });
      if (result.success && result.data) {
        set(state => ({ notes: [result.data, ...state.notes] }));
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },

  updateNote: async (id: string, data: Partial<Note>) => {
    try {
      await window.electron.notes.update(id, data);
      set(state => ({
        notes: state.notes.map(n => n.id === id ? { ...n, ...data, updatedAt: new Date().toISOString() } : n),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  deleteNote: async (id: string) => {
    try {
      await window.electron.notes.delete(id);
      set(state => ({
        notes: state.notes.filter(n => n.id !== id),
        selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));
