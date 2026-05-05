// components/lots/LotAnnonceModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Check, Download, X } from 'lucide-react';
import type { Lot } from '@/lib/types';
import { buildLotAnnonce } from '@/lib/utils/lot-template';
import { processImageForVinted, downloadBlob } from '@/lib/utils/image-postprocess';

interface Props {
  lot: Lot;
  storagePublicUrl: (path: string) => string;
  onClose: () => void;
  onPriceSaved: (lotId: string, newPrice: number | null) => void;
}

export default function LotAnnonceModal({ lot, storagePublicUrl, onClose, onPriceSaved }: Props) {
  const initial = buildLotAnnonce({
    name: lot.name,
    language: lot.language,
    condition: lot.condition,
    extra_description: lot.extra_description,
  });
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [copiedField, setCopiedField] = useState<'title' | 'desc' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Editable price
  const [priceDraft, setPriceDraft] = useState(lot.price !== null ? String(lot.price) : '');
  const [editingPrice, setEditingPrice] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    if (!copiedField) return;
    const t = setTimeout(() => setCopiedField(null), 1500);
    return () => clearTimeout(t);
  }, [copiedField]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setPhotoIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setPhotoIndex((i) => Math.min(lot.photo_urls.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, lot.photo_urls.length]);

  async function copy(text: string, field: 'title' | 'desc') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
    } catch (err) {
      console.error(err);
    }
  }

  async function persistPrice() {
    setEditingPrice(false);
    const parsed = priceDraft.trim() === '' ? null : Number(priceDraft.replace(',', '.'));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setPriceDraft(lot.price !== null ? String(lot.price) : '');
      return;
    }
    if (parsed === lot.price) return;
    setSavingPrice(true);
    try {
      const res = await fetch(`/api/lots/${lot.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ price: parsed }),
      });
      if (!res.ok) throw new Error('save failed');
      onPriceSaved(lot.id, parsed);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPrice(false);
    }
  }

  async function downloadCurrentImage() {
    if (lot.photo_urls.length === 0) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const url = storagePublicUrl(lot.photo_urls[photoIndex]);
      const { blob, filename } = await processImageForVinted(url);
      downloadBlob(blob, filename);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }

  const currentImage = lot.photo_urls.length > 0 ? storagePublicUrl(lot.photo_urls[photoIndex]) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border-border w-full max-w-3xl overflow-hidden rounded-lg border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-border flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold">Annonce Vinted (Lot)</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-text-muted hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          {/* Photo carousel */}
          <div className="space-y-2">
            <div className="bg-surface-off relative flex aspect-square items-center justify-center rounded">
              {currentImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={currentImage} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <p className="text-text-faint text-xs">Aucune photo</p>
              )}
              {lot.photo_urls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                    disabled={photoIndex === 0}
                    aria-label="Photo précédente"
                    className="bg-surface/80 hover:bg-surface absolute left-2 rounded-full p-1.5 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex((i) => Math.min(lot.photo_urls.length - 1, i + 1))}
                    disabled={photoIndex === lot.photo_urls.length - 1}
                    aria-label="Photo suivante"
                    className="bg-surface/80 hover:bg-surface absolute right-2 rounded-full p-1.5 disabled:opacity-30"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {lot.photo_urls.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {lot.photo_urls.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPhotoIndex(i)}
                    aria-label={`Aller à la photo ${i + 1}`}
                    className={`h-1.5 w-6 rounded-full ${i === photoIndex ? 'bg-text' : 'bg-text-faint'}`}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={downloadCurrentImage}
              disabled={downloading || lot.photo_urls.length === 0}
              className="bg-surface-2 hover:bg-surface-off border-border w-full rounded border px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <Download className="mr-1 inline h-3.5 w-3.5" />
              {downloading ? 'Préparation…' : 'Download img (anti-bot)'}
            </button>
            {downloadError && <p className="text-red text-xs">{downloadError}</p>}
          </div>

          {/* Title + description + price */}
          <div className="space-y-3">
            <div>
              <p className="text-text-faint text-xs">Titre ({title.length}/80)</p>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none ${
                  title.length > 80 ? 'border-red' : ''
                }`}
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
              <p className="text-text-faint text-xs">Description</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={10}
                className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 font-sans text-xs outline-none"
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

            <div className="border-border rounded border p-3">
              <p className="text-text-faint text-xs">Prix de vente</p>
              {editingPrice ? (
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={priceDraft}
                  disabled={savingPrice}
                  onChange={(e) => setPriceDraft(e.target.value)}
                  onBlur={persistPrice}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') persistPrice();
                    if (e.key === 'Escape') {
                      setPriceDraft(lot.price !== null ? String(lot.price) : '');
                      setEditingPrice(false);
                    }
                  }}
                  className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-2 py-1 text-right font-mono text-sm outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingPrice(true)}
                  className="text-rarity-sr hover:text-rarity-sr/80 mt-1 font-mono font-bold"
                  title="Cliquer pour modifier"
                >
                  {lot.price !== null ? `${lot.price.toFixed(2)} €` : '—'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
