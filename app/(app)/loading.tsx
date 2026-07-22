/**
 * Instant loading skeleton shown while a route's server component fetches.
 * Without it, App Router keeps the previous page frozen during navigation —
 * which read as "lag" on every page change. Shared across every (app) route;
 * a generic title + rows placeholder fits them all.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden>
      {/* Page title */}
      <div className="bg-surface-2 mb-6 h-7 w-48 rounded" />
      {/* Filter bar hint */}
      <div className="mb-4 flex gap-2">
        <div className="bg-surface-2 h-8 flex-1 rounded" />
        <div className="bg-surface-2 h-8 w-24 rounded" />
      </div>
      {/* Rows */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-surface border-border h-[70px] rounded-lg border" />
        ))}
      </div>
    </div>
  );
}
