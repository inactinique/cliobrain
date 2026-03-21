import { create } from 'zustand';

interface GraphNode {
  id: string;
  label: string;
  type: 'document' | 'entity' | 'note';
  entityType?: string;
  community?: number;
  size?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  isLoading: boolean;
  error: string | null;
  selectedNodeId: string | null;

  loadGraph: (options?: any) => Promise<void>;
  selectNode: (id: string | null) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  isLoading: false,
  error: null,
  selectedNodeId: null,

  loadGraph: async (options?: any) => {
    set({ isLoading: true });
    try {
      const result = await window.electron.graph.getData(options);
      if (result.success && result.data) {
        set({
          nodes: result.data.nodes || [],
          edges: result.data.edges || [],
          isLoading: false,
        });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  selectNode: (id) => set({ selectedNodeId: id }),
}));
