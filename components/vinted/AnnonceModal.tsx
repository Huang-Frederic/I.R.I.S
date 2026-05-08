// components/vinted/AnnonceModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { Copy, Download, X, Check } from 'lucide-react';
import type { Card } from '@/lib/types';
import { buildTitle, buildDescription, MAX_TITLE_LENGTH, type VintedConfig } from '@/lib/utils/vinted-template';
import { processImageForVinted, downloadBlob } from '@/lib/utils/image-postprocess';
import MagnifierLoupe from '@/components/ui/MagnifierLoupe';
import PriceFreshnessBadge from '@/components/ui/PriceFreshnessBadge';
import RefreshPriceButton from '@/components/ui/RefreshPriceButton';
import CardmarketLink from '@/components/ui/CardmarketLink';

interface Props {
  card: Card;
  config: VintedConfig;
  onClose: () => void;
  onPriceSaved: (cardId: string, newPrice: number | null) => void;
  /** Called when the manual refresh button updates the card's full row (cm_price_*, cm_updated_at). */
  onCardRefreshed?: (card: Card) => void;
}

/** Returns null for non-Pokémon cards (Trainer/Energy/Stadium): they have
 *  no national dex number, so no PokeAPI sprite to fall back to. The caller
 *  must provide its own fallback (usually card.image_url). */
