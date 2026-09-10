/**
 * Per-game metrics extracted from a raw PTCG Live battle log, and their
 * aggregation across many games — the empirical answer to "how good are my
 * starts, how fast do I set up, how much does each engine piece earn its slot".
 *
 * Parsing is line-regex over the FRENCH client phrasings the tokenizer knows.
 * Lines that don't match are ignored: a stat can under-count on an exotic
 * phrasing, but extraction never throws and never blocks anything.
 */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface CardUse {
  played: number;
  discarded: number;
}

export interface GameLogStats {
  /** Re-derived from the log's own end line — corrects a concede stored as a
   *  tie. Every ending reads "<player> gagne."; null winner ⇒ true tie. */
  result: 'win' | 'loss' | 'tie';
  /** Did I take the first turn? The player of the first "Tour de …" went first.
   *  Null when the log has no turn header (a game that ended in setup). */
  wentFirst: boolean | null;
  myTurns: number;
  mulligansMe: number;
  /** The Pokémon I put in the Active Spot during setup. */
  starter: string | null;
  /** How many Pokémon I had in play at the end of my turn 2 — how far the
   *  board got developed, whatever the deck. */
  boardT2: number;
  /** My-turn index of the first evolution into each name. */
  evoTurn: Record<string, number>;
  /** My-turn index of the first attack I declared, or null if I never did. */
  firstAttackTurn: number | null;
  /** How many of MY turns I played a Supporter on — at most one per turn, so
   *  this over myTurns is the share of turns that got their Supporter. */
  supporterTurns: number;
  /** Cards I drew, opening hand excluded. */
  cardsDrawn: number;
  /** Who took the first prize card of the game. */
  firstPrize: 'me' | 'opponent' | null;
  /** Ability name → total activations (mine only). */
  abilities: Record<string, number>;
  /** Ability names that fired at least once this game — for "% of games". */
  abilityGames: string[];
  /** Card name → how often I played / discarded it. */
  cardUse: Record<string, CardUse>;
  kosDealt: number;
  kosTaken: number;
}

// Optional "(sv10_34) " card-id prefix — PTCG Live dropped it from the battle
// log (both players) in an Aug-2026 format change, so requiring it left every
// play/attach/ability line unmatched and the whole usage table empty.
const CARD = String.raw`(?:\([^)]+\)\s*)?`;

/** Parses a "• Name, Name" sub-line into its card names. The per-name "(id) "
 *  prefix is optional — PTCG Live dropped it in the Aug-2026 format change. */
function subLineNames(line: string): string[] {
  return line
    .replace(/^\s*•\s*/, '') // drop the bullet + indent
    .split(',')
    .map((s) => s.replace(/^\s*\([^)]+\)\s*/, '').trim()) // strip an optional "(id) " per name
    .filter(Boolean);
}

