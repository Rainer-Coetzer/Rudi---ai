import { useState, useCallback, useRef, useEffect } from 'react';

export function useSpeechToText(onTranscription: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  // Callers usually pass an inline lambda; keep the latest one in a ref so the
  // worker and the start/stop callbacks stay stable across renders.
  const onTranscriptionRef = useRef(onTranscription);
  useEffect(() => {
    onTranscriptionRef.current = onTranscription;
  }, [onTranscription]);

  const isListeningRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Collect 16kHz PCM data
  const audioDataRef = useRef<Float32Array[]>([]);

  // The Whisper worker (and its model download) is created on first use rather
  // than on page load, so nothing heavy runs until the user asks to talk.
  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setIsModelLoading(true);

    worker.onmessage = (event) => {
      const { status, text, error } = event.data;
      if (status === 'ready') {
        setIsModelLoading(false);
        console.log('[STT] Local Whisper pipeline ready.');
      } else if (status === 'complete' && text) {
        console.log('[STT] Transcription:', text);
        const finalTranscript = text.trim();
        // Check for wake word "hey rudi"
        if (finalTranscript.toLowerCase().includes('hey rudi')) {
          const cmd = finalTranscript.toLowerCase().replace('hey rudi', '').trim();
          onTranscriptionRef.current(cmd || '[WAKE_WORD_ONLY]');
        } else if (finalTranscript) {
          onTranscriptionRef.current(finalTranscript);
        }
      } else if (status === 'error') {
        setIsModelLoading(false);
        console.error('[STT Worker Error]', error);
      }
    };

    worker.postMessage({ type: 'load' });
    return worker;
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const flushAudioToWhisper = useCallback(() => {
    const chunks = audioDataRef.current;
    if (chunks.length > 0) {
      const totalLen = chunks.reduce((acc, val) => acc + val.length, 0);
      // Ignore if less than 1 second of audio
      if (totalLen >= 16000) {
        const combined = new Float32Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        workerRef.current?.postMessage({ type: 'transcribe', audio: combined });
      }
      // Reset buffer immediately
      audioDataRef.current = [];
    }
  }, []);

  const startSTT = useCallback(async () => {
    if (isListeningRef.current) return;
    isListeningRef.current = true;
    try {
      ensureWorker();
      // The microphone permission prompt appears here, i.e. only once the user
      // has pressed the mic button or switched voice on.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isListeningRef.current) {
        // stopSTT ran while the permission prompt was open.
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // 4096 frames per buffer
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      audioDataRef.current = [];
      let silenceFrames = 0;
      let isSpeaking = false;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // Safety: Cap buffer at ~15 seconds (15 * 16000 / 4096 = ~58 chunks)
        if (audioDataRef.current.length >= 60) {
          // Auto-flush if buffer is full to prevent memory creep
          flushAudioToWhisper();
        }
        audioDataRef.current.push(new Float32Array(inputData));

        // Simple VAD via RMS (Root Mean Square)
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) sumSquares += inputData[i] * inputData[i];
        const rms = Math.sqrt(sumSquares / inputData.length);

        if (rms > 0.01) {
          isSpeaking = true;
          silenceFrames = 0;
        } else if (isSpeaking) {
          silenceFrames++;
          // ~1.5 seconds of silence at 16kHz with 4096 chunk size is ~6 frames
          if (silenceFrames > 6) {
            isSpeaking = false;
            // Flush to whisper and reset
            flushAudioToWhisper();
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setIsListening(true);
    } catch (err) {
      isListeningRef.current = false;
      console.error('[STT] Failed to start microphone:', err);
    }
  }, [ensureWorker, flushAudioToWhisper]);

  const stopSTT = useCallback(() => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    setIsListening(false);

    if (processorRef.current && sourceRef.current && audioContextRef.current) {
      processorRef.current.disconnect();
      sourceRef.current.disconnect();
      // Properly close context to free hardware resources
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
      processorRef.current = null;
      sourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    flushAudioToWhisper();
  }, [flushAudioToWhisper]);

  return { isListening, isModelLoading, startSTT, stopSTT };
}
