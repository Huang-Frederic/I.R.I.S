/**
 * Deck archetype classification from the Pokémon a battle log reveals.
 *
 *  - name MY deck from MY cards (the Dudunsparce build, the old Drakloak build,
 *    or Cynthia's Garchomp), so stats can be filtered to the list I'm playing;
 *  - name the OPPONENT deck from their key Pokémon (Dragapult + Blaziken →
 *    "Dragapult / Blaziken"), for the matchup table, with a national-dex number
 *    per archetype so the UI can show a pixel sprite.
 *
 * Names are FRENCH (the client language). Matching is accent-insensitive
 * "contains", so prefixes fold in: "Zacian-ex de Nabil" matches "zacian",
 * "Corboss de la Team Rocket" matches "corboss". A deck that matches no rule
 * falls back to its ace card, never to a guess.
 */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A rule matches when every GROUP is satisfied (AND between groups), a group
 *  when any of its FR base-name keys is present (OR within a group). Listing a
 *  whole evolution line in one group lets a game where the ace never evolved
 *  still classify. `dex` is the national number of the sprite to show. */
export interface Rule {
  label: string;
  groups: string[][];
  dex: number;
}

/** MY decks. `signals` are cards that ONLY my version of that deck runs (so a
 *  game is attributed even when the ace didn't come down). Checked against the
 *  cards I actually played — see classifyMyDeck. */
interface MyRule {
  label: string;
  signals: string[];
  dex: number;
}
export const MY_ARCHETYPES: MyRule[] = [
  {
    label: 'Typhlosion / Dudunsparce',
    // Dudunsparce engine + trainers unique to the new list.
    signals: [
      'insolourdo',
      'deusolourdo',
      'tour prismatique',
      'casque chance',
      'combat final de gladio',
    ],
    dex: 982,
  },
  {
    label: 'Typhlosion / Drakloak',
    signals: ['dispareptil', 'fantyrm'],
    dex: 886,
  },
  {
    label: "Cynthia's Garchomp",
    // Every signature card carries the "de Cynthia" suffix; the Garchomp line
    // ("Carchacrok"/"Carchacrock") folds under the accent-free prefix.
    signals: ['de cynthia', 'carchacro', 'roserade'],
    dex: 445,
  },
];

/**
 * OPPONENT decks — the current Standard meta (Limitless, top ~30) plus decks
 * Frédéric has faced. FR Pokémon names are game-official and stable. Ordered
 * most-specific first so two-Pokémon signatures win over one-Pokémon aces.
 */
