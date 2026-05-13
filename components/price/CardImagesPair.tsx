'use client';

import { useState } from 'react';
import MagnifierLoupe from '@/components/ui/MagnifierLoupe';

export interface CardImagesPairProps {
  myPhoto: string;
  tcgPhoto: string | null;
  myLabel?: string;
  tcgLabel?: string;
  /**
   * i18n template for the swap-button aria-label. Must contain the literal
   * `{target}` placeholder, which the component substitutes with the OTHER
   * label (i.e. the one that will become main after swapping). When omitted,
   * a French default is used so the component still works standalone.
   */
  swapAriaTemplate?: string;
  /** i18n title for the swap button. Falls back to a French default. */
  swapTitle?: string;
}

/**
 * Mobile: PiP (one large + one small thumb to swap).
 * Desktop: 2-col grid side-by-side, both with MagnifierLoupe.
 *
 * Extracted from AnnonceModal so PriceDetailModal (T19) can reuse the exact
 * pattern.
 *
 * When `tcgPhoto` is null, a neutral aspect-ratio placeholder div is rendered
 * in its place (no project-wide placeholder asset exists).
 */
export default function CardImagesPair({
  myPhoto,
  tcgPhoto,
  myLabel = 'Ma photo',
  tcgLabel = 'Image TCG',
  swapAriaTemplate,
  swapTitle,
}: CardImagesPairProps) {
  const [pipMain, setPipMain] = useState<'mine' | 'tcg'>('mine');

  // Neutral placeholder used in PiP when tcg image is missing — keeps the
  // aspect ratio so the PiP thumb still has a clickable target.
  const TcgPlaceholder = (
    <div className="bg-surface-2 border-border aspect-[5/7] w-full max-w-[280px] border" />
  );

  // Choose what shows as main vs thumb (mobile PiP).
  const mineIsMain = pipMain === 'mine';
  const mainAlt = mineIsMain ? myLabel : tcgLabel;
  const thumbAlt = mineIsMain ? tcgLabel : myLabel;
  // The "other" side = what becomes main after pressing the swap button.
  const otherLabel = mineIsMain ? tcgLabel : myLabel;
  const swapAria = swapAriaTemplate
    ? swapAriaTemplate.replace('{target}', otherLabel)
    : `Inverser : voir ${otherLabel} en grand`;
  const resolvedSwapTitle = swapTitle ?? 'Cliquer pour inverser';

  return (
    <div className="flex flex-col gap-3">
      {/* Mobile PiP */}
      <div className="md:hidden">
        <div className="relative mx-auto w-full max-w-sm">
          {mineIsMain ? (
            <MagnifierLoupe src={myPhoto} alt={mainAlt} className="border-border border" />
          ) : tcgPhoto !== null ? (
            <MagnifierLoupe src={tcgPhoto} alt={mainAlt} className="border-border border" />
          ) : (
            TcgPlaceholder
          )}
          <button
            type="button"
            onClick={() => setPipMain((prev) => (prev === 'mine' ? 'tcg' : 'mine'))}
            className="bg-surface border-border absolute bottom-2 right-2 h-[112px] w-[80px] overflow-hidden rounded border-2 shadow-lg transition-transform hover:scale-105"
            aria-label={swapAria}
            title={resolvedSwapTitle}
          >
            {mineIsMain ? (
              tcgPhoto !== null ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tcgPhoto} alt={thumbAlt} className="h-full w-full object-cover" />
              ) : (
                <div className="bg-surface-2 h-full w-full" />
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={myPhoto} alt={thumbAlt} className="h-full w-full object-cover" />
            )}
          </button>
        </div>
      </div>

      {/* Desktop: 2 side by side */}
      <div className="hidden gap-4 md:grid md:grid-cols-2">
        <div className="flex flex-col items-center gap-1">
          <span className="text-text-muted text-xs uppercase tracking-wide">{myLabel}</span>
          <MagnifierLoupe src={myPhoto} alt={myLabel} className="border-border max-w-[280px] border" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-text-muted text-xs uppercase tracking-wide">{tcgLabel}</span>
          {tcgPhoto !== null ? (
            <MagnifierLoupe src={tcgPhoto} alt={tcgLabel} className="border-border max-w-[280px] border" />
          ) : (
            TcgPlaceholder
          )}
        </div>
      </div>
    </div>
  );
}
