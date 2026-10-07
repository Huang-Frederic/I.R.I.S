'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, Upload, X } from 'lucide-react';
import CameraCaptureOverlay from './CameraCaptureOverlay';

interface Props {
  photos: File[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (index: number) => void;
  max: number;
  /** Accessible name of the (hidden) file input. */
  inputLabel?: string;
  /** Thumbnail ratio — cards are portrait, items are any shape. */
  thumbClassName?: string;
}

/**
 * The scanner's photo picker: burst-capture button, a large dashed drop zone
 * that also opens the file dialog on click, and removable thumbnails. Shared
 * by the card scanner and the Items form.
 */
export default function PhotoDropzone({
  photos,
  onAdd,
  onRemove,
  max,
  inputLabel,
  thumbClassName = 'aspect-[3/4]',
}: Props) {
  const t = useTranslations('batchScanner');
  const [dragging, setDragging] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const remaining = max - photos.length;
  const previewUrls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);

  return (
    <div>
      <span className="text-text-muted text-xs">{t('photosLabel', { count: photos.length, max })}</span>
      <button
        type="button"
        onClick={() => setShowCamera(true)}
        disabled={remaining <= 0}
        className="bg-red text-bg mt-1 flex w-full items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        <Camera className="h-4 w-4" aria-hidden />
        {t('captureChain')}
      </button>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
        }}
        className={`bg-surface-2 mt-2 flex min-h-56 cursor-pointer flex-col items-center justify-center gap-2.5 rounded border border-dashed p-4 text-sm transition-colors ${
          dragging ? 'border-red' : 'border-border'
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          aria-label={inputLabel}
          onChange={(e) => {
            if (e.target.files) onAdd(e.target.files);
            // Lets the same file be picked again after removing it.
            e.target.value = '';
          }}
          className="hidden"
        />
        <span className="text-text-muted flex flex-col items-center gap-2 text-center">
          <Upload className="h-8 w-8" aria-hidden />
          {t('dropOrClickAdd', { max })}
        </span>
      </label>
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {previewUrls.map((url, i) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className={`${thumbClassName} w-full rounded object-cover`} />
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={t('photoRemove')}
                className="bg-surface absolute right-1 top-1 rounded p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {showCamera && (
        <CameraCaptureOverlay
          maxPhotos={remaining}
          onDone={(files) => {
            onAdd(files);
            setShowCamera(false);
          }}
          onCancel={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
