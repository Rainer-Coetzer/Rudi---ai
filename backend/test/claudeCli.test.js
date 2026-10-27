// Run with: node backend/test/claudeCli.test.js
// Exercises the Claude subscription path against a mock `claude` CLI (fixtures/mock-claude.mjs).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createChatRouter } from '../routes/chat.js';
import { streamClaudeCliChat, isCliLoggedIn, createCliEventMapper } from '../claudeCliProvider.js';

const MOCK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mock-claude.mjs');
const cli = { command: process.execPath, prefixArgs: [MOCK] };
const LOG = path.join(os.tmpdir(), `rudi-mock-claude-${process.pid}.log`);

const readLog = () => fs.readFileSync(LOG, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));

beforeEach(() => {
  fs.rmSync(LOG, { force: true });
  process.env.MOCK_CLAUDE_LOG = LOG;
  process.env.MOCK_CLAUDE_SCENARIO = 'ok';
  // Simulate Rudi being launched from a Claude Code session.
  process.env.CLAUDECODE = '1';
  process.env.CLAUDE_CODE_ENTRYPOINT = 'cli';
  process.env.ANTHROPIC_BASE_URL = 'http://example.invalid';
});

function subscriptionDeps() {
  return {
    ollamaClient: { list: async () => ({ models: [] }) },
    getContext: async () => '',
    estimateVRAM: async () => 0,
    claude: {
      mode: async () => 'subscription',
      model: () => 'sonnet',
      stream: async () => { throw new Error('API path must not be used'); },
      streamCli: (opts) => streamClaudeCliChat({ ...opts, cli }),
    },
  };
}

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', createChatRouter(subscriptionDeps()));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/api/chat`);
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

async function postChat(body) {
  return withServer(async (url) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'claude', ...body }),
    });
    return (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  });
}

test('subscription: streams CLI text deltas in text tool mode', async () => {
  const events = await postChat({
    message: 'what changed?',
    history: [
      { role: 'user', content: 'list files' },
      { role: 'assistant', content: 'On it.', toolCalls: [{ id: 'text_1', name: 'list_dir', params: {} }] },
      { role: 'tool', toolCallId: 'text_1', name: 'list_dir', content: 'README.md' },
    ],
  });

  assert.deepEqual(events, [
    { type: 'start', toolMode: 'text', provider: 'claude', model: 'sonnet', claudeMode: 'subscription' },
    { type: 'text', delta: 'Checking, Sir.\n```json\n{"tool":"git_status",' },
    { type: 'text', delta: '"params":{}}\n```' },
    { type: 'done' },
  ]);

  const [run] = readLog();
  // Claude Code's own tools are off; no user settings, MCP or session files.
  for (const flag of ['-p', '--verbose', '--include-partial-messages', '--strict-mcp-config', '--no-session-persistence']) {
    assert.ok(run.args.includes(flag), flag);
  }
  assert.equal(run.args[run.args.indexOf('--tools') + 1], '');
  assert.equal(run.args[run.args.indexOf('--setting-sources') + 1], 'project');
  assert.equal(run.args[run.args.indexOf('--output-format') + 1], 'stream-json');
  assert.equal(run.args[run.args.indexOf('--model') + 1], 'sonnet');
  assert.ok(!run.args.includes('--bare'));
  assert.deepEqual(run.leakedEnv, []);

  // Runs in an empty temp dir holding only the system prompt, removed afterwards.
  assert.deepEqual(run.cwdEntries, ['system-prompt.txt']);
  assert.ok(run.cwd.includes('rudi-claude-'));
  assert.equal(fs.existsSync(run.cwd), false);

  // Text-protocol prompt in the file, transcript on stdin.
  assert.match(run.system, /AVAILABLE TOOLS:/);
  assert.match(run.system, /```json/);
  assert.match(run.stdin, /### Director\nlist files/);
  assert.match(run.stdin, /### Rudi\nOn it\.\n\n```json\n\{"tool":"list_dir","params":\{\}\}\n```/);
  assert.match(run.stdin, /### Director\n\[TOOL RESULT: list_dir\]\nREADME\.md/);
  assert.match(run.stdin, /### Director\nwhat changed\?$/);
});

test('subscription: expired sign-in becomes a readable error', async () => {
  process.env.MOCK_CLAUDE_SCENARIO = 'auth-fail';
  const events = await postChat({ message: 'hi' });
  assert.deepEqual(events.map(e => e.type), ['start', 'error', 'done']);
  assert.match(events[1].message, /sign-in expired.*\/login/);
});

test('subscription: missing CLI becomes an error event', async () => {
  const emitted = [];
  await streamClaudeCliChat({
    system: 's', messages: [{ role: 'user', content: 'hi' }], emit: e => emitted.push(e),
    cli: { command: path.join(os.tmpdir(), 'definitely-not-claude.exe'), prefixArgs: [] },
  });
  assert.equal(emitted.at(-1).type, 'error');
  assert.match(emitted.at(-1).message, /Could not start the Claude CLI/);
});

test('subscription: client abort kills the CLI process', async () => {
  process.env.MOCK_CLAUDE_SCENARIO = 'hang';
  await withServer(async (url) => {
    const controller = new AbortController();
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'claude', message: 'hi' }),
    });
    const reader = res.body.getReader();
    await reader.read();                       // the start event
    for (let i = 0; i < 100 && !fs.existsSync(LOG); i++) await new Promise(r => setTimeout(r, 50));
    const [{ pid }] = readLog();
    controller.abort();

    let alive = true;
    for (let i = 0; i < 100 && alive; i++) {
      await new Promise(r => setTimeout(r, 100));
      try { process.kill(pid, 0); } catch { alive = false; }
    }
    assert.equal(alive, false, 'mock claude should be killed');
  });
});

test('CLI without partial messages falls back to the assistant message', () => {
  const emitted = [];
  const mapper = createCliEventMapper(e => emitted.push(e));
  mapper.handle({ type: 'assistant', message: { model: 'm', content: [{ type: 'text', text: 'Whole reply, Sir.' }] } });
  mapper.handle({ type: 'result', is_error: false, result: 'Whole reply, Sir.' });
  assert.deepEqual(emitted, [{ type: 'text', delta: 'Whole reply, Sir.' }]);
});

test('auth status: only a claude.ai login counts', async () => {
  process.env.MOCK_CLAUDE_SCENARIO = 'ok';
  assert.equal(await isCliLoggedIn({ cli, force: true }), true);
  process.env.MOCK_CLAUDE_SCENARIO = 'api-key';
  assert.equal(await isCliLoggedIn({ cli, force: true }), false);
  process.env.MOCK_CLAUDE_SCENARIO = 'logged-out';
  assert.equal(await isCliLoggedIn({ cli, force: true }), false);
});
