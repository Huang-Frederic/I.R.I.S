import { describe, expect, it } from 'vitest';
import { extractPokemon, classifyMyDeck, classifyOpponent } from './archetype';

describe('extractPokemon', () => {
  it('collects a player\'s Pokémon from plays, evolutions, abilities and KOs', () => {
    const log = [
      'Guubeee a joué (sv5_113) Terhal sur le Poste Actif.',
      'Guubeee a fait évoluer (sv5_113) Terhal en (sv5_114) Métang sur le Banc.',
      '(zsv10-5_67) Genesect-ex de Guubeee a utilisé Signal Métallique.',
      '(me4_73) Pashmilla-ex de Guubeee a été mis K.O. !',
      // A trainer line must NOT be picked up as a Pokémon.
      'Guubeee a joué (sv10_226) Lambda de la Team Rocket.',
    ].join('\n');
    const p = extractPokemon(log, 'Guubeee');
    expect(p.has('Terhal')).toBe(true);
    expect(p.has('Métang')).toBe(true);
    expect(p.has('Genesect-ex')).toBe(true);
    expect(p.has('Pashmilla-ex')).toBe(true);
    expect([...p].some((x) => x.includes('Lambda'))).toBe(false);
  });

  it('does not attribute the opponent\'s Pokémon to me', () => {
    const log = [
      'Hisshiden a joué (x) Héricendre de Luth sur le Banc.',
      'Alice a joué (y) Lanssorien sur le Poste Actif.',
    ].join('\n');
    expect([...extractPokemon(log, 'Hisshiden')]).toEqual(['Héricendre de Luth']);
  });
});

describe('classifyMyDeck', () => {
  it('names the deck by the line + partner, even if I never reached Stage 2', () => {
    // rocket.txt case: no Typhlosion in play, but Héricendre + Fantyrm is enough.
    const pk = new Set(['Héricendre de Luth', 'Feurisson de Luth', 'Fantyrm', 'Victini']);
    expect(classifyMyDeck(pk)).toBe('Typhlosion / Dispareptil');
  });

  it('distinguishes the Dudunsparce build', () => {
    const pk = new Set(['Typhlosion de Luth', 'Deusolourdo', 'Insolourdo']);
    expect(classifyMyDeck(pk)).toBe('Typhlosion / Deusolourdo');
  });
});

describe('classifyOpponent', () => {
  it('reads a two-Pokémon signature (Dragapult + Blaziken via Torchic)', () => {
    const pk = new Set(['Lanssorien-ex', 'Poussifeu', 'Miaouss-ex']);
    expect(classifyOpponent(pk, null)).toBe('Dragapult / Blaziken');
  });

  it('folds prefixes into the base name ("Zacian-ex de Nabil" → Zacian)', () => {
    expect(classifyOpponent(new Set(['Zacian-ex de Nabil']), null)).toBe("N's Zacian");
  });

  it('classifies the Metagross line from Terhal/Métang alone', () => {
    expect(classifyOpponent(new Set(['Terhal', 'Métang', 'Pashmilla-ex']), null)).toBe('Metagross');
  });

  it('falls back to the ace card when no signature matches', () => {
    expect(classifyOpponent(new Set(['Pokémon Inconnu']), 'Palkia-ex')).toBe('Palkia-ex');
  });

  it('falls back to ? when there is nothing at all', () => {
    expect(classifyOpponent(new Set(), null)).toBe('?');
  });
});
