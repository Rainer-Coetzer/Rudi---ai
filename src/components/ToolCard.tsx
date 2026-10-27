import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, AlertCircle, Wrench } from 'lucide-react';
import type { ToolExecution } from '../hooks/useRudi';

interface ToolCardProps {
  tool: ToolExecution;
  devMode?: boolean;
}

export const ToolCard: React.FC<ToolCardProps> = ({ tool, devMode }) => {
  const getStatusIcon = () => {
    switch (tool.status) {
      case 'pending': return <Loader2 className="animate-spin text-yellow-400" size={16} />;
      case 'running': return <Loader2 className="animate-spin text-cyan-400" size={16} />;
      case 'success': return <CheckCircle2 className="text-green-400" size={16} />;
      case 'error': return <AlertCircle className="text-red-400" size={16} />;
    }
  };

  const getStatusColor = () => {
    if (tool.status === 'blocked') return 'border-orange-500/40 bg-orange-900/20';
    switch (tool.status) {
      case 'pending': return 'border-yellow-500/30 bg-yellow-900/10';
      case 'running': return 'border-cyan-500/30 bg-cyan-900/10 shadow-[0_0_15px_rgba(34,211,238,0.2)]';
      case 'success': return 'border-green-500/30 bg-green-900/10';
      case 'error': return 'border-red-500/40 bg-red-900/20';
      default: return 'border-white/10 bg-white/5';
    }
  };

  const getLevelBadge = () => {
    switch(tool.level) {
      case 'safe': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-200 border border-blue-500/30">Safe</span>;
      case 'caution': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-200 border border-yellow-500/30">Caution</span>;
      case 'dangerous': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-200 border border-red-500/40">Dangerous</span>;
      default: return null;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative w-full overflow-hidden mt-2 p-3 rounded-lg border backdrop-blur-md transition-all duration-300 ${getStatusColor()}`}
    >
      <div className="flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-white/90 min-w-0">
            <Wrench size={14} className="text-white/70 shrink-0" aria-hidden />
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-white font-bold truncate font-mono text-xs">{tool.name}</span>
              {getLevelBadge()}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold capitalize text-white/80">
              {tool.status}
            </span>
            {getStatusIcon()}
          </div>
        </div>

        {/* Result Area */}
        {tool.result && (
          <div className={`text-xs p-2 rounded bg-black/40 border border-white/10 font-mono break-words select-text ${
            tool.status === 'error' ? 'text-red-300' : 'text-green-300'
          }`}>
            {tool.status === 'error' ? `Error: ${tool.result}` : `> ${tool.result}`}
          </div>
        )}

        {/* Dev Mode Parameters Layer */}
        {devMode && (
          <div className="text-xs text-white/80 bg-black/60 p-2 rounded font-mono border border-white/10 mt-1 overflow-x-auto whitespace-pre select-text">
            <div className="text-white/60 mb-1">Raw parameters:</div>
            {JSON.stringify(tool.params, null, 2)}
          </div>
        )}
      </div>
    </motion.div>
  );
};
