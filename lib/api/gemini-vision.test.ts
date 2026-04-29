import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractCardFromImage } from './gemini-vision';

const MOCK_API_KEY = 'test-gemini-key';

describe('gemini-vision', () => {
  const originalEnv = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = MOCK_API_KEY;
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
    global.fetch = originalFetch;
  });

  it('returns null when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY;
    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);
    expect(result).toBeNull();
  });

  it('extracts valid card data successfully', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Pikachu ex',
                  pokemon_name: 'Pikachu',
                  set_code: 'SV11W',
                  set_number: '12',
                  set_total: 86,
                  language: 'EN',
                  rarity: 'Double Rare',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);

    expect(result).toEqual({
      card_name: 'Pikachu ex',
      pokemon_name: 'Pikachu',
      set_code: 'SV11W',
      set_number: '12',
      set_total: 86,
      language: 'EN',
      rarity: 'Double Rare',
      confidence: 'high',
    });
  });

  it('strips leading zeros from set_number', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Charizard',
                  pokemon_name: 'Charizard',
                  set_code: 'BW5',
                  set_number: '012',
                  set_total: 172,
                  language: 'JP',
                  rarity: 'Rare',
                  confidence: 'medium',
                }),
              },
            ],
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);

    expect(result?.set_number).toBe('12');
  });

  it('returns null on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    } as Response);

    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);

    expect(result).toBeNull();
  });

  it('returns null on timeout', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        setTimeout(() => reject(error), 100);
      });
    });

    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);

    expect(result).toBeNull();
  });

  it('returns null when required fields are missing', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Pikachu',
                  // Missing set_code, set_number, language, confidence
                }),
              },
            ],
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);

    expect(result).toBeNull();
  });

  it('returns null on JSON parse error', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'invalid json {',
              },
            ],
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);

    expect(result).toBeNull();
  });

  it('handles null pokemon_name for non-Pokémon cards', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Professor Oak',
                  pokemon_name: null,
                  set_code: 'BW1',
                  set_number: '50',
                  set_total: 114,
                  language: 'EN',
                  rarity: 'Uncommon',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);

    expect(result?.pokemon_name).toBeNull();
    expect(result?.card_name).toBe('Professor Oak');
  });

  it('handles null set_total for promotional cards', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Pikachu',
                  pokemon_name: 'Pikachu',
                  set_code: 'SM-P',
                  set_number: '27',
                  set_total: null,
                  language: 'JP',
                  rarity: 'Promo',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);

    expect(result?.set_total).toBeNull();
    expect(result?.set_code).toBe('SM-P');
  });

  it('converts empty string pokemon_name to null', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Energy Card',
                  pokemon_name: '',
                  set_code: 'SV1',
                  set_number: '100',
                  set_total: 120,
                  language: 'EN',
                  rarity: 'Common',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const buffer = Buffer.from('fake-image');
    const result = await extractCardFromImage(buffer);

    expect(result?.pokemon_name).toBeNull();
  });
});
