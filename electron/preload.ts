import { contextBridge, ipcRenderer } from 'electron';

console.log('[RUDI] Preload script initializing...');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Core Tool Execution ──────────────────────────────────────────────────
  executeTool: (name: string, params: any) => ipcRenderer.invoke('execute-tool', name, params),
  onModeChange: (callback: (mode: string) => void) => {
    ipcRenderer.on('active-mode-changed', (_event, mode) => callback(mode));
  },
  appendLog: (category: string, source: string, message: string) =>
    ipcRenderer.invoke('append-log', category, source, message),
  getLogs: (category: string) => ipcRenderer.invoke('get-logs', category),

  // ── Window Controls ──────────────────────────────────────────────────────
  windowMinimize:   () => ipcRenderer.send('window-minimize'),
  windowMaximize:   () => ipcRenderer.send('window-maximize'),
  windowClose:      () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
});
