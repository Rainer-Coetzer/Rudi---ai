import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Beaker, CheckCircle, XCircle, AlertCircle, Clock, BookOpen } from 'lucide-react';
import type { ActionSummary } from '../hooks/useRudi';

interface ActivityPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  devMode: boolean;
  setDevMode: (val: boolean) => void;
  recentActions: ActionSummary[];
}

const StatusIcon = ({ tag }: { tag: ActionSummary['statusTag'] }) => {
  switch (tag) {
    case 'SAFE':       return <CheckCircle size={12} className="text-cyan-400 shrink-0" />;
    case 'CONFIRMED':  return <CheckCircle size={12} className="text-emerald-400 shrink-0" />;
    case 'BLOCKED':    return <AlertCircle size={12} className="text-orange-400 shrink-0" />;
    case 'ERROR':      return <XCircle size={12} className="text-red-400 shrink-0" />;
    case 'SUGGESTED':  return <Clock size={12} className="text-blue-400 shrink-0" />;
    default:           return <Activity size={12} className="text-white/40 shrink-0" />;
  }
};

export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  isOpen, onToggle, devMode, setDevMode, recentActions
}) => {
  // Only show tool execution results and error/blocked events — no system noise
  const visibleActions = recentActions.filter(a =>
    a.statusTag !== 'SUGGESTED' || a.description.includes('Tool:') || a.description.includes('[')
  );

  return (
    <div className="relative h-full pointer-events-auto flex z-20">
      {/* Toggle Tab */}
      <div className="absolute -left-10 top-1/2 -translate-y-1/2">
        <button
          onClick={onToggle}
          className="w-10 h-16 bg-white/10 backdrop-blur border border-white/20 border-r-0 rounded-l-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition"
        >
          <Activity size={16} className={isOpen ? 'text-cyan-400' : ''} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            className="overflow-hidden h-full border-l border-white/10 bg-black/85 backdrop-blur-xl flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.6)]"
          >
            <div className="flex flex-col h-full p-4 gap-4 w-[280px]">

              {/* Header */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-white/90 text-xs font-bold uppercase tracking-widest">
                  <Activity size={13} className="text-white/80" />
                  Actions
                </div>
                <span className="text-[10px] text-white/50">{visibleActions.length} events</span>
              </div>

              {/* Dev Mode Toggle */}
              <div className="flex items-center justify-between py-2 px-3 bg-white/10 border border-white/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <Beaker size={13} className={devMode ? 'text-purple-400' : 'text-blue-400'} />
                  <span className="text-xs font-bold text-white/90">{devMode ? 'Dev Mode' : 'Safe Mode'}</span>
                </div>
                <button
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
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-white/50">
                      <BookOpen size={28} />
                      <p className="text-xs font-medium">No actions yet</p>
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
                          <p className="text-[10px] text-white/90 leading-relaxed break-words font-mono">
                            {action.description}
                          </p>
                          <p className="text-[9px] text-white/60 mt-0.5 font-medium">
                            {new Date(action.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
