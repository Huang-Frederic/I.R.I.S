import { describe, expect, it } from 'vitest';
import { parseDecklist, decklistTextFromCards } from './decklist';
import type { DrillCard } from '@/lib/types';

const SAMPLE = `Pokémon : 13
3 Weedle CRI 1
3 Kakuna CRI 2
3 Beedrill ex CRI 3
1 Kakuna CRI 2
1 Beedrill ex CRI 98
3 Dudunsparce TEF 129
3 Dunsparce PRE 79
1 Weedle CRI 1
1 Fezandipiti ex ASC 142
1 Rellor TEF 23
1 Fan Rotom SCR 118
1 Meowth ex POR 62
1 Rabsca TEF 24

Dresseur : 15
1 Kieran TWM 206
4 Forest of Vitality MEG 117
4 Bug Catching Set TWM 143
1 Judge PAF 228
1 Ciphermaniac's Codebreaking PRE 104
4 Lillie's Determination MEG 169
4 Poké Pad POR 81
1 Xerosic's Machinations SFA 64
1 Max Rod PRE 116
4 Buddy-Buddy Poffin MEG 167
1 Dawn PFL 129
1 Sacred Ash DRI 168
2 Boss's Orders ASC 256
1 Dawn PFL 118
2 Ultra Ball ASC 264

Énergie : 1
5 Basic {G} Energy MEE 1

Total de cartes : 60`;

describe('parseDecklist', () => {
  it('parses every category and merges duplicate (setCode, setNumber) lines', () => {
    const lines = parseDecklist(SAMPLE);
    // 13 Pokémon lines minus the two duplicate merges (Weedle CRI-1, Kakuna CRI-2) = 11 unique
    const poke = lines.filter((l) => l.category === 'poke');
    expect(poke).toHaveLength(11);
    const weedle = poke.find((l) => l.setCode === 'CRI' && l.setNumber === '1');
    expect(weedle).toMatchObject({ name: 'Weedle', count: 4 });
    const kakuna = poke.find((l) => l.setCode === 'CRI' && l.setNumber === '2');
    expect(kakuna).toMatchObject({ name: 'Kakuna', count: 4 });
    // Beedrill ex CRI 3 and CRI 98 are different prints, not merged
    const beedrills = poke.filter((l) => l.name === 'Beedrill ex');
    expect(beedrills).toHaveLength(2);
  });

  it('keeps apostrophes and special tokens in names intact', () => {
    const lines = parseDecklist(SAMPLE);
    const codebreaking = lines.find((l) => l.setCode === 'PRE' && l.setNumber === '104');
    expect(codebreaking?.name).toBe("Ciphermaniac's Codebreaking");
    const energy = lines.find((l) => l.category === 'energy');
    expect(energy).toMatchObject({ name: 'Basic {G} Energy', setCode: 'MEE', setNumber: '1', count: 5 });
  });

  it('ignores the "Total de cartes" footer and blank lines', () => {
    const lines = parseDecklist(SAMPLE);
    expect(lines.some((l) => l.name.includes('Total'))).toBe(false);
  });

  it('assigns the Dresseur and Énergie categories correctly', () => {
    const lines = parseDecklist(SAMPLE);
    const trainer = lines.filter((l) => l.category === 'trainer');
    const energy = lines.filter((l) => l.category === 'energy');
    expect(trainer.length).toBeGreaterThan(0);
    expect(trainer.every((l) => l.category === 'trainer')).toBe(true);
    expect(energy).toHaveLength(1);
  });

  it('returns an empty array for empty input', () => {
    expect(parseDecklist('')).toEqual([]);
    expect(parseDecklist('   \n  \n')).toEqual([]);
  });

  it('ignores lines that appear before any category header', () => {
    expect(parseDecklist('3 Weedle CRI 1\nPokémon : 1\n1 Rabsca TEF 24')).toHaveLength(1);
  });
});

describe('decklistTextFromCards', () => {
  it('reconstructs a re-parseable decklist grouped by category', () => {
    const cards: DrillCard[] = [
      { id: 'DRI-32', name: 'Héricendre de Luth', count: 4, category: 'poke' },
      { id: 'ASC-256', name: "Boss's Orders", count: 2, category: 'trainer' },
      { id: 'MEE-1', name: 'Énergie Plante', count: 5, category: 'energy' },
    ];
    const text = decklistTextFromCards(cards);
    expect(text).toContain('Pokémon : 4');
    expect(text).toContain('4 Héricendre de Luth DRI 32');
    expect(text).toContain('Dresseur : 2');
    expect(text).toContain("2 Boss's Orders ASC 256");
    expect(text).toContain('Énergie : 5');
    expect(text).toContain('5 Énergie Plante MEE 1');

    // Round-trips: re-parsing the reconstructed text yields the same cards.
    const reparsed = parseDecklist(text);
    expect(reparsed).toHaveLength(3);
    expect(reparsed.find((l) => l.setCode === 'DRI')).toMatchObject({ count: 4, setNumber: '32' });
  });

  it('omits empty categories', () => {
    const cards: DrillCard[] = [{ id: 'DRI-32', name: 'Héricendre de Luth', count: 4, category: 'poke' }];
    const text = decklistTextFromCards(cards);
    expect(text).not.toContain('Dresseur');
    expect(text).not.toContain('Énergie');
  });
});
