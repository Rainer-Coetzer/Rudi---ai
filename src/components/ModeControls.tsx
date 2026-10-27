import React from 'react';
import { Cloud, Server, Volume2, VolumeX, Undo2 } from 'lucide-react';
import type { Provider } from '../hooks/useRudi';
import { AutonomyColors, AutonomyDescriptions, AutonomyLabels } from '../utils/autonomy';
import type { AutonomyLevel } from '../utils/autonomy';

interface ModeControlsProps {
  provider: Provider;
  setProvider: (p: Provider) => void;
  claudeAvailable: boolean;
  /** Why Claude is unavailable, if the backend reports one; overrides the default hint. */
  claudeUnavailableReason?: string;
  autonomyLevel: AutonomyLevel;
  setAutonomyLevel: (level: AutonomyLevel) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  onUndo: () => void;
  canUndo: boolean;
}

const autonomyLevels: AutonomyLevel[] = ['observe', 'assist', 'autonomous'];

const DEFAULT_CLAUDE_HINT = 'Sign in to Claude Code to enable: run `claude`, then /login';

const segment = 'flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold tracking-wide transition-colors';
const idleSegment = 'text-white/70 hover:text-white hover:bg-white/10';

export const ModeControls: React.FC<ModeControlsProps> = ({
  provider, setProvider, claudeAvailable, claudeUnavailableReason,
  autonomyLevel, setAutonomyLevel,
  voiceEnabled, setVoiceEnabled, volume, setVolume,
  onUndo, canUndo,
}) => {
  const activeColors = AutonomyColors[autonomyLevel];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Autonomy level */}
        <div role="radiogroup" aria-label="Autonomy mode" className="flex items-center glass-panel rounded-full p-1 gap-0.5">
          {autonomyLevels.map(level => {
            const isSelected = autonomyLevel === level;
            const colors = AutonomyColors[level];
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={isSelected}
                title={`${AutonomyLabels[level]}: ${AutonomyDescriptions[level]}`}
                onClick={() => setAutonomyLevel(level)}
                className={`${segment} ${isSelected ? `${colors.text} ${colors.bg} ${colors.border} border` : `${idleSegment} border border-transparent`}`}
              >
                <span aria-hidden className={`w-2 h-2 rounded-full ${isSelected ? colors.dot : 'bg-white/40'}`} />
                {AutonomyLabels[level]}
              </button>
            );
          })}
        </div>

        {/* Model provider */}
        <div role="radiogroup" aria-label="Model provider" className="flex items-center glass-panel rounded-full p-1 gap-0.5">
          {(['ollama', 'claude'] as Provider[]).map(p => {
            const isSelected = provider === p;
            const disabled = p === 'claude' && !claudeAvailable;
            return (
              <span key={p} className="relative group">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-disabled={disabled}
                  aria-describedby={disabled ? 'claude-unavailable-hint' : undefined}
                  onClick={() => !disabled && setProvider(p)}
                  title={disabled ? undefined : p === 'ollama' ? 'Use the local Ollama model' : 'Use Claude via your Claude Code sign-in'}
                  className={`${segment} ${
                    disabled
                      ? 'text-white/50 cursor-not-allowed border border-transparent'
                      : isSelected
                        ? 'text-purple-200 bg-purple-500/20 border border-purple-500/40'
                        : `${idleSegment} border border-transparent`
                  }`}
                >
                  {p === 'ollama' ? <Server size={13} aria-hidden /> : <Cloud size={13} aria-hidden />}
                  {p === 'ollama' ? 'Ollama' : 'Claude'}
                </button>
                {disabled && (
                  // Shown on hover and on keyboard focus (a title tooltip only appears on hover).
                  <span
                    id="claude-unavailable-hint"
                    role="tooltip"
                    className="hidden group-hover:block group-focus-within:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 px-3 py-2 rounded-lg bg-black/95 border border-white/20 text-xs text-white/90 leading-snug text-center shadow-xl z-20"
                  >
                    {claudeUnavailableReason || DEFAULT_CLAUDE_HINT}
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {/* Voice mode + volume: the single home for both controls */}
        <div className="flex items-center glass-panel rounded-full p-1 gap-1">
          <button
            type="button"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            aria-pressed={voiceEnabled}
            title={voiceEnabled
              ? 'Voice on: Rudi speaks replies and listens for "Hey Rudi". Click to turn off.'
              : 'Voice off. Click to have Rudi speak replies and listen for "Hey Rudi" (uses the microphone).'}
            className={`${segment} border ${
              voiceEnabled ? 'text-cyan-200 bg-cyan-500/15 border-cyan-500/40' : `${idleSegment} border-transparent`
            }`}
          >
            {voiceEnabled ? <Volume2 size={13} aria-hidden /> : <VolumeX size={13} aria-hidden />}
            Voice {voiceEnabled ? 'on' : 'off'}
          </button>
          {voiceEnabled && (
            <input
              type="range" min={0} max={1} step={0.05}
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              aria-label="Voice volume"
              title={`Volume ${Math.round(volume * 100)}%`}
              className="w-20 mr-2 accent-cyan-400 cursor-pointer"
            />
          )}
        </div>

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo
            ? 'Undo the last file or git change Rudi made'
            : 'Undo is only available in the desktop app'}
          className={`${segment} glass-panel text-white/80 hover:text-white disabled:text-white/50 disabled:cursor-not-allowed disabled:hover:text-white/50`}
        >
          <Undo2 size={13} aria-hidden />
          Undo last change
        </button>
      </div>

      <p className="text-xs text-white/70 text-center leading-snug max-w-md">
        <span className={`font-semibold ${activeColors.text}`}>{AutonomyLabels[autonomyLevel]}:</span>{' '}
        {AutonomyDescriptions[autonomyLevel]}
      </p>
    </div>
  );
};
