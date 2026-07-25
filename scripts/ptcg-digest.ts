/**
 * Turns an exported battle log into a digest ready for analysis.
 *
 *   npm run ptcg-digest -- <log.txt> [digest.json]
 *
 * Standalone on purpose: it needs no database and no session, so a game can be
 * read the moment it finishes, before any of the UI exists. Card data is cached
 * on disk so only genuinely new cards ever hit TCGdex.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PtcgCardRow } from '../lib/types';
import { parseGame } from '../lib/ptcg';
import { collectCardRefs, resolveCards } from '../lib/ptcg/cards';
import { buildDigest } from '../lib/ptcg/digest';

const CACHE = join(process.cwd(), 'scripts/data/ptcg-cards-cache.json');

async function main() {
  const [logPath, outPath] = process.argv.slice(2);
  if (!logPath) {
    console.error('usage: npm run ptcg-digest -- <log.txt> [digest.json]');
    process.exit(1);
  }

  const raw = readFileSync(logPath, 'utf8');
  const parsed = parseGame(raw);

  console.log(`${parsed.me} (toi) vs ${parsed.opponent}`);
  console.log(
    `${parsed.result} ${parsed.prizesMe}-${parsed.prizesOpponent} en ${parsed.turns} tours`,
  );

  if (parsed.unknown.length) {
    console.warn(
      `\n⚠ ${parsed.unknown.length} ligne(s) non reconnue(s) — forme de log non gérée :`,
    );
    for (const u of parsed.unknown.slice(0, 10)) console.warn(`   L${u.line} | ${u.text}`);
  }

  // A digest built on a state that fails the damage oracle would produce a
  // confident, wrong analysis. Better to stop and show which check broke.
  const failures = parsed.validation.checks.filter((c) => c.ok === false);
  if (failures.length) {
    console.error('\n✗ VALIDATION ÉCHOUÉE — aucun digest produit');
    for (const f of failures) {
      console.error(
        `   ${f.kind}  ${f.detail}  attendu=${String(f.expected)}  obtenu=${String(f.got)}`,
      );
    }
    process.exit(1);
  }
  const passed = parsed.validation.checks.filter((c) => c.ok === true).length;
  console.log(`✓ validation : ${passed} vérifications passées`);

  let known: Record<string, PtcgCardRow> = {};
  try {
    known = JSON.parse(readFileSync(CACHE, 'utf8')) as Record<string, PtcgCardRow>;
  } catch {
    // No cache yet — the first run fetches everything.
  }

  const refs = collectCardRefs(parsed.state);
  const missing = refs.filter((r) => !known[r.id]).length;
  if (missing) console.log(`résolution de ${missing} carte(s) via TCGdex…`);

  const { cards, unresolved } = await resolveCards(refs, { known });
  if (unresolved.length) console.warn(`⚠ non résolues : ${unresolved.join(', ')}`);

  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cards, null, 2));

  const digest = buildDigest(parsed, cards, {
    gameId: parsed.logHash.slice(0, 12),
    playedAt: new Date().toISOString(),
  });

  const out = outPath ?? `${logPath.replace(/\.[^.]+$/, '')}.digest.json`;
  writeFileSync(out, JSON.stringify(digest, null, 2));

  const skipped = digest.turns
    .filter((t) => t.player === 'me' && t.available.unusedAbilities.length)
    .map((t) => `T${t.n}: ${t.available.unusedAbilities.map((a) => a.ability).join(', ')}`);
  if (skipped.length) console.log(`\ntalents disponibles non utilisés — ${skipped.join(' | ')}`);

  const kb = (JSON.stringify(digest).length / 1024).toFixed(0);
  console.log(`\n→ ${out}  (${kb} Ko)  — colle-le à Claude avec /ptcg-coach`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
