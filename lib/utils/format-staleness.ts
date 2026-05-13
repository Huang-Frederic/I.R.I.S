/**
 * Map cm_updated_at into a 4-tone freshness label for the UI.
 *
 *   < 24h     → "fresh" (no urgency)
 *   1–7 days  → "stale" (mild signal)
 *   > 7 days  → "old"   (strong signal)
 *   null      → "never" (never refreshed)
 *
 * Returns a translation KEY (under the `staleness.*` namespace) plus the
 * raw `daysSince` value — the consumer is responsible for calling
 * `t(key, { days: daysSince ?? 0 })` to render the localized label.
 */

export type StalenessTone = 'fresh' | 'stale' | 'old' | 'never';

export interface StalenessLabel {
  tone: StalenessTone;
  /** Translation key under `staleness.*` namespace */
  key: 'fresh' | 'stale' | 'old' | 'never';
  daysSince: number | null;
}

const dayMs = 24 * 60 * 60 * 1000;

export function formatStaleness(cm_updated_at: string | null, now: Date): StalenessLabel {
  if (cm_updated_at === null) {
    return { tone: 'never', key: 'never', daysSince: null };
  }
  const elapsed = now.getTime() - new Date(cm_updated_at).getTime();
  const daysSince = Math.floor(elapsed / dayMs);
  // daysSince < 1 catches both fresh (<24h) and clock-skew future timestamps.
  if (daysSince < 1) return { tone: 'fresh', key: 'fresh', daysSince };
  if (daysSince <= 7) return { tone: 'stale', key: 'stale', daysSince };
  return { tone: 'old', key: 'old', daysSince };
}
