import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Calendar, X, RefreshCw, FileText } from 'lucide-react';
import { useToolResult } from '../hooks/useToolResult';
import type { CalendarEvent, Task } from '../types/data';

interface ProductivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProductivityPanel: React.FC<ProductivityPanelProps> = ({ isOpen, onClose }) => {
  const taskQuery = useToolResult<Task[]>('list_tasks', isOpen);
  // The tool is `upcoming_events`; the old `get_upcoming_events` name was never whitelisted.
  const eventQuery = useToolResult<CalendarEvent[]>('upcoming_events', isOpen);
  const tasks = taskQuery.data ?? [];
  const events = eventQuery.data ?? [];
  const loading = taskQuery.loading || eventQuery.loading;
  const fetchData = () => {
    taskQuery.reload();
    eventQuery.reload();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          role="region"
          aria-label="Tasks and calendar"
          className="absolute right-0 top-0 w-[320px] max-w-full h-full bg-black/95 backdrop-blur-2xl border-l border-white/10 p-4 flex flex-col z-40 shadow-[-20px_0_40px_rgba(0,0,0,0.6)]"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-widest font-bold text-white flex items-center gap-2 display-font">
              <CheckSquare size={14} className="text-amber-300" aria-hidden /> Tasks &amp; Calendar
            </h2>
            <div className="flex gap-2">
              <button type="button" onClick={fetchData} aria-label="Refresh tasks and events" title="Refresh" className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={onClose} aria-label="Close tasks and calendar" title="Close (Esc)" className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            {/* Upcoming Events */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-cyan-300 font-bold mb-3 flex items-center gap-1.5">
                <Calendar size={14} aria-hidden /> Upcoming Events
              </h3>
              {events.length === 0 ? (
                <p className="text-sm text-white/70">{window.desktopAPI ? 'No upcoming events.' : 'Available in the desktop app.'}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {events.map((evt, i) => (
                    <div key={i} className="p-2.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition">
                      <div className="text-sm text-white font-medium">{evt.title}</div>
                      <div className="text-xs text-white/70 mt-1">
                        {new Date(evt.start).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Tasks */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-amber-300 font-bold mb-3 flex items-center gap-1.5">
                <FileText size={14} aria-hidden /> Pending Tasks
              </h3>
              {tasks.filter(t => t.status === 'pending').length === 0 ? (
                <p className="text-sm text-white/70">{window.desktopAPI ? 'All caught up!' : 'Available in the desktop app.'}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {tasks.filter(t => t.status === 'pending').map((tsk, i) => (
                    <div key={i} className="p-2.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition flex gap-2">
                      <div className="mt-0.5 min-w-[12px]">
                        <div aria-hidden className="w-3 h-3 rounded-sm border border-white/50" />
                      </div>
                      <div>
                        <div className="text-sm text-white">{tsk.text}</div>
                        {tsk.priority !== 'medium' && (
                          <div className={`text-xs font-semibold uppercase px-1.5 rounded mt-1 inline-block ${tsk.priority === 'high' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'}`}>
                            {tsk.priority}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
