// Browser-only canvas-based image post-processing for Vinted upload.
// Pipeline: light symmetric crop (≈3% per edge, jittered 2-4%) → JPEG
// recompress at quality 0.95 → preserve the source EXIF (Make/Model/
// DateTimeOriginal/lens/exposure/GPS/MakerNotes…) with PixelXDimension/
// PixelYDimension updated to the cropped dims and Orientation reset to 1.
//
// Goal: look like a screenshot or a lightly edited phone photo, NOT like a
// script-mangled image. No rotation, no synthetic noise, no per-channel
// colour shift, no fake EXIF — anything that would let a "naturalness"
// detector flag the upload.

import piexif from 'piexifjs';

const QUALITY = 0.95;
const CROP_MIN_RATIO = 0.02;
const CROP_MAX_RATIO = 0.04;

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randCropPx(dim: number): number {
  const min = Math.round(dim * CROP_MIN_RATIO);
  const max = Math.round(dim * CROP_MAX_RATIO);
  return randInt(min, max);
}

export interface ProcessedImage {
  blob: Blob;
  filename: string;
  /** Final dimensions after crop. */
  width: number;
  height: number;
  /** JPEG quality used (0-1). */
  quality: number;
}

/**
 * Loads `srcUrl` (any image), applies a light symmetric crop (~3% per edge),
 * recompresses as JPEG at quality 0.95, and re-injects the source EXIF if
 * any (with dimensions updated). Returns the resulting blob plus a neutral
 * filename. Throws if the image cannot be loaded or canvas encoding fails.
 */
export async function processImageForVinted(srcUrl: string): Promise<ProcessedImage> {
  const { img, sourceExif } = await loadImageWithExif(srcUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  const cropLeft = randCropPx(srcW);
  const cropRight = randCropPx(srcW);
  const cropTop = randCropPx(srcH);
  const cropBottom = randCropPx(srcH);
  const targetW = Math.max(1, srcW - cropLeft - cropRight);
  const targetH = Math.max(1, srcH - cropTop - cropBottom);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(img, cropLeft, cropTop, targetW, targetH, 0, 0, targetW, targetH);

  const rawBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      QUALITY,
    );
  });

  const blob = sourceExif
    ? await reinjectExif(rawBlob, sourceExif, targetW, targetH)
    : rawBlob;

  return {
    blob,
    filename: filenameFromExif(sourceExif),
    width: targetW,
    height: targetH,
    quality: QUALITY,
  };
}

/**
 * Fetch + decode `srcUrl`, returning both the decoded HTMLImageElement and
 * the parsed EXIF (or null if the source has none / isn't a JPEG / fetch is
 * CORS-blocked). Falls back to a direct image load if fetch fails — in that
 * case EXIF reads are unavailable but the crop+recompress still runs.
 */
async function loadImageWithExif(
  srcUrl: string,
): Promise<{ img: HTMLImageElement; sourceExif: piexif.ExifDict | null }> {
  try {
    const res = await fetch(srcUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const sourceExif = await readExifFromBlob(blob);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await loadImage(objectUrl);
      return { img, sourceExif };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    const img = await loadImage(srcUrl);
    return { img, sourceExif: null };
  }
}

async function readExifFromBlob(blob: Blob): Promise<piexif.ExifDict | null> {
  if (!blob.type.includes('jpeg') && !blob.type.includes('jpg')) return null;
  try {
    const dataUrl = await blobToBase64(blob);
    return piexif.load(dataUrl);
  } catch {
    return null;
  }
}

/**
 * Re-emit `jpegBlob` with the source EXIF preserved. Pixel dimensions are
 * updated to the post-crop output; Orientation is reset to 1 since the
 * canvas pass already baked in the visual rotation.
 */
async function reinjectExif(
  jpegBlob: Blob,
  exif: piexif.ExifDict,
  width: number,
  height: number,
): Promise<Blob> {
  try {
    const updated: piexif.ExifDict = {
      ...exif,
      '0th': { ...(exif['0th'] ?? {}), [piexif.ImageIFD.Orientation]: 1 },
      Exif: {
        ...(exif.Exif ?? {}),
        [piexif.ExifIFD.PixelXDimension]: width,
        [piexif.ExifIFD.PixelYDimension]: height,
      },
    };
    const exifBytes = piexif.dump(updated);
    const base64 = await blobToBase64(jpegBlob);
    const newBase64 = piexif.insert(exifBytes, base64);
    return base64ToBlob(newBase64, 'image/jpeg');
  } catch {
    return jpegBlob;
  }
}

/**
 * Generate a filename consistent with the EXIF Make if available, otherwise
 * fall back to a plain `IMG_NNNN.JPG`. We don't try to fake a phone identity
 * — the EXIF carries the real one.
 */
function filenameFromExif(exif: piexif.ExifDict | null): string {
  const make = exif?.['0th']?.[piexif.ImageIFD.Make];
  if (typeof make === 'string') {
    if (make === 'samsung' || make.toLowerCase() === 'samsung') {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const compact = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      return `${compact}.jpg`;
    }
    if (make === 'Google') {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const compact = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const ms = String(randInt(0, 999)).padStart(3, '0');
      return `PXL_${compact}${ms}.jpg`;
    }
  }
  return `IMG_${randInt(1000, 9999)}.JPG`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl: string, mime: string): Blob {
  const byteString = atob(dataUrl.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mime });
}

/** Trigger a browser download of a blob with the given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
