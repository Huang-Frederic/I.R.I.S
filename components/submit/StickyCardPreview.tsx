'use client';

import { useEffect, useState, type RefObject } from 'react';
import PokemonSpriteBadge from '@/components/ui/PokemonSpriteBadge';

export interface StickyCardPreviewProps {
  /** Object URL of the user's uploaded photo (right thumb). */
  uploadedPhotoUrl: string | null;
  /** TCG image URL of the card matched by enrichment (left thumb). */
  matchedCardImageUrl: string | null;
  /** National Pokédex number for the centre sprite. */
  pokemonNumber: number | null;
  /**
   * Element to observe — when its bottom edge scrolls past the upper half of
   * the viewport, the sticky bar appears. Typed to allow `useRef(null)` per
   * React 19 ref typing.
   */
  triggerRef: RefObject<HTMLElement | null>;
}

/**
 * Mobile-only sticky bar that pins a tiny three-thumbnail recap to the top of
 * the viewport once the original image preview has scrolled out of sight.
 *
 * Layout (left → centre → right): matched TCG card · Pokémon sprite · uploaded
 * photo. Mirrors the order the user sees on the full preview at the top of the
 * scanner page so the spatial mapping is preserved.
 *
 * Hidden on `md+` because desktop already keeps the photo column sticky via
 * `lg:sticky lg:top-6` in CardScanForm.
 */
export default function StickyCardPreview({
  uploadedPhotoUrl,
  matchedCardImageUrl,
  pokemonNumber,
  triggerRef,
}: StickyCardPreviewProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const compute = () => {
      const rect = trigger.getBoundingClientRect();
      // Show as soon as more than ~50% of the trigger has scrolled off the top.
      // Using bottom < viewport/2 means: when the trigger's bottom edge has
      // crossed the upper half of the screen, the sticky kicks in. This is
      // intentionally generous so the sticky doesn't double up with the still-
      // visible original preview.
      const halfway = rect.bottom < window.innerHeight / 2;
      setVisible(halfway);
    };

    compute();
    const observer = new IntersectionObserver(compute, {
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    observer.observe(trigger);

    // IntersectionObserver only fires on intersection-ratio changes; small
    // scroll deltas while the trigger is fully off-screen won't trigger it. A
    // passive scroll listener catches those edges and keeps the toggle honest.
    window.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
    // `uploadedPhotoUrl` is a dep so the effect re-runs once the parent renders
    // the trigger element (the photo container only mounts after a photo is
    // chosen). Without it, the first run sees `triggerRef.current === null`,
    // bails, and never observes anything.
  }, [triggerRef, uploadedPhotoUrl]);

  // Nothing to show until we have at least one piece of context AND the user
  // has scrolled past the trigger. Bailing early keeps the DOM lean on first
  // paint and avoids a one-frame flash of an empty bar.
  const hasAnyContent =
    Boolean(uploadedPhotoUrl) ||
    Boolean(matchedCardImageUrl) ||
    pokemonNumber != null;
  if (!visible || !hasAnyContent) return null;

  return (
    <div
      className="bg-bg/95 border-border fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-3 border-b p-2 backdrop-blur md:hidden"
      role="region"
      aria-label="Aperçu carte"
    >
      {/* Matched card (left) */}
      <div className="bg-surface-2 border-border h-16 w-12 overflow-hidden rounded border">
        {matchedCardImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={matchedCardImageUrl}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Sprite (middle) — PokemonSpriteBadge has a built-in 24x24rem-ish
          wrapper; force-shrink it here via className override so it sits
          comfortably between the two thumbnails without dominating the bar. */}
      <PokemonSpriteBadge
        pokemonNumber={pokemonNumber}
        className="!h-14 !w-14 [&_img]:!h-12 [&_img]:!w-12 [&_svg]:!h-8 [&_svg]:!w-8"
      />

      {/* Uploaded photo (right) */}
      <div className="bg-surface-2 border-border h-16 w-12 overflow-hidden rounded border">
        {uploadedPhotoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={uploadedPhotoUrl}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
          />
        )}
      </div>
    </div>
  );
}
