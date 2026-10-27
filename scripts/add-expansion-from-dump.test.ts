import { describe, expect, it } from 'vitest';
import { cardPrefix, numberProducts, parseArgs, type DumpProduct } from './add-expansion-from-dump';

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
      [1, 918810],
      [2, 918811],
    ]);
  });

  it('keeps two consecutive same-name cards apart, like a Legendary Stadium pair', () => {
    const numbered = numberProducts(
      [product(918926, 'Legendary Summit [Left]'), product(918927, 'Legendary Summit [Right]')],
      6704,
      2,
    );
    expect(numbered.map((n) => n.setNumber)).toEqual([1, 2]);
  });

  it('refuses when the product count is not the official card count', () => {
    expect(() => numberProducts([product(1, 'A'), product(2, 'B')], 6704, 3)).toThrow(/2 products for 3 cards/);
  });

  it('refuses an expansion the dump does not have', () => {
    expect(() => numberProducts([product(1, 'A')], 9999, 1)).toThrow(/No product of expansion 9999/);
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
