'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Trash2 } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { PriceHistoryPoint } from '@/lib/types/price-history';
import { createClient } from '@/lib/supabase/client';
import { fetchHistoryForCard } from '@/lib/api/price-history';
import { VARIANT_LABEL, RARITY_COLOR } from '@/lib/utils/labels';
import { displayCardName, displaySetName } from '@/lib/utils/format-name';
import PokedexCardActionsModal from '../PokedexCardActionsModal';
import PriceFreshnessBadge from '@/components/ui/PriceFreshnessBadge';
import RefreshPriceButton from '@/components/ui/RefreshPriceButton';
import CardmarketLink from '@/components/ui/CardmarketLink';
import { PriceWithTrend } from '@/components/ui/PriceWithTrend';
import { PriceHistoryChart } from '@/components/price/PriceHistoryChart';
import { Figure, Row, Price } from './DrawerUI';
import ReplaceFlow from './ReplaceFlow';

/** Pokédex drawer body when a card occupies the slot: photos, metadata,
 *  pricing, replace + remove actions. The price-history chart renders
 *  inline below the price block (no nested modal — the drawer itself is
 *  already a modal-like surface). */
export default function CardDetails({
  card,
  availableCards,
}: {
  card: Card;
  availableCards: Card[];
}) {
  const t = useTranslations('pokedex');
  const [showReplace, setShowReplace] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [points, setPoints] = useState<PriceHistoryPoint[]>([]);
  const router = useRouter();

  // Fetch full price history once when the drawer body mounts. Same pattern
  // as PriceDetailModal — pass `null` for an unlimited window so the chart's
  // internal period selector (7d/30d/90d/1y/all) works without a refetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const all = await fetchHistoryForCard(supabase, card.id, null);
      if (!cancelled) setPoints(all);
    })();
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        {card.image_url && (
          <Figure src={card.image_url} alt={t('figureAltCollection')} caption={t('yourPhoto')} />
        )}
        {card.tcg_image_url && (
          <Figure src={card.tcg_image_url} alt={t('figureAltOfficial')} caption={t('tcgImage')} />
        )}
        {!card.image_url && !card.tcg_image_url && (
          <p className="text-text-faint col-span-2 text-xs">{t('noImage')}</p>
        )}
      </div>

      <dl className="text-sm">
        <Row label={t('rowName')}>{displayCardName(card)}</Row>
        <Row label={t('rowSet')}>
          {displaySetName(card) ?? '—'}
          {card.set_code && (
            <span className="text-text-faint font-mono text-xs"> ({card.set_code})</span>
          )}
        </Row>
        <Row label={t('rowSetNumber')}>{card.set_number ?? '—'}</Row>
        <Row label={t('rowRarity')}>
          <span className={RARITY_COLOR[card.rarity] ?? 'text-text-muted'}>{card.rarity}</span>
          {card.variant && (
            <span className="bg-surface-off text-text-muted ml-2 inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs">
              {VARIANT_LABEL[card.variant] ?? card.variant}
            </span>
          )}
        </Row>
        <Row label={t('rowLanguage')}>{card.language}</Row>
        <Row label={t('rowCondition')}>{card.condition}</Row>
        <Row label={t('rowAddedAt')}>
          <span suppressHydrationWarning>
            {new Date(card.date_added).toLocaleDateString('fr-FR')}
          </span>
        </Row>
      </dl>

      {(card.cm_price_low ?? card.cm_price_trend ?? card.cm_price_avg ?? card.suggested_price) !==
      null ? (
        <div className="bg-surface-2 rounded-lg p-4 text-sm">
          <div className="flex items-stretch gap-3">
            <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
              <Price label={t('priceLow')} value={card.cm_price_low} />
              <Price label={t('priceTrend')} value={card.cm_price_trend} />
              <div>
                <p className="text-text-faint text-xs">{t('priceAvg')}</p>
                <PriceWithTrend
                  cardId={card.id}
                  cmPriceAvg={card.cm_price_avg}
                  variant="inline"
                />
              </div>
              <Price label={t('priceListing')} value={card.suggested_price} highlight />
            </div>
            <div className="flex shrink-0 flex-col items-end justify-end gap-1">
              <RefreshPriceButton
                cardId={card.id}
                onRefreshed={() => {
                  // Pokédex drawer reads from props; re-fetch from the server.
                  router.refresh();
                }}
              />
              <PriceFreshnessBadge cm_updated_at={card.cm_updated_at} />
            </div>
          </div>
          {card.cardmarket_url && (
            <div className="mt-2 text-right">
              <CardmarketLink url={card.cardmarket_url} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-text-faint text-xs">{t('noPrice')}</p>
          <RefreshPriceButton cardId={card.id} onRefreshed={() => router.refresh()} />
        </div>
      )}

      <PriceHistoryChart points={points} />

      {availableCards.length > 0 && (
        <div className="border-border border-t pt-4">
          {!showReplace ? (
            <button
              type="button"
              onClick={() => setShowReplace(true)}
              className="border-border text-text-muted hover:bg-surface-2 hover:text-text flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-sm"
            >
              <RefreshCcw className="h-4 w-4" />
              {t('replaceCount', { count: availableCards.length })}
            </button>
          ) : (
            <ReplaceFlow
              currentCard={card}
              candidates={availableCards}
              onCancel={() => setShowReplace(false)}
            />
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setActionsOpen(true)}
        className="bg-surface-2 hover:bg-surface-off border-red text-red mt-4 inline-flex w-full items-center justify-center gap-2 rounded border px-4 py-2 text-sm"
      >
        <Trash2 className="h-4 w-4" />
        {t('removeFromPokedex')}
      </button>

      {actionsOpen && (
        <PokedexCardActionsModal
          card={card}
          hasForSaleConflict={false}
          onClose={() => setActionsOpen(false)}
          onDone={() => {
            setActionsOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
