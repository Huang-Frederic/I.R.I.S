import 'server-only';
import type { OcrResult } from '@/lib/types';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

interface VisionBlock {
  confidence?: number;
}
interface VisionPage {
  confidence?: number;
  blocks?: VisionBlock[];
}
interface VisionResponse {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
      pages?: VisionPage[];
    };
    error?: { message?: string };
  }>;
}

/**
 * Run Google Cloud Vision DOCUMENT_TEXT_DETECTION on a base64-encoded image.
 *
 * Why DOCUMENT_TEXT_DETECTION over TEXT_DETECTION: Pokémon cards are dense,
 * structured text (name + HP + attacks + set number) which fits the document
 * model. It also reliably returns confidence at the page level, whereas
 * TEXT_DETECTION often omits it for sparse-scene text.
 *
 * languageHints: ['ja', 'en'] biases the recognizer toward Japanese + Latin so
 * mixed-language cards (JP cards still print set codes in Latin) score better.
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
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['ja', 'en'] },
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
  const page = annotation?.pages?.[0];
  const confidence = extractConfidence(page);
  const words = text.split(/\s+/).filter(Boolean);

  return { text, confidence, words };
}

/**
 * Pages-level confidence is what we want, but if Vision omits it (rare with
 * DOCUMENT_TEXT_DETECTION but possible) fall back to averaging block-level
 * confidences. Default to 0 only if there's nothing usable at all.
 */
function extractConfidence(page: VisionPage | undefined): number {
  if (!page) return 0;
  if (typeof page.confidence === 'number' && page.confidence > 0) {
    return page.confidence;
  }
  const blockConfidences = (page.blocks ?? [])
    .map((b) => b.confidence)
    .filter((c): c is number => typeof c === 'number');
  if (blockConfidences.length === 0) return 0;
  return blockConfidences.reduce((sum, c) => sum + c, 0) / blockConfidences.length;
}
