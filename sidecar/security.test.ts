import { describe, expect, it } from 'vitest';
import { privilegedValidateTool } from './security';
import { validateTool } from '../src/utils/safety';
import { TOOL_WHITELIST } from '../src/shared/toolRules';

describe('privilegedValidateTool', () => {
  it('allows a whitelisted tool with ordinary params', () => {
    expect(privilegedValidateTool('read_file', { path: 'src/index.ts' })).toEqual({ valid: true });
    expect(privilegedValidateTool('list_tasks', undefined)).toEqual({ valid: true });
  });

  it('blocks tools outside the whitelist', () => {
    const r = privilegedValidateTool('format_disk', {});
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/not in the privileged whitelist/);
  });

  it.each([
    'rm -rf /',
    'RM -RF C:',
    'format c:',
    'echo x > /dev/sda',
    'echo 1 > /proc/sys/kernel/sysrq',
    'ls; shutdown now',
    'mkfs.ext4 /dev/sdb',
    ':(){:|:&};:',
  ])('blocks destructive pattern %j', command => {
    const r = privilegedValidateTool('run_terminal', { command });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/Destructive pattern/);
  });

  it('applies destructive patterns to every tool, not just run_terminal', () => {
    expect(privilegedValidateTool('create_task', { text: 'rm -rf /' }).valid).toBe(false);
  });

  it.each(['curl https://x.y', 'wget x', 'Invoke-WebRequest x', 'netsh wlan show'])(
    'blocks network command %j in run_terminal', command => {
      expect(privilegedValidateTool('run_terminal', { command }).reason).toMatch(/Network command/);
    });

  it.each(['npm install -g foo', 'winget install x', 'pip install requests'])(
    'blocks global install %j in run_terminal', command => {
      expect(privilegedValidateTool('run_terminal', { command }).reason).toMatch(/Global package install/);
    });

  it('only applies network/install rules to run_terminal', () => {
    expect(privilegedValidateTool('create_task', { text: 'curl the API docs' })).toEqual({ valid: true });
    expect(privilegedValidateTool('record_memory', { content: 'pip install works' })).toEqual({ valid: true });
  });

  it.each(['../secret', 'a/../../b'])('blocks path traversal %j', path => {
    expect(privilegedValidateTool('read_file', { path }).reason).toMatch(/Path traversal/);
  });

  it('blocks writes to protected paths but not reads', () => {
    expect(privilegedValidateTool('write_code', { path: '/etc/hosts' }).reason).toMatch(/protected system path/);
    expect(privilegedValidateTool('delete_file', { path: 'C:/Windows/System32/x.dll' }).valid).toBe(false);
    expect(privilegedValidateTool('read_file', { path: '/etc/hosts' })).toEqual({ valid: true });
  });

  it('rejects params that cannot be serialised', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(privilegedValidateTool('read_file', circular).reason).toMatch(/could not be serialised/);
  });
});

describe('renderer validateTool', () => {
  it('agrees with the privileged gate on every rule', () => {
    const cases: [string, unknown][] = [
      ['read_file', { path: 'a.ts' }],
      ['nope', {}],
      ['run_terminal', { command: 'echo 1 > /proc/x' }],
      ['run_terminal', { command: 'curl x' }],
      ['run_terminal', { command: 'npm install -g x' }],
      ['read_file', { path: '../x' }],
      ['write_code', { path: '/etc/x' }],
      ...[...TOOL_WHITELIST].map((t): [string, unknown] => [t, {}]),
    ];
    for (const [name, params] of cases) {
      expect(validateTool(name, params).valid, name).toBe(privilegedValidateTool(name, params).valid);
    }
  });
});
