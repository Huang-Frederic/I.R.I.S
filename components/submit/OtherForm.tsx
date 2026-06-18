'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, X } from 'lucide-react';
import { buildLotAnnonce } from '@/lib/utils/lot-template';
import { resizeImage } from '@/lib/utils/resize-image';
import type { CardLanguage, CardCondition } from '@/lib/types';
import { translateErrorCode } from '@/lib/utils/translate-error';

const TITLE_MAX = 80;
const CARDS_CATALOG_ID = 4875;
const CARD_LOTS_CATALOG_ID = 4879;

type Brand = {
  id: number;
  label: string;       // shown in UI button and title/description
  vintedName: string;  // sent to Vinted API as `brand`
};

const BRANDS: Brand[] = [
  { id: 89766,    label: 'One Piece',  vintedName: 'OnePiece' },
  { id: 399547,   label: 'Magic',      vintedName: 'Magic: The Gathering' },
  { id: 191646,   label: 'Pokémon',   vintedName: 'Pokémon' },
  { id: 287189,   label: 'Lorcana',    vintedName: 'Ravensburger' },
  { id: 509120,   label: 'Riftbound',  vintedName: 'Riot Games' },
  { id: 1,        label: 'Autre',      vintedName: 'Sans marque' },
];

export default function OtherForm() {
  const t = useTranslations('other');
  const tLots = useTranslations('lots');
  const tErrors = useTranslations('errors');

  const [isLot, setIsLot] = useState(true);
  const [brand, setBrand] = useState<Brand>(BRANDS[0]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [language, setLanguage] = useState<CardLanguage>('JP');
  const [condition, setCondition] = useState<CardCondition>('NM');
  const [extraDescription, setExtraDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LANGUAGES: { value: CardLanguage; label: string }[] = [
    { value: 'JP', label: tLots('languageJa') },
    { value: 'EN', label: tLots('languageEn') },
    { value: 'FR', label: tLots('languageFr') },
    { value: 'KO', label: tLots('languageKo') },
    { value: 'CN', label: tLots('languageCn') },
  ];

  const CONDITIONS: { value: CardCondition; label: string }[] = [
    { value: 'NM', label: tLots('conditionNm') },
    { value: 'EX', label: tLots('conditionEx') },
    { value: 'GD', label: tLots('conditionGd') },
    { value: 'PL', label: tLots('conditionPl') },
    { value: 'PO', label: tLots('conditionPo') },
  ];

  const placeholderName = isLot ? t('namePlaceholderLot') : t('namePlaceholderSingle');
  const annonce = useMemo(
    () => buildLotAnnonce({
      name: name || placeholderName,
      language,
      condition,
      extra_description: extraDescription || null,
      brandLabel: brand.label === 'Autre' ? '' : brand.label,
      isLot,
    }),
    [name, language, condition, extraDescription, brand, isLot, placeholderName],
  );

  const titleLength = annonce.title.length;
  const titleOver = titleLength > TITLE_MAX;

  const previewUrls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);

  async function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
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
    setPhotos((prev) => [...prev, ...resized]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t('errorName'));
    if (price && !Number.isFinite(Number(price.replace(',', '.')))) return setError(t('errorPrice'));
    if (photos.length === 0) return setError(t('errorPhoto'));

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('name', name.trim());
      if (price) fd.set('price', price.replace(',', '.'));
      fd.set('language', language);
      fd.set('condition', condition);
      if (extraDescription.trim()) fd.set('extra_description', extraDescription.trim());
      fd.set('catalog_id', String(isLot ? CARD_LOTS_CATALOG_ID : CARDS_CATALOG_ID));
      fd.set('is_lot', String(isLot));
      fd.set('brand_id', String(brand.id));
      fd.set('brand_name', brand.vintedName);
      fd.set('brand_label', brand.label === 'Autre' ? '' : brand.label);
      for (const p of photos) fd.append('photos', p);

      const res = await fetch('/api/lots', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        const localized = translateErrorCode(tErrors, json.error);
        throw new Error(localized ?? json.message ?? t('errorServer'));
      }
      setName('');
      setPrice('');
      setCondition('NM');
      setExtraDescription('');
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
    <form onSubmit={submit} className="grid gap-6 md:grid-cols-2">
      {/* Left: form fields */}
      <div className="space-y-4">
        <PhotoDropzone photos={photos} previewUrls={previewUrls} onAdd={addPhotos} onRemove={removePhoto} />

        {/* Type toggle */}
        <div>
          <span className="text-text-muted mb-1 block text-xs">{t('typeLabel')}</span>
          <div className="flex gap-2">
            {([false, true] as const).map((lot) => (
              <button
                key={String(lot)}
                type="button"
                onClick={() => setIsLot(lot)}
                className={`flex-1 rounded border px-2 py-1.5 text-xs transition-colors ${
                  isLot === lot
                    ? 'border-red bg-red/10 text-text font-medium'
                    : 'border-border text-text-muted hover:border-red/50'
                }`}
              >
                {lot ? t('typeLot') : t('typeSingle')}
              </button>
            ))}
          </div>
        </div>

        {/* Brand grid */}
        <div>
          <span className="text-text-muted mb-1 block text-xs">{t('brandLabel')}</span>
          <div className="grid grid-cols-3 gap-1.5">
            {BRANDS.map((b) => (
              <button
                key={`${b.id}-${b.label}`}
                type="button"
                onClick={() => setBrand(b)}
                className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                  brand.label === b.label
                    ? 'border-red bg-red/10 text-text font-medium'
                    : 'border-border text-text-muted hover:border-red/50'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <label className="block">
          <span className="text-text-muted text-xs">
            {t('nameLabelWithCount', { titleLength, titleMax: TITLE_MAX })}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholderName}
            className={`bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none ${titleOver ? 'border-red' : ''}`}
          />
          <span className="text-text-faint mt-1 block text-[11px]">
            {t.rich('nameFinal', {
              value: () => <span className="text-text-muted font-mono">{annonce.title}</span>,
            })}
          </span>
        </label>

        {/* Price */}
        <label className="block">
          <span className="text-text-muted text-xs">{t('priceLabel')}</span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={t('pricePlaceholder')}
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>

        {/* Language + Condition */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-text-muted text-xs">{tLots('lotFormLanguageLabel')}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as CardLanguage)}
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-text-muted text-xs">{tLots('lotFormConditionLabel')}</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as CardCondition)}
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Extra description */}
        <label className="block">
          <span className="text-text-muted text-xs">{t('descriptionLabel')}</span>
          <textarea
            value={extraDescription}
            onChange={(e) => setExtraDescription(e.target.value)}
            rows={3}
            placeholder={t('descriptionPlaceholder')}
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>

        {error && <p className="text-red text-xs">{error}</p>}
        {submitted && <p className="text-green-600 dark:text-green-400 text-xs font-medium">{t('success')}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="bg-red text-bg w-full rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </div>

      {/* Right: live Vinted preview */}
      <div className="bg-surface-2 border-border md:sticky md:top-4 h-fit space-y-3 rounded border p-4">
        <h3 className="text-text-muted text-xs font-medium">{t('previewHeading')}</h3>
        <div>
          <p className="text-text-faint text-xs">{t('previewTitle')}</p>
          <p className="font-medium">{annonce.title}</p>
        </div>
        <div>
          <p className="text-text-faint text-xs">{t('previewDescription')}</p>
          <pre className="text-text mt-1 whitespace-pre-wrap font-sans text-xs">{annonce.description}</pre>
        </div>
      </div>
    </form>
  );
}

function PhotoDropzone({
  photos,
  previewUrls,
  onAdd,
  onRemove,
}: {
  photos: File[];
  previewUrls: string[];
  onAdd: (files: FileList | File[]) => Promise<void>;
  onRemove: (index: number) => void;
}) {
  const t = useTranslations('other');
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <span className="text-text-muted text-xs">{t('photoLabel', { count: photos.length })}</span>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void onAdd(e.dataTransfer.files);
        }}
        className={`bg-surface-2 mt-1 flex cursor-pointer items-center justify-center rounded border border-dashed p-4 text-sm transition-colors ${
          dragging ? 'border-red' : 'border-border'
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => { if (e.target.files) void onAdd(e.target.files); }}
          className="hidden"
        />
        <span className="text-text-muted flex items-center gap-2">
          <Upload className="h-4 w-4" />
          {t('photoPlaceholder')}
        </span>
      </label>

      {previewUrls.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {previewUrls.map((url, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-20 w-full rounded object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={t('photoRemove')}
                className="bg-surface absolute right-1 top-1 rounded p-0.5 opacity-80 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
