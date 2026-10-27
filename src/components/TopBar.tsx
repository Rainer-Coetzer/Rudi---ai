import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Briefcase, MessageSquare, Minus, Maximize2, Copy, X } from 'lucide-react';
import { RudiState } from '../hooks/useRudi';
import type { SystemHealth } from '../hooks/useHealthMonitor';

export type SidePanel = 'productivity' | 'meetings' | 'activity' | null;

interface TopBarProps {
  isDesktop: boolean;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  state: RudiState;
  globalToolStatus: string;
  systemHealth: SystemHealth;
  openPanel: SidePanel;
  onTogglePanel: (panel: Exclude<SidePanel, null>) => void;
}

const stateLabel: Record<string, string> = {
  idle:      'Standby',
  listening: 'Listening…',
  thinking:  'Thinking…',
  speaking:  'Speaking…',
  executing: 'Executing…',
};

const stateColor: Record<string, string> = {
  idle:      'text-white/70',
  listening: 'text-emerald-300',
  thinking:  'text-amber-300',
  speaking:  'text-cyan-300',
  executing: 'text-purple-300',
};

const stateDot: Record<string, string> = {
  idle:      'bg-white/50',
  listening: 'bg-emerald-400',
  thinking:  'bg-amber-400',
  speaking:  'bg-cyan-400',
  executing: 'bg-purple-400',
};

// Contextual status copy for the executing state
const executingLabel: Record<string, string> = {
  idle:    'Standby',
  running: 'Running tool…',
  success: 'Task complete',
  error:   'Error encountered',
  blocked: 'Action blocked',
};

type HealthTone = 'ok' | 'warn' | 'down';

const toneStyles: Record<HealthTone, { dot: string; text: string; border: string }> = {
  ok:   { dot: 'bg-emerald-400',               text: 'text-emerald-200', border: 'border-emerald-500/30' },
  warn: { dot: 'bg-amber-400 animate-pulse',   text: 'text-amber-200',   border: 'border-amber-500/30' },
  down: { dot: 'bg-red-400',                   text: 'text-red-200',     border: 'border-red-500/40' },
};

const HealthChip: React.FC<{ label: string; value: string; tone: HealthTone; detail: string }> = ({ label, value, tone, detail }) => {
  const s = toneStyles[tone];
  return (
    <div
      role="status"
      title={detail}
      aria-label={`${label}: ${value}. ${detail}`}
      className={`flex items-center gap-1.5 h-7 px-2.5 rounded-full border bg-black/40 text-xs ${s.border}`}
    >
      <span aria-hidden className={`w-2 h-2 rounded-full ${s.dot}`} />
      <span className="text-white/70">{label}</span>
      <span className={`font-semibold ${s.text}`}>{value}</span>
    </div>
  );
};

const PanelButton: React.FC<{
  label: string; active: boolean; activeClass: string; onClick: () => void; children: React.ReactNode;
}> = ({ label, active, activeClass, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
    className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
      active ? `${activeClass} bg-white/10` : 'text-white/70 hover:text-white hover:bg-white/10'
    }`}
  >
    {children}
  </button>
);

export const TopBar: React.FC<TopBarProps> = ({
  isDesktop, isMaximized, onToggleMaximize,
  state, globalToolStatus, systemHealth,
  openPanel, onTogglePanel,
}) => {
  const isActive = state !== RudiState.Idle;
  const statusText = state === RudiState.Executing ? executingLabel[globalToolStatus] : stateLabel[state];

  const brainTone: HealthTone = systemHealth.ollama === 'ready' ? 'ok' : systemHealth.ollama === 'checking' ? 'warn' : 'down';
  const brainValue = systemHealth.ollama === 'ready' ? 'Ready' : systemHealth.ollama === 'checking' ? 'Checking' : 'Offline';
  const voiceTone: HealthTone =
    systemHealth.voice === 'ready' ? 'ok' : systemHealth.voice === 'unavailable' ? 'down' : 'warn';
  const voiceValue =
    systemHealth.voice === 'ready' ? 'Ready' :
    systemHealth.voice === 'fallback' ? 'Fallback' :
    systemHealth.voice === 'checking' ? 'Checking' : 'Offline';

  return (
    <div
      // Tauri drag region: buttons inside still click normally; double-click toggles maximize.
      data-tauri-drag-region={isDesktop ? 'deep' : undefined}
      className="relative z-30 flex items-center gap-3 w-full h-12 pl-4 pr-2 bg-black/85 border-b border-white/10 flex-shrink-0"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-bold tracking-[0.3em] uppercase text-white display-font">Rudi</span>
        <div className="flex items-center gap-1.5 min-w-0" role="status" aria-live="polite">
          <motion.span
            aria-hidden
            className={`w-2 h-2 rounded-full shrink-0 ${stateDot[state]}`}
            animate={{ scale: isActive ? [1, 1.4, 1] : 1 }}
            transition={{ repeat: isActive ? Infinity : 0, duration: 1.2 }}
          />
          <span className={`text-xs font-medium tracking-wide truncate ${stateColor[state]}`}>{statusText}</span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <HealthChip
          label="Brain"
          value={brainValue}
          tone={brainTone}
          detail={`Language model (${systemHealth.model}) via Ollama`}
        />
        <HealthChip
          label="Voice"
          value={voiceValue}
          tone={voiceTone}
          detail={voiceTone === 'ok' ? 'Neural text-to-speech is available' : 'Neural TTS unavailable; system speech is used instead'}
        />
      </div>

      <div className="flex items-center gap-0.5 pl-2 border-l border-white/10">
        <PanelButton
          label="Tasks and calendar"
          active={openPanel === 'productivity'}
          activeClass="text-amber-300"
          onClick={() => onTogglePanel('productivity')}
        >
          <Briefcase size={18} />
        </PanelButton>
        <PanelButton
          label="Meeting notes"
          active={openPanel === 'meetings'}
          activeClass="text-indigo-300"
          onClick={() => onTogglePanel('meetings')}
        >
          <MessageSquare size={18} />
        </PanelButton>
        <PanelButton
          label="Activity log"
          active={openPanel === 'activity'}
          activeClass="text-cyan-300"
          onClick={() => onTogglePanel('activity')}
        >
          <Activity size={18} />
        </PanelButton>
      </div>

      {isDesktop && (
        <div className="flex items-center gap-0.5 pl-2 border-l border-white/10">
          <button
            type="button"
            onClick={() => window.desktopAPI?.windowMinimize()}
            aria-label="Minimize window"
            title="Minimize"
            className="w-10 h-8 flex items-center justify-center rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={onToggleMaximize}
            aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
            title={isMaximized ? 'Restore' : 'Maximize'}
            className="w-10 h-8 flex items-center justify-center rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            {isMaximized ? <Copy size={13} className="rotate-180" /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            onClick={() => window.desktopAPI?.windowClose()}
            aria-label="Close window"
            title="Close"
            className="w-10 h-8 flex items-center justify-center rounded hover:bg-red-500/80 text-white/70 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
