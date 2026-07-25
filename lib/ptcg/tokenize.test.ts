import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenize';

const FIXTURE = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/amphinobi-2026-07-25.txt'),
  'utf8',
);

/** Second real game — mulligan, stadium activation, hand disruption, a win. */
const FIXTURE_2 = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/minotaupe-2026-07-26.txt'),
  'utf8',
);

const countTypes = (events: ReturnType<typeof tokenize>['events']) => {
  const counts: Record<string, number> = {};
  const walk = (e: (typeof events)[number]) => {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    (e.children ?? []).forEach(walk);
  };
  events.forEach(walk);
  return counts;
};

describe('tokenize', () => {
  it('identifies both players from the turn headers', () => {
    expect(tokenize(FIXTURE).players).toEqual(['Hisshiden', 'Bklee219']);
  });

  it('recognises every line of a real game', () => {
    // The whole design rests on nothing being dropped silently: an unrecognised
    // line means a phrasing we do not model, and a reconstruction missing part
    // of the game. This must stay at zero.
    expect(tokenize(FIXTURE).unknown).toEqual([]);
  });

  it('throws rather than guess when the players cannot be identified', () => {
    expect(() => tokenize('Préparation\nquelque chose\n')).toThrow(/Expected exactly 2 players/);
  });

  it('parses the structural events of the game', () => {
    const counts = countTypes(tokenize(FIXTURE).events);
    expect(counts['turn-start']).toBe(10);
    expect(counts.attack).toBe(7);
    expect(counts.ko).toBe(6);
    expect(counts['take-prize']).toBe(6);
    expect(counts['damage-analysis']).toBe(6);
    expect(counts['game-end']).toBe(1);
  });

  it('splits card names containing " de " from the player handle', () => {
    // `Typhlosion de Luth de Hisshiden` is only decidable once the handles are
    // known — a naive pattern reads the name as "Typhlosion" and the player as
    // "Luth de Hisshiden".
    const attack = tokenize(FIXTURE).events.find(
      (e) => e.type === 'attack' && e.move === 'Hélice Ninja',
    )!;
    expect(attack.target).toEqual({ id: 'sv8-5_71', name: 'Fantyrm' });
    expect(attack.targetPlayer).toBe('Hisshiden');
    expect(attack.player).toBe('Bklee219');
  });

  it('attaches damage-analysis rows to their attack', () => {
    const partner = tokenize(FIXTURE).events.find((e) => e.move === 'Explosion Partenaire')!;
    const analysis = partner.children!.find((c) => c.type === 'damage-analysis')!;
    expect(analysis.entries).toEqual([
      { label: 'Dégâts de base', damage: 40 },
      { label: 'Cri de Victoire (talent)', damage: 10 },
      { label: '(rsv10-5_80) Bracelet Vaillant (Outil Pokémon)', damage: 30 },
      { label: '(3) cartes dans la pile de défausse', damage: 180 },
      { label: 'Total de dégâts', damage: 260 },
    ]);
  });

  it('reads the opening hand as a card list', () => {
    const opening = tokenize(FIXTURE).events.find(
      (e) => e.type === 'opening-hand' && e.player === 'Hisshiden',
    )!;
    const detail = opening.children!.find((c) => c.type === 'opening-hand-count')!;
    expect(detail.cards).toHaveLength(7);
    expect(detail.cards!.map((c) => c.id)).toContain('sv10_33');
  });

  it('recognises every line of a second, different game', () => {
    // This game introduced six phrasings the first one never produced. Each was
    // found by `unknown` rather than by silently mis-parsing the game.
    expect(tokenize(FIXTURE_2).unknown).toEqual([]);
  });

  it('reads a mulligan and the hand it reveals', () => {
    const evs = tokenize(FIXTURE_2).events;
    const mulligan = evs.find((e) => e.type === 'mulligan')!;
    expect(mulligan).toMatchObject({ player: 'Fumpky', count: 1 });
    // The one moment the opponent's hand is visible — it hints at their deck.
    const reveal = evs.flatMap((e) => e.children ?? []).find((c) => c.type === 'mulligan-reveal')!;
    expect(reveal.cards).toHaveLength(7);
    expect(evs.some((e) => e.type === 'mulligan-bonus-draw')).toBe(true);
  });

  it('separates activating a Stadium from playing a card', () => {
    // "Fumpky a joué Carrière Fossile." — no card id, so it is the Stadium in
    // play being used, not a Trainer being played from hand.
    const evs = tokenize(FIXTURE_2).events;
    expect(evs.find((e) => e.type === 'use-stadium')).toMatchObject({
      player: 'Fumpky',
      stadium: 'Carrière Fossile',
    });
    // The Stadium being played from hand still parses as a Stadium.
    expect(evs.some((e) => e.type === 'play-stadium')).toBe(true);
  });

  it('reads cards forced out of the opponent hand', () => {
    const disruption = tokenize(FIXTURE_2)
      .events.flatMap((e) => e.children ?? [])
      .find((c) => c.type === 'discard-opponent-hand')!;
    expect(disruption).toMatchObject({ actor: 'Fumpky', player: 'Hisshiden', count: 2 });
    expect(disruption.cards).toHaveLength(2);
  });

  it('parses a negative damage row', () => {
    // A damage-reduction ability shows as "-10 dégâts". Dropping it makes the
    // rows stop summing to the total, which the oracle reports as a failure.
    const analysis = tokenize(FIXTURE_2)
      .events.flatMap((e) => e.children ?? [])
      .find((c) => c.entries?.some((x) => x.damage < 0))!;
    expect(analysis.entries).toContainEqual({ label: 'Armure Protectrice (talent)', damage: -10 });
  });

  it('recognises the winning-side spelling of the end of game', () => {
    // "Toutes les cartes Récompense ont été récupérées. X gagne." is only ever
    // emitted when the exporting player wins; losing produces a different line.
    expect(tokenize(FIXTURE_2).events.find((e) => e.type === 'game-end')).toMatchObject({
      winner: 'Hisshiden',
    });
  });

  it('keeps the announced owner of damage counters without trusting it', () => {
    // The log claims Bklee219 places counters on their own Héricendre; it is
    // Hisshiden's. The tokenizer reports what was written, state.ts corrects it.
    const place = tokenize(FIXTURE)
      .events.flatMap((e) => e.children ?? [])
      .find((c) => c.type === 'place-damage')!;
    expect(place.claimedOwner).toBe('Bklee219');
    expect(place.counters).toBe(6);
  });
});
