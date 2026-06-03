// components/dashboard/VintedPostsWidget.tsx
interface PostedCard {
  id: string;
  card_name: string;
  vinted_listing_id: string;
  vinted_posted_at: string;
  image_url: string | null;
  tcg_image_url: string | null;
}

interface Props {
  cards: PostedCard[];
}

export default function VintedPostsWidget({ cards }: Props) {
  if (cards.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-2 text-xs font-semibold uppercase tracking-wide">
          Postées sur Vinted aujourd&apos;hui
        </h3>
        <p className="text-text-faint text-sm">Aucune annonce postée aujourd&apos;hui.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Postées sur Vinted aujourd&apos;hui ({cards.length})
      </h3>
      <ul className="divide-border divide-y">
        {cards.map((card) => {
          const thumb = card.image_url ?? card.tcg_image_url;
          return (
            <li key={card.id} className="flex items-center gap-3 py-2 text-sm">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-12 w-9 rounded object-cover" />
              ) : (
                <div className="h-12 w-9 rounded bg-surface-alt" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-text truncate font-medium">{card.card_name}</div>
              </div>
              <a
                href={`https://www.vinted.fr/items/${card.vinted_listing_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs text-green-500 underline"
              >
                Voir ↗
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
