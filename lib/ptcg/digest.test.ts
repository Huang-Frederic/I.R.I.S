import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PtcgCardRow } from '@/lib/types';
import { parseGame } from './index';
import { buildDigest } from './digest';

const FIXTURE = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/amphinobi-2026-07-25.txt'),
  'utf8',
);

/** Minimal card rows — enough for the assertions, and no network in tests. */
const card = (p: Partial<PtcgCardRow> & { ptcgl_id: string; name: string }): PtcgCardRow => ({
  language: 'FR',
  tcgdex_id: '',
  set_code: '',
  set_number: '',
  category: 'Pokémon',
  trainer_type: null,
  stage: null,
  hp: null,
  types: null,
  weaknesses: null,
  retreat: null,
  abilities: [],
  attacks: [],
  effect: null,
  image_url: null,
  fetched_at: '',
  ...p,
});

const CARDS: Record<string, PtcgCardRow> = Object.fromEntries(
  [
    card({
      ptcgl_id: 'sv10_33',
      name: 'Feurisson de Luth',
      hp: 100,
      stage: 'Niveau 1',
      abilities: [
        {
          name: 'Unis par le Voyage',
          effect:
            'Une fois pendant votre tour, vous pouvez chercher dans votre deck une carte Aventure de Luth.',
        },
      ],
      attacks: [{ name: 'Fournaise', cost: ['Feu'], damage: '40', effect: null }],
    }),
    card({
      ptcgl_id: 'sv6-5_38',
      name: 'Favianos-ex',
      hp: 210,
      // Once-per-turn, but only after one of your Pokémon was knocked out.
      abilities: [
        {
          name: 'Renverser la Tendance',
          effect:
            "Une fois pendant votre tour, si l'un de vos Pokémon a été mis K.O. pendant le dernier tour de votre adversaire, vous pouvez piocher 3 cartes.",
        },
      ],
    }),
    card({
      ptcgl_id: 'sv8_21',
      name: 'Victini',
      hp: 70,
      // Passive: not once-per-turn, and must not be reported as skipped.
      abilities: [
        {
          name: 'Cri de Victoire',
          effect:
            'Les attaques utilisées par vos Pokémon Évolutifs infligent 10 dégâts supplémentaires.',
        },
      ],
    }),
    card({
      ptcgl_id: 'sv10_34',
      name: 'Typhlosion de Luth',
      hp: 170,
      stage: 'Niveau 2',
      attacks: [
        {
          name: 'Explosion Partenaire',
          cost: ['Feu'],
          damage: '40+',
          effect:
            'Cette attaque inflige 60 dégâts supplémentaires pour chaque carte Aventure de Luth dans votre pile de défausse.',
        },
        {
          name: 'Artillerie Vapeur',
          cost: ['Feu', 'Feu', 'Incolore'],
          damage: '160',
          effect: null,
        },
      ],
    }),
    card({
      ptcgl_id: 'sv10_221',
      name: 'Aventure de Luth',
      category: 'Dresseur',
      trainer_type: 'Supporter',
    }),
    card({ ptcgl_id: 'sv1_196', name: 'Hyper Ball', category: 'Dresseur', trainer_type: 'Objet' }),
    card({ ptcgl_id: 'sv3_230', name: 'Énergie Feu de base', category: 'Énergie' }),
    card({ ptcgl_id: 'me4_116', name: 'Méga-Amphinobi-ex', hp: 350, stage: 'Niveau 2' }),
    card({ ptcgl_id: 'me2-5_150', name: 'Minidraco', hp: 70 }),
    card({ ptcgl_id: 'sv8-5_71', name: 'Fantyrm', hp: 70 }),
  ].map((c) => [c.ptcgl_id, c]),
);

const parsed = parseGame(FIXTURE);
const digest = buildDigest(parsed, CARDS, { gameId: 'test', playedAt: '2026-07-25T00:00:00Z' });
const turn = (n: number) => digest.turns.find((t) => t.n === n)!;

