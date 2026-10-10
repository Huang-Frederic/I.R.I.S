/**
 * Rebuilds each fixture game's board state with the project's own parser
 * (lib/ptcg), as the app does on import: the fixtures only carry the battle
 * logs, with the opponents' names replaced. Run by seed.mjs through the
 * project's tsx:  tsx SHOWCASE/capture/ptcg-state.ts <games.json> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseGame } from '../../lib/ptcg/index';

const [input, output] = process.argv.slice(2);
const games: { id: string; raw_log: string }[] = JSON.parse(readFileSync(input, 'utf8'));

const rebuilt = games.map((game) => {
  const parsed = parseGame(game.raw_log);
  return {
    id: game.id,
    state: parsed.state,
    validation: parsed.validation,
    log_hash: parsed.logHash,
    parser_version: parsed.parserVersion,
  };
});
writeFileSync(output, JSON.stringify(rebuilt));
