/**
 * Tokenizer for Pokémon TCG Live battle logs (French export).
 *
 * Each line becomes a typed event. `- ...` lines are sub-events of the last
 * top-level event, and `   • ...` lines are the card lists (or damage-analysis
 * rows) belonging to the last sub-event.
 *
 * No line is dropped silently: anything unrecognised surfaces in `unknown`.
 * That is how a new set introducing a new phrasing announces itself, instead of
 * quietly producing a reconstruction that is missing half the game.
 */

import type { PtcgCardRef } from '@/lib/types';

export interface PtcgEvent {
  type: string;
  line: number;
  children?: PtcgEvent[];
  /** Card list attached to this sub-event, from the `• ...` bullets. */
  cards?: PtcgCardRef[];
  /** Damage-analysis rows, only on `damage-analysis` events. */
  entries?: { label: string; damage: number }[];
  [key: string]: unknown;
}

export interface PtcgTokenizeResult {
  players: [string, string];
  events: PtcgEvent[];
  unknown: { line: number; text: string }[];
}

type Rule = [string, RegExp, (m: RegExpExecArray) => Record<string, unknown>];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Player handles, read off the `Tour de X` lines.
 *
 * They have to be known before anything else can be parsed: card names contain
 * " de " (`Feurisson de Luth`, `Ordres du Boss`), so `X de Y` is ambiguous until
 * the handles are pinned down and injected into the patterns as literals.
 */
function findPlayers(lines: string[]): [string, string] {
  const names = new Set<string>();
  for (const l of lines) {
    const m = /^Tour de (.+)$/.exec(l.trim());
    if (m) names.add(m[1]);
  }
  if (names.size !== 2) {
    throw new Error(`Expected exactly 2 players, found ${names.size}: ${[...names].join(', ')}`);
  }
  return [...names] as [string, string];
}

