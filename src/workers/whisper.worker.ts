import { pipeline, env } from '@xenova/transformers';

// Configure transformers to not look for local model files but rather HuggingFace (cached)
env.allowLocalModels = false;

type ProgressCallback = (progress: unknown) => void;
type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string }>;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

class WhisperPipeline {
  static model = 'Xenova/whisper-tiny.en';
  static instance: Promise<Transcriber> | null = null;

  static async getInstance(progress_callback?: ProgressCallback) {
    if (this.instance === null) {
      this.instance = pipeline('automatic-speech-recognition', this.model, {
        progress_callback,
        quantized: true // Use INT8 for much faster inference
      }) as unknown as Promise<Transcriber>;
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  if (event.data.type === 'load') {
    self.postMessage({ status: 'loading' });
    try {
      await WhisperPipeline.getInstance((progress) => {
        self.postMessage({ status: 'progress', data: progress });
      });
      self.postMessage({ status: 'ready' });
    } catch (e) {
      self.postMessage({ status: 'error', error: errorMessage(e) });
    }
  } else if (event.data.type === 'transcribe') {
    const pcmAudio = event.data.audio;
    try {
      const transcriber = await WhisperPipeline.getInstance();
      self.postMessage({ status: 'transcribing' });
      const result = await transcriber(pcmAudio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: 'english',
        task: 'transcribe',
        return_timestamps: false
      });
      self.postMessage({ status: 'complete', text: result.text });
    } catch (e) {
      self.postMessage({ status: 'error', error: errorMessage(e) });
    }
  }
});
