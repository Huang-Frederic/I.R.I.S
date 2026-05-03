/**
 * Probe TCGdex for the cards that failed catalog lookup in the multilang bench.
 * Tests if Strategy 3 (TCGdex live) would have caught them. Tries multiple
 * heuristics per card (exact match, lowercase, common subseries variants).
 *
 * Run: npx tsx scripts/probe-tcgdex-fails.ts
 */

const BASE = 'https://api.tcgdex.net/v2';

// Cards from bench that failed catalog hit (after prompt fix v2).
// Format: { lang, geminiSetCode, localId, name }
const FAILED_CARDS = [
  // FR fails
  { lang: 'fr', code: 'TG',         id: '3',   name: 'Dracaufeu (Trainer Gallery)' },
  { lang: 'fr', code: 'TG',         id: '7',   name: 'Branette (Trainer Gallery)' },
  { lang: 'fr', code: 'SWSH201',    id: '201', name: 'Mentali V (SWSH Promo)' },
  { lang: 'fr', code: 'XY41',       id: '41',  name: 'Kyogre EX (XY Promo)' },
  // EN fails
  { lang: 'en', code: 'GG',         id: '45',  name: 'Deoxys VMAX (Galarian Gallery)' },
  // JP fails
  { lang: 'ja', code: 'CP4',        id: '30',  name: 'Gamageroge EX (CP4)' },
  // KO fails
  { lang: 'ko', code: 'SM3H',       id: '33',  name: 'Alola Vulpix GX (KO)' },
  { lang: 'ko', code: 'sv10',       id: '101', name: 'Torchic (KO)' },
  { lang: 'ko', code: 'XY6',        id: '39',  name: 'Togekiss (KO)' },
  { lang: 'ko', code: 'XY7',        id: '67',  name: 'Porygon-Z (KO)' },
  // ZH fails
  { lang: 'zh-cn', code: '151',     id: '187', name: 'Alakazam ex (ZH 151)' },
  { lang: 'zh-cn', code: 'cs4bc',   id: '73',  name: 'Gengar VMAX (ZH)' },
  { lang: 'zh-cn', code: 'cs4bC',   id: '25',  name: 'Gyarados V (ZH)' },
  { lang: 'zh-cn', code: 'cs4aC',   id: '80',  name: 'Medicham V (ZH)' },
];

// Variants of subseries codes that TCGdex might use
const SUBSERIES_VARIANTS: Record<string, string[]> = {
  TG: ['swsh11tg', 'swsh12tg', 'swsh10tg', 'swsh9tg', 'tg'],   // Trainer Gallery in various Crown Zenith / Astral Radiance
  GG: ['swsh12pt5gg', 'swsh12gg', 'gg'],                        // Galarian Gallery in Crown Zenith
  SWSH201: ['swshp', 'swsh-p'],                                 // Black Star Promo
  XY41: ['xyp', 'xy-p'],                                        // XY Promo
  CP4: ['cp4', 'CP4'],
  SM3H: ['sm3h', 'sm3'],
  sv10: ['sv10'],
  XY6: ['xy6'],
  XY7: ['xy7'],
  '151': ['sv2a', 'mew', 'cp1'],                                // 151 set across regions
  cs4bc: ['cs4bc', 'sv4'],
  cs4bC: ['cs4bC', 'sv4'],
  cs4aC: ['cs4aC', 'sv4'],
};

async function tryFetch(url: string): Promise<{ ok: boolean; status: number; cardName?: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json() as { name?: string };
    return { ok: true, status: 200, cardName: data.name };
  } catch {
    return { ok: false, status: -1 };
  }
}

async function probeCard(c: typeof FAILED_CARDS[number]) {
  console.log(`\n[${c.lang.toUpperCase()}] ${c.name}`);
  console.log(`  Gemini said: ${c.code}/${c.id}`);

  const variants = SUBSERIES_VARIANTS[c.code] ?? [c.code, c.code.toLowerCase()];
  let found = false;
  for (const variant of variants) {
    const url = `${BASE}/${c.lang}/cards/${encodeURIComponent(variant)}-${encodeURIComponent(c.id)}`;
    const r = await tryFetch(url);
    if (r.ok) {
      console.log(`  ✓ FOUND on TCGdex via ${variant}-${c.id} → "${r.cardName}"`);
      found = true;
      break;
    } else {
      console.log(`  · tried ${variant}-${c.id}: ${r.status}`);
    }
  }
  if (!found) console.log(`  ✗ all variants 404`);
  return found;
}

async function main() {
  console.log(`Probing TCGdex for ${FAILED_CARDS.length} previously-failed cards…`);
  let foundCount = 0;
  for (const c of FAILED_CARDS) {
    const found = await probeCard(c);
    if (found) foundCount += 1;
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`\n=== SUMMARY ===`);
  console.log(`TCGdex would have caught ${foundCount}/${FAILED_CARDS.length} of the catalog-fail cards.`);
}

main().catch(e => { console.error(e); process.exit(1); });
