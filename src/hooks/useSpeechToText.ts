import { useState, useCallback, useRef, useEffect } from 'react';

export function useSpeechToText(onTranscription: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const workerRef = useRef<Worker | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Collect 16kHz PCM data
  const audioDataRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    // Initialize WebWorker for local Whisper
    workerRef.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
    
    workerRef.current.onmessage = (event) => {
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
          if (cmd) {
            onTranscription(cmd);
          } else {
            onTranscription('[WAKE_WORD_ONLY]');
          }
        } else if (finalTranscript) {
          onTranscription(finalTranscript);
        }
      } else if (status === 'error') {
        console.error('[STT Worker Error]', error);
      }
    };

    // Load model
    workerRef.current.postMessage({ type: 'load' });

    return () => {
      workerRef.current?.terminate();
    };
  }, [onTranscription]);

  const startSTT = useCallback(async () => {
    if (isListening) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
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
        if (audioDataRef.current.length < 60) {
          audioDataRef.current.push(new Float32Array(inputData));
        } else {
          // Auto-flush if buffer is full to prevent memory creep
          flushAudioToWhisper();
          audioDataRef.current.push(new Float32Array(inputData));
        }

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
      console.error('[STT] Failed to start microphone:', err);
    }
  }, [isListening]);

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
        
        if (workerRef.current) {
          workerRef.current.postMessage({ type: 'transcribe', audio: combined });
        }
      }
      // Reset buffer immediately
      audioDataRef.current = [];
    }
  }, []);

  const stopSTT = useCallback(() => {
    if (!isListening) return;
    setIsListening(false);

    if (processorRef.current && sourceRef.current && audioContextRef.current) {
      processorRef.current.disconnect();
      sourceRef.current.disconnect();
      // Properly close context to free hardware resources
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    flushAudioToWhisper();
  }, [isListening, flushAudioToWhisper]);

  return { isListening, isModelLoading, startSTT, stopSTT };
}
