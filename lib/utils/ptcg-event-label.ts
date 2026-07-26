/**
 * Human-readable one-liner for a parsed battle-log event.
 *
 * Shared by the digest (what the analysis reads) and the replay (what the user
 * reads), so both describe the same action the same way — a mismatch there makes
 * a comment look like it points at the wrong move.
 */

const nameOf = (c: unknown): string => (c as { name?: string } | null)?.name ?? '';

export function eventLabel(event: Record<string, unknown>, me?: string, opponent?: string): string {
  const who = (p: unknown) => (p === me ? 'toi' : p === opponent ? opponent : String(p ?? ''));

  // French needs three forms for the same person, and a single pronoun cannot
  // cover them: "tu choisis" (subject), "de toi" (tonic), "ton deck"
  // (possessive). Writing the player's own actions in the third person — the
  // earlier shortcut — produced "toi choisit face" on the very first line of
  // every replay. Each label supplies both conjugations; only the player's own
  // side is second person, so the opponent's handle keeps a third-person verb.
  const mine = (p: unknown) => p === me;
  const act = (p: unknown, second: string, third: string) =>
    mine(p) ? `tu ${second}` : `${who(p)} ${third}`;
  const poss = (p: unknown, second: string, third: string) => (mine(p) ? second : third);

  switch (event.type) {
    case 'turn-start':
      return mine(event.player) ? 'début de ton tour' : `début du tour de ${who(event.player)}`;
    case 'draw-known':
      return `pioche ${nameOf(event.card)}`;
    case 'draw-hidden':
      return `pioche ${event.count} carte(s)`;
    case 'play-pokemon':
      return `pose ${nameOf(event.card)} (${event.zone})`;
    case 'play-trainer':
      return `joue ${nameOf(event.card)}`;
    case 'play-stadium':
      return `pose le stade ${nameOf(event.card)}`;
    case 'use-stadium':
      return `active le stade ${event.stadium}`;
    case 'evolve':
      return `fait évoluer ${nameOf(event.from)} → ${nameOf(event.to)}`;
    case 'attach':
      return `attache ${nameOf(event.card)} à ${nameOf(event.target)}`;
    case 'retreat':
      return `retraite ${nameOf(event.card)}`;
    case 'promote':
      return `${nameOf(event.card)} passe Actif`;
    case 'use':
      return `${nameOf(event.source)} utilise ${event.move}`;
    case 'attack':
      return `${nameOf(event.source)} — ${event.move} → ${event.damage} dégâts`;
    case 'ko':
      return `${nameOf(event.card)} est mis K.O.`;
    case 'take-prize':
      return `${act(event.player, 'prends', 'prend')} ${event.count} récompense(s)`;
    case 'prize-to-hand':
      return event.card ? `récompense → ${nameOf(event.card)}` : 'récompense → main';
    case 'mulligan':
      return `${act(event.player, 'déclares', 'déclare')} une misère`;
    case 'mulligan-bonus-draw':
      return `${act(event.player, 'pioches', 'pioche')} une carte de misère`;
    case 'end-turn':
      return 'fin du tour';
    case 'game-end':
      return `${act(event.winner, 'gagnes', 'gagne')}`;

    /* Setup — the replay opens here, so these are the first lines read. ----- */
    case 'setup-section':
      return 'préparation';
    case 'coin-choice':
      return `${act(event.player, 'choisis', 'choisit')} ${event.choice}`;
    case 'coin-win':
      return `${act(event.player, 'gagnes', 'gagne')} le lancer`;
    case 'play-order':
      return `${act(event.player, 'joues', 'joue')} ${event.order}`;
    case 'opening-hand':
    case 'opening-hand-count':
      return event.player
        ? `${act(event.player, 'pioches', 'pioche')} ${event.count} cartes de départ`
        : `${event.count} cartes piochées`;
    case 'mulligan-reveal':
      return `cartes montrées après la misère ${event.n}`;

    /* Deck and discard movement ------------------------------------------- */
    case 'shuffle-deck':
      return `${act(event.player, 'mélanges', 'mélange')} ${poss(event.player, 'ton', 'son')} deck`;
    case 'shuffle-hand':
      return `${act(event.player, 'mélanges', 'mélange')} ${poss(event.player, 'ta', 'sa')} main`;
    case 'shuffle-prizes':
      return `${act(event.player, 'mélanges', 'mélange')} ${poss(event.player, 'tes', 'ses')} récompenses`;
    case 'shuffle-into-deck':
      return `${act(event.player, 'mélanges', 'mélange')} ${cardsOr(event, 'carte')} au deck`;
    case 'hand-to-deck':
      return `${act(event.player, 'remets', 'remet')} ${event.count} cartes au deck`;
    case 'deck-to-prizes':
      return `${act(event.player, 'places', 'place')} ${event.count} cartes en récompense`;
    case 'prizes-under-deck':
      return `${act(event.player, 'glisses', 'glisse')} ${event.count} cartes sous le deck`;
    case 'move-to-hand':
      return `${act(event.player, 'reprends', 'reprend')} ${nameOf(event.card)} en main`;
    case 'bench-from-deck':
      return `${act(event.player, 'poses', 'pose')} ${cardsOr(event, 'Pokémon')} au banc depuis le deck`;

    /* Discards ------------------------------------------------------------- */
    case 'discard-from-hand':
      return `${act(event.player, 'défausses', 'défausse')} ${cardsOr(event, 'carte')} de ${poss(event.player, 'ta', 'sa')} main`;
    case 'discard-opponent-hand':
      return `${act(event.actor, 'défausses', 'défausse')} ${event.count} cartes de ${poss(event.player, 'ta', 'sa')} main`;
    case 'discard-attached':
      return `${event.count} carte(s) défaussée(s) de ${nameOf(event.from)}`;
    case 'discard-stadium':
      return `${act(event.player, 'défausses', 'défausse')} le stade ${nameOf(event.card)}`;

    /* Board effects -------------------------------------------------------- */
    case 'place-damage':
      return `${event.counters} marqueurs sur ${nameOf(event.target)}`;
    case 'swap-active':
      return `${nameOf(event.incoming)} remplace ${nameOf(event.outgoing)} à l'Actif`;
    case 'damage-analysis':
      return 'analyse des dégâts';

    default:
      return String(event.type);
  }
}

/**
 * Names the cards when the log gave them and falls back to a count when it did
 * not — several rules have both a named and a bulk spelling, and printing
 * "1 carte" where the log said which card loses the only detail that matters.
 */
function cardsOr(event: Record<string, unknown>, noun: string): string {
  const cards = event.cards as { name?: string }[] | undefined;
  if (cards?.length) return cards.map((c) => c.name ?? '').join(', ');
  return `${event.count} ${noun}${Number(event.count) > 1 ? 's' : ''}`;
}
