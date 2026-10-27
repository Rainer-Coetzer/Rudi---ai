// Run with: node backend/test/chat.test.js
// Exercises /api/chat's Ollama path against a mocked Ollama client (Claude: see claudeCli.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createChatRouter } from '../routes/chat.js';
import { normalizeHistory } from '../chatProtocol.js';
import { TOOLS } from '../tools.js';

async function* fromArray(items) {
  for (const item of items) yield item;
}

function mockOllama({ model, capabilities, chunks, rejectTools = false }) {
  const calls = [];
  return {
    calls,
    list: async () => ({ models: [{ name: model }] }),
    show: async () => (capabilities ? { capabilities } : {}),
    chat: async (req) => {
      calls.push(req);
      if (rejectTools && req.tools) throw new Error(`registry.ollama.ai/library/${model} does not support tools`);
      return fromArray(chunks);
    },
  };
}

async function postChat(deps, body) {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', createChatRouter({
    getContext: async () => '',
    estimateVRAM: async () => 0,
    ...deps,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.match(res.headers.get('content-type'), /application\/x-ndjson/);
    const raw = await res.text();
    return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

const noClaude = { status: async () => ({ available: false, reason: 'x' }), stream: async () => {}, model: () => 'none' };

test('tool schemas are well-formed and unique', () => {
  const names = TOOLS.map(t => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of TOOLS) {
    assert.equal(t.parameters.type, 'object');
    for (const r of t.parameters.required) assert.ok(r in t.parameters.properties, `${t.name}.${r}`);
  }
});

test('ollama: tool-capable model gets tools and streams text + tool_call events', async () => {
  const ollama = mockOllama({
    model: 'llama3.2:1b',
    capabilities: ['completion', 'tools'],
    chunks: [
      { message: { content: '[STEP] Listing files.' } },
      { message: { content: '', tool_calls: [{ function: { name: 'list_dir', arguments: { path: 'src' } } }] } },
      { done: true, message: { content: '' } },
    ],
  });

  const events = await postChat({ ollamaClient: ollama, claude: noClaude }, { message: 'list my files', history: [] });

  assert.deepEqual(events[0], { type: 'start', toolMode: 'native', provider: 'ollama', model: 'llama3.2:1b' });
  assert.deepEqual(events[1], { type: 'text', delta: '[STEP] Listing files.' });
  assert.equal(events[2].type, 'tool_call');
  assert.equal(events[2].name, 'list_dir');
  assert.deepEqual(events[2].params, { path: 'src' });
  assert.match(events[2].id, /^call_[A-Za-z0-9_]+$/);
  assert.deepEqual(events.at(-1), { type: 'done' });

  const req = ollama.calls[0];
  assert.ok(req.tools.some(t => t.type === 'function' && t.function.name === 'list_dir'));
  assert.equal(req.messages[0].role, 'system');
  assert.doesNotMatch(req.messages[0].content, /```json/);
  assert.deepEqual(req.messages.at(-1), { role: 'user', content: 'list my files' });
});

test('ollama: tool result goes back as a role "tool" message', async () => {
  const ollama = mockOllama({
    model: 'qwen3:0.6b',
    capabilities: ['completion', 'tools'],
    chunks: [{ message: { content: 'Two entries, Sir.' } }],
  });

  const events = await postChat({ ollamaClient: ollama, claude: noClaude }, {
    message: '',
    history: [
      { role: 'user', content: 'list my files' },
      { role: 'assistant', content: '[STEP] Listing.', toolCalls: [{ id: 'call_1', name: 'list_dir', params: { path: 'src' } }] },
      { role: 'tool', toolCallId: 'call_1', name: 'list_dir', content: 'a.ts\nb.ts' },
    ],
  });

  assert.deepEqual(events.map(e => e.type), ['start', 'text', 'done']);
  const msgs = ollama.calls[0].messages.slice(1);
  assert.deepEqual(msgs, [
    { role: 'user', content: 'list my files' },
    { role: 'assistant', content: '[STEP] Listing.', tool_calls: [{ function: { name: 'list_dir', arguments: { path: 'src' } } }] },
    { role: 'tool', tool_name: 'list_dir', content: 'a.ts\nb.ts' },
  ]);
});

test('ollama: model without tools uses the text protocol', async () => {
  const ollama = mockOllama({
    model: 'deepseek-r1:1.5b',
    capabilities: ['completion'],
    chunks: [{ message: { content: '```json\n{"tool":"git_status","params":{}}\n```' } }],
  });

  const events = await postChat({ ollamaClient: ollama, claude: noClaude }, {
    message: 'and now?',
    history: [
      { role: 'user', content: 'list my files' },
      { role: 'assistant', content: 'On it.', toolCalls: [{ id: 'text-1', name: 'list_dir', params: {} }] },
      { role: 'tool', toolCallId: 'text-1', name: 'list_dir', content: 'boom', isError: true },
    ],
  });

  assert.equal(events[0].toolMode, 'text');
  assert.equal(events[1].type, 'text');
  const req = ollama.calls[0];
  assert.equal(req.tools, undefined);
  assert.match(req.messages[0].content, /```json/);
  assert.match(req.messages[0].content, /- list_dir\(path\)/);
  assert.deepEqual(req.messages.slice(1), [
    { role: 'user', content: 'list my files' },
    { role: 'assistant', content: 'On it.\n\n```json\n{"tool":"list_dir","params":{}}\n```' },
    { role: 'user', content: '[TOOL RESULT: list_dir]\nERROR: boom' },
    { role: 'user', content: 'and now?' },
  ]);
});

test('ollama: falls back to text when the model rejects tools', async () => {
  const ollama = mockOllama({
    model: 'llama3.1:8b',          // old Ollama: no capabilities, name says tools
    capabilities: null,
    rejectTools: true,
    chunks: [{ message: { content: 'Hello, Sir.' } }],
  });

  const events = await postChat({ ollamaClient: ollama, claude: noClaude }, { message: 'hi' });

  assert.equal(ollama.calls.length, 2);
  assert.ok(ollama.calls[0].tools);
  assert.equal(ollama.calls[1].tools, undefined);
  assert.deepEqual(events.map(e => e.type), ['start', 'text', 'done']);
  assert.equal(events[0].toolMode, 'text');
});

test('ollama: provider error becomes an error event', async () => {
  const ollama = mockOllama({ model: 'qwen2.5-coder:1.5b', capabilities: ['tools'], chunks: [] });
  ollama.chat = async () => { throw new Error('connection refused'); };

  const events = await postChat({ ollamaClient: ollama, claude: noClaude }, { message: 'hi' });
  assert.deepEqual(events.map(e => e.type), ['error', 'done']);
});

test('normalizeHistory keeps legacy {role, content} entries', () => {
  assert.deepEqual(normalizeHistory([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
    { role: 'system', content: 'ignored' },
  ]), [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ]);
});

test('normalizeHistory answers tool calls that never got a result', () => {
  assert.deepEqual(normalizeHistory([
    { role: 'user', content: 'delete it' },
    { role: 'assistant', content: 'Deleting.', toolCalls: [{ id: 'call_x', name: 'delete_file', params: { path: 'a' } }] },
    { role: 'tool', toolCallId: 'nope', name: 'delete_file', content: 'orphan' },
    { role: 'user', content: 'actually, stop' },
  ]), [
    { role: 'user', content: 'delete it' },
    { role: 'assistant', content: 'Deleting.', toolCalls: [{ id: 'call_x', name: 'delete_file', params: { path: 'a' } }] },
    { role: 'tool', toolCallId: 'call_x', name: 'delete_file', content: 'Tool was not executed.', isError: true },
    { role: 'user', content: 'actually, stop' },
  ]);
});
