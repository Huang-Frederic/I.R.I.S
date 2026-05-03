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
                  pokemon_number: 25,
                  pokemon_name_fr: 'Pikachu',
                  set_name: 'Battle Partners',
                  set_name_fr: 'Partenaires de Combat',
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
      pokemon_number: 25,
      pokemon_name_fr: 'Pikachu',
      set_name: 'Battle Partners',
      set_name_fr: 'Partenaires de Combat',
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
                  pokemon_number: 6,
                  pokemon_name_fr: 'Dracaufeu',
                  set_name: null,
                  set_name_fr: null,
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
                  pokemon_number: null,
                  pokemon_name_fr: null,
                  set_name: null,
                  set_name_fr: null,
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
                  pokemon_number: 25,
                  pokemon_name_fr: 'Pikachu',
                  set_name: null,
                  set_name_fr: null,
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
                  pokemon_number: null,
                  pokemon_name_fr: null,
                  set_name: null,
                  set_name_fr: null,
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

  it('extracts pokemon_number and FR translations when present', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'チャオブー',
                  pokemon_name: 'チャオブー',
                  set_code: 'BW5',
                  set_number: '12',
                  set_total: 86,
                  language: 'JP',
                  rarity: 'Common',
                  confidence: 'high',
                  pokemon_number: 499,
                  pokemon_name_fr: 'Grotichon',
                  set_name: 'ホワイトフレア',
                  set_name_fr: 'Flamme Blanche',
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
      card_name: 'チャオブー',
      pokemon_name: 'チャオブー',
      set_code: 'BW5',
      set_number: '12',
      set_total: 86,
      language: 'JP',
      rarity: 'Common',
      confidence: 'high',
      pokemon_number: 499,
      pokemon_name_fr: 'Grotichon',
      set_name: 'ホワイトフレア',
      set_name_fr: 'Flamme Blanche',
    });
  });

  it('handles non-Pokémon cards (Trainers) where pokemon_number is null', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Professor Sada',
                  pokemon_name: null,
                  set_code: 'SV11W',
                  set_number: '75',
                  set_total: 86,
                  language: 'EN',
                  rarity: 'Uncommon',
                  confidence: 'high',
                  pokemon_number: null,
                  pokemon_name_fr: null,
                  set_name: 'Battle Partners',
                  set_name_fr: 'Partenaires de Combat',
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
      card_name: 'Professor Sada',
      pokemon_name: null,
      set_code: 'SV11W',
      set_number: '75',
      set_total: 86,
      language: 'EN',
      rarity: 'Uncommon',
      confidence: 'high',
      pokemon_number: null,
      pokemon_name_fr: null,
      set_name: 'Battle Partners',
      set_name_fr: 'Partenaires de Combat',
    });
  });

  it('extracts _usage from response when usageMetadata is present', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Pikachu',
                  set_code: 'SV1',
                  set_number: '1',
                  language: 'EN',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 350,
        candidatesTokenCount: 80,
        totalTokenCount: 430,
      },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result?._usage).toBeDefined();
    expect(result?._usage?.tokens_in).toBe(350);
    expect(result?._usage?.tokens_out).toBe(80);
    // tokens_image = 350 (in) - PROMPT_TOKEN_ESTIMATE (245) = 105
    expect(result?._usage?.tokens_image).toBe(105);
    // cost: (350 * 0.075 + 80 * 0.30) / 1M = 0.00005025 USD * 0.92 = 0.00004623 EUR
    expect(result?._usage?.cost_eur).toBeCloseTo(0.00004623, 7);
  });

  it('tolerates a prose preamble before the JSON object', async () => {
    const validJson = JSON.stringify({
      card_name: 'Pikachu',
      set_code: 'SV1',
      set_number: '1',
      language: 'EN',
      confidence: 'high',
    });
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: `Here is the JSON:\n\n${validJson}\n` }],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result?.card_name).toBe('Pikachu');
  });

  it('tolerates markdown fences around the JSON object', async () => {
    const validJson = JSON.stringify({
      card_name: 'Pikachu',
      set_code: 'SV1',
      set_number: '1',
      language: 'EN',
      confidence: 'high',
    });
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: '```json\n' + validJson + '\n```' }],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result?.card_name).toBe('Pikachu');
  });

  it('omits _usage when usageMetadata is missing', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Pikachu',
                  set_code: 'SV1',
                  set_number: '1',
                  language: 'EN',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
      // no usageMetadata
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result).not.toBeNull();
    expect(result?._usage).toBeUndefined();
    expect(result?.card_name).toBe('Pikachu');
  });
});
