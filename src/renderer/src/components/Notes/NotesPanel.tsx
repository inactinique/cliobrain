import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotesStore } from '../../stores/notesStore';
import { StickyNote, Plus, Trash2 } from 'lucide-react';

export function NotesPanel() {
  const { t } = useTranslation();
  const { notes, selectedNoteId, loadNotes, selectNote, createNote, updateNote, deleteNote } = useNotesStore();
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const selectedNote = notes.find(n => n.id === selectedNoteId);

  useEffect(() => {
    if (selectedNote) {
      setEditContent(selectedNote.content);
    }
  }, [selectedNote]);

  const handleCreate = async () => {
    await createNote(t('notes.new'));
  };

  const handleSave = async () => {
    if (selectedNoteId && editContent !== selectedNote?.content) {
      await updateNote(selectedNoteId, { content: editContent });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-500">{notes.length} notes</span>
        <button
          onClick={handleCreate}
          className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
          title={t('notes.new')}
        >
          <Plus size={16} />
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm p-4">
          <StickyNote size={32} className="mb-2 opacity-50" />
          <p>{t('notes.noNotes')}</p>
        </div>
      ) : selectedNote ? (
        /* Note editor */
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-750">
            <input
              value={selectedNote.title}
              onChange={(e) => updateNote(selectedNoteId!, { title: e.target.value })}
              className="text-xs font-medium bg-transparent border-none focus:outline-none flex-1"
            />
            <div className="flex gap-1">
              <button
                onClick={() => selectNote(null)}
                className="text-xs text-gray-400 hover:text-gray-600 px-2"
              >
                {t('common.close')}
              </button>
              <button
                onClick={() => deleteNote(selectedNoteId!)}
                className="p-1 text-red-400 hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onBlur={handleSave}
            placeholder={t('notes.placeholder')}
            className="flex-1 p-3 text-sm bg-transparent resize-none focus:outline-none"
          />
        </div>
      ) : (
        /* Note list */
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => selectNote(note.id)}
              className="w-full text-left px-2 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="text-xs font-medium truncate">{note.title}</div>
              <div className="text-xs text-gray-400 truncate mt-0.5">
                {note.content.slice(0, 80) || t('notes.placeholder')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
