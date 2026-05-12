/**
 * Map cm_updated_at into a 4-tone freshness label for the UI.
 *
 *   < 24h     → "fresh" (no urgency)
 *   1–7 days  → "stale" (mild signal)
 *   > 7 days  → "old"   (strong signal)
 *   null      → "never" (never refreshed)
 */

export type StalenessTone = 'fresh' | 'stale' | 'old' | 'never';

export interface StalenessLabel {
  tone: StalenessTone;
  label: string;
  daysSince: number | null;
}

const dayMs = 24 * 60 * 60 * 1000;

export function formatStaleness(cm_updated_at: string | null, now: Date): StalenessLabel {
  if (cm_updated_at === null) {
    return { tone: 'never', label: 'Jamais maj', daysSince: null };
  }
  const elapsed = now.getTime() - new Date(cm_updated_at).getTime();
  const daysSince = Math.floor(elapsed / dayMs);
  // daysSince < 1 catches both fresh (<24h) and clock-skew future timestamps.
  if (daysSince < 1) return { tone: 'fresh', label: '<1j', daysSince };
  if (daysSince <= 7) return { tone: 'stale', label: `Maj il y a ${daysSince}j`, daysSince };
  return { tone: 'old', label: `Maj il y a ${daysSince}j`, daysSince };
}
