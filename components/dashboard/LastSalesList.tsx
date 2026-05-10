import { RARITY_COLOR } from '@/lib/utils/labels';
import type { Card } from '@/lib/types';
import { displayCardName } from '@/lib/utils/format-name';

interface SoldCard {
  id: string;
  card_name: string;
  pokemon_name: string | null;
  image_url: string | null;
  tcg_image_url: string | null;
  rarity: Card['rarity'];
  sold_price: number | null;
  date_sold: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '?';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export default function LastSalesList({
  sales,
}: {
  sales: readonly SoldCard[];
}) {
  if (sales.length === 0) {
    return (
      <div className="bg-surface border-border overflow-hidden rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Dernières ventes
        </h3>
        <p className="text-text-faint text-sm">Aucune vente enregistrée.</p>
      </div>
    );
  }

  const total = sales.reduce((sum, s) => sum + Number(s.sold_price ?? 0), 0);

  return (
    <div className="bg-surface border-border overflow-hidden rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
          Dernières ventes ({sales.length})
        </h3>
        <span className="text-text-muted text-xs font-mono">
          €{total.toFixed(2)} total
        </span>
      </div>
      <ul className="divide-border divide-y">
        {sales.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.image_url ?? s.tcg_image_url ?? ''}
              alt=""
              className="h-12 w-9 rounded object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="text-text truncate font-medium">{displayCardName(s)}</div>
              <div className="text-text-muted text-xs">
                <span className={RARITY_COLOR[s.rarity] ?? ''}>
                  {s.rarity}
                </span>
                <span className="ml-2">{formatDate(s.date_sold)}</span>
              </div>
            </div>
            <div className="text-text shrink-0 font-mono">
              €{Number(s.sold_price ?? 0).toFixed(2)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
