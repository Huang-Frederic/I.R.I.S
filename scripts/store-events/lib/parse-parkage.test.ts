import { describe, it, expect } from 'vitest';
import { parseParkageEvents, parseParkagePrice } from './parse-parkage';

// Real captured sequence from Parkage (Paris EDB, Pokémon filter).
const LINES = [
  'July',
  'TUESDAY 21 JULY', 'Pokémon', '18:30', 'Construit BO1', '10,00 €', '0 ticket available',
  'WEDNESDAY 22 JULY', 'Pokémon', '17:00', 'Séance de Ligue', '0,00 €', '13 tickets available',
  'TUESDAY 28 JULY', 'Pokémon', '18:30', 'Tournoi de Ligue', '0,00 €', '12 tickets available',
];

describe('parseParkageEvents', () => {
  const events = parseParkageEvents(LINES);

  it('extracts each event under its EN date header', () => {
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ day: 21, month: 7, hh: 18, mm: 30, name: 'Construit BO1', priceText: '10,00 €', spotsLeft: 0 });
    expect(events[1]).toMatchObject({ day: 22, month: 7, hh: 17, mm: 0, name: 'Séance de Ligue', priceText: '0,00 €', spotsLeft: 13 });
    expect(events[2]).toMatchObject({ day: 28, month: 7, name: 'Tournoi de Ligue' });
  });
});

describe('parseParkagePrice', () => {
  it('maps free/priced/unknown', () => {
    expect(parseParkagePrice('0,00 €')).toBe(0);
    expect(parseParkagePrice('10,00 €')).toBe(10);
    expect(parseParkagePrice(null)).toBeNull();
  });
});
