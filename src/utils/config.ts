/**
 * API Configuration for Rudi Agent
 * Centralizing URLs to allow for easier staging/production transitions
 */

// The Tauri shell injects the backend port (RUDI_BACKEND_PORT); plain `vite` falls back to 3001.
const BACKEND_PORT = (window as { __RUDI_BACKEND_PORT__?: number }).__RUDI_BACKEND_PORT__ ?? 3001;

// 127.0.0.1, not localhost: the backend binds to IPv4 loopback only.
export const API_BASE = `http://127.0.0.1:${BACKEND_PORT}/api`;

export const ENDPOINTS = {
  CHAT: `${API_BASE}/chat`,
  HEALTH: `${API_BASE}/health`,
  INGEST: `${API_BASE}/ingest`,
  TTS: `${API_BASE}/tts`,
};

export const UI_CONFIG = {
  MAX_MESSAGES_UI: 100,
  PRUNE_SIZE_UI: 90,
  MAX_HISTORY_CONTEXT: 500,
  CONTEXT_WINDOW: 30,
  AUTO_SCROLL_THROTTLE: 100,
};

export const AUDIO_CONFIG = {
  FFT_SIZE: 256,
  SMOOTHING: 0.8,
  MICROPHONE_POLL_MS: 33,
};
