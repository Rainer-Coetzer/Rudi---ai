import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, RefreshCw, Trash2, ChevronRight, FileText } from 'lucide-react';

interface MeetingPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MeetingPanel: React.FC<MeetingPanelProps> = ({ isOpen, onClose }) => {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);

  const fetchNotes = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.executeTool('list_meeting_notes', {});
      if (res.success) {
        setNotes(JSON.parse(res.result));
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const deleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.executeTool('delete_meeting_note', { id });
      if (res.success) {
        if (selectedNote?.id === id) setSelectedNote(null);
        fetchNotes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotes();
      setSelectedNote(null);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 400 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 400 }}
          className="absolute right-0 top-0 w-[450px] h-full bg-black/90 backdrop-blur-3xl border-l border-white/10 p-6 flex flex-col pointer-events-auto z-50 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-white/50 flex items-center gap-2">
              <MessageSquare size={14} className="text-indigo-400" /> Meeting Notes
            </h2>
            <div className="flex gap-3">
              <button onClick={fetchNotes} className="p-1.5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all">
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
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mb-2 uppercase font-bold tracking-wider transition-all"
                >
                  <ChevronRight size={12} className="rotate-180" /> Back to Notes
                </button>
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                  <h3 className="text-lg font-bold text-white mb-2">{selectedNote.title}</h3>
                  <div className="text-[10px] text-white/30 uppercase tracking-widest mb-6">
                    {new Date(selectedNote.date).toLocaleString()}
                  </div>
                  <div className="text-sm text-white/70 leading-relaxed font-mono whitespace-pre-wrap">
                    {selectedNote.content}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col gap-3">
                {notes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-white/20">
                    <FileText size={40} strokeWidth={1} className="mb-4" />
                    <p className="text-xs italic tracking-wide">Take a note, Sir. I am ready.</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <motion.div
                      key={note.id}
                      whileHover={{ scale: 1.01, x: 2 }}
                      onClick={() => setSelectedNote(note)}
                      className="p-4 rounded-xl bg-white/5 border border-white/8 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all cursor-pointer group relative"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors truncate pr-8">
                          {note.title}
                        </h3>
                        <button 
                          onClick={(e) => deleteNote(note.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all absolute top-3 right-3"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="text-[10px] text-white/30 mb-3 font-mono">
                        {new Date(note.date).toLocaleDateString()} at {new Date(note.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <p className="text-[11px] text-white/40 line-clamp-2 leading-relaxed">
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
