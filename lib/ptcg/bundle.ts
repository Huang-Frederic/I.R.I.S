/**
 * The upload format: one self-contained file per game.
 *
 * A bundle is produced outside the app — parser, card resolution and analysis —
 * and then imported. The import path never re-parses and never calls TCGdex, so
 * a file is either accepted whole or rejected whole.
 *
 * validateBundle is the gate. It exists because the analysis half of a bundle is
 * written by a model, and a model can produce prose that reads perfectly while
 * pointing at a turn that never happened. Anchors are therefore checked against
 * the reconstruction, not trusted.
 */

import { createHash } from 'node:crypto';
import type {
  PtcgBundle,
  PtcgCardRow,
  PtcgMistakeCode,
  PtcgAnalysisRow,
  PtcgSeverity,
} from '@/lib/types';
import type { PtcgParsedGame } from './index';

const SUPPORTED_VERSION = 1;

const MISTAKE_CODES: PtcgMistakeCode[] = [
  'ability_unused',
  'bench_liability',
  'missed_lethal',
  'supporter_unplayed',
  'energy_unattached',
  'discard_fuel_missed',
  'promote_misplay',
];
const SEVERITIES: PtcgSeverity[] = ['error', 'warning', 'good', 'note'];

export function buildBundle(
  raw: string,
  parsed: PtcgParsedGame,
  cards: Record<string, PtcgCardRow>,
  analysis: PtcgBundle['analysis'],
  meta: { playedAt?: string; myArchetype?: string | null; opponentArchetype?: string | null } = {},
): PtcgBundle {
  return {
    bundleVersion: SUPPORTED_VERSION,
    generatedAt: new Date().toISOString(),
    game: {
      played_at: meta.playedAt ?? new Date().toISOString(),
      me: parsed.me,
      opponent: parsed.opponent,
      result: parsed.result,
      prizes_me: parsed.prizesMe,
      prizes_opponent: parsed.prizesOpponent,
      turns: parsed.turns,
      my_archetype: meta.myArchetype ?? null,
      opponent_archetype: meta.opponentArchetype ?? null,
      // Stored verbatim: it is the only source of truth, and everything else in
      // the bundle can be recomputed from it after a parser fix.
      raw_log: raw,
      log_hash: parsed.logHash,
      parser_version: parsed.parserVersion,
      state: parsed.state,
      validation: parsed.validation,
    },
    cards: Object.values(cards),
    analysis,
  };
}

export interface BundleValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Checks a bundle before it reaches the database.
 *
 * Beyond shape, three checks matter:
 *  - the game's own damage oracle must have passed. Importing a game whose
 *    reconstruction is known wrong would poison the history it feeds.
 *  - log_hash must match raw_log, so a hand-edited file cannot claim to be a
 *    game it is not, and cannot collide with a different game's dedup key.
 *  - every moment must anchor to a log line that exists in the reconstruction.
 *    This is what stops a fluent but invented finding from being stored.
 */
export function validateBundle(input: unknown): BundleValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (m: string) => errors.push(m);

  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['bundle_not_an_object'], warnings };
  }
  const b = input as Partial<PtcgBundle>;

  if (b.bundleVersion !== SUPPORTED_VERSION) {
    return {
      ok: false,
      errors: [`unsupported_bundle_version:${String(b.bundleVersion)}`],
      warnings,
    };
  }
  if (!b.game || typeof b.game !== 'object') {
    return { ok: false, errors: ['missing_game'], warnings };
  }

  const g = b.game;
  for (const k of ['me', 'opponent', 'raw_log', 'log_hash', 'parser_version'] as const) {
    if (typeof g[k] !== 'string' || !g[k]) fail(`missing_game_field:${k}`);
  }
  if (!['win', 'loss', 'tie'].includes(g.result)) fail(`bad_result:${String(g.result)}`);

  // A reconstruction that failed its own oracle must never be stored: every
  // number downstream would inherit the error, silently.
  if (!g.validation?.ok) fail('validation_failed');

  if (typeof g.raw_log === 'string' && typeof g.log_hash === 'string') {
    const actual = createHash('sha256').update(g.raw_log.trim()).digest('hex');
    if (actual !== g.log_hash) fail('log_hash_mismatch');
  }

  const snapshots = g.state?.snapshots;
  if (!Array.isArray(snapshots) || snapshots.length === 0) fail('missing_state_snapshots');

  if (!Array.isArray(b.cards)) fail('missing_cards');
  else if (b.cards.length === 0) warnings.push('no_cards_resolved');

  const a = b.analysis as PtcgAnalysisRow | undefined;
  if (!a || typeof a !== 'object') {
    fail('missing_analysis');
    return { ok: errors.length === 0, errors, warnings };
  }
  if (!['rules', 'llm', 'manual'].includes(a.source))
    fail(`bad_analysis_source:${String(a.source)}`);

  const lines = new Set((snapshots ?? []).map((s) => s.line));
  for (const [i, m] of (a.moments ?? []).entries()) {
    if (!SEVERITIES.includes(m.severity)) fail(`moment_${i}_bad_severity:${String(m.severity)}`);
    if (!m.title || !m.body) fail(`moment_${i}_empty`);
    // The anchor is the difference between a verifiable finding and a story.
    if (!lines.has(m.line)) fail(`moment_${i}_anchor_not_in_log:L${String(m.line)}`);
    for (const e of m.evidence ?? []) {
      if (!lines.has(e)) warnings.push(`moment_${i}_evidence_not_in_log:L${e}`);
    }
  }

  for (const [i, p] of (a.patterns ?? []).entries()) {
    // An invented code silently breaks the cross-game aggregation, which is the
    // only reason the history is worth keeping.
    if (!MISTAKE_CODES.includes(p.code)) fail(`pattern_${i}_unknown_code:${String(p.code)}`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
