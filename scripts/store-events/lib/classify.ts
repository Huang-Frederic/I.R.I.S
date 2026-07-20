import type { EventType } from '../types';

/**
 * Best-effort mapping of a French event title to our normalized EventType.
 * Shared default — an extractor can ignore it and classify its own way when
 * its shop uses idiosyncratic wording.
 *
 * Order matters: the most specific patterns win (a "League Cup" is a cup,
 * not just any tournament).
 */
export function classifyEventType(title: string): EventType | null {
  const t = title.toLowerCase();
  if (/avant[-\s]?premi[èe]re|pr[ée]-?release|prerelease/.test(t)) return 'prerelease';
  if (/league\s*cup|ligue\s*cup/.test(t)) return 'league_cup';
  if (/league\s*challenge|challenge/.test(t)) return 'league_challenge';
  if (/session\s+de\s+ligue|jeu\s+libre|\bligue\b|\bleague\b/.test(t)) return 'league';
  if (/tournoi|tournament|circuit|comp[ée]titif/.test(t)) return 'tournament';
  return null;
}
