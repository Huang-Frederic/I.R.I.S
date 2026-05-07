import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractCardFromImage, cleanNull } from './gemini-vision';

const MOCK_API_KEY = 'test-gemini-key';

const FULL_EXTRACTION = {
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
  card_name_fr: 'Pikachu ex',
  set_name: 'Battle Partners',
  set_name_fr: 'Partenaires de Combat',
  illustrator: 'Ryuta Fuse',
};

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

  it('returns null extraction when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY;
    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction).toBeNull();
    expect(result.usage).toBeNull();
  });

  it('extracts valid card data successfully', async () => {
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: JSON.stringify(FULL_EXTRACTION) }] } }],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction).toEqual({ ...FULL_EXTRACTION, _usage: undefined });
    expect(result.usage).toBeNull();
  });

  it('strips leading zeros from set_number', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ...FULL_EXTRACTION,
                  card_name: 'Charizard',
                  set_code: 'BW5',
                  set_number: '012',
                  set_total: 172,
                  rarity: 'Rare',
                  confidence: 'medium',
                }),
              },
            ],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction?.set_number).toBe('12');
  });

  it('returns null extraction on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    } as Response);

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction).toBeNull();
    expect(result.usage).toBeNull();
  });

  it('returns null extraction on timeout', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        setTimeout(() => reject(error), 100);
      });
    });

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction).toBeNull();
    expect(result.usage).toBeNull();
  });

  it('returns null extraction when required fields are missing', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ card_name: 'Pikachu' }) }],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction).toBeNull();
  });

  it('returns null extraction on JSON parse error', async () => {
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: 'invalid json {' }] } }],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction).toBeNull();
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
                  language: 'EN',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction?.pokemon_name).toBeNull();
    expect(result.extraction?.card_name).toBe('Professor Oak');
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
                  set_code: 'SM-P',
                  set_number: '27',
                  set_total: null,
                  language: 'JP',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction?.set_total).toBeNull();
    expect(result.extraction?.set_code).toBe('SM-P');
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
                  language: 'EN',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction?.pokemon_name).toBeNull();
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
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction?.pokemon_number).toBe(499);
    expect(result.extraction?.pokemon_name_fr).toBe('Grotichon');
    expect(result.extraction?.set_name_fr).toBe('Flamme Blanche');
  });

  it('extracts usage when usageMetadata is present', async () => {
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
      usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 100, totalTokenCount: 1600 },
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.usage).toBeDefined();
    expect(result.usage?.tokens_in).toBe(1500);
    expect(result.usage?.tokens_out).toBe(100);
    // tokens_image = 1500 (in) - PROMPT_TOKEN_ESTIMATE (360) = 1140
    expect(result.usage?.tokens_image).toBe(1140);
    // cost: (1500 * 2.0 + 100 * 5.0) / 1M = 0.0035 USD * 0.92 = 0.00322 EUR
    expect(result.usage?.cost_eur).toBeCloseTo(0.00322, 5);
    // _usage is also mirrored on the extraction object for back-compat
    expect(result.extraction?._usage).toEqual(result.usage);
  });

  it('returns usage even when JSON parse fails (parse-after-tokens case)', async () => {
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: 'Here is the JSON: ' }] } }],
      usageMetadata: { promptTokenCount: 1486, candidatesTokenCount: 9, totalTokenCount: 1495 },
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction).toBeNull();
    expect(result.usage?.tokens_in).toBe(1486);
    expect(result.usage?.tokens_out).toBe(9);
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
      candidates: [{ content: { parts: [{ text: `Here is the JSON:\n\n${validJson}\n` }] } }],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction?.card_name).toBe('Pikachu');
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
      candidates: [{ content: { parts: [{ text: '```json\n' + validJson + '\n```' }] } }],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction?.card_name).toBe('Pikachu');
  });

  it('omits usage when usageMetadata is missing', async () => {
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
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result.extraction).not.toBeNull();
    expect(result.usage).toBeNull();
    expect(result.extraction?.card_name).toBe('Pikachu');
  });
});

describe('cleanNull', () => {
  it('returns null for the literal "null" string Gemini sometimes emits', () => {
    // The bug this guards against: `parsed.field || null` keeps "null" because
    // it's a truthy string, then downstream formatBilingualName produces
    // ridiculous output like "null (Nの筋書き)".
    expect(cleanNull('null')).toBeNull();
    expect(cleanNull('NULL')).toBeNull();
  });

  it('returns null for empty / whitespace / undefined-ish placeholders', () => {
    expect(cleanNull('')).toBeNull();
    expect(cleanNull('   ')).toBeNull();
    expect(cleanNull('undefined')).toBeNull();
    expect(cleanNull('n/a')).toBeNull();
    expect(cleanNull('N/A')).toBeNull();
    expect(cleanNull('na')).toBeNull();
    expect(cleanNull('none')).toBeNull();
  });

  it('returns null for non-string values (defensive: Gemini schema slip)', () => {
    expect(cleanNull(null)).toBeNull();
    expect(cleanNull(undefined)).toBeNull();
    expect(cleanNull(42)).toBeNull();
    expect(cleanNull({})).toBeNull();
  });

  it('returns the trimmed string for legitimate values', () => {
    expect(cleanNull('Pikachu')).toBe('Pikachu');
    expect(cleanNull('  Pikachu  ')).toBe('Pikachu');
    expect(cleanNull('Le Plan de N')).toBe('Le Plan de N');
  });
});
