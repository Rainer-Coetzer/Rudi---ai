/**
 * Renderer → desktop bridge. Replaces the Electron preload: window controls and
 * the folder picker are Rust commands; tool/log/workspace calls are relayed by
 * Rust to the Node sidecar (see src-tauri/src/main.rs → sidecar_call).
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DesktopAPI } from '../types/desktop';

const sidecar = <T>(method: string, params: Record<string, unknown> = {}) =>
  invoke<T>('sidecar_call', { method, params });

const desktopAPI: DesktopAPI = {
  // ── Core Tool Execution ──────────────────────────────────────────────────
  executeTool: (name, params, options) => sidecar('executeTool', { name, params, confirm: options?.confirm }),
  setAutonomyLevel: (level) => sidecar('setAutonomyLevel', { level }),
  onModeChange: (callback) => {
    void listen<string>('active-mode-changed', (e) => callback(e.payload));
  },
  appendLog: (category, source, message) => {
    void sidecar('appendLog', { category, source, message });
  },
  getLogs: (category) => sidecar('getLogs', { category }),
  getToolSchemas: () => sidecar('getToolSchemas'),
  executeMcpTool: (server, tool, args) => sidecar('executeMcpTool', { server, tool, args }),
  getProjectContext: () => sidecar('getProjectContext'),

  // ── Workspace ────────────────────────────────────────────────────────────
  getWorkspace: () => sidecar('getWorkspace'),
  setWorkspace: (path) => sidecar('setWorkspace', { path }),
  pickWorkspace: () => invoke('pick_workspace'),

  // ── Window Controls ──────────────────────────────────────────────────────
  windowMinimize: () => void invoke('window_minimize'),
  windowMaximize: () => void invoke('window_maximize'),
  windowClose: () => void invoke('window_close'),
  windowIsMaximized: () => invoke('window_is_maximized'),
};

/** Call before rendering. Leaves window.desktopAPI undefined outside Tauri (browser dev). */
export function installDesktopAPI() {
  if (isTauri()) window.desktopAPI = desktopAPI;
}
