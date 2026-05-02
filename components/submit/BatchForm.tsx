// components/submit/BatchForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, Loader2 } from 'lucide-react';
import { resizeImage } from '@/lib/utils/resize-image';
import BatchReviewQueue, { type QueueItem } from './BatchReviewQueue';
import type { OcrResult, EnrichResult } from '@/lib/types';

const MAX_PHOTOS = 15;

type Phase = 'pick' | 'analyzing' | 'review' | 'committing' | 'done';

interface CommitSummary {
  total: number;
  for_sale: number;
  collection: number;
  fallback: number;
  failed: number;
}

export default function BatchForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('pick');
  const [photos, setPhotos] = useState<File[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<CommitSummary | null>(null);

  function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setPhotos((prev) => [...prev, ...arr].slice(0, MAX_PHOTOS));
  }

  async function analyze() {
    setPhase('analyzing');
    setProgress(0);
    const newItems: QueueItem[] = [];

    // Resize → OCR → enrich, parallel but with progress reporting
    const tasks = photos.map(async (file, i) => {
      const blob = await resizeImage(file);
      const fd = new FormData();
      fd.append('image', blob, file.name);
      const ocrRes = await fetch('/api/ocr', { method: 'POST', body: fd });
      const ocr = await ocrRes.json() as OcrResult;
      const enrichRes = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: ocr.text,
          setCode: ocr.setCodeCandidate,
          localId: ocr.setNumberCandidate?.card,
          // Default language for enrich lookup; user can refine in the review queue
          language: 'JP',
        }),
      });
      const enrich = await enrichRes.json() as EnrichResult;
      const best = enrich.bestMatch;
      const item: QueueItem = {
        filename: file.name,
        photoPreviewUrl: URL.createObjectURL(file),
        card_name: best?.card_name ?? '',
        pokemon_name: best?.pokemon_name ?? '',
        pokemon_number: best?.pokemon_number ?? null,
        set_code: best?.set_code ?? '',
        set_number: best?.set_number ?? '',
        language: 'JP',
        rarity: best?.rarity ?? 'OTHER',
        condition: 'NM',
        variant: '',
        count: 1,
        requested_status: 'for_sale',
      };
      newItems[i] = item;
      setProgress((p) => p + 1);
    });
    await Promise.all(tasks);
    setItems(newItems);
    setPhase('review');
  }

  function updateItem(index: number, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function skipItem(index: number) {
    updateItem(index, { requested_status: 'SKIP' });
  }

  async function commit() {
    setPhase('committing');
    const commitItems = items.filter((i) => i.requested_status !== 'SKIP');
    let for_sale = 0, collection = 0, fallback = 0, failed = 0;

    for (const item of commitItems) {
      const photo = photos.find((p) => p.name === item.filename);
      if (!photo) { failed += 1; continue; }
      for (let copy = 0; copy < item.count; copy += 1) {
        const blob = await resizeImage(photo);
        const fd = new FormData();
        fd.append('image', blob, item.filename);
        fd.append('card_name', item.card_name);
        fd.append('pokemon_name', item.pokemon_name || item.card_name);
        fd.append('pokemon_number', String(item.pokemon_number ?? ''));
        fd.append('set_code', item.set_code);
        fd.append('set_number', item.set_number);
        fd.append('language', item.language);
        fd.append('rarity', item.rarity);
        fd.append('condition', item.condition);
        if (item.variant) fd.append('variant', item.variant);
        fd.append('status', item.requested_status as string);

        try {
          const res = await fetch('/api/cards', { method: 'POST', body: fd });
          const json = await res.json();
          if (!res.ok) { failed += 1; continue; }
          if (json.fallback === 'for_sale_to_collection') { fallback += 1; collection += 1; }
          else if (json.card?.status === 'for_sale') { for_sale += 1; }
          else if (json.card?.status === 'collection') { collection += 1; }
        } catch {
          failed += 1;
        }
      }
    }
    setSummary({ total: commitItems.length, for_sale, collection, fallback, failed });
    setPhase('done');
  }

  // RENDER
  if (phase === 'done' && summary) {
    return (
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Récap</h3>
        <p className="text-sm">
          {summary.for_sale} en vente · {summary.collection} en collection (dont {summary.fallback} auto-fallback) · {summary.failed} échecs
        </p>
        <button
          type="button"
          onClick={() => router.push('/vinted')}
          className="bg-red text-bg rounded px-4 py-2 text-sm font-medium"
        >
          Voir le résultat
        </button>
      </div>
    );
  }

  if (phase === 'review') {
    return (
      <div className="space-y-4">
        <BatchReviewQueue items={items} onUpdate={updateItem} onSkip={skipItem} />
        <button
          type="button"
          onClick={commit}
          className="bg-red text-bg w-full rounded px-4 py-2 text-sm font-medium"
        >
          Tout enregistrer
        </button>
      </div>
    );
  }

  if (phase === 'analyzing' || phase === 'committing') {
    return (
      <div className="text-text-muted flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        {phase === 'analyzing'
          ? `Analyse en cours… ${progress}/${photos.length}`
          : 'Enregistrement…'}
      </div>
    );
  }

  // phase === 'pick'
  return (
    <div className="space-y-4">
      <PhotoDropzone photos={photos} onAdd={addPhotos} onRemove={(i) => setPhotos((prev) => prev.filter((_, j) => j !== i))} />
      <button
        type="button"
        onClick={analyze}
        disabled={photos.length === 0}
        className="bg-red text-bg w-full rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        Analyser {photos.length} photo(s)
      </button>
    </div>
  );
}

function PhotoDropzone({
  photos, onAdd, onRemove,
}: { photos: File[]; onAdd: (files: FileList) => void; onRemove: (index: number) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div>
      <span className="text-text-muted text-xs">Photos ({photos.length}/{MAX_PHOTOS})</span>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
        }}
        className={`bg-surface-2 mt-1 flex cursor-pointer items-center justify-center rounded border border-dashed p-4 text-sm ${dragging ? 'border-red' : 'border-border'}`}
      >
        <input type="file" accept="image/*" multiple onChange={(e) => e.target.files && onAdd(e.target.files)} className="hidden" />
        <span className="text-text-muted flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Drop ou clic pour ajouter (max {MAX_PHOTOS})
        </span>
      </label>
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(p)} alt="" className="h-20 w-full rounded object-cover" />
              <button type="button" onClick={() => onRemove(i)} className="bg-surface absolute right-1 top-1 rounded p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
