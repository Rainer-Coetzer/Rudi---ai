import express from 'express';
import { Ollama } from 'ollama';
import { getOptimalParams, estimateVRAM_GB } from '../resourceManager.js';
import { MODEL_CONFIG, listInstalledModels } from '../modelConfig.js';
import { getRelevantContext } from '../knowledgeStore.js';

const router = express.Router();
const ollamaClient = new Ollama({ host: 'http://127.0.0.1:11434' });

// System prompt will be imported or passed in. 
// For now, we'll assume the persona is handled centrally.
let SYSTEM_PROMPT = ''; 

export function setSystemPrompt(prompt) {
  SYSTEM_PROMPT = prompt;
}

const HEAVY_TASK_PATTERNS = [
  /\b(refactor|rewrite|implement|architect|redesign)\b/i,
  /\b(generate\s+\w+\s+code|write\s+(a\s+)?function|create\s+(a\s+)?class)\b/i,
  /\b(debug|diagnose|traceback|stack\s+trace|core\s+dump)\b/i,
  /\b(analyse|analyze|review|audit|benchmark|profile)\b/i,
  /\b(algorithm|data\s+structure|complexity|big.?o)\b/i,
];

function needsHeavyModel(message) {
  return HEAVY_TASK_PATTERNS.some(p => p.test(message));
}

router.post('/', async (req, res) => {
  const { message, history = [], attachments = [], autonomyLevel = 'assist', requestId, memories = [] } = req.body;
  const reqTag = requestId ? `[${requestId.slice(0, 8)}]` : `[${Date.now().toString(36)}]`;

  console.log(`\n[CHAT] ${reqTag} ── New Request ─────────────────────────────────`);
  console.log(`[CHAT] ${reqTag} Message: "${message}"`);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.flushHeaders();

  let refined = message;

  for (const attachment of attachments) {
    if (attachment.type === 'image') {
       refined = `[IMAGE: ${attachment.name}]\n(Image attached for vision analysis)\n\nSir, I've received an image: ${refined}`;
    } else if (attachment.type === 'file') {
       refined = `[FILE: ${attachment.name}]\n---\n${attachment.data}\n---\n\nSir, I've received a file: ${refined}`;
    }
  }

  const knowledgeContext = await getRelevantContext(message);
  const memoryContext = memories.length > 0 
    ? `\n\n[LONG-TERM MEMORIES & LESSONS]:\n${memories.join('\n')}`
    : '';

  const modeInstructions = {
    observe:    '\n\nMODE: OBSERVE — Suggest actions only. No executions.',
    assist:     '\n\nMODE: ASSIST — Execute safe tasks automatically. Confirm dangerous ones.',
    autonomous: '\n\nMODE: AUTONOMOUS — Full authority. Work until goal achieved.',
  }[autonomyLevel] || '';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + modeInstructions + knowledgeContext + memoryContext },
    ...history.slice(-15),
    { role: 'user', content: refined },
  ];

  try {
    const models = await listInstalledModels(ollamaClient);
    const heavy = needsHeavyModel(message);
    const selectedModel = (heavy && models.includes(MODEL_CONFIG.primary)) ? MODEL_CONFIG.primary : (models.includes(MODEL_CONFIG.fallback) ? MODEL_CONFIG.fallback : models[0]);

    console.log(`[CHAT] ${reqTag} Selection: ${heavy ? 'Heavy' : 'Standard'} -> ${selectedModel}`);

    const vramGB = await estimateVRAM_GB();
    const stream = await ollamaClient.chat({
      model: selectedModel,
      messages,
      stream: true,
      options: getOptimalParams(0, vramGB),
      keep_alive: '10m',
    });

    for await (const chunk of stream) {
      const content = chunk.message?.content || '';
      if (content) res.write(content);
    }

    console.log(`[CHAT] ${reqTag} ✓ Complete`);
  } catch (err) {
    console.error(`[CHAT] ${reqTag} Fatal error: ${err.message}`);
    res.write('I apologize, Sir. My neural engines encountered a fatal error. Please try again.');
  }

  res.end();
});

export default router;
