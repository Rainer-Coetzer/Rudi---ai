/**
 * claudeProvider.js — optional Claude API streaming path.
 *
 * Used when the user selects the "Claude" provider in the UI and
 * ANTHROPIC_API_KEY is set in backend/.env.
 *
 * Preserves the same streaming contract as the Ollama path: raw text chunks
 * written to res.write(), with embedded ```json tool blocks. This means the
 * renderer parser (useRudi.ts) needs no changes.
 *
 * Note: thinking is intentionally omitted so text deltas stream immediately
 * and the inline tool-JSON parser stays clean (thinking blocks would emit
 * non-text content that the parser isn't expecting).
 */

import Anthropic from '@anthropic-ai/sdk';

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function isClaudeAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * @param {{ system: string, messages: {role: string, content: string}[], res: import('express').Response }} opts
 */
export async function streamClaudeChat({ system, messages, res }) {
  const model = process.env.RUDI_CLAUDE_MODEL || 'claude-opus-4-8';

  // Claude requires the messages array to start with a user role and only
  // contain user/assistant turns (no system entries).
  const sanitized = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content) }));

  // Drop any leading assistant messages — Claude requires user first.
  while (sanitized.length > 0 && sanitized[0].role !== 'user') {
    sanitized.shift();
  }

  const stream = await getClient().messages.stream({
    model,
    max_tokens: 64000,
    system,
    messages: sanitized,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta?.type === 'text_delta'
    ) {
      const text = event.delta.text;
      if (text) res.write(text);
    }
  }
}