export const OPPONENT_ARCHETYPES: Rule[] = [
  // "Festival lead" — the Festival Grounds ("Lieu de la Fête") control deck.
  // Recognised by the Grookey line (Ouistempo/Badabouin/Gorythmic) OR the
  // stadium itself. Checked FIRST so it wins over the Hydrapple line it also
  // runs. Sprite = Badabouin (#811). See extractOpponentSignals for the stadium.
  {
    label: 'Festival lead',
    groups: [['badabouin', 'ouistempo', 'gorythmic', 'lieu de la fete']],
    dex: 811,
  },
  // Two-Pokémon signatures.
  {
    label: 'Dragapult / Blaziken',
    groups: [
      ['lanssorien', 'fantyrm', 'dispareptil'],
      ['brasegali', 'galifeu', 'poussifeu'],
    ],
    dex: 257,
  },
  {
    label: 'Dragapult / Dusknoir',
    groups: [
      ['lanssorien', 'fantyrm', 'dispareptil'],
      ['noctunoir', 'teraclope', 'skelenox'],
    ],
    dex: 477,
  },
  {
    label: 'Grimmsnarl / Froslass',
    groups: [
      ['migalos', 'grimalin', 'fermeton'],
      ['momartik', 'stalgamin'],
    ],
    dex: 861,
  },
  {
    label: 'Lucario / Hariyama',
    groups: [
      ['lucario', 'riolu'],
      ['hariyama', 'makuhita'],
    ],
    dex: 448,
  },
  {
    label: 'Alakazam / Dudunsparce',
    groups: [
      ['alakazam', 'abra', 'kadabra'],
      ['deusolourdo', 'insolourdo'],
    ],
    dex: 65,
  },
  {
    label: 'Ogerpon / Hydrapple',
    groups: [
      ['ogerpon', 'meganium', 'macronium', 'germignon'],
      ['pomdramour', 'pomdorochi', 'verpom'],
    ],
    dex: 1019,
  },
  {
    label: 'Ogerpon / Meganium',
    groups: [['ogerpon'], ['meganium', 'macronium', 'germignon']],
    dex: 154,
  },
  { label: 'Raging Bolt / Ogerpon', groups: [['ire-foudre'], ['ogerpon']], dex: 1021 },
  {
    label: 'Blaziken / Zoroark',
    groups: [
      ['brasegali', 'galifeu'],
      ['zoroark', 'zorua'],
    ],
    dex: 257,
  },
  // One-Pokémon aces (whole line each).
  { label: 'Dragapult', groups: [['lanssorien', 'fantyrm', 'dispareptil']], dex: 887 },
  { label: 'Dusknoir', groups: [['noctunoir', 'teraclope', 'skelenox']], dex: 477 },
  { label: 'Grimmsnarl', groups: [['migalos', 'grimalin']], dex: 861 },
  { label: 'Dhelmise', groups: [['sepiatop']], dex: 781 },
  { label: 'Toucannon', groups: [['bazoucan', 'piclairon', 'picassaut']], dex: 733 },
  { label: 'Metagross', groups: [['metalosse', 'metang', 'terhal']], dex: 376 },
  { label: 'Mega Excadrill', groups: [['minotaupe', 'rototaupe']], dex: 530 },
  { label: 'Mega Greninja', groups: [['amphinobi', 'croaporal', 'grenousse']], dex: 658 },
  // "Lockpin" is the FR name for Lopunny (Laporeille = Buneary is its pre-evo).
  { label: 'Mega Lopunny', groups: [['lockpin', 'laporeille']], dex: 428 },
  { label: 'Yanmega', groups: [['yanmega', 'yanma']], dex: 469 },
  { label: 'Mega Chandelure', groups: [['lugulabre', 'melancolux', 'funecire']], dex: 609 },
  { label: 'Mega Absol', groups: [['absol']], dex: 359 },
  { label: 'Ceruledge', groups: [['malvalame', 'charbambin', 'braisillon']], dex: 937 },
  { label: "N's Zoroark", groups: [['zoroark', 'zorua']], dex: 571 },
  { label: "N's Zacian", groups: [['zacian']], dex: 888 },
  { label: 'Slowking', groups: [['roigada', 'ramoloss']], dex: 199 },
  { label: 'Alakazam', groups: [['alakazam', 'abra', 'kadabra']], dex: 65 },
  { label: 'Garchomp', groups: [['carchacro', 'griknot', 'carmache']], dex: 445 },
  { label: 'Blaziken', groups: [['brasegali', 'galifeu']], dex: 257 },
  { label: "Rocket's Honchkrow", groups: [['corboss', 'cornebre']], dex: 430 },
  { label: "Rocket's Mewtwo", groups: [['mewtwo']], dex: 150 },
  { label: 'Kangaskhan Box', groups: [['kangourex']], dex: 115 },
  { label: 'Manectric', groups: [['elecsprint', 'dynavolt']], dex: 310 },
  { label: 'Beedrill', groups: [['dardargnan', 'coconfort', 'aspicot']], dex: 15 },
  { label: 'Genesect', groups: [['genesect']], dex: 649 },
  { label: 'Hydrapple', groups: [['pomdorochi', 'pomdramour', 'verpom']], dex: 1019 },
  { label: 'Ogerpon', groups: [['ogerpon']], dex: 1017 },
  { label: 'Feraligatr', groups: [['aligatueur', 'crocrodil', 'kaiminus']], dex: 160 },
  { label: 'Charizard', groups: [['dracaufeu']], dex: 6 },
  { label: 'Gardevoir', groups: [['gardevoir', 'kirlia', 'tarsal']], dex: 282 },
  { label: 'Hop’s Trevenant', groups: [['desseliande', 'brocelome']], dex: 709 },
];

/** label → dex, for sprites on rows classified to a known archetype. */
const DEX_BY_LABEL = new Map<string, number>([
  ...MY_ARCHETYPES.map((r) => [r.label, r.dex] as const),
  ...OPPONENT_ARCHETYPES.map((r) => [r.label, r.dex] as const),
]);

