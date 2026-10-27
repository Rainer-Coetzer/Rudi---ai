/**
 * claudeProvider.js — the "claude" provider, via the user's Claude Pro/Max subscription.
 *
 * The only supported way to use a subscription programmatically is the official
 * Claude Code CLI in headless mode, which signs in with the user's own `claude`
 * login. This module only spawns that binary; it never reads credential files.
 * There is no API-key path.
 *
 * Claude Code's own tools are disabled (--tools ""), so this path uses the
 * text tool protocol: the model writes JSON tool blocks, and the renderer
 * extracts them and runs them through the sidecar approval gate.
 *
 * Each request runs in an empty temp directory with only project settings, so
 * the user's CLAUDE.md files, hooks and plugins are not picked up.
 */

import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toTextProtocolMessages } from './chatProtocol.js';

// Set when Rudi is started from a Claude Code session; they break the child's auth.
const STRIPPED_ENV = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'];

const STATUS_TTL_OK_MS = 5 * 60_000;
const STATUS_TTL_FAIL_MS = 30_000;

export function claudeModel() {
  const model = process.env.RUDI_CLAUDE_MODEL || 'sonnet';
  return /^[\w.:-]+$/.test(model) ? model : 'sonnet';
}

function childEnv() {
  const env = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  return env;
}

/**
 * How to start the CLI. RUDI_CLAUDE_CLI overrides the path. On Windows a bare
 * name only finds claude.exe, so an npm-installed claude.cmd needs the shell.
 */
export function defaultCli() {
  const command = process.env.RUDI_CLAUDE_CLI || (process.platform === 'win32' ? findWindowsCli() : 'claude');
  return { command, prefixArgs: [], shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command) };
}

let windowsCli = null;

function findWindowsCli() {
  if (windowsCli) return windowsCli;
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const name of ['claude.exe', 'claude.cmd']) {
    const dir = dirs.find(d => existsSync(path.join(d, name)));
    if (dir) return (windowsCli = path.join(dir, name));
  }
  return 'claude';
}

const quoteForCmd = (arg) => `"${String(arg).replace(/"/g, '""')}"`;

function spawnCli(cli, args, options) {
  const allArgs = [...cli.prefixArgs, ...args];
  if (cli.shell) {
    // Every argument is built here (no user text), and quoting keeps paths with spaces intact.
    return spawn(quoteForCmd(cli.command), allArgs.map(quoteForCmd), { ...options, shell: true, windowsHide: true });
  }
  return spawn(cli.command, allArgs, { ...options, windowsHide: true });
}

const NOT_INSTALLED = 'Install Claude Code, then run `claude` and /login.';
const SIGNED_OUT = 'Run `claude` and /login.';
const NOT_SUBSCRIPTION = 'Claude Code is not signed in with a Claude subscription. Run `claude` and /login.';

let statusCache = { at: 0, available: false, reason: SIGNED_OUT };

/** Cached answer from the last `claude auth status`, for synchronous callers. */
export function isClaudeAvailable() {
  return statusCache.available;
}

/**
 * Whether the CLI is installed and signed in with a claude.ai subscription.
 * `reason` is a short hint for the UI when it is not.
 * @returns {Promise<{ available: boolean, reason: string | null }>}
 */
export async function getClaudeStatus({ cli = defaultCli(), force = false } = {}) {
  const ttl = statusCache.available ? STATUS_TTL_OK_MS : STATUS_TTL_FAIL_MS;
  if (!force && statusCache.at && Date.now() - statusCache.at < ttl) {
    return { available: statusCache.available, reason: statusCache.reason };
  }

  const status = await new Promise((resolve) => {
    const run = cli.shell
      ? (cb) => execFile(quoteForCmd(cli.command), [...cli.prefixArgs, 'auth', 'status'].map(quoteForCmd),
          { shell: true, env: childEnv(), timeout: 15_000, windowsHide: true }, cb)
      : (cb) => execFile(cli.command, [...cli.prefixArgs, 'auth', 'status'],
          { env: childEnv(), timeout: 15_000, windowsHide: true }, cb);
    run((error, stdout) => {
      // `auth status` exits non-zero when signed out but still prints JSON.
      try {
        const auth = JSON.parse(String(stdout).trim());
        if (auth.loggedIn !== true) resolve({ available: false, reason: SIGNED_OUT });
        else if (auth.authMethod !== 'claude.ai') resolve({ available: false, reason: NOT_SUBSCRIPTION });
        else resolve({ available: true, reason: null });
      } catch {
        if (error) console.warn(`[CLAUDE] auth status unavailable: ${error.message.split('\n')[0]}`);
        resolve({ available: false, reason: error?.code === 'ENOENT' ? NOT_INSTALLED : SIGNED_OUT });
      }
    });
  });

  statusCache = { at: Date.now(), ...status };
  return status;
}

