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
 * Deliberately lenient about the *reconstruction* and strict about *identity*:
 *  - a failed damage oracle or unrecognised lines are warnings, not refusals.
 *    The raw log is the source of truth and displays fine either way; blocking
 *    the import on parser quality is what used to make every new phrasing a
 *    dead end.
 *  - log_hash must match raw_log, so a hand-edited file cannot claim to be a
 *    game it is not, and cannot collide with a different game's dedup key.
 *  - a moment must anchor to a line that exists in the raw log. A line the
 *    parser produced no snapshot for is a warning (the replay attaches it to
 *    the nearest event); a line outside the log is still an invented finding
 *    and is refused.
 *  - `analysis` may be null (raw-log-only import) unless the caller requires it.
 */
export function validateBundle(
  input: unknown,
  opts: { requireAnalysis?: boolean } = {},
): BundleValidation {
  const requireAnalysis = opts.requireAnalysis ?? true;
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

  // Informational now. The oracle disagreeing with the log means the *derived*
  // numbers are suspect — the verbatim log and its display are not.
  if (!g.validation?.ok) warnings.push('reconstruction_unverified');

  if (typeof g.raw_log === 'string' && typeof g.log_hash === 'string') {
    const actual = createHash('sha256').update(g.raw_log.trim()).digest('hex');
    if (actual !== g.log_hash) fail('log_hash_mismatch');
  }

  const snapshots = g.state?.snapshots;
  if (!Array.isArray(snapshots) || snapshots.length === 0) fail('missing_state_snapshots');

  if (!Array.isArray(b.cards)) fail('missing_cards');
  else if (b.cards.length === 0) warnings.push('no_cards_resolved');

  const a = b.analysis as PtcgAnalysisRow | null | undefined;
  if (!a || typeof a !== 'object') {
    if (requireAnalysis) fail('missing_analysis');
    return { ok: errors.length === 0, errors, warnings };
  }
  if (!['rules', 'llm', 'manual'].includes(a.source))
    fail(`bad_analysis_source:${String(a.source)}`);

  const snapshotLines = new Set((snapshots ?? []).map((s) => s.line));
  const rawLineCount =
    typeof g.raw_log === 'string' ? g.raw_log.trim().split(/\r?\n/).length : 0;
  for (const [i, m] of (a.moments ?? []).entries()) {
    if (!SEVERITIES.includes(m.severity)) fail(`moment_${i}_bad_severity:${String(m.severity)}`);
    if (!m.title || !m.body) fail(`moment_${i}_empty`);
    // The anchor is the difference between a verifiable finding and a story:
    // a line the log never had is refused. A real line the parser produced no
    // snapshot for only warns — the replay clamps it to the nearest event.
    if (!Number.isInteger(m.line) || m.line < 1 || m.line > rawLineCount) {
      fail(`moment_${i}_anchor_not_in_log:L${String(m.line)}`);
    } else if (!snapshotLines.has(m.line)) {
      warnings.push(`moment_${i}_anchor_no_snapshot:L${m.line}`);
    }
    for (const e of m.evidence ?? []) {
      if (!snapshotLines.has(e)) warnings.push(`moment_${i}_evidence_not_in_log:L${e}`);
    }
  }

  for (const [i, p] of (a.patterns ?? []).entries()) {
    // An invented code silently breaks the cross-game aggregation, which is the
    // only reason the history is worth keeping.
    if (!MISTAKE_CODES.includes(p.code)) fail(`pattern_${i}_unknown_code:${String(p.code)}`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
