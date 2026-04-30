'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ScanLine, AlertTriangle, CheckCircle2, XCircle, X, Camera } from 'lucide-react';
import type {
  CardCondition,
  CardLanguage,
  CardRarity,
  CardStatus,
  EnrichedCard,
  EnrichResult,
  OcrResult,
} from '@/lib/types';
import {
  actionToStatus,
  type SuggestionResult,
} from '@/lib/utils/pokedex-suggestion';
import { resizeImage } from '@/lib/utils/resize-image';
import ScanSuggestion from '@/components/cards/ScanSuggestion';
import { getPokemonName } from '@/lib/data/pokemon-names';
import PokedexReplaceModal, { type PokedexReplaceModalCard } from '@/components/cards/PokedexReplaceModal';
import MagnifierLoupe from '@/components/ui/MagnifierLoupe';
import { detectNumberMismatch } from '@/lib/utils/pokedex-mismatch';

const LANGUAGES: CardLanguage[] = ['JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH'];
const CONDITIONS: CardCondition[] = ['NM', 'EX', 'GD', 'PL', 'PO'];
const STATUSES: { value: CardStatus; label: string }[] = [
  { value: 'for_sale', label: 'Vinted' },
  { value: 'pokedex', label: 'Pokédex' },
  { value: 'collection', label: 'Stock' },
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
const VARIANTS: { value: string; label: string }[] = [
  { value: '', label: 'Standard' },
  { value: 'pokeball', label: 'Poké Ball' },
  { value: 'masterball', label: 'Master Ball' },
  { value: 'reverse_holo', label: 'Reverse Holo' },
  { value: 'promo', label: 'Promo' },
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
  variant: string;
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
  variant: '',
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

export interface CardScanFormProps {
  /** When set, the pokemon_number input is locked to this value, pokemon_name pre-filled via dataset. */
  lockedPokemonNumber?: number;
  /** When set, the status section is hidden, the form always submits with this status. */
  lockedStatus?: CardStatus;
  /** Called after a successful save instead of the default 1.8s auto-reset. Use for modal close. */
  onSaved?: (cardId: string) => void;
  /** Compact mode: 1-col layout, smaller paddings (for embedded modal use). */
  compact?: boolean;
}

export default function CardScanForm({
  lockedPokemonNumber,
  lockedStatus,
  onSaved,
  compact = false,
}: CardScanFormProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [form, setForm] = useState<FormFields>(() => {
    // Initialize with locked fields if provided
    if (lockedPokemonNumber != null) {
      return {
        ...EMPTY,
        pokemon_number: String(lockedPokemonNumber),
        pokemon_name: getPokemonName(lockedPokemonNumber, 'fr'),
      };
    }
    return EMPTY;
  });
  const [confidence, setConfidence] = useState<number>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [extractedSetCode, setExtractedSetCode] = useState<string | null>(null);
  const [extractedSetNumber, setExtractedSetNumber] = useState<string | null>(null);
  const [enrichFound, setEnrichFound] = useState<boolean>(true);
  const [researching, setResearching] = useState(false);
  const [researchMsg, setResearchMsg] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<EnrichedCard[]>([]);
  const [ocrGemini, setOcrGemini] = useState<{
    pokemonNumber?: number | null;
    pokemonNameFr?: string | null;
    setName?: string | null;
    setNameFr?: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replaceModal, setReplaceModal] = useState<{
    existingCard: PokedexReplaceModalCard;
    hasForSaleConflict: boolean;
  } | null>(null);
  const [forSaleConflict, setForSaleConflict] = useState(false);
  /**
   * Pokémon number actually detected in the photo (via Gemini OCR or TCGdex
   * match). We track this SEPARATELY from `form.pokemon_number` because, when
   * the slot is locked, we force the form value back to `lockedPokemonNumber`
   * for UX clarity — but we still need the real detected value to surface a
   * mismatch.
   */
  const [detectedPokemonNumber, setDetectedPokemonNumber] = useState<number | null>(null);

  const numberMismatch = detectNumberMismatch({ lockedPokemonNumber, detectedPokemonNumber });

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPhotoBlob(null);
    // Don't reset locked fields
    if (lockedPokemonNumber != null) {
      setForm({
        ...EMPTY,
        pokemon_number: String(lockedPokemonNumber),
        pokemon_name: getPokemonName(lockedPokemonNumber, 'fr'),
      });
    } else {
      setForm(EMPTY);
    }
    setConfidence(1);
    setErrorMsg(null);
    setSuggestion(null);
    setOcrText('');
    setExtractedSetCode(null);
    setExtractedSetNumber(null);
    setEnrichFound(true);
    setResearching(false);
    setResearchMsg(null);
    setCandidates([]);
    setOcrGemini(null);
    setDetectedPokemonNumber(null);
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
   * The server is smart now: it will use setCode for a direct lookup if both
   * setCode AND localId are present, otherwise it falls back to scanning all
   * sets with the matching total. So even with just "111/086" and no set_code,
   * we send the structured body and let the server figure it out.
   */
  async function handleResearch() {
    const setCode = form.set_code.trim();
    const setNumber = form.set_number.trim();
    const [localId, totalStr] = setNumber.split('/').map((s) => s.trim());

    if (!localId) {
      setResearchMsg('Renseigne au moins un n° de set (ex. 111/086) avant de relancer.');
      return;
    }

    const total = totalStr ? Number(totalStr) : undefined;
    const body = {
      text: ocrText || undefined,
      setCode: setCode || undefined,
      localId,
      total,
      language: form.language,
      // Include OCR Gemini fields if available (preserves FR translations)
      pokemonNumber: ocrGemini?.pokemonNumber ?? undefined,
      pokemonNameFr: ocrGemini?.pokemonNameFr ?? undefined,
      setName: ocrGemini?.setName ?? undefined,
      setNameFr: ocrGemini?.setNameFr ?? undefined,
    };

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

      if (!enrich.bestMatch) {
        setEnrichFound(false);
        setResearchMsg(
          total
            ? `Aucune carte ${localId} trouvée dans un set de ${total} cartes (${form.language}). Continue à la main.`
            : `Carte introuvable dans TCGdex (${form.language}). Renseigne le total du set (ex. 111/086) ou continue à la main.`,
        );
        return;
      }

      if (enrich.candidates.length > 1) {
        setCandidates(enrich.candidates);
        setResearchMsg(`${enrich.candidates.length} cartes trouvées — choisis la bonne.`);
        return;
      }

      void applyCandidate(enrich.bestMatch);
    } catch (err) {
      setResearchMsg(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setResearching(false);
    }
  }

  async function applyCandidate(match: EnrichedCard) {
    setCandidates([]);
    setEnrichFound(true);
    setResearchMsg(null);
    if (match.pokemon_number != null) setDetectedPokemonNumber(match.pokemon_number);
    setForm((prev) => ({
      ...prev,
      pokemon_name:
        lockedPokemonNumber != null
          ? getPokemonName(lockedPokemonNumber, 'fr')
          : match.pokemon_name,
      // When the slot is locked we keep the locked number visible (input is
      // disabled). The real detected number lives in `detectedPokemonNumber`
      // so the mismatch warning can fire.
      pokemon_number:
        lockedPokemonNumber != null
          ? String(lockedPokemonNumber)
          : (match.pokemon_number?.toString() ?? ''),
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
      setExtractedSetCode(ocr.setCodeCandidate);
      setExtractedSetNumber(ocr.setNumberCandidate?.raw ?? null);
      setOcrGemini({
        pokemonNumber: ocr.pokemonNumber,
        pokemonNameFr: ocr.pokemonNameFr,
        setName: ocr.setName,
        setNameFr: ocr.setNameFr,
      });

      // Smart extraction: if Vision pinned the set number / set code in the
      // bottom-left footer, pre-fill them and let the server resolve the card.
      // Server uses setCode if provided, otherwise falls back to scanning sets
      // with matching `total`.
      const language = detectLanguage(ocr.text);
      const setNumberParsed = ocr.setNumberCandidate;
      const setCode = ocr.setCodeCandidate ?? '';
      const setNumber = setNumberParsed?.raw ?? '';

      const enrichBody = setNumberParsed
        ? {
            setCode: setCode || undefined,
            localId: setNumberParsed.card,
            total: Number(setNumberParsed.total),
            language,
            text: ocr.text,
            // NEW — from Gemini extraction (Chunk 1)
            pokemonNumber: ocr.pokemonNumber,
            pokemonNameFr: ocr.pokemonNameFr,
            setName: ocr.setName,
            setNameFr: ocr.setNameFr,
          }
        : {
            text: ocr.text,
            // NEW — from Gemini extraction (Chunk 1)
            pokemonNumber: ocr.pokemonNumber,
            pokemonNameFr: ocr.pokemonNameFr,
            setName: ocr.setName,
            setNameFr: ocr.setNameFr,
          };

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

      // Capture the detected pokémon number from match (or fallback to OCR
      // Gemini extraction) so the mismatch hard-block can fire even when the
      // form value is forced back to `lockedPokemonNumber`.
      const detected =
        enrich.bestMatch?.pokemon_number ??
        (ocr.pokemonNumber ?? null);
      setDetectedPokemonNumber(detected);

      // Multiple candidates → show picker, don't auto-fill yet.
      if (enrich.candidates.length > 1) {
        setCandidates(enrich.candidates);
        const baseForm = {
          ...EMPTY,
          language,
          pokemon_number: ocr.pokemonNumber ? String(ocr.pokemonNumber) : '',
          set_code: setCode,
          set_number: setNumber,
        };
        // Preserve locked fields
        if (lockedPokemonNumber != null) {
          baseForm.pokemon_number = String(lockedPokemonNumber);
          baseForm.pokemon_name = getPokemonName(lockedPokemonNumber, 'fr');
        }
        setForm(baseForm);
        setPhase('reviewing');
        return;
      }

      // Single match or none → auto-fill as before.
      const match = enrich.bestMatch;
      const prefill: FormFields = {
        ...EMPTY,
        language,
        pokemon_name: match?.pokemon_name ?? '',
        pokemon_number: match?.pokemon_number?.toString() ?? (ocr.pokemonNumber ? String(ocr.pokemonNumber) : ''),
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

      // Override with locked fields
      if (lockedPokemonNumber != null) {
        prefill.pokemon_number = String(lockedPokemonNumber);
        prefill.pokemon_name = getPokemonName(lockedPokemonNumber, 'fr');
      }

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
      const finalStatus = lockedStatus ?? form.status;
      const wantsToReplace =
        finalStatus === 'pokedex' &&
        !lockedStatus && // Skip replace logic if status is locked (handled differently in commit 5)
        suggestion?.type === 'can_replace' &&
        !!suggestion.existingCard;
      const insertStatus: CardStatus = wantsToReplace ? 'for_sale' : finalStatus;

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
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          existingCard?: PokedexReplaceModalCard;
          hasForSaleConflict?: boolean;
        };
        if (res.status === 409 && body.error === 'pokedex_slot_taken' && body.existingCard) {
          setReplaceModal({
            existingCard: body.existingCard,
            hasForSaleConflict: body.hasForSaleConflict ?? false,
          });
          setPhase('reviewing'); // back from 'saving' to give the modal user a way to interact
          return;
        }
        if (res.status === 409 && body.error === 'for_sale_conflict') {
          setForSaleConflict(true);
          setPhase('reviewing');
          return;
        }
        throw new Error(body.message ?? body.error ?? `Enregistrement a échoué (${res.status})`);
      }

      const inserted = (await res.json()) as { card: { id: string } };

      if (wantsToReplace && suggestion?.existingCard) {
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
      if (onSaved) {
        onSaved(inserted.card.id);
      } else {
        setTimeout(reset, 1800);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue');
      setPhase('error');
    }
  }

  async function handleReplaceConfirm(displaceTo: 'collection' | 'for_sale') {
    if (!replaceModal) return;
    setPhase('saving');
    try {
      // Step 1: Demote the existing pokedex card to the chosen status
      const demoteRes = await fetch(`/api/cards/${replaceModal.existingCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: displaceTo }),
      });
      if (!demoteRes.ok) {
        const body = (await demoteRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Démotion échouée');
      }

      // Step 2: Re-submit the original POST (slot is now free)
      const data = new FormData();
      if (photoBlob) data.append('image', photoBlob, 'card.jpg');
      for (const [key, value] of Object.entries(form)) {
        if (key === 'status') continue;
        if (value !== '' && value !== null && value !== undefined) {
          data.append(key, String(value));
        }
      }
      data.append('status', 'pokedex');

      const res = await fetch('/api/cards', { method: 'POST', body: data });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Enregistrement a échoué (${res.status})`);
      }

      setReplaceModal(null);
      setPhase('success');
      if (onSaved) {
        const inserted = (await res.json()) as { card: { id: string } };
        onSaved(inserted.card.id);
      } else {
        setTimeout(reset, 1800);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue');
      setPhase('error');
      setReplaceModal(null);
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

      {candidates.length > 1 && (
        <CandidatePicker
          candidates={candidates}
          onSelect={(c) => void applyCandidate(c)}
          onDismiss={() => setCandidates([])}
        />
      )}

      {replaceModal && (
        <PokedexReplaceModal
          existingCard={replaceModal.existingCard}
          newCardSummary={{
            card_name: form.card_name,
            rarity: form.rarity,
            language: form.language,
            condition: form.condition,
            variant: form.variant || null,
            previewUrl,
            tcgImageUrl: form.tcg_image_url || null,
          }}
          hasForSaleConflict={replaceModal.hasForSaleConflict}
          onConfirm={handleReplaceConfirm}
          onCancel={() => setReplaceModal(null)}
          submitting={phase === 'saving'}
        />
      )}

      <form
        onSubmit={(e) => {
          void handleSave(e);
        }}
        className={compact ? 'flex flex-col gap-4' : 'grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr] lg:items-start'}
      >
        {/* Left column: Photo section with loupe (or CTA when no photo) */}
        <div className={compact ? '' : 'lg:sticky lg:top-6'}>
          <div className="flex flex-col gap-3">
            <h3 className="text-text-muted flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <Camera className="h-3.5 w-3.5" aria-hidden />
              Photo
            </h3>
            <div className="flex flex-col gap-3">
              {!previewUrl ? (
                // CTA when no photo
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-surface border-border hover:border-red relative mx-auto flex h-[28rem] w-full max-w-md flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors lg:max-w-none"
                >
                  {phase === 'scanning' ? (
                    <>
                      <div className="border-red border-t-transparent h-8 w-8 animate-spin rounded-full border-2" />
                      <p className="text-sm">Analyse OCR…</p>
                      <p className="text-text-muted text-xs">Gemini extrait les infos de la carte (15-30 s)</p>
                    </>
                  ) : (
                    <>
                      <ScanLine className="text-red h-10 w-10" aria-hidden />
                      <span className="text-sm font-medium">Scanner une carte</span>
                      <span className="text-text-muted text-xs">Photo ou fichier image</span>
                    </>
                  )}
                </button>
              ) : (
                // Photo + loupe when photo loaded
                <>
                  <div className="relative">
                    <MagnifierLoupe
                      src={previewUrl}
                      alt="Aperçu de la carte"
                      className="mx-auto w-full max-w-md border-2 border-border shadow-lg lg:max-w-none"
                    />
                    {phase === 'scanning' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                        <div className="border-red border-t-transparent h-8 w-8 animate-spin rounded-full border-2" />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={reset}
                    className="border-border text-text-muted hover:border-red hover:text-text mx-auto flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5" aria-hidden />
                    Reprendre
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right column: All info + form fields */}
        <div className={`transition-opacity ${phase === 'scanning' ? 'pointer-events-none opacity-40' : ''} ${compact ? 'space-y-4' : 'space-y-6'}`}>
          {/* Error block (shown near top of form instead of as separate section) */}
          {phase === 'error' && errorMsg && (
            <div className="bg-red-bg text-red flex items-center gap-3 rounded-lg p-4">
              <XCircle className="h-5 w-5 shrink-0" aria-hidden />
              <p className="flex-1 text-sm">{errorMsg}</p>
            </div>
          )}

          {/* Status block (only show after OCR has run) */}
          {(phase === 'reviewing' || phase === 'saving' || phase === 'success') && (
            <div className={`flex flex-col gap-2 rounded-xl border p-4 ${
              confidence >= CONFIDENCE_THRESHOLD
                ? 'bg-rarity-r/10 border-rarity-r/30'
                : 'bg-rarity-ar/10 border-rarity-ar/30'
            }`}>
              <div className="flex items-start gap-2">
                {confidence >= CONFIDENCE_THRESHOLD ? (
                  <CheckCircle2 className="text-rarity-r mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <AlertTriangle className="text-rarity-ar mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                <div className="flex flex-1 flex-col gap-1">
                  <p className={`text-sm font-medium ${
                    confidence >= CONFIDENCE_THRESHOLD ? 'text-rarity-r' : 'text-rarity-ar'
                  }`}>
                    {confidence >= CONFIDENCE_THRESHOLD ? 'OCR fiable' : 'OCR à vérifier'}
                    <span className="ml-1.5 font-normal opacity-80">
                      ({Math.round(confidence * 100)}%)
                    </span>
                  </p>
                  {form.tcg_image_url && (
                    <p className="text-text-muted font-mono text-xs">
                      Match catalogue : <span className="text-text">{form.card_id_tcg}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pokédex suggestion banner */}
          {(phase === 'reviewing' || phase === 'saving' || phase === 'success') && suggestion && (
            <ScanSuggestion result={suggestion} />
          )}

          {/* Alert if no catalog match */}
          {(phase === 'reviewing' || phase === 'saving' || phase === 'success') && !enrichFound && (
            <div className="border-rarity-ar bg-rarity-ar/10 text-rarity-ar rounded-lg border p-3 text-xs">
              Aucun match catalogue — soit le numéro de set n&apos;a pas été lu, soit la carte n&apos;est
              pas indexée (sets JP récents notamment). Le texte OCR ci-dessous t&apos;aidera à
              compléter manuellement.
            </div>
          )}

          {/* OCR text details (collapsed) */}
          {(phase === 'reviewing' || phase === 'saving' || phase === 'success') && ocrText && (
            <details className="bg-surface-2 border-border rounded-lg border text-xs">
              <summary className="text-text-muted cursor-pointer select-none px-3 py-2">
                Texte OCR détecté ({ocrText.length} caractères)
              </summary>
              <div className="border-border border-t px-3 py-2">
                <p className="text-text-faint mb-2 font-mono text-[11px]">
                  Extraits :{' '}
                  <span className={extractedSetCode ? 'text-text' : 'text-text-faint'}>
                    set_code = {extractedSetCode ?? 'aucun'}
                  </span>{' '}
                  ·{' '}
                  <span className={extractedSetNumber ? 'text-text' : 'text-text-faint'}>
                    set_number = {extractedSetNumber ?? 'aucun'}
                  </span>
                </p>
                <pre className="text-text max-h-48 overflow-auto whitespace-pre-wrap font-mono">
                  {ocrText}
                </pre>
              </div>
            </details>
          )}

            {/* Form fields section */}
          <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-4'}>
            <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
              Informations de la carte
            </h3>

          <Field label="Nom de la carte">
            <Input value={form.card_name} onChange={(v) => update('card_name', v)} required />
          </Field>

          <Field label="Nom du Pokémon">
            <Input value={form.pokemon_name} onChange={(v) => update('pokemon_name', v)} required />
          </Field>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <Field label="Set">
                <Input value={form.set_code} onChange={(v) => update('set_code', v)} placeholder="SV11W" />
              </Field>
            </div>
            <div className="col-span-4">
              <Field label="N°">
                <Input
                  value={form.set_number}
                  onChange={(v) => update('set_number', v)}
                  placeholder="111/086"
                />
              </Field>
            </div>
            <div className="col-span-4">
              <Field label="Langue">
                <Select
                  value={form.language}
                  onChange={(v) => update('language', v as CardLanguage)}
                  options={LANGUAGES.map((l) => ({ value: l, label: l }))}
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <Field label="N° Nat.">
                <Input
                  type="number"
                  min={1}
                  max={1025}
                  value={form.pokemon_number}
                  onChange={(v) => update('pokemon_number', v)}
                  required
                  disabled={lockedPokemonNumber != null}
                />
              </Field>
            </div>
            <div className="col-span-4">
              <Field label="Rareté">
                <Select
                  value={form.rarity}
                  onChange={(v) => update('rarity', v as CardRarity)}
                  options={RARITIES}
                />
              </Field>
            </div>
            <div className="col-span-4">
              <Field label="État">
                <Select
                  value={form.condition}
                  onChange={(v) => update('condition', v as CardCondition)}
                  options={CONDITIONS.map((c) => ({ value: c, label: c }))}
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Nom du set (optionnel)">
              <Input value={form.set_name} onChange={(v) => update('set_name', v)} placeholder="Stellar Miracle" />
            </Field>
            <Field label="Variante">
              <Select
                value={form.variant}
                onChange={(v) => update('variant', v)}
                options={VARIANTS}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleResearch}
              disabled={researching}
              className="border-border text-text-muted hover:bg-surface-2 hover:border-red hover:text-text rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {researching ? 'Recherche en cours…' : 'Re-rechercher dans le catalogue'}
            </button>
            {researchMsg && (
              <span className="text-text-faint text-[11px]">{researchMsg}</span>
            )}
          </div>
          </div>

          {/* Destination section (hide if locked) */}
          {!lockedStatus && (
            <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-4'}>
              <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                Destination
              </h3>
            <div className="grid grid-cols-3 gap-2">
              {STATUSES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    update('status', value);
                    setForSaleConflict(false);
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    form.status === value
                      ? 'bg-red-bg border-red text-red'
                      : 'border-border text-text-muted hover:border-text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {forSaleConflict && form.status === 'for_sale' && (
              <p className="text-rarity-ar mt-2 text-xs">
                💡 Cette carte est déjà en vente sur Vinted. Choisis <strong>Stock</strong> à la place pour la garder en réserve.
              </p>
            )}
            </div>
          )}

          {/* Notes */}
          <Field label="Notes (optionnel)">
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={2}
            className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />
          </Field>

          {/* Success/error messages */}
          {phase === 'success' && (
            <div className="text-rarity-r bg-surface-2 flex items-center gap-2 rounded-lg p-3 text-sm">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Carte enregistrée.
            </div>
          )}

          {/* Pokemon number mismatch hard block */}
          {numberMismatch && (
            <div className="border-red bg-red/10 text-red rounded-lg border p-3 text-xs">
              ⛔ Cette carte n&apos;est pas <strong>{getPokemonName(lockedPokemonNumber!, 'fr')}</strong> (#{lockedPokemonNumber}). Le numéro détecté est <strong>#{form.pokemon_number}</strong>. Tu ne peux pas l&apos;enregistrer dans ce slot — utilise le scanner principal pour cette carte.
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={reset}
              disabled={phase === 'saving'}
              className="border-border text-text-muted hover:bg-surface-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={phase === 'saving' || phase === 'success' || !form.card_name || !form.pokemon_name || numberMismatch}
              className="bg-red flex-1 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50"
            >
              {phase === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>

    </div>
  );
}

/* ----- inline form primitives — kept here to avoid a wider component sprawl ----- */

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className ? `flex flex-col gap-1.5 ${className}` : "flex flex-col gap-1.5"}>
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
  disabled?: boolean;
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
      disabled={props.disabled}
      className={`bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${props.disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
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
      className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CandidatePicker(props: {
  candidates: EnrichedCard[];
  onSelect: (card: EnrichedCard) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm sm:items-center">
      <div className="bg-surface border-border flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border sm:rounded-2xl">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            Plusieurs cartes correspondent ({props.candidates.length})
          </h2>
          <button
            type="button"
            onClick={props.onDismiss}
            className="text-text-muted hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3">
          {props.candidates.map((c) => (
            <button
              key={c.card_id_tcg}
              type="button"
              onClick={() => props.onSelect(c)}
              className="border-border hover:border-red group flex flex-col items-center gap-2 rounded-lg border p-2 transition-colors"
            >
              {c.tcg_image_url ? (
                <div className="relative h-40 w-28 overflow-hidden rounded">
                  <Image
                    src={c.tcg_image_url}
                    alt={c.card_name}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="bg-surface-2 flex h-40 w-28 items-center justify-center rounded text-xs">
                  Pas d&apos;image
                </div>
              )}
              <span className="text-text line-clamp-1 text-xs font-medium">{c.card_name}</span>
              <span className="text-text-muted line-clamp-1 text-[11px]">{c.set_name}</span>
              <span className="text-text-faint text-[10px]">{c.set_code} · {c.rarity}</span>
            </button>
          ))}
        </div>

        <div className="border-border border-t px-4 py-3">
          <button
            type="button"
            onClick={props.onDismiss}
            className="border-border text-text-muted hover:bg-surface-2 w-full rounded border py-2 text-sm font-medium"
          >
            Aucune — remplir à la main
          </button>
        </div>
      </div>
    </div>
  );
}
