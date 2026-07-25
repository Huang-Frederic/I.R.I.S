/**
 * Aggregates recurring mistakes across a player's game history.
 *
 * This is the only reason the history is worth storing. A single debrief is read
 * once and forgotten; "you skipped a once-per-turn ability in 3 of your last 4
 * games" is what actually changes how someone plays. It also relies on the
 * closed PtcgMistakeCode vocabulary — an invented code would silently vanish
 * from these counts rather than fail loudly, which is why bundle validation
 * rejects unknown codes at import.
 */

import type { PtcgMistakeCode, PtcgSeverity } from '@/lib/types';

export interface PtcgGameWithPatterns {
  id: string;
  played_at: string;
  ptcg_analyses: { patterns: { code: PtcgMistakeCode; occurrences: number }[] | null }[] | null;
}

export interface PtcgPatternStat {
  code: PtcgMistakeCode;
  /** Number of games where the mistake appeared at least once. */
  games: number;
  /** Total occurrences across those games. */
  occurrences: number;
  /** Share of analysed games affected, in [0, 1]. */
  rate: number;
  severity: PtcgSeverity;
}

/** Severity is derived from how often it happens, not carried from one analysis. */
function severityFor(rate: number): PtcgSeverity {
  if (rate >= 0.5) return 'error';
  if (rate >= 0.25) return 'warning';
  return 'note';
}

/**
 * Counts each mistake once per game, then ranks by how many games it touched.
 *
 * Counting games rather than raw occurrences on purpose: one messy game with
 * five slips should not outrank a habit that shows up in every single game.
 */
export function aggregatePatterns(games: PtcgGameWithPatterns[]): PtcgPatternStat[] {
  // Only games that carry an analysis form the denominator — an unanalysed game
  // is not evidence that a mistake was absent.
  const analysed = games.filter((g) => (g.ptcg_analyses ?? []).some((a) => a.patterns !== null));
  if (analysed.length === 0) return [];

  const byCode = new Map<PtcgMistakeCode, { games: number; occurrences: number }>();

  for (const g of analysed) {
    const seen = new Map<PtcgMistakeCode, number>();
    // A game can hold several analyses (re-analysed later); take the union so a
    // re-run does not double-count the same game.
    for (const a of g.ptcg_analyses ?? []) {
      for (const p of a.patterns ?? []) {
        seen.set(p.code, Math.max(seen.get(p.code) ?? 0, p.occurrences));
      }
    }
    for (const [code, occurrences] of seen) {
      const acc = byCode.get(code) ?? { games: 0, occurrences: 0 };
      acc.games += 1;
      acc.occurrences += occurrences;
      byCode.set(code, acc);
    }
  }

  return [...byCode]
    .map(([code, v]) => {
      const rate = v.games / analysed.length;
      return {
        code,
        games: v.games,
        occurrences: v.occurrences,
        rate,
        severity: severityFor(rate),
      };
    })
    .sort(
      (a, b) => b.games - a.games || b.occurrences - a.occurrences || a.code.localeCompare(b.code),
    );
}
