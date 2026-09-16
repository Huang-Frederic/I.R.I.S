import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PtcgSnapshot } from '@/lib/types';
import { parseGame } from './index';
import { keyPokemons } from './protagonists';

const load = (name: string) =>
  parseGame(readFileSync(join(process.cwd(), `lib/ptcg/fixtures/${name}`), 'utf8'));

const loss = load('amphinobi-2026-07-25.txt');
const win = load('minotaupe-2026-07-26.txt');

describe('keyPokemons', () => {
  it('returns the top 2 damage-dealers, highest first, dropping the rest', () => {
    // loss.me has 3 damage-dealers: Typhlosion (260), Feurisson (50), Héricendre (30).
    const mine = keyPokemons(loss.state.snapshots, loss.me);
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ name: 'Typhlosion de Luth', damageDealt: 260 });
    expect(mine[1]).toMatchObject({ name: 'Feurisson de Luth', damageDealt: 50 });
  });

  it('returns exactly 2 when exactly 2 Pokémon dealt damage', () => {
    // loss.opponent: Méga-Amphinobi-ex (840) and Amphinobi-ex (340) — the same
    // evolution line, counted separately because summing is by card id.
    const theirs = keyPokemons(loss.state.snapshots, loss.opponent);
    expect(theirs).toEqual([
      { cardId: 'me4_116', name: 'Méga-Amphinobi-ex', damageDealt: 840 },
      { cardId: 'sv6_214', name: 'Amphinobi-ex', damageDealt: 340 },
    ]);
  });

  it('returns a single entry when only one Pokémon dealt damage', () => {
    // win.opponent: only Méga-Minotaupe-ex ever attacked.
    expect(keyPokemons(win.state.snapshots, win.opponent)).toEqual([
      { cardId: 'me5_65', name: 'Méga-Minotaupe-ex', damageDealt: 180 },
    ]);
  });

  it('follows the evolution that did the work, not the one that chipped', () => {
    // Feurisson chipped for 40 before becoming the Typhlosion that dealt over a
    // thousand — summing by card id keeps them separate and both make the top 2.
    const mine = keyPokemons(win.state.snapshots, win.me);
    expect(mine[0].name).toBe('Typhlosion de Luth');
  });

  it('falls back to a single most-active Pokémon when nobody attacked', () => {
    // A game that ends during setup has no attack events at all.
    const setupOnly = loss.state.snapshots.filter((s) => s.turnNumber === 0);
    const p = keyPokemons(setupOnly, loss.me);
    expect(p).toHaveLength(1);
    expect(p[0].damageDealt).toBe(0);
    expect(p[0].name).toBeTruthy();
  });

  it('returns an empty array when the player never had anything in play', () => {
    expect(keyPokemons([] as PtcgSnapshot[], 'Nobody')).toEqual([]);
  });
});
