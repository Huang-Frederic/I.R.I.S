import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PtcgBundle } from '@/lib/types';
import { parseGame } from './index';
import { buildBundle, validateBundle } from './bundle';

const FIXTURE = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/amphinobi-2026-07-25.txt'),
  'utf8',
);
const parsed = parseGame(FIXTURE);

const ANALYSIS: PtcgBundle['analysis'] = {
  schema_version: 1,
  source: 'llm',
  model: 'test',
  verdict: { summary: 'Défaite 3-6.' },
  moments: [
    {
      line: 96,
      turn: 5,
      severity: 'error',
      category: 'ability_unused',
      title: 'Un talent gratuit non utilisé',
      body: 'Deux Feurisson en jeu, un seul talent déclenché.',
      cost: { damage: 60 },
      evidence: [88, 89, 96],
    },
  ],
  patterns: [{ code: 'ability_unused', occurrences: 1, severity: 'error' }],
  checklist: ['Utilise le talent de Feurisson avant de le faire évoluer.'],
};

const bundle = () => buildBundle(FIXTURE, parsed, {}, ANALYSIS);

/** Deep copy so a mutation in one test cannot leak into another. */
const mutate = (fn: (b: PtcgBundle) => void): PtcgBundle => {
  const b = JSON.parse(JSON.stringify(bundle())) as PtcgBundle;
  fn(b);
  return b;
};

describe('buildBundle', () => {
  it('carries the raw log verbatim, as the only source of truth', () => {
    expect(bundle().game.raw_log).toBe(FIXTURE);
  });

  it('records the parser version so a game can be replayed after a fix', () => {
    expect(bundle().game.parser_version).toBe(parsed.parserVersion);
  });

  it('summarises the game alongside the full state', () => {
    const b = bundle();
    expect(b.game.result).toBe('loss');
    expect(b.game.prizes_me).toBe(3);
    expect(b.game.state.snapshots.length).toBeGreaterThan(100);
  });
});

describe('validateBundle', () => {
  it('accepts a bundle it just built', () => {
    expect(validateBundle(bundle())).toMatchObject({ ok: true, errors: [] });
  });

  it('rejects anything that is not a bundle', () => {
    expect(validateBundle(null).ok).toBe(false);
    expect(validateBundle('nope').ok).toBe(false);
    expect(validateBundle({}).errors[0]).toMatch(/unsupported_bundle_version/);
  });

  it('rejects a future bundle version rather than guessing', () => {
    const b = mutate((x) => {
      (x as { bundleVersion: number }).bundleVersion = 99;
    });
    expect(validateBundle(b).errors[0]).toBe('unsupported_bundle_version:99');
  });

  it('accepts a game whose damage oracle failed, with a warning', () => {
    // The raw log displays fine either way; blocking on parser quality is what
    // used to make every new log phrasing a dead end. The derived numbers are
    // flagged as unverified instead.
    const b = mutate((x) => {
      x.game.validation.ok = false;
    });
    const r = validateBundle(b);
    expect(r.ok).toBe(true);
    expect(r.warnings).toContain('reconstruction_unverified');
  });

  it('accepts a raw-only bundle when the caller does not require an analysis', () => {
    const b = mutate((x) => {
      x.analysis = null;
    });
    expect(validateBundle(b, { requireAnalysis: false }).ok).toBe(true);
    // The legacy default still refuses: a .bundle.json always carried one.
    expect(validateBundle(b).errors).toContain('missing_analysis');
  });

  it('warns, but does not block, on an anchor the parser produced no snapshot for', () => {
    // A real log line without a snapshot (a sub-line, an unrecognised phrasing)
    // is a display concern — the replay clamps to the nearest event. Only a
    // line the log never had is an invented finding.
    const snapLines = new Set(parsed.state.snapshots.map((s) => s.line));
    const total = FIXTURE.trim().split(/\r?\n/).length;
    let target = 0;
    for (let l = 1; l <= total; l++) {
      if (!snapLines.has(l)) {
        target = l;
        break;
      }
    }
    expect(target).toBeGreaterThan(0);
    const b = mutate((x) => {
      x.analysis!.moments[0].line = target;
    });
    const r = validateBundle(b);
    expect(r.ok).toBe(true);
    expect(r.warnings).toContain(`moment_0_anchor_no_snapshot:L${target}`);
  });

  it('detects a log edited after the hash was computed', () => {
    const b = mutate((x) => {
      x.game.raw_log += '\nHisshiden a triché.';
    });
    expect(validateBundle(b).errors).toContain('log_hash_mismatch');
  });

  it('rejects a finding anchored to a line that does not exist', () => {
    // The point of the gate: fluent prose pointing at a turn that never
    // happened must not reach the database.
    const b = mutate((x) => {
      x.analysis!.moments[0].line = 99999;
    });
    expect(validateBundle(b).errors).toContain('moment_0_anchor_not_in_log:L99999');
  });

  it('rejects an invented mistake code', () => {
    // An unknown code silently breaks cross-game aggregation.
    const b = mutate((x) => {
      (x.analysis!.patterns[0] as { code: string }).code = 'played_badly';
    });
    expect(validateBundle(b).errors).toContain('pattern_0_unknown_code:played_badly');
  });

  it('rejects an unknown severity', () => {
    const b = mutate((x) => {
      (x.analysis!.moments[0] as { severity: string }).severity = 'catastrophic';
    });
    expect(validateBundle(b).errors).toContain('moment_0_bad_severity:catastrophic');
  });

  it('rejects an empty finding', () => {
    const b = mutate((x) => {
      x.analysis!.moments[0].body = '';
    });
    expect(validateBundle(b).errors).toContain('moment_0_empty');
  });

  it('warns, but does not block, on unverifiable evidence', () => {
    // Evidence is supporting material; a bad line weakens the finding without
    // invalidating it, unlike the anchor itself.
    const b = mutate((x) => {
      x.analysis!.moments[0].evidence = [88, 99999];
    });
    const r = validateBundle(b);
    expect(r.ok).toBe(true);
    expect(r.warnings).toContain('moment_0_evidence_not_in_log:L99999');
  });

  it('warns when no card could be resolved', () => {
    expect(validateBundle(bundle()).warnings).toContain('no_cards_resolved');
  });

  it('accepts a bundle with no findings at all', () => {
    // A clean game is a legitimate result, not a malformed file.
    const b = mutate((x) => {
      x.analysis!.moments = [];
      x.analysis!.patterns = [];
    });
    expect(validateBundle(b).ok).toBe(true);
  });
});
