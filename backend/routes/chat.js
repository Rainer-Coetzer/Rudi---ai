import express from 'express';
import { Ollama } from 'ollama';
import { getOptimalParams, estimateVRAM_GB } from '../resourceManager.js';
import { MODEL_CONFIG, listInstalledModels } from '../modelConfig.js';
import { getRelevantContext } from '../knowledgeStore.js';
import { isClaudeAvailable, streamClaudeChat } from '../claudeProvider.js';

const router = express.Router();
const ollamaClient = new Ollama({ host: 'http://127.0.0.1:11434' });

let SYSTEM_PROMPT = '';

export function setSystemPrompt(prompt) {
  SYSTEM_PROMPT = prompt;
}

const CODING_PATTERN         = /code|function|class|component|refactor|implement|fix\s+bug|api/i;
const REASONING_HEAVY_PATTERN = /algorithm|architect|complexity|big.?o|prove|step.by.step|trade.?off/i;
const REASONING_PATTERN       = /analyze|analyse|why|explain|reason|compare|evaluate|debug/i;

function selectModel(message, installed) {
  const roles = REASONING_HEAVY_PATTERN.test(message) ? ['reasoningHeavy', 'reasoning', 'general']
              : REASONING_PATTERN.test(message)        ? ['reasoning', 'general']
              : CODING_PATTERN.test(message)           ? ['coding', 'general']
              : ['general'];

  for (const role of roles) {
    const candidate = MODEL_CONFIG[role];
    if (candidate && installed.includes(candidate)) return candidate;
  }
  return installed[0] || MODEL_CONFIG.general;
}

router.post('/', async (req, res) => {
  const {
    message,
    history = [],
    attachments = [],
    autonomyLevel = 'assist',
    requestId,
    memories = [],
    projectContext = '',
    provider = 'ollama',
  } = req.body;
  const reqTag = requestId ? `[${requestId.slice(0, 8)}]` : `[${Date.now().toString(36)}]`;

  console.log(`\n[CHAT] ${reqTag} ── New Request (provider: ${provider}) ─────────────────────────────────`);
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

  // Build system content and chat messages separately so either provider can use them.
  const systemContent = SYSTEM_PROMPT + modeInstructions + knowledgeContext + memoryContext + "\n\n" + projectContext;
  const chatMessages = [
    ...history.slice(-15),
    { role: 'user', content: refined },
  ];

  try {
    if (provider === 'claude' && isClaudeAvailable()) {
      console.log(`[CHAT] ${reqTag} Routing to Claude API`);
      await streamClaudeChat({ system: systemContent, messages: chatMessages, res });
    } else {
      // Ollama path — merge system prompt as first message (Ollama convention).
      const ollamaMessages = [
        { role: 'system', content: systemContent },
        ...chatMessages,
      ];

      const models = await listInstalledModels(ollamaClient);
      const selectedModel = selectModel(message, models);

      console.log(`[CHAT] ${reqTag} Routing to Ollama → ${selectedModel}`);

      const vramGB = await estimateVRAM_GB();
      const stream = await ollamaClient.chat({
        model: selectedModel,
        messages: ollamaMessages,
        stream: true,
        options: getOptimalParams(0, vramGB),
        keep_alive: '10m',
      });

      for await (const chunk of stream) {
        const content = chunk.message?.content || '';
        if (content) res.write(content);
      }
    }

    console.log(`[CHAT] ${reqTag} ✓ Complete`);
  } catch (err) {
    console.error(`[CHAT] ${reqTag} Fatal error: ${err.message}`);
    res.write('I apologize, Sir. My neural engines encountered a fatal error. Please try again.');
  }

  res.end();
});

export default router;
