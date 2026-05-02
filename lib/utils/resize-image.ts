/**
 * Downscale + JPEG-encode a user-picked photo client-side before sending it
 * to /api/ocr or /api/cards. Vercel's request body limit (~4.5 MB on the free
 * tier) is the constraint — phone photos routinely run 5-12 MB raw.
 *
 * Returns a Blob (browser-only); throws if called outside a browser context.
 */
export async function resizeImage(
  file: File,
  options: { maxDim?: number; quality?: number } = {},
): Promise<Blob> {
  const { maxDim = 1024, quality = 0.85 } = options;
  if (typeof document === 'undefined') {
    throw new Error('resizeImage must run in the browser');
  }

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

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
        'image/jpeg',
        quality,
      );
    });
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
