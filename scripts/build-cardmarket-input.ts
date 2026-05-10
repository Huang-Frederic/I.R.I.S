/**
 * Generate the Cardmarket scraper input JSON from cardmarket_expansions.json.
 *
 * Usage:
 *   npm run build-cardmarket-input
 *
 * Output: ./cardmarket-input.json (gitignored — place this file at
 * scrapers/cardmarket/storage/key_value_stores/default/INPUT.json).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'cardmarket_expansions.json');
const OUTPUT_PATH = path.join(ROOT, 'cardmarket-input.json');

interface ExpansionEntry {
  idExpansion: number;
  name: string;
  slug: string;
}

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const raw = JSON.parse(readFileSync(INPUT_PATH, 'utf8')) as Record<
  string,
  string
>;

const expansions: ExpansionEntry[] = Object.entries(raw).map(([id, name]) => ({
  idExpansion: Number(id),
  name,
  slug: slugify(name),
}));

const output = {
  expansions,
  skipExisting: true,
  concurrency: 3,
  perPage: 30,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log(
  `Wrote ${expansions.length} expansions to ${path.relative(ROOT, OUTPUT_PATH)}`,
);
