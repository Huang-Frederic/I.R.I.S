import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenize';
import { buildStates } from './state';
import { validate } from './validate';
import { parseGame } from './index';

const FIXTURE = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/amphinobi-2026-07-25.txt'),
  'utf8',
);

const run = (raw: string) => {
  const tokens = tokenize(raw);
  return validate(buildStates(tokens), tokens);
};

describe('validate', () => {
  it('passes on a real game', () => {
    const report = run(FIXTURE);
    expect(report.checks.filter((c) => c.ok === false)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('confirms the discard counter that drives Explosion Partenaire', () => {
    // 3 Aventure de Luth in the discard × 60 = the 180 the engine reported.
    // If the reconstruction lost or double-counted one, this is what catches it.
    const check = run(FIXTURE).checks.find(
      (c) => c.kind === 'discard-counter' && c.detail.includes('Explosion Partenaire'),
    )!;
    expect(check.ok).toBe(true);
    expect(check.detail).toContain('3 × 60 = 180');
  });

  it('cross-checks what a knockout sends to the discard', () => {
    const ko = run(FIXTURE).checks.filter((c) => c.kind === 'ko-discard' && c.ok === true);
    expect(ko.length).toBeGreaterThanOrEqual(3);
  });

  it('reports unexplained damage rather than failing on it', () => {
    // The breakdown is not exhaustive: Hélice Ninja's optional +80 is never
    // itemised. A positive residual is expected and must not be an error.
    const residual = run(FIXTURE).checks.filter((c) => c.kind === 'unexplained-damage');
    expect(residual.length).toBeGreaterThan(0);
    expect(residual.every((c) => c.ok === null)).toBe(true);
    expect(residual[0].detail).toContain('+80');
  });

  it('flags an attack whose discard counter no longer matches the state', () => {
    // Remove one Aventure de Luth from the game: the state now holds 2 copies
    // where the engine counted 3. This is the mutation the oracle exists for.
    const broken = FIXTURE.replace('Hisshiden a joué (sv10_221) Aventure de Luth.\n', '');
    const report = run(broken);
    const failure = report.checks.find((c) => c.ok === false && c.kind === 'discard-counter')!;
    expect(failure).toBeDefined();
    expect(failure.expected).toBe(3);
    expect(failure.got).toBe(2);
    expect(report.ok).toBe(false);
  });

  it('does not silently pass an attack whose formula is unmodelled', () => {
    const unchecked = run(FIXTURE).checks.filter(
      (c) => c.kind === 'discard-counter' && c.ok === null,
    );
    for (const c of unchecked) expect(c.detail).toContain('not modelled');
  });
});

describe('validate — second game', () => {
  const FIXTURE_2 = readFileSync(
    join(process.cwd(), 'lib/ptcg/fixtures/minotaupe-2026-07-26.txt'),
    'utf8',
  );

  it('passes on a win with damage reduction in play', () => {
    expect(run(FIXTURE_2).checks.filter((c) => c.ok === false)).toEqual([]);
  });

  it('reconciles a breakdown containing a negative row', () => {
    // 40 base − 10 (Armure Protectrice) + 180 (discard) = 210. Before the fix
    // the negative row was dropped and the sum came out at 220.
    const check = run(FIXTURE_2).checks.find(
      (c) => c.kind === 'damage-sum' && c.detail.includes('= 210'),
    );
    expect(check?.ok).toBe(true);
  });

  it('reads the winner from the other end-of-game spelling', () => {
    expect(parseGame(FIXTURE_2)).toMatchObject({
      me: 'Hisshiden',
      result: 'win',
      prizesMe: 6,
      prizesOpponent: 1,
    });
  });
});

describe('parseGame', () => {
  it('derives the game summary from the reconstruction', () => {
    const g = parseGame(FIXTURE);
    expect(g.me).toBe('Hisshiden');
    expect(g.opponent).toBe('Bklee219');
    expect(g.result).toBe('loss');
    expect(g.prizesMe).toBe(3);
    expect(g.prizesOpponent).toBe(6);
    expect(g.turns).toBe(10);
    expect(g.validation.ok).toBe(true);
    expect(g.unknown).toEqual([]);
  });

  it('identifies the exporting player by whose hand is visible', () => {
    expect(parseGame(FIXTURE).me).toBe('Hisshiden');
  });

  it('hashes the log so the same game cannot be uploaded twice', () => {
    const a = parseGame(FIXTURE).logHash;
    const b = parseGame(`${FIXTURE}\n\n`).logHash; // trailing whitespace only
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
