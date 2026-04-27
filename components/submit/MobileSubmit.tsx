'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ScanLine, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type {
  CardCondition,
  CardLanguage,
  CardRarity,
  CardStatus,
  EnrichResult,
  OcrResult,
} from '@/lib/types';
import {
  actionToStatus,
  type SuggestionResult,
} from '@/lib/utils/pokedex-suggestion';
import { resizeImage } from '@/lib/utils/resize-image';
import ScanSuggestion from '@/components/cards/ScanSuggestion';

const LANGUAGES: CardLanguage[] = ['JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH'];
const CONDITIONS: CardCondition[] = ['NM', 'EX', 'GD', 'PL', 'PO'];
const STATUSES: { value: CardStatus; label: string }[] = [
  { value: 'for_sale', label: 'Vinted' },
  { value: 'pokedex', label: 'Pokédex' },
  { value: 'collection', label: 'Collection' },
];
const RARITIES: { value: CardRarity; label: string }[] = [
  { value: 'SAR', label: 'SAR — Special Art' },
  { value: 'AR', label: 'AR — Art Rare' },
  { value: 'SR', label: 'SR — Super Rare' },
  { value: 'CHR', label: 'CHR — Character Rare' },
  { value: 'RR', label: 'RR — Double Rare' },
  { value: 'R_HOLO', label: 'R Holo' },
  { value: 'R', label: 'R — Rare' },
  { value: 'UC', label: 'UC — Uncommon' },
  { value: 'C', label: 'C — Common' },
  { value: 'OTHER', label: 'Autre / inconnue' },
];

type Phase = 'idle' | 'scanning' | 'reviewing' | 'saving' | 'success' | 'error';

interface FormFields {
  pokemon_name: string;
  pokemon_number: string;
  card_name: string;
  card_id_tcg: string;
  set_name: string;
  set_code: string;
  set_number: string;
  tcg_image_url: string;
  language: CardLanguage;
  rarity: CardRarity;
  condition: CardCondition;
  status: CardStatus;
  notes: string;
  /* Pricing — hidden from the user, populated by enrichment when available. */
  cardmarket_id: string;
  cm_price_low: string;
  cm_price_trend: string;
  cm_price_avg: string;
}

const EMPTY: FormFields = {
  pokemon_name: '',
  pokemon_number: '',
  card_name: '',
  card_id_tcg: '',
  set_name: '',
  set_code: '',
  set_number: '',
  tcg_image_url: '',
  language: 'EN',
  rarity: 'OTHER',
  condition: 'NM',
  status: 'for_sale',
  notes: '',
  cardmarket_id: '',
  cm_price_low: '',
  cm_price_trend: '',
  cm_price_avg: '',
};

const CONFIDENCE_THRESHOLD = 0.8;

function detectLanguage(text: string): CardLanguage {
  // Match Hiragana, Katakana, or CJK ideographs.
  return /[぀-ゟ゠-ヿ一-龿]/.test(text) ? 'JP' : 'EN';
}

