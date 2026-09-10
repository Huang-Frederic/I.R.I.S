import { describe, expect, it } from 'vitest';
import { extractPokemon, classifyMyDeck, classifyOpponent } from './archetype';

describe('extractPokemon', () => {
  it("collects a player's Pokémon from plays, evolutions, abilities and KOs", () => {
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

  it("does not attribute the opponent's Pokémon to me", () => {
    const log = [
      'Hisshiden a joué (x) Héricendre de Luth sur le Banc.',
      'Alice a joué (y) Lanssorien sur le Poste Actif.',
    ].join('\n');
    expect([...extractPokemon(log, 'Hisshiden')]).toEqual(['Héricendre de Luth']);
  });
});

describe('classifyMyDeck', () => {
  it('names the old build from its Drakloak draw engine', () => {
    const log = [
      'Hisshiden a joué (x) Héricendre de Luth sur le Banc.',
      'Hisshiden a joué (y) Fantyrm sur le Banc.',
    ].join('\n');
    expect(classifyMyDeck(log, 'Hisshiden')).toBe('Typhlosion / Drakloak');
  });

  it('uses MY cards only — the opponent playing Dudunsparce must not relabel me', () => {
    const log = [
      'Hisshiden a joué (x) Fantyrm sur le Banc.',
      'Luigi a joué (y) Insolourdo sur le Banc.', // opponent's engine
    ].join('\n');
    expect(classifyMyDeck(log, 'Hisshiden')).toBe('Typhlosion / Drakloak');
  });

  it('defaults to the current Dudunsparce build when no old-deck signal is present', () => {
    const log = 'Hisshiden a joué (x) Héricendre de Luth sur le Poste Actif.';
    expect(classifyMyDeck(log, 'Hisshiden')).toBe('Typhlosion / Dudunsparce');
  });

  it('reads the Dudunsparce build from a distinguishing trainer', () => {
    const log = 'Hisshiden a joué (x) Tour Prismatique comme Stade.';
    expect(classifyMyDeck(log, 'Hisshiden')).toBe('Typhlosion / Dudunsparce');
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

  it('reads Dragapult from the Dreepy line alone (Dragapult never revealed)', () => {
    expect(classifyOpponent(new Set(['Fantyrm', 'Rozbouton']), null)).toBe('Dragapult');
  });

  it('reads a lone Dusknoir line as Dusknoir', () => {
    expect(classifyOpponent(new Set(['Skelénox']), null)).toBe('Dusknoir');
  });

  it('reads Ogerpon / Meganium (no Hydrapple)', () => {
    expect(
      classifyOpponent(new Set(['Ogerpon Masque Turquoise-ex', 'Méganium', 'Macronium']), null),
    ).toBe('Ogerpon / Meganium');
  });

  it('classifies opponent Garchomp despite the "Carchacrock" spelling', () => {
    expect(
      classifyOpponent(new Set(['Carchacrock-ex de Cynthia', 'Griknot de Cynthia']), null),
    ).toBe('Garchomp');
  });
});

describe('id-less logs (the other PTCG Live export)', () => {
  it('extracts Pokémon from plays and evolutions without the card set id', () => {
    const log = [
      'JanuarySky a joué Verpom sur le Poste Actif.',
      'JanuarySky a fait évoluer Verpom en Pomdramour sur le Banc.',
    ].join('\n');
    const p = extractPokemon(log, 'JanuarySky');
    expect(p.has('Verpom')).toBe(true);
    expect(p.has('Pomdramour')).toBe(true);
  });

  it('recognises my Garchomp deck from the "de Cynthia" cards, id or not', () => {
    const log = [
      'Hisshiden a joué Griknot de Cynthia sur le Poste Actif.',
      'Hisshiden a fait évoluer Griknot de Cynthia en Carchacrock-ex de Cynthia sur le Poste Actif.',
    ].join('\n');
    expect(classifyMyDeck(log, 'Hisshiden')).toBe("Cynthia's Garchomp");
  });
});

describe("classifyMyDeck — the Beedrill and N's Zoroark lists", () => {
  it('names the Beedrill deck from its Weedle line', () => {
    const log = [
      'Hisshiden a joué (cri_1) Aspicot sur le Poste Actif.',
      'Hisshiden a fait évoluer (cri_1) Aspicot en (cri_2) Coconfort sur le Poste Actif.',
    ].join('\n');
    expect(classifyMyDeck(log, 'Hisshiden')).toBe('Dardargnan');
  });

  it('names the Beedrill deck even though it also runs the Dudunsparce engine', () => {
    const log = [
      'Hisshiden a joué (tef_128) Insolourdo sur le Poste Actif.',
      'Hisshiden a joué (cri_1) Aspicot sur le Banc.',
    ].join('\n');
    expect(classifyMyDeck(log, 'Hisshiden')).toBe('Dardargnan');
  });

  it("names the N's Zoroark deck from its Zorua line", () => {
    const log = [
      'Hisshiden a joué (jtg_97) Zorua de N sur le Poste Actif.',
      'Hisshiden a fait évoluer (jtg_97) Zorua de N en (jtg_98) Zoroark-ex de N sur le Poste Actif.',
    ].join('\n');
    expect(classifyMyDeck(log, 'Hisshiden')).toBe('Zoroark de N');
  });

  it("names the N's Zoroark deck from N's Castle when no Zorua came down", () => {
    const log = 'Hisshiden a joué (jtg_152) Château de N comme Stade.';
    expect(classifyMyDeck(log, 'Hisshiden')).toBe('Zoroark de N');
  });

  it('uses MY cards only — the opponent playing Zoroark must not relabel me', () => {
    const log = [
      'Hisshiden a joué (x) Héricendre de Luth sur le Poste Actif.',
      'Luigi a joué (jtg_97) Zorua de N sur le Banc.',
    ].join('\n');
    expect(classifyMyDeck(log, 'Hisshiden')).toBe('Typhlosion / Dudunsparce');
  });
});