/** The pixel sprite for an archetype label, or null if it's an ace fallback. */
export function archetypeSprite(label: string): string | null {
  const dex = DEX_BY_LABEL.get(label);
  return dex
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`
    : null;
}

function matchRules(rules: Rule[], pokemon: Set<string>): string | null {
  const present = [...pokemon];
  for (const r of rules) {
    if (r.groups.every((g) => g.some((k) => present.some((p) => p.includes(k))))) return r.label;
  }
  return null;
}

export function classifyOpponent(pokemon: Set<string>, keyCard: string | null): string {
  const normed = new Set([...pokemon].map(norm));
  return matchRules(OPPONENT_ARCHETYPES, normed) ?? keyCard ?? '?';
}

// The "(sv10_34) " card-id prefix PTCG Live prints before a card name — but
// ONLY for the player whose hand is known; it dropped it from the opponent's
// lines in an Aug-2026 log-format change. Optional, or the opponent's Pokémon
// (and thus their archetype) never get extracted → everything falls to "?".
const CARD = String.raw`(?:\([^)]+\)\s*)?`;

/**
 * Every Pokémon name on a player's side, from a raw FR log. A card is a Pokémon
 * (not a Trainer) when it is played to Active/Bench, evolved into, uses an
 * ability/attack, is KO'd, or is promoted — the phrasings below cover those and
 * never a Trainer line.
 */
export function extractPokemon(raw: string, player: string): Set<string> {
  const out = new Set<string>();
  const P = player.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rePlay = new RegExp(`^${P} a joué ${CARD}(.+?) sur (?:le Banc|le Poste Actif)`);
  const reEvo = new RegExp(`^${P} a fait évoluer ${CARD}(.+?) en ${CARD}(.+?) sur`);
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

/**
 * The opponent's archetype SIGNALS: every Pokémon they revealed (extractPokemon)
 * PLUS the one deck-defining stadium we key on — Festival Grounds ("Lieu de la
 * Fête"), which names the "Festival lead" deck even when its Pokémon stayed in
 * hand. Kept separate from extractPokemon so classifyMyDeck stays Pokémon-only.
 */
export function extractOpponentSignals(raw: string, opponent: string): Set<string> {
  const out = extractPokemon(raw, opponent);
  const P = opponent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reStadium = new RegExp(`^${P} a joué ${CARD}Lieu de la Fête`);
  if (raw.split(/\r?\n/).some((l) => reStadium.test(l))) out.add('Lieu de la Fête');
  return out;
}

/** Every card name (Pokémon AND Trainer) I played or used, for my-deck
 *  classification — the distinguishing cards include trainers (Prism Tower…),
 *  which extractPokemon deliberately skips. */
function myCards(raw: string, me: string): Set<string> {
  const out = extractPokemon(raw, me);
  const P = me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "Hisshiden a joué (id) <card> [sur … | comme … | .]" — trainers included.
  const rePlayed = new RegExp(`^${P} a joué ${CARD}(.+?)(?: sur | comme |\\.$)`);
  for (const line of raw.split(/\r?\n/)) {
    const m = rePlayed.exec(line);
    if (m) out.add(m[1].trim());
  }
  return out;
}

/**
 * Names my deck from MY cards only (the opponent's Dudunsparce engine can't
 * mislabel my game). The old Drakloak build runs its Dreepy/Drakloak draw
 * engine every game, so it reliably self-signals; anything without that signal
 * is the current Dudunsparce build — which is also the sensible default, since
 * a new-deck game that never drew Dunsparce would otherwise go unclassified.
 */
export function classifyMyDeck(raw: string, me: string): string {
  const present = [...myCards(raw, me)].map(norm);
  const has = (k: string) => present.some((p) => p.includes(k));
  const byLabel = (l: string) => MY_ARCHETYPES.find((r) => r.label === l)!;
  // Garchomp and the old Drakloak build both self-signal; anything else is the
  // current Dudunsparce list (the sensible default — see note above).
  if (byLabel("Cynthia's Garchomp").signals.some(has)) return "Cynthia's Garchomp";
  if (byLabel('Typhlosion / Drakloak').signals.some(has)) return 'Typhlosion / Drakloak';
  return 'Typhlosion / Dudunsparce';
}
