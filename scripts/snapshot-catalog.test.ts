import { describe, expect, it } from 'vitest';
import { encodeJsonlLine, decodeJsonlLine } from './snapshot-catalog';

describe('snapshot-catalog JSONL round-trip', () => {
  it('preserves a row through encode → decode', () => {
    const row = {
      id: 1,
      set_code: 'sv11',
      set_number: '125',
      language: 'JP',
      illustrator: 'mizue',
      pokemon_name: 'ピカチュウ',
    };
    const line = encodeJsonlLine(row);
    expect(line.endsWith('\n')).toBe(true);
    const back = decodeJsonlLine(line.trimEnd());
    expect(back).toEqual(row);
  });

  it('handles UTF-8 across all catalog languages', () => {
    const samples = [
      { lang: 'JP', name: 'リザードン' },
      { lang: 'CN', name: '喷火龙' },
      { lang: 'KO', name: '리자몽' },
      { lang: 'FR', name: 'Dracaufeu' },
    ];
    for (const row of samples) {
      const back = decodeJsonlLine(encodeJsonlLine(row).trimEnd());
      expect(back).toEqual(row);
    }
  });

  it('preserves null fields', () => {
    const row = { id: 1, illustrator: null, pokemon_number: null };
    const back = decodeJsonlLine(encodeJsonlLine(row).trimEnd());
    expect(back).toEqual(row);
  });
});
