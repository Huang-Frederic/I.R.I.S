'use client';

import { useTranslations } from 'next-intl';
import { cardmarketUrlForLanguage } from '@/lib/utils/cardmarket-url';

interface Props {
  url: string | null;
  /** The card's language — a French card opens on its French offers. */
  language?: string | null;
}

/**
 * Tiny inline link to the matched Cardmarket product page. Renders nothing
 * when `url` is missing — happens for cards whose expansion hasn't been
 * scraped yet, or that fell back to TCGdex pricing.
 *
 * Used as a sanity check: clicking opens the exact CM page that fed the
 * displayed prices, so the user can verify the lookup picked the right print.
 */
export default function CardmarketLink({ url, language }: Props) {
  const t = useTranslations('ui');
  if (!url) return null;
  return (
    <a
      href={cardmarketUrlForLanguage(url, language) ?? url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
      title={t('cardmarketLinkTitle')}
      onClick={(e) => e.stopPropagation()}
    >
      {t('cardmarketLinkLabel')}
    </a>
  );
}
