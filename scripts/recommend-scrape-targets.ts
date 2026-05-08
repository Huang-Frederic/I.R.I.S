// Reads distinct (set_name, language) from the cards table, matches each
// against cardmarket_expansions (with the same fuzzy logic the lookup
// helper uses), and outputs the recommended `npm run scrape-cardmarket --
// <slug1> <slug2> ...` command.
//
// Used to do a targeted scrape covering only the user's actual collection,
// avoiding the rate-limit risk of `--all`.
//
// Usage:
//   npx tsx scripts/recommend-scrape-targets.ts

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

const REST = `${URL}/rest/v1`;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

function htmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function normalize(s: string): string {
  return htmlDecode(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokensSorted(s: string): string {
  return normalize(s).split(/\s+/).filter(Boolean).sort().join(' ');
}
function nameToSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/&/g, '')
    .replace(/[^a-zA-Z0-9 \-:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-');
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${REST}/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  type CardRow = { set_name: string | null };
  type ExpRow = { id_expansion: number; name: string; name_normalized: string };
  type IndexRow = { id_expansion: number };

  const [cards, expansions, scraped] = await Promise.all([
    fetchJson<CardRow[]>('cards?select=set_name'),
    fetchJson<ExpRow[]>('cardmarket_expansions?select=id_expansion,name,name_normalized'),
    fetchJson<IndexRow[]>('cardmarket_card_index?select=id_expansion'),
  ]);

  const distinctSetNames = Array.from(
    new Set(cards.map((c) => c.set_name).filter((n): n is string => !!n)),
  );
  console.log(`Found ${distinctSetNames.length} distinct set_name(s) in your cards table.\n`);

  const byNameNorm = new Map<string, ExpRow>();
  const byTokens = new Map<string, ExpRow>();
  for (const e of expansions) {
    byNameNorm.set(e.name_normalized, e);
    byTokens.set(tokensSorted(e.name), e);
  }
  const alreadyScraped = new Set(scraped.map((r) => r.id_expansion));

  type Matched = { setNames: string[]; idExpansion: number; cmName: string; slug: string; alreadyScraped: boolean };
  type UnmatchedDiag = { setName: string; tried: string[]; candidates: ExpRow[] };

  const matchedById = new Map<number, Matched>();
  const unmatched: UnmatchedDiag[] = [];

  // FR translations for common EN set names that CM stores in FR locale.
  // Could query TCGdex live but this covers the recurring cases offline.
  const FR_HINTS: Record<string, string[]> = {
    'prismatic evolutions': ['Évolutions Prismatiques'],
    'scarlet & violet promos': ['Promos Écarlate et Violet', 'SV Black Star Promos'],
    'twilight masquerade': ['Mascarade Crépusculaire'],
    'paldean fates': ['Destinées de Paldea'],
    'temporal forces': ['Forces Temporelles'],
    'paradox rift': ['Faille Paradoxe'],
    'obsidian flames': ['Flammes Obsidiennes'],
    '151': ['151', 'Pokémon Card 151'],
  };

  for (const setName of distinctSetNames) {
    const candidates = new Set<string>();
    const decoded = htmlDecode(setName);
    candidates.add(decoded);
    const paren = decoded.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (paren) {
      candidates.add(paren[1].trim());
      candidates.add(paren[2].trim());
    }
    for (const c of [...candidates]) {
      const stripped = c.replace(/^pok[eé]mon(\s+card|\s+tcg)?\s+/i, '').trim();
      if (stripped !== c) candidates.add(stripped);
    }
    // Inject FR translation hints
    for (const c of [...candidates]) {
      const hints = FR_HINTS[normalize(c)];
      if (hints) for (const h of hints) candidates.add(h);
    }

    let exp: ExpRow | undefined;
    for (const c of candidates) {
      exp = byNameNorm.get(normalize(c));
      if (exp) break;
    }
    if (!exp) {
      for (const c of candidates) {
        exp = byTokens.get(tokensSorted(c));
        if (exp) break;
      }
    }

    if (exp) {
      const existing = matchedById.get(exp.id_expansion);
      if (existing) {
        existing.setNames.push(setName);
      } else {
        matchedById.set(exp.id_expansion, {
          setNames: [setName],
          idExpansion: exp.id_expansion,
          cmName: exp.name,
          slug: nameToSlug(exp.name),
          alreadyScraped: alreadyScraped.has(exp.id_expansion),
        });
      }
    } else {
      // For unmatched, surface CM expansions whose name shares any token with
      // the input — gives the user a concrete pick list to choose from.
      const inputTokens = new Set(normalize(decoded).split(/\s+/).filter((t) => t.length >= 4));
      const candidatesList = expansions.filter((e) => {
        const expTokens = normalize(e.name).split(/\s+/);
        return expTokens.some((t) => inputTokens.has(t));
      });
      unmatched.push({ setName, tried: Array.from(candidates), candidates: candidatesList.slice(0, 5) });
    }
  }

  const matched = Array.from(matchedById.values());

  console.log('MATCHED:');
  for (const m of matched) {
    const tag = m.alreadyScraped ? ' ✓ already scraped' : '';
    const sources = m.setNames.length > 1 ? ` [${m.setNames.length} cards]` : '';
    console.log(`  ${m.setNames[0].padEnd(40)} → ${m.cmName} (id=${m.idExpansion}, slug=${m.slug})${sources}${tag}`);
  }

  if (unmatched.length > 0) {
    console.log('\nUNMATCHED:');
    for (const u of unmatched) {
      console.log(`  ${u.setName}`);
      if (u.candidates.length > 0) {
        console.log(`    possible CM candidates (token overlap):`);
        for (const c of u.candidates) {
          console.log(`      - ${c.name} (id=${c.id_expansion}, slug=${nameToSlug(c.name)})`);
        }
      } else {
        console.log(`    (no CM expansion shares any token)`);
      }
    }
  }

  const toScrape = matched.filter((m) => !m.alreadyScraped);
  console.log('\n' + '='.repeat(60));
  if (toScrape.length === 0) {
    console.log('Nothing to scrape — all your expansions are already in cardmarket_card_index.');
  } else {
    console.log(`Recommended command (${toScrape.length} expansion${toScrape.length > 1 ? 's' : ''}):\n`);
    console.log(`  npm run scrape-cardmarket -- ${toScrape.map((m) => m.slug).join(' ')}\n`);
    if (unmatched.length > 0) {
      console.log('  Tip: pick slug(s) from the UNMATCHED candidates above and append them to the command.');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
