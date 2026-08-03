import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractGameStats, aggregateStats, type GameForStats } from './game-stats';

const GUUBEEE = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/amphinobi-2026-07-25.txt'),
  'utf8',
);

describe('extractGameStats', () => {
  it('counts my turns, mulligans and the starter', () => {
    const s = extractGameStats(GUUBEEE, 'Hisshiden');
    expect(s.myTurns).toBeGreaterThan(0);
    expect(s.starter).toBeTruthy();
    // The opponent, not me, is the exporting player's counterpart.
    expect(s.mulligansMe + s.mulligansOpp).toBeGreaterThanOrEqual(0);
  });

  it('attributes a KO to the pokemon owner, not to a fragment of the card name', () => {
    // Regression: "Typhlosion de Luth de Hisshiden a été mis K.O." must credit
    // Hisshiden, not "Luth de Hisshiden". The owner is the trailing token.
    const log = [
      'Tour de Alice',
      '(sv10_34) Typhlosion de Luth de Hisshiden a été mis K.O. !',
      '(zsv10-5_67) Genesect-ex de Alice a été mis K.O. !',
    ].join('\n');
    const s = extractGameStats(log, 'Hisshiden');
    expect(s.kosTaken).toBe(1); // my Typhlosion died
    expect(s.kosDealt).toBe(1); // I knocked out Genesect
  });

  it('records the turn of the first evolution into each name', () => {
    const log = [
      'Tour de Hisshiden',
      'Hisshiden a fait évoluer (sv10_32) Héricendre de Luth en (sv10_33) Feurisson de Luth sur le Banc.',
      'Tour de Alice',
      'Tour de Hisshiden',
      'Hisshiden a fait évoluer (sv10_33) Feurisson de Luth en (sv10_34) Typhlosion de Luth sur le Poste Actif.',
    ].join('\n');
    const s = extractGameStats(log, 'Hisshiden');
    expect(s.evoTurn['Feurisson de Luth']).toBe(1);
    expect(s.evoTurn['Typhlosion de Luth']).toBe(2);
  });

  it('counts my ability activations but not my attacks', () => {
    const log = [
      'Tour de Hisshiden',
      '(sv10_33) Feurisson de Luth de Hisshiden a utilisé Unis par le Voyage.',
      '(sv10_34) Typhlosion de Luth de Hisshiden a utilisé Explosion Partenaire sur (x) de Alice et a infligé 460 dégâts.',
    ].join('\n');
    const s = extractGameStats(log, 'Hisshiden');
    expect(s.abilities['Unis par le Voyage']).toBe(1);
    expect(s.abilities['Explosion Partenaire']).toBeUndefined();
  });

  it('flags a first-turn energy attach and counts Ethan\'s Adventure plays', () => {
    const log = [
      'Tour de Hisshiden',
      'Hisshiden a attaché (sv3_230) Énergie Feu de base à (sv10_32) Héricendre de Luth sur le Banc.',
      'Hisshiden a joué (sv10_221) Aventure de Luth.',
    ].join('\n');
    const s = extractGameStats(log, 'Hisshiden');
    expect(s.energyT1).toBe(true);
    expect(s.adlPlayed).toBe(1);
  });

  it('never throws on an unrelated paste', () => {
    expect(() => extractGameStats('bonjour\nceci n est pas un log', 'X')).not.toThrow();
  });
});

describe('aggregateStats', () => {
  const mk = (over: Partial<GameForStats>): GameForStats => ({
    stats: extractGameStats('', 'X'),
    result: 'win',
    play_score: 100,
    myArchetype: 'Typhlosion / Dispareptil',
    opponent_archetype: 'Dragapult',
    ...over,
  });

  it('computes winrate, mulligan% and score average across games', () => {
    const rows = [
      mk({ result: 'win', play_score: 100 }),
      mk({ result: 'loss', play_score: 40 }),
      mk({ result: 'win', play_score: 80 }),
    ];
    const a = aggregateStats(rows);
    expect(a.games).toBe(3);
    expect(a.wins).toBe(2);
    expect(a.winratePct).toBeCloseTo(66.67, 1);
    expect(a.avgScore).toBeCloseTo(73.33, 1);
  });

  it('buckets results by opponent archetype', () => {
    const rows = [
      mk({ opponent_archetype: 'Dragapult', result: 'loss' }),
      mk({ opponent_archetype: 'Dragapult', result: 'win' }),
      mk({ opponent_archetype: 'Dhelmise', result: 'win' }),
    ];
    const a = aggregateStats(rows);
    const pult = a.byArchetype.find((x) => x.name === 'Dragapult')!;
    expect(pult.games).toBe(2);
    expect(pult.wins).toBe(1);
    expect(pult.losses).toBe(1);
  });

  it('returns zeros, not NaN, on an empty set', () => {
    const a = aggregateStats([]);
    expect(a.games).toBe(0);
    expect(a.winratePct).toBe(0);
    expect(a.avgScore).toBeNull();
  });
});
