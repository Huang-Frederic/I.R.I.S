import { describe, expect, it } from 'vitest';
import { sortByGroupPriority } from './group-sort';

interface Item {
  groupKey: string;
  label: string;
}

function item(groupKey: string, label: string): Item {
  return { groupKey, label };
}

describe('sortByGroupPriority', () => {
  it("orders items by their group's position in groupPriority", () => {
    const items = [item('Riftbound', 'r1'), item('Pokémon FR', 'p1'), item('Magic', 'm1')];
    const sorted = sortByGroupPriority(items, ['Pokémon FR', 'Riftbound', 'Magic']);
    expect(sorted.map((i) => i.label)).toEqual(['p1', 'r1', 'm1']);
  });

  it('keeps items in their original relative order within the same group', () => {
    const items = [item('Pokémon FR', 'p1'), item('Pokémon FR', 'p2'), item('Pokémon FR', 'p3')];
    const sorted = sortByGroupPriority(items, ['Pokémon FR']);
    expect(sorted.map((i) => i.label)).toEqual(['p1', 'p2', 'p3']);
  });

  it('places groups absent from groupPriority after all listed groups, in first-appearance order', () => {
    const items = [item('Lorcana', 'l1'), item('Pokémon FR', 'p1'), item('Digimon', 'd1'), item('Pokémon FR', 'p2')];
    const sorted = sortByGroupPriority(items, ['Pokémon FR']);
    expect(sorted.map((i) => i.label)).toEqual(['p1', 'p2', 'l1', 'd1']);
  });

  it('returns items in their original order when groupPriority is empty', () => {
    const items = [item('B', 'b1'), item('A', 'a1')];
    expect(sortByGroupPriority(items, [])).toEqual(items);
  });

  it('returns an empty array for an empty pipeline', () => {
    expect(sortByGroupPriority([], ['Pokémon FR'])).toEqual([]);
  });
});
