import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock } from 'lucide-react';
import type { PendingTool } from '../hooks/useRudi';

interface ConfirmationModalProps {
  pendingTool: PendingTool | null;
  onConfirm: (approve: boolean) => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ pendingTool, onConfirm }) => {
  const [timeLeft, setTimeLeft] = useState(10);
  
  useEffect(() => {
    if (!pendingTool) {
      setTimeLeft(10);
      return;
    }
    
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((pendingTool.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        onConfirm(false); // Auto-decline
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [pendingTool, onConfirm]);

  if (!pendingTool) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="max-w-sm w-full bg-[#050b14] border border-red-500/30 rounded-2xl shadow-[0_0_40px_rgba(239,68,68,0.15)] p-6 flex flex-col gap-4 text-center items-center overflow-hidden relative"
      >
        {/* Progress Bar Background */}
        <div aria-hidden className="absolute top-0 left-0 h-1 bg-red-500 transition-all duration-1000 ease-linear" style={{ width: `${(timeLeft / 10) * 100}%` }} />

        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
          <AlertTriangle size={24} aria-hidden />
        </div>
        
        <div>
          <h3 id="confirm-title" className="text-lg font-bold text-white mb-2">Allow this action?</h3>
          <p id="confirm-desc" className="text-sm text-white/80 mb-2">
            Rudi wants to run a command that can change your system. Check it before allowing.
          </p>
          <div className="text-xs text-red-200 font-mono bg-red-900/30 p-2 rounded border border-red-500/40 break-all select-text text-left">
            {pendingTool.tool.name} {JSON.stringify(pendingTool.tool.params)}
          </div>
        </div>

        <div className="flex items-center gap-2 text-white/70 text-xs font-semibold mt-2" aria-live="off">
          <Clock size={14} aria-hidden /> Cancels automatically in {timeLeft}s
        </div>

        <div className="flex items-center gap-3 w-full mt-2">
          <button
            type="button"
            autoFocus
            onClick={() => onConfirm(false)}
            className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 text-white/90 text-sm font-medium transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="flex-1 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-100 text-sm font-medium transition shadow-[0_0_15px_rgba(239,68,68,0.3)]"
          >
            Allow
          </button>
        </div>
      </motion.div>
    </div>
  );
};
