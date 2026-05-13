'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HelpCircle } from 'lucide-react';

const POKEAPI_SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const MIN_DEX = 1;
const MAX_DEX = 1025;

type Props = {
  pokemonNumber: number | null;
  className?: string;
};

function PokeballIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M2 12h8M14 12h8" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

export default function PokemonSpriteBadge({ pokemonNumber, className }: Props) {
  const t = useTranslations('ui');
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErrored(false);
  }, [pokemonNumber]);

  const wrapperClass = `flex h-24 w-24 items-center justify-center rounded-full bg-black/70 [[data-theme='light']_&]:bg-white/85 shadow-md backdrop-blur-sm ${className ?? ''}`.trim();

  const isNull = pokemonNumber === null;
  const isInvalid =
    pokemonNumber !== null &&
    (!Number.isInteger(pokemonNumber) ||
      pokemonNumber < MIN_DEX ||
      pokemonNumber > MAX_DEX);

  if (isNull || errored) {
    return (
      <div
        className={wrapperClass}
        aria-label={t('spriteNoNumberAria')}
      >
        <PokeballIcon className="text-text-muted h-14 w-14" />
      </div>
    );
  }

  if (isInvalid) {
    return (
      <div
        className={wrapperClass}
        aria-label={t('spriteInvalidAria', { number: pokemonNumber })}
      >
        <HelpCircle className="h-14 w-14 text-red-500" aria-hidden />
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${POKEAPI_SPRITE_BASE}/${pokemonNumber}.png`}
        alt={t('spritePokemonAria', { number: pokemonNumber })}
        onError={() => setErrored(true)}
        className="h-20 w-20"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
