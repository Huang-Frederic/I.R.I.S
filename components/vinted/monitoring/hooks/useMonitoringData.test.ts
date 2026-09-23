import { describe, it, expect } from 'vitest';
import { lotImageUrl } from './useMonitoringData';

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
