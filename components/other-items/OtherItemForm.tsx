'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { resizeImage } from '@/lib/utils/resize-image';
import { DEFAULT_CONDITION_ID, missingAttributes } from '@/lib/vinted/other-item-attributes';
import CategoryPicker, { type VintedCategory } from './CategoryPicker';
import OtherItemVintedFields, { type VintedFieldsPatch } from './OtherItemVintedFields';
import { useCatalogAttributes } from './hooks/useCatalogAttributes';

const TITLE_MAX = 80;

export default function OtherItemForm() {
  const t = useTranslations('otherItems');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<VintedCategory | null>(null);
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState(DEFAULT_CONDITION_ID);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const [sizeLabel, setSizeLabel] = useState<string | null>(null);
  const [colorIds, setColorIds] = useState<number[]>([]);
  const [showMissing, setShowMissing] = useState(false);
  const { state: attributes, retry: retryAttributes } = useCatalogAttributes(category?.id ?? null);
  const [dest, setDest] = useState<'for_sale' | 'collection'>('for_sale');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `photos` so `submit()` can read the latest array *after* awaiting
  // pending resizes below — awaiting inside `submit()` doesn't refresh the
  // `photos` binding captured by that closure, since React state updates
  // don't retroactively change a value already destructured in a running
  // function call.
  const photosRef = useRef<File[]>([]);
  // In-flight resize work started by addPhotos(), so submit() can wait for
  // it to finish instead of uploading pre-resize (potentially 5-12 MB) raw
  // files — see resizeImage()'s docstring on why that matters.
  const pendingResizesRef = useRef<Set<Promise<void>>>(new Set());

  const nameTooLong = name.length > TITLE_MAX;
  // Only enforced once the category's attributes are known — while the bot
  // hasn't loaded them the item can still be created, and the size picked
  // later from the fiche (the bot re-checks everything before posting).
  const missing = missingAttributes(attributes.status === 'ready' ? attributes.attributes : null, {
    sizeId,
    colorIds,
    conditionId: condition,
  });

  const applyVintedFields = useCallback((patch: VintedFieldsPatch) => {
    if (patch.conditionId !== undefined) setCondition(patch.conditionId);
    if (patch.sizeId !== undefined) setSizeId(patch.sizeId);
    if (patch.sizeLabel !== undefined) setSizeLabel(patch.sizeLabel);
    if (patch.colorIds !== undefined) setColorIds(patch.colorIds);
  }, []);
  const previewUrls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);

  // Updates photosRef synchronously (plain assignment, not dependent on
  // React's own scheduling) and derives the next array from it rather than
  // from setPhotos' own `prev` — React doesn't guarantee a functional
  // setState updater runs synchronously with the setPhotos(...) call site,
  // so computing off of React's `prev` and writing photosRef.current from
  // *inside* that callback can leave the ref stale exactly when something
  // async (like the resize wait in submit()) needs its latest value right
  // after the triggering promise settles.
  function updatePhotos(updater: (prev: File[]) => File[]) {
    const next = updater(photosRef.current);
    photosRef.current = next;
    setPhotos(next);
  }

  function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    // Add the raw files synchronously first so the picker/submit button
    // reflects the new count immediately, then resize in the background and
    // swap each entry in place (matched by object identity, so concurrent
    // add/remove calls don't clobber each other).
    updatePhotos((prev) => [...prev, ...arr]);

    const resizeDone: Promise<void> = (async () => {
      const resized = await Promise.all(
        arr.map(async (f) => {
          try {
            const blob = await resizeImage(f);
            return new File([blob], f.name, { type: 'image/jpeg' });
          } catch {
            return f;
          }
        }),
      );
      updatePhotos((prev) => {
        const next = [...prev];
        arr.forEach((original, i) => {
          const pos = next.indexOf(original);
          if (pos !== -1) next[pos] = resized[i];
        });
        return next;
      });
    })();

    pendingResizesRef.current.add(resizeDone);
    // Always deregister once settled (resizeDone itself never rejects, each
    // per-file resize already falls back to the raw file on error above) so
    // the set doesn't keep growing across multiple photo-add interactions.
    void resizeDone.finally(() => pendingResizesRef.current.delete(resizeDone));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t('errorName'));
    // Over-length is already surfaced inline next to the field (driven by
    // `nameTooLong` below), so just block submission here without
    // duplicating the same message into the generic error slot.
    if (nameTooLong) return;
    if (!category) return setError(t('errorCategory'));
    if (photos.length === 0) return setError(t('errorPhoto'));
    if (missing.length > 0) return setShowMissing(true);

    setSubmitting(true);
    try {
      // Wait for any resize started by addPhotos() to finish before reading
      // photosRef — otherwise a fast submit (add photo, then immediately
      // submit, before resizeImage resolves) would upload the raw,
      // pre-resize file instead, defeating the point of resizing at all.
      if (pendingResizesRef.current.size > 0) {
        await Promise.all(pendingResizesRef.current);
      }

      const fd = new FormData();
      fd.set('name', name.trim());
      if (description.trim()) fd.set('description', description.trim());
      if (price) fd.set('price', price.replace(',', '.'));
      fd.set('vinted_catalog_id', String(category.id));
      fd.set('vinted_catalog_path', category.path);
      fd.set('vinted_condition_id', String(condition));
      if (brand.trim()) fd.set('brand_name', brand.trim());
      if (sizeId !== null) fd.set('vinted_size_id', String(sizeId));
      if (sizeLabel) fd.set('size', sizeLabel);
      for (const id of colorIds) fd.append('vinted_color_ids', String(id));
      fd.set('status', dest);
      for (const p of photosRef.current) fd.append('photos', p);

      const res = await fetch('/api/other-items', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? t('errorServer'));

      setName('');
      setDescription('');
      setPrice('');
      setCategory(null);
      setBrand('');
      setCondition(DEFAULT_CONDITION_ID);
      setSizeId(null);
      setSizeLabel(null);
      setColorIds([]);
      setShowMissing(false);
      updatePhotos(() => []);
      setSubmitting(false);
      setSubmitted(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSubmitted(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:max-w-xl">
      <label className="block">
        <span id="photo-input-label" className="text-text-muted text-xs">
          {t('photoInputLabel')}
        </span>
        <input
          aria-labelledby="photo-input-label"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files) addPhotos(e.target.files);
          }}
          className="mt-1 block w-full text-sm"
        />
      </label>
      {previewUrls.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {previewUrls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" className="h-20 w-full rounded object-cover" />
          ))}
        </div>
      )}

      <label className="block">
        <span className="text-text-muted text-xs">{t('nameLabel')}</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none ${nameTooLong ? 'border-red' : ''}`}
        />
        {nameTooLong && <p className="text-red mt-1 text-xs">{t('errorNameTooLong')}</p>}
      </label>

      <label className="block">
        <span className="text-text-muted text-xs">{t('categoryLabel')}</span>
        <CategoryPicker value={category} onChange={setCategory} />
      </label>

      <label className="block">
        <span className="text-text-muted text-xs">{t('descriptionLabel')}</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-text-muted text-xs">{t('priceLabel')}</span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="block">
          <span className="text-text-muted text-xs">{t('brandLabel')}</span>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>
      </div>

      <OtherItemVintedFields
        attributes={attributes}
        onRetry={() => void retryAttributes()}
        conditionId={condition}
        sizeId={sizeId}
        colorIds={colorIds}
        onChange={applyVintedFields}
        missing={showMissing ? missing : []}
      />

      <div>
        <span className="text-text-muted mb-1 block text-xs">{t('destLabel')}</span>
        <div className="flex gap-2">
          {(['for_sale', 'collection'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDest(d)}
              className={`flex-1 rounded border px-2 py-1.5 text-xs transition-colors ${
                dest === d
                  ? 'border-red bg-red/10 text-text font-medium'
                  : 'border-border text-text-muted hover:border-red/50'
              }`}
            >
              {d === 'for_sale' ? t('destVinted') : t('destStock')}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red text-xs">{error}</p>}
      {submitted && (
        <p className="text-xs font-medium text-green-600 dark:text-green-400">{t('success')}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-red text-bg w-full rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