/** Pulls every `(id) Name` reference out of a bullet line. */
function parseCardList(text: string): PtcgCardRef[] {
  const out: PtcgCardRef[] = [];
  const re = /\(([^)]+)\)\s*([^,]+?)(?=\s*,\s*\(|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push({ id: m[1], name: m[2].trim() });
  return out;
}

export function tokenize(raw: string): PtcgTokenizeResult {
  const lines = raw.split(/\r?\n/);

  /**
   * Flattens the invisible differences between two copies of the same log.
   *
   * French typography puts a thin no-break space before `: ! ? ;`, and the
   * patterns here are written with ordinary spaces — a literal space in a
   * regex does not match U+202F, so a single invisible character turns
   * "Analyse des dégâts :" into an unrecognised line and takes the whole
   * damage-analysis block with it. Accents are folded to NFC for the same
   * reason: a decomposed "é" is two code points and matches nothing.
   *
   * Applied to the lines only. The raw log is hashed as it arrived, since that
   * hash is what makes a re-import recognisable as the same game.
   */
  const normaliseSpaces = (s: string) =>
    s
      .replace(/[\u00a0\u202f\u2007\u2009\u2060\ufeff]/g, ' ')
      .normalize('NFC')
      .trim();
  const players = findPlayers(lines);
  const P = players.map(esc).join('|');
  const C = '\\(([^)]+)\\)\\s(.+?)'; // one card reference
  const ZONE = '(Poste Actif|Banc)';

  const main: Rule[] = [
    ['setup-section', /^Préparation$/, () => ({})],
    ['turn-start', new RegExp(`^Tour de (${P})$`), (m) => ({ player: m[1] })],

    [
      'coin-choice',
      new RegExp(`^(${P}) a choisi (face|pile) pour le lancer de pièce initial\\.$`),
      (m) => ({ player: m[1], choice: m[2] }),
    ],
    ['coin-win', new RegExp(`^(${P}) a gagné le lancer de pièce\\.$`), (m) => ({ player: m[1] })],
    [
      'play-order',
      new RegExp(`^(${P}) a décidé de jouer (en premier|en second)\\.$`),
      (m) => ({ player: m[1], order: m[2] }),
    ],
    [
      'opening-hand',
      new RegExp(`^(${P}) a pioché (\\d+) cartes pour sa main de départ\\.$`),
      (m) => ({ player: m[1], count: +m[2] }),
    ],

    [
      'play-pokemon',
      new RegExp(`^(${P}) a joué ${C} sur le ${ZONE}\\.$`),
      (m) => ({ player: m[1], card: { id: m[2], name: m[3] }, zone: m[4] }),
    ],
    [
      'play-stadium',
      new RegExp(`^(${P}) a joué ${C} comme Stade\\.$`),
      (m) => ({ player: m[1], card: { id: m[2], name: m[3] } }),
    ],
    [
      'play-trainer',
      new RegExp(`^(${P}) a joué ${C}\\.$`),
      (m) => ({ player: m[1], card: { id: m[2], name: m[3] } }),
    ],

    [
      'draw-known',
      new RegExp(`^(${P}) a pioché ${C}\\.$`),
      (m) => ({ player: m[1], card: { id: m[2], name: m[3] } }),
    ],
    [
      'draw-hidden',
      new RegExp(`^(${P}) a pioché une carte\\.$`),
      (m) => ({ player: m[1], count: 1 }),
    ],
    [
      'draw-hidden',
      new RegExp(`^(${P}) a pioché (\\d+) cartes\\.$`),
      (m) => ({ player: m[1], count: +m[2] }),
    ],

    [
      'evolve',
      new RegExp(`^(${P}) a fait évoluer ${C} en ${C} sur le ${ZONE}\\.$`),
      (m) => ({
        player: m[1],
        from: { id: m[2], name: m[3] },
        to: { id: m[4], name: m[5] },
        zone: m[6],
      }),
    ],
    [
      'attach',
      new RegExp(`^(${P}) a attaché ${C} à ${C} sur le ${ZONE}\\.$`),
      (m) => ({
        player: m[1],
        card: { id: m[2], name: m[3] },
        target: { id: m[4], name: m[5] },
        zone: m[6],
      }),
    ],
    [
      'retreat',
      new RegExp(`^(${P}) a fait battre en retraite ${C} sur le Banc\\.$`),
      (m) => ({ player: m[1], card: { id: m[2], name: m[3] } }),
    ],
    [
      'promote',
      new RegExp(`^${C} de (${P}) est maintenant sur le Poste Actif\\.$`),
      (m) => ({ player: m[3], card: { id: m[1], name: m[2] } }),
    ],

    [
      'attack',
      new RegExp(
        `^${C} de (${P}) a utilisé (.+?) sur ${C} de (${P}) et a infligé (\\d+) dégâts\\.\\s*(.*)$`,
      ),
      (m) => ({
        player: m[3],
        source: { id: m[1], name: m[2] },
        move: m[4],
        target: { id: m[5], name: m[6] },
        targetPlayer: m[7],
        damage: +m[8],
        trailer: m[9] || '',
      }),
    ],
    [
      'use',
      new RegExp(`^${C} de (${P}) a utilisé (.+?)\\.$`),
      (m) => ({ player: m[3], source: { id: m[1], name: m[2] }, move: m[4] }),
    ],

    [
      'ko',
      new RegExp(`^${C} de (${P}) a été mis K\\.O\\. !$`),
      (m) => ({ player: m[3], card: { id: m[1], name: m[2] } }),
    ],
    [
      'take-prize',
      new RegExp(`^(${P}) a récupéré (une|\\d+) cartes? Récompense\\.$`),
      (m) => ({ player: m[1], count: m[2] === 'une' ? 1 : +m[2] }),
    ],
    [
      'prize-to-hand',
      new RegExp(`^La carte ${C} a été ajoutée à la main de (${P})\\.$`),
      (m) => ({ player: m[3], card: { id: m[1], name: m[2] } }),
    ],
    [
      'prize-to-hand',
      new RegExp(`^La carte Une carte a été ajoutée à la main de (${P})\\.$`),
      (m) => ({ player: m[1], card: null }),
    ],

    // Mulligans. The opponent reveals their whole hand, which is the one moment
    // their cards are visible — worth keeping, it hints at their archetype.
    [
      'mulligan',
      new RegExp(`^(${P}) a déclaré (une|\\d+) misères?\\.$`),
      (m) => ({ player: m[1], count: m[2] === 'une' ? 1 : +m[2] }),
    ],
    [
      'mulligan-bonus-draw',
      new RegExp(
        `^(${P}) a pioché une carte supplémentaire car (${P}) a déclaré au moins une misère\\.$`,
      ),
      (m) => ({ player: m[1], because: m[2] }),
    ],

    // A card discarded from a Pokémon outside a knockout (an attack cost paid
    // after the fact). Same shape as the sub-event, but at top level.
    [
      'discard-attached',
      new RegExp(`^La carte ${C} a été défaussée de ${C} de (${P})\\.$`),
      (m) => ({
        count: 1,
        cards: [{ id: m[1], name: m[2] }],
        from: { id: m[3], name: m[4] },
        player: m[5],
      }),
    ],

    // Activating a Stadium already in play. No card id, and no leading "(" —
    // which is what separates it from playing a Trainer. Must stay after the
    // play-* rules so it only catches what they did not.
    [
      'use-stadium',
      new RegExp(`^(${P}) a joué ([^(].*)\\.$`),
      (m) => ({ player: m[1], stadium: m[2] }),
    ],

    ['end-turn', new RegExp(`^(${P}) a mis fin à son tour\\.$`), (m) => ({ player: m[1] })],
    // Three spellings: prizes taken by the opponent, prizes taken by you, and
    // a concession. Missing one makes the game read as a tie.
    [
      'game-end',
      new RegExp(`^Toutes les cartes Récompense ont été récupérées\\. (${P}) gagne\\.$`),
      (m) => ({ winner: m[1] }),
    ],
    [
      'game-end',
      new RegExp(`^L['’]adversaire a concédé la partie\\. (${P}) gagne\\.$`),
      (m) => ({ winner: m[1], byConcession: true }),
    ],
    [
      'game-end',
      new RegExp(`^L['’]adversaire a récupéré toutes ses cartes Récompense\\. (${P}) gagne\\.$`),
      (m) => ({ winner: m[1] }),
    ],
    // Losing with nothing left to promote. The doubled full stop is the log's,
    // not a typo here — the sentence already ends in one and the template adds
    // another.
    [
      'game-end',
      new RegExp(
        `^L['’]adversaire a mis K\\.O\\. tous vos Pokémon en jeu, et toutes ses cartes Récompense ont été récupérées\\.\\.? (${P}) gagne\\.$`,
      ),
      (m) => ({ winner: m[1] }),
    ],

    // A Special Energy triggering its own effect. No state change here: the
    // sub-line that follows says where the card went.
    [
      'energy-activated',
      new RegExp(`^La carte ${C} a été activée\\.$`),
      (m) => ({ card: { id: m[1], name: m[2] } }),
    ],
  ];

  const sub: Rule[] = [
    ['damage-analysis', /^Analyse des dégâts :$/, () => ({ entries: [] })],

    ['mulligan-reveal', /^Cartes montrées à la suite de la misère (\d+)\.$/, (m) => ({ n: +m[1] })],

    // Hand disruption: the attacker sends cards from the *other* player's hand
    // to the discard. Named when it is our hand, so they can be removed exactly
    // — and they still count for anything that scales on the discard pile.
    [
      'discard-opponent-hand',
      new RegExp(`^(${P}) a déplacé (\\d+) cartes de (${P}) vers la pile de défausse\\.$`),
      (m) => ({ actor: m[1], count: +m[2], player: m[3] }),
    ],

    ['opening-hand-count', /^(\d+) cartes piochées\.$/, (m) => ({ count: +m[1] })],

    [
      'discard-from-hand',
      new RegExp(`^(${P}) a défaussé (\\d+) cartes\\.$`),
      (m) => ({ player: m[1], count: +m[2] }),
    ],
    [
      'discard-from-hand',
      new RegExp(`^(${P}) a défaussé ${C}\\.$`),
      (m) => ({ player: m[1], count: 1, cards: [{ id: m[2], name: m[3] }] }),
    ],

    [
      'draw-known',
      new RegExp(`^(${P}) a pioché ${C}\\.$`),
      (m) => ({ player: m[1], card: { id: m[2], name: m[3] } }),
    ],
    [
      'bench-from-deck',
      new RegExp(`^(${P}) a pioché (\\d+) cartes et les a jouées sur le Banc\\.$`),
      (m) => ({ player: m[1], count: +m[2] }),
    ],
    // Singular form: the card is named inline rather than in a bullet list.
    [
      'bench-from-deck',
      new RegExp(`^(${P}) a pioché la carte ${C} et l['’]a jouée sur le Banc\\.$`),
      (m) => ({ player: m[1], count: 1, cards: [{ id: m[2], name: m[3] }] }),
    ],
    [
      'draw-hidden',
      new RegExp(`^(${P}) a pioché (\\d+) cartes\\.$`),
      (m) => ({ player: m[1], count: +m[2] }),
    ],

    ['shuffle-deck', new RegExp(`^(${P}) a mélangé son deck\\.$`), (m) => ({ player: m[1] })],
    ['shuffle-hand', new RegExp(`^(${P}) a mélangé sa main\\.$`), (m) => ({ player: m[1] })],
    [
      'shuffle-prizes',
      new RegExp(`^(${P}) a mélangé ses cartes Récompense\\.$`),
      (m) => ({ player: m[1] }),
    ],
    [
      'shuffle-into-deck',
      new RegExp(`^(${P}) a mélangé (\\d+) cartes avec son deck\\.$`),
      (m) => ({ player: m[1], count: +m[2] }),
    ],
    [
      'shuffle-into-deck',
      new RegExp(`^(${P}) a mélangé ${C} avec son deck\\.$`),
      (m) => ({ player: m[1], count: 1, cards: [{ id: m[2], name: m[3] }] }),
    ],

    [
      'evolve',
      new RegExp(`^(${P}) a fait évoluer ${C} en ${C} sur le ${ZONE}\\.$`),
      (m) => ({
        player: m[1],
        from: { id: m[2], name: m[3] },
        to: { id: m[4], name: m[5] },
        zone: m[6],
      }),
    ],

    // The log regularly names the wrong owner here. `claimedOwner` is kept as
    // reported but must never be trusted — see resolveDamageTarget in state.ts.
    [
      'place-damage',
      new RegExp(`^(${P}) a placé (\\d+) marqueurs de dégâts sur ${C} de (${P})\\.$`),
      (m) => ({
        player: m[1],
        counters: +m[2],
        target: { id: m[3], name: m[4] },
        claimedOwner: m[5],
      }),
    ],

    [
      'move-to-hand',
      new RegExp(`^(${P}) a déplacé ${C} de (${P}) vers sa main\\.$`),
      (m) => ({ player: m[1], card: { id: m[2], name: m[3] } }),
    ],
    [
      'hand-to-deck',
      new RegExp(`^(${P}) a déplacé (\\d+) cartes de (${P}) vers son deck\\.$`),
      (m) => ({ player: m[3], count: +m[2] }),
    ],
    [
      'deck-to-prizes',
      new RegExp(`^(${P}) a déplacé (\\d+) cartes de (${P}) vers les cartes Récompense\\.$`),
      (m) => ({ player: m[3], count: +m[2] }),
    ],
    [
      'prizes-under-deck',
      new RegExp(`^(${P}) a placé (\\d+) cartes au-dessous de son deck\\.$`),
      (m) => ({ player: m[1], count: +m[2] }),
    ],

    // Singular forms. The log switches to "une carte" for exactly one, which
    // the digit-only patterns above miss — Billet à Échanger with one prize
    // left produces both of these in a row.
    [
      'deck-to-prizes',
      new RegExp(`^(${P}) a déplacé une carte de (${P}) vers les cartes Récompense\\.$`),
      (m) => ({ player: m[2], count: 1 }),
    ],
    [
      'prizes-under-deck',
      new RegExp(`^(${P}) a placé une carte au-dessous de son deck\\.$`),
      (m) => ({ player: m[1], count: 1 }),
    ],

    // Cards recovered from the discard in bulk (Soutien de Néphie). The named
    // singular already exists; this is the counted form, whose cards arrive in
    // the bullet list underneath.
    [
      'move-to-hand',
      new RegExp(`^(${P}) a déplacé (\\d+) cartes de (${P}) vers sa main\\.$`),
      (m) => ({ player: m[3], count: +m[2] }),
    ],

    // A hidden draw spelled as a sub-line, under whatever caused it.
    [
      'draw-hidden',
      new RegExp(`^(${P}) a pioché une carte\\.$`),
      (m) => ({ player: m[1], count: 1 }),
    ],

    [
      'discard-attached',
      new RegExp(`^(\\d+) cartes ont été défaussées de ${C} de (${P})\\.$`),
      (m) => ({ count: +m[1], from: { id: m[2], name: m[3] }, player: m[4] }),
    ],
    [
      'discard-attached',
      new RegExp(`^La carte ${C} a été défaussée de ${C} de (${P})\\.$`),
      (m) => ({
        count: 1,
        cards: [{ id: m[1], name: m[2] }],
        from: { id: m[3], name: m[4] },
        player: m[5],
      }),
    ],

    [
      'discard-stadium',
      new RegExp(`^(${P}) a défaussé ${C}\\.$`),
      (m) => ({ player: m[1], card: { id: m[2], name: m[3] } }),
    ],

    [
      'swap-active',
      new RegExp(
        `^${C} de (${P}) a été échangé contre ${C} de (${P}) pour devenir le Pokémon Actif\\.$`,
      ),
      (m) => ({
        player: m[3],
        incoming: { id: m[1], name: m[2] },
        outgoing: { id: m[4], name: m[5] },
      }),
    ],

    // An attach spelled as a sub-line — a card that attaches several energies
    // resolves each one under itself (Gypso). Identical shape to the top-level
    // rule, and state-critical: dropping these under-counts what is attached,
    // which the knockout oracle then catches as a discard mismatch.
    [
      'attach',
      new RegExp(`^(${P}) a attaché ${C} à ${C} sur le ${ZONE}\\.$`),
      (m) => ({
        player: m[1],
        card: { id: m[2], name: m[3] },
        target: { id: m[4], name: m[5] },
        zone: m[6],
      }),
    ],

    // Singular of the bulk shuffle-into-deck. The plural rule already exists;
    // the log switches to "une carte" for exactly one, with no bullet list.
    [
      'shuffle-into-deck',
      new RegExp(`^(${P}) a mélangé une carte avec son deck\\.$`),
      (m) => ({ player: m[1], count: 1 }),
    ],

    // Damage reported outside an attack — a stadium or an ability landing on a
    // Pokémon. Recorded so the board reflects it; the KO lines drive the rest.
    [
      'place-damage',
      new RegExp(`^${C} de (${P}) a reçu (\\d+) dégâts\\.$`),
      (m) => ({
        player: m[3],
        counters: +m[4],
        target: { id: m[1], name: m[2] },
        claimedOwner: m[3],
      }),
    ],

    // Prevention (Shaymin's Rideau de Fleurs). No state change — the damage was
    // never applied — but it has to be recognised, or a real defensive play
    // reads as a hole in the reconstruction.
    [
      'damage-prevented',
      new RegExp(`^Les dégâts infligés à ${C} ont été évités\\.$`),
      (m) => ({ target: { id: m[1], name: m[2] } }),
    ],
  ];

  const events: PtcgEvent[] = [];
  const unknown: { line: number; text: string }[] = [];
  let lastMain: PtcgEvent | null = null;
  let lastSub: PtcgEvent | null = null;

  const match = (rules: Rule[], text: string): PtcgEvent | null => {
    for (const [type, re, build] of rules) {
      const m = re.exec(text);
      if (m) return { type, line: 0, ...build(m) };
    }
    return null;
  };

  lines.forEach((rawLine, i) => {
    const line = normaliseSpaces(rawLine);
    if (!line) return;

    // Level 2: bullets. Either a card list, or a damage-analysis row.
    if (line.startsWith('•')) {
      const body = line.slice(1).trim();
      // Negative rows exist: a damage-reduction ability shows as "-10 dégâts".
      // Dropping them silently makes the itemised rows stop summing to the
      // total, which the oracle then reports as a reconstruction failure.
      const dmg = /^(.+?)\s*:\s*(-?\d+)\s+dégâts$/.exec(body);
      if (lastSub?.type === 'damage-analysis' && dmg) {
        lastSub.entries ??= [];
        lastSub.entries.push({ label: dmg[1].trim(), damage: +dmg[2] });
      } else if (lastSub) {
        lastSub.cards ??= [];
        lastSub.cards.push(...parseCardList(body));
      } else {
        unknown.push({ line: i + 1, text: rawLine });
      }
      return;
    }

    // Level 1: sub-events.
    if (line.startsWith('-')) {
      const ev = match(sub, line.replace(/^-\s*/, ''));
      if (ev) {
        ev.line = i + 1;
        lastSub = ev;
        if (lastMain) (lastMain.children ??= []).push(ev);
        else events.push(ev);
      } else {
        unknown.push({ line: i + 1, text: rawLine });
        lastSub = null;
      }
      return;
    }

    // Level 0: top-level events.
    const ev = match(main, line);
    if (ev) {
      ev.line = i + 1;
      ev.children = [];
      events.push(ev);
      lastMain = ev;
      lastSub = null;
    } else {
      unknown.push({ line: i + 1, text: rawLine });
    }
  });

  return { players, events, unknown };
}
