// Browser-only canvas-based image post-processing for Vinted upload.
// Pipeline: random rotation ±0.3° → asymmetric crop 5-30px each edge →
// brightness/contrast shift ±5% → light gaussian noise → JPEG recompress
// at random quality 88-92 → fake EXIF injection → randomized filename.
// Designed to make re-uploaded images significantly less detectable by
// duplicate-detection / anti-fraud systems while keeping perceptual quality.

import piexif from 'piexifjs';

const QUALITY_MIN = 0.88;
const QUALITY_MAX = 0.92;
const CROP_MIN_PX = 5;
const CROP_MAX_PX = 30;
const ROTATION_MAX_DEG = 0.3;
const COLOR_FACTOR_MIN = 0.95;
const COLOR_FACTOR_MAX = 1.05;
const NOISE_AMPLITUDE = 2; // ±2 in 0-255
// Skip the per-pixel pass for very large images to keep the UI responsive.
const PIXEL_PASS_MAX_AREA = 2000 * 2000;

const FAKE_PHONE_MODELS: ReadonlyArray<{ Make: string; Model: string }> = [
  { Make: 'Apple', Model: 'iPhone 13' },
  { Make: 'Apple', Model: 'iPhone 14' },
  { Make: 'Apple', Model: 'iPhone 14 Pro' },
  { Make: 'Apple', Model: 'iPhone 15' },
  { Make: 'Apple', Model: 'iPhone 15 Pro' },
  { Make: 'samsung', Model: 'SM-S911B' }, // Galaxy S23
  { Make: 'samsung', Model: 'SM-S921B' }, // Galaxy S24
  { Make: 'Google', Model: 'Pixel 7' },
  { Make: 'Google', Model: 'Pixel 8' },
];

const FAKE_SOFTWARES: ReadonlyArray<string> = [
  'Camera 1.0',
  '17.5.1',
  '17.6',
  '14.0',
  'PixelCamera 1.0',
];

/** Inclusive int between min and max. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random JPEG quality in [QUALITY_MIN, QUALITY_MAX]. */
function randQuality(): number {
  return QUALITY_MIN + Math.random() * (QUALITY_MAX - QUALITY_MIN);
}

/** Random rotation in degrees in [-ROTATION_MAX_DEG, +ROTATION_MAX_DEG]. */
function randRotationDeg(): number {
  return (Math.random() - 0.5) * 2 * ROTATION_MAX_DEG;
}

/** Random per-channel multiplicative factor in [COLOR_FACTOR_MIN, COLOR_FACTOR_MAX]. */
function randColorFactor(): number {
  return COLOR_FACTOR_MIN + Math.random() * (COLOR_FACTOR_MAX - COLOR_FACTOR_MIN);
}

/** `IMG_<8 base36 chars>.jpg` */
function randFilename(): string {
  const chars = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `IMG_${chars.toUpperCase()}.jpg`;
}

