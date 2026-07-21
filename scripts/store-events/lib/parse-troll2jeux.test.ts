import { describe, it, expect } from 'vitest';
import { parseTroll2jeuxHeader, parseTroll2jeuxEvents } from './parse-troll2jeux';

const GRID = [
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche',
  '1', '2', '3', '18:00 | Ligue Pokémon', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18:00 | Ligue Pokémon', '18',
  '19', '20', '21', '22', '23', '24', '18:00 | Ligue Pokémon', '25', '26',
];

describe('parseTroll2jeuxHeader', () => {
  it('reads year + FR month', () => {
    expect(parseTroll2jeuxHeader('2026 Juillet')).toEqual({ year: 2026, month: 7 });
    expect(parseTroll2jeuxHeader('2027 Février')).toEqual({ year: 2027, month: 2 });
  });
  it('returns null on garbage', () => {
    expect(parseTroll2jeuxHeader('nope')).toBeNull();
  });
});

describe('parseTroll2jeuxEvents', () => {
  it('attaches each event line to the day cell above it', () => {
    const events = parseTroll2jeuxEvents(GRID);
    expect(events).toEqual([
      { day: 3, hh: 18, mm: 0, name: 'Ligue Pokémon' },
      { day: 17, hh: 18, mm: 0, name: 'Ligue Pokémon' },
      { day: 24, hh: 18, mm: 0, name: 'Ligue Pokémon' },
    ]);
  });
});
