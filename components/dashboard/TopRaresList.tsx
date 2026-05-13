import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { RARITY_COLOR } from '@/lib/utils/labels';
import type { Card } from '@/lib/types';
import { displayCardName } from '@/lib/utils/format-name';
import { TopRaresPriceCell } from './TopRaresPriceCell';

interface Props {
  cards: readonly (Pick<Card, 'id' | 'card_name' | 'pokemon_name' | 'pokemon_number' | 'image_url' | 'tcg_image_url' | 'rarity'> & {
    cm_price_avg: number | null;
    cm_price_trend: number | null;
    cm_price_low: number | null;
  })[];
}

function priceOf(c: Props['cards'][number]): number {
  return c.cm_price_avg ?? c.cm_price_trend ?? c.cm_price_low ?? 0;
}

export default async function TopRaresList({ cards }: Props) {
  const t = await getTranslations('dashboard');
  if (cards.length === 0) {
    return (
      <div className="bg-surface border-border overflow-hidden rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          {t('topRaresTitle')}
        </h3>
        <p className="text-text-faint text-sm">{t('topRaresEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border overflow-hidden rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        {t('topRaresTitle')}
      </h3>
      <ul className="divide-border divide-y">
        {cards.map((c) => {
          const inner = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.image_url ?? c.tcg_image_url ?? ''}
                alt=""
                className="h-12 w-9 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="text-text truncate text-sm font-medium">{displayCardName(c)}</div>
                <div className="text-text-muted text-xs">
                  <span className={RARITY_COLOR[c.rarity] ?? ''}>{c.rarity}</span>
                </div>
              </div>
              <div className="text-text shrink-0 font-mono text-sm">
                {/* Click on the chip opens <PriceDetailModal>; the row Link is
                    intercepted by stopPropagation inside TopRaresPriceCell. */}
                <TopRaresPriceCell cardId={c.id} cmPriceAvg={priceOf(c)} />
              </div>
            </>
          );
          if (c.pokemon_number !== null) {
            return (
              <li key={c.id}>
                <Link
                  href={`/pokedex?pokemon_number=${c.pokemon_number}`}
                  className="hover:bg-surface-2 flex w-full items-center gap-3 px-2 py-2 text-left transition-colors"
                >
                  {inner}
                </Link>
              </li>
            );
          }
          return (
            <li key={c.id} className="flex items-center gap-3 px-2 py-2">
              {inner}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
