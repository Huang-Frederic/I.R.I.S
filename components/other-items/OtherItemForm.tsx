'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { resizeImage } from '@/lib/utils/resize-image';
import CategoryPicker, { type VintedCategory } from './CategoryPicker';

const TITLE_MAX = 80;

const CONDITIONS: {
  value: number;
  labelKey:
    | 'conditionNewWithTag'
    | 'conditionNewWithoutTag'
    | 'conditionVeryGood'
    | 'conditionGood'
    | 'conditionSatisfactory';
}[] = [
  { value: 1, labelKey: 'conditionNewWithTag' },
  { value: 2, labelKey: 'conditionNewWithoutTag' },
  { value: 3, labelKey: 'conditionVeryGood' },
  { value: 4, labelKey: 'conditionGood' },
  { value: 5, labelKey: 'conditionSatisfactory' },
];

export default function OtherItemForm() {
  const t = useTranslations('otherItems');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<VintedCategory | null>(null);
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState(3);
  const [size, setSize] = useState('');
  const [dest, setDest] = useState<'for_sale' | 'collection'>('for_sale');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nameTooLong = name.length > TITLE_MAX;
  const previewUrls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);

  async function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    // Add the raw files synchronously first so the picker/submit button
    // reflects the new count immediately, then resize in the background and
    // swap each entry in place (matched by object identity, so concurrent
    // add/remove calls don't clobber each other).
    setPhotos((prev) => [...prev, ...arr]);
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
    setPhotos((prev) => {
      const next = [...prev];
      arr.forEach((original, i) => {
        const pos = next.indexOf(original);
        if (pos !== -1) next[pos] = resized[i];
      });
      return next;
    });
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

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('name', name.trim());
      if (description.trim()) fd.set('description', description.trim());
      if (price) fd.set('price', price.replace(',', '.'));
      fd.set('vinted_catalog_id', String(category.id));
      fd.set('vinted_catalog_path', category.path);
      fd.set('vinted_condition_id', String(condition));
      if (brand.trim()) fd.set('brand_name', brand.trim());
      if (size.trim()) fd.set('size', size.trim());
      fd.set('status', dest);
      for (const p of photos) fd.append('photos', p);

      const res = await fetch('/api/other-items', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? t('errorServer'));

      setName('');
      setDescription('');
      setPrice('');
      setCategory(null);
      setBrand('');
      setCondition(3);
      setSize('');
      setPhotos([]);
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
            if (e.target.files) void addPhotos(e.target.files);
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

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-text-muted text-xs">{t('conditionLabel')}</span>
          <select
            value={condition}
            onChange={(e) => setCondition(Number(e.target.value))}
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-text-muted text-xs">{t('sizeLabel')}</span>
          <input
            type="text"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder={t('sizePlaceholder')}
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>
      </div>

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
