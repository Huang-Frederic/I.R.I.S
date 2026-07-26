import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PtcgSnapshot } from '@/lib/types';
import { parseGame } from './index';
import { keyPokemon } from './protagonists';

const load = (name: string) =>
  parseGame(readFileSync(join(process.cwd(), `lib/ptcg/fixtures/${name}`), 'utf8'));

const loss = load('amphinobi-2026-07-25.txt');
const win = load('minotaupe-2026-07-26.txt');

describe('keyPokemon', () => {
  it('names the card that dealt the most damage, not the last one standing', () => {
    const mine = keyPokemon(loss.state.snapshots, loss.me)!;
    expect(mine.name).toBe('Typhlosion de Luth');
    expect(mine.damageDealt).toBeGreaterThan(0);
  });

  it('picks the opponent protagonist across two different attackers', () => {
    // Bklee219 attacked with both Méga-Amphinobi-ex and Amphinobi-ex; the Méga
    // did far more of the work and should be the face of the matchup.
    const theirs = keyPokemon(loss.state.snapshots, loss.opponent)!;
    expect(theirs.name).toBe('Méga-Amphinobi-ex');
  });

  it('follows the evolution that did the work, not the one that chipped', () => {
    // Feurisson chipped for 40 before becoming the Typhlosion that dealt over
    // a thousand. Summing by card id keeps them separate and the Typhlosion wins.
    const mine = keyPokemon(win.state.snapshots, win.me)!;
    expect(mine.name).toBe('Typhlosion de Luth');
  });

  it('works on both sides of a won game', () => {
    expect(keyPokemon(win.state.snapshots, win.opponent)!.name).toBe('Méga-Minotaupe-ex');
  });

  it('falls back to the most-active Pokémon when nobody attacked', () => {
    // A game that ends during setup has no attack events at all.
    const setupOnly = loss.state.snapshots.filter((s) => s.turnNumber === 0);
    const p = keyPokemon(setupOnly, loss.me)!;
    expect(p.damageDealt).toBe(0);
    expect(p.name).toBeTruthy();
  });

  it('returns null when the player never had anything in play', () => {
    expect(keyPokemon([] as PtcgSnapshot[], 'Nobody')).toBeNull();
  });
});
