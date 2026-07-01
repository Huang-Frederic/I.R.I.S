import { RARITY_COLOR } from '@/lib/utils/labels';
import type { Card } from '@/lib/types';
import { displayCardName } from '@/lib/utils/format-name';

interface SoldCard {
  kind: 'card';
  id: string;
  card_name: string;
  pokemon_name: string | null;
  image_url: string | null;
  tcg_image_url: string | null;
  rarity: Card['rarity'];
  sold_price: number | null;
  date_sold: string | null;
  sold_by_user_id: string | null;
}

interface SoldLot {
  kind: 'lot';
  id: string;
  name: string;
  photo_urls: string[];
  sold_price: number | null;
  date_sold: string | null;
  date_added: string;
  language: string | null;
  condition: string | null;
  sold_by_user_id: string | null;
}

type SoldItem = SoldCard | SoldLot;

interface Props {
  sales: readonly SoldItem[];
  storagePublicUrl: string;
  userNames: Record<string, string>;
  allTimeTotals: { overall: number; byUser: Record<string, number> };
}

function formatDate(iso: string | null): string {
  if (!iso) return '?';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export default function LastSalesList({ sales, storagePublicUrl, userNames, allTimeTotals }: Props) {
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

  const userEntries = Object.entries(allTimeTotals.byUser).map(([uid, total]) => ({
    name: userNames[uid] ?? uid.slice(0, 8),
    total,
  }));

  return (
    <div className="bg-surface border-border overflow-hidden rounded-lg border p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
          Dernières ventes
        </h3>
        <span className="text-text font-mono text-sm font-semibold">
          €{allTimeTotals.overall.toFixed(2)}
        </span>
      </div>
      <div className="text-text-muted mb-3 flex gap-3 text-xs font-mono">
        {userEntries.map((u) => (
          <span key={u.name}>
            {u.name} €{u.total.toFixed(2)}
          </span>
        ))}
      </div>
      <ul className="divide-border divide-y">
        {sales.map((s) => {
          const thumb =
            s.kind === 'card'
              ? (s.image_url ?? s.tcg_image_url ?? null)
              : s.photo_urls[0]
                ? `${storagePublicUrl}/storage/v1/object/public/lot-photos/${s.photo_urls[0]}`
                : null;
          const label = s.kind === 'card' ? displayCardName(s) : s.name;
          const sub =
            s.kind === 'card' ? (
              <span className={RARITY_COLOR[s.rarity] ?? 'text-text-muted'}>{s.rarity}</span>
            ) : (
              <span className="text-text-muted">Lot</span>
            );
          const sellerName = s.sold_by_user_id
            ? (userNames[s.sold_by_user_id] ?? s.sold_by_user_id.slice(0, 8))
            : null;
          return (
            <li key={`${s.kind}-${s.id}`} className="flex items-center gap-3 py-2 text-sm">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-12 w-9 rounded object-cover" />
              ) : (
                <div className="h-12 w-9 rounded bg-surface-alt" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-text truncate font-medium">{label}</div>
                <div className="text-text-muted flex items-center gap-2 text-xs">
                  {sub}
                  {sellerName && (
                    <span className="text-text-faint">· {sellerName}</span>
                  )}
                  <span>{formatDate(s.date_sold)}</span>
                </div>
              </div>
              <div className="text-text shrink-0 font-mono">
                €{Number(s.sold_price ?? 0).toFixed(2)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
