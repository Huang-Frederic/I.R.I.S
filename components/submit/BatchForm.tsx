'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { resizeImage } from '@/lib/utils/resize-image';
import CardScanForm from './CardScanForm';
import PhotoDropzone from './PhotoDropzone';
import type { OcrResult, EnrichResult } from '@/lib/types';

const MAX_PHOTOS = 30;

type Phase = 'pick' | 'analyzing' | 'review' | 'done';

interface PreparedPhoto {
  file: File;
  blob: Blob;
  ocr: OcrResult;
  enrich: EnrichResult;
}

interface SaveResult {
  filename: string;
  cardId: string | null;
  status: 'success' | 'skipped' | 'failed';
}

export default function BatchForm() {
  const t = useTranslations('batchScanner');
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('pick');
  const [photos, setPhotos] = useState<File[]>([]);
  const [prepared, setPrepared] = useState<PreparedPhoto[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<SaveResult[]>([]);
  // "Stamp Mode": seeds every reviewed card with the Stamp variant + Stock
  // destination (still editable per card). Kept for the whole batch.
  const [stampMode, setStampMode] = useState(false);

  function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .sort((a, b) => a.name.localeCompare(b.name));
    setPhotos((prev) => [...prev, ...arr].slice(0, MAX_PHOTOS));
  }

  async function analyze() {
    setPhase('analyzing');
    setProgress(0);
    const newPrepared: PreparedPhoto[] = new Array(photos.length);

    // Parallel OCR + enrich; bound concurrency at 5 to respect Gemini Tier 1 (15 req/min).
    const CONCURRENCY = 5;
    let cursor = 0;
    async function worker() {
      while (cursor < photos.length) {
        const i = cursor++;
        const file = photos[i];
        try {
          const blob = await resizeImage(file);
          const fd = new FormData();
          fd.append('image', blob, file.name);
          const ocrRes = await fetch('/api/ocr', { method: 'POST', body: fd });
          const ocr = (await ocrRes.json()) as OcrResult;
          const enrichRes = await fetch('/api/enrich', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              setPrefix: ocr.setCodeCandidate,
              setNumber: ocr.setNumberCandidate?.card,
              setTotal: ocr.setNumberCandidate?.total
                ? Number(ocr.setNumberCandidate.total)
                : null,
              language: ocr.language ?? 'JP',
              pokemonName: ocr.pokemonName,
              pokemonNameFr: ocr.pokemonNameFr,
              pokemonNameEn: ocr.pokemonNameEn,
              pokemonNumber: ocr.pokemonNumber,
              cardName: ocr.cardName,
              cardNameFr: ocr.cardNameFr,
              rarity: ocr.rarity,
              illustrator: ocr.illustrator,
            }),
          });
          const enrich = (await enrichRes.json()) as EnrichResult;
          newPrepared[i] = { file, blob, ocr, enrich };
        } catch {
          // Even if OCR/enrich fails for this photo, keep a slot so the user can fill manually.
          newPrepared[i] = {
            file,
            blob: file,  // fallback to original
            ocr: { text: '', confidence: 0, words: [], setNumberCandidate: null, setCodeCandidate: null },
            enrich: { bestMatch: null, candidates: [] },
          };
        } finally {
          setProgress((p) => p + 1);
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    setPrepared(newPrepared);
    setCurrentIndex(0);
    setPhase('review');
  }

  function handleSaved(cardId: string) {
    setResults((prev) => [
      ...prev,
      { filename: prepared[currentIndex].file.name, cardId, status: 'success' },
    ]);
    advance();
  }

  function handleCancelCurrent() {
    setResults((prev) => [
      ...prev,
      { filename: prepared[currentIndex].file.name, cardId: null, status: 'skipped' },
    ]);
    advance();
  }

  function advance() {
    const next = currentIndex + 1;
    if (next >= prepared.length) {
      setPhase('done');
    } else {
      setCurrentIndex(next);
    }
  }

  // RENDER
  if (phase === 'done') {
    const success = results.filter((r) => r.status === 'success').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    return (
      <div className="space-y-3">
        <h3 className="text-base font-semibold">{t('recapTitle')}</h3>
        <p className="text-sm">
          {t('recapSummary', { success, skipped, failed })}
        </p>
        <button
          type="button"
          onClick={() => router.push('/vinted')}
          className="bg-red text-bg rounded px-4 py-2 text-sm font-medium"
        >
          {t('viewResult')}
        </button>
        <button
          type="button"
          onClick={() => {
            setPhotos([]);
            setPrepared([]);
            setResults([]);
            setCurrentIndex(0);
            setPhase('pick');
          }}
          className="bg-surface-2 ml-2 rounded px-4 py-2 text-sm"
        >
          {t('newBatch')}
        </button>
      </div>
    );
  }

  if (phase === 'review') {
    const item = prepared[currentIndex];
    const total = prepared.length;
    return (
      <div className="space-y-4">
        <p className="text-text-muted text-xs">
          {t('currentItem', { index: currentIndex + 1, total, filename: item.file.name })}
        </p>
        <CardScanForm
          key={currentIndex}
          initialPhoto={item.blob}
          initialPhotoFilename={item.file.name}
          initialOcr={item.ocr}
          initialEnrich={item.enrich}
          onSaved={handleSaved}
          onCancel={handleCancelCurrent}
          stampMode={stampMode}
        />
      </div>
    );
  }

  if (phase === 'analyzing') {
    return (
      <div className="text-text-muted flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t('analyzing', { progress, total: photos.length })}
      </div>
    );
  }

  // phase === 'pick'
  return (
    <div className="space-y-4">
      <PhotoDropzone
        photos={photos}
        onAdd={addPhotos}
        onRemove={(i) => setPhotos((prev) => prev.filter((_, j) => j !== i))}
        max={MAX_PHOTOS}
      />
      <label className="border-border bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded border p-2.5 text-sm">
        <input
          type="checkbox"
          checked={stampMode}
          onChange={(e) => setStampMode(e.target.checked)}
          className="accent-red h-4 w-4 shrink-0"
        />
        <span className="font-medium">{t('stampMode')}</span>
        <span className="text-text-faint text-xs">{t('stampModeHint')}</span>
      </label>
      <button
        type="button"
        onClick={analyze}
        disabled={photos.length === 0}
        className="bg-red text-bg w-full rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {t('analyzeButton', { count: photos.length })}
      </button>
    </div>
  );
}