function pokeApiSprite(n: number | null): string | null {
  if (n == null) return null;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${n}.png`;
}

export default function AnnonceModal({ card, onClose, onPriceSaved, onCardRefreshed }: Props) {
  // Dismiss on Escape, lock body scroll while the modal is open. Same pattern
  // as the other modals (CardZoomModal, LotAnnonceModal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const [title, setTitle] = useState<string>(() => buildTitle(card));
  const [description, setDescription] = useState<string>(() => buildDescription(card));
  const [copiedField, setCopiedField] = useState<'title' | 'desc' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Editable Suggested price (replaces the old separate "Vinted price" input)
  const [suggestedDraft, setSuggestedDraft] = useState<string>(
    card.suggested_price !== null ? String(card.suggested_price) : '',
  );
  const [editingSuggested, setEditingSuggested] = useState(false);
  const [savingSuggested, setSavingSuggested] = useState(false);

  // Mobile picture-in-picture: which image is the "main" big one
  const [pipMain, setPipMain] = useState<'mine' | 'tcg'>('mine');

  useEffect(() => {
    if (!copiedField) return;
    const t = setTimeout(() => setCopiedField(null), 1500);
    return () => clearTimeout(t);
  }, [copiedField]);

  const copy = async (text: string, field: 'title' | 'desc') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
    } catch (err) {
      console.error(err);
    }
  };

  const persistSuggested = async () => {
    const initial = card.suggested_price !== null ? String(card.suggested_price) : '';
    if (suggestedDraft === initial) {
      setEditingSuggested(false);
      return;
    }
    const parsed = suggestedDraft.trim() === '' ? null : Number(suggestedDraft.replace(',', '.'));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setSuggestedDraft(initial);
      setEditingSuggested(false);
      return;
    }
    setSavingSuggested(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suggested_price: parsed }),
      });
      if (res.ok) onPriceSaved(card.id, parsed);
    } finally {
      setSavingSuggested(false);
      setEditingSuggested(false);
    }
  };

  const handleDownload = async () => {
    const src = card.image_url ?? card.tcg_image_url;
    if (!src) {
      setDownloadError('Pas d\'image disponible');
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await processImageForVinted(src);
      downloadBlob(blob, filename);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Erreur de téléchargement');
    } finally {
      setDownloading(false);
    }
  };

  const titleOver = title.length > MAX_TITLE_LENGTH;
  // Fallback chain: user's photo → TCG official → PokeAPI sprite (if Pokémon) → empty.
  // For Trainers/Energies (pokemon_number null), there's no sprite — usually
  // image_url or tcg_image_url is present anyway.
  const sprite = pokeApiSprite(card.pokemon_number) ?? '';
  const myPhoto = card.image_url ?? sprite;
  const tcgPhoto = card.tcg_image_url ?? sprite;

  // PiP layout: main = the one chosen, thumb = the other
  const pipMainSrc = pipMain === 'mine' ? myPhoto : tcgPhoto;
  const pipMainAlt = pipMain === 'mine' ? 'Ma photo' : 'Image TCG';
  const pipThumbSrc = pipMain === 'mine' ? tcgPhoto : myPhoto;
  const pipThumbAlt = pipMain === 'mine' ? 'Image TCG' : 'Ma photo';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border-border my-6 w-full max-w-3xl rounded-lg border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold">Annonce Vinted</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* TOP — Cards */}
          {/* Mobile: PiP. Desktop: 2-up side-by-side */}
          <div className="flex flex-col gap-3">
            {/* Mobile PiP */}
            <div className="md:hidden">
              <div className="relative mx-auto w-full max-w-sm">
                <MagnifierLoupe
                  src={pipMainSrc}
                  alt={pipMainAlt}
                  className="border-border border"
                />
                <button
                  type="button"
                  onClick={() => setPipMain((prev) => (prev === 'mine' ? 'tcg' : 'mine'))}
                  className="bg-surface border-border absolute bottom-2 right-2 h-[112px] w-[80px] overflow-hidden rounded border-2 shadow-lg transition-transform hover:scale-105"
                  aria-label={`Inverser : voir ${pipMain === 'mine' ? 'image TCG' : 'ma photo'} en grand`}
                  title="Cliquer pour inverser"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pipThumbSrc} alt={pipThumbAlt} className="h-full w-full object-cover" />
                </button>
              </div>
            </div>

            {/* Desktop: 2 side by side */}
            <div className="hidden gap-4 md:grid md:grid-cols-2">
              <div className="flex flex-col items-center gap-1">
                <span className="text-text-muted text-xs uppercase tracking-wide">Ma photo</span>
                <MagnifierLoupe src={myPhoto} alt="Ma photo" className="border-border max-w-[280px] border" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-text-muted text-xs uppercase tracking-wide">Image TCG</span>
                <MagnifierLoupe src={tcgPhoto} alt="Image TCG" className="border-border max-w-[280px] border" />
              </div>
            </div>

            {/* Download img */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {downloading ? 'Préparation…' : 'Download img'}
              </button>
              {downloadError && <p className="text-red text-xs">{downloadError}</p>}
            </div>
          </div>

          {/* BOTTOM — Title + Description + Price */}
          <div className="space-y-4">
            <div>
              <label className="text-text-muted flex items-center justify-between text-xs">
                <span>Titre</span>
                <span className={`font-mono ${titleOver ? 'text-red' : ''}`}>
                  {title.length}/{MAX_TITLE_LENGTH}
                </span>
              </label>
              <textarea
                rows={2}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => copy(title, 'title')}
                className="bg-surface-2 hover:bg-surface-off border-border mt-1 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs"
              >
                {copiedField === 'title' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === 'title' ? 'Copié' : 'Copier le titre'}
              </button>
            </div>

            <div>
              <label className="text-text-muted text-xs">Description</label>
              <textarea
                rows={11}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 font-mono text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => copy(description, 'desc')}
                className="bg-surface-2 hover:bg-surface-off border-border mt-1 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs"
              >
                {copiedField === 'desc' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === 'desc' ? 'Copié' : 'Copier la description'}
              </button>
            </div>

            {/* Price grid: Annonce (suggested_price) is editable inline.
                5th cell (when refresh wired) = freshness badge on top + refresh button below. */}
            <div className={`border-border grid ${onCardRefreshed ? 'grid-cols-5' : 'grid-cols-4'} gap-2 rounded border p-3 text-center text-xs`}>
              <PriceCell label="Low" value={card.cm_price_low} />
              <PriceCell label="Trend" value={card.cm_price_trend} />
              <PriceCell label="Avg" value={card.cm_price_avg} />
              <div>
                <p className="text-text-faint">Annonce</p>
                {editingSuggested ? (
                  <input
                    autoFocus
                    type="text"
                    inputMode="decimal"
                    value={suggestedDraft}
                    disabled={savingSuggested}
                    onChange={(e) => setSuggestedDraft(e.target.value)}
                    onBlur={persistSuggested}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') persistSuggested();
                      if (e.key === 'Escape') {
                        setSuggestedDraft(card.suggested_price !== null ? String(card.suggested_price) : '');
                        setEditingSuggested(false);
                      }
                    }}
                    className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-1 py-0.5 text-center font-mono text-xs outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingSuggested(true)}
                    className="text-rarity-sr hover:text-rarity-sr/80 font-mono font-bold"
                    title="Cliquer pour modifier"
                  >
                    {card.suggested_price !== null ? `${card.suggested_price.toFixed(2)}` : '—'}
                  </button>
                )}
              </div>
              {onCardRefreshed && (
                <div className="flex flex-col items-center justify-center gap-1">
                  <PriceFreshnessBadge cm_updated_at={card.cm_updated_at} />
                  <RefreshPriceButton cardId={card.id} onRefreshed={onCardRefreshed} />
                  <CardmarketLink url={card.cardmarket_url} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-text-faint">{label}</p>
      <p className="font-mono">{value !== null ? value.toFixed(2) : '—'}</p>
    </div>
  );
}
