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

  switch (event.type) {
    case 'turn-start':
      return `début du tour de ${who(event.player)}`;
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
      return `${who(event.player)} prend ${event.count} récompense(s)`;
    case 'prize-to-hand':
      return event.card ? `récompense → ${nameOf(event.card)}` : 'récompense → main';
    case 'mulligan':
      return `${who(event.player)} déclare une misère`;
    case 'mulligan-bonus-draw':
      return `${who(event.player)} pioche une carte de misère`;
    case 'end-turn':
      return 'fin du tour';
    case 'game-end':
      return `${who(event.winner)} gagne`;
    default:
      return String(event.type);
  }
}