export function extractGameStats(
  raw: string,
  me: string,
  /** Card names that are Supporters (any casing/accents), from `ptcg_cards`.
   *  Empty means the Supporter rate simply reads 0 — never a throw. */
  supporterNames: Iterable<string> = [],
): GameLogStats {
  const supporters = new Set([...supporterNames].map(norm));
  const M = me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reTurn = /^Tour de (.+?)\s*$/;
  const reMull = /^(.+?) a déclaré une misère/;
  const reStarter = new RegExp(`^${M} a joué ${CARD}(.+?) sur le Poste Actif`);
  const rePlayBench = new RegExp(`^${M} a joué ${CARD}(.+?) sur le Banc`);
  const rePlayAny = new RegExp(`^${M} a joué ${CARD}(.+?)(?: sur | comme |\\.$)`);
  const reBulkBench = new RegExp(
    `^-? ?${M} a (?:pioché|défaussé)? ?\\d* ?cartes? et les a jouées sur le Banc`,
  );
  const reEvo = new RegExp(`^${M} a fait évoluer ${CARD}(.+?) en ${CARD}(.+?) sur`);
  const reAbility = new RegExp(`^${CARD}.+? de ${M} a utilisé (.+?)\\.\\s*$`);
  // Tools and Energy are ATTACHED, not "played on" — counting the attach keeps
  // a Tool like Bracelet Vaillant from looking dead in the usage table.
  const reAttach = new RegExp(`^${M} a attaché ${CARD}(.+?) à `);
  const reAttack = new RegExp(
    `^${CARD}.+? de ${M} a utilisé .+? sur ${CARD}(.+?) (?:de .+? )?et a infligé (\\d+)`,
  );
  const reKo = / de (\S+) a été mis K\.O\./;
  const reKoTarget = new RegExp(`^${CARD}(.+?) de `);
  // Bulk discard ("a défaussé 2 cartes") → names on the next "•" sub-line. The
  // single form ("a défaussé (id) Name.") is caught inline, so require a digit.
  const reDiscardCost = new RegExp(`^-? ?${M} a défaussé \\d`);
  const reDiscardOne = new RegExp(`^-? ?${M} a défaussé ${CARD}(.+?)\\.`);
  // Any player's play, to learn which cards the OPPONENT owns.
  const reAnyPlay = new RegExp(`^(.+?) a joué ${CARD}(.+?)(?: sur | comme |\\.$)`);
  const reWin = /(?:^|\. )(\S+) gagne\.\s*$/;
  // "a pioché une carte." / "a pioché 3 cartes." / "a pioché (id) Nom." — the
  // opening hand ("pour sa main de départ") is excluded by the caller below.
  const reDraw = new RegExp(`^-? ?${M} a pioché (?:(\\d+) cartes|une carte|.+)`);
  const rePrize = /^(.+?) a récupéré une carte Récompense/;

  const out: GameLogStats = {
    result: 'tie',
    wentFirst: null,
    myTurns: 0,
    mulligansMe: 0,
    starter: null,
    boardT2: 0,
    evoTurn: {},
    firstAttackTurn: null,
    supporterTurns: 0,
    cardsDrawn: 0,
    firstPrize: null,
    abilities: {},
    abilityGames: [],
    cardUse: {},
    kosDealt: 0,
    kosTaken: 0,
  };
  const firedThisGame = new Set<string>();

  // My board, for the T2 development check. Multiset of Pokémon names.
  const board = new Map<string, number>();
  const put = (n: string) => board.set(n, (board.get(n) ?? 0) + 1);
  const drop = (n: string) => {
    const v = board.get(n) ?? 0;
    if (v <= 1) board.delete(n);
    else board.set(n, v - 1);
  };
  const boardSize = () => [...board.values()].reduce((a, b) => a + b, 0);

  let inSetup = true;
  let myTurn = 0;
  let onMyTurn = false;
  let pendingBench = false;
  let pendingDiscard = false;
  // Turns on which I played a Supporter — a Set so two in one turn count once.
  const supporterTurnSet = new Set<number>();

  const play = (name: string) => {
    const u = (out.cardUse[name] ??= { played: 0, discarded: 0 });
    u.played++;
  };
  const discard = (name: string) => {
    const u = (out.cardUse[name] ??= { played: 0, discarded: 0 });
    u.discarded++;
  };
  // Cards the opponent played. When I play a Stadium, the current one — even the
  // opponent's — is discarded and the log credits ME. That isn't my card, so a
  // discard of something the opponent owns and I never played doesn't count.
  const oppOwned = new Set<string>();
  const myDiscard = (name: string) => {
    if (oppOwned.has(norm(name)) && (out.cardUse[name]?.played ?? 0) === 0) return;
    discard(name);
  };

  const snapshotT2 = () => {
    if (myTurn === 2) out.boardT2 = boardSize();
  };

  for (const line of raw.split(/\r?\n/)) {
    const turn = reTurn.exec(line);
    if (turn) {
      snapshotT2(); // leaving whatever turn we were on
      if (out.wentFirst === null) out.wentFirst = turn[1] === me; // first turn header
      inSetup = false;
      onMyTurn = turn[1] === me;
      if (onMyTurn) {
        out.myTurns++;
        myTurn = out.myTurns;
      }
      pendingBench = pendingDiscard = false;
      continue;
    }

    // Learn opponent ownership from any play line (mine are skipped).
    const anyPlay = reAnyPlay.exec(line);
    if (anyPlay && anyPlay[1] !== me) oppOwned.add(norm(anyPlay[2]));

    // Draws and prizes are read on either turn, and outside setup framing.
    if (!/main de départ/.test(line)) {
      const dr = reDraw.exec(line);
      if (dr) out.cardsDrawn += dr[1] ? parseInt(dr[1], 10) : 1;
    }
    const pz = rePrize.exec(line);
    if (pz && out.firstPrize === null) out.firstPrize = pz[1] === me ? 'me' : 'opponent';

    const mull = reMull.exec(line);
    if (mull && inSetup) {
      if (mull[1] === me) out.mulligansMe++;
      continue;
    }

    // Setup Active choice + board seeding (Active placed during setup).
    if (inSetup) {
      const st = reStarter.exec(line);
      if (st) {
        if (out.starter === null) out.starter = st[1];
        put(st[1]);
        continue;
      }
      const b = rePlayBench.exec(line);
      if (b) put(b[1]);
      continue;
    }

    // --- board maintenance (both from my plays and my bulk-bench sub-lines) ---
    if (onMyTurn) {
      const b = rePlayBench.exec(line);
      if (b) put(b[1]);
      if (reBulkBench.test(line)) pendingBench = true;
      else if (reDiscardCost.test(line)) pendingDiscard = true;
      else if (line.trimStart().startsWith('•')) {
        if (pendingBench) {
          for (const n of subLineNames(line)) put(n);
          pendingBench = false;
        } else if (pendingDiscard) {
          for (const n of subLineNames(line)) myDiscard(n);
          pendingDiscard = false;
        }
      }
      const evo = reEvo.exec(line);
      if (evo) {
        drop(evo[1]);
        put(evo[2]);
        play(evo[2]); // evolving IS playing that Stage from hand — count it used
        if (out.evoTurn[evo[2]] === undefined) out.evoTurn[evo[2]] = myTurn;
      }
      const p = rePlayAny.exec(line);
      if (p) {
        play(p[1]);
        if (supporters.has(norm(p[1]))) supporterTurnSet.add(myTurn);
      }
      const att = reAttach.exec(line);
      if (att) play(att[1]);
      // Single-card discard: "Hisshiden a défaussé Name." — but NOT the bulk-cost
      // line "Hisshiden a défaussé 2 cartes." (Hyper Ball / Secret Box): with the
      // id prefix now optional, reDiscardOne would grab "2 cartes" as a pseudo-card.
      // Its real cards are itemized on the next "•" sub-line (pendingDiscard).
      if (!reDiscardCost.test(line)) {
        const dc = reDiscardOne.exec(line);
        if (dc) myDiscard(dc[1]);
      }
    }

    // --- abilities (mine, either turn) ---
    const ab = reAbility.exec(line);
    if (ab && !line.includes(' et a infligé ')) {
      out.abilities[ab[1]] = (out.abilities[ab[1]] ?? 0) + 1;
      firedThisGame.add(ab[1]);
    }

    // --- my first attack, as a setup-speed marker ---
    if (out.firstAttackTurn === null && reAttack.test(line)) out.firstAttackTurn = myTurn;

    // --- KOs ---
    const ko = reKo.exec(line);
    if (ko) {
      if (ko[1] === me) {
        out.kosTaken++;
        const t = reKoTarget.exec(line);
        if (t) drop(t[1]); // my Pokémon left the board
      } else {
        out.kosDealt++;
      }
    }

    const win = reWin.exec(line);
    if (win) out.result = win[1] === me ? 'win' : 'loss';
  }
  snapshotT2();
  out.abilityGames = [...firedThisGame];
  out.supporterTurns = supporterTurnSet.size;
  return out;
}

