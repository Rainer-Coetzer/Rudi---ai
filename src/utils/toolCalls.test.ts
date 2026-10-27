import { describe, expect, it } from 'vitest';
import { splitToolCalls } from './toolCalls';

describe('splitToolCalls', () => {
  it('extracts a bare tool-call object and keeps the surrounding prose', () => {
    const out = splitToolCalls('On it, Chef. {"tool":"list_dir","params":{"path":"."}} Done.', true);
    expect(out.calls).toEqual([{ tool: 'list_dir', params: { path: '.' } }]);
    expect(out.text).toBe('On it, Chef.  Done.');
  });

  it('extracts a tool call wrapped in a ```json fence', () => {
    const out = splitToolCalls('Reading it.\n```json\n{"tool":"read_file","params":{"path":"a.ts"}}\n```', true);
    expect(out.calls).toEqual([{ tool: 'read_file', params: { path: 'a.ts' } }]);
    expect(out.text).toBe('Reading it.');
  });

  it('keeps ordinary code fences as text, braces included', () => {
    const code = '```ts\nfunction f() { return { a: 1 }; }\n```';
    const out = splitToolCalls(`Here:\n${code}`, true);
    expect(out.calls).toEqual([]);
    expect(out.text).toBe(`Here:\n${code}`);
  });

  it('keeps a fenced JSON object that is not a tool call', () => {
    const fence = '```json\n{"name":"rudi","version":"1.0.0"}\n```';
    const out = splitToolCalls(fence, true);
    expect(out.calls).toEqual([]);
    expect(out.text).toBe(fence);
  });

  it('leaves non-protocol braces in prose alone', () => {
    const out = splitToolCalls('Use {x: 1} or {"other": true}.', true);
    expect(out.calls).toEqual([]);
    expect(out.text).toBe('Use {x: 1} or {"other": true}.');
  });

  it('accepts a message-only object', () => {
    const out = splitToolCalls('{"message":"hello","requiresConfirmation":false}', true);
    expect(out.calls).toEqual([{ message: 'hello', requiresConfirmation: false }]);
    expect(out.text).toBe('');
  });

  it('handles braces and escaped quotes inside strings', () => {
    const raw = '{"tool":"write_code","params":{"path":"x.js","content":"const o = { a: \\"}\\" };"}}';
    const out = splitToolCalls(raw, true);
    expect(out.calls).toHaveLength(1);
    expect(out.calls[0].params).toEqual({ path: 'x.js', content: 'const o = { a: "}" };' });
    expect(out.text).toBe('');
  });

  it('extracts several calls in stream order', () => {
    const out = splitToolCalls('{"tool":"a"} then {"tool":"b"}', true);
    expect(out.calls.map(c => c.tool)).toEqual(['a', 'b']);
    expect(out.text).toBe('then');
  });

  describe('partial streams', () => {
    it('holds back an unfinished tool call while streaming', () => {
      const out = splitToolCalls('Working… {"tool":"list_d', false);
      expect(out.calls).toEqual([]);
      expect(out.text).toBe('Working…');
    });

    it('holds back a lone opening brace while streaming', () => {
      expect(splitToolCalls('Hi {', false).text).toBe('Hi');
    });

    it('holds back an unfinished fenced tool call while streaming', () => {
      expect(splitToolCalls('Sure.\n```json\n{"tool":"read', false).text).toBe('Sure.');
    });

    it('shows an unfinished non-tool brace immediately', () => {
      expect(splitToolCalls('Use {x: 1', false).text).toBe('Use {x: 1');
    });

    it('streams an unfinished ordinary code fence as text', () => {
      expect(splitToolCalls('```ts\nconst a = 1;', false).text).toBe('```ts\nconst a = 1;');
    });

    it('shows an unfinished object as text once the stream ends', () => {
      const out = splitToolCalls('Oops {"tool":"list_d', true);
      expect(out.calls).toEqual([]);
      expect(out.text).toBe('Oops {"tool":"list_d');
    });

    it('extracts the call once the stream completes it', () => {
      const chunks = ['{"to', 'ol":"git_st', 'atus"}'];
      let buffer = '';
      for (const c of chunks) {
        expect(splitToolCalls(buffer, false).text).toBe('');
        buffer += c;
      }
      buffer += ' ok';
      expect(splitToolCalls(buffer, true)).toEqual({ text: 'ok', calls: [{ tool: 'git_status' }] });
    });
  });

  it('collapses runs of blank lines left behind', () => {
    expect(splitToolCalls('a\n\n{"tool":"x"}\n\n\nb', true).text).toBe('a\n\nb');
  });
});
