import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractGameStats, aggregateStats, type GameForStats } from './game-stats';

const GUUBEEE = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/amphinobi-2026-07-25.txt'),
  'utf8',
);

describe('extractGameStats', () => {
  it('counts my turns, the starter, and who went first', () => {
    const s = extractGameStats(GUUBEEE, 'Hisshiden');
    expect(s.myTurns).toBeGreaterThan(0);
    expect(s.starter).toBeTruthy();
    expect(typeof s.wentFirst).toBe('boolean');
  });

  it('reads who took the first turn as the player on the play', () => {
    const first = extractGameStats(
      ['Tour de Hisshiden', 'Tour de Alice', 'Tour de Hisshiden'].join('\n'),
      'Hisshiden',
    );
    expect(first.wentFirst).toBe(true);
    const second = extractGameStats(['Tour de Alice', 'Tour de Hisshiden'].join('\n'), 'Hisshiden');
    expect(second.wentFirst).toBe(false);
    // A game that never reached a turn (conceded in setup) is unknown.
    expect(extractGameStats('rien', 'Hisshiden').wentFirst).toBeNull();
  });

  it('attributes a KO to the pokemon owner, not to a fragment of the card name', () => {
    const log = [
      'Tour de Alice',
      '(sv10_34) Typhlosion de Luth de Hisshiden a été mis K.O. !',
      '(zsv10-5_67) Genesect-ex de Alice a été mis K.O. !',
    ].join('\n');
    const s = extractGameStats(log, 'Hisshiden');
    expect(s.kosTaken).toBe(1);
    expect(s.kosDealt).toBe(1);
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
    expect(s.abilityGames).toContain('Unis par le Voyage');
  });

  it('flags a developed turn-2 board: a Dunsparce line and two Typhlosion-line', () => {
    const log = [
      'Hisshiden a joué (a) Héricendre de Luth sur le Poste Actif.', // setup active
      'Hisshiden a joué (b) Insolourdo sur le Banc.', // setup bench
      'Tour de Hisshiden', // T1
      'Hisshiden a joué (c) Héricendre de Luth sur le Banc.',
      'Tour de Alice',
      'Tour de Hisshiden', // T2
      'Hisshiden a fait évoluer (a) Héricendre de Luth en (d) Feurisson de Luth sur le Poste Actif.',
      'Tour de Alice', // leaving my T2 → snapshot
    ].join('\n');
    expect(extractGameStats(log, 'Hisshiden').goodBenchT2).toBe(true);
  });

  it('does not flag a thin turn-2 board', () => {
    const log = [
      'Hisshiden a joué (a) Héricendre de Luth sur le Poste Actif.',
      'Tour de Hisshiden',
      'Tour de Alice',
      'Tour de Hisshiden', // T2, only one Pokémon, no Dunsparce
      'Tour de Alice',
    ].join('\n');
    expect(extractGameStats(log, 'Hisshiden').goodBenchT2).toBe(false);
  });

  it('counts a KO as Victini-lethal only when its +10 was the margin', () => {
    const mk = (hp: number) =>
      extractGameStats(
        [
          'Tour de Hisshiden',
          '(sv10_34) Typhlosion de Luth de Hisshiden a utilisé Explosion Partenaire sur (x) Dracaufeu-ex de Alice et a infligé 330 dégâts.',
          '   • Cri de Victoire (talent) : 10 dégâts',
          '   • Total de dégâts : 330 dégâts',
          '(x) Dracaufeu-ex de Alice a été mis K.O. !',
        ].join('\n'),
        'Hisshiden',
        { 'dracaufeu-ex': hp },
      );
    // HP 330: 330-10=320 < 330 → Victini was the margin.
    expect(mk(330).victiniKos).toBe(1);
    expect(mk(330).victiniLethal).toBe(1);
    // HP 300: 320 ≥ 300 → the KO landed without the bonus.
    expect(mk(300).victiniLethal).toBe(0);
  });

  it('tracks card plays, tool/energy attaches, and discards', () => {
    const log = [
      'Tour de Hisshiden',
      'Hisshiden a joué (a) Ordres du Boss.',
      'Hisshiden a attaché (b) Bracelet Vaillant à (c) Typhlosion de Luth sur le Poste Actif.',
      'Hisshiden a défaussé (d) Combat Final de Gladio.',
    ].join('\n');
    const s = extractGameStats(log, 'Hisshiden');
    expect(s.cardUse['Ordres du Boss'].played).toBe(1);
    expect(s.cardUse['Bracelet Vaillant'].played).toBe(1); // attach counts as used
    expect(s.cardUse['Combat Final de Gladio'].discarded).toBe(1);
    expect(s.cardUse['Combat Final de Gladio'].played).toBe(0);
  });

  it('counts an evolution as playing that Stage', () => {
    const log = [
      'Tour de Hisshiden',
      'Hisshiden a fait évoluer (a) Héricendre de Luth en (b) Feurisson de Luth sur le Poste Actif.',
    ].join('\n');
    expect(extractGameStats(log, 'Hisshiden').cardUse['Feurisson de Luth'].played).toBe(1);
  });

  it('does not credit me for an opponent Stadium I discard by replacing it', () => {
    const log = [
      'Desiretik a joué (s) Paddoxton comme Stade.', // opponent's stadium
      'Tour de Hisshiden',
      'Hisshiden a joué (c) Tour Prismatique comme Stade.',
      '- Hisshiden a défaussé (s) Paddoxton.', // the log credits me, but it's theirs
    ].join('\n');
    const s = extractGameStats(log, 'Hisshiden');
    expect(s.cardUse['Tour Prismatique'].played).toBe(1);
    expect(s.cardUse['Paddoxton']).toBeUndefined();
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
    myArchetype: 'Typhlosion / Dudunsparce',
    opponent_archetype: 'Dragapult',
    psyduckRelevant: false,
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

  it('splits winrate by who went first', () => {
    const withFirst = (wentFirst: boolean, result: 'win' | 'loss') => {
      const g = mk({ result });
      return { ...g, stats: { ...g.stats, wentFirst } };
    };
    const a = aggregateStats([
      withFirst(true, 'win'),
      withFirst(true, 'win'),
      withFirst(false, 'loss'),
    ]);
    expect(a.first.games).toBe(2);
    expect(a.first.winratePct).toBe(100);
    expect(a.second.games).toBe(1);
    expect(a.second.winratePct).toBe(0);
  });

  it('counts Victini and Psyduck relevance across games', () => {
    const g0 = mk({ psyduckRelevant: true });
    const withVic = {
      ...g0,
      stats: { ...g0.stats, victiniLethalGames: 0, victiniKos: 2, victiniLethal: 1 },
    };
    const a = aggregateStats([withVic, mk({ psyduckRelevant: false })]);
    expect(a.victiniLethalGames).toBe(1);
    expect(a.victiniKoGames).toBe(1);
    expect(a.psyduckRelevantGames).toBe(1);
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

  it('excludes basic energy from the card-usage table', () => {
    const g = mk({});
    g.stats.cardUse = {
      'Énergie Feu de base': { played: 9, discarded: 0 },
      'Ordres du Boss': { played: 2, discarded: 1 },
    };
    const a = aggregateStats([g]);
    expect(a.cards.some((c) => c.name === 'Ordres du Boss')).toBe(true);
    expect(a.cards.some((c) => /Énergie/.test(c.name))).toBe(false);
  });

  it('returns zeros, not NaN, on an empty set', () => {
    const a = aggregateStats([]);
    expect(a.games).toBe(0);
    expect(a.winratePct).toBe(0);
    expect(a.avgScore).toBeNull();
    expect(a.first.games).toBe(0);
    expect(a.first.winratePct).toBe(0);
  });
});
