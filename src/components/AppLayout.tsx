import React, { useState, useEffect } from 'react';
import { useRudi, RudiState } from '../hooks/useRudi';
import { SidebarTools } from './SidebarTools';
import { ChatPanel } from './ChatPanel';
import { ConfirmationModal } from './ConfirmationModal';
import { ActivityPanel } from './ActivityPanel';
import { ProductivityPanel } from './ProductivityPanel';
import { MeetingPanel } from './MeetingPanel';
import { TopBar, type SidePanel } from './TopBar';
import { ModeControls } from './ModeControls';
import { Composer } from './Composer';
import { SphereStage } from './SphereStage';

export const AppLayout: React.FC = () => {
  const {
    state, messages, microphoneLevel, toggleListening, undoLastAction, sendMessage, onToolSelect,
    devMode, setDevMode, autonomyLevel, setAutonomyLevel,
    globalToolStatus, recentActions,
    pendingConfirmation, confirmPendingTool,
    cancelCurrentTask, clearChat,
    voiceEnabled, setVoiceEnabled, isSpeaking, audioLevel, volume, setVolume,
    systemHealth,
    provider, setProvider,
  } = useRudi();

  const isBrowser       = !window.desktopAPI;
  const sphereAmplitude = isSpeaking ? audioLevel : microphoneLevel;

  const [openPanel, setOpenPanel]     = useState<SidePanel>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const api = window.desktopAPI;
    if (api) {
      const syncMaximizedState = async () => {
        const val = await api.windowIsMaximized();
        setIsMaximized(val);
      };
      syncMaximizedState();
      // Polling for window state sync
      const interval = setInterval(syncMaximizedState, 1000);
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openPanel) setOpenPanel(null);
      else if (state !== RudiState.Idle) cancelCurrentTask();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, cancelCurrentTask, openPanel]);

  const togglePanel = (panel: Exclude<SidePanel, null>) =>
    setOpenPanel(current => (current === panel ? null : panel));
  const closePanel = () => setOpenPanel(null);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col font-sans text-white select-none">
      {isBrowser && (
        <div role="note" className="w-full bg-orange-700 text-white text-xs py-1.5 px-4 text-center font-semibold flex-shrink-0 truncate">
          Browser mode: system commands are disabled. Run <code className="font-mono">npm run app:dev</code> for the desktop app.
        </div>
      )}

      <TopBar
        isDesktop={!isBrowser}
        isMaximized={isMaximized}
        onToggleMaximize={() => {
          window.desktopAPI?.windowMaximize();
          setIsMaximized(!isMaximized);
        }}
        state={state}
        globalToolStatus={globalToolStatus}
        systemHealth={systemHealth}
        openPanel={openPanel}
        onTogglePanel={togglePanel}
      />

      <ConfirmationModal pendingTool={pendingConfirmation} onConfirm={confirmPendingTool} />

      <div className="relative flex-1 min-h-0 flex">
        <SidebarTools onToolSelect={onToolSelect} />

        <main className="relative flex-1 min-w-0 flex flex-col">
          <SphereStage
            state={state}
            amplitude={sphereAmplitude}
            audioLevel={audioLevel}
            isSpeaking={isSpeaking}
            globalToolStatus={globalToolStatus}
            autonomyLevel={autonomyLevel}
          />

          <div className="w-full max-w-3xl mx-auto px-4 pb-4 flex flex-col gap-3 shrink-0">
            <ModeControls
              provider={provider}
              setProvider={setProvider}
              claudeAvailable={systemHealth.claude}
              autonomyLevel={autonomyLevel}
              setAutonomyLevel={setAutonomyLevel}
              voiceEnabled={voiceEnabled}
              setVoiceEnabled={setVoiceEnabled}
              volume={volume}
              setVolume={setVolume}
              onUndo={undoLastAction}
              canUndo={!isBrowser}
            />
            <Composer
              state={state}
              autonomyLevel={autonomyLevel}
              microphoneLevel={microphoneLevel}
              audioLevel={audioLevel}
              sendMessage={sendMessage}
              toggleListening={toggleListening}
              cancelCurrentTask={cancelCurrentTask}
            />
          </div>
        </main>

        <ChatPanel messages={messages} devMode={devMode} onClear={clearChat} />

        <ActivityPanel
          isOpen={openPanel === 'activity'}
          onClose={closePanel}
          devMode={devMode}
          setDevMode={setDevMode}
          recentActions={recentActions}
        />
        <ProductivityPanel isOpen={openPanel === 'productivity'} onClose={closePanel} />
        <MeetingPanel isOpen={openPanel === 'meetings'} onClose={closePanel} />
      </div>
    </div>
  );
};
