import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRudi, RudiState } from '../hooks/useRudi';

export const GhostOverlay: React.FC = () => {
  const [input, setInput] = useState('');
  const { sendMessage, state, audioLevel, isSpeaking } = useRudi();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus input when ghost mode opens
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="w-screen h-screen bg-transparent flex flex-col items-center justify-start pt-4 overflow-hidden select-none font-mono">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-[560px] bg-black/80 backdrop-blur-xl border-2 border-cyan-500/30 rounded-lg p-3 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-xs text-cyan-300 font-bold tracking-[0.15em] flex items-center gap-2">
            <span aria-hidden className="animate-pulse">●</span> RUDI_HUD_v1.0.4 // GHOST_MODE
          </div>
          <div className="text-xs text-white/60 truncate max-w-[200px]">
            ACTIVE_SESSION: {new Date().toLocaleTimeString()}
          </div>
        </div>

        {/* Console Input */}
        <div className="relative group">
          <div aria-hidden className="absolute left-2 top-1.5 text-cyan-400 text-sm">{'>'}</div>
          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Command for Rudi"
              placeholder="Enter a command…"
              className="w-full bg-cyan-950/20 border border-cyan-500/30 rounded pl-7 pr-3 py-1.5 text-cyan-100 text-sm placeholder:text-cyan-300/60 focus:outline-none focus-visible:outline-none focus:border-cyan-400/70 transition-all font-mono"
            />
          </form>
        </div>

        {/* Visualizer / Status Area */}
        <div className="mt-2 flex items-center justify-between px-1 h-4">
          <div aria-hidden className="flex gap-1">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                animate={{ 
                  height: state === RudiState.Thinking ? [2, 12, 2] : 
                          isSpeaking ? [2, 2 + audioLevel * 10, 2] : 2
                }}
                transition={{ duration: 0.2, repeat: Infinity, delay: i * 0.05 }}
                className="w-1 bg-cyan-500/40 rounded-full"
              />
            ))}
          </div>
          <div role="status" className="text-xs text-cyan-300/80 uppercase tracking-tight">
            {state === RudiState.Thinking ? 'Deciphering...' : 
             state === RudiState.Speaking ? 'Transmitting...' : 
             'System Ready'}
          </div>
        </div>
      </motion.div>

      {/* Decorative ASCII Elements */}
      <div aria-hidden className="absolute top-2 right-4 text-[6px] text-cyan-500/10 leading-[1.1] pointer-events-none">
        {`   _  _   _  _   _  _ 
  ( )/ ) ( )/ ) ( )/ )
   V  V   V  V   V  V 
   0  1   0  1   0  1 
   S  Y   S  _   H  D `}
      </div>
    </div>
  );
};
