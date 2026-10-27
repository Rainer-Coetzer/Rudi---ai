// Run with: node --test backend/test/
// Exercises /api/chat for both providers against mocked Ollama and Anthropic clients.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createChatRouter } from '../routes/chat.js';
import { streamClaudeChat } from '../claudeProvider.js';
import { toClaudeMessages, normalizeHistory } from '../chatProtocol.js';
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

function mockClaude(events) {
  const calls = [];
  return {
    calls,
    messages: { stream: (req) => { calls.push(req); return fromArray(events); } },
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

const noClaude = { isAvailable: () => false, stream: async () => {}, model: () => 'none' };

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

test('claude: native tool_use streams as tool_call and history becomes tool_use/tool_result', async () => {
  const client = mockClaude([
    { type: 'message_start', message: {} },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reading it, ' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Sir.' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_01', name: 'read_file', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"pa' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'th":"README.md"}' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
  const claude = {
    isAvailable: () => true,
    model: () => 'claude-test',
    stream: (opts) => streamClaudeChat({ ...opts, client }),
  };

  const events = await postChat({ ollamaClient: mockOllama({ model: 'x', chunks: [] }), claude }, {
    provider: 'claude',
    message: 'then read the readme',
    history: [
      { role: 'assistant', content: 'stale leading turn' },
      { role: 'user', content: 'list files' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_00', name: 'list_dir', params: {} }] },
      { role: 'tool', toolCallId: 'toolu_00', name: 'list_dir', content: 'README.md' },
      { role: 'assistant', content: 'Found it.' },
    ],
  });

  assert.deepEqual(events, [
    { type: 'start', toolMode: 'native', provider: 'claude', model: 'claude-test' },
    { type: 'text', delta: 'Reading it, ' },
    { type: 'text', delta: 'Sir.' },
    { type: 'tool_call', id: 'toolu_01', name: 'read_file', params: { path: 'README.md' } },
    { type: 'done' },
  ]);

  const req = client.calls[0];
  assert.ok(req.tools.some(t => t.name === 'read_file' && t.input_schema.type === 'object'));
  assert.deepEqual(req.tool_choice, { type: 'auto', disable_parallel_tool_use: true });
  assert.doesNotMatch(req.system, /```json/);
  assert.deepEqual(req.messages, [
    { role: 'user', content: [{ type: 'text', text: 'list files' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_00', name: 'list_dir', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_00', content: 'README.md' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Found it.' }] },
    { role: 'user', content: [{ type: 'text', text: 'then read the readme' }] },
  ]);
});

test('claude: unanswered tool calls get a result and merge with the next user turn', () => {
  const msgs = toClaudeMessages([
    { role: 'user', content: 'delete it' },
    { role: 'assistant', content: 'Deleting.', toolCalls: [{ id: 'call.x', name: 'delete_file', params: { path: 'a' } }] },
    { role: 'tool', toolCallId: 'nope', name: 'delete_file', content: 'orphan' },
    { role: 'user', content: 'actually, stop' },
  ]);
  assert.deepEqual(msgs, [
    { role: 'user', content: [{ type: 'text', text: 'delete it' }] },
    { role: 'assistant', content: [
      { type: 'text', text: 'Deleting.' },
      { type: 'tool_use', id: 'call_x', name: 'delete_file', input: { path: 'a' } },
    ] },
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'call_x', content: 'Tool was not executed.', is_error: true },
      { type: 'text', text: 'actually, stop' },
    ] },
  ]);
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
