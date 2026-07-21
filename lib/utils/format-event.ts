import type { StoreEventType } from '@/lib/types';

/** Tailwind chip classes per event type — reuses the app's rarity accent palette. */
export const EVENT_TYPE_COLOR: Record<StoreEventType, string> = {
  prerelease: 'bg-rarity-sar/20 text-rarity-sar',
  league_cup: 'bg-rarity-ar/20 text-rarity-ar',
  league_challenge: 'bg-rarity-ar/20 text-rarity-ar',
  tournament: 'bg-rarity-r/20 text-rarity-r',
  league: 'bg-rarity-uc/20 text-rarity-uc',
};

/**
 * Format a store event's UTC `starts_at` for display. Built via Date.UTC by the
 * scraper, so we read it back in UTC to keep the calendar day/time stable.
 * Returns null for undated events.
 */
export function formatEventDate(iso: string | null): { day: string; time: string | null } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  // Midnight = no real time was parsed from the title (date-only event).
  const time = h === 0 && m === 0 ? null : `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
  return { day, time };
}

function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}h${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * The "→ end" label when an event has an `ends_at`. Same day → just the end
 * time ("→ 19h00"); a different day → the end date + time.
 */
export function formatEventEnd(startsAt: string | null, endsAt: string | null): string | null {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  const sameDay = startsAt != null && startsAt.slice(0, 10) === endsAt.slice(0, 10);
  if (sameDay) return `→ ${hhmm(end)}`;
  const day = end.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
  return `→ ${day} ${hhmm(end)}`;
}