export default function MobileSubmit() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [form, setForm] = useState<FormFields>(EMPTY);
  const [confidence, setConfidence] = useState<number>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [enrichFound, setEnrichFound] = useState<boolean>(true);
  const [researching, setResearching] = useState(false);
  const [researchMsg, setResearchMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPhotoBlob(null);
    setForm(EMPTY);
    setConfidence(1);
    setErrorMsg(null);
    setSuggestion(null);
    setOcrText('');
    setEnrichFound(true);
    setResearching(false);
    setResearchMsg(null);
    setPhase('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  /**
   * Pull the suggestion engine's verdict for a given pokemon. Used after the
   * initial enrichment AND after a manual re-search so the displayed
   * recommendation always matches the current form values.
   */
  async function fetchSuggestion(input: {
    pokemon_number: number;
    pokemon_name: string;
    rarity: CardRarity;
    language: CardLanguage;
  }): Promise<SuggestionResult | null> {
    try {
      const res = await fetch('/api/pokedex/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      return (await res.json()) as SuggestionResult;
    } catch {
      return null;
    }
  }

  /**
   * Re-trigger enrichment using what the user has typed.
   *
   * Two paths inside /api/enrich:
   *   - If both set_code and set_number are filled, we send {setCode, localId,
   *     language} → TCGdex direct lookup (covers JP, includes Cardmarket prices).
   *   - Otherwise we send {text} → pokemontcg.io text-based search.
   *
   * On match, identity fields are overwritten but language/condition are kept —
   * the user knows the actual printing better than the API does.
   */
  async function handleResearch() {
    const setCode = form.set_code.trim();
    const setNumber = form.set_number.trim();
    const fallbackText = setNumber || form.card_name.trim();

    if (!setCode && !fallbackText) {
      setResearchMsg('Renseigne au moins un n° de set (ex. 136/174) avant de relancer.');
      return;
    }

    const useDirect = setCode.length > 0 && setNumber.length > 0;
    const body = useDirect
      ? { setCode, localId: setNumber, language: form.language }
      : { text: fallbackText };

    setResearching(true);
    setResearchMsg(null);
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Recherche TCG échouée (${res.status})`);
      }
      const enrich = (await res.json()) as EnrichResult;
      const match = enrich.bestMatch;

      if (!match) {
        setEnrichFound(false);
        setResearchMsg(
          useDirect
            ? `Carte ${setCode}-${setNumber} introuvable dans TCGdex (${form.language}). Continue à la main.`
            : 'Aucune carte trouvée. Continue à la main.',
        );
        return;
      }

      setEnrichFound(true);
      const priceNote =
        match.cm_price_trend != null
          ? ` Prix CM trend : ${match.cm_price_trend.toFixed(2)} €.`
          : '';
      setResearchMsg(`Champs mis à jour depuis ${useDirect ? 'TCGdex' : 'TCG API'}.${priceNote}`);
      setForm((prev) => ({
        ...prev,
        pokemon_name: match.pokemon_name,
        pokemon_number: match.pokemon_number?.toString() ?? prev.pokemon_number,
        card_name: match.card_name,
        card_id_tcg: match.card_id_tcg,
        set_name: match.set_name,
        set_code: match.set_code,
        set_number: match.set_number,
        tcg_image_url: match.tcg_image_url,
        rarity: match.rarity,
        cardmarket_id: match.cardmarket_id ?? '',
        cm_price_low: match.cm_price_low != null ? String(match.cm_price_low) : '',
        cm_price_trend: match.cm_price_trend != null ? String(match.cm_price_trend) : '',
        cm_price_avg: match.cm_price_avg != null ? String(match.cm_price_avg) : '',
        // Keep prev.language / prev.condition — user knows their printing better.
      }));

      if (match.pokemon_number) {
        const next = await fetchSuggestion({
          pokemon_number: match.pokemon_number,
          pokemon_name: match.pokemon_name,
          rarity: match.rarity,
          language: form.language,
        });
        setSuggestion(next);
        if (next) {
          setForm((prev) => ({ ...prev, status: actionToStatus(next.primaryAction) }));
        }
      }
    } catch (err) {
      setResearchMsg(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setResearching(false);
    }
  }

  function update<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFile(file: File) {
    setPhase('scanning');
    setErrorMsg(null);
    try {
      const blob = await resizeImage(file);
      setPhotoBlob(blob);
      const preview = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(preview);

      const ocrForm = new FormData();
      ocrForm.append('image', blob, 'card.jpg');
      const ocrRes = await fetch('/api/ocr', { method: 'POST', body: ocrForm });
      if (!ocrRes.ok) {
        throw new Error(`OCR a échoué (${ocrRes.status})`);
      }
      const ocr = (await ocrRes.json()) as OcrResult;
      setConfidence(ocr.confidence);
      setOcrText(ocr.text);

      // Smart extraction: if Vision pinned the set number / set code in the
      // bottom-left footer, pre-fill them and prefer a TCGdex direct lookup over
      // the noisy text-based path. Direct lookup needs both candidates AND a
      // language guess.
      const language = detectLanguage(ocr.text);
      const setNumber = ocr.setNumberCandidate?.raw ?? '';
      const setCode = ocr.setCodeCandidate ?? '';

      const enrichBody =
        setCode && setNumber
          ? { setCode, localId: ocr.setNumberCandidate!.card, language }
          : { text: ocr.text };

      const enrichRes = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrichBody),
      });
      if (!enrichRes.ok) {
        throw new Error(`Enrichissement a échoué (${enrichRes.status})`);
      }
      const enrich = (await enrichRes.json()) as EnrichResult;
      setEnrichFound(enrich.bestMatch !== null);

      // If TCGdex / TCG API found something, prefer its data (authoritative).
      // Otherwise keep what the OCR extracted so the user has a starting point.
      const match = enrich.bestMatch;
      const prefill: FormFields = {
        ...EMPTY,
        language,
        pokemon_name: match?.pokemon_name ?? '',
        pokemon_number: match?.pokemon_number?.toString() ?? '',
        card_name: match?.card_name ?? '',
        card_id_tcg: match?.card_id_tcg ?? '',
        set_name: match?.set_name ?? '',
        set_code: match?.set_code ?? setCode,
        set_number: match?.set_number ?? setNumber,
        tcg_image_url: match?.tcg_image_url ?? '',
        rarity: match?.rarity ?? 'OTHER',
        cardmarket_id: match?.cardmarket_id ?? '',
        cm_price_low: match?.cm_price_low != null ? String(match.cm_price_low) : '',
        cm_price_trend: match?.cm_price_trend != null ? String(match.cm_price_trend) : '',
        cm_price_avg: match?.cm_price_avg != null ? String(match.cm_price_avg) : '',
      };

      // Ask the suggestion engine where this card should land. Failure is non-fatal —
      // the user can still pick the destination manually if the endpoint errors.
      let nextSuggestion: SuggestionResult | null = null;
      if (match?.pokemon_number) {
        nextSuggestion = await fetchSuggestion({
          pokemon_number: match.pokemon_number,
          pokemon_name: match.pokemon_name,
          rarity: prefill.rarity,
          language: prefill.language,
        });
        if (nextSuggestion) {
          prefill.status = actionToStatus(nextSuggestion.primaryAction);
        }
      }

      setForm(prefill);
      setSuggestion(nextSuggestion);
      setPhase('reviewing');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue');
      setPhase('error');
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase('saving');
    setErrorMsg(null);
    try {
      // If the user wants to take over the Pokédex slot AND a card is already there,
      // we can't insert directly with status='pokedex' — the partial unique index
      // would block it. Insert with status='for_sale' first, then call the atomic
      // RPC to swap the existing card out and the new one in.
      const wantsToReplace =
        form.status === 'pokedex' && suggestion?.type === 'can_replace' && !!suggestion.existingCard;
      const insertStatus: CardStatus = wantsToReplace ? 'for_sale' : form.status;

      const data = new FormData();
      if (photoBlob) data.append('image', photoBlob, 'card.jpg');
      for (const [key, value] of Object.entries(form)) {
        if (key === 'status') continue;
        if (value !== '' && value !== null && value !== undefined) {
          data.append(key, String(value));
        }
      }
      data.append('status', insertStatus);

      const res = await fetch('/api/cards', { method: 'POST', body: data });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Enregistrement a échoué (${res.status})`);
      }

      if (wantsToReplace && suggestion?.existingCard) {
        const inserted = (await res.json()) as { card: { id: string } };
        const swap = await fetch('/api/pokedex/replace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            old_card_id: suggestion.existingCard.id,
            old_new_status: 'for_sale',
            new_card_id: inserted.card.id,
          }),
        });
        if (!swap.ok) {
          const body = (await swap.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Remplacement Pokédex a échoué (${swap.status})`);
        }
      }

      setPhase('success');
      setTimeout(reset, 1800);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue');
      setPhase('error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {phase === 'idle' && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="bg-surface border-border hover:border-red flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors"
        >
          <ScanLine className="text-red h-10 w-10" aria-hidden />
          <span className="text-sm font-medium">Scanner une carte</span>
          <span className="text-text-muted text-xs">Photo ou fichier image</span>
        </button>
      )}

      {phase === 'scanning' && (
        <div className="bg-surface border-border flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border">
          <div className="border-red border-t-transparent h-8 w-8 animate-spin rounded-full border-2" />
          <p className="text-sm">Analyse OCR + enrichissement…</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="bg-red-bg text-red flex items-center gap-3 rounded-lg p-4">
          <XCircle className="h-5 w-5 shrink-0" aria-hidden />
          <p className="flex-1 text-sm">{errorMsg ?? 'Une erreur est survenue.'}</p>
          <button
            type="button"
            onClick={reset}
            className="border-red rounded border px-3 py-1 text-xs font-medium"
          >
            Recommencer
          </button>
        </div>
      )}

      {(phase === 'reviewing' || phase === 'saving' || phase === 'success') && previewUrl && (
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          {suggestion && <ScanSuggestion result={suggestion} />}

          {!enrichFound && (
            <div className="border-rarity-ar bg-rarity-ar/10 text-rarity-ar rounded-lg border p-3 text-xs">
              Aucun match TCG API — soit le numéro de set n&apos;a pas été lu, soit la carte n&apos;est
              pas indexée (sets JP récents notamment). Le texte OCR ci-dessous t&apos;aidera à
              compléter manuellement.
            </div>
          )}

          {ocrText && (
            <details className="bg-surface-2 border-border rounded border text-xs">
              <summary className="text-text-muted cursor-pointer select-none px-3 py-2">
                Texte OCR détecté ({ocrText.length} caractères)
              </summary>
              <pre className="text-text border-border max-h-48 overflow-auto whitespace-pre-wrap border-t px-3 py-2 font-mono">
                {ocrText}
              </pre>
            </details>
          )}

          <div className="flex gap-4">
            <div className="bg-surface-2 relative h-44 w-32 shrink-0 overflow-hidden rounded">
              <Image src={previewUrl} alt="Preview" fill className="object-cover" unoptimized />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {confidence < CONFIDENCE_THRESHOLD ? (
                <div className="text-rarity-ar bg-surface-2 flex items-start gap-2 rounded p-3 text-xs">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    Confiance OCR faible ({Math.round(confidence * 100)}%) — vérifie les champs avant
                    d&apos;enregistrer.
                  </span>
                </div>
              ) : (
                <div className="text-rarity-r bg-surface-2 flex items-start gap-2 rounded p-3 text-xs">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>OCR fiable ({Math.round(confidence * 100)}%).</span>
                </div>
              )}
              {form.tcg_image_url && (
                <p className="text-text-faint text-xs font-mono">
                  TCG match : <span className="text-text-muted">{form.card_id_tcg}</span>
                </p>
              )}
            </div>
          </div>

          <Field label="Nom du Pokémon">
            <Input value={form.pokemon_name} onChange={(v) => update('pokemon_name', v)} required />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="N° National">
              <Input
                type="number"
                min={1}
                max={1025}
                value={form.pokemon_number}
                onChange={(v) => update('pokemon_number', v)}
                required
              />
            </Field>
            <Field label="Langue">
              <Select
                value={form.language}
                onChange={(v) => update('language', v as CardLanguage)}
                options={LANGUAGES.map((l) => ({ value: l, label: l }))}
              />
            </Field>
          </div>

          <Field label="Nom de la carte">
            <Input value={form.card_name} onChange={(v) => update('card_name', v)} required />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Set">
              <Input value={form.set_name} onChange={(v) => update('set_name', v)} />
            </Field>
            <Field label="Code set">
              <Input value={form.set_code} onChange={(v) => update('set_code', v)} />
            </Field>
          </div>

          <Field label="N° dans le set">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  value={form.set_number}
                  onChange={(v) => update('set_number', v)}
                  placeholder="ex. 200/165"
                />
              </div>
              <button
                type="button"
                onClick={handleResearch}
                disabled={researching}
                className="border-border text-text-muted hover:bg-surface-2 hover:text-text shrink-0 rounded border px-3 text-xs font-medium disabled:opacity-50"
              >
                {researching ? '…' : 'Re-rechercher TCG'}
              </button>
            </div>
            {researchMsg && (
              <span className="text-text-faint mt-1 text-[11px]">{researchMsg}</span>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rareté">
              <Select
                value={form.rarity}
                onChange={(v) => update('rarity', v as CardRarity)}
                options={RARITIES}
              />
            </Field>
            <Field label="État">
              <Select
                value={form.condition}
                onChange={(v) => update('condition', v as CardCondition)}
                options={CONDITIONS.map((c) => ({ value: c, label: c }))}
              />
            </Field>
          </div>

          <Field label="Destination">
            <Select
              value={form.status}
              onChange={(v) => update('status', v as CardStatus)}
              options={STATUSES}
            />
          </Field>

          <Field label="Notes (optionnel)">
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={2}
              className="bg-surface-2 border-border focus:border-red w-full rounded border px-3 py-2 text-sm outline-none"
            />
          </Field>

          {phase === 'success' && (
            <div className="text-rarity-r bg-surface-2 flex items-center gap-2 rounded p-3 text-sm">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Carte enregistrée.
            </div>
          )}
          {phase !== 'success' && errorMsg && (
            <div className="bg-red-bg text-red flex items-center gap-2 rounded p-3 text-sm">
              <XCircle className="h-4 w-4" aria-hidden />
              {errorMsg}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={reset}
              disabled={phase === 'saving'}
              className="border-border text-text-muted hover:bg-surface-2 flex-1 rounded border px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={phase === 'saving' || phase === 'success'}
              className="bg-red flex-1 rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {phase === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ----- inline form primitives — kept here to avoid a wider component sprawl ----- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-text-muted text-xs font-medium uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function Input(props: {
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <input
      type={props.type ?? 'text'}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      required={props.required}
      min={props.min}
      max={props.max}
      placeholder={props.placeholder}
      className="bg-surface-2 border-border focus:border-red rounded border px-3 py-2 text-sm outline-none"
    />
  );
}

function Select(props: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="bg-surface-2 border-border focus:border-red rounded border px-3 py-2 text-sm outline-none"
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
