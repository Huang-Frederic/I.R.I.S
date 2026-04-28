/**
 * Inspect OCR output for a single image — dumps full text and bounding-boxed
 * words so we can see what Vision actually returned.
 *
 * Usage: npx tsx scripts/inspect-ocr.ts cards_assets/bw5_009_r.jpg
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function main() {
  const filepath = process.argv[2];
  if (!filepath) {
    console.error('Usage: npx tsx scripts/inspect-ocr.ts <image-path>');
    process.exit(1);
  }

  const buf = await sharp(filepath)
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const base64 = buf.toString('base64');

  const apiKey = process.env.GOOGLE_VISION_API_KEY!;
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['ja', 'en'] },
        },
      ],
    }),
  });
  interface VisionVertex { x?: number; y?: number }
  interface VisionWord {
    symbols?: { text?: string }[];
    boundingBox?: { vertices?: VisionVertex[] };
  }
  interface VisionBlock { paragraphs?: { words?: VisionWord[] }[] }
  interface VisionPage { width?: number; height?: number; blocks?: VisionBlock[] }
  interface VisionResponse {
    responses?: { fullTextAnnotation?: { text?: string; pages?: VisionPage[] } }[];
  }

  const data = (await res.json()) as VisionResponse;
  const ann = data.responses?.[0]?.fullTextAnnotation;

  console.log('=== FULL TEXT ===');
  console.log(ann?.text ?? '(none)');
  console.log('\n=== WORDS (bottom 30%, sorted by y desc) ===');
  const page = ann?.pages?.[0];
  const pw = page?.width ?? 1;
  const ph = page?.height ?? 1;
  const words: { text: string; x: number; y: number }[] = [];
  for (const block of page?.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const word of para.words ?? []) {
        const text = (word.symbols ?? []).map((s) => s.text ?? '').join('').trim();
        if (!text) continue;
        const v = word.boundingBox?.vertices ?? [];
        if (!v.length) continue;
        const minY = Math.min(...v.map((p) => p.y ?? 0));
        const minX = Math.min(...v.map((p) => p.x ?? 0));
        words.push({ text, x: minX / pw, y: minY / ph });
      }
    }
  }
  const footer = words.filter((w) => w.y > 0.7).sort((a, b) => b.y - a.y);
  for (const w of footer) {
    console.log(`  y=${w.y.toFixed(2)} x=${w.x.toFixed(2)}  "${w.text}"`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
