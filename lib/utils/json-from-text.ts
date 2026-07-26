/**
 * Parses JSON that was copied out of a chat message.
 *
 * A conversation returns the analysis inside a fenced code block, and what
 * lands in the clipboard depends on whether the fence was selected. Refusing a
 * paste over three backticks would be a pointless obstacle, so the fence is
 * stripped before parsing. Anything else that is not JSON still fails loudly.
 */

const FENCE = /^\s*```[a-zA-Z]*\s*\n([\s\S]*?)\n?\s*```\s*$/;

export function parseJsonLoose(text: string): { ok: true; value: unknown } | { ok: false } {
  const fenced = FENCE.exec(text);
  const body = fenced ? fenced[1] : text;
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}
