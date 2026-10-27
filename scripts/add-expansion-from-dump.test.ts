import { describe, expect, it } from 'vitest';
import { applyNumberMap, cardPrefix, numberProducts, parseArgs, type DumpProduct } from './add-expansion-from-dump';

const product = (idProduct: number, name: string, idExpansion = 6704): DumpProduct => ({
  idProduct,
  name,
  idExpansion,
  idMetacard: 0,
});

describe('numberProducts', () => {
  it('numbers the expansion products in idProduct order, ignoring other expansions', () => {
    const numbered = numberProducts(
      [product(918811, 'Surskit [Multiply | Bug Bite]'), product(918810, 'Heracross [Spike Draw]'), product(900000, 'Pikachu', 6636)],
      6704,
      2,
    );
    expect(numbered.map((n) => [n.setNumber, n.product.idProduct])).toEqual([
      ['1', 918810],
      ['2', 918811],
    ]);
  });

  it('keeps two consecutive same-name cards apart, like a Legendary Stadium pair', () => {
    const numbered = numberProducts(
      [product(918926, 'Legendary Summit [Left]'), product(918927, 'Legendary Summit [Right]')],
      6704,
      2,
    );
    expect(numbered.map((n) => n.setNumber)).toEqual(['1', '2']);
  });

  it('refuses when the product count is not the official card count', () => {
    expect(() => numberProducts([product(1, 'A'), product(2, 'B')], 6704, 3)).toThrow(/2 products for 3 cards/);
  });

  it('refuses an expansion the dump does not have', () => {
    expect(() => numberProducts([product(1, 'A')], 9999, 1)).toThrow(/No product of expansion 9999/);
  });
});

describe('applyNumberMap', () => {
  const numbered = numberProducts(
    [
      product(907735, 'Ultra Ball', 6601),
      product(907736, 'Ninetales [Flame Tail | 30]', 6601),
      product(909509, 'Mew [Psychic | 30C]', 6601),
      product(907940, 'Charizard', 6601),
    ],
    6601,
    4,
  );

  it('takes the numbers from the map, letters and unindexed products included', () => {
    const mapped = applyNumberMap(numbered, { 907735: '128', 907736: '10', 909509: 'R', 907940: null });
    // In idProduct order: Charizard 907940 comes before Mew 909509.
    expect(mapped.map((n) => n.setNumber)).toEqual(['128', '10', null, 'R']);
  });

  it('refuses a map that misses a product or names one from elsewhere', () => {
    expect(() => applyNumberMap(numbered, { 907735: '128', 907736: '10', 909509: 'R' })).toThrow(/1 missing \(907940\)/);
    expect(() => applyNumberMap(numbered, { 907735: '128', 907736: '10', 909509: 'R', 907940: null, 1: '1' })).toThrow(
      /1 not in the expansion \(1\)/,
    );
  });
});

describe('cardPrefix', () => {
  it('drops the attacks, like the nightly upload', () => {
    expect(cardPrefix('Mega Rayquaza ex [Roar of the Ruler | Storm Emeralda]')).toBe('Mega Rayquaza ex');
    expect(cardPrefix('Grisham')).toBe('Grisham');
  });
});

describe('parseArgs', () => {
  it('reads --key=value pairs and bare flags', () => {
    expect(parseArgs(['--id=6704', '--name=Règne Delta', '--dry-run'])).toEqual({
      id: '6704',
      name: 'Règne Delta',
      'dry-run': 'true',
    });
  });
});
