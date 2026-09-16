import { describe, expect, it } from 'vitest';
import { activeNavHref } from './nav-items';

describe('activeNavHref', () => {
  it('picks the more specific href when one is a prefix of another', () => {
    const hrefs = ['/ptcg', '/ptcg/stats'];
    expect(activeNavHref('/ptcg/stats', hrefs)).toBe('/ptcg/stats');
    expect(activeNavHref('/ptcg', hrefs)).toBe('/ptcg');
  });

  it('matches a real sub-route, not just any string prefix', () => {
    // '/pokedexfoo' textually starts with '/pokedex' but isn't a sub-route of it.
    expect(activeNavHref('/pokedexfoo', ['/pokedex'])).toBeNull();
    expect(activeNavHref('/pokedex/123', ['/pokedex'])).toBe('/pokedex');
  });

  it('only matches "/" exactly, never as a prefix', () => {
    expect(activeNavHref('/dashboard', ['/'])).toBeNull();
    expect(activeNavHref('/', ['/'])).toBe('/');
  });

  it('returns null when nothing matches', () => {
    expect(activeNavHref('/unknown', ['/dashboard', '/ptcg'])).toBeNull();
  });
});