/* -------------------------------------------------------------- aggregate */

export interface GameForStats {
  stats: GameLogStats;
  result: 'win' | 'loss' | 'tie';
  play_score: number | null;
  myArchetype: string;
  opponent_archetype: string | null;
}

/** Distinct decks I played, most-played first — drives the version filter. */
export function listMyArchetypes(rows: GameForStats[]): { name: string; games: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.myArchetype, (counts.get(r.myArchetype) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, games]) => ({ name, games }))
    .sort((a, b) => b.games - a.games);
}

export interface AbilityStat {
  name: string;
  /** Average activations per game. */
  avg: number;
  /** Share of games it fired at least once. */
  gamesPct: number;
}

/** A win/loss slice — used for the going-first vs going-second split. */
export interface Split {
  games: number;
  wins: number;
  winratePct: number;
}

export interface AggregatedStats {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  winratePct: number;
  avgScore: number | null;
  /** Winrate when I took the first turn vs when I didn't. */
  first: Split;
  second: Split;
  mulliganPct: number;
  starters: { name: string; pct: number }[];
  /** Pokémon in play at the end of my turn 2, averaged. */
  boardT2Avg: number;
  /** Share of games whose FIRST evolution landed on my turn 2 or earlier. */
  evoByT2Pct: number;
  /** Share of games where I attacked on my turn 2 or earlier. */
  attackByT2Pct: number;
  /** Share of MY TURNS that got a Supporter — turns, not games, is the
   *  denominator: a Supporter is a once-per-turn resource. */
  supporterTurnPct: number;
  drawnPerGame: number;
  abilities: AbilityStat[];
  /** Share of the games that saw a prize taken where I took the FIRST one. */
  firstPrizePct: number;
  kosDealtAvg: number;
  kosTakenAvg: number;
  /** My turns per game — how long my games run. */
  turnsAvg: number;
  /** Every card I played, with total plays/discards and per-game rates. */
  cards: { name: string; played: number; discarded: number; perGame: number }[];
  byArchetype: { name: string; games: number; wins: number; losses: number }[];
}

