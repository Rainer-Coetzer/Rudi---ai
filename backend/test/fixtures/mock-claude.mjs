// Stand-in for the `claude` CLI. Behaviour is picked with MOCK_CLAUDE_SCENARIO;
// each run appends what it received to MOCK_CLAUDE_LOG.
import fs from 'node:fs';

const args = process.argv.slice(2);
const scenario = process.env.MOCK_CLAUDE_SCENARIO || 'ok';
const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

if (args[0] === 'auth' && args[1] === 'status') {
  out(scenario === 'api-key'
    ? { loggedIn: true, authMethod: 'api_key' }
    : { loggedIn: scenario !== 'logged-out', authMethod: 'claude.ai', subscriptionType: 'pro' });
  process.exit(scenario === 'logged-out' ? 1 : 0);
}

let stdin = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (c) => { stdin += c; });
process.stdin.on('end', () => {
  const flag = (name) => args[args.indexOf(name) + 1];
  fs.appendFileSync(process.env.MOCK_CLAUDE_LOG, JSON.stringify({
    pid: process.pid,
    args,
    cwd: process.cwd(),
    cwdEntries: fs.readdirSync(process.cwd()),
    system: fs.readFileSync(flag('--system-prompt-file'), 'utf-8'),
    stdin,
    leakedEnv: ['ANTHROPIC_BASE_URL', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'].filter(k => k in process.env),
  }) + '\n');

  out({ type: 'system', subtype: 'init', tools: [], model: 'claude-sonnet-mock' });

  if (scenario === 'hang') {
    setInterval(() => {}, 1000);
    return;
  }
  if (scenario === 'auth-fail') {
    out({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: 'Failed to authenticate.' }] } });
    out({ type: 'result', subtype: 'success', is_error: true, api_error_status: 401,
      result: 'Failed to authenticate. API Error: 401 OAuth access token is invalid.' });
    process.exit(1);
  }
  if (scenario === 'no-partials') {
    out({ type: 'assistant', message: { model: 'claude-sonnet-mock', content: [{ type: 'text', text: 'Whole reply, Sir.' }] } });
    out({ type: 'result', subtype: 'success', is_error: false, result: 'Whole reply, Sir.' });
    return;
  }

  const delta = (text) => out({
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  });
  out({ type: 'stream_event', event: { type: 'message_start', message: {} } });
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } });
  delta('Checking, Sir.\n```json\n{"tool":"git_status",');
  delta('"params":{}}\n```');
  out({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } });
  out({ type: 'assistant', message: { model: 'claude-sonnet-mock', content: [{ type: 'text', text: 'Checking, Sir.\n```json\n{"tool":"git_status","params":{}}\n```' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, result: 'Checking, Sir.' });
});
