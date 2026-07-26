/**
 * Turns an analysis into a single play score.
 *
 * The judgement stays in the moments — deciding that a move was an `error`
 * rather than a `note` is the part no code can do. But once that call is made,
 * the number follows mechanically. That split is the whole point: a score
 * produced by feel would drift with mood and make two games incomparable,
 * whereas this one can be argued with turn by turn.
 *
 * It is still an estimate, not a measurement. Nothing here knows what the
 * optimal line was — only what was left on the table, as judged in the
 * analysis. Present it as such.
 */

import type { PtcgMoment } from '@/lib/types';

/**
 * Per-moment effect, applied to the game rather than averaged over turns.
 *
 * Averaging was the first attempt and it flattered badly: a game lost to a
 * single decisive blunder scored 80, because seven uneventful turns diluted it.
 * A mistake costs what it costs regardless of how long the game ran, so the
 * penalties are summed and the turn breakdown is kept for explanation only.
 */
const DELTA: Record<string, number> = {
  error: -18,
  warning: -8,
  note: -4,
  good: +5,
};

/** An error that cost prizes outweighs one that cost damage. */
const LOST_THE_GAME = -35;

export interface PtcgPlayScore {
  /** 0–100, rounded. */
  score: number;
  /** Per-turn breakdown, so a score can be contested where it was earned. */
  turns: { turn: number; score: number }[];
}

/**
 * @param moments   findings from the analysis
 * @param myTurns   the turn numbers the player actually played — a game's
 *                  turn list alternates, and scoring the opponent's turns
 *                  would dilute every penalty by half
 */
export function playScore(moments: PtcgMoment[], myTurns: number[]): PtcgPlayScore | null {
  if (myTurns.length === 0) return null;

  const byTurn = new Map<number, PtcgMoment[]>();
  for (const m of moments) {
    byTurn.set(m.turn, [...(byTurn.get(m.turn) ?? []), m]);
  }

  // Own turns, plus any turn carrying a finding. Several real decisions land on
  // the opponent's turn — which Pokémon to promote after a knockout is made
  // then — and dropping those would hide the mistake entirely.
  const scored = [...new Set([...myTurns, ...byTurn.keys()])].sort((a, b) => a - b);

  const deltaOf = (m: PtcgMoment) => {
    // `cost.prizes` is the only signal we have that a mistake was decisive.
    const decisive = m.severity === 'error' && (m.cost?.prizes ?? 0) >= 2;
    return decisive ? LOST_THE_GAME : (DELTA[m.severity] ?? 0);
  };

  const turns = scored.map((turn) => {
    const delta = (byTurn.get(turn) ?? []).reduce((sum, m) => sum + deltaOf(m), 0);
    // Per-turn figure, shown to explain where the score went. Clamped so a
    // turn with three good plays does not read as better than clean.
    return { turn, score: Math.max(0, Math.min(100, 100 + delta)) };
  });

  const total = moments.reduce((sum, m) => sum + deltaOf(m), 0);
  return { score: Math.max(0, Math.min(100, 100 + total)), turns };
}
