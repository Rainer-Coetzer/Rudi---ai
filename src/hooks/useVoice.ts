import { useState, useRef, useCallback, useEffect } from 'react';
import { ENDPOINTS } from '../utils/config';

export interface VoiceState {
  voiceEnabled: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  volume: number;
}

const TTS_ENDPOINT = ENDPOINTS.TTS;

const VOICE_PREF_KEY = 'rudi_voice_enabled';

function readVoicePref(): boolean {
  try {
    return localStorage.getItem(VOICE_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

const GERMAN_MALE_VOICE_NAMES = ['stefan', 'conrad', 'killian', 'florian'];

// getVoices() is often empty until the browser fires `voiceschanged`.
function loadSystemVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);

  return new Promise(resolve => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, 1000);
    synth.addEventListener('voiceschanged', done);
  });
}

// Prefer a German male voice (to match the de-DE neural TTS), then any German,
// then British English, then any English, then whatever the system has.
function pickSystemVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const isGerman = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith('de');
  return voices.find(v => isGerman(v) && GERMAN_MALE_VOICE_NAMES.some(n => v.name.toLowerCase().includes(n)))
      || voices.find(isGerman)
      || voices.find(v => v.lang.startsWith('en-GB'))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0];
}

export function useVoice() {
  // Voice mode (spoken replies + always-on "Hey Rudi" listening) starts off, so
  // the microphone is never requested until the user switches it on.
  const [voiceEnabled, setVoiceEnabledState] = useState(readVoicePref);
  const setVoiceEnabled = useCallback((enabled: boolean) => {
    setVoiceEnabledState(enabled);
    try { localStorage.setItem(VOICE_PREF_KEY, String(enabled)); } catch { /* storage unavailable */ }
  }, []);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [volume, setVolume] = useState(0.85);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  
  // Performance: Persistent buffer to avoid GC pressure in the 60fps loop
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const lastLevelUpdateRef = useRef<number>(performance.now());
  const currentLevelRef = useRef<number>(0);

  // Update gain node volume in real-time
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  function getAudioContext() {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const analyzePlayback = () => {
    if (!analyserRef.current) return;
    
    // Initialize or reuse buffer
    if (!dataArrayRef.current) {
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
    }
    const dataArray = dataArrayRef.current;
    
    analyserRef.current.getByteFrequencyData(dataArray as any);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const normalized = Math.min((sum / dataArray.length) / 60, 1.0); // Higher sensitivity
    
    // Performance: Only update React state if level changed significantly or 32ms passed (~30fps UI)
    const now = performance.now();
    if (Math.abs(normalized - currentLevelRef.current) > 0.05 || now - lastLevelUpdateRef.current > 32) {
      setAudioLevel(normalized);
      currentLevelRef.current = normalized;
      lastLevelUpdateRef.current = now;
    }
    
    animFrameRef.current = requestAnimationFrame(analyzePlayback);
  };

  const stopSpeaking = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (_) {}
      sourceNodeRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setIsSpeaking(false);
    setAudioLevel(0);
  }, []);

  const playAudioBuffer = useCallback(async (arrayBuffer: ArrayBuffer): Promise<void> => {
    return new Promise(async (resolve) => {
      const ctx = getAudioContext();

      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Setup analysis chain: source → analyser → gain → destination
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const gainNode = ctx.createGain();
      gainNode.gain.value = volume;
      gainNodeRef.current = gainNode;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);
      sourceNodeRef.current = source;

      source.onended = () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setIsSpeaking(false);
        setAudioLevel(0);
        sourceNodeRef.current = null;
        resolve();
      };

      source.start(0);
      setIsSpeaking(true);
      analyzePlayback();
    });
  }, [volume]);

  const speakTextSystem = useCallback(async (text: string) => {
    const fallbackVoice = pickSystemVoice(await loadSystemVoices());

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);

      // A German voice reading English text gives Rudi his accent; keep the
      // utterance language English so the words are still read as English.
      if (fallbackVoice) utterance.voice = fallbackVoice;
      utterance.lang = 'en-GB';
      utterance.rate = 1.0;
      utterance.pitch = 0.9; // Slightly deeper for Rudi
      utterance.volume = volume;

      utterance.onstart = () => {
        setIsSpeaking(true);
        // Basic pulsing animation simulation since we can't analyze system speech directly
        const interval = setInterval(() => {
          setAudioLevel(0.2 + Math.random() * 0.4);
        }, 100);
        (utterance as any)._pulseInterval = interval;
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setAudioLevel(0);
        clearInterval((utterance as any)._pulseInterval);
        resolve();
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setAudioLevel(0);
        clearInterval((utterance as any)._pulseInterval);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, [volume]);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) return;
    isProcessingRef.current = true;

    while (queueRef.current.length > 0) {
      const text = queueRef.current.shift()!;

      try {
        // Small pre-speech delay to simulate thinking
        await new Promise(r => setTimeout(r, 250));

        const response = await fetch(TTS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(10000) // 10s - higher tolerance for system load
        });

        if (!response.ok) throw new Error('TTS Endpoint Error');

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength === 0) throw new Error('Empty Buffer');

        await playAudioBuffer(arrayBuffer);

      } catch (err: any) {
        console.warn('[VOICE] Neural TTS unavailable, falling back to System Speech:', err?.message);
        await speakTextSystem(text);
      }
    }

    isProcessingRef.current = false;
  }, [playAudioBuffer, speakTextSystem]);

  const speakText = useCallback((text: string) => {
    if (!voiceEnabled || !text.trim()) return;

    // Aggressively strip markdown, code blocks, and potential log-heavy patterns
    let cleaned = text
      .replace(/\[\[TOOL:[^\]]+\]\]/g, '') // Hide internal tool calls
      .replace(/```[\s\S]*?```/g, '')      // Strip code blocks entirely
      .replace(/!\[.*?\]\(.*?\)/g, '')    // Strip images
      .replace(/https?:\/\/\S+/g, '')      // Strip URLs
      .replace(/[*_`#]/g, '')             // Strip markdown symbols
      .replace(/>\s*/g, '')               // Strip blockquotes
      .replace(/(\n\s*){2,}/g, '\n')      // Collapse multiple newlines
      .trim();

    // Heuristically detect and strip raw terminal/log output that might have escaped code blocks
    cleaned = cleaned
      .replace(/\[\d{2}:\d{2}:\d{2}\]/g, '') 
      .replace(/[a-zA-Z]:\\[\\\w\s.-]+/g, '')
      .replace(/\/\w+\/[\/\w\s.-]+/g, '');

    if (!cleaned) return;

    // Truncate spoken output to focus on the core message
    if (cleaned.length > 400) {
      cleaned = cleaned.substring(0, 397) + '...';
    }

    queueRef.current.push(cleaned);
    processQueue();
  }, [voiceEnabled, processQueue]);

  const stopAllSpeech = useCallback(() => {
    queueRef.current = [];
    isProcessingRef.current = false;
    stopSpeaking();
  }, [stopSpeaking]);
  
  // Update gain node volume in real-time
  useEffect(() => {
    if (gainNodeRef.current) {
      const ctx = getAudioContext();
      gainNodeRef.current.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    }
  }, [volume]);

  // Stop all speech if voice is disabled
  useEffect(() => {
    if (!voiceEnabled && isSpeaking) {
      stopAllSpeech();
    }
  }, [voiceEnabled, isSpeaking, stopAllSpeech]);

  return {
    voiceEnabled, setVoiceEnabled,
    isSpeaking,
    audioLevel,
    volume, setVolume,
    speakText,
    stopAllSpeech
  };
}
