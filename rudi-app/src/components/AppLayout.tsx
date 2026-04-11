import React, { useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Activity, Mic, MicOff, Volume2, VolumeX, Paperclip, X, FileText, MessageSquare, Briefcase, RefreshCw, Square, Minus, Maximize2, Trash2, Copy } from 'lucide-react';
import { useRudi, RudiState } from '../hooks/useRudi';
import { AutonomyColors, AutonomyLabels } from '../utils/autonomy';
import type { AutonomyLevel } from '../utils/autonomy';
import { RudiSphere } from './RudiSphere';
import { SidebarTools } from './SidebarTools';
import { ChatPanel } from './ChatPanel';
import { ConfirmationModal } from './ConfirmationModal';
import { ActivityPanel } from './ActivityPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { ProductivityPanel } from './ProductivityPanel';
import { MeetingPanel } from './MeetingPanel';

export const AppLayout: React.FC = () => {
  const {
    state, messages, microphoneLevel, toggleListening, undoLastAction, sendMessage, onToolSelect,
    devMode, setDevMode, autonomyLevel, setAutonomyLevel,
    globalToolStatus, recentActions,
    pendingConfirmation, confirmPendingTool,
    cancelCurrentTask, clearChat,
    voiceEnabled, setVoiceEnabled, isSpeaking, audioLevel, volume, setVolume,
    systemHealth
  } = useRudi();

  const isBrowser      = !window.electronAPI;
  const sphereAmplitude = isSpeaking ? audioLevel : microphoneLevel;

  const [inputText, setInputText]               = useState('');
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [productivityPanelOpen, setProductivityPanelOpen] = useState(false);
  const [meetingPanelOpen, setMeetingPanelOpen] = useState(false);
  const [attachments, setAttachments]           = useState<{ file: File; type: 'image' | 'file'; preview?: string }[]>([]);
  const [isMaximized, setIsMaximized]           = useState(false);

  const inputRef    = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.electronAPI?.windowIsMaximized) {
      const syncMaximizedState = async () => {
        const val = await window.electronAPI.windowIsMaximized();
        setIsMaximized(val);
      };
      syncMaximizedState();
      // Polling for window state sync
      const interval = setInterval(syncMaximizedState, 1000);
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    if (state === RudiState.Idle) inputRef.current?.focus();
  }, [state]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state !== RudiState.Idle) cancelCurrentTask();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, cancelCurrentTask]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() || attachments.length > 0) {
      const processedAttachments = await Promise.all(attachments.map(a =>
        new Promise<{ name: string; type: string; data: string; isIngested?: boolean }>(resolve => {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64Data = (reader.result as string).split(',')[1];
            
            // If it's a PDF, ingest it directly
            if (a.file.name.toLowerCase().endsWith('.pdf')) {
              try {
                await fetch('http://localhost:3001/api/ingest', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ data: base64Data, filename: a.file.name, type: 'pdf' })
                });
                resolve({ name: a.file.name, type: 'pdf_ingested', data: 'Ingested into Knowledge Base' });
              } catch (e) {
                console.error('Ingest failed', e);
                resolve({ name: a.file.name, type: 'error', data: '' });
              }
            } else {
              resolve({
                name: a.file.name,
                type: a.type,
                data: base64Data
              });
            }
          };
          reader.readAsDataURL(a.file);
        })
      ));
      
      const chatAttachments = processedAttachments.filter(a => a.type !== 'pdf_ingested' && a.type !== 'error');
      
      sendMessage(inputText, chatAttachments);
      setInputText('');
      setAttachments([]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const isImage = file.type.startsWith('image/');
      setAttachments(prev => [...prev, {
        file,
        type: isImage ? 'image' : 'file',
        preview: isImage ? URL.createObjectURL(file) : undefined
      }]);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const updated = [...prev];
      if (updated[index].preview) URL.revokeObjectURL(updated[index].preview!);
      updated.splice(index, 1);
      return updated;
    });
  };

  const isActive = state !== RudiState.Idle;

  const stateLabel: Record<string, string> = {
    idle:      'Standby',
    listening: 'Listening…',
    thinking:  'Analysing…',
    speaking:  'Speaking…',
    executing: 'Executing…',
  };

  const stateColor: Record<string, string> = {
    idle:      'text-white/30',
    listening: 'text-emerald-400',
    thinking:  'text-amber-400',
    speaking:  'text-cyan-400',
    executing: 'text-purple-400',
  };

  const stateDot: Record<string, string> = {
    idle:      'bg-white/20',
    listening: 'bg-emerald-400',
    thinking:  'bg-amber-400',
    speaking:  'bg-cyan-400',
    executing: 'bg-purple-400',
  };

  const activeMode = systemHealth.currentMode || 'idle';
  const isCompact  = false; 

  // contextual status copy for the executing state
  const executingLabel: Record<string, string> = {
    idle:    'Standby',
    running: 'Modifying files…',
    success: 'Task complete',
    error:   'Error encountered',
    blocked: 'Action blocked',
  };

  const autonomyLevels: AutonomyLevel[] = ['observe', 'assist', 'autonomous'];

  return (
    <div className={`relative w-full h-screen bg-black overflow-hidden flex flex-col font-sans text-white select-none`}>

      {!isBrowser && (
        <div
          className="flex items-center justify-between w-full h-9 px-3 bg-black/80 border-b border-white/5 flex-shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="w-2 h-2 rounded-full bg-cyan-400 glow-cyan" />
            <span className="text-[10px] font-extrabold tracking-[0.3em] uppercase text-white/90 display-font">RUDI OS</span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1 z-[200]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => window.electronAPI?.windowMinimize()}
              className="w-10 h-8 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
              title="Minimize"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => {
                window.electronAPI?.windowMaximize();
                setIsMaximized(!isMaximized);
              }}
              className="w-10 h-8 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Copy size={13} className="rotate-180" /> : <Maximize2 size={13} />}
            </button>
            <button
              onClick={() => window.electronAPI?.windowClose()}
              className="w-10 h-8 flex items-center justify-center rounded hover:bg-red-500/80 text-white/40 hover:text-white transition-colors"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {isBrowser && (
        <div className="w-full z-[100] bg-orange-600/90 backdrop-blur-md text-[10px] py-1.5 px-4 text-center font-bold tracking-widest uppercase flex items-center justify-center gap-4 flex-shrink-0">
          <span>⚠️ BROWSER MODE — System Commands Disabled</span>
          <span className="opacity-60 font-medium">Use the Electron app for full capability.</span>
        </div>
      )}

      <ConfirmationModal pendingTool={pendingConfirmation} onConfirm={confirmPendingTool} />

      <ErrorBoundary
        fallback={
          <div className="absolute inset-0 flex items-center justify-center z-0">
            <div className="w-32 h-32 rounded-full border border-cyan-500/20 bg-cyan-500/5 animate-pulse" />
          </div>
        }
      >
        <motion.div
          animate={{
            scale: isCompact ? 0.6 : 1,
            x: activeMode === 'coding' ? '25%' : (activeMode === 'web' || activeMode === 'side') ? '25%' : '0%',
            y: activeMode === 'coding' ? '25%' : activeMode === 'web' ? '-25%' : '0%',
          }}
          className="absolute inset-0 z-0"
        >
          <Canvas camera={{ position: [0, 0, 3], fov: 45 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
            <ambientLight intensity={0.3} />
            <RudiSphere
              state={state}
              amplitude={sphereAmplitude}
              globalToolStatus={globalToolStatus}
              autonomyLevel={autonomyLevel}
            />
            <EffectComposer>
              <Bloom
                luminanceThreshold={0.1}
                luminanceSmoothing={globalToolStatus === 'error' ? 0.1 : 0.9}
                height={500}
                intensity={
                  globalToolStatus === 'error'   ? 5.5 :
                  globalToolStatus === 'success' ? 4.0 :
                  state === RudiState.Speaking   ? 3.2 + sphereAmplitude * 2.5 :
                  state === RudiState.Listening  ? 2.8 + sphereAmplitude * 1.5 :
                  state === RudiState.Thinking   ? 2.5 : 2.0
                }
              />
            </EffectComposer>
          </Canvas>
        </motion.div>
      </ErrorBoundary>

      {!isCompact && (
        <div className="absolute inset-0 z-1 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.35) 65%, rgba(0,0,0,0.70) 100%)' }}
        />
      )}

      <div className={`relative flex-1 overflow-hidden flex`}>
        {!isCompact && <SidebarTools onToolSelect={onToolSelect} />}

        <div className="flex-1 flex flex-col items-center justify-between pointer-events-none">
          {!isCompact && (
            <header className="w-full flex items-center justify-between px-4 pt-4 pointer-events-auto">
              <div className="flex flex-col items-center gap-1">
                <motion.h1
                  className="text-sm font-bold tracking-[0.35em] uppercase text-white"
                  animate={{ opacity: isActive ? 1 : 0.8 }}
                >
                  RUDI
                </motion.h1>
                <div className="flex items-center gap-1.5">
                  <motion.span
                    className={`w-1.5 h-1.5 rounded-full ${stateDot[state]}`}
                    animate={{ scale: isActive ? [1, 1.4, 1] : 1 }}
                    transition={{ repeat: isActive ? Infinity : 0, duration: 1.2 }}
                  />
                  <span className={`text-[10px] tracking-widest uppercase font-medium transition-colors ${stateColor[state]}`}>
                    {state === RudiState.Executing ? executingLabel[globalToolStatus] : stateLabel[state]}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 mr-1">
                  <div className="group relative">
                    <div className={`w-1.5 h-1.5 rounded-full ${systemHealth.ollama === 'ready' ? 'bg-emerald-400' : systemHealth.ollama === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
                    <div className="absolute bottom-4 right-0 bg-black/90 border border-white/10 text-[9px] text-white/70 rounded px-2 py-1 hidden group-hover:block whitespace-nowrap">Brain: {systemHealth.ollama}</div>
                  </div>
                  <div className="group relative">
                    <div className={`w-1.5 h-1.5 rounded-full ${systemHealth.voice === 'ready' ? 'bg-emerald-400' : systemHealth.voice === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
                    <div className="absolute bottom-4 right-0 bg-black/90 border border-white/10 text-[9px] text-white/70 rounded px-2 py-1 hidden group-hover:block whitespace-nowrap">Voice: {systemHealth.voice}</div>
                  </div>
                </div>

                <AnimatePresence>
                  {state !== RudiState.Idle && (
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={cancelCurrentTask}
                      title="Stop (Esc)"
                      className="p-2 rounded-xl bg-red-500/20 border border-red-500/30 hover:bg-red-500/40 text-red-400 hover:text-red-300 transition"
                    >
                      <Square size={14} fill="currentColor" />
                    </motion.button>
                  )}
                </AnimatePresence>

                <motion.button
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.93 }}
                  onClick={() => {
                    setProductivityPanelOpen(!productivityPanelOpen);
                    setMeetingPanelOpen(false);
                    setActivityPanelOpen(false);
                  }}
                  className={`p-2 rounded-xl hover:bg-white/8 transition ${productivityPanelOpen ? 'text-amber-400' : 'text-white/50 hover:text-white'}`}
                >
                  <Briefcase size={20} />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.93 }}
                  onClick={() => {
                    setMeetingPanelOpen(!meetingPanelOpen);
                    setProductivityPanelOpen(false);
                    setActivityPanelOpen(false);
                  }}
                  className={`p-2 rounded-xl hover:bg-white/8 transition ${meetingPanelOpen ? 'text-indigo-400' : 'text-white/50 hover:text-white'}`}
                >
                  <MessageSquare size={20} />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.93 }}
                  onClick={() => {
                    setActivityPanelOpen(!activityPanelOpen);
                    setProductivityPanelOpen(false);
                    setMeetingPanelOpen(false);
                  }}
                  className={`p-2 rounded-xl hover:bg-white/8 transition ${activityPanelOpen ? 'text-cyan-400' : 'text-white/50 hover:text-white'}`}
                >
                  <Activity size={20} />
                </motion.button>
              </div>
            </header>
          )}

          <div className="w-full max-w-3xl mx-auto pointer-events-auto px-6 pb-8 flex flex-col gap-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="flex items-center glass-panel rounded-full p-1 gap-1 shadow-lg">
                {autonomyLevels.map(level => {
                  const isSelected = autonomyLevel === level;
                  const colors = AutonomyColors[level];
                  return (
                    <motion.button
                      key={level}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setAutonomyLevel(level)}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all duration-300 ${
                        isSelected
                          ? `${colors.text} ${colors.bg} ${colors.border} border shadow-md`
                          : 'text-white/50 hover:text-white/90 hover:bg-white/5'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? colors.dot : 'bg-white/20'}`} />
                      {AutonomyLabels[level]}
                    </motion.button>
                  );
                })}
              </div>
              <div className="flex flex-1 items-center justify-end gap-2 pr-2">
                <motion.button
                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
                  onClick={undoLastAction}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] glass-panel text-white/70 hover:text-white transition-all tracking-wide shadow-md"
                >
                  <RefreshCw size={12} />
                  Undo
                </motion.button>
                {/* Voice toggle */}
                <motion.button
                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] transition-all font-medium tracking-wide shadow-md ${
                    voiceEnabled
                      ? 'border border-cyan-500/40 text-cyan-400 bg-cyan-500/10 glow-cyan'
                      : 'glass-panel text-white/50 hover:text-white/80'
                  }`}
                >
                  {voiceEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                  Voice
                </motion.button>
              </div>
            </div>

              {/* Volume slider */}
              {voiceEnabled && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  className="flex items-center gap-2 justify-end pr-8"
                >
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={volume}
                    onChange={e => setVolume(parseFloat(e.target.value))}
                    className="w-20 accent-cyan-400"
                  />
                </motion.div>
              )}

            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: 10, height: 0 }}
                  className="flex flex-wrap gap-2 px-2 mb-2"
                >
                  {attachments.map((a, i) => (
                    <motion.div
                      key={i} layout
                      className="relative group glass-panel rounded-xl p-1.5 pr-8 flex items-center gap-3 shadow-md"
                    >
                      {a.type === 'image' && a.preview ? (
                        <img src={a.preview} className="w-8 h-8 object-cover rounded shadow-sm" alt="preview" />
                      ) : (
                        <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center border border-white/10">
                          <FileText size={14} className="text-white/50" />
                        </div>
                      )}
                      <span className="text-[10px] text-white/80 truncate font-medium max-w-[120px] tracking-wide">{a.file.name}</span>
                      <button
                        onClick={() => removeAttachment(i)}
                        className="absolute right-2 p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.form
              onSubmit={handleSend}
              animate={{
                boxShadow: state === RudiState.Listening
                  ? `0 0 ${20 + microphoneLevel * 30}px rgba(52, 211, 153, ${0.4 + microphoneLevel * 0.4})`
                  : state === RudiState.Speaking
                  ? `0 0 ${15 + audioLevel * 25}px rgba(34, 211, 238, ${0.4 + audioLevel * 0.3})`
                  : autonomyLevel === 'autonomous'
                  ? '0 0 12px rgba(52, 211, 153, 0.3)'
                  : '0 0 0px transparent'
              }}
              transition={{ duration: 0.1 }}
              className="relative flex items-center glass-panel rounded-full overflow-hidden transition-all focus-within:shadow-[0_0_20px_rgba(34,211,238,0.15)] focus-within:border-cyan-500/30"
            >
              <input type="file" ref={fileInputRef} className="hidden" multiple
                onChange={handleFileSelect}
                accept="image/*,.txt,.js,.ts,.tsx,.css,.json,.md,.pdf"
              />
              <motion.button
                type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                onClick={() => fileInputRef.current?.click()}
                className="p-4 text-white/30 hover:text-white/70 transition shrink-0"
              >
                <Paperclip size={18} />
              </motion.button>

              <motion.button
                type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                onClick={toggleListening}
                className={`p-4 pl-1 transition shrink-0 ${state === RudiState.Listening ? 'text-emerald-400' : 'text-white/30 hover:text-white/70'}`}
              >
                <motion.div
                  animate={{ scale: state === RudiState.Listening ? [1, 1.2, 1] : 1 }}
                  transition={{ repeat: state === RudiState.Listening ? Infinity : 0, duration: 0.8 }}
                >
                  {state === RudiState.Listening ? <Mic size={18} /> : <MicOff size={18} />}
                </motion.div>
              </motion.button>

              <div className="relative group flex items-center pr-2">
                <motion.button
                  type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className={`p-4 transition shrink-0 ${voiceEnabled ? 'text-amber-400' : 'text-white/30 hover:text-white/70'}`}
                >
                  {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </motion.button>
                <div className="absolute right-0 bottom-[110%] w-32 bg-black/80 border border-white/10 backdrop-blur-md rounded-lg p-3 hidden group-hover:flex items-center gap-2 shadow-2xl">
                  <VolumeX size={12} className="text-white/40" />
                  <input 
                    type="range" min="0" max="1" step="0.05"
                    value={volume} onChange={e => setVolume(parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-white/20 rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400"
                  />
                  <Volume2 size={12} className="text-amber-400" />
                </div>
              </div>

              {messages.length > 0 && (
                <motion.button
                  type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  onClick={clearChat}
                  title="Clear Chat"
                  className="p-4 transition shrink-0 text-white/30 hover:text-red-400"
                >
                  <Trash2 size={18} />
                </motion.button>
              )}

              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={
                  state === RudiState.Listening ? 'Awaiting your command, Sir…' :
                  state === RudiState.Thinking  ? 'Processing…' :
                  state === RudiState.Speaking  ? 'Transmitting…' :
                  autonomyLevel === 'observe'    ? 'Awaiting suggestion…' :
                  autonomyLevel === 'autonomous' ? 'System active…' :
                  'Input command, Sir…'
                }
                className="flex-1 bg-transparent border-none outline-none text-white/90 placeholder:text-white/30 px-2 py-4 h-full text-[13px] tracking-wide"
                disabled={state !== RudiState.Idle && state !== RudiState.Speaking}
              />

              {state !== RudiState.Idle ? (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  onClick={cancelCurrentTask}
                  className="p-4 text-red-400 hover:text-red-300 transition shrink-0"
                  title="Stop Rudi (Esc)"
                >
                  <Square size={16} fill="currentColor" />
                </motion.button>
              ) : (
                <motion.button
                  type="submit"
                  disabled={!inputText.trim() && attachments.length === 0}
                  whileHover={{ scale: 1.1, x: 2 }} whileTap={{ scale: 0.9 }}
                  className="p-4 text-cyan-400 hover:text-cyan-300 disabled:opacity-20 disabled:hover:text-cyan-500 transition shrink-0"
                >
                  <Send size={18} />
                </motion.button>
              )}
            </motion.form>
            <p className="text-center text-[9px] font-bold text-white/40 tracking-[0.2em] uppercase mt-2 display-font">
              Rudi Desktop Agent · {AutonomyLabels[autonomyLevel]} Mode
            </p>
          </div>
        </div>

        {!isCompact && <ChatPanel messages={messages} devMode={devMode} />}

        {!isCompact && (
          <ActivityPanel
            isOpen={activityPanelOpen}
            onToggle={() => setActivityPanelOpen(!activityPanelOpen)}
            devMode={devMode}
            setDevMode={setDevMode}
            recentActions={recentActions}
          />
        )}

        <ProductivityPanel 
          isOpen={productivityPanelOpen} 
          onClose={() => setProductivityPanelOpen(false)} 
        />

        <MeetingPanel 
          isOpen={meetingPanelOpen} 
          onClose={() => setMeetingPanelOpen(false)} 
        />
      </div>

      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-end gap-0.5 pointer-events-none"
          >
            {Array.from({ length: 18 }).map((_, i) => (
              <motion.div
                key={i}
                className="w-0.5 bg-cyan-400/70 rounded-full"
                animate={{
                  height: [4, 4 + Math.random() * 24 * audioLevel, 4],
                  opacity: [0.4, 0.8, 0.4]
                }}
                transition={{
                  repeat: Infinity,
                  duration: 0.3 + Math.random() * 0.4,
                  delay: i * 0.04,
                  ease: 'easeInOut'
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
