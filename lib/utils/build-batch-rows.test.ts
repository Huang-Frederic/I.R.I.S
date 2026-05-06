import { describe, expect, it } from 'vitest';
import { buildBatchRows, statusForCopy, type BatchRowBase } from './build-batch-rows';

const BASE: BatchRowBase = {
  pokemon_name: 'Pikachu',
  pokemon_number: 25,
  card_name: 'Pikachu V',
  card_id_tcg: 'svp-001',
  set_name: 'Promos SV',
  set_code: 'SVP',
  set_number: '1',
  language: 'EN',
  rarity: 'RR',
  condition: 'NM',
  image_url: 'https://supabase.co/photo.jpg',
  tcg_image_url: null,
  notes: null,
  variant: null,
  cardmarket_id: null,
  cm_price_low: null,
  cm_price_trend: null,
  cm_price_avg: null,
  suggested_price: null,
  cm_updated_at: null,
};

let counter = 0;
const id = () => `id-${++counter}`;

describe('statusForCopy', () => {
  it('first copy gets the requested status', () => {
    expect(statusForCopy(0, 'for_sale')).toBe('for_sale');
    expect(statusForCopy(0, 'pokedex')).toBe('pokedex');
    expect(statusForCopy(0, 'collection')).toBe('collection');
  });

  it('subsequent copies of for_sale fall back to collection', () => {
    expect(statusForCopy(1, 'for_sale')).toBe('collection');
    expect(statusForCopy(5, 'for_sale')).toBe('collection');
  });

  it('subsequent copies of pokedex fall back to collection', () => {
    expect(statusForCopy(1, 'pokedex')).toBe('collection');
  });

  it('subsequent copies of collection stay collection (no constraint)', () => {
    expect(statusForCopy(1, 'collection')).toBe('collection');
    expect(statusForCopy(3, 'collection')).toBe('collection');
  });
});

describe('buildBatchRows', () => {
  it('returns empty array when count < 1', () => {
    expect(buildBatchRows(BASE, 'for_sale', 0, id)).toEqual([]);
    expect(buildBatchRows(BASE, 'for_sale', -1, id)).toEqual([]);
  });

  it('builds 1 row for count=1 with the requested status', () => {
    counter = 0;
    const rows = buildBatchRows(BASE, 'for_sale', 1, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('id-1');
    expect(rows[0]!.status).toBe('for_sale');
    expect(rows[0]!.card_name).toBe('Pikachu V');
  });

  it('builds N rows with status fallback for count>1 + status=for_sale', () => {
    counter = 0;
    const rows = buildBatchRows(BASE, 'for_sale', 4, id);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.status)).toEqual(['for_sale', 'collection', 'collection', 'collection']);
    expect(rows.map((r) => r.id)).toEqual(['id-1', 'id-2', 'id-3', 'id-4']);
  });

  it('builds N rows all in collection for count>1 + status=collection', () => {
    counter = 0;
    const rows = buildBatchRows(BASE, 'collection', 3, id);
    expect(rows.every((r) => r.status === 'collection')).toBe(true);
  });

  it('shares image_url + meta across all rows (1 upload, N rows)', () => {
    counter = 0;
    const rows = buildBatchRows(BASE, 'for_sale', 3, id);
    expect(rows.every((r) => r.image_url === BASE.image_url)).toBe(true);
    expect(rows.every((r) => r.card_id_tcg === BASE.card_id_tcg)).toBe(true);
    expect(rows.every((r) => r.pokemon_number === 25)).toBe(true);
  });

  it('every row gets a unique id', () => {
    counter = 0;
    const rows = buildBatchRows(BASE, 'for_sale', 5, id);
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.size).toBe(5);
  });
});
