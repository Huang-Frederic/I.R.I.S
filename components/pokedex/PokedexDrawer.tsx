'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, ScanLine, Sparkles, RefreshCcw } from 'lucide-react';
import type { Card } from '@/lib/types';

interface PokedexDrawerProps {
  open: boolean;
  onClose: () => void;
  pokemonNumber: number | null;
  pokedexCard: Card | null;
  availableCards: Card[];
}

const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

const RARITY_CLASS: Record<string, string> = {
  SAR: 'text-rarity-sar',
  AR: 'text-rarity-ar',
  SR: 'text-rarity-sr',
  CHR: 'text-rarity-chr',
  RR: 'text-rarity-rr',
  R_HOLO: 'text-rarity-r-holo',
  R: 'text-rarity-r',
  UC: 'text-rarity-uc',
  C: 'text-rarity-c',
  OTHER: 'text-text-muted',
};

export default function PokedexDrawer({
  open,
  onClose,
  pokemonNumber,
  pokedexCard,
  availableCards,
}: PokedexDrawerProps) {
  // Lock body scroll while open + close on Escape — basic dialog hygiene.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || pokemonNumber === null) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Fermer le panneau"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50"
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="bg-surface border-border fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t md:bottom-0 md:left-auto md:right-0 md:top-0 md:h-screen md:max-h-screen md:w-[440px] md:rounded-none md:border-l md:border-t-0"
      >
        <header className="border-border bg-surface sticky top-0 flex items-start justify-between gap-2 border-b p-5">
          <div>
            <p className="text-text-faint font-mono text-xs">
              #{pokemonNumber.toString().padStart(4, '0')}
            </p>
            <h2 className="text-xl font-semibold">{pokedexCard?.pokemon_name ?? 'Pokémon manquant'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="hover:bg-surface-2 -mr-1 rounded p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5">
          {pokedexCard ? (
            <PokedexCardDetails card={pokedexCard} availableCards={availableCards} />
          ) : (
            <EmptyState pokemonNumber={pokemonNumber} />
          )}
        </div>
      </aside>
    </>
  );
}

