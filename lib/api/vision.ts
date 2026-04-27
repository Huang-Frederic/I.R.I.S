import 'server-only';
import type { OcrResult, WordAnnotation } from '@/lib/types';
import {
  findSetCodeCandidate,
  findSetNumberCandidate,
} from '@/lib/utils/extract-from-words';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

interface VisionVertex {
  x?: number;
  y?: number;
}
interface VisionBoundingBox {
  vertices?: VisionVertex[];
  normalizedVertices?: VisionVertex[];
}
interface VisionSymbol {
  text?: string;
  confidence?: number;
}
interface VisionWord {
  symbols?: VisionSymbol[];
  confidence?: number;
  boundingBox?: VisionBoundingBox;
}
interface VisionParagraph {
  words?: VisionWord[];
}
interface VisionBlock {
  paragraphs?: VisionParagraph[];
  confidence?: number;
}
interface VisionPage {
  width?: number;
  height?: number;
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
 * Run Google Cloud Vision DOCUMENT_TEXT_DETECTION on a base64-encoded image and
 * return everything downstream needs: the raw text + a per-word position map +
 * smart-extracted candidates (set number, set code) for the form to pre-fill.
 *
 * Why DOCUMENT_TEXT_DETECTION over TEXT_DETECTION: Pokémon cards are dense,
 * structured text and the document model returns reliable confidence + the
 * full Page→Block→Paragraph→Word→Symbol hierarchy we need for bounding boxes.
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
  const words = page ? extractWords(page) : [];
  const setNumberCandidate = findSetNumberCandidate(words);
  const setCodeCandidate = findSetCodeCandidate(words, setNumberCandidate?.raw ?? null);

  return { text, confidence, words, setNumberCandidate, setCodeCandidate };
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

/**
 * Walk the Vision response tree and project each word's bounding box into
 * page-normalized [0, 1] coordinates. The smart extractors only ever see this
 * pre-digested shape so they can stay pure / tested without touching Vision.
 */
function extractWords(page: VisionPage): WordAnnotation[] {
  const pageW = page.width ?? 0;
  const pageH = page.height ?? 0;
  if (pageW === 0 || pageH === 0) return [];

  const out: WordAnnotation[] = [];
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const word of para.words ?? []) {
        const text = (word.symbols ?? [])
          .map((s) => s.text ?? '')
          .join('')
          .trim();
        if (!text) continue;

        const box = word.boundingBox;
        const vertices = box?.vertices ?? [];
        if (vertices.length === 0) continue;

        const xs = vertices.map((v) => v.x ?? 0);
        const ys = vertices.map((v) => v.y ?? 0);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        out.push({
          text,
          x: minX / pageW,
          y: minY / pageH,
          width: (maxX - minX) / pageW,
          height: (maxY - minY) / pageH,
          confidence: word.confidence ?? 0,
        });
      }
    }
  }
  return out;
}
