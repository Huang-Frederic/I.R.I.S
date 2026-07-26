import { describe, expect, it } from 'vitest';
import { parseJsonLoose } from './json-from-text';

describe('parseJsonLoose', () => {
  it('parses plain JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('strips a fence with a language tag', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('strips a bare fence', () => {
    expect(parseJsonLoose('```\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('tolerates whitespace around the fence', () => {
    expect(parseJsonLoose('\n  ```json\n{"a":1}\n```  \n')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('keeps backticks that are inside the JSON itself', () => {
    // A finding body may quote code; only an enclosing fence is removed.
    const r = parseJsonLoose('{"body":"use ```x``` here"}');
    expect(r).toEqual({ ok: true, value: { body: 'use ```x``` here' } });
  });

  it('fails on text that is not JSON', () => {
    expect(parseJsonLoose('voici ton analyse :')).toEqual({ ok: false });
  });

  it('fails on an empty string rather than returning undefined', () => {
    expect(parseJsonLoose('')).toEqual({ ok: false });
  });

  it('does not swallow a truncated paste', () => {
    // Copying half a long analysis is the likely mobile failure; it must not
    // reach the import route as a half-object.
    expect(parseJsonLoose('{"moments":[{"line":1,')).toEqual({ ok: false });
  });
});
