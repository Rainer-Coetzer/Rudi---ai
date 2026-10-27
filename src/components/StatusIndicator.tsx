import React from 'react';
import { ShieldCheck, Server } from 'lucide-react';
import { RudiState } from '../hooks/useRudi';

interface StatusIndicatorProps {
  state: RudiState;
  safeMode: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ state, safeMode }) => {
  return (
    <div className="flex flex-col items-center gap-2">
      {/* Top Badges */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
          safeMode ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
        }`}>
          <ShieldCheck size={12} aria-hidden /> {safeMode ? 'Safe Mode' : 'Dev Mode'}
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
          <Server size={12} aria-hidden /> System Online
        </div>
      </div>

      <div className="flex flex-col items-center">
        <h1 className="text-2xl tracking-[0.3em] font-light text-cyan-400 drop-shadow-[0_0_10px_rgba(0,255,255,0.5)] leading-none uppercase">
          Rudi Agent
        </h1>
        <span className={`text-xs uppercase tracking-[0.2em] font-bold ${
          state === RudiState.Listening ? 'text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.8)]' :
          state === RudiState.Thinking ? 'text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]' :
          state === RudiState.Speaking ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]' :
          state === RudiState.Executing ? 'text-purple-400 drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]' :
          'text-white/70'
        }`}>
          {state}
        </span>
      </div>
      
      <div className="text-xs text-white/60">
        System powered by Rudi Engine
      </div>
    </div>
  );
};
