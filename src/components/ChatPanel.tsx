import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage } from '../hooks/useRudi';
import { ToolCard } from './ToolCard';
import { Bot, User } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessage[];
  devMode?: boolean;
}

const ChatMessageItem = React.memo<{ msg: ChatMessage; devMode?: boolean }>(({ msg, devMode }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex flex-col w-full ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
    >
      <div className={`flex items-center gap-1.5 mb-1 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${msg.sender === 'rudi' ? 'bg-cyan-500/30 text-cyan-400' : 'bg-white/15 text-white/80'}`}>
          {msg.sender === 'rudi' ? <Bot size={9} /> : <User size={9} />}
        </div>
        <span className={`text-[9px] uppercase tracking-widest font-bold ${msg.sender === 'user' ? 'text-white/60' : 'text-cyan-400/80'}`}>
          {msg.sender === 'user' ? 'DIRECTOR' : 'RUDI'}
        </span>
        {msg.timestamp && (
          <span className="text-[8px] text-white/40 ml-1">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {msg.text !== undefined && (
        <motion.div
          layout
          className={`text-xs py-2.5 px-3.5 max-w-[90%] leading-relaxed tracking-wide shadow-lg whitespace-pre-wrap break-words ${
            msg.sender === 'user'
              ? 'glass-panel rounded-2xl rounded-tr-sm text-white/90'
              : 'bg-gradient-to-br from-cyan-950/80 to-blue-950/60 text-white border border-cyan-500/30 rounded-2xl rounded-tl-sm shadow-[0_0_15px_rgba(34,211,238,0.1)]'
          }`}
        >
          {msg.text}
          {msg.sender === 'rudi' && msg.text === '' && !msg.toolExecution && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 0.9 }}
              className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-1 align-middle rounded-sm"
            />
          )}
        </motion.div>
      )}

      {msg.toolExecution && (
        <div className={`mt-1.5 w-full ${msg.sender === 'user' ? 'flex justify-end' : ''}`}>
          <ToolCard tool={msg.toolExecution} devMode={devMode} />
        </div>
      )}
    </motion.div>
  );
}, (prev, next) => {
  return prev.msg.text === next.msg.text && 
         prev.msg.toolExecution?.status === next.msg.toolExecution?.status &&
         prev.msg.id === next.msg.id;
});

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, devMode }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="w-[300px] h-full glass-panel border-y-0 border-r-0 pointer-events-auto flex flex-col z-10 shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-[9px] uppercase tracking-[0.2em] text-white/90 font-bold display-font">Conversation</h2>
        <span className="text-[9px] text-white/50">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-white/50 text-xs text-center italic mt-16 leading-relaxed"
            >
              Protocols active.<br />
              <span className="text-[10px] text-white/40">Awaiting your first command.</span>
            </motion.div>
          )}

          {messages.map((msg) => (
            <ChatMessageItem key={msg.id} msg={msg} devMode={devMode} />
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
