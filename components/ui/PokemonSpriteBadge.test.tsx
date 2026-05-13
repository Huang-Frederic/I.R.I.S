import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import frMessages from '@/messages/fr.json';
import PokemonSpriteBadge from './PokemonSpriteBadge';

// Wrap with NextIntlClientProvider so useTranslations() resolves keys.
// FR messages are used because the existing test assertions match French
// labels (e.g. "Sprite Pokémon n°25", "Pas de numéro Pokédex").
function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function rerenderWithIntl(
  rerender: (ui: ReactElement) => void,
  ui: ReactElement,
) {
  rerender(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('PokemonSpriteBadge', () => {
  it('renders the sprite img for a valid pokemon number (Pikachu = 25)', () => {
    renderWithIntl(<PokemonSpriteBadge pokemonNumber={25} />);
    const img = screen.getByRole('img', { name: /sprite pokémon n°25/i });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toMatch(/\/25\.png$/);
  });

  it('renders sprite for boundary values 1 and 1025', () => {
    const { rerender } = renderWithIntl(<PokemonSpriteBadge pokemonNumber={1} />);
    expect(screen.getByRole('img', { name: /sprite pokémon n°1/i })).toBeInTheDocument();

    rerenderWithIntl(rerender, <PokemonSpriteBadge pokemonNumber={1025} />);
    expect(screen.getByRole('img', { name: /sprite pokémon n°1025/i })).toBeInTheDocument();
  });

  it('renders the Pokeball placeholder when pokemonNumber is null (Trainer/Energy)', () => {
    renderWithIntl(<PokemonSpriteBadge pokemonNumber={null} />);
    expect(screen.getByLabelText(/pas de numéro pokédex/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the invalid placeholder when number is above 1025', () => {
    renderWithIntl(<PokemonSpriteBadge pokemonNumber={9999} />);
    expect(screen.getByLabelText(/numéro pokédex invalide: 9999/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the invalid placeholder when number is below 1', () => {
    renderWithIntl(<PokemonSpriteBadge pokemonNumber={0} />);
    expect(screen.getByLabelText(/numéro pokédex invalide: 0/i)).toBeInTheDocument();
  });

  it('falls back to Pokeball placeholder on image load error', () => {
    renderWithIntl(<PokemonSpriteBadge pokemonNumber={25} />);
    const img = screen.getByRole('img', { name: /sprite/i });
    fireEvent.error(img);
    expect(screen.getByLabelText(/pas de numéro pokédex/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('clears the error state when pokemonNumber changes', () => {
    const { rerender } = renderWithIntl(<PokemonSpriteBadge pokemonNumber={25} />);
    fireEvent.error(screen.getByRole('img', { name: /sprite/i }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerenderWithIntl(rerender, <PokemonSpriteBadge pokemonNumber={150} />);
    expect(screen.getByRole('img', { name: /sprite pokémon n°150/i })).toBeInTheDocument();
  });

  it('applies pixelated image-rendering style to the sprite', () => {
    renderWithIntl(<PokemonSpriteBadge pokemonNumber={25} />);
    const img = screen.getByRole('img', { name: /sprite/i });
    expect(img).toHaveStyle({ imageRendering: 'pixelated' });
  });

  it('appends the className prop to the wrapper', () => {
    renderWithIntl(<PokemonSpriteBadge pokemonNumber={25} className="absolute top-2 right-2" />);
    const img = screen.getByRole('img', { name: /sprite/i });
    const wrapper = img.parentElement;
    expect(wrapper?.className).toMatch(/absolute/);
    expect(wrapper?.className).toMatch(/top-2/);
    expect(wrapper?.className).toMatch(/right-2/);
  });
});
