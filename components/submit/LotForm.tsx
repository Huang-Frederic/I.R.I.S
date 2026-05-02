'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X } from 'lucide-react';
import { buildLotAnnonce } from '@/lib/utils/lot-template';
import type { CardLanguage, CardCondition } from '@/lib/types';

const LANGUAGES: { value: CardLanguage; label: string }[] = [
  { value: 'JP', label: 'Japonaise 🇯🇵' },
  { value: 'EN', label: 'Anglaise 🇬🇧' },
  { value: 'FR', label: 'Française 🇫🇷' },
  { value: 'DE', label: 'Allemande 🇩🇪' },
  { value: 'IT', label: 'Italienne 🇮🇹' },
  { value: 'ES', label: 'Espagnole 🇪🇸' },
  { value: 'KO', label: 'Coréenne 🇰🇷' },
  { value: 'PT', label: 'Portugaise 🇵🇹' },
  { value: 'ZH', label: 'Chinoise 🇨🇳' },
];

const CONDITIONS: { value: CardCondition; label: string }[] = [
  { value: 'NM', label: 'Très bon état (Near Mint)' },
  { value: 'EX', label: 'Excellent (EX)' },
  { value: 'GD', label: 'Bon état (Good)' },
  { value: 'PL', label: 'Joué (Played)' },
  { value: 'PO', label: 'Mauvais état (Poor)' },
];

const TITLE_MAX = 80;

export default function LotForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [language, setLanguage] = useState<CardLanguage>('JP');
  const [condition, setCondition] = useState<CardCondition>('NM');
  const [extraDescription, setExtraDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrls = useMemo(
    () => photos.map((p) => URL.createObjectURL(p)),
    [photos],
  );

  const annonce = useMemo(
    () => buildLotAnnonce({ name: name || '(nom du lot)', language, condition, extra_description: extraDescription || null }),
    [name, language, condition, extraDescription],
  );

  const titleOver = name.length > TITLE_MAX;

  function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setPhotos((prev) => [...prev, ...arr]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim() === '') return setError('Nom requis');
    if (!price || !Number.isFinite(Number(price.replace(',', '.')))) return setError('Prix requis (nombre)');
    if (photos.length === 0) return setError('Au moins 1 photo requise');

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('name', name);
      fd.set('price', price.replace(',', '.'));
      fd.set('language', language);
      fd.set('condition', condition);
      if (extraDescription.trim()) fd.set('extra_description', extraDescription.trim());
      for (const p of photos) fd.append('photos', p);

      const res = await fetch('/api/lots', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur serveur');
      router.push('/vinted');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 md:grid-cols-2">
      {/* Left: form fields + photos */}
      <div className="space-y-4">
        <PhotoDropzone photos={photos} previewUrls={previewUrls} onAdd={addPhotos} onRemove={removePhoto} />

        <label className="block">
          <span className="text-text-muted text-xs">Nom / Titre Vinted ({name.length}/{TITLE_MAX})</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lot Cartes Pokémon Art Set Complet…"
            className={`bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none ${
              titleOver ? 'border-red' : ''
            }`}
          />
        </label>

        <label className="block">
          <span className="text-text-muted text-xs">Prix (€)</span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="25.00"
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-text-muted text-xs">Langue</span>
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
            <span className="text-text-muted text-xs">Condition</span>
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

        <label className="block">
          <span className="text-text-muted text-xs">Description additionnelle (optionnel)</span>
          <textarea
            value={extraDescription}
            onChange={(e) => setExtraDescription(e.target.value)}
            rows={3}
            placeholder="Texte inséré entre la ligne État et le bloc shipping. Laisser vide si non utilisé."
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>

        {error && <p className="text-red text-xs">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="bg-red text-bg w-full rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer le lot'}
        </button>
      </div>

      {/* Right: live preview */}
      <div className="bg-surface-2 border-border md:sticky md:top-4 h-fit space-y-3 rounded border p-4">
        <h3 className="text-text-muted text-xs font-medium">Aperçu Vinted</h3>
        <div>
          <p className="text-text-faint text-xs">Titre</p>
          <p className="font-medium">{annonce.title}</p>
        </div>
        <div>
          <p className="text-text-faint text-xs">Description</p>
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
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <span className="text-text-muted text-xs">Photos ({photos.length})</span>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
        }}
        className={`bg-surface-2 mt-1 flex cursor-pointer items-center justify-center rounded border border-dashed p-4 text-sm transition-colors ${
          dragging ? 'border-red' : 'border-border'
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => e.target.files && onAdd(e.target.files)}
          className="hidden"
        />
        <span className="text-text-muted flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Drop ou clic pour ajouter
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
                aria-label="Retirer cette photo"
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