/** Plain-text transcript for stdin; the CLI gets one prompt, not a message list. */
export function buildTranscript(messages) {
  const turns = toTextProtocolMessages(messages).map(m =>
    `### ${m.role === 'assistant' ? 'Rudi' : 'Director'}\n${m.content}`);
  return [
    'Conversation so far. Reply as Rudi to the last Director message only. Do not write a "### " heading.',
    '',
    turns.join('\n\n'),
  ].join('\n');
}

function friendlyError(result) {
  const text = String(result?.result || '');
  if (result?.api_error_status === 401 || /authenticat|oauth|log ?in/i.test(text)) {
    return 'Claude sign-in expired, Sir. Run `claude` in a terminal and use /login, then try again.';
  }
  return `Claude returned an error, Sir: ${text || 'unknown failure'}`;
}

function killTree(child) {
  if (child.exitCode !== null || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  } else {
    child.kill('SIGTERM');
  }
}

/** Turns CLI stream-json lines into NDJSON chat events. */
export function createCliEventMapper(emit) {
  let streamedText = false;
  let sawResult = false;

  return {
    get sawResult() { return sawResult; },
    handle(msg) {
      if (msg.type === 'stream_event') {
        const ev = msg.event;
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          streamedText = true;
          emit({ type: 'text', delta: ev.delta.text });
        }
      } else if (msg.type === 'assistant' && !streamedText) {
        // No partial messages (older CLI or flag ignored): use the whole message.
        if (msg.message?.model === '<synthetic>') return;  // error placeholder; the result line explains it
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'text' && block.text) emit({ type: 'text', delta: block.text });
        }
        streamedText = true;
      } else if (msg.type === 'result') {
        sawResult = true;
        if (msg.is_error) emit({ type: 'error', message: friendlyError(msg) });
        else if (!streamedText && msg.result) emit({ type: 'text', delta: msg.result });
      }
    },
  };
}

/**
 * @param {{
 *   system: string,
 *   messages: object[],          provider-neutral history (see chatProtocol.js)
 *   emit: (event: object) => void,
 *   signal?: AbortSignal,        aborts the child when the client goes away
 *   cli?: { command: string, prefixArgs: string[], shell?: boolean },
 * }} opts
 */
export async function streamClaudeChat({ system, messages, emit, signal, cli = defaultCli() }) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rudi-claude-'));
  const systemFile = path.join(workDir, 'system-prompt.txt');
  await fs.writeFile(systemFile, system, 'utf-8');

  try {
    await new Promise((resolve) => {
      const child = spawnCli(cli, [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--tools', '',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--setting-sources', 'project',
        '--system-prompt-file', systemFile,
        '--model', claudeModel(),
      ], { cwd: workDir, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });

      const mapper = createCliEventMapper(emit);
      let pending = '';
      let stderr = '';
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };

      const onAbort = () => { killTree(child); finish(); };
      if (signal?.aborted) onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });

      const handleLine = (line) => {
        if (!line.trim()) return;
        try {
          mapper.handle(JSON.parse(line));
        } catch {
          // Not JSON (e.g. a warning printed to stdout) — ignore.
        }
      };

      child.stdout.setEncoding('utf-8');
      child.stdout.on('data', (chunk) => {
        pending += chunk;
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        lines.forEach(handleLine);
      });
      child.stderr.setEncoding('utf-8');
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });

      let spawnFailed = false;
      child.on('error', (err) => {
        spawnFailed = true;
        emit({ type: 'error', message: `Could not start the Claude CLI, Sir: ${err.message}` });
        finish();
      });
      child.on('close', (code) => {
        handleLine(pending);
        signal?.removeEventListener('abort', onAbort);
        if (!mapper.sawResult && !signal?.aborted && !spawnFailed) {
          console.error(`[CLAUDE-CLI] exited ${code} without a result: ${stderr.trim()}`);
          emit({ type: 'error', message: 'The Claude CLI stopped unexpectedly, Sir. Check that `claude` works in a terminal.' });
        }
        finish();
      });

      child.stdin.on('error', () => {});  // child may exit before reading everything
      child.stdin.end(buildTranscript(messages), 'utf-8');
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
