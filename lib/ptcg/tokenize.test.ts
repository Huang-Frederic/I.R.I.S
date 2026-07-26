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

/** Third real game — concession, singular bench search, hand shuffled to deck. */
const FIXTURE_3 = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/lucario-2026-07-26.txt'),
  'utf8',
);

/**
 * Fourth real game — attaches spelled as sub-lines (Gypso), a singular
 * shuffle-into-deck, damage reported outside an attack, damage prevented by an
 * ability, and three copies of the same ex in play.
 */
const FIXTURE_4 = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/zacian-2026-07-26.txt'),
  'utf8',
);

/**
 * Fifth real game — a Team Rocket deck. Card names ending in "de la Team
 * Rocket" next to a handle, a Special Energy activating, a damage analysis with
 * no Total row, and a loss by having no Pokémon left to promote.
 */
const FIXTURE_5 = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/rocket-2026-07-26.txt'),
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

  it('recognises every line of a third game', () => {
    expect(tokenize(FIXTURE_3).unknown).toEqual([]);
  });

  it('reads a win by concession', () => {
    // A third end-of-game spelling. Missing it made the game read as a tie.
    expect(tokenize(FIXTURE_3).events.find((e) => e.type === 'game-end')).toMatchObject({
      winner: 'Hisshiden',
      byConcession: true,
    });
  });

  it('reads the singular form of searching a Pokémon onto the bench', () => {
    // "a pioché la carte X et l'a jouée sur le Banc" — the plural form names
    // the cards in a bullet list, this one names the card inline.
    const single = tokenize(FIXTURE_3)
      .events.flatMap((e) => e.children ?? [])
      .find((c) => c.type === 'bench-from-deck' && c.count === 1)!;
    expect(single.cards).toEqual([{ id: 'sv8_21', name: 'Victini' }]);
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

describe('tokenize — quatrième partie (Zacian)', () => {
  const result = tokenize(FIXTURE_4);

  it('leaves nothing unrecognised', () => {
    // The whole point of the unknown list: a new phrasing announces itself
    // rather than quietly producing a reconstruction missing part of the game.
    expect(result.unknown).toEqual([]);
  });

  it('reads an attach spelled as a sub-line', () => {
    // Gypso attaches two energies, each resolved under itself. Missing these
    // under-counts what is in play until a knockout exposes it.
    const subAttaches = result.events.flatMap((e) =>
      (e.children ?? []).filter((c) => c.type === 'attach'),
    );
    expect(subAttaches.length).toBe(2);
    expect(subAttaches[0].card).toMatchObject({ id: 'mee_8' });
    expect(subAttaches[0].target).toMatchObject({ id: 'sv9_186' });
  });

  it('reads the singular shuffle-into-deck', () => {
    // "une carte" rather than "N cartes", with no bullet list to fall back on.
    const singles = result.events.flatMap((e) =>
      (e.children ?? []).filter((c) => c.type === 'shuffle-into-deck' && c.count === 1 && !c.cards),
    );
    expect(singles.length).toBeGreaterThanOrEqual(1);
  });

  it('reads damage reported outside an attack', () => {
    const received = result.events.flatMap((e) =>
      (e.children ?? []).filter((c) => c.type === 'place-damage' && c.counters === 30),
    );
    expect(received.length).toBeGreaterThanOrEqual(1);
  });

  it('reads prevented damage without applying any', () => {
    // Shaymin's Rideau de Fleurs. No state change, but a real defensive play
    // must not read as a hole in the log.
    const prevented = result.events.flatMap((e) =>
      (e.children ?? []).filter((c) => c.type === 'damage-prevented'),
    );
    expect(prevented.length).toBe(1);
    expect(prevented[0].target).toMatchObject({ id: 'sv8-5_71' });
  });
});

describe('tokenize — cinquième partie (Team Rocket)', () => {
  it('leaves nothing unrecognised', () => {
    expect(tokenize(FIXTURE_5).unknown).toEqual([]);
  });

  it('reads a loss with no Pokémon left to promote', () => {
    // A fourth end-of-game spelling, and the log doubles the full stop.
    expect(tokenize(FIXTURE_5).events.find((e) => e.type === 'game-end')).toMatchObject({
      winner: 'Kphillips6196',
    });
  });

  it('reads a Special Energy activating', () => {
    const activated = tokenize(FIXTURE_5).events.filter((e) => e.type === 'energy-activated');
    expect(activated.length).toBe(4);
    expect(activated[0].card).toMatchObject({ id: 'me2_124' });
  });

  it('separates a card name ending in "de la Team Rocket" from the handle', () => {
    // The hardest case for the handle-injection trick: the card name itself
    // ends in " de X", immediately before " de <player>".
    const swap = tokenize(FIXTURE_5)
      .events.flatMap((e) => e.children ?? [])
      .find((c) => c.type === 'swap-active')!;
    expect(swap.incoming).toEqual({ id: 'sv10_200', name: 'Cornèbre de la Team Rocket' });
    expect(swap.player).toBe('Kphillips6196');
  });

  it('is unaffected by the thin no-break spaces French typography inserts', () => {
    // A copy of the same log carrying U+202F before ":" and "!" must parse
    // identically — one invisible character used to take a whole
    // damage-analysis block with it.
    const thin = FIXTURE_5.replace(/ ([:!?;])/g, ' $1');
    expect(tokenize(thin).unknown).toEqual([]);
    expect(tokenize(thin).events.length).toBe(tokenize(FIXTURE_5).events.length);
  });
});
