import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emitEvent } = vi.hoisted(() => ({ emitEvent: vi.fn() }));
vi.mock('./stdio', () => ({ emitEvent, send: vi.fn() }));
vi.mock('./logger', () => ({ writeLog: vi.fn() }));

const { gate, needsApproval, resolveApproval, setAutonomyLevel } = await import('./policy');

/** Answers the next approval request the gate raises. */
function answerNextPrompt(approved: boolean) {
  emitEvent.mockImplementationOnce((_event: string, payload: { id: number }) => {
    queueMicrotask(() => resolveApproval(payload.id, approved));
  });
}

beforeEach(() => {
  emitEvent.mockReset();
  setAutonomyLevel('assist');
});

describe('setAutonomyLevel', () => {
  it('accepts known levels and ignores anything else', () => {
    expect(setAutonomyLevel('autonomous')).toBe('autonomous');
    expect(setAutonomyLevel('godmode')).toBe('autonomous');
    expect(setAutonomyLevel(3)).toBe('autonomous');
    expect(setAutonomyLevel('observe')).toBe('observe');
  });
});

describe('needsApproval', () => {
  const table: [tool: string, observe: boolean, assist: boolean, autonomous: boolean][] = [
    // read-only tools never prompt
    ['read_file',    false, false, false],
    ['list_dir',     false, false, false],
    ['git_status',   false, false, false],
    // assist-level tools prompt only in observe
    ['write_code',   true,  false, false],
    ['create_task',  true,  false, false],
    // autonomous-level tools prompt below autonomous
    ['run_terminal', true,  true,  false],
    ['git_commit',   true,  true,  false],
    // hard-confirm tools always prompt
    ['delete_file',  true,  true,  true],
    ['git_push',     true,  true,  true],
    ['self_improve', true,  true,  true],
    // unknown tools (including MCP) fail closed
    ['mcp:github/x', true,  true,  true],
  ];

  it.each(table)('%s → observe:%s assist:%s autonomous:%s', (tool, observe, assist, autonomous) => {
    setAutonomyLevel('observe');
    expect(needsApproval(tool)).toBe(observe);
    setAutonomyLevel('assist');
    expect(needsApproval(tool)).toBe(assist);
    setAutonomyLevel('autonomous');
    expect(needsApproval(tool)).toBe(autonomous);
  });
});

describe('gate', () => {
  it('lets an auto-executable call through without prompting', async () => {
    expect(await gate('write_code', { path: 'a.ts', content: '' })).toBeNull();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('refuses security violations before asking the user', async () => {
    setAutonomyLevel('autonomous');
    const r = await gate('run_terminal', { command: 'rm -rf /' });
    expect(r).toMatchObject({ success: false, blocked: true });
    expect(r?.result).toMatch(/Destructive pattern/);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('skips the whitelist for mcp: tools but still asks', async () => {
    answerNextPrompt(true);
    expect(await gate('mcp:github/create_issue', {})).toBeNull();
    expect(emitEvent).toHaveBeenCalledWith('confirm', expect.objectContaining({
      title: expect.stringContaining('mcp:github/create_issue'),
    }));
  });

  it('returns a declined result when the user says no', async () => {
    answerNextPrompt(false);
    expect(await gate('run_terminal', { command: 'echo hi' }))
      .toEqual({ success: false, result: 'Declined by user.', blocked: true });
  });

  it('describes the action in the approval dialog', async () => {
    answerNextPrompt(true);
    await gate('delete_file', { path: 'old.txt' });
    expect(emitEvent.mock.calls[0][1].detail).toBe('Delete file:\nold.txt');
  });

  it('forceApproval makes the gate stricter, never looser', async () => {
    answerNextPrompt(false);
    expect(await gate('write_code', { path: 'a.ts' }, true)).toMatchObject({ blocked: true });
    expect(emitEvent).toHaveBeenCalledTimes(1);
  });

  it('ignores approvals for unknown ids', () => {
    expect(resolveApproval(9999, true)).toBeNull();
    expect(resolveApproval('1', true)).toBeNull();
  });
});