function pickRandom<T>(arr: ReadonlyArray<T>): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** EXIF format: "YYYY:MM:DD HH:MM:SS", random within the last week. */
function fakeRecentDate(): string {
  const daysBack = Math.floor(Math.random() * 7);
  const d = new Date(Date.now() - daysBack * 86_400_000 - Math.random() * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
 * Loads `srcUrl` (any image), applies a random rotation + asymmetric crop +
 * brightness/contrast shift + light gaussian noise, recompresses as JPEG at a
 * random quality, then injects randomized fake EXIF metadata. Returns the
 * resulting blob + a randomized filename. Throws if the image cannot be
 * loaded or canvas encoding fails.
 */
export async function processImageForVinted(srcUrl: string): Promise<ProcessedImage> {
  const img = await loadImage(srcUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  // 1. Rotate around the center on an expanded canvas to avoid clipping.
  const rotationDeg = randRotationDeg();
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rotationRad));
  const sinA = Math.abs(Math.sin(rotationRad));
  const rotatedW = Math.ceil(srcW * cosA + srcH * sinA);
  const rotatedH = Math.ceil(srcW * sinA + srcH * cosA);

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotatedW;
  rotCanvas.height = rotatedH;
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) throw new Error('canvas 2d context unavailable');
  rotCtx.translate(rotatedW / 2, rotatedH / 2);
  rotCtx.rotate(rotationRad);
  rotCtx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);

  // 2. Asymmetric crop. Take from the rotated bounds so any rotation-induced
  // transparent corners get trimmed off (CROP_MIN_PX of 5 covers small angles).
  const cropTop = randInt(CROP_MIN_PX, CROP_MAX_PX);
  const cropRight = randInt(CROP_MIN_PX, CROP_MAX_PX);
  const cropBottom = randInt(CROP_MIN_PX, CROP_MAX_PX);
  const cropLeft = randInt(CROP_MIN_PX, CROP_MAX_PX);

  const targetW = Math.max(1, rotatedW - cropLeft - cropRight);
  const targetH = Math.max(1, rotatedH - cropTop - cropBottom);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(
    rotCanvas,
    cropLeft,
    cropTop,
    targetW,
    targetH,
    0,
    0,
    targetW,
    targetH,
  );

  // 3 + 4. Brightness/contrast shift + light noise in a single pixel pass.
  // Skip the pass for very large images to keep perf acceptable.
  if (targetW * targetH <= PIXEL_PASS_MAX_AREA) {
    applyColorAndNoise(ctx, targetW, targetH);
  }

  // 5. Encode as JPEG at random quality.
  const quality = randQuality();
  const rawBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      quality,
    );
  });

  // 6. Inject randomized fake EXIF so the file looks like a fresh phone shot.
  let blob: Blob;
  try {
    blob = await injectFakeExif(rawBlob, targetW, targetH);
  } catch {
    // If EXIF injection fails for any reason, fall back to the raw JPEG —
    // the canvas randomization alone is still valuable.
    blob = rawBlob;
  }

  return { blob, filename: randFilename(), width: targetW, height: targetH, quality };
}

/**
 * Multiply each RGB channel by a random per-channel factor in
 * [COLOR_FACTOR_MIN, COLOR_FACTOR_MAX] then add uniform noise in
 * [-NOISE_AMPLITUDE, +NOISE_AMPLITUDE]. Single getImageData/putImageData pass.
 */
function applyColorAndNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const factorR = randColorFactor();
  const factorG = randColorFactor();
  const factorB = randColorFactor();
  const noiseRange = NOISE_AMPLITUDE * 2 + 1;
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    // CORS-tainted canvas — skip the pixel pass silently.
    return;
  }
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] * factorR + (Math.floor(Math.random() * noiseRange) - NOISE_AMPLITUDE);
    const g = data[i + 1] * factorG + (Math.floor(Math.random() * noiseRange) - NOISE_AMPLITUDE);
    const b = data[i + 2] * factorB + (Math.floor(Math.random() * noiseRange) - NOISE_AMPLITUDE);
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    // alpha stays untouched
  }
  ctx.putImageData(imageData, 0, 0);
}

/** Insert randomized fake EXIF into a JPEG blob and return a new blob. */
async function injectFakeExif(jpegBlob: Blob, width: number, height: number): Promise<Blob> {
  const phone = pickRandom(FAKE_PHONE_MODELS);
  const software = pickRandom(FAKE_SOFTWARES);
  const dateTaken = fakeRecentDate();

  const exifObj = {
    '0th': {
      [piexif.ImageIFD.Make]: phone.Make,
      [piexif.ImageIFD.Model]: phone.Model,
      [piexif.ImageIFD.Software]: software,
      [piexif.ImageIFD.Orientation]: 1,
      [piexif.ImageIFD.XResolution]: [72, 1],
      [piexif.ImageIFD.YResolution]: [72, 1],
      [piexif.ImageIFD.ResolutionUnit]: 2,
      [piexif.ImageIFD.DateTime]: dateTaken,
    },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: dateTaken,
      [piexif.ExifIFD.DateTimeDigitized]: dateTaken,
      [piexif.ExifIFD.PixelXDimension]: width,
      [piexif.ExifIFD.PixelYDimension]: height,
      [piexif.ExifIFD.ColorSpace]: 1,
      [piexif.ExifIFD.ExifVersion]: '0230',
    },
    GPS: {},
    Interop: {},
    '1st': {},
    thumbnail: undefined,
  };

  const exifBytes = piexif.dump(exifObj);
  const base64 = await blobToBase64(jpegBlob);
  const newBase64 = piexif.insert(exifBytes, base64);
  return base64ToBlob(newBase64, 'image/jpeg');
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
