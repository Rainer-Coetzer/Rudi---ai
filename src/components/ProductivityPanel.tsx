import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Calendar, X, RefreshCw, FileText } from 'lucide-react';
import { safeParse } from '../utils/json';

interface ProductivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProductivityPanel: React.FC<ProductivityPanelProps> = ({ isOpen, onClose }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!window.desktopAPI) return;
    setLoading(true);
    try {
      const taskRes = await window.desktopAPI.executeTool('list_tasks', {});
      if (taskRes.success) setTasks(safeParse<any[]>(taskRes.result) ?? []);

      const evtRes = await window.desktopAPI.executeTool('get_upcoming_events', {});
      if (evtRes.success && evtRes.result !== 'No upcoming events.') {
        setEvents(safeParse<any[]>(evtRes.result) ?? []);
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          className="absolute right-0 top-0 w-[300px] h-full bg-black/80 backdrop-blur-2xl border-l border-white/10 p-4 flex flex-col pointer-events-auto z-50"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-widest font-bold text-white/50 flex items-center gap-2">
              <CheckSquare size={14} /> Productivity
            </h2>
            <div className="flex gap-2">
              <button onClick={fetchData} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            {/* Upcoming Events */}
            <div>
              <h3 className="text-[10px] uppercase text-cyan-400 font-bold mb-3 flex items-center gap-1.5">
                <Calendar size={12} /> Upcoming Events
              </h3>
              {events.length === 0 ? (
                <p className="text-xs text-white/30 italic">No upcoming events.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {events.map((evt, i) => (
                    <div key={i} className="p-2.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition">
                      <div className="text-xs text-white/80 font-medium">{evt.title}</div>
                      <div className="text-[10px] text-white/40 mt-1">
                        {new Date(evt.start).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Tasks */}
            <div>
              <h3 className="text-[10px] uppercase text-amber-400 font-bold mb-3 flex items-center gap-1.5">
                <FileText size={12} /> Pending Tasks
              </h3>
              {tasks.filter(t => t.status === 'pending').length === 0 ? (
                <p className="text-xs text-white/30 italic">All caught up!</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {tasks.filter(t => t.status === 'pending').map((tsk, i) => (
                    <div key={i} className="p-2.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition flex gap-2">
                      <div className="mt-0.5 min-w-[12px]">
                        <div className="w-3 h-3 rounded-sm border border-white/30" />
                      </div>
                      <div>
                        <div className="text-xs text-white/80">{tsk.text}</div>
                        {tsk.priority !== 'medium' && (
                          <div className={`text-[9px] uppercase px-1 rounded mt-1 inline-block ${tsk.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
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
