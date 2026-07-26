import { describe, expect, it } from 'vitest';
import { candidateIds, energyTypeFromName, looseNameMatch, normaliseName } from './cards';

describe('candidateIds', () => {
  it('pads the card number to three digits', () => {
    expect(candidateIds('sv10_34')).toContain('sv10-034');
    expect(candidateIds('sv8_21')).toContain('sv08-021');
  });

  it('pads a one-digit set number', () => {
    expect(candidateIds('sv1_196')).toContain('sv01-196');
    expect(candidateIds('me3_81')).toContain('me03-081');
  });

  it('turns a trailing -5 into a half set', () => {
    expect(candidateIds('sv8-5_71')).toContain('sv08.5-071');
    expect(candidateIds('me2-5_150')).toContain('me02.5-150');
  });

  it('offers both halves of a split set', () => {
    // sv10.5b-164 is Majaspic-ex, sv10.5w-164 is Ludvina. Both are real cards,
    // which is why resolveCards must check the printed name before accepting.
    const c = candidateIds('rsv10-5_164');
    expect(c).toContain('sv10.5w-164');
    expect(c).toContain('sv10.5b-164');
  });

  it('strips the reprint prefix', () => {
    expect(candidateIds('rsv10-5_80').some((id) => id.startsWith('sv10.5'))).toBe(true);
  });

  it('ignores a variant suffix', () => {
    expect(candidateIds('me2-5_151_ph2')).toContain('me02.5-151');
  });

  it('returns nothing for an id it cannot read', () => {
    expect(candidateIds('nonsense')).toEqual([]);
    expect(candidateIds('sv10_abc')).toEqual([]);
  });
});

describe('normaliseName', () => {
  it('ignores accents, case and punctuation', () => {
    expect(normaliseName('Méga-Amphinobi-ex')).toBe(normaliseName('mega amphinobi ex'));
  });

  it('realigns energy types TCGdex left in English', () => {
    // sv03-230 is named "Énergie Fire de base" in the French dataset.
    expect(normaliseName('Énergie Fire de base')).toBe(normaliseName('Énergie Feu de base'));
    expect(normaliseName('Lightning')).toBe(normaliseName('Électrique'));
  });

  it('keeps different cards apart', () => {
    expect(normaliseName('Ludvina')).not.toBe(normaliseName('Majaspic-ex'));
  });
});

describe('looseNameMatch', () => {
  it('accepts a missing "de base" suffix', () => {
    expect(looseNameMatch(normaliseName('Énergie Eau'), normaliseName('Énergie Eau de base'))).toBe(
      true,
    );
  });

  it('still rejects a different card', () => {
    expect(looseNameMatch(normaliseName('Ludvina'), normaliseName('Majaspic-ex'))).toBe(false);
  });
});

describe('energyTypeFromName', () => {
  it('reads a basic energy type off its French name', () => {
    // TCGdex leaves `types` empty here; energyType says "De base", not Combat.
    expect(energyTypeFromName('Énergie', 'Énergie Combat')).toEqual(['Combat']);
    expect(energyTypeFromName('Énergie', 'Énergie Eau de base')).toEqual(['Eau']);
  });

  it('accepts the English type words TCGdex mixes in', () => {
    // Real row: "Énergie Fire de base" — its own naming is not consistent.
    expect(energyTypeFromName('Énergie', 'Énergie Fire de base')).toEqual(['Feu']);
  });

  it('handles accents both ways', () => {
    expect(energyTypeFromName('Énergie', 'Énergie Électrique')).toEqual(['Électrique']);
    expect(energyTypeFromName('Énergie', 'Energie Obscurite de base')).toEqual(['Obscurité']);
  });

  it('ignores anything that is not an Energy card', () => {
    // A Trainer named after a type must never look like an energy source.
    expect(energyTypeFromName('Dresseur', 'Gong de Combat')).toBeNull();
    expect(energyTypeFromName('Pokémon', 'Feurisson de Luth')).toBeNull();
  });

  it('returns null on an unknown energy rather than guessing', () => {
    // A wrong type would make an attack look payable when it is not.
    expect(energyTypeFromName('Énergie', 'Énergie Double Turbo')).toBeNull();
  });

  it('returns null without a name', () => {
    expect(energyTypeFromName('Énergie', undefined)).toBeNull();
  });
});
