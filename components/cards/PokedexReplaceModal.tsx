'use client';

import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { VARIANT_LABEL } from '@/lib/utils/labels';
import CardZoomModal from '@/components/vinted/CardZoomModal';

export interface PokedexReplaceModalCard {
  id: string;
  image_url: string | null;
  tcg_image_url: string | null;
  card_name: string;
  pokemon_name: string;
  set_name: string | null;
  set_code: string | null;
  set_number: string | null;
  language: string;
  rarity: string;
  condition: string;
  variant: string | null;
}

interface Props {
  existingCard: PokedexReplaceModalCard;
  newCardSummary: {
    card_name: string;
    rarity: string;
    language: string;
    condition: string;
    variant: string | null;
    /** Object URL of the photo blob, if any. */
    previewUrl: string | null;
    /** Fallback to TCG image_url if no photo. */
    tcgImageUrl: string | null;
  };
  hasForSaleConflict: boolean;
  onConfirm: (displaceTo: 'collection' | 'for_sale') => void;
  onCancel: () => void;
  submitting?: boolean;
}

function thumbUrl(card: PokedexReplaceModalCard | { previewUrl: string | null; tcgImageUrl: string | null }): string | null {
  if ('previewUrl' in card) {
    return card.previewUrl ?? card.tcgImageUrl;
  }
  return card.image_url ?? card.tcg_image_url;
}

function formatVariant(v: string | null): string {
  if (!v) return 'Standard';
  return VARIANT_LABEL[v] ?? v;
}

export default function PokedexReplaceModal({
  existingCard,
  newCardSummary,
  hasForSaleConflict,
  onConfirm,
  onCancel,
  submitting = false,
}: Props) {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const existingThumb = thumbUrl(existingCard);
  const newThumb = thumbUrl(newCardSummary);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-2xl rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Voulez-vous remplacer ?</h2>
            <p className="text-text-muted mt-1 text-sm">
              {existingCard.pokemon_name} est déjà dans ton Pokédex. Tu peux remplacer la carte.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-text-muted hover:text-text disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-6 flex items-center justify-center gap-4">
          <CardPanel label="Existante" thumbUrl={existingThumb} title={existingCard.card_name} subtitle={`${existingCard.rarity} · ${existingCard.language} · ${formatVariant(existingCard.variant)}`} onZoomClick={existingThumb ? () => setZoomSrc(existingThumb) : undefined} />
          <ArrowRight className="text-text-muted h-6 w-6 shrink-0" />
          <CardPanel label="Nouvelle" thumbUrl={newThumb} title={newCardSummary.card_name} subtitle={`${newCardSummary.rarity} · ${newCardSummary.language} · ${formatVariant(newCardSummary.variant)}`} highlight onZoomClick={newThumb ? () => setZoomSrc(newThumb) : undefined} />
        </div>

        <div className="border-border bg-surface-2 mb-4 rounded border p-3 text-xs">
          <p className="text-text-muted">
            La nouvelle carte deviendra ta carte Pokédex pour ce Pokémon.
            L&apos;ancienne sera <strong className="text-text">déplacée</strong> :
          </p>
        </div>

        {hasForSaleConflict && (
          <p className="text-text-muted mb-3 text-xs">
            💡 Un exemplaire de cette carte est déjà en vente sur Vinted. Tu ne peux pas en lister un deuxième — déplace celui-ci en Stock à la place.
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm('collection')}
            disabled={submitting}
            className="border-border hover:bg-surface-off rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            {submitting ? 'Patientez…' : 'Vers Stock'}
          </button>
          <button
            type="button"
            onClick={() => onConfirm('for_sale')}
            disabled={submitting || hasForSaleConflict}
            title={hasForSaleConflict ? 'Un exemplaire est déjà en vente — Stock obligatoire' : undefined}
            className="bg-red text-bg rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Vers Vinted
          </button>
        </div>

        {zoomSrc && (
          <CardZoomModal src={zoomSrc} alt="Carte en grand" onClose={() => setZoomSrc(null)} />
        )}
      </div>
    </div>
  );
}

function CardPanel({
  label,
  thumbUrl,
  title,
  subtitle,
  highlight = false,
  onZoomClick,
}: {
  label: string;
  thumbUrl: string | null;
  title: string;
  subtitle: string;
  highlight?: boolean;
  onZoomClick?: () => void;
}) {
  return (
    <div className={`flex w-32 flex-col items-center gap-2 ${highlight ? 'opacity-100' : 'opacity-80'}`}>
      <span className={`text-text-faint text-xs uppercase tracking-wide ${highlight ? 'text-red' : ''}`}>{label}</span>
      {thumbUrl ? (
        onZoomClick ? (
          <button
            type="button"
            onClick={onZoomClick}
            className="hover:ring-red rounded transition-shadow hover:ring-2"
            aria-label="Voir en grand"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl} alt={title} className="bg-surface-off h-[140px] w-[100px] rounded object-cover" />
          </button>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={thumbUrl} alt={title} className="bg-surface-off h-[140px] w-[100px] rounded object-cover" />
        )
      ) : (
        <div className="bg-surface-off flex h-[140px] w-[100px] items-center justify-center rounded text-xs text-text-faint">
          Pas d&apos;image
        </div>
      )}
      <p className="line-clamp-2 text-center text-xs font-medium">{title}</p>
      <p className="text-text-muted line-clamp-1 text-center text-[10px]">{subtitle}</p>
    </div>
  );
}
