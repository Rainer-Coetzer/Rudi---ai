/**
 * Separates Rudi's tool-call JSON from the prose and code it streams alongside it.
 *
 * Only objects that look like the tool protocol ({ tool, params, message, requiresConfirmation })
 * are pulled out. Everything else, including code fences and any other braces, stays as text.
 */

import { safeParse } from './json';

export interface ToolCall {
  tool?: string;
  params?: Record<string, unknown>;
  message?: string;
  requiresConfirmation?: boolean;
}

export interface SplitResult {
  /** Text to show the user, with tool-call objects removed. */
  text: string;
  /** Tool-call objects, in stream order. */
  calls: ToolCall[];
}

const PROTOCOL_KEYS = new Set(['tool', 'params', 'message', 'requiresConfirmation']);
const FENCE = '```';

function asToolCall(value: unknown): ToolCall | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0 || !keys.every(k => PROTOCOL_KEYS.has(k))) return null;
  if (typeof obj.tool !== 'string' && typeof obj.message !== 'string') return null;
  return obj as ToolCall;
}

/** Index of the brace closing the object that opens at `start`, or -1 if the stream hasn't got there yet. */
function findObjectEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** An unfinished object that may still turn into a tool call — hide it until it completes. */
function mayBecomeToolCall(partial: string): boolean {
  return /^\{\s*(?:"[A-Za-z]*)?$/.test(partial)
    || /^\{\s*"(?:tool|params|message|requiresConfirmation)"/.test(partial);
}

/**
 * @param buffer everything streamed so far
 * @param final  true once the stream has ended; unfinished objects are then shown as text
 */
export function splitToolCalls(buffer: string, final: boolean): SplitResult {
  const calls: ToolCall[] = [];
  let text = '';
  let i = 0;

  while (i < buffer.length) {
    if (buffer.startsWith(FENCE, i)) {
      const close = buffer.indexOf(FENCE, i + FENCE.length);
      if (close === -1) {
        // Still streaming a fence. Hold back one that looks like a fenced tool call.
        const body = buffer.slice(i + FENCE.length).replace(/^[^\n{]*\n?/, '').trimStart();
        if (!final && (body === '' || (body.startsWith('{') && mayBecomeToolCall(body)))) break;
        text += buffer.slice(i);
        break;
      }
      // ```json\n{ ...tool call... }\n``` counts as a tool call; any other fence is content.
      const body = buffer.slice(i + FENCE.length, close).replace(/^[^\n{]*\n/, '').trim();
      const call = body.startsWith('{') ? asToolCall(safeParse(body)) : null;
      if (call) calls.push(call);
      else text += buffer.slice(i, close + FENCE.length);
      i = close + FENCE.length;
      continue;
    }

    if (buffer[i] === '{') {
      const end = findObjectEnd(buffer, i);
      if (end === -1) {
        if (!final && mayBecomeToolCall(buffer.slice(i))) break;
        text += buffer[i++];
        continue;
      }
      const candidate = buffer.slice(i, end + 1);
      const call = asToolCall(safeParse(candidate));
      if (call) calls.push(call);
      else text += candidate;
      i = end + 1;
      continue;
    }

    text += buffer[i++];
  }

  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), calls };
}
