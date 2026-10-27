import express from 'express';
import { UniversalEdgeTTS, listVoicesUniversal } from 'edge-tts-universal';

const router = express.Router();

// Rudi speaks English with a German accent: Microsoft's multilingual German voices
// read English text with native German pronunciation habits.
// Override with RUDI_TTS_VOICE (any Edge neural voice short name, see GET /api/voices).
const TTS_VOICE = process.env.RUDI_TTS_VOICE || 'de-DE-FlorianMultilingualNeural';
const TTS_FALLBACK_VOICE = process.env.RUDI_TTS_FALLBACK_VOICE || 'en-GB-RyanNeural';
// Slightly slower and lower than default for a calmer, butler-like delivery.
const TTS_PROSODY = {
  rate: process.env.RUDI_TTS_RATE || '-5%',
  pitch: process.env.RUDI_TTS_PITCH || '-2Hz',
};

async function synthesize(text, voice) {
  const result = await new UniversalEdgeTTS(text, voice, TTS_PROSODY).synthesize();
  return Buffer.from(await result.audio.arrayBuffer());
}

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
    const audio = await synthesize(cleanText, TTS_VOICE);
    console.log(`[TTS] ${TTS_VOICE} synthesis complete in ${Date.now() - start}ms`);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.end(audio);
  } catch (err) {
    console.warn(`[TTS] Primary voice failed: ${err.message}. Trying fallback…`);
    try {
      const audio = await synthesize(cleanText, TTS_FALLBACK_VOICE);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.end(audio);
    } catch (err2) {
      console.error(`[TTS] All voices failed: ${err2.message}`);
      res.status(503).json({ error: 'TTS synthesis failed.' });
    }
  }
});

/**
 * GET /api/voices
 * Return voices that can read English: en-* plus the multilingual ones (e.g. German-accented).
 */
router.get('/voices', async (req, res) => {
  try {
    const voices = await listVoicesUniversal();
    const usable = voices
      .filter(v => v.Locale?.startsWith('en-') || v.ShortName?.includes('Multilingual'))
      .map(v => v.ShortName);
    res.json({ voices: usable, current: TTS_VOICE });
  } catch {
    res.json({ voices: ['de-DE-FlorianMultilingualNeural', 'de-DE-SeraphinaMultilingualNeural', 'en-GB-RyanNeural'], current: TTS_VOICE });
  }
});

export default router;
