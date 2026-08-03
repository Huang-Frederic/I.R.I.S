/**
 * Deck archetype classification from the Pokémon a battle log reveals.
 *
 * Two jobs:
 *  - name MY deck by its Pokémon (Typhlosion + Dudunsparce vs Typhlosion +
 *    Drakloak), so stats can be split by the version I was actually playing;
 *  - name the OPPONENT deck by its key Pokémon (Dragapult + Blaziken →
 *    "Dragapult / Blaziken"), for the matchup table.
 *
 * Names are FRENCH (the client language of the logs). Matching is
 * accent-insensitive "contains", so prefixes fold in: "Zacian-ex de Nabil"
 * matches the "Zacian" key, "Migalos de Beladonis" matches "Migalos". A deck
 * that matches no rule falls back to its key card, never to a guess.
 */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** A rule matches when every GROUP is satisfied (AND between groups), and a
 *  group is satisfied when any of its FR base-name keys is present (OR within a
 *  group). This is what lets a rule survive a bad game: "the Typhlosion line"
 *  is [Cyndaquil OR Quilava OR Typhlosion], so a game that never reached the
 *  Stage 2 still classifies. Ordered most-specific first. */
interface Rule {
  label: string;
  groups: string[][];
}

/** The Typhlosion line — any stage identifies it (I don't always evolve up). */
const TYPHLO_LINE = ['typhlosion', 'feurisson', 'hericendre'];

/** MY decks — matched against the Pokémon on my side of the log. */
export const MY_ARCHETYPES: Rule[] = [
  { label: 'Typhlosion / Deusolourdo', groups: [TYPHLO_LINE, ['deusolourdo', 'insolourdo']] },
  { label: 'Typhlosion / Dispareptil', groups: [TYPHLO_LINE, ['dispareptil', 'fantyrm']] },
  { label: 'Typhlosion', groups: [TYPHLO_LINE] },
];

/**
 * OPPONENT decks. FR Pokémon names (game-official, stable) for the current
 * Standard meta plus what Frédéric has already faced. Each ace is listed by
 * its whole line so a game where it never evolved still classifies. Add a row
 * when a new archetype shows up — an unknown deck falls back to its ace.
 */
export const OPPONENT_ARCHETYPES: Rule[] = [
  // Two-Pokémon signatures first.
  { label: 'Dragapult / Blaziken', groups: [['lanssorien'], ['brasegali', 'galifeu', 'poussifeu']] },
  { label: 'Dragapult / Dusknoir', groups: [['lanssorien'], ['noctunoir', 'skelenox', 'teraclope']] },
  { label: 'Grimmsnarl / Froslass', groups: [['migalos'], ['momartik', 'stalgamin']] },
  { label: 'Lucario / Hariyama', groups: [['lucario', 'riolu'], ['hariyama', 'makuhita']] },
  { label: 'Alakazam / Dudunsparce', groups: [['alakazam', 'abra'], ['deusolourdo', 'insolourdo']] },
  { label: 'Ogerpon / Hydrapple', groups: [['ogerpon'], ['pomdorochi', 'pomdramour']] },
  { label: 'Raging Bolt / Ogerpon', groups: [['ire-foudre'], ['ogerpon']] },
  // One-Pokémon aces (whole line each).
  { label: 'Dragapult', groups: [['lanssorien', 'fantyrmagik', 'lugulabre']] },
  { label: 'Grimmsnarl', groups: [['migalos', 'grimalin', 'fermeton']] },
  { label: 'Dhelmise', groups: [['sepiatop']] },
  { label: 'Metagross', groups: [['metalosse', 'metang', 'terhal']] },
  { label: 'Mega Excadrill', groups: [['minotaupe', 'rototaupe']] },
  { label: "N's Zacian", groups: [['zacian']] },
  { label: "N's Zoroark", groups: [['zoroark', 'zorua']] },
  { label: 'Slowking', groups: [['roigada', 'ramoloss']] },
  { label: 'Alakazam', groups: [['alakazam', 'abra']] },
  { label: 'Garchomp', groups: [['carchacrok', 'griknot']] },
  { label: 'Blaziken', groups: [['brasegali', 'galifeu']] },
  { label: "Rocket's Honchkrow", groups: [['cornebre', 'corboss']] },
  { label: "Rocket's Mewtwo", groups: [['mewtwo']] },
  { label: 'Lucario', groups: [['lucario', 'riolu']] },
  { label: 'Charizard', groups: [['dracaufeu']] },
  { label: 'Hydrapple', groups: [['pomdorochi']] },
  { label: 'Gardevoir', groups: [['gardevoir', 'tarsal', 'kirlia']] },
  { label: 'Solrock Box', groups: [['solaroc', 'seleroc']] },
];

/** Runs a rule table over a set of already-normalized Pokémon names. */
function match(rules: Rule[], pokemon: Set<string>): string | null {
  const present = [...pokemon];
  for (const r of rules) {
    const ok = r.groups.every((group) => group.some((key) => present.some((p) => p.includes(key))));
    if (ok) return r.label;
  }
  return null;
}

export function classifyMyDeck(pokemon: Set<string>): string {
  const normed = new Set([...pokemon].map(norm));
  return match(MY_ARCHETYPES, normed) ?? 'Typhlosion';
}

/** Classifies the opponent; `keyCard` (the DB ace, e.g. "Pashmilla-ex") is the
 *  fallback when no signature matches — better a real ace than "Autre". */
export function classifyOpponent(pokemon: Set<string>, keyCard: string | null): string {
  const normed = new Set([...pokemon].map(norm));
  return match(OPPONENT_ARCHETYPES, normed) ?? keyCard ?? '?';
}

const CARD = String.raw`\([^)]+\)\s*`;

/**
 * Every Pokémon name seen on a given player's side, from a raw FR log. A card
 * is a Pokémon (not a Trainer) when it is played to the Active/Bench, is
 * evolved into, uses an ability/attack, is knocked out, or is promoted — the
 * six phrasings below cover all of those and never a Trainer line.
 */
export function extractPokemon(raw: string, player: string): Set<string> {
  const out = new Set<string>();
  const P = player.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rePlay = new RegExp(`^${P} a joué ${CARD}(.+?) sur (?:le Banc|le Poste Actif)`);
  const reEvo = new RegExp(`^${P} a fait évoluer ${CARD}(.+?) en ${CARD}(.+?) sur`);
  // Owner-suffixed lines: "(id) Name de <player> a utilisé / a été mis K.O. /
  // est maintenant …". Name may itself contain " de " (none of the meta aces
  // do), so anchor on the owner being exactly this player at the tail.
  const reOwner = new RegExp(
    `^${CARD}(.+?) de ${P} (?:a utilisé|a été mis K\\.O\\.|est maintenant)`,
  );
  for (const line of raw.split(/\r?\n/)) {
    let m: RegExpExecArray | null;
    if ((m = rePlay.exec(line))) out.add(m[1].trim());
    if ((m = reEvo.exec(line))) {
      out.add(m[1].trim());
      out.add(m[2].trim());
    }
    if ((m = reOwner.exec(line))) out.add(m[1].trim());
  }
  return out;
}
