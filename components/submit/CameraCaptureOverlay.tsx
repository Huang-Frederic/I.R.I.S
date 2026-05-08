'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const SHUTTER_QUALITY = 0.92;

type CapturedPhoto = { blob: Blob; previewUrl: string };

type Props = {
  onDone: (files: File[]) => void;
  onCancel: () => void;
  maxPhotos?: number;
};

export default function CameraCaptureOverlay({
  onDone,
  onCancel,
  maxPhotos = 30,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<CapturedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Navigateur non compatible avec la caméra.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            aspectRatio: { ideal: 3 / 4 },
            width: { ideal: 1440 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('Accès caméra refusé. Autorise dans les paramètres du navigateur.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('Aucune caméra détectée.');
        } else {
          setError("Impossible d'accéder à la caméra.");
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      captured.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleShutter() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (captured.length >= maxPhotos) return;
    if (!video.videoWidth || !video.videoHeight) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCaptured((prev) => [
          ...prev,
          { blob, previewUrl: URL.createObjectURL(blob) },
        ]);
      },
      'image/jpeg',
      SHUTTER_QUALITY,
    );
  }

  function handleRemove(index: number) {
    setCaptured((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleDone() {
    const baseTs = Date.now();
    const files = captured.map(
      (c, i) =>
        new File([c.blob], `capture-${baseTs}-${i}.jpg`, { type: 'image/jpeg' }),
    );
    captured.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    onDone(files);
  }

  function handleCancel() {
    captured.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between bg-black/80 px-4 py-3 text-white">
        <button
          type="button"
          onClick={handleCancel}
          className="p-2"
          aria-label="Fermer la caméra"
        >
          <X className="h-6 w-6" />
        </button>
        <h2 className="text-base font-medium">Capture en chaîne</h2>
        <button
          type="button"
          onClick={handleDone}
          disabled={captured.length === 0}
          className="bg-red text-bg rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
          aria-label={`Valider ${captured.length} photos`}
        >
          Done ({captured.length})
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <p className="text-sm">{error}</p>
            <button
              type="button"
              onClick={handleCancel}
              className="bg-surface-2 rounded px-4 py-2 text-sm"
            >
              Annuler
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="border-red aspect-[5/7] h-[75%] rounded-lg border-2 opacity-80" />
            </div>
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {!error && (
        <div className="flex flex-col gap-3 bg-black/80 px-4 py-4">
          {captured.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-2 overflow-x-auto">
                {captured.map((photo, i) => (
                  <div
                    key={photo.previewUrl}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded border-2 border-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemove(i)}
                      aria-label={`Supprimer la photo ${i + 1}`}
                      className="bg-black/70 absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <span className="shrink-0 text-xs text-white">
                {captured.length} / {maxPhotos}
              </span>
            </div>
          )}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleShutter}
              disabled={captured.length >= maxPhotos}
              className="h-20 w-20 rounded-full border-4 border-black bg-white shadow-lg disabled:opacity-40"
              aria-label="Prendre une photo"
            />
          </div>
          {captured.length >= maxPhotos && (
            <p className="text-center text-xs text-white">Limite atteinte</p>
          )}
        </div>
      )}
    </div>
  );
}
