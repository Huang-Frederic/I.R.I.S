import type { CardLanguage } from '@/lib/types';

function detectLanguage(text: string): CardLanguage {
  // Last-resort sniff used only on the Vision-fallback path (no Gemini language
  // field available). Returns 'JP' when CJK characters are present, else 'EN'.
  // For accurate KO/FR/DE/IT/ES/PT/ZH, prefer `ocr.language` from Gemini.
  return /[぀-ゟ゠-ヿ一-龿]/.test(text) ? 'JP' : 'EN';
}

/**
 * Resolve the card's language from an OCR result. Prefers the explicit
 * `language` field from Gemini extraction (covers all 9 supported languages),
 * falls back to `detectLanguage` regex sniffing only when Gemini didn't set it
 * (Vision fallback path or legacy responses).
 */
export function resolveLanguage(ocr: { language?: CardLanguage; text: string }): CardLanguage {
  return ocr.language ?? detectLanguage(ocr.text);
}

/**
 * Format a card or Pokémon name for display when the printed language differs
 * from French. Catalog gives the French name (e.g. "Carapuce"); raw OCR gives
 * the on-card original (e.g. "ゼニガメ" / "Squirtle"). For non-FR cards we
 * surface both so the user can cross-check the photo at a glance.
 */
export function formatLocalizedName(
  frenchName: string | null | undefined,
  rawOriginal: string | null | undefined,
  language: CardLanguage,
): string {
  const fr = (frenchName ?? '').trim();
  const raw = (rawOriginal ?? '').trim();
  if (!fr) return raw;
  if (language === 'FR' || !raw) return fr;
  // Guard: if raw is already embedded in fr (server already applied bilingual
  // formatting), don't double-wrap — e.g. "Meloetta ex (メロエッタex)" + "メロエッタex".
  if (fr.toLowerCase().includes(raw.toLowerCase())) return fr;
  return `${fr} (${raw})`;
}
