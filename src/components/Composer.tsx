import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, Paperclip, X, FileText, Square, AlertCircle, CheckCircle2 } from 'lucide-react';
import { RudiState } from '../hooks/useRudi';
import type { AutonomyLevel } from '../utils/autonomy';
import { ENDPOINTS } from '../utils/config';

type ChatAttachment = { name: string; type: string; data: string };

interface Attachment {
  file: File;
  type: 'image' | 'file';
  preview?: string;
}

interface Notice {
  tone: 'error' | 'info';
  text: string;
}

interface ComposerProps {
  state: RudiState;
  autonomyLevel: AutonomyLevel;
  microphoneLevel: number;
  audioLevel: number;
  sendMessage: (text: string, attachments: ChatAttachment[]) => void;
  toggleListening: () => void;
  cancelCurrentTask: () => void;
}

const readAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
  reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
  reader.readAsDataURL(file);
});

const isPdf = (file: File) => file.name.toLowerCase().endsWith('.pdf');

export const Composer: React.FC<ComposerProps> = ({
  state, autonomyLevel, microphoneLevel, audioLevel,
  sendMessage, toggleListening, cancelCurrentTask,
}) => {
  const [inputText, setInputText]     = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notice, setNotice]           = useState<Notice | null>(null);
  const [isSending, setIsSending]     = useState(false);

  const inputRef     = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isListening = state === RudiState.Listening;
  // Typing is always allowed; only sending waits until Rudi is free.
  const isBusy  = state === RudiState.Thinking || state === RudiState.Executing || state === RudiState.Speaking;
  const hasDraft = inputText.trim().length > 0 || attachments.length > 0;
  const canSend = !isBusy && !isSending && hasDraft;

  useEffect(() => {
    // Return focus to the input after a reply, unless the user is working elsewhere.
    if (state === RudiState.Idle && (document.activeElement === document.body || document.activeElement === null)) {
      inputRef.current?.focus();
    }
  }, [state]);

  useEffect(() => {
    if (notice?.tone !== 'info') return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setIsSending(true);

    const chatAttachments: ChatAttachment[] = [];
    const failed: { attachment: Attachment; reason: string }[] = [];
    const ingested: string[] = [];

    for (const a of attachments) {
      try {
        const data = await readAsBase64(a.file);
        if (isPdf(a.file)) {
          // PDFs go into the knowledge base rather than the chat message.
          const res = await fetch(ENDPOINTS.INGEST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, filename: a.file.name, type: 'pdf' }),
          });
          if (!res.ok) throw new Error(`server returned ${res.status}`);
          ingested.push(a.file.name);
        } else {
          chatAttachments.push({ name: a.file.name, type: a.type, data });
        }
      } catch (err) {
        console.error('Attachment failed', a.file.name, err);
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ attachment: a, reason });
      }
    }

    if (inputText.trim() || chatAttachments.length > 0) {
      sendMessage(inputText, chatAttachments);
      setInputText('');
    }

    // Keep failed files in the tray so the user can retry or remove them.
    const failedSet = new Set(failed.map(f => f.attachment));
    attachments.forEach(a => {
      if (!failedSet.has(a) && a.preview) URL.revokeObjectURL(a.preview);
    });
    setAttachments(failed.map(f => f.attachment));

    if (failed.length > 0) {
      const names = failed.map(f => f.attachment.file.name).join(', ');
      setNotice({
        tone: 'error',
        text: `Couldn't add ${names} (${failed[0].reason}). The file is still attached; press Send to retry or remove it.`,
      });
    } else if (ingested.length > 0) {
      setNotice({ tone: 'info', text: `Added ${ingested.join(', ')} to the knowledge base.` });
    } else {
      setNotice(null);
    }
    setIsSending(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [
      ...prev,
      ...files.map(file => {
        const isImage = file.type.startsWith('image/');
        return { file, type: isImage ? 'image' as const : 'file' as const, preview: isImage ? URL.createObjectURL(file) : undefined };
      }),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const updated = [...prev];
      const preview = updated[index].preview;
      if (preview) URL.revokeObjectURL(preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const placeholder =
    isListening                          ? 'Listening… or type a message' :
    isBusy                               ? 'Rudi is busy. Type ahead, send when ready' :
    autonomyLevel === 'observe'          ? 'Ask Rudi for a suggestion…' :
    'Ask Rudi to do something…';

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs leading-snug ${
              notice.tone === 'error'
                ? 'bg-red-950/70 border-red-500/40 text-red-100'
                : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-100'
            }`}
          >
            {notice.tone === 'error'
              ? <AlertCircle size={14} className="shrink-0 mt-px text-red-300" aria-hidden />
              : <CheckCircle2 size={14} className="shrink-0 mt-px text-emerald-300" aria-hidden />}
            <span className="flex-1">{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              title="Dismiss"
              className="shrink-0 p-0.5 rounded hover:bg-white/10"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            aria-label="Attachments"
            className="flex flex-wrap gap-2 px-1"
          >
            {attachments.map((a, i) => (
              <motion.li
                key={`${a.file.name}-${i}`} layout
                className="relative glass-panel rounded-xl p-1.5 pr-9 flex items-center gap-2"
              >
                {a.type === 'image' && a.preview ? (
                  <img src={a.preview} className="w-8 h-8 object-cover rounded" alt="" />
                ) : (
                  <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center border border-white/10">
                    <FileText size={14} className="text-white/70" aria-hidden />
                  </div>
                )}
                <span className="text-xs text-white/90 truncate max-w-[140px]" title={a.file.name}>{a.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  aria-label={`Remove ${a.file.name}`}
                  title="Remove attachment"
                  className="absolute right-1.5 p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <motion.form
        onSubmit={handleSend}
        animate={{
          boxShadow: isListening
            ? `0 0 ${20 + microphoneLevel * 30}px rgba(52, 211, 153, ${0.4 + microphoneLevel * 0.4})`
            : state === RudiState.Speaking
            ? `0 0 ${15 + audioLevel * 25}px rgba(34, 211, 238, ${0.4 + audioLevel * 0.3})`
            : '0 0 0px transparent'
        }}
        transition={{ duration: 0.1 }}
        className="relative flex items-center gap-1 glass-panel rounded-full pl-1.5 pr-1.5 focus-within:border-cyan-400/70"
      >
        <input
          type="file" ref={fileInputRef} className="hidden" multiple
          onChange={handleFileSelect}
          accept="image/*,.txt,.js,.ts,.tsx,.css,.json,.md,.pdf"
          aria-hidden
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach files"
          title="Attach files (images, text, code, or PDFs for the knowledge base)"
          className="w-10 h-10 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition shrink-0"
        >
          <Paperclip size={18} />
        </button>

        <button
          type="button"
          onClick={toggleListening}
          aria-pressed={isListening}
          aria-label={isListening ? 'Stop listening' : 'Talk to Rudi'}
          title={isListening ? 'Stop listening' : 'Click to talk'}
          className={`relative w-10 h-10 flex items-center justify-center rounded-full transition shrink-0 ${
            isListening
              ? 'text-emerald-200 bg-emerald-500/20 ring-1 ring-emerald-400/60'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <motion.span
            className="flex"
            animate={{ scale: isListening ? [1, 1.15, 1] : 1 }}
            transition={{ repeat: isListening ? Infinity : 0, duration: 0.8 }}
          >
            <Mic size={18} />
          </motion.span>
          {isListening && <span aria-hidden className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400" />}
        </button>

        <label htmlFor="rudi-command-input" className="sr-only">Message Rudi</label>
        <input
          id="rudi-command-input"
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="flex-1 min-w-0 bg-transparent border-none outline-none focus-visible:outline-none text-white placeholder:text-white/60 px-2 py-3 text-sm"
        />

        {isBusy ? (
          <button
            type="button"
            onClick={cancelCurrentTask}
            aria-label="Stop Rudi"
            title="Stop Rudi (Esc)"
            className="h-10 px-3 flex items-center gap-1.5 rounded-full text-red-200 bg-red-500/20 hover:bg-red-500/35 border border-red-500/40 transition shrink-0 text-xs font-semibold"
          >
            <Square size={12} fill="currentColor" aria-hidden />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            title="Send (Enter)"
            className="w-10 h-10 flex items-center justify-center rounded-full text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/15 disabled:text-white/40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition shrink-0"
          >
            <Send size={18} />
          </button>
        )}
      </motion.form>
    </div>
  );
};
