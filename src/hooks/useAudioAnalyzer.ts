import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudioAnalyzer(isActive: boolean) {
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastAudioProcessTime = useRef<number>(0);
  const freqBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const lastLevelRef = useRef<number>(0);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current) return;
    const now = performance.now();
    // Cache level updates to ~30fps for UI performance
    if (now - lastAudioProcessTime.current > 33) {
      const bins = analyserRef.current.frequencyBinCount;
      if (!freqBufferRef.current || freqBufferRef.current.length !== bins) {
        freqBufferRef.current = new Uint8Array(bins);
      }
      const dataArray = freqBufferRef.current;
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const level = Math.min((sum / dataArray.length) / 128, 1.0);
      // Skip re-renders for imperceptible changes
      if (Math.abs(level - lastLevelRef.current) > 0.01 || (level === 0) !== (lastLevelRef.current === 0)) {
        lastLevelRef.current = level;
        setMicrophoneLevel(level);
      }
      lastAudioProcessTime.current = now;
    }
    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, []);

  const startAnalyzer = useCallback(async () => {
    if (!isActive) return false;
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      microphoneStreamRef.current = stream;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyzeAudio();
      return true;
    } catch (err) {
      console.error('[AUDIO] Microphone access denied:', err);
      return false;
    }
  }, [getAudioContext, analyzeAudio]);

  const stopAnalyzer = useCallback(() => {
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach(t => t.stop());
      microphoneStreamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastLevelRef.current = 0;
    setMicrophoneLevel(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAnalyzer();
  }, [stopAnalyzer]);

  return {
    microphoneLevel,
    startAnalyzer,
    stopAnalyzer
  };
}
