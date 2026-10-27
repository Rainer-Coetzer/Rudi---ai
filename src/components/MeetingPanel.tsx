import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, RefreshCw, Trash2, ChevronRight, FileText } from 'lucide-react';
import { useToolResult } from '../hooks/useToolResult';
import type { MeetingNote } from '../types/data';

interface MeetingPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MeetingPanel: React.FC<MeetingPanelProps> = ({ isOpen, onClose }) => {
  const { data, loading, reload: fetchNotes } = useToolResult<MeetingNote[]>('list_meeting_notes', isOpen);
  const notes = data ?? [];
  const [selectedNote, setSelectedNote] = useState<MeetingNote | null>(null);

  // Clear the selection each time the panel opens (adjusting state during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setSelectedNote(null);
  }

  const deleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.desktopAPI) return;
    try {
      const res = await window.desktopAPI.executeTool('delete_meeting_note', { id });
      if (res.success) {
        if (selectedNote?.id === id) setSelectedNote(null);
        fetchNotes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 400 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 400 }}
          role="region"
          aria-label="Meeting notes"
          className="absolute right-0 top-0 w-[420px] max-w-full h-full bg-black/95 backdrop-blur-3xl border-l border-white/10 p-5 flex flex-col z-40 shadow-[-20px_0_40px_rgba(0,0,0,0.6)]"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-white flex items-center gap-2 display-font">
              <MessageSquare size={14} className="text-indigo-300" aria-hidden /> Meeting Notes
            </h2>
            <div className="flex gap-2">
              <button type="button" onClick={fetchNotes} aria-label="Refresh meeting notes" title="Refresh" className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-all">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={onClose} aria-label="Close meeting notes" title="Close (Esc)" className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
            {selectedNote ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4"
              >
                <button 
                  onClick={() => setSelectedNote(null)}
                  type="button"
                  className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1 mb-2 uppercase font-bold tracking-wider transition-all"
                >
                  <ChevronRight size={14} className="rotate-180" aria-hidden /> Back to Notes
                </button>
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                  <h3 className="text-lg font-bold text-white mb-2">{selectedNote.title}</h3>
                  <div className="text-xs text-white/70 uppercase tracking-widest mb-6">
                    {new Date(selectedNote.date).toLocaleString()}
                  </div>
                  <div className="text-sm text-white/90 leading-relaxed font-mono whitespace-pre-wrap select-text">
                    {selectedNote.content}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col gap-3">
                {notes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-white/70">
                    <FileText size={40} strokeWidth={1} className="mb-4" aria-hidden />
                    <p className="text-sm">{window.desktopAPI ? 'No meeting notes yet. Ask Rudi to take one.' : 'Meeting notes are available in the desktop app.'}</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <motion.div
                      key={note.id}
                      whileHover={{ x: 2 }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open note: ${note.title}`}
                      onClick={() => setSelectedNote(note)}
                      onKeyDown={e => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setSelectedNote(note);
                        }
                      }}
                      className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all cursor-pointer group relative"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors truncate pr-8">
                          {note.title}
                        </h3>
                        <button 
                          type="button"
                          onClick={(e) => deleteNote(note.id, e)}
                          aria-label={`Delete note: ${note.title}`}
                          title="Delete note"
                          className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100 p-1.5 text-white/70 hover:text-red-300 hover:bg-red-400/10 rounded-md transition-all absolute top-3 right-3"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="text-xs text-white/70 mb-3 font-mono">
                        {new Date(note.date).toLocaleDateString()} at {new Date(note.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <p className="text-xs text-white/80 line-clamp-2 leading-relaxed">
                        {note.content}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
