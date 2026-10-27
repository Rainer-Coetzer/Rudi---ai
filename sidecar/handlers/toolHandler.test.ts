import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rudi-ws-'));

vi.mock('../workspace', () => ({
  getWorkspaceRoot: () => root,
  getRudiRoot: () => root,
}));
vi.mock('../stdio', () => ({ emitEvent: vi.fn(), send: vi.fn() }));
vi.mock('../logger', () => ({ writeLog: vi.fn(), readLog: vi.fn(() => []), clearLog: vi.fn() }));

const { resolveInWorkspace } = await import('./toolHandler');

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('resolveInWorkspace', () => {
  it('resolves relative paths against the workspace root', () => {
    expect(resolveInWorkspace('src/a.ts')).toBe(path.join(root, 'src', 'a.ts'));
    expect(resolveInWorkspace('./b.txt')).toBe(path.join(root, 'b.txt'));
  });

  it('accepts absolute paths inside the workspace', () => {
    const inside = path.join(root, 'deep', 'file.md');
    expect(resolveInWorkspace(inside)).toBe(inside);
  });

  it('rejects paths that escape the workspace', () => {
    expect(resolveInWorkspace('../outside.txt')).toBeNull();
    expect(resolveInWorkspace('src/../../outside.txt')).toBeNull();
    expect(resolveInWorkspace(path.resolve(root, '..', 'sibling'))).toBeNull();
    expect(resolveInWorkspace(path.parse(root).root)).toBeNull();
  });

  it('does not treat a sibling with the same prefix as inside', () => {
    expect(resolveInWorkspace(`${root}-evil${path.sep}x`)).toBeNull();
  });

  it('allows names that merely start with dots', () => {
    expect(resolveInWorkspace('..config')).toBe(path.join(root, '..config'));
  });

  it('rejects the root itself unless allowRoot is set', () => {
    expect(resolveInWorkspace('.')).toBeNull();
    expect(resolveInWorkspace('.', { allowRoot: true })).toBe(root);
    expect(resolveInWorkspace(root, { allowRoot: true })).toBe(root);
  });

  it('rejects empty targets and quotes', () => {
    expect(resolveInWorkspace(undefined)).toBeNull();
    expect(resolveInWorkspace('')).toBeNull();
    expect(resolveInWorkspace('a" & calc & "')).toBeNull();
  });
});
