import { create } from 'zustand';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Array<{
    documentId: string;
    documentTitle: string;
    author?: string;
    year?: string;
    pageNumber?: number;
    chunkContent: string;
    similarity: number;
    sourceType: 'document' | 'note';
  }>;
  createdAt: string;
}

interface ChatSession {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;

  loadSessions: () => Promise<void>;
  newSession: (title?: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  sendMessage: (content: string, options?: any) => Promise<void>;
  cancelStream: () => Promise<void>;
  appendStreamChunk: (chunk: string) => void;
  finishStream: (result: any) => void;
  setStreamError: (error: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  error: null,

  loadSessions: async () => {
    try {
      const result = await window.electron.chat.listSessions();
      if (result.success) {
        set({ sessions: result.data || [] });
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  },

  newSession: async (title?: string) => {
    try {
      const result = await window.electron.chat.newSession(title);
      if (result.success && result.data) {
        const session = result.data;
        set(state => ({
          sessions: [session, ...state.sessions],
          currentSessionId: session.id,
          messages: [],
          streamingContent: '',
        }));
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  },

  loadSession: async (sessionId: string) => {
    try {
      const result = await window.electron.chat.loadSession(sessionId);
      if (result.success) {
        set({
          currentSessionId: sessionId,
          messages: result.data?.messages || [],
          streamingContent: '',
        });
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await window.electron.chat.deleteSession(sessionId);
      set(state => ({
        sessions: state.sessions.filter(s => s.id !== sessionId),
        currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
        messages: state.currentSessionId === sessionId ? [] : state.messages,
      }));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  },

  sendMessage: async (content: string, options?: any) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };

    set(state => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
      error: null,
    }));

    try {
      await window.electron.chat.send(content, {
        ...options,
        sessionId: get().currentSessionId,
      });
    } catch (error) {
      set({ isStreaming: false, error: String(error) });
    }
  },

  cancelStream: async () => {
    try {
      await window.electron.chat.cancel();
      set({ isStreaming: false });
    } catch (error) {
      console.error('Failed to cancel stream:', error);
    }
  },

  appendStreamChunk: (chunk: string) => {
    set(state => ({
      streamingContent: state.streamingContent + chunk,
    }));
  },

  finishStream: (result: any) => {
    const state = get();
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: state.streamingContent || result?.content || '',
      sources: result?.sources,
      createdAt: new Date().toISOString(),
    };

    set(state => ({
      messages: [...state.messages, assistantMessage],
      isStreaming: false,
      streamingContent: '',
    }));
  },

  setStreamError: (error: string) => {
    set({ isStreaming: false, error, streamingContent: '' });
  },
}));
