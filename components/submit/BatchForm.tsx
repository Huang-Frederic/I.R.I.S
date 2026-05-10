'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, Loader2, Camera } from 'lucide-react';
import { resizeImage } from '@/lib/utils/resize-image';
import CardScanForm from './CardScanForm';
import CameraCaptureOverlay from './CameraCaptureOverlay';
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
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('pick');
  const [photos, setPhotos] = useState<File[]>([]);
  const [prepared, setPrepared] = useState<PreparedPhoto[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<SaveResult[]>([]);

  function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
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
              text: ocr.text,
              setCode: ocr.setCodeCandidate,
              localId: ocr.setNumberCandidate?.card,
              language: ocr.language ?? 'JP',
              pokemonNumber: ocr.pokemonNumber,
              pokemonNameFr: ocr.pokemonNameFr,
              setName: ocr.setName,
              setNameFr: ocr.setNameFr,
              // Strategy 5 fallback inputs (Plan D++) + Strategy 2.5 illustrator
              cardName: ocr.cardName,
              pokemonName: ocr.pokemonName,
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
        <h3 className="text-base font-semibold">Récap du batch</h3>
        <p className="text-sm">
          {success} carte(s) enregistrée(s) · {skipped} ignorée(s) · {failed} échec(s)
        </p>
        <button
          type="button"
          onClick={() => router.push('/vinted')}
          className="bg-red text-bg rounded px-4 py-2 text-sm font-medium"
        >
          Voir le résultat
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
          Nouveau batch
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
          Carte {currentIndex + 1} / {total} ({item.file.name})
        </p>
        <CardScanForm
          key={currentIndex}
          initialPhoto={item.blob}
          initialPhotoFilename={item.file.name}
          initialOcr={item.ocr}
          initialEnrich={item.enrich}
          onSaved={handleSaved}
          onCancel={handleCancelCurrent}
        />
      </div>
    );
  }

  if (phase === 'analyzing') {
    return (
      <div className="text-text-muted flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Analyse en cours… {progress}/{photos.length}
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
}: { photos: File[]; onAdd: (files: FileList | File[]) => void; onRemove: (index: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const remaining = MAX_PHOTOS - photos.length;
  return (
    <div>
      <span className="text-text-muted text-xs">Photos ({photos.length}/{MAX_PHOTOS})</span>
      <button
        type="button"
        onClick={() => setShowCamera(true)}
        disabled={remaining <= 0}
        className="bg-red text-bg mt-1 flex w-full items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        <Camera className="h-4 w-4" aria-hidden />
        Capturer en chaîne
      </button>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
        }}
        className={`bg-surface-2 mt-2 flex cursor-pointer items-center justify-center rounded border border-dashed p-4 text-sm ${dragging ? 'border-red' : 'border-border'}`}
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
              <img src={URL.createObjectURL(p)} alt="" className="aspect-[3/4] w-full rounded object-cover" />
              <button type="button" onClick={() => onRemove(i)} className="bg-surface absolute right-1 top-1 rounded p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {showCamera && (
        <CameraCaptureOverlay
          maxPhotos={remaining}
          onDone={(files) => { onAdd(files); setShowCamera(false); }}
          onCancel={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
