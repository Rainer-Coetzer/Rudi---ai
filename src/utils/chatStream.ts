/**
 * Wire types for /api/chat (see backend/chatProtocol.js).
 *
 * The backend answers with NDJSON: one event per line. In "native" tool mode tool
 * calls arrive as `tool_call` events; in "text" mode (models without tool calling)
 * they are JSON inside the text and are pulled out with splitToolCalls.
 */

export type ToolMode = 'native' | 'text';

export type ChatStreamEvent =
  | { type: 'start'; toolMode: ToolMode; provider?: string; model?: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; params: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface HistoryToolCall {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

/** Provider-neutral conversation history sent with each request. */
export type HistoryEntry =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: HistoryToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function toEvent(value: unknown): ChatStreamEvent | null {
  if (!isObject(value)) return null;
  switch (value.type) {
    case 'start':
      return value.toolMode === 'native' || value.toolMode === 'text'
        ? { type: 'start', toolMode: value.toolMode, provider: value.provider as string, model: value.model as string }
        : null;
    case 'text':
      return typeof value.delta === 'string' ? { type: 'text', delta: value.delta } : null;
    case 'tool_call':
      return typeof value.name === 'string' && value.name
        ? {
            type: 'tool_call',
            id: typeof value.id === 'string' && value.id ? value.id : `call_${Date.now().toString(36)}`,
            name: value.name,
            params: isObject(value.params) ? value.params : {},
          }
        : null;
    case 'error':
      return typeof value.message === 'string' ? { type: 'error', message: value.message } : null;
    case 'done':
      return { type: 'done' };
    default:
      return null;
  }
}

/** Incremental NDJSON parser: feed it decoded chunks, get back the complete events. */
export function createChatStreamParser() {
  let pending = '';

  const parseLines = (lines: string[]) => {
    const events: ChatStreamEvent[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = toEvent(JSON.parse(line));
        if (event) events.push(event);
      } catch {
        console.warn('[CHAT] Skipping malformed stream line:', line.slice(0, 120));
      }
    }
    return events;
  };

  return {
    push(chunk: string): ChatStreamEvent[] {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      return parseLines(lines);
    },
    /** Parses whatever is left once the stream has ended. */
    flush(): ChatStreamEvent[] {
      const rest = pending;
      pending = '';
      return parseLines([rest]);
    },
  };
}
