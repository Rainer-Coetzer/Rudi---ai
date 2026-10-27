/**
 * chatProtocol.js — the /api/chat wire format and conversation-history conversion.
 *
 * Response: NDJSON (application/x-ndjson), one event per line:
 *   {"type":"start","toolMode":"native"|"text","provider":"ollama"|"claude","model":"..."}
 *   {"type":"text","delta":"..."}
 *   {"type":"tool_call","id":"...","name":"...","params":{...}}
 *   {"type":"error","message":"..."}
 *   {"type":"done"}
 * In "text" mode tool calls arrive as JSON inside text deltas (the legacy protocol)
 * and the renderer extracts them with splitToolCalls. A later "start" replaces an
 * earlier one (sent when Ollama rejects tools and the request is retried as text).
 *
 * Request history is provider-neutral:
 *   { role: 'user', content }
 *   { role: 'assistant', content, toolCalls?: [{ id, name, params }] }
 *   { role: 'tool', toolCallId, name, content, isError? }
 */

import crypto from 'node:crypto';

export function newToolCallId() {
  return `call_${crypto.randomBytes(9).toString('base64url').replace(/-/g, '_')}`;
}

/** Writes NDJSON events to an Express response (or anything with write()). */
export function createEmitter(res) {
  return (event) => res.write(JSON.stringify(event) + '\n');
}

const NOT_EXECUTED = 'Tool was not executed.';

function cleanToolCalls(calls) {
  if (!Array.isArray(calls)) return [];
  return calls
    .filter(c => c && typeof c.name === 'string' && c.name)
    .map(c => ({
      id: typeof c.id === 'string' && c.id ? c.id : newToolCallId(),
      name: c.name,
      params: c.params && typeof c.params === 'object' && !Array.isArray(c.params) ? c.params : {},
    }));
}

/**
 * Repairs a history so either provider accepts it: drops malformed entries and
 * tool results with no matching call, adds a "not executed" result for every
 * call that never got one (Claude rejects an unanswered tool_use), and drops
 * anything before the first user message (history is sliced by length).
 */
export function normalizeHistory(history) {
  const out = [];
  let open = [];  // tool calls of the latest assistant turn still waiting for a result

  const closeOpen = () => {
    for (const call of open) {
      out.push({ role: 'tool', toolCallId: call.id, name: call.name, content: NOT_EXECUTED, isError: true });
    }
    open = [];
  };

  for (const m of Array.isArray(history) ? history : []) {
    if (!m || typeof m !== 'object') continue;

    if (m.role === 'tool') {
      const idx = open.findIndex(c => c.id === m.toolCallId);
      if (idx === -1) continue;
      const [call] = open.splice(idx, 1);
      out.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: String(m.content ?? ''),
        isError: m.isError === true,
      });
      continue;
    }

    if (m.role !== 'user' && m.role !== 'assistant') continue;
    closeOpen();

    if (m.role === 'user') {
      out.push({ role: 'user', content: String(m.content ?? '') });
    } else {
      const toolCalls = cleanToolCalls(m.toolCalls);
      out.push({ role: 'assistant', content: String(m.content ?? ''), ...(toolCalls.length ? { toolCalls } : {}) });
      open = [...toolCalls];
    }
  }
  closeOpen();

  const firstUser = out.findIndex(m => m.role === 'user');
  return firstUser === -1 ? [] : out.slice(firstUser);
}

/** Legacy text protocol: tool calls as JSON blocks, results as [TOOL RESULT] user turns. */
export function toTextProtocolMessages(history) {
  return normalizeHistory(history).map(m => {
    if (m.role === 'tool') {
      const body = m.isError ? `ERROR: ${m.content}` : m.content;
      return { role: 'user', content: `[TOOL RESULT: ${m.name}]\n${body}` };
    }
    if (m.role === 'assistant' && m.toolCalls) {
      const blocks = m.toolCalls.map(c =>
        '```json\n' + JSON.stringify({ tool: c.name, params: c.params }) + '\n```');
      return { role: 'assistant', content: [m.content, ...blocks].filter(Boolean).join('\n\n') };
    }
    return { role: m.role, content: m.content };
  });
}

/** Ollama chat messages with native tool_calls / role "tool" results. */
export function toOllamaMessages(history) {
  return normalizeHistory(history).map(m => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_name: m.name, content: m.isError ? `ERROR: ${m.content}` : m.content };
    }
    if (m.role === 'assistant' && m.toolCalls) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map(c => ({ function: { name: c.name, arguments: c.params } })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

/** Claude tool_use ids must match ^[a-zA-Z0-9_-]+$. */
const claudeId = (id) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

/**
 * Anthropic messages: tool_use blocks on assistant turns, tool_result blocks on
 * the following user turn. Consecutive same-role turns are merged so tool results
 * and a new user message share one user turn.
 */
export function toClaudeMessages(history) {
  const out = [];
  const push = (role, blocks) => {
    if (blocks.length === 0) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };

  for (const m of normalizeHistory(history)) {
    if (m.role === 'tool') {
      push('user', [{
        type: 'tool_result',
        tool_use_id: claudeId(m.toolCallId),
        content: m.content || '(no output)',
        ...(m.isError ? { is_error: true } : {}),
      }]);
    } else if (m.role === 'assistant') {
      const blocks = m.content.trim() ? [{ type: 'text', text: m.content }] : [];
      for (const c of m.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: claudeId(c.id), name: c.name, input: c.params });
      }
      push('assistant', blocks);
    } else if (m.content.trim()) {
      push('user', [{ type: 'text', text: m.content }]);
    }
  }
  return out;
}

function parseArguments(args) {
  if (args && typeof args === 'object' && !Array.isArray(args)) return args;
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  return {};
}

/** Drains an Ollama chat stream into NDJSON events. */
export async function pipeOllamaStream(stream, emit) {
  for await (const chunk of stream) {
    const content = chunk.message?.content || '';
    if (content) emit({ type: 'text', delta: content });
    for (const call of chunk.message?.tool_calls ?? []) {
      const name = call.function?.name;
      if (!name) continue;
      emit({ type: 'tool_call', id: newToolCallId(), name, params: parseArguments(call.function.arguments) });
    }
  }
}

export function isToolsUnsupportedError(err) {
  return /does not support tools/i.test(err?.message || '');
}
