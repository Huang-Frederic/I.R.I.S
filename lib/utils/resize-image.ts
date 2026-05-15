import piexif from 'piexifjs';

/**
 * Downscale + JPEG-encode a user-picked photo client-side before sending it
 * to /api/ocr or /api/cards. Vercel's request body limit (~4.5 MB on the free
 * tier) is the constraint — phone photos routinely run 5-12 MB raw.
 *
 * EXIF from the source File is preserved (Make/Model/DateTimeOriginal/lens/
 * exposure/GPS/MakerNotes…) so downstream consumers (Vinted post-process)
 * can re-emit a JPEG that still looks like an authentic phone capture. Only
 * PixelXDimension/PixelYDimension are rewritten to match the resized output,
 * and Orientation is forced to 1 because the browser already applies the
 * EXIF rotation when drawing to canvas.
 *
 * Returns a Blob (browser-only); throws if called outside a browser context.
 */
export async function resizeImage(
  file: File,
  options: { maxDim?: number; quality?: number } = {},
): Promise<Blob> {
  // 1400 is a tested middle ground: 1024 dropped 8/30 cards (set_code/set_number unreadable),
  // 1600 worked everywhere but burned more Gemini image tokens. 1400 ≈ -25% image tokens vs 1600.
  const { maxDim = 1400, quality = 0.85 } = options;
  if (typeof document === 'undefined') {
    throw new Error('resizeImage must run in the browser');
  }

  const sourceExif = await readExifSafe(file);

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const ratio = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
        'image/jpeg',
        quality,
      );
    });

    if (!sourceExif) return jpegBlob;
    return await reinjectExif(jpegBlob, sourceExif, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

/**
 * Returns the parsed EXIF object from a JPEG/HEIC File, or null if the file
 * has no EXIF, isn't a JPEG, or piexif rejects it. Never throws.
 */
async function readExifSafe(file: File): Promise<piexif.ExifDict | null> {
  if (!file.type.includes('jpeg') && !file.type.includes('jpg')) return null;
  try {
    const dataUrl = await fileToDataUrl(file);
    return piexif.load(dataUrl);
  } catch {
    return null;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

/**
 * Re-emit `jpegBlob` with the source EXIF preserved. Pixel dimensions are
 * updated to match the resized output and Orientation is forced to 1 since
 * the canvas pass already baked in the visual rotation.
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
    // If anything in the EXIF round-trip fails, fall back to the bare JPEG.
    return jpegBlob;
  }
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
