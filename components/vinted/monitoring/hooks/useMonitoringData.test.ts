import { describe, it, expect } from 'vitest';
import { lotImageUrl, otherItemImageUrl, queueFailureMessage } from './useMonitoringData';

describe('lotImageUrl', () => {
  it('builds a full Storage public URL from the first path in photo_urls', () => {
    expect(lotImageUrl(['abc123/0.jpg'])).toBe(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/abc123/0.jpg`,
    );
  });

  it('ignores any photos after the first one', () => {
    expect(lotImageUrl(['abc123/0.jpg', 'abc123/1.jpg'])).toBe(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/abc123/0.jpg`,
    );
  });

  it('returns an empty string for an empty array', () => {
    expect(lotImageUrl([])).toBe('');
  });

  it('returns an empty string for null or undefined (regression: the legacy singular `photo_url` column this used to read is null on most rows)', () => {
    expect(lotImageUrl(null)).toBe('');
    expect(lotImageUrl(undefined)).toBe('');
  });
});

describe('otherItemImageUrl', () => {
  it('builds a full Storage public URL from the first path in photo_urls, against the other-item-photos bucket', () => {
    expect(otherItemImageUrl(['item-1/0.jpg'])).toBe(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/other-item-photos/item-1/0.jpg`,
    );
  });

  it('ignores any photos after the first one', () => {
    expect(otherItemImageUrl(['item-1/0.jpg', 'item-1/1.jpg'])).toBe(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/other-item-photos/item-1/0.jpg`,
    );
  });

  it('returns an empty string for an empty array, null, or undefined', () => {
    expect(otherItemImageUrl([])).toBe('');
    expect(otherItemImageUrl(null)).toBe('');
    expect(otherItemImageUrl(undefined)).toBe('');
  });
});

describe('queueFailureMessage', () => {
  it("returns the bot's reason for a flagged queue row", () => {
    expect(
      queueFailureMessage({ last_error: 'À compléter dans la fiche : Taille manquante', failed_at: '2026-10-05T08:26:03Z' }),
    ).toBe('À compléter dans la fiche : Taille manquante');
  });

  it('still marks a flagged row whose reason is missing', () => {
    expect(queueFailureMessage({ last_error: null, failed_at: '2026-10-05T08:26:03Z' })).toBe('Échec de la publication');
  });

  it('returns null for a row the bot will post normally', () => {
    expect(queueFailureMessage({ last_error: null, failed_at: null })).toBeNull();
    expect(queueFailureMessage({})).toBeNull();
  });
});