describe('buildDigest', () => {
  it('summarises the game', () => {
    expect(digest.meta.me).toBe('Hisshiden');
    expect(digest.meta.prizesTaken).toEqual({ me: 3, opponent: 6 });
    expect(digest.validationOk).toBe(true);
    expect(digest.turns).toHaveLength(10);
  });

  it('labels each turn from the exporting player point of view', () => {
    expect(turn(1).player).toBe('me');
    expect(turn(2).player).toBe('opponent');
  });

  it('catches the ability that was available and never used', () => {
    // Turn 5: two Feurisson in play, one "Unis par le Voyage" triggered. The
    // second opportunity is lost when that Feurisson evolves into Typhlosion
    // later in the same turn — so it is invisible in the end-of-turn board.
    const skipped = turn(5).available.unusedAbilities;
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ card: 'Feurisson de Luth', ability: 'Unis par le Voyage' });
  });

  it('marks a conditional ability so it is not read as a missed opportunity', () => {
    // Favianos-ex only fires after one of your Pokémon was knocked out, so it
    // reads as "unused" on every quiet turn. In the Lucario game that happened
    // three times — reporting them as mistakes would be three false
    // accusations in a single analysis.
    const lucario = buildDigest(
      parseGame(
        readFileSync(join(process.cwd(), 'lib/ptcg/fixtures/lucario-2026-07-26.txt'), 'utf8'),
      ),
      CARDS,
      { gameId: 'test', playedAt: '2026-07-26T00:00:00Z' },
    );
    const unused = lucario.turns.flatMap((t) => t.available.unusedAbilities);

    const conditional = unused.filter((a) => a.ability === 'Renverser la Tendance');
    expect(conditional.length).toBeGreaterThan(0);
    expect(conditional.every((a) => a.conditional)).toBe(true);

    // An unconditional one stays unflagged, so the distinction is usable.
    const plain = unused.filter((a) => a.ability === 'Unis par le Voyage');
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((a) => a.conditional)).toBe(false);
  });

  it('does not flag a passive ability as skipped', () => {
    // Victini is on the board all game; Cri de Victoire is not once-per-turn.
    const all = digest.turns.flatMap((t) => t.available.unusedAbilities);
    expect(all.some((a) => a.ability === 'Cri de Victoire')).toBe(false);
  });

  it('reports whether the turn used its Supporter and its energy', () => {
    // Turn 1: Hyper Ball is an Item, and nothing was attached.
    expect(turn(1).available.supporterPlayed).toBe(false);
    expect(turn(1).available.energyAttached).toBe(false);
    // Turn 5: Aventure de Luth is a Supporter, and a Fire energy went down.
    expect(turn(5).available.supporterPlayed).toBe(true);
    expect(turn(5).available.energyAttached).toBe(true);
  });

  it('exposes every card held at any point in the turn', () => {
    // Not just the opening hand: Poffin is drawn during turn 5, and a claim of
    // "you could have played it" has to account for cards drawn mid-turn.
    const held = turn(5).available.playableFromHand;
    expect(held).toContain('Super Bonbon'); // carried in from earlier
    expect(held).toContain('Poffin Copain-Copain'); // drawn this turn
  });

  it('declines to estimate damage it cannot compute', () => {
    // Turn 7 has a stadium in play (Montagne Gravité takes 30 off every Stage 2),
    // so printed HP is not effective HP and no number is offered.
    expect(turn(7).end.stadium).not.toBeNull();
    expect(turn(7).available.damageIfAttackNow).toBeNull();
  });

  it('offers a number only for a flat-damage attack', () => {
    const quoted = digest.turns.map((t) => t.available.damageIfAttackNow).filter(Boolean);
    for (const d of quoted) expect(Number.isInteger(d!.total)).toBe(true);
  });

  it('stays far smaller than the raw reconstruction', () => {
    // The point of the digest: the full snapshot list is mostly redundant.
    const full = JSON.stringify(parsed.state).length;
    const small = JSON.stringify(digest).length;
    expect(small).toBeLessThan(full / 2);
  });
});
