import Link from 'next/link';
import type { RestockAlert } from '@/lib/utils/restock-detection';
import { displayPokemonName } from '@/lib/utils/format-name';

export default function RestockAlertsList({ alerts }: { alerts: readonly RestockAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Restock alerts
        </h3>
        <p className="text-text-faint text-sm">Aucune alerte. ✓</p>
      </div>
    );
  }
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Restock alerts ({alerts.length})
      </h3>
      <ul className="divide-border divide-y">
        {alerts.map((a) => (
          <li key={a.pokemon_number}>
            <Link
              href={`/pokedex?pokemon_number=${a.pokemon_number}`}
              className="hover:bg-surface-2 flex items-center justify-between px-2 py-2 transition-colors"
            >
              <span className="text-text text-sm">
                #{a.pokemon_number} — {displayPokemonName(a)}
              </span>
              <span className="text-red text-xs font-medium">À restocker</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
