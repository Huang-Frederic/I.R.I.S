/**
 * Identity-based color mapping for the 2-user UI.
 *
 * Same person → same color across the whole app, regardless of who's
 * logged in. Lui = Hisshiden = bleu. Elle = Hilyna = rose. Used by
 * ListingBadges (per-row "Listée par X" badges) AND VintedFilters
 * (multi-user chips "Par moi" / "Par X").
 *
 * The color tokens live in app/globals.css under --color-user-lui /
 * --color-user-elle so light mode and theme tweaks stay centralized.
 *
 * Falls back to a neutral surface token for unknown display names so
 * the UI doesn't break if the user_profiles seed gets edited.
 */
export type UserColor = 'lui' | 'elle' | 'neutral';

export function colorForUserName(displayName: string | null | undefined): UserColor {
  if (!displayName) return 'neutral';
  const n = displayName.trim().toLowerCase();
  if (n === 'lui') return 'lui';
  if (n === 'elle') return 'elle';
  return 'neutral';
}

/** Tailwind classes for a chip background + foreground tinted by user color. */
export function chipClassesForColor(color: UserColor, active: boolean): string {
  if (color === 'lui') {
    return active
      ? 'bg-user-lui/20 border-user-lui text-user-lui font-medium'
      : 'bg-surface-2 border-border text-text-muted hover:text-text';
  }
  if (color === 'elle') {
    return active
      ? 'bg-user-elle/20 border-user-elle text-user-elle font-medium'
      : 'bg-surface-2 border-border text-text-muted hover:text-text';
  }
  return active
    ? 'bg-red-bg border-red text-red font-medium'
    : 'bg-surface-2 border-border text-text-muted hover:text-text';
}

/** Tailwind classes for a badge tinted by user color (used in ListingBadges). */
export function badgeClassesForColor(color: UserColor): string {
  if (color === 'lui') return 'bg-user-lui/20 text-user-lui';
  if (color === 'elle') return 'bg-user-elle/20 text-user-elle';
  return 'bg-rarity-r/20 text-rarity-r'; // neutral fallback (legacy green for "moi")
}
