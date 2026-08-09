/**
 * Public entry point: a raw battle log in, everything a game row needs out.
 *
 * Bumped whenever the reconstruction changes in a way that alters output.
 * Stored on each game so past uploads can be replayed after a fix, instead of
 * silently mixing results from two different parsers in the same history.
 */
export const PARSER_VERSION = '1.0.0';

import { createHash } from 'node:crypto';
import type { PtcgValidationReport, PtcgSnapshot, PtcgTurnIndex } from '@/lib/types';
import { tokenize } from './tokenize';
import { buildStates, type PtcgAmbiguity, type PtcgWarning } from './state';
import { validate } from './validate';

export { tokenize } from './tokenize';
export { buildStates } from './state';
export { validate } from './validate';

export interface PtcgParsedGame {
  parserVersion: string;
  logHash: string;
  /** The player whose hand the log reveals — i.e. whoever exported it. */
  me: string;
  opponent: string;
  winner: string | null;
  result: 'win' | 'loss' | 'tie';
  /** Prizes *taken*, not remaining. */
  prizesMe: number;
  prizesOpponent: number;
  turns: number;
  state: { snapshots: PtcgSnapshot[]; turns: PtcgTurnIndex[] };
  validation: PtcgValidationReport;
  ambiguities: PtcgAmbiguity[];
  warnings: PtcgWarning[];
  /** Lines the tokenizer did not recognise. Non-empty means the log has a shape we do not handle. */
  unknown: { line: number; text: string }[];
}

export function parseGame(raw: string): PtcgParsedGame {
  const tokens = tokenize(raw);
  const built = buildStates(tokens);
  const validation = validate(built, tokens);

  // The exporting player is the one whose hand the log reveals. Primary signal,
  // robust to logs that omit card set ids: only the exporting client spells out
  // its opening hand, as a "• …" list right under its "main de départ" draw.
  const P = tokens.players.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const openRe = new RegExp(`^(${P}) a pioché \\d+ cartes pour sa main de départ\\.$`);
  const drawRe = new RegExp(`^(${P}) a pioché`);
  const rawLines = raw.split(/\r?\n/).map((l) => l.trim());
  let me: string | null = null;
  for (let i = 0; i < rawLines.length && !me; i++) {
    const open = openRe.exec(rawLines[i]);
    if (!open) continue;
    for (let j = i + 1; j < Math.min(i + 4, rawLines.length); j++) {
      if (rawLines[j].startsWith('•')) me = open[1]; // this opener's hand is shown
      if (rawLines[j].startsWith('•') || drawRe.test(rawLines[j])) break;
    }
  }
  // Fallback (id-ful logs): the player who accumulated the most known hand cards
  // in the reconstruction — the visible side, since the other's stay hidden.
  if (!me) {
    const known: Record<string, number> = Object.fromEntries(tokens.players.map((p) => [p, 0]));
    for (const s of built.snapshots) {
      for (const p of tokens.players) known[p] += s.state.players[p].hand.length;
    }
    me = [...tokens.players].sort((a, b) => known[b] - known[a])[0];
  }
  const opponent = tokens.players.find((p) => p !== me)!;

  const final = built.final;
  const prizesMe = 6 - final.players[me].prizesRemaining;
  const prizesOpponent = 6 - final.players[opponent].prizesRemaining;

  return {
    parserVersion: PARSER_VERSION,
    logHash: createHash('sha256').update(raw.trim()).digest('hex'),
    me,
    opponent,
    winner: final.winner,
    result: final.winner === me ? 'win' : final.winner === opponent ? 'loss' : 'tie',
    prizesMe,
    prizesOpponent,
    turns: built.turns.length,
    state: { snapshots: built.snapshots, turns: built.turns },
    validation,
    ambiguities: built.ambiguities,
    warnings: built.warnings,
    unknown: tokens.unknown,
  };
}
