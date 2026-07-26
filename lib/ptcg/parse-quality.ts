/**
 * Decides whether a parse is complete enough to build on.
 *
 * The damage oracle only catches what it can see. When a paste loses whole
 * classes of line — a game arrived with all 67 of its bullet lines mangled,
 * taking every "Analyse des dégâts" block with them — the oracle has almost
 * nothing left to check, reports one passing check and no failures, and the
 * game sails through the gate with a fifth of its history missing.
 *
 * So unrecognised lines are a gate of their own, not a footnote. A handful is
 * a phrasing the tokenizer has yet to learn; a large share means the input
 * itself is damaged, and no amount of downstream care recovers it.
 */

/** Above this share of the log's own content, the parse is not trustworthy. */
const REFUSE_ABOVE = 0.05;

export interface ParseQuality {
  /** Unrecognised lines as a share of non-empty lines, 0–1. */
  ratio: number;
  /** True when the input is too damaged to analyse. */
  degraded: boolean;
}

export function parseQuality(raw: string, unknownCount: number): ParseQuality {
  const meaningful = raw.split('\n').filter((l) => l.trim().length > 0).length;
  // An empty log is not "0% unknown" — nothing was read at all.
  if (meaningful === 0) return { ratio: 1, degraded: true };

  const ratio = unknownCount / meaningful;
  return { ratio, degraded: ratio > REFUSE_ABOVE };
}
