import { describe, it, expect } from 'vitest';
import { parsePlayinEvents, parsePlayinPrice } from './parse-playin';

// Real captured sequence from the Play-in Paris BNF events page.
const LINES = [
  'Mercredi 22 Juillet',
  'De 14:30 à 19:00', 'Pokémon Coloriage', 'Voir la description', 'Gratuit', "S'inscrire", "Voir la fiche de l'événement",
  'De 15:00 à 19:00', 'Pokémon : Echange', 'Echanges Pokemon', 'Voir la description', 'Gratuit', "S'inscrire", "Voir la fiche de l'événement",
  'De 15:00 à 19:00', 'Pokémon Initiation', 'Voir la description', '5,00 €', '8 places restantes', "S'inscrire", "Voir la fiche de l'événement",
  'Lundi 27 Juillet',
  'De 19:00 à 23:00', 'Pokémon', 'Tournoi de Ligue', 'Voir la description', '7,00 €', '8 places restantes', "S'inscrire", "Voir la fiche de l'événement",
];

describe('parsePlayinEvents', () => {
  const events = parsePlayinEvents(LINES);

  it('extracts every timed event under its date header, with the end time', () => {
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({ dateHeader: 'Mercredi 22 Juillet', hh: 14, mm: 30, endHh: 19, endMm: 0, name: 'Pokémon Coloriage', priceText: 'Gratuit' });
    expect(events[2]).toMatchObject({ dateHeader: 'Mercredi 22 Juillet', hh: 15, mm: 0, endHh: 19, endMm: 0, name: 'Pokémon Initiation', priceText: '5,00 €' });
  });

  it('carries the date header across events until the next one', () => {
    expect(events[3]).toMatchObject({ dateHeader: 'Lundi 27 Juillet', hh: 19, name: 'Pokémon Tournoi de Ligue', priceText: '7,00 €' });
  });

  it('joins multi-line names', () => {
    expect(events[1].name).toBe('Pokémon : Echange Echanges Pokemon');
  });
});

describe('parsePlayinPrice', () => {
  it('maps free/priced/unknown', () => {
    expect(parsePlayinPrice('Gratuit')).toBe(0);
    expect(parsePlayinPrice('5,00 €')).toBe(5);
    expect(parsePlayinPrice('7,00 €')).toBe(7);
    expect(parsePlayinPrice('12 €')).toBe(12);
    expect(parsePlayinPrice(null)).toBeNull();
    expect(parsePlayinPrice('8 places restantes')).toBeNull();
  });
});
