import { pipeline, env } from '@xenova/transformers';

// Configure transformers to not look for local model files but rather HuggingFace (cached)
env.allowLocalModels = false;

class WhisperPipeline {
  static task = 'automatic-speech-recognition';
  static model = 'Xenova/whisper-tiny.en';
  static instance: any = null;

  static async getInstance(progress_callback?: Function) {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, { 
        progress_callback,
        quantized: true // Use INT8 for much faster inference
      });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  if (event.data.type === 'load') {
    self.postMessage({ status: 'loading' });
    try {
      await WhisperPipeline.getInstance((progress: any) => {
        self.postMessage({ status: 'progress', data: progress });
      });
      self.postMessage({ status: 'ready' });
    } catch (e: any) {
      self.postMessage({ status: 'error', error: e.message });
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
    } catch (e: any) {
      self.postMessage({ status: 'error', error: e.message });
    }
  }
});
