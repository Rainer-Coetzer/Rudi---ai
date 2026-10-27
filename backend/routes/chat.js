import express from 'express';
import { Ollama } from 'ollama';
import { getOptimalParams, estimateVRAM_GB } from '../resourceManager.js';
import { MODEL_CONFIG, listInstalledModels, supportsTools, markNoToolSupport } from '../modelConfig.js';
import { getRelevantContext } from '../knowledgeStore.js';
import { getClaudeMode, streamClaudeChat, claudeModel } from '../claudeProvider.js';
import { streamClaudeCliChat } from '../claudeCliProvider.js';
import { buildBasePrompt } from '../prompt.js';
import { toOllamaTools } from '../tools.js';
import {
  createEmitter, toOllamaMessages, toTextProtocolMessages,
  pipeOllamaStream, isToolsUnsupportedError,
} from '../chatProtocol.js';

/**
 * Kept so server.js can still call it, but the prompt now comes from prompt.js,
 * which picks the native-tools or text-protocol variant per request.
 */
export function setSystemPrompt() {}

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

/** The latest user-typed text, for model routing and knowledge lookup on tool-result follow-ups. */
function lastUserText(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === 'user') return String(history[i].content ?? '');
  }
  return '';
}

/**
 * @param {object} [deps] injectable for tests
 */
export function createChatRouter({
  ollamaClient = new Ollama({ host: 'http://127.0.0.1:11434' }),
  claude = { mode: getClaudeMode, stream: streamClaudeChat, streamCli: streamClaudeCliChat, model: claudeModel },
  getContext = getRelevantContext,
  estimateVRAM = estimateVRAM_GB,
} = {}) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const {
      message = '',
      history = [],
      attachments = [],
      autonomyLevel = 'assist',
      requestId,
      memories = [],
      projectContext = '',
      provider = 'ollama',
    } = req.body;
    const reqTag = requestId ? `[${requestId.slice(0, 8)}]` : `[${Date.now().toString(36)}]`;
    const emit = createEmitter(res);

    console.log(`\n[CHAT] ${reqTag} ── New Request (provider: ${provider}) ─────────────────────────────────`);
    console.log(`[CHAT] ${reqTag} Message: "${message}"`);

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();

    // Fires when the renderer aborts (or the socket drops) before we finish.
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });

    // `history` is everything before this request. `message` is the new user turn;
    // it is empty when the request only carries a tool result at the end of `history`.
    let refined = message;

    for (const attachment of attachments) {
      if (attachment.type === 'image') {
         refined = `[IMAGE: ${attachment.name}]\n(Image attached for vision analysis)\n\nSir, I've received an image: ${refined}`;
      } else if (attachment.type === 'file') {
         refined = `[FILE: ${attachment.name}]\n---\n${attachment.data}\n---\n\nSir, I've received a file: ${refined}`;
      }
    }

    const priorHistory = Array.isArray(history) ? history.slice(-15) : [];
    const chatMessages = refined.trim()
      ? [...priorHistory, { role: 'user', content: refined }]
      : priorHistory;
    const topic = message.trim() || lastUserText(priorHistory);

    const knowledgeContext = await getContext(topic);
    const memoryContext = memories.length > 0
      ? `\n\n[LONG-TERM MEMORIES & LESSONS]:\n${memories.join('\n')}`
      : '';

    const modeInstructions = {
      observe:    '\n\nMODE: OBSERVE — Suggest actions only. No executions.',
      assist:     '\n\nMODE: ASSIST — Execute safe tasks automatically. Confirm dangerous ones.',
      autonomous: '\n\nMODE: AUTONOMOUS — Full authority. Work until goal achieved.',
    }[autonomyLevel] || '';

    const systemFor = (toolMode) =>
      buildBasePrompt(toolMode) + modeInstructions + knowledgeContext + memoryContext + "\n\n" + projectContext;

    try {
      const claudeMode = provider === 'claude' ? await claude.mode() : null;

      if (claudeMode === 'api') {
        console.log(`[CHAT] ${reqTag} Routing to Claude API (native tools)`);
        emit({ type: 'start', toolMode: 'native', provider: 'claude', model: claude.model('api'), claudeMode });
        await claude.stream({ system: systemFor('native'), messages: chatMessages, emit });
      } else if (claudeMode === 'subscription') {
        // Claude Code CLI with its own tools off; Rudi's tools use the text protocol.
        console.log(`[CHAT] ${reqTag} Routing to Claude CLI (subscription, text tools)`);
        emit({ type: 'start', toolMode: 'text', provider: 'claude', model: claude.model('subscription'), claudeMode });
        await claude.streamCli({ system: systemFor('text'), messages: chatMessages, emit, signal: abort.signal });
      } else {
        const models = await listInstalledModels(ollamaClient);
        const selectedModel = selectModel(topic, models);
        const vramGB = await estimateVRAM();

        const startOllama = (toolMode) => ollamaClient.chat({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemFor(toolMode) },
            ...(toolMode === 'native' ? toOllamaMessages(chatMessages) : toTextProtocolMessages(chatMessages)),
          ],
          ...(toolMode === 'native' ? { tools: toOllamaTools() } : {}),
          stream: true,
          options: getOptimalParams(0, vramGB),
          keep_alive: '10m',
        });

        let toolMode = await supportsTools(ollamaClient, selectedModel) ? 'native' : 'text';
        let stream;
        try {
          stream = await startOllama(toolMode);
        } catch (err) {
          if (toolMode !== 'native' || !isToolsUnsupportedError(err)) throw err;
          console.warn(`[CHAT] ${reqTag} ${selectedModel} rejected tools — retrying with text protocol`);
          markNoToolSupport(selectedModel);
          toolMode = 'text';
          stream = await startOllama(toolMode);
        }

        console.log(`[CHAT] ${reqTag} Routing to Ollama → ${selectedModel} (${toolMode} tools)`);
        emit({ type: 'start', toolMode, provider: 'ollama', model: selectedModel });
        await pipeOllamaStream(stream, emit);
      }

      console.log(`[CHAT] ${reqTag} ✓ Complete`);
    } catch (err) {
      console.error(`[CHAT] ${reqTag} Fatal error: ${err.message}`);
      emit({ type: 'error', message: 'I apologize, Sir. My neural engines encountered a fatal error. Please try again.' });
    }

    emit({ type: 'done' });
    res.end();
  });

  return router;
}

export default createChatRouter();
