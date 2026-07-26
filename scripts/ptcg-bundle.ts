/**
 * Assembles a game file ready to upload into I.R.I.S.
 *
 *   npm run ptcg-bundle -- <log.txt> <analysis.json> [bundle.json]
 *
 * Step 2 of the loop: ptcg-digest produces the digest that gets analysed, this
 * merges the analysis back with the reconstruction into one self-contained file.
 * It runs the same validation the import route runs, so a bundle that would be
 * rejected on upload is caught here instead of on the doorstep.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PtcgBundle, PtcgCardRow } from '../lib/types';
import { parseGame } from '../lib/ptcg';
import { collectCardRefs, resolveCards } from '../lib/ptcg/cards';
import { buildBundle, validateBundle } from '../lib/ptcg/bundle';

const CACHE = join(process.cwd(), 'scripts/data/ptcg-cards-cache.json');

async function main() {
  const [logPath, analysisPath, outPath] = process.argv.slice(2);
  if (!logPath || !analysisPath) {
    console.error('usage: npm run ptcg-bundle -- <log.txt> <analysis.json> [bundle.json]');
    process.exit(1);
  }

  const raw = readFileSync(logPath, 'utf8');
  const analysis = JSON.parse(readFileSync(analysisPath, 'utf8')) as PtcgBundle['analysis'];
  const parsed = parseGame(raw);

  let known: Record<string, PtcgCardRow> = {};
  try {
    known = JSON.parse(readFileSync(CACHE, 'utf8')) as Record<string, PtcgCardRow>;
  } catch {
    // No cache yet.
  }
  const { cards, unresolved } = await resolveCards(collectCardRefs(parsed.state), { known });
  if (unresolved.length) console.warn(`⚠ cartes non résolues : ${unresolved.join(', ')}`);
  writeFileSync(CACHE, JSON.stringify(cards, null, 2));

  // The log carries no date, so take it from the file name when it starts with
  // one. Without this every game is stamped with its import time, and a history
  // sorted by date shows three games "today".
  const dated = /(\d{4})-(\d{2})-(\d{2})/.exec(logPath.replace(/\\/g, '/').split('/').pop() ?? '');
  const playedAt = dated
    ? new Date(`${dated[1]}-${dated[2]}-${dated[3]}T12:00:00Z`).toISOString()
    : undefined;
  if (!dated) console.warn('⚠ nom de fichier sans date — la partie sera datée de maintenant');

  const bundle = buildBundle(raw, parsed, cards, analysis, { playedAt });

  // Same gate as the import route: fail here rather than on upload.
  const check = validateBundle(bundle);
  for (const w of check.warnings) console.warn(`⚠ ${w}`);
  if (!check.ok) {
    console.error('\n✗ BUNDLE INVALIDE — non écrit');
    for (const e of check.errors) console.error(`   ${e}`);
    process.exit(1);
  }

  const out = outPath ?? `${logPath.replace(/\.[^.]+$/, '')}.bundle.json`;
  writeFileSync(out, JSON.stringify(bundle, null, 2));

  const kb = (JSON.stringify(bundle).length / 1024).toFixed(0);
  console.log(
    `${parsed.me} vs ${parsed.opponent} — ${parsed.result} ${parsed.prizesMe}-${parsed.prizesOpponent}`,
  );
  console.log(`${analysis.moments.length} commentaire(s), ${Object.keys(cards).length} cartes`);
  console.log(`\n✓ → ${out}  (${kb} Ko)  — à uploader dans IRIS`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
