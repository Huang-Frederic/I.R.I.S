'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Copy, Check, Download, X } from 'lucide-react';
import type { OtherItemWithListings } from '@/lib/types';
import { buildOtherItemAnnonce } from '@/lib/utils/other-item-template';
import { processImageForVinted, downloadBlob } from '@/lib/utils/image-postprocess';
import ConfirmDialog from '@/components/vinted/ConfirmDialog';

interface Props {
  item: OtherItemWithListings;
  storagePublicUrl: (path: string) => string;
  onClose: () => void;
  onPriceSaved: (itemId: string, newPrice: number | null) => void;
  onItemDeleted: () => void;
  /** Called after the item moved to Stock (status='collection'). */
  onMovedToStock?: () => void;
}

export default function OtherItemAnnonceModal({ item, storagePublicUrl, onClose, onPriceSaved, onItemDeleted, onMovedToStock }: Props) {
  const t = useTranslations('otherItemAnnonce');
  const tCommon = useTranslations('common');
  const initial = buildOtherItemAnnonce({
    name: item.name,
    description: item.description,
    brand_name: item.brand_name,
    size: item.size,
    vinted_condition_id: item.vinted_condition_id,
  });
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [copiedField, setCopiedField] = useState<'title' | 'desc' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [confirmMoveToStock, setConfirmMoveToStock] = useState(false);
  const [movingToStock, setMovingToStock] = useState(false);

  // Editable price
  const [priceDraft, setPriceDraft] = useState(item.price !== null ? String(item.price) : '');
  const [editingPrice, setEditingPrice] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    if (!copiedField) return;
    const timer = setTimeout(() => setCopiedField(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedField]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setPhotoIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setPhotoIndex((i) => Math.min(item.photo_urls.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, item.photo_urls.length]);

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
      setPriceDraft(item.price !== null ? String(item.price) : '');
      return;
    }
    if (parsed === item.price) return;
    setSavingPrice(true);
    try {
      const res = await fetch(`/api/other-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ price: parsed }),
      });
      if (!res.ok) throw new Error('save failed');
      onPriceSaved(item.id, parsed);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPrice(false);
    }
  }

  async function downloadCurrentImage() {
    if (item.photo_urls.length === 0) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const url = storagePublicUrl(item.photo_urls[photoIndex]);
      const { blob, filename } = await processImageForVinted(url);
      downloadBlob(blob, filename);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }

  async function deleteItem() {
    if (deletingItem) return;
    setDeletingItem(true);
    try {
      const res = await fetch(`/api/other-items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error(`DELETE /api/other-items/${item.id} failed (${res.status})`);
        return;
      }
      onItemDeleted();
      onClose();
    } catch (e) {
      console.error('deleteItem network error:', e);
    } finally {
      setDeletingItem(false);
      setConfirmDeleteItem(false);
    }
  }

  async function moveToStock() {
    if (movingToStock) return;
    setMovingToStock(true);
    try {
      const res = await fetch(`/api/other-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'collection' }),
      });
      if (!res.ok) {
        console.error(`PATCH /api/other-items/${item.id} status=collection failed (${res.status})`);
        return;
      }
      onMovedToStock?.();
      onClose();
    } catch (e) {
      console.error('moveToStock network error:', e);
    } finally {
      setMovingToStock(false);
      setConfirmMoveToStock(false);
    }
  }

  const currentImage = item.photo_urls.length > 0 ? storagePublicUrl(item.photo_urls[photoIndex]) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface border-border flex w-full max-w-3xl flex-col rounded-lg border shadow-xl max-h-[calc(100dvh-2rem)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-border flex shrink-0 items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold">{t('modalTitle')}</h2>
          <button type="button" onClick={onClose} aria-label={tCommon('close')} className="text-text-muted hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-4 overflow-y-auto overscroll-contain p-5 md:grid-cols-2">
          {/* Photo carousel */}
          <div className="space-y-2">
            <div className="bg-surface-off relative flex aspect-square items-center justify-center rounded">
              {currentImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={currentImage} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <p className="text-text-faint text-xs">{t('noPhoto')}</p>
              )}
              {item.photo_urls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                    disabled={photoIndex === 0}
                    aria-label={t('photoPrev')}
                    className="bg-surface/80 hover:bg-surface absolute left-2 rounded-full p-1.5 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex((i) => Math.min(item.photo_urls.length - 1, i + 1))}
                    disabled={photoIndex === item.photo_urls.length - 1}
                    aria-label={t('photoNext')}
                    className="bg-surface/80 hover:bg-surface absolute right-2 rounded-full p-1.5 disabled:opacity-30"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {item.photo_urls.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {item.photo_urls.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPhotoIndex(i)}
                    aria-label={t('photoDot', { index: i + 1 })}
                    className={`h-1.5 w-6 rounded-full ${i === photoIndex ? 'bg-text' : 'bg-text-faint'}`}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={downloadCurrentImage}
              disabled={downloading || item.photo_urls.length === 0}
              className="bg-surface-2 hover:bg-surface-off border-border w-full rounded border px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <Download className="mr-1 inline h-3.5 w-3.5" />
              {downloading ? t('downloadPreparing') : t('downloadButton')}
            </button>
            {downloadError && <p className="text-red text-xs">{downloadError}</p>}
          </div>

          {/* Title + description + price — no Cardmarket section: other_items
              have no market-price data to compare against. */}
          <div className="space-y-3">
            <div>
              <p className="text-text-faint text-xs">{t('titleLabel', { length: title.length })}</p>
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
                {copiedField === 'title' ? t('copyDone') : t('copyTitle')}
              </button>
            </div>

            <div>
              <p className="text-text-faint text-xs">{t('descriptionLabel')}</p>
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
                {copiedField === 'desc' ? t('copyDone') : t('copyDescription')}
              </button>
            </div>

            <div className="border-border rounded border p-3">
              <p className="text-text-faint text-xs">{t('salePrice')}</p>
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
                      setPriceDraft(item.price !== null ? String(item.price) : '');
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
                  title={t('editPriceTitle')}
                >
                  {item.price !== null ? `${item.price.toFixed(2)} €` : '—'}
                </button>
              )}
            </div>
          </div>

          <div className="border-border col-span-full flex items-center justify-start gap-4 border-t pt-4 md:col-span-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteItem(true)}
              disabled={deletingItem}
              className="text-red hover:underline text-sm disabled:opacity-50"
            >
              {t('removeItemLink')}
            </button>
            {item.status === 'for_sale' && (
              <button
                type="button"
                onClick={() => setConfirmMoveToStock(true)}
                disabled={movingToStock}
                className="text-text-muted hover:text-text hover:underline text-sm disabled:opacity-50"
              >
                {t('moveToStockLink')}
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmDeleteItem && (
        <ConfirmDialog
          title={t('deleteItemConfirmTitle')}
          body={t('deleteItemConfirmBody')}
          confirmLabel={t('deleteItemConfirmAction')}
          confirmTone="danger"
          busy={deletingItem}
          onConfirm={deleteItem}
          onCancel={() => setConfirmDeleteItem(false)}
        />
      )}
      {confirmMoveToStock && (
        <ConfirmDialog
          title={t('moveToStockConfirmTitle')}
          body={t('moveToStockConfirmBody')}
          confirmLabel={t('moveToStockConfirmAction')}
          busy={movingToStock}
          onConfirm={moveToStock}
          onCancel={() => setConfirmMoveToStock(false)}
        />
      )}
    </div>
  );
}
