import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage } from '../hooks/useRudi';
import { ToolCard } from './ToolCard';
import { Bot, User, Trash2 } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessage[];
  devMode?: boolean;
  onClear?: () => void;
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
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${msg.sender === 'rudi' ? 'bg-cyan-500/30 text-cyan-400' : 'bg-white/15 text-white/80'}`}>
          {msg.sender === 'rudi' ? <Bot size={12} aria-hidden /> : <User size={12} aria-hidden />}
        </div>
        <span className={`text-xs uppercase tracking-wider font-bold ${msg.sender === 'user' ? 'text-white/80' : 'text-cyan-300'}`}>
          {msg.sender === 'user' ? 'You' : 'Rudi'}
        </span>
        {msg.timestamp && (
          <span className="text-xs text-white/60 ml-1">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {msg.text !== undefined && (
        <motion.div
          layout
          className={`text-[13px] py-2.5 px-3.5 max-w-[92%] leading-relaxed shadow-lg select-text whitespace-pre-wrap break-words ${
            msg.sender === 'user'
              ? 'glass-panel rounded-2xl rounded-tr-sm text-white'
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

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, devMode, onClear }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <aside aria-label="Conversation" className="w-[280px] xl:w-[340px] h-full glass-panel border-y-0 border-r-0 flex flex-col z-10 shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-[0.15em] text-white font-bold display-font">Conversation</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/70">{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
          {onClear && messages.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear conversation"
              title="Clear conversation"
              className="p-1.5 rounded-md text-white/70 hover:text-red-300 hover:bg-white/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div role="log" aria-live="polite" className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-white/70 text-sm text-center mt-16 leading-relaxed"
            >
              No messages yet.<br />
              <span className="text-xs text-white/60">Type below or press the mic to talk.</span>
            </motion.div>
          )}

          {messages.map((msg) => (
            <ChatMessageItem key={msg.id} msg={msg} devMode={devMode} />
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>
    </aside>
  );
};