function PokedexCardDetails({ card, availableCards }: { card: Card; availableCards: Card[] }) {
  const [showReplace, setShowReplace] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        {card.image_url && (
          <Figure src={card.image_url} alt="Photo collection" caption="Ta photo" />
        )}
        {card.tcg_image_url && (
          <Figure src={card.tcg_image_url} alt="Image officielle" caption="Image TCG" />
        )}
        {!card.image_url && !card.tcg_image_url && (
          <p className="text-text-faint col-span-2 text-xs">Aucune image disponible.</p>
        )}
      </div>

      <dl className="text-sm">
        <Row label="Nom carte">{card.card_name}</Row>
        <Row label="Set">
          {card.set_name ?? '—'}
          {card.set_code && (
            <span className="text-text-faint font-mono text-xs"> ({card.set_code})</span>
          )}
        </Row>
        <Row label="N° set">{card.set_number ?? '—'}</Row>
        <Row label="Rareté">
          <span className={RARITY_CLASS[card.rarity] ?? 'text-text-muted'}>{card.rarity}</span>
        </Row>
        <Row label="Langue">{card.language}</Row>
        <Row label="État">{card.condition}</Row>
        <Row label="Ajoutée">{new Date(card.date_added).toLocaleDateString('fr-FR')}</Row>
      </dl>

      {(card.cm_price_low ?? card.cm_price_trend ?? card.cm_price_avg ?? card.suggested_price) !==
      null ? (
        <div className="bg-surface-2 grid grid-cols-2 gap-3 rounded-lg p-4 text-sm md:grid-cols-4">
          <Price label="Low" value={card.cm_price_low} />
          <Price label="Trend" value={card.cm_price_trend} />
          <Price label="Avg" value={card.cm_price_avg} />
          <Price label="Suggéré" value={card.suggested_price} highlight />
        </div>
      ) : (
        <p className="text-text-faint text-xs">Pas encore de prix Cardmarket — viendra avec le cron Phase 3.</p>
      )}

      {availableCards.length > 0 && (
        <div className="border-border border-t pt-4">
          {!showReplace ? (
            <button
              type="button"
              onClick={() => setShowReplace(true)}
              className="border-border text-text-muted hover:bg-surface-2 hover:text-text flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-sm"
            >
              <RefreshCcw className="h-4 w-4" />
              Remplacer ({availableCards.length} disponible{availableCards.length > 1 ? 's' : ''})
            </button>
          ) : (
            <ReplaceList
              currentCard={card}
              candidates={availableCards}
              onCancel={() => setShowReplace(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReplaceList({
  currentCard,
  candidates,
  onCancel,
}: {
  currentCard: Card;
  candidates: Card[];
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(candidate: Card) {
    setPending(candidate.id);
    setError(null);
    try {
      // The candidate's current status (for_sale | collection) becomes the old card's
      // new home — preserves stock counts and skips an extra "where does the old one
      // go?" question for the user.
      const res = await fetch('/api/pokedex/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_card_id: currentCard.id,
          old_new_status: candidate.status,
          new_card_id: candidate.id,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Échec (${res.status})`);
      }
      router.refresh();
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-text-muted text-xs">Choisir la carte à promouvoir :</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-text-muted hover:text-text text-xs underline"
        >
          Annuler
        </button>
      </div>
      {candidates.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={pending !== null}
          onClick={() => pick(c)}
          className="bg-surface-2 hover:border-red border-border flex items-center gap-3 rounded border p-2 text-left text-sm transition-colors disabled:opacity-50"
        >
          <Sparkles className="text-rarity-ar h-4 w-4 shrink-0" />
          <div className="flex-1 truncate">
            <p className="truncate">
              <span className={RARITY_CLASS[c.rarity]}>{c.rarity}</span> · {c.language} · {c.condition}
            </p>
            <p className="text-text-faint truncate font-mono text-xs">
              {c.set_code ?? '—'} {c.set_number ?? ''} ·{' '}
              {c.status === 'for_sale' ? 'Vinted' : 'Collection'}
            </p>
          </div>
          {pending === c.id && (
            <div className="border-text-muted border-t-transparent h-4 w-4 animate-spin rounded-full border-2" />
          )}
        </button>
      ))}
      {error && <p className="text-red text-xs">{error}</p>}
    </div>
  );
}

function EmptyState({ pokemonNumber }: { pokemonNumber: number }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <Image
        src={`${SPRITE_BASE}${pokemonNumber}.png`}
        alt=""
        width={120}
        height={120}
        unoptimized
        className="opacity-25 brightness-0 saturate-0"
      />
      <p className="text-text-muted text-sm">Aucune carte enregistrée pour ce Pokémon.</p>
      <Link
        href="/submit"
        className="bg-red flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-white"
      >
        <ScanLine className="h-4 w-4" />
        Scanner une carte
      </Link>
    </div>
  );
}

function Figure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="flex flex-col gap-1">
      <div className="bg-surface-2 relative aspect-[3/4] overflow-hidden rounded">
        <Image src={src} alt={alt} fill sizes="200px" className="object-contain" unoptimized />
      </div>
      <figcaption className="text-text-faint text-center text-[10px] uppercase">{caption}</figcaption>
    </figure>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border flex justify-between gap-3 border-b py-1.5 last:border-b-0">
      <dt className="text-text-muted text-xs">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

function Price({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-text-faint text-[10px] uppercase">{label}</p>
      <p className={`font-mono text-sm ${highlight ? 'text-rarity-sr font-semibold' : 'text-text'}`}>
        {value !== null ? `${value.toFixed(2)} €` : '—'}
      </p>
    </div>
  );
}
