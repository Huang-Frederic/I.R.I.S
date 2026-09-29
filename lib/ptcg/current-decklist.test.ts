import { describe, expect, it } from 'vitest';
import { isInCurrentDecklist } from './current-decklist';

describe('isInCurrentDecklist', () => {
  it('accepts every card actually in the decklist', () => {
    for (const name of [
      'Insolourdo',
      'Méga-Lockpin-ex',
      'Limonde',
      'Sulfura',
      'Civière Nocturne',
      'Ordres du Boss',
      'Énergie Enrichissante',
      'Poké Registre',
    ]) {
      expect(isInCurrentDecklist(name)).toBe(true);
    }
  });

  it('rejects a card that is not in the decklist', () => {
    expect(isInCurrentDecklist('Max Canne')).toBe(false);
    expect(isInCurrentDecklist('Dardargnan-ex')).toBe(false);
  });

  it('is accent- and case-insensitive', () => {
    expect(isInCurrentDecklist('méga-lockpin-ex')).toBe(true);
    expect(isInCurrentDecklist('ENERGIE ENRICHISSANTE')).toBe(true);
  });
});
