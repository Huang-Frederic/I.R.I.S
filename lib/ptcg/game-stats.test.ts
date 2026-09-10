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

  it('parses a log with no card set ids (the other export format)', () => {
    const log = [
      'Hisshiden a joué Héricendre de Luth sur le Poste Actif.', // setup, no "(id)"
      'Tour de Hisshiden',
      'Hisshiden a joué Ordres du Boss.',
    ].join('\n');
    const s = extractGameStats(log, 'Hisshiden');
    expect(s.starter).toBe('Héricendre de Luth');
    expect(s.cardUse['Ordres du Boss'].played).toBe(1);
  });

  it('never throws on an unrelated paste', () => {
    expect(() => extractGameStats('bonjour\nceci n est pas un log', 'X')).not.toThrow();
  });
});

describe('deck-agnostic metrics', () => {
  it('counts the Pokémon I have in play at the end of my turn 2', () => {
    const log = [
      'Hisshiden a joué (a) Aspicot sur le Poste Actif.',
      'Tour de Hisshiden',
      'Hisshiden a joué (b) Insolourdo sur le Banc.',
      'Tour de Alice',
      'Tour de Hisshiden',
      'Hisshiden a joué (c) Miaouss-ex sur le Banc.',
      'Tour de Alice',
      'Tour de Hisshiden',
      'Hisshiden a joué (d) Favianos-ex sur le Banc.',
    ].join('\n');
    // Three by the end of turn 2 — the fourth came down on turn 3.
    expect(extractGameStats(log, 'Hisshiden').boardT2).toBe(3);
  });

  it('records the turn of my first attack, and ignores the opponent attacking', () => {
    const log = [
      'Tour de Hisshiden',
      'Tour de Alice',
      '(x) Zoroark-ex de N de Alice a utilisé Griffe Sombre sur (y) Aspicot de Hisshiden et a infligé 60 dégâts.',
      'Tour de Hisshiden',
      '(y) Dardargnan-ex de Hisshiden a utilisé Dard Mortel sur (x) Zorua de N de Alice et a infligé 200 dégâts.',
    ].join('\n');
    expect(extractGameStats(log, 'Hisshiden').firstAttackTurn).toBe(2);
  });

  it('leaves the first-attack turn null when I never attacked', () => {
    expect(extractGameStats('Tour de Hisshiden', 'Hisshiden').firstAttackTurn).toBeNull();
  });

  it('counts my turns on which I played a Supporter, once per turn', () => {
    const supporters = new Set(['Détermination de Lilie', 'Ordres du Boss']);
    const log = [
      'Tour de Hisshiden',
      'Hisshiden a joué (a) Détermination de Lilie.',
      'Tour de Alice',
      'Alice a joué (a) Ordres du Boss.', // not mine
      'Tour de Hisshiden',
      'Hisshiden a joué (b) Hyper Ball.', // an Item, not a Supporter
      'Tour de Hisshiden',
      'Hisshiden a joué (c) Ordres du Boss.',
      'Hisshiden a joué (d) Détermination de Lilie.', // a second one, same turn
    ].join('\n');
    const s = extractGameStats(log, 'Hisshiden', supporters);
    expect(s.supporterTurns).toBe(2);
    expect(s.myTurns).toBe(3);
  });

  it('counts the cards I drew, excluding my opening hand', () => {
    const log = [
      'Hisshiden a pioché 7 cartes pour sa main de départ.',
      'Tour de Hisshiden',
      'Hisshiden a pioché une carte.',
      'Hisshiden a joué (a) Poké Registre.',
      '- Hisshiden a pioché 2 cartes.',
      'Alice a pioché 5 cartes.', // not mine
      'Tour de Hisshiden',
      'Hisshiden a pioché (b) Hyper Ball.',
    ].join('\n');
    expect(extractGameStats(log, 'Hisshiden').cardsDrawn).toBe(4);
  });

  it('records who took the very first prize card', () => {
    const mine = [
      'Hisshiden a récupéré une carte Récompense.',
      'Alice a récupéré une carte Récompense.',
    ];
    expect(extractGameStats(mine.join('\n'), 'Hisshiden').firstPrize).toBe('me');
    expect(extractGameStats([...mine].reverse().join('\n'), 'Hisshiden').firstPrize).toBe(
      'opponent',
    );
    expect(extractGameStats('rien', 'Hisshiden').firstPrize).toBeNull();
  });
});

describe('aggregateStats', () => {
  const mk = (over: Partial<GameForStats>): GameForStats => ({
    stats: extractGameStats('', 'X'),
    result: 'win',
    play_score: 100,
    myArchetype: 'Typhlosion / Dudunsparce',
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

  it('averages the turn-2 board size and the cards drawn per game', () => {
    const rows = [
      mk({ stats: { ...extractGameStats('', 'X'), boardT2: 4, cardsDrawn: 30 } }),
      mk({ stats: { ...extractGameStats('', 'X'), boardT2: 2, cardsDrawn: 20 } }),
    ];
    const a = aggregateStats(rows);
    expect(a.boardT2Avg).toBe(3);
    expect(a.drawnPerGame).toBe(25);
  });

  it('rates setup speed by the first evolution and the first attack landing by T2', () => {
    const rows = [
      mk({ stats: { ...extractGameStats('', 'X'), evoTurn: { A: 2 }, firstAttackTurn: 2 } }),
      mk({ stats: { ...extractGameStats('', 'X'), evoTurn: { A: 4, B: 3 }, firstAttackTurn: 5 } }),
      // Never evolved, never attacked — counts as a game, not as a success.
      mk({ stats: { ...extractGameStats('', 'X'), evoTurn: {}, firstAttackTurn: null } }),
    ];
    const a = aggregateStats(rows);
    expect(a.evoByT2Pct).toBeCloseTo(33.3, 0);
    expect(a.attackByT2Pct).toBeCloseTo(33.3, 0);
  });

  it('rates Supporters over turns played, not over games', () => {
    const rows = [
      mk({ stats: { ...extractGameStats('', 'X'), myTurns: 10, supporterTurns: 8 } }),
      mk({ stats: { ...extractGameStats('', 'X'), myTurns: 10, supporterTurns: 2 } }),
    ];
    expect(aggregateStats(rows).supporterTurnPct).toBe(50);
  });

  it('rates the first prize over games that actually had one', () => {
    const rows = [
      mk({ stats: { ...extractGameStats('', 'X'), firstPrize: 'me' } }),
      mk({ stats: { ...extractGameStats('', 'X'), firstPrize: 'opponent' } }),
      // A game where no prize was ever taken must not count against me.
      mk({ stats: { ...extractGameStats('', 'X'), firstPrize: null } }),
    ];
    expect(aggregateStats(rows).firstPrizePct).toBe(50);
  });

  it('averages KOs dealt, KOs taken and game length', () => {
    const rows = [
      mk({ stats: { ...extractGameStats('', 'X'), kosDealt: 6, kosTaken: 2, myTurns: 8 } }),
      mk({ stats: { ...extractGameStats('', 'X'), kosDealt: 2, kosTaken: 6, myTurns: 12 } }),
    ];
    const a = aggregateStats(rows);
    expect(a.kosDealtAvg).toBe(4);
    expect(a.kosTakenAvg).toBe(4);
    expect(a.turnsAvg).toBe(10);
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
