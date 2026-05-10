'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { Card } from '@/lib/types';
import { getPokemonName } from '@/lib/data/pokemon-names';
import { displayPokemonName } from '@/lib/utils/format-name';
import CardDetails from './drawer/CardDetails';
import EmptyState from './drawer/EmptyState';

interface PokedexDrawerProps {
  open: boolean;
  onClose: () => void;
  pokemonNumber: number | null;
  pokedexCard: Card | null;
  /** Available swap candidates (Stock + Vinted copies of the same Pokémon). */
  availableCards: Card[];
}

/**
 * Shell drawer for the Pokédex slot view. Switches between three modes:
 *   - filled slot → CardDetails (view + replace flow + remove actions)
 *   - empty slot  → EmptyState (muted sprite + scan CTA)
 *   - closed      → renders nothing
 *
 * Bottom sheet on mobile, side drawer on desktop. Click backdrop / Escape
 * closes; body scroll locked while open.
 *
 * Layout is custom (mobile bottom-sheet morphs into desktop side drawer)
 * so we don't use the generic <Modal> primitive here.
 */
export default function PokedexDrawer({
  open,
  onClose,
  pokemonNumber,
  pokedexCard,
  availableCards,
}: PokedexDrawerProps) {
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
            <h2 className="text-xl font-semibold">
              {pokedexCard ? displayPokemonName(pokedexCard) : getPokemonName(pokemonNumber, 'fr')}
            </h2>
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
            <CardDetails card={pokedexCard} availableCards={availableCards} />
          ) : (
            <EmptyState pokemonNumber={pokemonNumber} />
          )}
        </div>
      </aside>
    </>
  );
}
