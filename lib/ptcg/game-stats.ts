/**
 * Per-game metrics extracted from a raw PTCG Live battle log, and their
 * aggregation across many games — the empirical answer to "how good are my
 * starts, how often is Quilava online T2, how much does my engine draw".
 *
 * Parsing is line-regex over the FRENCH client phrasings, the exact ones the
 * tokenizer knows (see lib/ptcg/tokenize.ts fixtures). Lines that don't match
 * are simply ignored: a stat can under-count on an exotic phrasing, but the
 * extraction never throws and never blocks anything.
 */

export interface GameLogStats {
  /** My turn count (turns where the "Tour de X" header is mine). */
  myTurns: number;
  mulligansMe: number;
  mulligansOpp: number;
  /** The Pokémon I put in the Active Spot during setup. */
  starter: string | null;
  /** Pokémon I benched during my first turn (plays + Poffin drops). */
  benchT1: number;
  energyT1: boolean;
  energyTurns: number;
  /** My-turn index of the first evolution into each name (e.g. Feurisson…). */
  evoTurn: Record<string, number>;
  /** My ability activations, by ability name (attacks excluded). */
  abilities: Record<string, number>;
  adlPlayed: number;
  kosDealt: number;
  kosTaken: number;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "(sv10_33) Feurisson de Luth" → "Feurisson de Luth". */
const CARD = String.raw`\([^)]+\)\s*`;

export function extractGameStats(raw: string, me: string): GameLogStats {
  const M = esc(me);
  const reTurn = /^Tour de (.+?)\s*$/;
  const reMull = /^(.+?) a déclaré une misère/;
  const reStarter = new RegExp(`^${M} a joué ${CARD}(.+?) sur le Poste Actif`);
  const reBenchPlay = new RegExp(`^${M} a joué ${CARD}(.+?) sur le Banc`);
  const reBenchBulk = new RegExp(`^- ${M} a pioché (\\d+) cartes? et les a jouées sur le Banc`);
  const reEnergy = new RegExp(`^${M} a attaché ${CARD}Énergie`);
  const reEvo = new RegExp(`^${M} a fait évoluer ${CARD}.+? en ${CARD}(.+?) sur`);
  // Ability lines end right after the name; attack lines carry "et a infligé".
  const reAbility = new RegExp(`^${CARD}.+? de ${M} a utilisé (.+?)\\.\\s*$`);
  const reAdl = new RegExp(`^${M} a joué ${CARD}Aventure de Luth`);
  // The owner is the last "de <pseudo>" before "a été mis K.O." — a card name
  // also contains " de " (Typhlosion de Luth), so capture the trailing token,
  // not a lazy run. PTCG Live usernames have no spaces.
  const reKo = / de (\S+) a été mis K\.O\./;

  const out: GameLogStats = {
    myTurns: 0,
    mulligansMe: 0,
    mulligansOpp: 0,
    starter: null,
    benchT1: 0,
    energyT1: false,
    energyTurns: 0,
    evoTurn: {},
    abilities: {},
    adlPlayed: 0,
    kosDealt: 0,
    kosTaken: 0,
  };

  let inSetup = true;
  let myTurn = 0; // current my-turn index; 0 = not my turn yet
  let onMyTurn = false;
  let energyThisTurn = false;

  for (const line of raw.split(/\r?\n/)) {
    const turn = reTurn.exec(line);
    if (turn) {
      inSetup = false;
      if (onMyTurn && energyThisTurn) out.energyTurns++;
      onMyTurn = turn[1] === me;
      if (onMyTurn) {
        out.myTurns++;
        myTurn = out.myTurns;
        energyThisTurn = false;
      }
      continue;
    }

    const mull = reMull.exec(line);
    if (mull && inSetup) {
      if (mull[1] === me) out.mulligansMe++;
      else out.mulligansOpp++;
      continue;
    }

    if (inSetup && out.starter === null) {
      const s = reStarter.exec(line);
      if (s) {
        out.starter = s[1];
        continue;
      }
    }

    if (onMyTurn) {
      if (myTurn === 1) {
        if (reBenchPlay.test(line)) out.benchT1++;
        const bulk = reBenchBulk.exec(line);
        if (bulk) out.benchT1 += parseInt(bulk[1], 10);
      }
      if (reEnergy.test(line)) {
        energyThisTurn = true;
        if (myTurn === 1) out.energyT1 = true;
      }
      const evo = reEvo.exec(line);
      if (evo && out.evoTurn[evo[1]] === undefined) out.evoTurn[evo[1]] = myTurn;
      if (reAdl.test(line)) out.adlPlayed++;
    }

    // Abilities and KOs can appear on either player's turn.
    const ab = reAbility.exec(line);
    if (ab && !line.includes(' et a infligé ')) {
      out.abilities[ab[1]] = (out.abilities[ab[1]] ?? 0) + 1;
    }
    const ko = reKo.exec(line);
    if (ko) {
      if (ko[1] === me) out.kosTaken++;
      else out.kosDealt++;
    }
  }
  if (onMyTurn && energyThisTurn) out.energyTurns++;

  return out;
}

/* -------------------------------------------------------------- aggregate */

export interface GameForStats {
  stats: GameLogStats;
  result: 'win' | 'loss' | 'tie';
  play_score: number | null;
  /** My deck version, classified from my Pokémon (see lib/ptcg/archetype). */
  myArchetype: string;
  /** Opponent deck, classified from their Pokémon. */
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

export interface AggregatedStats {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  winratePct: number;
  avgScore: number | null;
  mulliganPct: number;
  starters: { name: string; pct: number }[];
  energyT1Pct: number;
  energyTurnsPct: number;
  benchT1Avg: number;
  /** First evolution into the name by my turn N — % of games. */
  quilavaByT2Pct: number;
  typhlosionByT3Pct: number;
  adlPlayedAvg: number;
  /** Total + per-game average per ability, sorted by total, top 8. */
  abilities: { name: string; total: number; avg: number }[];
  byArchetype: { name: string; games: number; wins: number; losses: number }[];
}

const startsWithAny = (name: string, prefixes: string[]) =>
  prefixes.some((p) => name.startsWith(p));

export function aggregateStats(rows: GameForStats[]): AggregatedStats {
  const n = rows.length;
  const wins = rows.filter((r) => r.result === 'win').length;
  const losses = rows.filter((r) => r.result === 'loss').length;
  const scores = rows.map((r) => r.play_score).filter((s): s is number => s != null);

  const starterCounts = new Map<string, number>();
  const abilityTotals = new Map<string, number>();
  const byArch = new Map<string, { games: number; wins: number; losses: number }>();
  let mull = 0;
  let energyT1 = 0;
  let energyTurns = 0;
  let myTurns = 0;
  let benchT1 = 0;
  let quilavaT2 = 0;
  let typhloT3 = 0;
  let adl = 0;

  for (const r of rows) {
    const s = r.stats;
    if (s.mulligansMe > 0) mull++;
    if (s.starter) starterCounts.set(s.starter, (starterCounts.get(s.starter) ?? 0) + 1);
    if (s.energyT1) energyT1++;
    energyTurns += s.energyTurns;
    myTurns += s.myTurns;
    benchT1 += s.benchT1;
    adl += s.adlPlayed;
    for (const [name, turn] of Object.entries(s.evoTurn)) {
      if (turn <= 2 && startsWithAny(name, ['Feurisson'])) quilavaT2++;
      if (turn <= 3 && startsWithAny(name, ['Typhlosion'])) typhloT3++;
    }
    for (const [name, count] of Object.entries(s.abilities)) {
      abilityTotals.set(name, (abilityTotals.get(name) ?? 0) + count);
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
    mulliganPct: pct(mull),
    starters: [...starterCounts.entries()]
      .map(([name, c]) => ({ name, pct: pct(c) }))
      .sort((a, b) => b.pct - a.pct),
    energyT1Pct: pct(energyT1),
    energyTurnsPct: myTurns ? (energyTurns / myTurns) * 100 : 0,
    benchT1Avg: n ? benchT1 / n : 0,
    quilavaByT2Pct: pct(quilavaT2),
    typhlosionByT3Pct: pct(typhloT3),
    adlPlayedAvg: n ? adl / n : 0,
    abilities: [...abilityTotals.entries()]
      .map(([name, total]) => ({ name, total, avg: total / n }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
    byArchetype: [...byArch.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.games - a.games),
  };
}
