'use client';

export interface RepostPoolItem {
  cardId: string | null;
  lotId: string | null;
  name: string;
  price: number | null;
  imageUrl: string;
  vintedPostedAt: string;
}

interface Props {
  items: RepostPoolItem[];
  active: boolean;
}

export default function RepostPool({ items, active }: Props) {
  if (items.length === 0) return null;

  return (
    <div className={`border-border mt-3 border-t pt-3 ${active ? '' : 'opacity-40'}`}>
      <p className="text-text-muted mb-2 text-[11px] uppercase">
        Reposts éligibles — {active ? 'actif' : 'en attente'}
      </p>
      <div className="flex gap-2 overflow-x-auto">
        {items.map((item) => (
          <div
            key={item.cardId ?? item.lotId}
            className="border-border bg-surface flex w-24 shrink-0 flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt="" className="h-9 w-9 rounded object-contain" />
            <span className="text-text line-clamp-2">{item.name}</span>
            {item.price !== null && <span className="text-rarity-r font-semibold">{item.price.toFixed(2)} €</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
