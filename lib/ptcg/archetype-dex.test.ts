import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGame } from './index';
import { resolveArchetypeDex } from './archetype-dex';

const load = (name: string) =>
  parseGame(readFileSync(join(process.cwd(), `lib/ptcg/fixtures/${name}`), 'utf8'));

const loss = load('amphinobi-2026-07-25.txt');

describe('resolveArchetypeDex', () => {
  it('derives live from the game when there is no override', () => {
    // loss.me's top-2 by damage are Typhlosion de Luth (157) and Feurisson de
    // Luth (156) — see protagonists.test.ts for the raw damage numbers.
    expect(resolveArchetypeDex(loss.state.snapshots, loss.me, null)).toEqual([157, 156]);
  });

  it('returns the override verbatim when one is set, ignoring live derivation', () => {
    expect(resolveArchetypeDex(loss.state.snapshots, loss.me, [15])).toEqual([15]);
  });

  it('returns an empty override verbatim (a deliberate "no sprite" choice, not "unset")', () => {
    expect(resolveArchetypeDex(loss.state.snapshots, loss.me, [])).toEqual([]);
  });

  it('drops a protagonist whose name matches no Pokémon when deriving live', () => {
    // A player who never had anything in play yields no protagonists at all,
    // hence no dex numbers — distinct from "everyone matched, 0 results".
    expect(resolveArchetypeDex([], 'Nobody', null)).toEqual([]);
  });

  it('dedupes by dex number when deriving live, keeping the first (highest-damage) occurrence', () => {
    // loss.opponent's top-2 protagonists are "Amphinobi-ex" and
    // "Méga-Amphinobi-ex" — different cards/evolution stages (keyPokemons
    // correctly keeps them distinct, since it sums damage by card id), but
    // both resolve to the same national dex number (658, Greninja). For
    // sprite purposes this is one distinct species and should appear once.
    expect(resolveArchetypeDex(loss.state.snapshots, loss.opponent, null)).toEqual([658]);
  });
});
