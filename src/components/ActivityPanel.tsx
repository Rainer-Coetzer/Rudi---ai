import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Beaker, CheckCircle, XCircle, AlertCircle, Clock, BookOpen, X } from 'lucide-react';
import type { ActionSummary } from '../hooks/useRudi';

interface ActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  devMode: boolean;
  setDevMode: (val: boolean) => void;
  recentActions: ActionSummary[];
}

const StatusIcon = ({ tag }: { tag: ActionSummary['statusTag'] }) => {
  switch (tag) {
    case 'SAFE':       return <CheckCircle size={14} className="text-cyan-400 shrink-0 mt-px" />;
    case 'CONFIRMED':  return <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-px" />;
    case 'BLOCKED':    return <AlertCircle size={14} className="text-orange-400 shrink-0 mt-px" />;
    case 'ERROR':      return <XCircle size={14} className="text-red-400 shrink-0 mt-px" />;
    case 'SUGGESTED':  return <Clock size={14} className="text-blue-400 shrink-0 mt-px" />;
    default:           return <Activity size={14} className="text-white/60 shrink-0 mt-px" />;
  }
};

export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  isOpen, onClose, devMode, setDevMode, recentActions
}) => {
  // Only show tool execution results and error/blocked events — no system noise
  const visibleActions = recentActions.filter(a =>
    a.statusTag !== 'SUGGESTED' || a.description.includes('Tool:') || a.description.includes('[')
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.section
          aria-label="Activity log"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
          className="absolute right-0 top-0 z-40 h-full w-[320px] max-w-full border-l border-white/10 bg-black/95 backdrop-blur-xl flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.6)]"
        >
          <div className="flex flex-col h-full p-4 gap-4">

            {/* Header */}
            <div className="flex items-center justify-between pt-1">
              <h2 className="flex items-center gap-2 text-white text-xs font-bold uppercase tracking-widest display-font">
                <Activity size={14} className="text-cyan-300" aria-hidden />
                Activity
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/70">{visibleActions.length} events</span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close activity log"
                  title="Close (Esc)"
                  className="p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Dev Mode Toggle */}
            <div className="flex items-center justify-between py-2 px-3 bg-white/10 border border-white/20 rounded-xl">
              <div className="flex items-center gap-2">
                <Beaker size={14} className={devMode ? 'text-purple-400' : 'text-blue-400'} aria-hidden />
                <span id="dev-mode-label" className="text-xs font-bold text-white">Developer details</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={devMode}
                aria-labelledby="dev-mode-label"
                title="Show raw tool parameters in chat"
                onClick={() => setDevMode(!devMode)}
                className={`w-9 h-[18px] rounded-full relative transition-colors ${devMode ? 'bg-purple-500' : 'bg-white/20'}`}
              >
                <div className={`w-3 h-3 bg-white rounded-full absolute top-[3px] transition-all ${devMode ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            {/* Action feed */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
              <AnimatePresence initial={false}>
                {visibleActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-white/70">
                    <BookOpen size={28} aria-hidden />
                    <p className="text-sm font-medium">No actions yet</p>
                  </div>
                ) : (
                  [...visibleActions].reverse().map(action => (
                    <motion.div
                      key={action.id}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 p-2.5 bg-white/10 border border-white/15 rounded-lg hover:bg-white/20 transition"
                    >
                      <StatusIcon tag={action.statusTag} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white leading-relaxed break-words font-mono select-text">
                          {action.description}
                        </p>
                        <p className="text-xs text-white/70 mt-0.5">
                          {new Date(action.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
};
