/**
 * Splits `**bold**` and `*italic*` runs out of a string.
 *
 * The analysis bodies are written as short markdown, so a full markdown
 * renderer would be a dependency bought for two constructs. Returning segments
 * rather than HTML keeps the text un-escaped and un-injectable: React renders
 * each piece as a text node.
 */

export interface Segment {
  text: string;
  bold: boolean;
  italic: boolean;
}

// Bold is listed first so `**x**` never matches as an italic run containing a
// stray asterisk. Neither body may contain `*`, which keeps the two apart and
// makes an unclosed marker fall through as plain text.
const RUN = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

export function inlineMarkup(input: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;

  for (const m of input.matchAll(RUN)) {
    if (m.index > last) out.push({ text: input.slice(last, m.index), bold: false, italic: false });
    out.push({ text: m[1] ?? m[2], bold: m[1] != null, italic: m[2] != null });
    last = m.index + m[0].length;
  }

  if (last < input.length) out.push({ text: input.slice(last), bold: false, italic: false });
  return out;
}
