import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitCommit, X, RefreshCw } from 'lucide-react';
import { useToolResult } from '../hooks/useToolResult';
import type { ChangelogEntry } from '../types/data';

interface ChangelogPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangelogPanel: React.FC<ChangelogPanelProps> = ({ isOpen, onClose }) => {
  const { data, loading, reload: fetchLogs } = useToolResult<ChangelogEntry[]>('self_changelog', isOpen);
  const logs = data ?? [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          className="absolute right-0 top-0 w-[400px] h-full bg-black/90 backdrop-blur-3xl border-l border-white/10 p-5 flex flex-col pointer-events-auto z-50"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-widest font-bold text-cyan-400 flex items-center gap-2">
              <GitCommit size={14} /> Self-Improvement Log
            </h2>
            <div className="flex gap-2">
              <button onClick={fetchLogs} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-2">
            {logs.length === 0 ? (
              <p className="text-xs text-white/30 italic">No autonomous improvements logged yet.</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="p-3 bg-cyan-900/10 border border-cyan-500/20 rounded font-mono text-[10px]">
                  <div className="text-cyan-500/50 mb-1">{new Date(log.timestamp).toLocaleString()}</div>
                  <div className="text-cyan-100">{log.message}</div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
