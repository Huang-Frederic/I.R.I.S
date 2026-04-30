import { describe, expect, it } from 'vitest';
import { detectNumberMismatch } from './pokedex-mismatch';

describe('detectNumberMismatch', () => {
  it('returns false when the slot is not locked (free scan, no expectation)', () => {
    expect(
      detectNumberMismatch({ lockedPokemonNumber: undefined, detectedPokemonNumber: 25 }),
    ).toBe(false);
  });

  it('returns false when nothing has been detected yet (idle / pre-scan)', () => {
    expect(
      detectNumberMismatch({ lockedPokemonNumber: 387, detectedPokemonNumber: null }),
    ).toBe(false);
  });

  it('returns false when detected matches the locked slot', () => {
    expect(
      detectNumberMismatch({ lockedPokemonNumber: 387, detectedPokemonNumber: 387 }),
    ).toBe(false);
  });

  it('returns true when the scanned card belongs to a different pokémon', () => {
    // The bug: opening the Herbizarre (#387) slot, scanning a Simiabraz (#391)
    // card. Hard block must fire so the user cannot save.
    expect(
      detectNumberMismatch({ lockedPokemonNumber: 387, detectedPokemonNumber: 391 }),
    ).toBe(true);
  });
});
