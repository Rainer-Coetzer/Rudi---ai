/**
 * claudeProvider.js — optional Claude API streaming path.
 *
 * Used when the user selects the "Claude" provider in the UI and
 * ANTHROPIC_API_KEY is set in backend/.env. Without a key, a signed-in Claude
 * Code CLI is used instead (subscription mode, claudeCliProvider.js).
 *
 * Uses native tool use: the tool schemas from tools.js go in `tools`, and each
 * completed tool_use block is emitted as a {"type":"tool_call"} event (see
 * chatProtocol.js). Parallel tool use is disabled because the renderer runs one
 * tool per turn and sends its result back before the model continues.
 *
 * Note: thinking is intentionally omitted so text deltas stream immediately.
 */

import Anthropic from '@anthropic-ai/sdk';
import { toClaudeMessages } from './chatProtocol.js';
import { toClaudeTools } from './tools.js';
import { isCliLoggedIn, cliLoggedInCached, cliModel } from './claudeCliProvider.js';

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * 'api' when ANTHROPIC_API_KEY is set (SDK, native tools), else 'subscription'
 * when the Claude Code CLI is signed in with claude.ai (see claudeCliProvider.js),
 * else null.
 */
export async function getClaudeMode() {
  if (process.env.ANTHROPIC_API_KEY) return 'api';
  return (await isCliLoggedIn()) ? 'subscription' : null;
}

/** Synchronous check; the subscription half uses the last cached CLI status. */
export function isClaudeAvailable() {
  return !!process.env.ANTHROPIC_API_KEY || cliLoggedInCached();
}

export function claudeModel(mode = 'api') {
  return mode === 'subscription' ? cliModel() : process.env.RUDI_CLAUDE_MODEL || 'claude-opus-4-8';
}

/**
 * Turns Anthropic stream events into NDJSON events. Tool input arrives as
 * partial JSON across input_json_delta events; the call is emitted once its
 * content block stops.
 */
export async function pipeClaudeStream(stream, emit) {
  const toolBlocks = new Map();  // content block index → { id, name, json }

  for await (const event of stream) {
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const { id, name } = event.content_block;
      toolBlocks.set(event.index, { id, name, json: '' });
    } else if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta' && event.delta.text) {
        emit({ type: 'text', delta: event.delta.text });
      } else if (event.delta?.type === 'input_json_delta') {
        const block = toolBlocks.get(event.index);
        if (block) block.json += event.delta.partial_json || '';
      }
    } else if (event.type === 'content_block_stop' && toolBlocks.has(event.index)) {
      const block = toolBlocks.get(event.index);
      toolBlocks.delete(event.index);
      let params = {};
      try {
        params = block.json.trim() ? JSON.parse(block.json) : {};
      } catch {
        emit({ type: 'error', message: `Malformed input for tool ${block.name}.` });
        continue;
      }
      emit({ type: 'tool_call', id: block.id, name: block.name, params });
    }
  }
}

/**
 * @param {{
 *   system: string,
 *   messages: object[],          provider-neutral history (see chatProtocol.js)
 *   emit: (event: object) => void,
 *   client?: { messages: { stream: Function } },
 * }} opts
 */
export async function streamClaudeChat({ system, messages, emit, client = getClient() }) {
  const stream = await client.messages.stream({
    model: claudeModel(),
    max_tokens: 64000,
    system,
    messages: toClaudeMessages(messages),
    tools: toClaudeTools(),
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
  });

  await pipeClaudeStream(stream, emit);
}