export function aggregateStats(rows: GameForStats[]): AggregatedStats {
  const n = rows.length;
  const wins = rows.filter((r) => r.result === 'win').length;
  const losses = rows.filter((r) => r.result === 'loss').length;
  const scores = rows.map((r) => r.play_score).filter((s): s is number => s != null);

  const split = (went: boolean): Split => {
    const g = rows.filter((r) => r.stats.wentFirst === went);
    const w = g.filter((r) => r.result === 'win').length;
    return { games: g.length, wins: w, winratePct: g.length ? (w / g.length) * 100 : 0 };
  };

  const starterCounts = new Map<string, number>();
  const abilityTotals = new Map<string, number>();
  const abilityGameHits = new Map<string, number>();
  const cardTotals = new Map<string, CardUse>();
  const byArch = new Map<string, { games: number; wins: number; losses: number }>();
  let mull = 0;
  let boardT2 = 0;
  let evoByT2 = 0;
  let attackByT2 = 0;
  let supporterTurns = 0;
  let myTurns = 0;
  let drawn = 0;
  let kosDealt = 0;
  let kosTaken = 0;
  let firstPrizeMine = 0;
  let firstPrizeGames = 0;

  for (const r of rows) {
    const s = r.stats;
    if (s.mulligansMe > 0) mull++;
    if (s.starter) starterCounts.set(s.starter, (starterCounts.get(s.starter) ?? 0) + 1);
    boardT2 += s.boardT2;
    supporterTurns += s.supporterTurns;
    myTurns += s.myTurns;
    drawn += s.cardsDrawn;
    kosDealt += s.kosDealt;
    kosTaken += s.kosTaken;
    if (s.firstPrize) {
      firstPrizeGames++;
      if (s.firstPrize === 'me') firstPrizeMine++;
    }
    // The first evolution of the game, whichever line it was on.
    const evoTurns = Object.values(s.evoTurn);
    if (evoTurns.length && Math.min(...evoTurns) <= 2) evoByT2++;
    if (s.firstAttackTurn !== null && s.firstAttackTurn <= 2) attackByT2++;
    for (const [name, count] of Object.entries(s.abilities)) {
      abilityTotals.set(name, (abilityTotals.get(name) ?? 0) + count);
    }
    for (const name of s.abilityGames) {
      abilityGameHits.set(name, (abilityGameHits.get(name) ?? 0) + 1);
    }
    for (const [name, u] of Object.entries(s.cardUse)) {
      const t = cardTotals.get(name) ?? { played: 0, discarded: 0 };
      t.played += u.played;
      t.discarded += u.discarded;
      cardTotals.set(name, t);
    }
    const arch = r.opponent_archetype ?? '?';
    const a = byArch.get(arch) ?? { games: 0, wins: 0, losses: 0 };
    a.games++;
    if (r.result === 'win') a.wins++;
    if (r.result === 'loss') a.losses++;
    byArch.set(arch, a);
  }

  const pct = (v: number) => (n ? (v / n) * 100 : 0);
  return {
    games: n,
    wins,
    losses,
    ties: n - wins - losses,
    winratePct: pct(wins),
    avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    first: split(true),
    second: split(false),
    mulliganPct: pct(mull),
    starters: [...starterCounts.entries()]
      .map(([name, c]) => ({ name, pct: pct(c) }))
      .sort((a, b) => b.pct - a.pct),
    boardT2Avg: n ? boardT2 / n : 0,
    evoByT2Pct: pct(evoByT2),
    attackByT2Pct: pct(attackByT2),
    supporterTurnPct: myTurns ? (supporterTurns / myTurns) * 100 : 0,
    drawnPerGame: n ? drawn / n : 0,
    abilities: [...abilityTotals.entries()]
      .map(([name, total]) => ({
        name,
        avg: n ? total / n : 0,
        gamesPct: pct(abilityGameHits.get(name) ?? 0),
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10),
    firstPrizePct: firstPrizeGames ? (firstPrizeMine / firstPrizeGames) * 100 : 0,
    kosDealtAvg: n ? kosDealt / n : 0,
    kosTakenAvg: n ? kosTaken / n : 0,
    turnsAvg: n ? myTurns / n : 0,
    cards: [...cardTotals.entries()]
      // Basic Energy isn't a "does this card earn its slot" candidate — drop it.
      .filter(([name]) => !/energie .*de base/.test(norm(name)))
      .map(([name, u]) => ({
        name,
        played: u.played,
        discarded: u.discarded,
        perGame: n ? u.played / n : 0,
      }))
      .sort((a, b) => b.played + b.discarded - (a.played + a.discarded)),
    byArchetype: [...byArch.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.games - a.games),
  };
}
