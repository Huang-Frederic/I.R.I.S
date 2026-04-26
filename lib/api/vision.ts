import 'server-only';
import type { OcrResult } from '@/lib/types';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

interface VisionResponse {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
      pages?: Array<{ confidence?: number }>;
    };
    error?: { message?: string };
  }>;
}

/**
 * Run Google Cloud Vision TEXT_DETECTION on a base64-encoded image.
 * Used by /api/ocr to extract raw text + a page-level confidence score.
 */
export async function detectText(base64Image: string): Promise<OcrResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY is not set');

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vision API ${response.status}: ${body}`);
  }

  const data = (await response.json()) as VisionResponse;
  const first = data.responses?.[0];

  if (first?.error?.message) {
    throw new Error(`Vision API: ${first.error.message}`);
  }

  const annotation = first?.fullTextAnnotation;
  const text = annotation?.text ?? '';
  const confidence = annotation?.pages?.[0]?.confidence ?? 0;
  const words = text.split(/\s+/).filter(Boolean);

  return { text, confidence, words };
}
