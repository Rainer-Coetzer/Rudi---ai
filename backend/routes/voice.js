import express from 'express';
import { UniversalEdgeTTS, listVoicesUniversal } from 'edge-tts-universal';

const router = express.Router();

const TTS_VOICE = 'en-GB-RyanNeural';
const TTS_FALLBACK_VOICE = 'en-GB-SoniaNeural';

/**
 * Filter text for speech by stripping out goals, steps, tools, and JSON.
 */
function filterForSpeech(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (t.startsWith('[GOAL]') || t.startsWith('[STEP]') || t.startsWith('[TOOL]')) return false;
      if (t.startsWith('{') || t.startsWith('[{')) return false;
      if (/^\[\w+\]/.test(t)) return false;
      return true;
    })
    .join(' ')
    .trim();
}

/**
 * POST /api/tts
 * Synthesize text to speech using Edge Neural TTS.
 */
router.post('/tts', async (req, res) => {
  const { text } = req.body;
  const cleanText = filterForSpeech(text);
  
  if (!cleanText) {
    return res.status(400).json({ error: 'No speakable text provided.' });
  }

  console.log(`[TTS] Synthesizing: "${cleanText.slice(0, 80)}…"`);

  try {
    const start = Date.now();
    const tts = new UniversalEdgeTTS(cleanText, TTS_VOICE);
    const result = await tts.synthesize();
    const duration = Date.now() - start;
    console.log(`[TTS] Primary synthesis complete in ${duration}ms`);
    
    res.setHeader('Content-Type', 'audio/mpeg');
    const arrayBuffer = await result.audio.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    console.warn(`[TTS] Primary voice failed: ${err.message}. Trying fallback…`);
    try {
      const ttsFallback = new UniversalEdgeTTS(cleanText, TTS_FALLBACK_VOICE);
      const result = await ttsFallback.synthesize();
      res.setHeader('Content-Type', 'audio/mpeg');
      const arrayBuffer = await result.audio.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } catch (err2) {
      console.error(`[TTS] All voices failed: ${err2.message}`);
      res.status(503).json({ error: 'TTS synthesis failed.' });
    }
  }
});

/**
 * GET /api/voices
 * Return list of available English voices.
 */
router.get('/voices', async (req, res) => {
  try {
    const voices = await listVoicesUniversal();
    const english = voices.filter(v => v.Locale?.startsWith('en-')).map(v => v.ShortName);
    res.json({ voices: english, current: TTS_VOICE });
  } catch {
    res.json({ voices: ['en-US-GuyNeural', 'en-US-AriaNeural', 'en-GB-RyanNeural'], current: TTS_VOICE });
  }
});

export default router;
