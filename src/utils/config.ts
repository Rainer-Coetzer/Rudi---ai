/**
 * API Configuration for Rudi Agent
 * Centralizing URLs to allow for easier staging/production transitions
 */

export const API_BASE = 'http://localhost:3001/api';

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
