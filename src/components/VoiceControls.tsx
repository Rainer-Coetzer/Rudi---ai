import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';

interface VoiceControlsProps {
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  isSpeaking: boolean;
  volume: number;
  setVolume: (v: number) => void;
  audioLevel: number;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  voiceEnabled,
  setVoiceEnabled,
  isSpeaking,
  volume,
  setVolume,
  audioLevel
}) => {
  return (
    <div className="fixed bottom-6 right-6 z-20 flex flex-col items-end gap-2 pointer-events-auto">

      {/* Speaking badge */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 backdrop-blur-md text-cyan-300 text-xs font-bold uppercase tracking-widest shadow-[0_0_20px_rgba(34,211,238,0.3)]"
          >
            {/* Animated waveform bars */}
            <div className="flex items-center gap-0.5 h-4">
              {[0.6, 1.0, 0.7, 0.9, 0.5].map((base, i) => (
                <motion.div
                  key={i}
                  className="w-0.5 bg-cyan-400 rounded-full"
                  animate={{ scaleY: [base * 0.4, base * (0.5 + audioLevel), base * 0.4] }}
                  transition={{ duration: 0.4 + i * 0.07, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ height: '100%', transformOrigin: 'bottom' }}
                />
              ))}
            </div>
            Rudi Speaking…
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls Panel */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/60 border border-white/10 backdrop-blur-md shadow-xl"
      >
        {/* Voice Toggle */}
        <button
          type="button"
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          aria-pressed={voiceEnabled}
          aria-label={voiceEnabled ? 'Turn voice off' : 'Turn voice on'}
          title={voiceEnabled ? 'Turn voice off' : 'Turn voice on'}
          className={`p-1.5 rounded-lg transition ${voiceEnabled ? 'text-cyan-400 hover:text-cyan-200' : 'text-white/70 hover:text-white'}`}
        >
          {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>

        {/* Volume Slider */}
        <AnimatePresence>
          {voiceEnabled && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 80, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                aria-label="Voice volume"
                className="w-20 h-1 accent-cyan-400 cursor-pointer"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Level indicator */}
        <AnimatePresence>
          {isSpeaking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]"
              style={{ transform: `scale(${1 + audioLevel * 2})` }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
