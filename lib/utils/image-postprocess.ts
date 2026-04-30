// Browser-only canvas-based image post-processing for Vinted upload.
// Tweaks: random crop 2-5px each edge + JPEG recompression at random quality
// 88-92 + randomized filename. EXIF is naturally stripped by canvas.

const QUALITY_MIN = 0.88;
const QUALITY_MAX = 0.92;
const CROP_MIN_PX = 2;
const CROP_MAX_PX = 5;

/** Inclusive int between min and max. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random JPEG quality in [QUALITY_MIN, QUALITY_MAX]. */
function randQuality(): number {
  return QUALITY_MIN + Math.random() * (QUALITY_MAX - QUALITY_MIN);
}

/** `IMG_<8 base36 chars>.jpg` */
function randFilename(): string {
  const chars = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `IMG_${chars.toUpperCase()}.jpg`;
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
 * Loads `srcUrl` (any image), applies a small random crop on each edge,
 * recompresses as JPEG at a random quality, and returns the resulting blob
 * + a randomized filename. Throws if the image cannot be loaded or canvas
 * encoding fails.
 */
export async function processImageForVinted(srcUrl: string): Promise<ProcessedImage> {
  const img = await loadImage(srcUrl);
  const cropTop = randInt(CROP_MIN_PX, CROP_MAX_PX);
  const cropRight = randInt(CROP_MIN_PX, CROP_MAX_PX);
  const cropBottom = randInt(CROP_MIN_PX, CROP_MAX_PX);
  const cropLeft = randInt(CROP_MIN_PX, CROP_MAX_PX);

  const targetW = Math.max(1, img.naturalWidth - cropLeft - cropRight);
  const targetH = Math.max(1, img.naturalHeight - cropTop - cropBottom);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  ctx.drawImage(
    img,
    cropLeft, cropTop, targetW, targetH,
    0, 0, targetW, targetH,
  );

  const quality = randQuality();
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      quality,
    );
  });

  return { blob, filename: randFilename(), width: targetW, height: targetH, quality };
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

/** Trigger a browser download of a blob with the given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the browser can start the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
