import { useTranslation } from 'react-i18next';
import { X, Brain, Github, ExternalLink } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[400px] p-6 text-center"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>

        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-2xl mb-4">
          <Brain className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>

        <h2 className="text-lg font-bold">ClioBrain</h2>
        <p className="text-xs text-gray-500 mt-1">Version 0.1.0</p>

        <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
          Assistant de brainstorming pour historiens.
          <br />
          Chattez avec vos documents, notes Obsidian et sources de recherche.
        </p>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
          <p>Frédéric Clavert</p>
          <p>University of Luxembourg</p>
        </div>

        <div className="mt-3 text-xs text-gray-400">
          Electron + React + TypeScript
          <br />
          Ollama + HNSW + BM25
        </div>
      </div>
    </div>
  );
}
